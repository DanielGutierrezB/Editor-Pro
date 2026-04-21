/**
 * Motion-Pro — Motion Graphics Generator for Editor-Pro
 * Server lifecycle, proposals, generation pipeline, control panel, versioning
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

    var SERVER_PORT = 3847;
    var SERVER_URL = "http://localhost:" + SERVER_PORT;

    var MP_TYPES = {
        title:       { label: "Título",      color: "#818cf8" },
        callout:     { label: "Callout",     color: "#e879f9" },
        reveal:      { label: "Reveal",      color: "#c084fc" },
        icons:       { label: "Iconos",      color: "#a78bfa" },
        cards:       { label: "Cards",       color: "#2dd4bf" },
        diagram:     { label: "Diagrama",    color: "#f87171" },
        steps:       { label: "Pasos",       color: "#34d399" },
        chart:       { label: "Gráfico",     color: "#fb923c" },
        metrics:     { label: "Métricas",    color: "#f59e0b" },
        list:        { label: "Lista",       color: "#4ade80" },
        comparison:  { label: "Comparación", color: "#00d4ff" },
        beforeafter: { label: "Antes/Después", color: "#f472b6" },
        funnel:      { label: "Funnel",      color: "#a3e635" },
        timeline:    { label: "Timeline",    color: "#38bdf8" },
        ui:          { label: "UI",          color: "#94a3b8" },
    };

    function MotionPro() {
        this.proposals = [];
        this.motions = [];
        this.serverRunning = false;
        this.serverProcess = null;
        this.generating = false;
        this.analyzing = false;
    }

    // ─── Server Lifecycle ─────────────────────────────────────────

    MotionPro.prototype.checkServer = function(callback) {
        var self = this;
        if (!http) {
            self.serverRunning = false;
            if (callback) callback(false);
            return;
        }
        var req = http.get(SERVER_URL + "/api/status", function(res) {
            var data = "";
            res.on("data", function(chunk) { data += chunk; });
            res.on("end", function() {
                try {
                    var status = JSON.parse(data);
                    self.serverRunning = status.running === true;
                } catch(e) {
                    self.serverRunning = false;
                }
                if (callback) callback(self.serverRunning);
            });
        });
        req.on("error", function() {
            self.serverRunning = false;
            if (callback) callback(false);
        });
        req.setTimeout(3000, function() {
            req.abort();
            self.serverRunning = false;
            if (callback) callback(false);
        });
    };

    MotionPro.prototype.startServer = function(extensionPath, callback) {
        var self = this;

        self.checkServer(function(running) {
            if (running) {
                if (callback) callback(null, true);
                return;
            }
            if (!childProcess || !pathMod) {
                if (callback) callback(new Error("child_process no disponible"));
                return;
            }

            var serverDir = pathMod.join(extensionPath, "motion-server");
            var serverJs = pathMod.join(serverDir, "server.js");

            if (!fs || !fs.existsSync(serverJs)) {
                if (callback) callback(new Error("server.js no encontrado en " + serverDir));
                return;
            }

            var proc = childProcess.spawn("node", [serverJs], {
                cwd: serverDir,
                env: Object.assign({}, process.env, { MP_PORT: String(SERVER_PORT) }),
                detached: true,
                stdio: ["ignore", "pipe", "pipe"]
            });

            self.serverProcess = proc;
            proc.unref();

            var started = false;
            proc.stdout.on("data", function(data) {
                var msg = data.toString();
                if (!started && msg.indexOf("Running on") !== -1) {
                    started = true;
                    self.serverRunning = true;
                    if (callback) callback(null, true);
                }
            });

            proc.stderr.on("data", function(data) {
                console.warn("[motion-server stderr]", data.toString());
            });

            proc.on("close", function(code) {
                self.serverRunning = false;
                self.serverProcess = null;
                if (!started && callback) {
                    callback(new Error("Server exited with code " + code));
                }
            });

            setTimeout(function() {
                if (!started) {
                    self.checkServer(function(ok) {
                        if (ok) {
                            started = true;
                            self.serverRunning = true;
                            if (callback) callback(null, true);
                        } else if (callback) {
                            callback(new Error("Server did not start in time"));
                        }
                    });
                }
            }, 15000); // 15 seconds — first start can be slow
        });
    };

    MotionPro.prototype.stopServer = function() {
        if (this.serverProcess) {
            try { this.serverProcess.kill(); } catch(e) {}
            this.serverProcess = null;
        }
        this.serverRunning = false;
    };

    // ─── Health Check & Auto-Restart ──────────────────────────────

    /**
     * Check if motion-server is alive. If not, attempt to restart it.
     * Calls callback(true) if server is OK, callback(false) if unrecoverable.
     */
    MotionPro.prototype._healthCheckOrRestart = function(callback) {
        var self = this;
        self.checkServer(function(running) {
            if (running) return callback(true);

            console.warn("[Motion-Pro] Server not responding, attempting restart...");
            if (window.EPLogger) window.EPLogger.log("motion-pro", "health-restart", "Server not responding, restarting...");

            // Kill any zombie process
            if (self.serverProcess) {
                try { self.serverProcess.kill(); } catch(_e) {}
                self.serverProcess = null;
            }
            self.serverRunning = false;

            // Try to find extensionPath for startServer
            var extensionPath = "";
            try {
                // CEP extension path detection
                if (typeof CSInterface !== "undefined") {
                    var csInterface = new CSInterface();
                    extensionPath = csInterface.getSystemPath("extension");
                } else if (pathMod) {
                    extensionPath = pathMod.resolve(__dirname, "..");
                }
            } catch(_e) {
                if (pathMod) extensionPath = pathMod.resolve(__dirname, "..");
            }

            if (!extensionPath) {
                console.error("[Motion-Pro] Cannot determine extension path for restart");
                return callback(false);
            }

            self.startServer(extensionPath, function(err) {
                if (err) {
                    console.error("[Motion-Pro] Restart failed:", err.message);
                    if (window.EPLogger) window.EPLogger.error("motion-pro", "health-restart-fail", err.message);
                    return callback(false);
                }
                console.log("[Motion-Pro] Server restarted successfully");
                if (window.EPLogger) window.EPLogger.log("motion-pro", "health-restart-ok", "Server restarted");
                // Brief delay to let server stabilize
                setTimeout(function() { callback(true); }, 1000);
            });
        });
    };

    // ─── HTTP helpers ─────────────────────────────────────────────

    MotionPro.prototype._post = function(path, body, callback) {
        if (!http) {
            callback(new Error("HTTP not available"));
            return;
        }
        var data = JSON.stringify(body);
        var req = http.request({
            hostname: "localhost",
            port: SERVER_PORT,
            path: path,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(data)
            }
        }, function(res) {
            var chunks = "";
            res.on("data", function(c) { chunks += c; });
            res.on("end", function() {
                try {
                    callback(null, JSON.parse(chunks));
                } catch(e) {
                    callback(new Error("Parse error: " + chunks.substring(0, 200)));
                }
            });
        });
        req.on("error", function(err) { callback(err); });
        req.setTimeout(300000, function() { req.destroy(); callback(new Error("Request timeout 300s")); }); // 5 min timeout
        req.write(data);
        req.end();
    };

    MotionPro.prototype._get = function(path, callback) {
        if (!http) {
            callback(new Error("HTTP not available"));
            return;
        }
        var req = http.get(SERVER_URL + path, function(res) {
            var data = "";
            res.on("data", function(c) { data += c; });
            res.on("end", function() {
                try {
                    callback(null, JSON.parse(data));
                } catch(e) {
                    callback(new Error("Parse error"));
                }
            });
        });
        req.on("error", function(err) { callback(err); });
    };

    // ─── Generate + Render pipeline ───────────────────────────────

    // Configurable timeout for the generate→render pipeline (default 5 minutes)
    var MP_PIPELINE_TIMEOUT_MS = 7 * 60 * 1000; // 7 min per clip (includes health check + retry margin)
    try {
        var savedTimeout = localStorage.getItem("editorpro_mp_pipeline_timeout");
        if (savedTimeout) MP_PIPELINE_TIMEOUT_MS = parseInt(savedTimeout, 10) || MP_PIPELINE_TIMEOUT_MS;
    } catch(_e) {}

    MotionPro.prototype.generateMotion = function(proposal, transcriptSegment, aiConfig, callback, outputDir) {
        var self = this;
        var version = 1;
        var existingMotion = self._findMotion(proposal.id);
        if (existingMotion) {
            version = existingMotion.versions.length + 1;
        }

        var timedOut = false;
        var pipelineTimer = setTimeout(function() {
            timedOut = true;
            callback(new Error("Motion-Pro pipeline timeout (" + Math.round(MP_PIPELINE_TIMEOUT_MS / 1000) + "s) for " + proposal.id));
        }, MP_PIPELINE_TIMEOUT_MS);

        var body = {
            proposal: {
                id: proposal.id,
                type: proposal.type,
                description: proposal.description,
                startTime: proposal.startTime,
                endTime: proposal.endTime,
                version: version
            },
            transcriptSegment: transcriptSegment,
            provider: aiConfig.provider,
            model: aiConfig.model,
            apiKey: aiConfig.apiKey,
            sessionDir: outputDir || "",
            brandfetchKey: aiConfig.brandfetchKey || "",
            customPalette: self.customPalette || null
        };

        // Health check before starting the pipeline
        self._healthCheckOrRestart(function(healthOk) {
            if (!healthOk) {
                clearTimeout(pipelineTimer);
                return callback(new Error("Motion-Pro server not responding after restart attempt"));
            }

        self._post("/api/generate/template", body, function(err, result) {
            if (timedOut) return;
            if (err) { clearTimeout(pipelineTimer); return callback(err); }
            if (result.error) { clearTimeout(pipelineTimer); return callback(new Error(result.error)); }

            var renderBody = { compositionId: result.compositionId, sessionDir: outputDir || "" };
            if (outputDir) renderBody.outputDir = outputDir;

            // Health check before render (the server may have died during generate)
            self._healthCheckOrRestart(function(renderHealthOk) {
                if (!renderHealthOk) {
                    clearTimeout(pipelineTimer);
                    return callback(new Error("Motion-Pro server not responding before render"));
                }

            self._post("/api/render", renderBody, function(renderErr, renderResult) {
                if (timedOut) return;
                clearTimeout(pipelineTimer);
                if (renderErr) return callback(renderErr);
                if (renderResult.error) return callback(new Error(renderResult.error));

                var versionData = {
                    version: version,
                    compositionId: result.compositionId,
                    tsxPath: result.tsxPath,
                    mp4Path: renderResult.mp4Path,
                    mediaDurationSec: typeof renderResult.mediaDurationSec === "number" ? renderResult.mediaDurationSec : null,
                    status: "rendered",
                    feedback: "",
                    createdAt: new Date().toISOString()
                };

                if (existingMotion) {
                    existingMotion.versions.push(versionData);
                    existingMotion.activeVersion = version;
                } else {
                    var motion = {
                        id: proposal.id,
                        startTime: proposal.startTime,
                        endTime: proposal.endTime,
                        type: proposal.type,
                        description: proposal.description,
                        group: proposal.group || '',
                        baseTrackIndex: -1,
                        versions: [versionData],
                        activeVersion: version,
                        placedInTimeline: false
                    };
                    self.motions.push(motion);
                }

                callback(null, {
                    motionId: proposal.id,
                    version: version,
                    mp4Path: renderResult.mp4Path,
                    compositionId: result.compositionId
                });
            });
            }); // end _healthCheckOrRestart before render
        });
        }); // end _healthCheckOrRestart before pipeline
    };

    MotionPro.prototype.regenerateWithFeedback = function(motionId, feedback, aiConfig, callback, outputDir) {
        var self = this;
        var motion = self._findMotion(motionId);
        if (!motion) return callback(new Error("Motion not found: " + motionId));

        var currentVersion = motion.versions[motion.versions.length - 1];
        var newVersion = motion.versions.length + 1;

        var body = {
            compositionId: currentVersion.compositionId,
            feedback: feedback,
            provider: aiConfig.provider,
            model: aiConfig.model,
            apiKey: aiConfig.apiKey,
            newVersion: newVersion,
            outputDir: outputDir || "",
            sessionDir: outputDir || "",
            type: motion.type || "title",
            description: motion.description || ""
        };

        self._post("/api/feedback", body, function(err, result) {
            if (err) return callback(err);
            if (result.error) return callback(new Error(result.error));

            var renderBody = { compositionId: result.compositionId, sessionDir: outputDir || "" };
            if (outputDir) renderBody.outputDir = outputDir;

            self._post("/api/render", renderBody, function(renderErr, renderResult) {
                if (renderErr) return callback(renderErr);
                if (renderResult.error) return callback(new Error(renderResult.error));

                var versionData = {
                    version: newVersion,
                    compositionId: result.compositionId,
                    tsxPath: result.tsxPath,
                    mp4Path: renderResult.mp4Path,
                    mediaDurationSec: typeof renderResult.mediaDurationSec === "number" ? renderResult.mediaDurationSec : null,
                    status: "rendered",
                    feedback: feedback,
                    createdAt: new Date().toISOString()
                };

                motion.versions.push(versionData);
                motion.activeVersion = newVersion;

                callback(null, {
                    motionId: motionId,
                    version: newVersion,
                    mp4Path: renderResult.mp4Path,
                    compositionId: result.compositionId
                });
            });
        });
    };

    MotionPro.prototype.regenerateFull = function(motionId, transcriptSegment, aiConfig, callback, outputDir) {
        var motion = this._findMotion(motionId);
        if (!motion) return callback(new Error("Motion not found"));

        var proposal = {
            id: motion.id,
            type: motion.type,
            description: motion.description,
            startTime: motion.startTime,
            endTime: motion.endTime
        };

        this.generateMotion(proposal, transcriptSegment, aiConfig, callback, outputDir);
    };

    MotionPro.prototype.getStudioUrl = function(compositionId, callback) {
        this._get("/api/studio/url/" + compositionId, function(err, result) {
            if (err) return callback(err);
            callback(null, result.url || "http://localhost:3000");
        });
    };

    MotionPro.prototype.startStudio = function(callback, sessionDir) {
        var url = "/api/studio/start";
        if (sessionDir) url += "?sessionDir=" + encodeURIComponent(sessionDir);
        this._get(url, function(err, result) {
            if (err) return callback(err);
            callback(null, result);
        });
    };

    // ─── State helpers ────────────────────────────────────────────

    MotionPro.prototype._findMotion = function(id) {
        for (var i = 0; i < this.motions.length; i++) {
            if (this.motions[i].id === id) return this.motions[i];
        }
        return null;
    };

    MotionPro.prototype.getActiveVersion = function(motionId) {
        var m = this._findMotion(motionId);
        if (!m) return null;
        for (var i = 0; i < m.versions.length; i++) {
            if (m.versions[i].version === m.activeVersion) return m.versions[i];
        }
        return m.versions[m.versions.length - 1];
    };

    MotionPro.prototype.setActiveVersion = function(motionId, version) {
        var m = this._findMotion(motionId);
        if (m) m.activeVersion = version;
    };

    MotionPro.prototype.activeSession = "";

    MotionPro.prototype.saveState = function() {
        try {
            var key = this.activeSession ? "editorpro_mp_" + this.activeSession : "editorpro_motionpro_state";
            var data = {
                proposals: this.proposals,
                motions: this.motions,
                session: this.activeSession
            };
            localStorage.setItem(key, JSON.stringify(data));
        } catch(e) {}
    };

    MotionPro.prototype.loadState = function(sessionName) {
        if (sessionName) this.activeSession = sessionName;
        try {
            var key = this.activeSession ? "editorpro_mp_" + this.activeSession : "editorpro_motionpro_state";
            var raw = localStorage.getItem(key);
            if (raw) {
                var data = JSON.parse(raw);
                this.proposals = data.proposals || [];
                this.motions = data.motions || [];
            } else {
                this.proposals = [];
                this.motions = [];
            }
        } catch(e) {
            this.proposals = [];
            this.motions = [];
        }
    };

    MotionPro.prototype.switchSession = function(sessionName) {
        if (this.activeSession === sessionName) return false;
        this.saveState();
        this.activeSession = sessionName;
        this.loadState(sessionName);
        return true;
    };

    // ─── Exports ──────────────────────────────────────────────────

    MotionPro.TYPES = MP_TYPES;
    MotionPro.SERVER_PORT = SERVER_PORT;
    MotionPro.SERVER_URL = SERVER_URL;

    global.MotionPro = MotionPro;

})(window);
