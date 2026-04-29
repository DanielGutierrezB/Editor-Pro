/**
 * BRoll — B-Roll Image-to-Video Pipeline for Editor-Pro
 * Core module: constructor, settings, state, server comms, analysis, generation, placement.
 * Scene logic in broll-scenes.js, style defs in broll-styles.js.
 * v1.8.61: Refactored from god object into focused modules
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
        this.proposals = [];
        this.clips = [];
        this.scenes = [];
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
            imageGeminiApiKey: "",
            videoProvider: "placeholder",
            videoEndpointUrl: "",
            videoKlingApiKey: "",
            videoFalModel: "",
            videoFalApiKey: "",
            videoGeminiApiKey: "",
            audioProvider: "placeholder",
            audioApiKey: "",
            autoGenerateAudio: false,
            trackIndex: "auto",
            outputDir: ""
        };
        try {
            var saved = localStorage.getItem(SETTINGS_KEY);
            if (saved) {
                var parsed = JSON.parse(saved);
                if (parsed.imageProvider === "flux_local") {
                    parsed.imageProvider = "comfyui";
                    parsed.imageEndpointUrl = "http://localhost:8188";
                }
                return Object.assign({}, defaults, parsed);
            }
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
            var clipsClean = this.clips.map(function(clip) {
                var c = Object.assign({}, clip);
                c.versions = clip.versions.map(function(v) {
                    var vc = Object.assign({}, v);
                    if (vc.imageBase64 && vc.imageBase64.indexOf("data:") === 0) {
                        delete vc.imageBase64;
                    }
                    return vc;
                });
                return c;
            });
            localStorage.setItem(key, JSON.stringify({
                proposals: this.proposals,
                clips: clipsClean,
                scenes: this.scenes
            }));
        } catch(e) {
            console.warn("[BRoll] saveState failed:", e.message);
        }
    };

    BRoll.prototype.loadState = function(sessionKey) {
        try {
            var key = STORAGE_KEY + (sessionKey ? "_" + sessionKey : "");
            var raw = localStorage.getItem(key);
            if (!raw) return false;
            var data = JSON.parse(raw);
            this.proposals = data.proposals || [];
            this.clips = data.clips || [];
            this.scenes = data.scenes || [];
            return true;
        } catch(e) {
            return false;
        }
    };

    BRoll.prototype.clearState = function(sessionKey) {
        this.proposals = [];
        this.clips = [];
        this.scenes = [];
        try {
            var key = STORAGE_KEY + (sessionKey ? "_" + sessionKey : "");
            localStorage.removeItem(key);
        } catch(e) {}
    };

    // ── Server check ───────────────────────────────────────────────────────────

    BRoll.prototype.checkServer = function(callback) {
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

    BRoll.prototype._pollJob = function(jobId, onDone, onTick) {
        var self = this;
        var polls = 0;
        var maxPolls = 200;
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
                if (job.status === "running" && onTick) onTick(job);
                self._pollTimers[jobId] = setTimeout(tick, 2000);
            });
        }
        self._pollTimers[jobId] = setTimeout(tick, 1500);
    };

    // ── Step 1: Analyze transcript ─────────────────────────────────────────────

    BRoll.prototype.analyze = function(transcript, aiSettings, callback) {
        var self = this;
        if (self.analyzing) return callback(new Error("Ya se está analizando"));

        var styles = global._epBrollStyles;
        if (styles) styles.ensureBrollPrompt();

        var analyzer = window._epAiAnalyzer;
        if (!analyzer) return callback(new Error("AI Analyzer no disponible"));

        self.analyzing = true;

        // Inject video provider max duration into prompt context
        var maxVidDuration = self.getVideoMaxDuration();
        var durationHint = '\n\nIMPORTANT: The video generation model supports a maximum of ' + maxVidDuration +
            ' seconds per clip. Plan shots so each individual shot is ≤' + maxVidDuration +
            's. If a moment needs more time, split it into multiple shots with different angles/compositions that cut naturally together.\n';

        var userPrompt = "Analyze the following transcript and identify B-roll opportunities.\n\n" + transcript +
            durationHint +
            '\n\nReturn ONLY valid JSON. No explanation text.';

        var systemPrompt = styles ? styles.getSystemPrompt().replace("{VISUAL_STYLE}", "") :
            "You are a professional video editor. Identify B-roll opportunities.";

        analyzer._send(systemPrompt, userPrompt, function(result) {
            self.analyzing = false;
            if (!result) return callback(new Error("La IA no devolvió respuesta"));
            if (result.error) return callback(new Error(result.error));

            try {
                var scenes = global._epBrollScenes;
                var parsed = scenes ? scenes.parseLLMResponse(result) : { proposals: [], scenes: [] };

                if (!parsed.proposals || parsed.proposals.length === 0) {
                    throw new Error("No proposals found in LLM response");
                }

                // Post-process: split any shots that exceed the video provider's max duration
                if (scenes && scenes.splitOversizedShots) {
                    parsed.proposals = scenes.splitOversizedShots(parsed.proposals, maxVidDuration);
                }

                self.proposals = parsed.proposals;
                self.scenes = parsed.scenes;

                callback(null, self.proposals);
            } catch(e) {
                callback(new Error("Error parseando propuestas: " + e.message));
            }
        });
    };

    // ── Video provider max duration ────────────────────────────────────────────

    /** Max seconds per video clip for the active video provider */
    BRoll.prototype.getVideoMaxDuration = function() {
        var limits = { kling: 10, fal: 10, gemini_video: 8, ltx_local: 10, placeholder: 30 };
        return limits[this._settings.videoProvider] || 10;
    };

    // ── Step 2: Generate image for a proposal ────────────────────────────────

    BRoll.prototype.generateImage = function(proposalId, onProgress, callback, options) {
        var self = this;
        var proposal = self._findProposal(proposalId);
        if (!proposal) return callback(new Error("Propuesta no encontrada: " + proposalId));

        var settings = self._settings;
        var outputDir = settings.outputDir || (os && pathMod ? pathMod.join(os.tmpdir(), "editorpro-broll") : "/tmp/editorpro-broll");

        var referenceImagePath = (options && options.referenceImagePath) || null;
        var denoise = (options && options.denoise) || 0.6;

        var clip = self._findClip(proposalId);
        if (!clip) {
            clip = {
                id: "brclip_" + Date.now(),
                proposalId: proposalId,
                startTime: proposal.startTime,
                endTime: proposal.endTime,
                description: proposal.description,
                rationale: proposal.rationale,
                transcriptText: proposal.transcriptText || "",
                sceneId: proposal.sceneId || null,
                shotType: proposal.shotType || null,
                shotOrder: proposal.shotOrder || null,
                visualWorld: proposal.visualWorld || "",
                isHero: !!proposal.isHero,
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

        var proposalIndex = 0;
        for (var pi = 0; pi < self.proposals.length; pi++) {
            if (self.proposals[pi].id === proposalId) { proposalIndex = pi; break; }
        }
        var seqPrefix = (self._currentSequenceName || "BRoll").replace(/[^a-zA-Z0-9_-]/g, "_");
        var clipName = seqPrefix + "_BRoll_" + String(proposalIndex + 1).padStart(2, "0");

        // Apply style prefix from broll-styles.js
        var styledDescription = proposal.description;
        var styles = global._epBrollStyles;
        if (styles && proposal.visualStyle) {
            var prefix = styles.getStylePrefix(proposal.visualStyle);
            if (prefix) styledDescription = prefix + styledDescription;
        }

        if (options && options.heroDescription) {
            styledDescription = '[STYLE REFERENCE ONLY — Use the same artistic style, color palette, and rendering technique. Do NOT repeat the hero composition — generate a COMPLETELY DIFFERENT subject as described below. Reference style: ' + options.heroDescription + '] ' + styledDescription;
        }

        var requestBody = {
            proposalId: proposalId,
            description: styledDescription,
            imageProvider: settings.imageProvider,
            endpointUrl: settings.imageEndpointUrl,
            apiKey: settings.imageProvider === "gemini_image" ? settings.imageGeminiApiKey : settings.imageFalApiKey,
            model: settings.imageFalModel,
            outputDir: outputDir,
            clipName: clipName
        };

        if (referenceImagePath) {
            requestBody.referenceImagePath = referenceImagePath;
            if (settings.imageProvider !== "gemini_image") {
                requestBody.denoise = denoise;
            }
        }

        self._post("/api/broll/generate-image", requestBody, function(err, result) {
            if (err) {
                self.clips = self.clips.filter(function(c) { return c.id !== clip.id; });
                if (onProgress) onProgress(proposalId, "error", 0);
                return callback(err);
            }
            if (result.error) {
                self.clips = self.clips.filter(function(c) { return c.id !== clip.id; });
                return callback(new Error(result.error));
            }
            var jobId = result.jobId;
            if (onProgress) onProgress(proposalId, "generating", 0);

            self._pollJob(jobId, function(pollErr, job) {
                if (pollErr) {
                    self.clips = self.clips.filter(function(c) { return c.id !== clip.id; });
                    if (onProgress) onProgress(proposalId, "error", 0);
                    return callback(pollErr);
                }
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
            }, function(job) {
                if (onProgress) onProgress(proposalId, "generating", job.elapsedMs ? Math.round(job.elapsedMs / 1000) : 0);
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

        var videoApiKey = settings.videoProvider === "fal" ? settings.videoFalApiKey
            : settings.videoProvider === "gemini_video" ? settings.videoGeminiApiKey
            : settings.videoKlingApiKey;
        var videoModel = settings.videoProvider === "fal" ? settings.videoFalModel : undefined;
        self._post("/api/broll/animate", {
            proposalId: clip.proposalId,
            imagePath: version.imagePath,
            durationSecs: durationSecs,
            prompt: clip.description,
            videoProvider: settings.videoProvider,
            endpointUrl: settings.videoEndpointUrl,
            apiKey: videoApiKey,
            model: videoModel,
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
            if (onProgress) onProgress(clipId, "animating", 0);

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
            }, function(job) {
                if (onProgress) onProgress(clipId, "animating", job.elapsedMs ? Math.round(job.elapsedMs / 1000) : 0);
            });
        });
    };

    // ── Regenerate image with feedback ─────────────────────────────────────────

    BRoll.prototype.regenerateImage = function(clipId, feedback, onProgress, callback, heroContext) {
        var self = this;
        var clip = self._findClipById(clipId);
        if (!clip) return callback(new Error("Clip no encontrado"));

        var curVersion = clip.versions[clip.activeVersion];
        if (curVersion) curVersion.feedback = feedback;

        var enhancedDesc = feedback
            ? clip.description + ". Additional guidance: " + feedback
            : clip.description;

        if (heroContext) {
            enhancedDesc = '[Visual reference — maintain consistency with this scene: ' + heroContext + '] ' + enhancedDesc;
        }

        var originalDesc = clip.description;
        clip.description = enhancedDesc;
        var existing = self._findProposal(clip.proposalId);
        var savedDesc = originalDesc;
        if (!existing) {
            existing = { id: clip.proposalId, startTime: clip.startTime, endTime: clip.endTime, description: enhancedDesc };
            self.proposals.push(existing);
        } else {
            savedDesc = existing.description;
            existing.description = enhancedDesc;
        }

        var settings = self._settings;
        var regenOptions = null;

        if (settings.imageProvider === "gemini_image") {
            if (curVersion && curVersion.imagePath) {
                regenOptions = { referenceImagePath: curVersion.imagePath };
            } else if (clip.sceneId && !clip.isHero) {
                var heroClipG = self._findHeroShotClip(clip.sceneId);
                if (heroClipG) {
                    var heroVersionG = heroClipG.versions[heroClipG.activeVersion];
                    if (heroVersionG && heroVersionG.imagePath) {
                        regenOptions = { referenceImagePath: heroVersionG.imagePath };
                    }
                }
            }
        } else if (clip.sceneId) {
            if (!clip.isHero) {
                var heroClip = self._findHeroShotClip(clip.sceneId);
                if (heroClip) {
                    var heroVersion = heroClip.versions[heroClip.activeVersion];
                    if (heroVersion && heroVersion.imagePath) {
                        var heroType = heroClip.shotType;
                        var myType = clip.shotType;
                        var denoise = (heroType && myType && heroType === myType) ? 0.65 : 0.9;
                        regenOptions = { referenceImagePath: heroVersion.imagePath, denoise: denoise };
                    }
                }
            }
        }

        self.generateImage(clip.proposalId, onProgress, function(err, updatedClip) {
            clip.description = originalDesc;
            existing.description = savedDesc;
            callback(err, updatedClip);
        }, regenOptions);
    };

    // ── Regenerate video with feedback ───────────────────────────────────────────

    BRoll.prototype.regenerateVideo = function(clipId, feedback, onProgress, callback) {
        var self = this;
        var clip = self._findClipById(clipId);
        if (!clip) return callback(new Error("Clip no encontrado"));
        var curVersion = clip.versions[clip.activeVersion];
        if (!curVersion || !curVersion.imagePath) return callback(new Error("Genera la imagen primero"));

        // Store feedback on current version
        if (curVersion) curVersion.videoFeedback = feedback;

        var settings = self._settings;
        var startSecs = self._timeToSeconds(clip.startTime);
        var endSecs = self._timeToSeconds(clip.endTime);
        var durationSecs = Math.max(1, endSecs - startSecs) || 5;

        clip.status = "animating";
        if (onProgress) onProgress(clipId, "animating", 0);

        // Build enhanced prompt with feedback
        var basePrompt = clip.description || "Smooth cinematic camera motion";
        var enhancedPrompt = feedback
            ? basePrompt + ". Video direction: " + feedback
            : basePrompt;

        var videoApiKey = settings.videoProvider === "fal" ? settings.videoFalApiKey
            : settings.videoProvider === "gemini_video" ? settings.videoGeminiApiKey
            : settings.videoKlingApiKey;
        var videoModel = settings.videoProvider === "fal" ? settings.videoFalModel : undefined;

        self._post("/api/broll/animate", {
            proposalId: clip.proposalId,
            imagePath: curVersion.imagePath,
            durationSecs: durationSecs,
            prompt: enhancedPrompt,
            videoProvider: settings.videoProvider,
            endpointUrl: settings.videoEndpointUrl,
            apiKey: videoApiKey,
            model: videoModel,
            outputDir: pathMod ? pathMod.dirname(curVersion.imagePath) : null
        }, function(err, result) {
            if (err) {
                clip.status = "video";
                if (onProgress) onProgress(clipId, "error", 0);
                return callback(err);
            }
            if (result.error) {
                clip.status = "video";
                return callback(new Error(result.error));
            }
            if (onProgress) onProgress(clipId, "animating", 0);

            self._pollJob(result.jobId, function(pollErr, job) {
                if (pollErr) {
                    clip.status = "video";
                    if (onProgress) onProgress(clipId, "error", 0);
                    return callback(pollErr);
                }
                // Push new video version (keep same image, new video)
                var newVersion = {
                    version: clip.versions.length + 1,
                    imagePath: curVersion.imagePath,
                    imageBase64: curVersion.imageBase64 || null,
                    videoPath: job.filePath,
                    status: "video",
                    feedback: "",
                    videoFeedback: feedback || ""
                };
                clip.versions.push(newVersion);
                clip.activeVersion = clip.versions.length - 1;
                clip.status = "video";
                if (onProgress) onProgress(clipId, "video", 100);
                callback(null, clip);
            }, function(job) {
                if (onProgress) onProgress(clipId, "animating", job.elapsedMs ? Math.round(job.elapsedMs / 1000) : 0);
            });
        });
    };

    // ── Place clip in timeline ─────────────────────────────────────────────────

    BRoll.prototype.placeInTimeline = function(clipId, csInterface, callback) {
        var self = this;
        var clip = self._findClipById(clipId);
        if (!clip) return callback(new Error("Clip no encontrado: " + clipId));
        var version = clip.versions[clip.activeVersion];
        if (!version) return callback(new Error("No hay versión disponible para clip " + clipId));

        var filePath = version.videoPath || version.imagePath;
        if (!filePath) return callback(new Error("Sin ruta de archivo — regenera la imagen"));
        if (!fs) return callback(new Error("Módulo fs no disponible"));
        if (!fs.existsSync(filePath)) return callback(new Error("Archivo no existe: " + filePath));

        var settings = self._settings;
        var trackIndex = settings.trackIndex === "auto" ? -1 : parseInt(settings.trackIndex, 10);
        var startSecs = self._timeToSeconds(clip.startTime);
        var endSecs = self._timeToSeconds(clip.endTime);
        var durationSecs = Math.max(1, endSecs - startSecs);

        var isVideo = filePath.toLowerCase().indexOf(".mp4") !== -1 || filePath.toLowerCase().indexOf(".mov") !== -1;
        var proposalIndex = 0;
        for (var pi = 0; pi < self.proposals.length; pi++) {
            if (self.proposals[pi].id === clip.proposalId) { proposalIndex = pi; break; }
        }
        var seqPrefix = (self._currentSequenceName || "BRoll").replace(/[^a-zA-Z0-9_-]/g, "_");
        var clipNum = String(proposalIndex + 1).padStart(2, "0");
        var clipName = seqPrefix + "_BRoll_" + clipNum + "_v" + (clip.activeVersion + 1);

        var tmpFile = pathMod ? pathMod.join(pathMod.dirname(filePath), "broll_place_" + Date.now() + ".json") : "/tmp/broll_place.json";
        var payload = {
            clips: [{
                filePath: filePath,
                clipName: clipName,
                startTimeSecs: startSecs,
                durationSecs: durationSecs,
                labelColor: self._shotTypeToLabelColor(clip.shotType),
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

    // ── Step: Generate ambient audio for a clip ───────────────────────────────

    BRoll.prototype.generateAudio = function(clipId, onProgress, callback) {
        var self = this;
        var clip = self._findClipById(clipId);
        if (!clip) return callback(new Error("Clip no encontrado: " + clipId));

        var settings = self._settings;
        var startSecs = self._timeToSeconds(clip.startTime);
        var endSecs = self._timeToSeconds(clip.endTime);
        var durationSecs = Math.max(1, endSecs - startSecs) || 5;

        if (onProgress) onProgress(clipId, "audio_generating", 0);

        var seqPrefix = (self._currentSequenceName || "BRoll").replace(/[^a-zA-Z0-9_-]/g, "_");
        var proposalIndex = 0;
        for (var pi = 0; pi < self.proposals.length; pi++) {
            if (self.proposals[pi].id === clip.proposalId) { proposalIndex = pi; break; }
        }
        var clipName = seqPrefix + "_BRoll_" + String(proposalIndex + 1).padStart(2, "0");

        var version = clip.versions[clip.activeVersion];
        var outputDir = (version && version.imagePath && pathMod)
            ? pathMod.dirname(version.imagePath)
            : (settings.outputDir || (os && pathMod ? pathMod.join(os.tmpdir(), "editorpro-broll") : "/tmp/editorpro-broll"));

        self._post("/api/broll/generate-audio", {
            proposalId: clip.proposalId,
            description: clip.description,
            durationSecs: durationSecs,
            audioProvider: settings.audioProvider || "placeholder",
            apiKey: settings.audioApiKey || "",
            outputDir: outputDir,
            clipName: clipName
        }, function(err, result) {
            if (err) {
                if (onProgress) onProgress(clipId, "error", 0);
                return callback(err);
            }
            if (result.error) return callback(new Error(result.error));

            self._pollJob(result.jobId, function(pollErr, job) {
                if (pollErr) {
                    if (onProgress) onProgress(clipId, "error", 0);
                    return callback(pollErr);
                }
                // Store audio path on the active version
                if (version) {
                    version.audioPath = job.filePath;
                }
                clip.hasAudio = true;
                if (onProgress) onProgress(clipId, "audio_done", 100);
                callback(null, clip);
            }, function(job) {
                if (onProgress) onProgress(clipId, "audio_generating", job.elapsedMs ? Math.round(job.elapsedMs / 1000) : 0);
            });
        });
    };

    // ── Place audio in timeline ──────────────────────────────────────────────

    BRoll.prototype.placeAudioInTimeline = function(clipId, csInterface, callback) {
        var self = this;
        var clip = self._findClipById(clipId);
        if (!clip) return callback(new Error("Clip no encontrado: " + clipId));
        var version = clip.versions[clip.activeVersion];
        if (!version || !version.audioPath) return callback(new Error("Sin audio generado para este clip"));

        if (!fs) return callback(new Error("Módulo fs no disponible"));
        if (!fs.existsSync(version.audioPath)) return callback(new Error("Archivo de audio no existe: " + version.audioPath));

        var startSecs = self._timeToSeconds(clip.startTime);
        var endSecs = self._timeToSeconds(clip.endTime);
        var durationSecs = Math.max(1, endSecs - startSecs);

        var proposalIndex = 0;
        for (var pi = 0; pi < self.proposals.length; pi++) {
            if (self.proposals[pi].id === clip.proposalId) { proposalIndex = pi; break; }
        }
        var seqPrefix = (self._currentSequenceName || "BRoll").replace(/[^a-zA-Z0-9_-]/g, "_");
        var clipName = seqPrefix + "_BRoll_Audio_" + String(proposalIndex + 1).padStart(2, "0");

        var tmpFile = pathMod ? pathMod.join(pathMod.dirname(version.audioPath), "broll_audio_place_" + Date.now() + ".json") : "/tmp/broll_audio_place.json";
        var payload = {
            clips: [{
                filePath: version.audioPath,
                clipName: clipName,
                startTimeSecs: startSecs,
                durationSecs: durationSecs
            }]
        };
        try { fs.writeFileSync(tmpFile, JSON.stringify(payload)); } catch(e) { return callback(e); }

        var safeJson = tmpFile.replace(/\\/g, "/").replace(/"/g, '\\"');
        csInterface.evalScript('importAndPlaceAudio("' + safeJson + '")', function(result) {
            try { fs.unlinkSync(tmpFile); } catch(e) {}
            try {
                var parsed = JSON.parse(result);
                if (parsed.error) return callback(new Error(parsed.error));
                callback(null, clip);
            } catch(e) {
                callback(new Error("ExtendScript result parse error: " + result));
            }
        });
    };

    // ── Batch animate ──────────────────────────────────────────────────────────

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

    BRoll.prototype.animateSelected = function(clipIds, onItemProgress, onBatchProgress, callback) {
        var self = this;
        var toAnimate = self.clips.filter(function(c) {
            return c.status === "image" && clipIds.indexOf(c.id) !== -1;
        });
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

    BRoll.prototype.setOutputDir = function(dir) { this._settings.outputDir = dir; };

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

    BRoll.prototype._findScene = function(sceneId) {
        for (var i = 0; i < this.scenes.length; i++) {
            if (this.scenes[i].id === sceneId) return this.scenes[i];
        }
        return null;
    };

    /** @deprecated Replaced by Hero Shot system. */
    BRoll.prototype._shouldUseImg2Img = function() { return false; };

    BRoll.prototype._shotTypeToLabelColor = function(shotType) {
        if (!shotType) return 3;
        switch (String(shotType).toUpperCase()) {
            case "WIDE": return 4;
            case "MED":  return 5;
            case "CU":   return 7;
            case "DET":  return 1;
            case "OTS":  return 8;
            default:     return 3;
        }
    };

    BRoll.prototype._timeToSeconds = function(timeStr) {
        if (!timeStr) return 0;
        var parts = timeStr.replace(",", ".").split(":");
        if (parts.length === 3) return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
        if (parts.length === 2) return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
        return parseFloat(parts[0]) || 0;
    };

    global.BRoll = BRoll;

})(window);
