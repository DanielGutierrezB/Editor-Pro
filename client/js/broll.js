/**
 * BRoll — B-Roll Image-to-Video Pipeline for Editor-Pro
 * Server lifecycle (reuses motion-server port 3847), image gen, video gen, versioning
 * v1.9.0: Gemini Flash Image provider + feedback reference + Gemini-aware denoise skip
 * v1.8.48: Visual style selector — photorealistic, comic sketch, blueprint, courtroom
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
        this.proposals = [];  // [{id, startTime, endTime, description, rationale, sceneId?, shotType?, shotOrder?, visualWorld?, isHero?}]
        this.clips = [];      // [{id, proposalId, startTime, endTime, description, versions[], activeVersion, status, placedInTimeline, sceneId?, shotType?, shotOrder?, visualWorld?, isHero?}]
        this.scenes = [];     // [{id, title, narrative, visualWorld, shots[]}] — new scene-based structure
        this.analyzing = false;
        this.generating = false;
        this.generateCancelRequested = false;
        this._pollTimers = {};
        this._settings = this._loadSettings();
    }

    // ── Settings ───────────────────────────────────────────────────────────────

    BRoll.prototype._loadSettings = function() {
        var defaults = {
            // visualStyle removed — AI proposes per scene now
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
            trackIndex: "auto",
            outputDir: ""
        };
        try {
            var saved = localStorage.getItem(SETTINGS_KEY);
            if (saved) {
                var parsed = JSON.parse(saved);
                // Migrate removed providers to comfyui
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
            // Strip base64 data before saving — too large for localStorage (5-10MB limit)
            var clipsClean = this.clips.map(function(clip) {
                var c = Object.assign({}, clip);
                c.versions = clip.versions.map(function(v) {
                    var vc = Object.assign({}, v);
                    delete vc.imageBase64; // ~5-8MB per image, don't persist
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

    BRoll.prototype._pollJob = function(jobId, onDone, onTick) {
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
                if (job.status === "running" && onTick) onTick(job);
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

    var _STYLE_DEFS = {
        photorealistic: [
            "## CRITICAL: Photorealistic Style",
            "All image descriptions MUST describe **photorealistic scenes with real people in real situations**. Think stock footage / documentary style:",
            "- Real people in offices, meetings, looking at screens, working",
            "- Real environments: offices, coffee shops, classrooms, streets, homes",
            "- Real objects: laptops, phones, documents, whiteboards, money, products",
            "- Cinematic photography: shallow depth of field, natural lighting, professional composition",
            "",
            "**NEVER describe:**",
            "- Animated/cartoon/illustration style images",
            "- 3D renders or floating objects",
            "- Abstract graphics, charts, or diagrams",
            "- Icons, UI mockups, or infographics",
            "- Split screens or collages"
        ].join("\n"),

        comic_sketch: [
            "## CRITICAL: Comic Sketch Style",
            "All image descriptions MUST follow this artistic style: Rough illustrative comic sketch style, unfinished drawing aesthetic, loose and imperfect linework, slightly wobbly bold outlines, hand-drawn feel, sketchy composition, minimal refinement, low-saturation color palette with a strong green dominance, muted tones, subtle color variation, raw and expressive strokes.",
            "",
            "**DESCRIBE:**",
            "- Loose sketchy figures and environments rendered in a raw hand-drawn comic style",
            "- Rough, wobbly outlines with visible pencil/ink strokes and imperfect shapes",
            "- Low-saturation muted palette dominated by greens and earth tones",
            "- Expressive, gestural compositions with an unfinished sketch aesthetic",
            "",
            "**NEVER describe:**",
            "- Photorealistic or polished illustration styles",
            "- Clean digital art, 3D renders, or vector graphics",
            "- High-saturation or neon color palettes",
            "- Smooth, precise, or professionally finished linework",
            "",
            "Maintain this artistic style consistently across all shots in a scene."
        ].join("\n"),

        blueprint: [
            "## CRITICAL: Blueprint Style",
            "All image descriptions MUST follow this artistic style: Black background with glowing white linework, blueprint-style aesthetic, chalkboard drawing look, technical sketch appearance, clean luminous outlines, high contrast, minimal color (monochrome white on black), soft glow effect, schematic and diagram-like style, precise yet hand-drawn feel, subtle dust or chalk texture.",
            "",
            "**DESCRIBE:**",
            "- Dark/black backgrounds with crisp glowing white technical linework",
            "- Blueprint, chalkboard, or architectural schematic aesthetic",
            "- High-contrast monochrome (white on black) with subtle chalk or dust texture",
            "- Precise structural outlines with a soft luminous glow",
            "",
            "**NEVER describe:**",
            "- Colorful, photorealistic, or warm-toned images",
            "- Organic textures, natural environments, or soft gradients",
            "- Bright or light backgrounds",
            "- Painterly or loose artistic styles",
            "",
            "Maintain this artistic style consistently across all shots in a scene."
        ].join("\n"),

        courtroom: [
            "## CRITICAL: Courtroom Sketch Style",
            "All image descriptions MUST follow this artistic style: Courtroom sketch illustration style, traditional media look, expressive and gestural linework, loose yet controlled strokes, hand-drawn ink and colored pencil aesthetic, soft shading with layered strokes, slightly rough textures, muted and natural color palette (earth tones, subdued blues, browns, and reds), subtle paper grain, observational drawing style, dynamic but imperfect proportions, reportage illustration feel.",
            "",
            "**DESCRIBE:**",
            "- Expressive, gestural figures and scenes in a reportage/courtroom sketch style",
            "- Ink and colored pencil textures with layered, soft shading strokes",
            "- Muted earth-tone palette: browns, subdued blues, reds, natural colors",
            "- Paper grain texture and imperfect, observational proportions with dynamic energy",
            "",
            "**NEVER describe:**",
            "- Photorealistic or digitally polished images",
            "- Clean vector, cartoon, or animation styles",
            "- Bright, saturated, or neon color palettes",
            "- Symmetrical or overly precise compositions",
            "",
            "Maintain this artistic style consistently across all shots in a scene."
        ].join("\n")
    };

    function _buildStyledPrompt(promptTemplate, style) {
        var styleDef = _STYLE_DEFS[style] || _STYLE_DEFS.photorealistic;
        return promptTemplate.replace("{VISUAL_STYLE}", styleDef);
    }

    var _brollPromptLoaded = false;
    function _ensureBrollPrompt() {
        if (_brollPromptLoaded) return;
        _brollPromptLoaded = true;
        try {
            var csInterface = window._epCSInterface;
            if (!csInterface) return;
            var extPath = csInterface.getSystemPath("extension");
            var promptPath = require("path").join(extPath, "Prompts", "BRoll", "analysis.md");
            if (require("fs").existsSync(promptPath)) {
                BROLL_SYSTEM_PROMPT = require("fs").readFileSync(promptPath, "utf8");
            }
        } catch(e) {}
    }

    // ── Scene-based parsing helpers ──────────────────────────────────────────

    /**
     * Parse LLM response: supports both scenes[] (new) and proposals[]/array (legacy).
     * Always produces flat proposals[] for backward compat, but also populates scenes[] when available.
     * Returns { proposals: [], scenes: [] }
     */
    /**
     * Snap shots within each scene to be contiguous — no gaps between shots.
     * endTime of shot N becomes startTime of shot N+1 within the same scene.
     * Preserves the first shot's startTime and last shot's endTime as anchors.
     */
    function _snapShotsContiguous(proposals) {
        // Group by sceneId
        var sceneGroups = {};
        for (var i = 0; i < proposals.length; i++) {
            var p = proposals[i];
            var sid = p.sceneId || "__flat__";
            if (!sceneGroups[sid]) sceneGroups[sid] = [];
            sceneGroups[sid].push(p);
        }

        for (var key in sceneGroups) {
            var shots = sceneGroups[key];
            if (shots.length < 2) continue;

            // Sort by startTime
            shots.sort(function(a, b) {
                return _timeToSecs(a.startTime) - _timeToSecs(b.startTime);
            });

            // Calculate total scene duration and divide evenly, or snap end→start
            var sceneStart = _timeToSecs(shots[0].startTime);
            var sceneEnd = _timeToSecs(shots[shots.length - 1].endTime);
            var totalDuration = sceneEnd - sceneStart;
            var shotDuration = totalDuration / shots.length;

            // Redistribute evenly across the scene span
            for (var s = 0; s < shots.length; s++) {
                var newStart = sceneStart + (s * shotDuration);
                var newEnd = sceneStart + ((s + 1) * shotDuration);
                shots[s].startTime = _secsToTime(newStart);
                shots[s].endTime = _secsToTime(newEnd);
            }
        }
    }

    function _timeToSecs(t) {
        if (!t) return 0;
        var parts = String(t).split(":");
        if (parts.length === 3) {
            var h = parseFloat(parts[0]) || 0;
            var m = parseFloat(parts[1]) || 0;
            var secMs = parts[2].split(".");
            var sec = parseFloat(secMs[0]) || 0;
            var ms = secMs.length > 1 ? parseFloat("0." + secMs[1]) : 0;
            return h * 3600 + m * 60 + sec + ms;
        }
        return parseFloat(t) || 0;
    }

    function _secsToTime(secs) {
        var h = Math.floor(secs / 3600);
        var m = Math.floor((secs % 3600) / 60);
        var s = secs % 60;
        var sec = Math.floor(s);
        var ms = Math.round((s - sec) * 1000);
        return String(h).padStart(2, "0") + ":" +
               String(m).padStart(2, "0") + ":" +
               String(sec).padStart(2, "0") + "." +
               String(ms).padStart(3, "0");
    }

    function _parseLLMResponse(result) {
        var scenes = [];
        var proposals = [];

        // result is already parsed JSON from ai-analyzer
        var data = result;

        // Try scenes format first (new cinematographic format)
        if (data && data.scenes && Array.isArray(data.scenes) && data.scenes.length > 0) {
            scenes = data.scenes;
            // Flatten scenes → proposals with scene metadata
            for (var si = 0; si < scenes.length; si++) {
                var scene = scenes[si];
                var sceneId = scene.id || ("scene_" + String(si + 1).padStart(3, "0"));
                scene.id = sceneId;
                var shots = scene.shots || [];
                for (var shi = 0; shi < shots.length; shi++) {
                    var shot = shots[shi];
                    var shotId = sceneId + "_shot_" + String(shi + 1).padStart(2, "0");
                    proposals.push({
                        id: shotId,
                        startTime: shot.startTime,
                        endTime: shot.endTime,
                        description: String(shot.description || "").trim(),
                        rationale: String(shot.rationale || "").trim(),
                        sceneId: sceneId,
                        sceneTitle: scene.title || "",
                        sceneNarrative: scene.narrative || "",
                        visualStyle: scene.visualStyle || "photorealistic",
                        shotType: (shot.shotType || "MED").toUpperCase(),
                        shotOrder: shi + 1,
                        visualWorld: scene.visualWorld || "",
                        isHero: !!shot.isHero
                    });
                }
            }
            // Post-process: snap shots within each scene to be contiguous (no gaps)
            _snapShotsContiguous(proposals);

            return { proposals: proposals, scenes: scenes };
        }

        // Legacy format: flat array of proposals
        var rawProposals = Array.isArray(data) ? data : (data && (data.proposals || data.moments || []));
        if (!Array.isArray(rawProposals) || rawProposals.length === 0) {
            // Fallback: extract JSON array from stringified result
            var str = JSON.stringify(data);
            var start = str.indexOf("[");
            var end = str.lastIndexOf("]");
            if (start !== -1 && end !== -1) {
                try {
                    rawProposals = JSON.parse(str.substring(start, end + 1));
                } catch(e) {
                    rawProposals = [];
                }
            }
        }

        if (Array.isArray(rawProposals)) {
            proposals = rawProposals
                .filter(function(p) { return p && p.startTime && p.endTime && p.description; })
                .map(function(p, i) {
                    return {
                        id: "broll_" + Date.now() + "_" + i,
                        startTime: p.startTime,
                        endTime: p.endTime,
                        description: String(p.description).trim(),
                        rationale: String(p.rationale || "").trim()
                        // No sceneId — legacy format
                    };
                });
        }

        return { proposals: proposals, scenes: [] };
    }

    // ── Step 1: Analyze transcript → proposals (direct LLM, no server needed) ─

    BRoll.prototype.analyze = function(transcript, aiSettings, callback) {
        var self = this;
        if (self.analyzing) return callback(new Error("Ya se está analizando"));

        _ensureBrollPrompt(); // lazy-load prompt from file on first analysis

        // Use ai-analyzer directly — no server dependency for analysis
        var analyzer = window._epAiAnalyzer;
        if (!analyzer) return callback(new Error("AI Analyzer no disponible"));

        self.analyzing = true;
        var userPrompt = "Analyze the following transcript and identify B-roll opportunities.\n\n" + transcript +
            '\n\nReturn ONLY valid JSON. No explanation text.';

        // Style is now AI-proposed per scene — no user setting needed
        // Just replace {VISUAL_STYLE} token with empty string (styles are in the prompt itself)
        var systemPrompt = BROLL_SYSTEM_PROMPT.replace("{VISUAL_STYLE}", "");

        analyzer._send(systemPrompt, userPrompt, function(result) {
            self.analyzing = false;
            if (!result) return callback(new Error("La IA no devolvió respuesta"));
            if (result.error) return callback(new Error(result.error));

            try {
                var parsed = _parseLLMResponse(result);

                if (!parsed.proposals || parsed.proposals.length === 0) {
                    throw new Error("No proposals found in LLM response");
                }

                self.proposals = parsed.proposals;
                self.scenes = parsed.scenes;

                callback(null, self.proposals);
            } catch(e) {
                callback(new Error("Error parseando propuestas: " + e.message));
            }
        });
    };

    // ── Step 2: Generate image for a proposal ────────────────────────────────

    BRoll.prototype.generateImage = function(proposalId, onProgress, callback, options) {
        var self = this;
        var proposal = self._findProposal(proposalId);
        if (!proposal) return callback(new Error("Propuesta no encontrada: " + proposalId));

        var settings = self._settings;
        var outputDir = settings.outputDir || (os && pathMod ? pathMod.join(os.tmpdir(), "editorpro-broll") : "/tmp/editorpro-broll");

        // img2img options — passed when generating scene shots 2+
        var referenceImagePath = (options && options.referenceImagePath) || null;
        var denoise = (options && options.denoise) || 0.6;

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

        // Build a readable clip name: SeqName_BRoll_01
        var proposalIndex = 0;
        for (var pi = 0; pi < self.proposals.length; pi++) {
            if (self.proposals[pi].id === proposalId) { proposalIndex = pi; break; }
        }
        var seqPrefix = (self._currentSequenceName || "BRoll").replace(/[^a-zA-Z0-9_-]/g, "_");
        var clipName = seqPrefix + "_BRoll_" + String(proposalIndex + 1).padStart(2, "0");

        // Build request body
        var requestBody = {
            proposalId: proposalId,
            description: proposal.description,
            imageProvider: settings.imageProvider,
            endpointUrl: settings.imageEndpointUrl,
            apiKey: settings.imageProvider === "gemini_image" ? settings.imageGeminiApiKey : settings.imageFalApiKey,
            model: settings.imageFalModel,
            outputDir: outputDir,
            clipName: clipName
        };

        // Add img2img / reference parameters when reference image is available
        // Gemini handles consistency natively via inline image — no denoise parameter needed
        if (referenceImagePath) {
            requestBody.referenceImagePath = referenceImagePath;
            if (settings.imageProvider !== "gemini_image") {
                requestBody.denoise = denoise;
            }
        }

        self._post("/api/broll/generate-image", requestBody, function(err, result) {
            if (err) {
                // Remove the failed clip entry — don't leave error ghosts
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

        // Gemini: use previous image as reference for feedback (no denoise — Gemini handles consistency natively)
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
            // ComfyUI: Hero shot → txt2img; non-hero → img2img from hero with variable denoise
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
            // Hero shot: regenOptions stays null → txt2img
        }

        self.generateImage(clip.proposalId, onProgress, function(err, updatedClip) {
            clip.description = originalDesc;
            existing.description = savedDesc;
            callback(err, updatedClip);
        }, regenOptions);
    };

    // ── Place clip in timeline (PNG or MP4) ───────────────────────────────────

    BRoll.prototype.placeInTimeline = function(clipId, csInterface, callback) {
        var self = this;
        var clip = self._findClipById(clipId);
        if (!clip) return callback(new Error("Clip no encontrado: " + clipId));
        var version = clip.versions[clip.activeVersion];
        if (!version) return callback(new Error("No hay versión disponible para clip " + clipId));

        var filePath = version.videoPath || version.imagePath;
        console.log("[BRoll] placeInTimeline — clipId:", clipId, "filePath:", filePath, "exists:", fs ? fs.existsSync(filePath) : "no-fs");
        if (!filePath) {
            return callback(new Error("Sin ruta de archivo — regenera la imagen"));
        }
        if (!fs) {
            return callback(new Error("Módulo fs no disponible"));
        }
        if (!fs.existsSync(filePath)) {
            return callback(new Error("Archivo no existe: " + filePath));
        }

        var settings = self._settings;
        var trackIndex = settings.trackIndex === "auto" ? -1 : parseInt(settings.trackIndex, 10);
        var startSecs = self._timeToSeconds(clip.startTime);
        var endSecs = self._timeToSeconds(clip.endTime);
        var durationSecs = Math.max(1, endSecs - startSecs);

        var isVideo = filePath.toLowerCase().indexOf(".mp4") !== -1 || filePath.toLowerCase().indexOf(".mov") !== -1;
        // Build readable clip name: SeqName_BRoll_01_v1
        var proposalIndex = 0;
        for (var pi = 0; pi < self.proposals.length; pi++) {
            if (self.proposals[pi].id === clip.proposalId) { proposalIndex = pi; break; }
        }
        var seqPrefix = (self._currentSequenceName || "BRoll").replace(/[^a-zA-Z0-9_-]/g, "_");
        var clipNum = String(proposalIndex + 1);
        if (clipNum.length < 2) clipNum = "0" + clipNum;
        var clipName = seqPrefix + "_BRoll_" + clipNum + "_v" + (clip.activeVersion + 1) + (isVideo ? "" : "");

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

    // ── Animate a specific subset of clips sequentially ───────────────────────

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

    // ── Scene helpers ──────────────────────────────────────────────────────────

    /**
     * Get proposals grouped by scene. Returns [{sceneId, title, narrative, visualWorld, proposals[]}]
     * For legacy (non-scene) proposals, returns a single group with sceneId=null.
     */
    BRoll.prototype.getProposalsByScene = function() {
        var grouped = [];
        var sceneMap = {};

        for (var i = 0; i < this.proposals.length; i++) {
            var p = this.proposals[i];
            var sid = p.sceneId || null;
            if (!sceneMap[sid]) {
                var sceneInfo = sid ? this._findScene(sid) : null;
                sceneMap[sid] = {
                    sceneId: sid,
                    title: (sceneInfo && sceneInfo.title) || p.sceneTitle || "",
                    narrative: (sceneInfo && sceneInfo.narrative) || p.sceneNarrative || "",
                    visualWorld: (sceneInfo && sceneInfo.visualWorld) || p.visualWorld || "",
                    proposals: []
                };
                grouped.push(sceneMap[sid]);
            }
            sceneMap[sid].proposals.push(p);
        }

        return grouped;
    };

    /**
     * Get clips grouped by scene. Returns [{sceneId, title, clips[]}]
     */
    BRoll.prototype.getClipsByScene = function() {
        var grouped = [];
        var sceneMap = {};

        for (var i = 0; i < this.clips.length; i++) {
            var c = this.clips[i];
            var sid = c.sceneId || null;
            if (!sceneMap[sid]) {
                var sceneInfo = sid ? this._findScene(sid) : null;
                sceneMap[sid] = {
                    sceneId: sid,
                    title: (sceneInfo && sceneInfo.title) || "",
                    clips: []
                };
                grouped.push(sceneMap[sid]);
            }
            sceneMap[sid].clips.push(c);
        }

        return grouped;
    };

    /**
     * Find the Hero Shot clip for a scene — isHero:true, or lowest shotOrder as fallback.
     * Used as img2img reference for all non-hero shots in the scene.
     */
    BRoll.prototype._findHeroShotClip = function(sceneId) {
        if (!sceneId) return null;
        var fallback = null;
        for (var i = 0; i < this.clips.length; i++) {
            var c = this.clips[i];
            if (c.sceneId !== sceneId || c.status === "error") continue;
            if (c.isHero && c.versions.length > 0) return c;
            if (!fallback || (c.shotOrder && (!fallback.shotOrder || c.shotOrder < fallback.shotOrder))) {
                if (c.versions.length > 0) fallback = c;
            }
        }
        return fallback;
    };

    /**
     * @deprecated Hero Shot system replaced shot-type compatibility checks.
     * Kept for reference; no longer called in the active generation flow.
     */
    BRoll.prototype._findFirstShotClip = function(sceneId) {
        return this._findHeroShotClip(sceneId);
    };

    /** Check if proposals have scene-based structure */
    BRoll.prototype.hasScenes = function() {
        return this.scenes.length > 0 ||
            (this.proposals.length > 0 && !!this.proposals[0].sceneId);
    };

    // ── Helpers ────────────────────────────────────────────────────────────────

    BRoll.prototype.setOutputDir = function(dir) {
        this._settings.outputDir = dir;
    };

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

    /** @deprecated Replaced by Hero Shot system. Hero → txt2img; non-hero → img2img from hero. */
    BRoll.prototype._shouldUseImg2Img = function() { return false; };

    /** Maps shot type to Premiere label color index */
    BRoll.prototype._shotTypeToLabelColor = function(shotType) {
        if (!shotType) return 3;
        switch (String(shotType).toUpperCase()) {
            case "WIDE": return 4;  // Cerulean/blue
            case "MED":  return 5;  // Forest/green
            case "CU":   return 7;  // Mango/orange
            case "DET":  return 1;  // Iris/purple
            case "OTS":  return 8;  // Teal
            default:     return 3;  // Violet
        }
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
