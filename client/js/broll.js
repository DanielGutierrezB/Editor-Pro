/**
 * BRoll — B-Roll Image-to-Video Pipeline for Editor-Pro
 * Server lifecycle (reuses motion-server port 3847), image gen, video gen, versioning
 */
(function(global) {
    "use strict";

    var http;
    try { http = require("http"); } catch(e) { http = null; }
    var childProcess;
    try { childProcess = require("child_process"); } catch(e) { childProcess = null; }
    var pathMod;
    try { pathMod = require("path"); } catch(e) { pathMod = null; }
    var fs;
    try { fs = require("fs"); } catch(e) { fs = null; }
    var os;
    try { os = require("os"); } catch(e) { os = null; }

    var SERVER_PORT = 3847;
    var SERVER_URL = "http://127.0.0.1:" + SERVER_PORT;
    var STORAGE_KEY = "editorpro_broll_state";
    var SETTINGS_KEY = "editorpro_broll_settings";

    // ── Constructor ────────────────────────────────────────────────────────────

    function BRoll() {
        this.proposals = [];  // [{id, startTime, endTime, description, rationale}]
        this.clips = [];      // [{id, proposalId, startTime, endTime, description, versions[], activeVersion, status, placedInTimeline}]
        this.analyzing = false;
        this.generating = false;
        this.generateCancelRequested = false;
        this._pollTimers = {};
        this._settings = this._loadSettings();
    }

    // ── Settings ───────────────────────────────────────────────────────────────

    BRoll.prototype._loadSettings = function() {
        var defaults = {
            imageProvider: "comfyui",
            imageEndpointUrl: "http://localhost:8188",
            imageFalModel: "",
            imageFalApiKey: "",
            videoProvider: "placeholder",
            videoEndpointUrl: "",
            videoKlingApiKey: "",
            trackIndex: "auto",
            outputDir: ""
        };
        try {
            var saved = localStorage.getItem(SETTINGS_KEY);
            if (saved) return Object.assign({}, defaults, JSON.parse(saved));
        } catch(e) {}
        return defaults;
    };

    BRoll.prototype.saveSettings = function(updates) {
        Object.assign(this._settings, updates);
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this._settings)); } catch(e) {}
    };

    BRoll.prototype.getSettings = function() { return this._settings; };

    // ── Session persistence ────────────────────────────────────────────────────

    BRoll.prototype.saveState = function(sessionKey) {
        try {
            var key = STORAGE_KEY + (sessionKey ? "_" + sessionKey : "");
            localStorage.setItem(key, JSON.stringify({
                proposals: this.proposals,
                clips: this.clips
            }));
        } catch(e) {}
    };

    BRoll.prototype.loadState = function(sessionKey) {
        try {
            var key = STORAGE_KEY + (sessionKey ? "_" + sessionKey : "");
            var raw = localStorage.getItem(key);
            if (!raw) return false;
            var data = JSON.parse(raw);
            this.proposals = data.proposals || [];
            this.clips = data.clips || [];
            return true;
        } catch(e) {
            return false;
        }
    };

    BRoll.prototype.clearState = function(sessionKey) {
        this.proposals = [];
        this.clips = [];
        try {
            var key = STORAGE_KEY + (sessionKey ? "_" + sessionKey : "");
            localStorage.removeItem(key);
        } catch(e) {}
    };

    // ── Server check (reads from shared motion-server) ────────────────────────

    BRoll.prototype.checkServer = function(callback) {
        var self = this;
        if (!http) { if (callback) callback(false); return; }
        var req = http.get(SERVER_URL + "/api/status", function(res) {
            var data = "";
            res.on("data", function(c) { data += c; });
            res.on("end", function() {
                try { callback(JSON.parse(data).running === true); }
                catch(e) { callback(false); }
            });
        });
        req.on("error", function() { callback(false); });
        req.setTimeout(3000, function() { req.destroy(); callback(false); });
    };

    // ── HTTP helpers ───────────────────────────────────────────────────────────

    BRoll.prototype._post = function(urlPath, body, callback) {
        if (!http) { callback(new Error("HTTP not available")); return; }
        var called = false;
        function cb(err, data) { if (called) return; called = true; callback(err, data); }
        var data = JSON.stringify(body);
        var req = http.request({
            hostname: "127.0.0.1", port: SERVER_PORT,
            path: urlPath, method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
        }, function(res) {
            var chunks = "";
            res.on("data", function(c) { chunks += c; });
            res.on("end", function() {
                try { cb(null, JSON.parse(chunks)); }
                catch(e) { cb(new Error("Parse error: " + chunks.substring(0, 200))); }
            });
        });
        req.on("error", function(e) { cb(e); });
        req.setTimeout(300000, function() { req.destroy(); cb(new Error("Request timeout (5 min)")); });
        req.write(data);
        req.end();
    };

    BRoll.prototype._get = function(urlPath, callback) {
        if (!http) { callback(new Error("HTTP not available")); return; }
        var called = false;
        function cb(err, data) { if (called) return; called = true; callback(err, data); }
        var req = http.get(SERVER_URL + urlPath, function(res) {
            var data = "";
            res.on("data", function(c) { data += c; });
            res.on("end", function() {
                try { cb(null, JSON.parse(data)); }
                catch(e) { cb(new Error("Parse error")); }
            });
        });
        req.on("error", function(e) { cb(e); });
        req.setTimeout(15000, function() { req.destroy(); cb(new Error("GET timeout")); });
    };

    // ── Poll a B-roll job ──────────────────────────────────────────────────────

    BRoll.prototype._pollJob = function(jobId, onDone) {
        var self = this;
        var polls = 0;
        var maxPolls = 200; // 200 × 2s = ~6 min
        function tick() {
            polls++;
            if (polls > maxPolls) {
                delete self._pollTimers[jobId];
                return onDone(new Error("Job poll timeout: " + jobId), null);
            }
            self._get("/api/broll/status/" + jobId, function(err, job) {
                if (err) {
                    delete self._pollTimers[jobId];
                    return onDone(err, null);
                }
                if (job.status === "complete") {
                    delete self._pollTimers[jobId];
                    return onDone(null, job);
                }
                if (job.status === "error") {
                    delete self._pollTimers[jobId];
                    return onDone(new Error(job.error || "Job failed"), null);
                }
                self._pollTimers[jobId] = setTimeout(tick, 2000);
            });
        }
        self._pollTimers[jobId] = setTimeout(tick, 1500);
    };

    // ── B-Roll analysis system prompt ────────────────────────────────────────

    var BROLL_SYSTEM_PROMPT = [
        "You are a professional video editor and visual storyteller specializing in educational content.",
        "Analyze the transcript and identify 3-8 moments where B-roll visual content would enhance the educational impact.",
        "",
        "Each moment should be 3-10 seconds long. The description must be a specific, actionable image generation prompt.",
        "Good: 'Close-up of hands typing Python code on a dark terminal'",
        "Bad: 'Something visual', 'A relevant image'",
        "",
        "Return ONLY a valid JSON array:",
        '[{ "startTime": "HH:MM:SS.mmm", "endTime": "HH:MM:SS.mmm", "description": "...", "rationale": "..." }]'
    ].join("\n");

    // Try to load from Prompts/BRoll/analysis.md if available
    try {
        var _promptPath = require("path").join(
            require("path").dirname(require("path").dirname(__dirname)),
            "Prompts", "BRoll", "analysis.md"
        );
        if (require("fs").existsSync(_promptPath)) {
            BROLL_SYSTEM_PROMPT = require("fs").readFileSync(_promptPath, "utf8");
        }
    } catch(e) {}

    // ── Step 1: Analyze transcript → proposals (direct LLM, no server needed) ─

    BRoll.prototype.analyze = function(transcript, aiSettings, callback) {
        var self = this;
        if (self.analyzing) return callback(new Error("Ya se está analizando"));

        // Use ai-analyzer directly — no server dependency for analysis
        var analyzer = window._epAiAnalyzer;
        if (!analyzer) return callback(new Error("AI Analyzer no disponible"));

        self.analyzing = true;
        var userPrompt = "Analyze the following transcript and identify B-roll opportunities.\n\n" + transcript +
            '\n\nReturn ONLY a valid JSON array. No explanation text.';

        analyzer._send(BROLL_SYSTEM_PROMPT, userPrompt, function(result) {
            self.analyzing = false;
            if (!result) return callback(new Error("La IA no devolvió respuesta"));
            if (result.error) return callback(new Error(result.error));

            try {
                // _send's _parseResponse already JSON.parse'd the response
                // Result is either an array directly, or an object wrapping it
                var proposals = Array.isArray(result) ? result : (result.proposals || result.moments || []);

                if (!Array.isArray(proposals) || proposals.length === 0) {
                    // Fallback: try to extract from stringified result
                    var str = JSON.stringify(result);
                    var start = str.indexOf("[");
                    var end = str.lastIndexOf("]");
                    if (start !== -1 && end !== -1) {
                        proposals = JSON.parse(str.substring(start, end + 1));
                    }
                }

                if (!Array.isArray(proposals)) throw new Error("Expected JSON array");

                self.proposals = proposals
                    .filter(function(p) { return p && p.startTime && p.endTime && p.description; })
                    .map(function(p, i) {
                        return {
                            id: "broll_" + Date.now() + "_" + i,
                            startTime: p.startTime,
                            endTime: p.endTime,
                            description: String(p.description).trim(),
                            rationale: String(p.rationale || "").trim()
                        };
                    });

                callback(null, self.proposals);
            } catch(e) {
                callback(new Error("Error parseando propuestas: " + e.message));
            }
        });
    };

    // ── Step 2: Generate image for a proposal ────────────────────────────────

    BRoll.prototype.generateImage = function(proposalId, onProgress, callback) {
        var self = this;
        var proposal = self._findProposal(proposalId);
        if (!proposal) return callback(new Error("Propuesta no encontrada: " + proposalId));

        var settings = self._settings;
        var outputDir = settings.outputDir || (os && pathMod ? pathMod.join(os.tmpdir(), "editorpro-broll") : "/tmp/editorpro-broll");

        // Update or create clip entry
        var clip = self._findClip(proposalId);
        if (!clip) {
            clip = {
                id: "brclip_" + Date.now(),
                proposalId: proposalId,
                startTime: proposal.startTime,
                endTime: proposal.endTime,
                description: proposal.description,
                rationale: proposal.rationale,
                versions: [],
                activeVersion: 0,
                status: "generating",
                placedInTimeline: false
            };
            self.clips.push(clip);
        } else {
            clip.status = "generating";
        }

        if (onProgress) onProgress(proposalId, "generating", 0);

        self._post("/api/broll/generate-image", {
            proposalId: proposalId,
            description: proposal.description,
            imageProvider: settings.imageProvider,
            endpointUrl: settings.imageEndpointUrl,
            apiKey: settings.imageFalApiKey,
            model: settings.imageFalModel,
            outputDir: outputDir
        }, function(err, result) {
            if (err) {
                clip.status = "error";
                clip.lastError = err.message;
                if (onProgress) onProgress(proposalId, "error", 0);
                return callback(err);
            }
            if (result.error) {
                clip.status = "error";
                clip.lastError = result.error;
                return callback(new Error(result.error));
            }
            var jobId = result.jobId;
            if (onProgress) onProgress(proposalId, "generating", 30);

            self._pollJob(jobId, function(pollErr, job) {
                if (pollErr) {
                    clip.status = "error";
                    clip.lastError = pollErr.message;
                    if (onProgress) onProgress(proposalId, "error", 0);
                    return callback(pollErr);
                }
                // Add version
                var version = {
                    version: clip.versions.length + 1,
                    imagePath: job.filePath,
                    imageBase64: job.base64 || null,
                    videoPath: null,
                    status: "image",
                    feedback: ""
                };
                clip.versions.push(version);
                clip.activeVersion = clip.versions.length - 1;
                clip.status = "image";
                if (onProgress) onProgress(proposalId, "image", 100);
                callback(null, clip);
            });
        });
    };

    // ── Step 3: Animate image → video ─────────────────────────────────────────

    BRoll.prototype.animateClip = function(clipId, onProgress, callback) {
        var self = this;
        var clip = self._findClipById(clipId);
        if (!clip) return callback(new Error("Clip no encontrado: " + clipId));
        var version = clip.versions[clip.activeVersion];
        if (!version || !version.imagePath) return callback(new Error("Genera la imagen primero"));

        var settings = self._settings;
        var startSecs = self._timeToSeconds(clip.startTime);
        var endSecs = self._timeToSeconds(clip.endTime);
        var durationSecs = Math.max(1, endSecs - startSecs) || 5;

        clip.status = "animating";
        if (onProgress) onProgress(clipId, "animating", 0);

        self._post("/api/broll/animate", {
            proposalId: clip.proposalId,
            imagePath: version.imagePath,
            durationSecs: durationSecs,
            prompt: clip.description,
            videoProvider: settings.videoProvider,
            endpointUrl: settings.videoEndpointUrl,
            apiKey: settings.videoKlingApiKey,
            outputDir: pathMod ? pathMod.dirname(version.imagePath) : null
        }, function(err, result) {
            if (err) {
                clip.status = "image";
                if (onProgress) onProgress(clipId, "error", 0);
                return callback(err);
            }
            if (result.error) {
                clip.status = "image";
                return callback(new Error(result.error));
            }
            if (onProgress) onProgress(clipId, "animating", 40);

            self._pollJob(result.jobId, function(pollErr, job) {
                if (pollErr) {
                    clip.status = "image";
                    if (onProgress) onProgress(clipId, "error", 0);
                    return callback(pollErr);
                }
                version.videoPath = job.filePath;
                version.status = "video";
                clip.status = "video";
                if (onProgress) onProgress(clipId, "video", 100);
                callback(null, clip);
            });
        });
    };

    // ── Regenerate image with feedback ─────────────────────────────────────────

    BRoll.prototype.regenerateImage = function(clipId, feedback, onProgress, callback) {
        var self = this;
        var clip = self._findClipById(clipId);
        if (!clip) return callback(new Error("Clip no encontrado"));

        // Store feedback on current version
        var curVersion = clip.versions[clip.activeVersion];
        if (curVersion) curVersion.feedback = feedback;

        var enhancedDesc = feedback
            ? clip.description + ". Additional guidance: " + feedback
            : clip.description;

        // Patch description for this generation and use same flow
        var originalDesc = clip.description;
        clip.description = enhancedDesc;
        // Temporarily update proposal description so generateImage picks up the enhanced description
        var existing = self._findProposal(clip.proposalId);
        if (!existing) {
            self.proposals.push({ id: clip.proposalId, startTime: clip.startTime, endTime: clip.endTime, description: enhancedDesc });
        } else {
            var savedDesc = existing.description;
            existing.description = enhancedDesc;
        }

        self.generateImage(clip.proposalId, onProgress, function(err, updatedClip) {
            clip.description = originalDesc;
            if (existing) existing.description = savedDesc || originalDesc;
            callback(err, updatedClip);
        });
    };

    // ── Place clip in timeline (PNG or MP4) ───────────────────────────────────

    BRoll.prototype.placeInTimeline = function(clipId, csInterface, callback) {
        var self = this;
        var clip = self._findClipById(clipId);
        if (!clip) return callback(new Error("Clip no encontrado"));
        var version = clip.versions[clip.activeVersion];
        if (!version) return callback(new Error("No hay versión disponible"));

        var filePath = version.videoPath || version.imagePath;
        if (!filePath || !fs || !fs.existsSync(filePath)) {
            return callback(new Error("Archivo no encontrado: " + filePath));
        }

        var settings = self._settings;
        var trackIndex = settings.trackIndex === "auto" ? -1 : parseInt(settings.trackIndex, 10);
        var startSecs = self._timeToSeconds(clip.startTime);
        var endSecs = self._timeToSeconds(clip.endTime);
        var durationSecs = Math.max(1, endSecs - startSecs);

        var isVideo = filePath.toLowerCase().indexOf(".mp4") !== -1 || filePath.toLowerCase().indexOf(".mov") !== -1;
        var clipName = "BRoll_" + (clip.proposalId || "clip") + "_v" + (clip.activeVersion + 1) + (isVideo ? ".mp4" : ".png");

        var tmpFile = pathMod ? pathMod.join(pathMod.dirname(filePath), "broll_place_" + Date.now() + ".json") : "/tmp/broll_place.json";
        var payload = {
            clips: [{
                filePath: filePath,
                clipName: clipName,
                startTimeSecs: startSecs,
                durationSecs: durationSecs,
                labelColor: 3, // Violet
                trackIndex: trackIndex >= 0 ? trackIndex : undefined
            }]
        };
        try { fs.writeFileSync(tmpFile, JSON.stringify(payload)); } catch(e) { return callback(e); }

        var safeJson = tmpFile.replace(/\\/g, "/").replace(/"/g, '\\"');
        csInterface.evalScript('importAndPlaceBroll("' + safeJson + '")', function(result) {
            try { fs.unlinkSync(tmpFile); } catch(e) {}
            try {
                var parsed = JSON.parse(result);
                if (parsed.error) return callback(new Error(parsed.error));
                clip.status = "placed";
                clip.placedInTimeline = true;
                version.status = "placed";
                callback(null, clip);
            } catch(e) {
                callback(new Error("ExtendScript result parse error: " + result));
            }
        });
    };

    // ── Animate all videos sequentially ───────────────────────────────────────

    BRoll.prototype.animateAll = function(onItemProgress, onBatchProgress, callback) {
        var self = this;
        var toAnimate = self.clips.filter(function(c) { return c.status === "image"; });
        if (toAnimate.length === 0) return callback(null, 0);

        self.generateCancelRequested = false;
        var done = 0;
        var errors = [];

        function next(idx) {
            if (self.generateCancelRequested || idx >= toAnimate.length) {
                return callback(null, done, errors);
            }
            var clip = toAnimate[idx];
            onBatchProgress(idx, toAnimate.length, clip.id);
            self.animateClip(clip.id, onItemProgress, function(err) {
                if (err) errors.push({ clipId: clip.id, error: err.message });
                else done++;
                next(idx + 1);
            });
        }
        next(0);
    };

    // ── Helpers ────────────────────────────────────────────────────────────────

    BRoll.prototype._findProposal = function(id) {
        for (var i = 0; i < this.proposals.length; i++) {
            if (this.proposals[i].id === id) return this.proposals[i];
        }
        return null;
    };

    BRoll.prototype._findClip = function(proposalId) {
        for (var i = 0; i < this.clips.length; i++) {
            if (this.clips[i].proposalId === proposalId) return this.clips[i];
        }
        return null;
    };

    BRoll.prototype._findClipById = function(id) {
        for (var i = 0; i < this.clips.length; i++) {
            if (this.clips[i].id === id) return this.clips[i];
        }
        return null;
    };

    BRoll.prototype._timeToSeconds = function(timeStr) {
        if (!timeStr) return 0;
        var parts = timeStr.replace(",", ".").split(":");
        if (parts.length === 3) {
            return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
        }
        if (parts.length === 2) {
            return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
        }
        return parseFloat(parts[0]) || 0;
    };

    global.BRoll = BRoll;

})(window);
