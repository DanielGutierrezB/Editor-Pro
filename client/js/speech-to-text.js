/**
 * Speech-to-Text Module — Multi-Provider
 *
 * Supports:
 *   1. ElevenLabs Scribe API (cloud)
 *   2. Whisper Local (whisper.cpp)
 *   3. Whisper API (OpenAI cloud)
 *
 * All providers normalize output to the same format:
 *   { words[], text, language }
 */

(function(global) {
    "use strict";

    var https, fs, path, os, childProcess;
    try { https = require("https"); } catch(e) { https = null; }
    try { fs = require("fs"); } catch(e) { fs = null; }
    try { path = require("path"); } catch(e) { path = null; }
    try { os = require("os"); } catch(e) { os = null; }
    try { childProcess = require("child_process"); } catch(e) { childProcess = null; }

    var STT_PROVIDERS = {
        elevenlabs: {
            name: "ElevenLabs Scribe",
            description: "Transcripción cloud con timestamps por palabra",
            needsKey: true,
            keyPlaceholder: "xi-api-key...",
            local: false,
            models: [
                { id: "scribe_v1", label: "Scribe v1 (recomendado)" },
                { id: "scribe_v1_experimental", label: "Scribe v1 Experimental" }
            ],
            defaultModel: "scribe_v1"
        },
        whisper_local: {
            name: "Whisper Local",
            description: "whisper.cpp local — sin internet, rápido",
            needsKey: false,
            local: true,
            models: [
                { id: "auto", label: "Auto-detectar modelo" }
            ],
            defaultModel: "auto"
        },
        whisper_api: {
            name: "Whisper API (OpenAI)",
            description: "OpenAI Whisper cloud — requiere API key",
            needsKey: true,
            keyPlaceholder: "sk-...",
            local: false,
            models: [
                { id: "whisper-1", label: "Whisper-1" }
            ],
            defaultModel: "whisper-1"
        }
    };

    // ─── Constructor ─────────────────────────────────────────────

    function SpeechToText() {
        this.provider = "elevenlabs";
        this.keys = { elevenlabs: "", whisper_api: "" };
        this.model = "scribe_v1";
        this._pluginDir = "";
        this._activeRequest = null;
        this._aborted = false;
    }

    SpeechToText.PROVIDERS = STT_PROVIDERS;

    SpeechToText.prototype.setProvider = function(provider) {
        if (!STT_PROVIDERS[provider]) return;
        this.provider = provider;
        this.model = STT_PROVIDERS[provider].defaultModel;
    };

    SpeechToText.prototype.setApiKey = function(provider, key) {
        if (provider && this.keys.hasOwnProperty(provider)) {
            this.keys[provider] = (key || "").trim();
        }
    };

    SpeechToText.prototype.setModel = function(model) {
        this.model = model || STT_PROVIDERS[this.provider].defaultModel;
    };

    SpeechToText.prototype.setPluginDir = function(dir) {
        this._pluginDir = (dir || "").replace(/\/+$/, "");
    };

    SpeechToText.prototype.getActiveKey = function() {
        return this.keys[this.provider] || "";
    };

    SpeechToText.prototype.isConfigured = function() {
        switch (this.provider) {
            case "elevenlabs":
                return (this.keys.elevenlabs || "").length > 5;
            case "whisper_local":
                return this.getWhisperLocalStatus().ready;
            case "whisper_api":
                return (this.keys.whisper_api || "").length > 5;
            default:
                return false;
        }
    };

    SpeechToText.prototype.getProviderInfo = function() {
        return STT_PROVIDERS[this.provider];
    };

    SpeechToText.prototype.abort = function() {
        this._aborted = true;
        if (this._activeRequest) {
            try {
                if (typeof this._activeRequest.kill === "function") {
                    this._activeRequest.kill("SIGKILL");
                } else if (typeof this._activeRequest.destroy === "function") {
                    this._activeRequest.destroy();
                } else if (typeof this._activeRequest.abort === "function") {
                    this._activeRequest.abort();
                }
            } catch(e) {}
            this._activeRequest = null;
        }
    };

    // ─── Main Transcribe Entry Point ─────────────────────────────

    SpeechToText.prototype.transcribe = function(filePath, onProgress, callback) {
        if (!fs) {
            callback({ error: "Node.js no disponible (fs)." });
            return;
        }

        if (!fs.existsSync(filePath)) {
            callback({ error: "Archivo no encontrado: " + filePath });
            return;
        }

        this._aborted = false;
        this._activeRequest = null;

        switch (this.provider) {
            case "elevenlabs":
                this._transcribeElevenLabs(filePath, onProgress, callback);
                break;
            case "whisper_local":
                this._transcribeWhisperLocal(filePath, onProgress, callback);
                break;
            case "whisper_api":
                this._transcribeWhisperAPI(filePath, onProgress, callback);
                break;
            default:
                callback({ error: "Proveedor STT no reconocido: " + this.provider });
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // ElevenLabs Scribe API
    // ═══════════════════════════════════════════════════════════════

    SpeechToText.prototype._transcribeElevenLabs = function(filePath, onProgress, callback) {
        var key = this.keys.elevenlabs || "";
        if (!key || key.length < 5) {
            callback({ error: "API Key de ElevenLabs no configurada." });
            return;
        }
        if (!https) {
            callback({ error: "Node.js https no disponible." });
            return;
        }

        onProgress(5);

        var self = this;
        var fileSize = 0;
        try { fileSize = fs.statSync(filePath).size; } catch(_e) {}
        var LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB

        // For files larger than 100MB, use streaming upload
        if (fileSize > LARGE_FILE_THRESHOLD) {
            return this._transcribeElevenLabsStreaming(filePath, key, onProgress, callback);
        }

        var fileBuffer = fs.readFileSync(filePath);
        var fileName = path ? path.basename(filePath) : "audio.wav";
        var ext = path ? path.extname(filePath).toLowerCase() : ".wav";

        var mimeTypes = {
            ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
            ".aac": "audio/aac", ".ogg": "audio/ogg", ".flac": "audio/flac",
            ".webm": "audio/webm", ".mp4": "video/mp4"
        };
        var contentType = mimeTypes[ext] || "application/octet-stream";

        var boundary = "----EduProBoundary" + Date.now();
        var parts = [];

        parts.push("--" + boundary + "\r\n");
        parts.push('Content-Disposition: form-data; name="model_id"\r\n\r\n');
        parts.push((self.model || "scribe_v1") + "\r\n");

        parts.push("--" + boundary + "\r\n");
        parts.push('Content-Disposition: form-data; name="language_code"\r\n\r\n');
        parts.push("es\r\n");

        parts.push("--" + boundary + "\r\n");
        parts.push('Content-Disposition: form-data; name="tag_audio_events"\r\n\r\n');
        parts.push("false\r\n");

        parts.push("--" + boundary + "\r\n");
        parts.push('Content-Disposition: form-data; name="file"; filename="' + fileName + '"\r\n');
        parts.push("Content-Type: " + contentType + "\r\n\r\n");

        var footer = "\r\n--" + boundary + "--\r\n";
        var headerBuffer = Buffer.from(parts.join(""), "utf8");
        var footerBuffer = Buffer.from(footer, "utf8");
        var totalLength = headerBuffer.length + fileBuffer.length + footerBuffer.length;

        onProgress(10);

        var opts = {
            hostname: "api.elevenlabs.io", port: 443,
            path: "/v1/speech-to-text", method: "POST",
            headers: {
                "xi-api-key": key,
                "Content-Type": "multipart/form-data; boundary=" + boundary,
                "Content-Length": totalLength
            }
        };

        var req = https.request(opts, function(res) {
            var data = "";
            res.on("data", function(chunk) {
                if (self._aborted) return;
                data += chunk;
                onProgress(50 + Math.min(40, Math.round((data.length / 1000) * 2)));
            });
            res.on("end", function() {
                self._activeRequest = null;
                if (self._aborted) { callback({ error: "Transcripción cancelada." }); return; }
                onProgress(95);
                try {
                    var result = JSON.parse(data);
                    if (result.detail || result.error) {
                        callback({ error: "ElevenLabs: " + (result.detail || result.error || JSON.stringify(result)) });
                        return;
                    }

                    var words = (result.words || []).map(function(w) {
                        return { text: w.text || "", start: w.start || 0, end: w.end || 0, type: w.type || "word" };
                    });

                    var fullText = result.text || words.map(function(w) {
                        return w.type === "word" ? w.text : "";
                    }).join(" ").replace(/\s+/g, " ").trim();

                    onProgress(100);
                    callback({ words: words, text: fullText, language: result.language_code || "es" });
                } catch(e) {
                    callback({ error: "Error al procesar respuesta STT: " + e.message });
                }
            });
        });

        req.on("error", function(e) {
            self._activeRequest = null;
            if (self._aborted) { callback({ error: "Transcripción cancelada." }); return; }
            callback({ error: "Error de conexión con ElevenLabs: " + e.message });
        });

        this._activeRequest = req;

        req.write(headerBuffer);

        var chunkSize = 64 * 1024;
        var written = 0;
        var fileLen = fileBuffer.length;

        function writeChunk() {
            if (written >= fileLen) {
                req.write(footerBuffer);
                req.end();
                onProgress(40);
                return;
            }
            var end = Math.min(written + chunkSize, fileLen);
            req.write(fileBuffer.slice(written, end));
            written = end;
            onProgress(10 + Math.round((written / fileLen) * 30));
            setImmediate(writeChunk);
        }
        writeChunk();
    };

    // ── ElevenLabs Streaming Upload (for files > 100MB) ────────────

    SpeechToText.prototype._transcribeElevenLabsStreaming = function(filePath, key, onProgress, callback) {
        var self = this;
        var fileName = path ? path.basename(filePath) : "audio.wav";
        var ext = path ? path.extname(filePath).toLowerCase() : ".wav";

        var mimeTypes = {
            ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
            ".aac": "audio/aac", ".ogg": "audio/ogg", ".flac": "audio/flac",
            ".webm": "audio/webm", ".mp4": "video/mp4"
        };
        var contentType = mimeTypes[ext] || "application/octet-stream";

        var boundary = "----EduProBoundary" + Date.now();
        var parts = [];
        parts.push("--" + boundary + "\r\n");
        parts.push('Content-Disposition: form-data; name="model_id"\r\n\r\n');
        parts.push((self.model || "scribe_v1") + "\r\n");
        parts.push("--" + boundary + "\r\n");
        parts.push('Content-Disposition: form-data; name="language_code"\r\n\r\nes\r\n');
        parts.push("--" + boundary + "\r\n");
        parts.push('Content-Disposition: form-data; name="tag_audio_events"\r\n\r\nfalse\r\n');
        parts.push("--" + boundary + "\r\n");
        parts.push('Content-Disposition: form-data; name="file"; filename="' + fileName + '"\r\n');
        parts.push("Content-Type: " + contentType + "\r\n\r\n");

        var footer = "\r\n--" + boundary + "--\r\n";
        var headerBuffer = Buffer.from(parts.join(""), "utf8");
        var footerBuffer = Buffer.from(footer, "utf8");

        var fileStats = fs.statSync(filePath);
        var totalLength = headerBuffer.length + fileStats.size + footerBuffer.length;

        onProgress(10);

        var opts = {
            hostname: "api.elevenlabs.io", port: 443,
            path: "/v1/speech-to-text", method: "POST",
            headers: {
                "xi-api-key": key,
                "Content-Type": "multipart/form-data; boundary=" + boundary,
                "Content-Length": totalLength
            }
        };

        var req = https.request(opts, function(res) {
            var data = "";
            res.on("data", function(chunk) {
                if (self._aborted) return;
                data += chunk;
                onProgress(50 + Math.min(40, Math.round((data.length / 1000) * 2)));
            });
            res.on("end", function() {
                self._activeRequest = null;
                if (self._aborted) { callback({ error: "Transcripción cancelada." }); return; }
                onProgress(95);
                try {
                    var result = JSON.parse(data);
                    if (result.detail || result.error) {
                        callback({ error: "ElevenLabs: " + (result.detail || result.error || JSON.stringify(result)) });
                        return;
                    }
                    var words = (result.words || []).map(function(w) {
                        return { text: w.text || "", start: w.start || 0, end: w.end || 0, type: w.type || "word" };
                    });
                    var fullText = result.text || words.map(function(w) {
                        return w.type === "word" ? w.text : "";
                    }).join(" ").replace(/\s+/g, " ").trim();
                    onProgress(100);
                    callback({ words: words, text: fullText, language: result.language_code || "es" });
                } catch(e) {
                    callback({ error: "Error al procesar respuesta STT: " + e.message });
                }
            });
        });

        req.on("error", function(e) {
            self._activeRequest = null;
            if (self._aborted) { callback({ error: "Transcripción cancelada." }); return; }
            callback({ error: "Error de conexión con ElevenLabs: " + e.message });
        });

        self._activeRequest = req;

        // Write header
        req.write(headerBuffer);

        // Stream file in chunks using createReadStream
        var fileStream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
        var bytesRead = 0;
        var fileLen = fileStats.size;

        fileStream.on("data", function(chunk) {
            if (self._aborted) { fileStream.destroy(); req.destroy(); return; }
            req.write(chunk);
            bytesRead += chunk.length;
            onProgress(10 + Math.round((bytesRead / fileLen) * 30));
        });

        fileStream.on("end", function() {
            req.write(footerBuffer);
            req.end();
            onProgress(40);
        });

        fileStream.on("error", function(e) {
            self._activeRequest = null;
            callback({ error: "Error leyendo archivo: " + e.message });
        });
    };

    // ═══════════════════════════════════════════════════════════════
    // Whisper Local (whisper.cpp)
    // ═══════════════════════════════════════════════════════════════

    SpeechToText.prototype._findWhisperBinary = function() {
        if (!fs) return { binary: null };

        var candidates = [];
        if (this._pluginDir) {
            candidates.push(this._pluginDir + "/whisper/whisper-cli");
            candidates.push(this._pluginDir + "/whisper/main");
        }
        candidates.push("/opt/homebrew/bin/whisper-cli");
        candidates.push("/usr/local/bin/whisper-cli");
        // Windows common locations
        if (process && process.env && process.env.LOCALAPPDATA) {
            candidates.push(process.env.LOCALAPPDATA + "\\whisper-cli\\whisper-cli.exe");
        }
        if (process && process.env && process.env.ProgramFiles) {
            candidates.push(process.env.ProgramFiles + "\\whisper-cli\\whisper-cli.exe");
        }

        for (var i = 0; i < candidates.length; i++) {
            try { if (fs.existsSync(candidates[i])) return { binary: candidates[i] }; } catch(e) {}
        }

        if (childProcess) {
            try {
                // Use 'which' on Mac/Linux, 'where' on Windows
                var whichCmd = (process && process.platform === 'win32') ? 'where whisper-cli 2>NUL' : 'which whisper-cli 2>/dev/null';
                var found = childProcess.execSync(whichCmd, { encoding: "utf8" }).trim();
                if (found) {
                    // 'where' on Windows may return multiple lines
                    found = found.split(/\r?\n/)[0];
                    return { binary: found };
                }
            } catch(e) {}
        }

        return { binary: null };
    };

    SpeechToText.prototype._findWhisperModel = function() {
        if (!fs) return null;

        // Order: best quality first (Large v3 → … → base → tiny)
        var candidates = [];
        var home = (typeof process !== "undefined" && process.env) ? (process.env.HOME || "") : "";

        if (this._pluginDir) {
            candidates.push(this._pluginDir + "/whisper/ggml-large-v3.bin");
            candidates.push(this._pluginDir + "/whisper/ggml-large-v3-q5_0.bin");
            candidates.push(this._pluginDir + "/whisper/ggml-large-v2.bin");
            candidates.push(this._pluginDir + "/whisper/ggml-medium.bin");
            candidates.push(this._pluginDir + "/whisper/ggml-small.bin");
            candidates.push(this._pluginDir + "/whisper/ggml-base.bin");
            candidates.push(this._pluginDir + "/whisper/ggml-tiny.bin");
        }
        if (home) {
            candidates.push(home + "/.cache/whisper/ggml-large-v3.bin");
            candidates.push(home + "/.cache/whisper/ggml-large-v3-q5_0.bin");
            candidates.push(home + "/.cache/whisper/ggml-large-v2.bin");
            candidates.push(home + "/.cache/whisper/ggml-medium.bin");
            candidates.push(home + "/.cache/whisper/ggml-small.bin");
            candidates.push(home + "/.cache/whisper/ggml-base.bin");
            candidates.push(home + "/.cache/whisper/ggml-tiny.bin");
        }

        for (var i = 0; i < candidates.length; i++) {
            try { if (fs.existsSync(candidates[i])) return candidates[i]; } catch(e) {}
        }
        return null;
    };

    SpeechToText.prototype.getWhisperLocalStatus = function() {
        var binary = this._findWhisperBinary();
        var model = this._findWhisperModel();
        var modelName = "";
        if (model) {
            var parts = model.replace(/\\/g, "/").split("/");
            modelName = parts[parts.length - 1] || "";
        }
        return {
            binaryFound: !!binary.binary,
            binaryPath: binary.binary || null,
            modelFound: !!model,
            modelPath: model || null,
            modelName: modelName,
            ready: !!binary.binary && !!model
        };
    };

    SpeechToText.prototype._ensureAccessiblePath = function(filePath) {
        if (!fs) return filePath;
        // macOS TemporaryItems and certain sandbox-protected dirs can't be read by child processes;
        // copy the file to /tmp/ which is universally accessible
        if (filePath.indexOf("TemporaryItems") !== -1 || filePath.indexOf("/private/var/folders") !== -1) {
            var baseName = filePath.replace(/\\/g, "/").split("/").pop();
            var safePath = path ? path.join((os ? os.tmpdir() : '/tmp'), 'CDEduPro_' + baseName) : ('/tmp/CDEduPro_' + baseName);
            try {
                fs.copyFileSync(filePath, safePath);
                return safePath;
            } catch(e) {
                return filePath;
            }
        }
        return filePath;
    };

    SpeechToText.prototype._transcribeWhisperLocal = function(filePath, onProgress, callback) {
        if (!childProcess) {
            callback({ error: "child_process no disponible." });
            return;
        }

        var binaryInfo = this._findWhisperBinary();
        if (!binaryInfo.binary) {
            callback({ error: "whisper-cli no encontrado. Ejecuta whisper/setup-whisper.sh para instalar." });
            return;
        }

        var modelPath = this._findWhisperModel();
        if (!modelPath) {
            callback({ error: "Modelo Whisper no encontrado. Ejecuta whisper/setup-whisper.sh para descargar." });
            return;
        }

        var threads = 4;
        if (os && os.cpus) {
            try { threads = Math.max(1, Math.min(os.cpus().length - 1, 8)); } catch(e) {}
        }

        onProgress(5);

        var safeFilePath = this._ensureAccessiblePath(filePath);
        onProgress(10);

        var jsonOutPath = safeFilePath + ".json";
        var args = ["-m", modelPath, "-f", safeFilePath, "-l", "es", "-t", String(threads), "-oj", "-pp"];
        var stderrBuf = "";
        var finished = false;
        var child = childProcess.spawn(binaryInfo.binary, args);
        this._activeRequest = child;

        // Watchdog: kill process if no stderr activity for 120 seconds (likely stuck)
        var lastActivity = Date.now();
        var watchdog = setInterval(function() {
            if (finished) { clearInterval(watchdog); return; }
            if (Date.now() - lastActivity > 120000) {
                clearInterval(watchdog);
                try { child.kill("SIGKILL"); } catch(e) {}
                callback({ error: "whisper.cpp no respondió en 2 minutos. El archivo puede estar en una ruta protegida o corrupto." });
            }
        }, 10000);

        child.stderr.on("data", function(chunk) {
            lastActivity = Date.now();
            stderrBuf += chunk.toString();
            var matches = stderrBuf.match(/progress\s*=\s*(\d+)\s*%/g);
            if (matches && matches.length > 0) {
                var last = matches[matches.length - 1];
                var pctMatch = last.match(/(\d+)\s*%/);
                if (pctMatch) {
                    onProgress(10 + Math.round(parseInt(pctMatch[1]) * 0.85));
                }
            }
        });

        child.stdout.on("data", function() { lastActivity = Date.now(); });

        var self = this;
        child.on("close", function(code) {
            finished = true;
            self._activeRequest = null;
            clearInterval(watchdog);
            if (self._aborted) {
                if (safeFilePath !== filePath) { try { fs.unlinkSync(safeFilePath); } catch(e) {} }
                callback({ error: "Transcripción cancelada." });
                return;
            }
            if (code !== 0) {
                if (safeFilePath !== filePath) { try { fs.unlinkSync(safeFilePath); } catch(e) {} }
                callback({ error: "whisper.cpp terminó con código " + code + ". Revisa que el archivo de audio sea válido." });
                return;
            }

            try {
                var jsonContent = fs.readFileSync(jsonOutPath, "utf8");
                var data = JSON.parse(jsonContent);
                try { fs.unlinkSync(jsonOutPath); } catch(e) {}
                // Clean up safe copy if we made one
                if (safeFilePath !== filePath) {
                    try { fs.unlinkSync(safeFilePath); } catch(e) {}
                }

                var segments = data.transcription || [];
                var words = [];
                var fullTextParts = [];

                for (var i = 0; i < segments.length; i++) {
                    var seg = segments[i];
                    var startMs = (seg.offsets && typeof seg.offsets.from === "number") ? seg.offsets.from : 0;
                    var endMs = (seg.offsets && typeof seg.offsets.to === "number") ? seg.offsets.to : 0;
                    var text = (seg.text || "").trim();

                    // Whisper segments → split into pseudo-words with estimated timing
                    var segWords = text.split(/\s+/);
                    var segDuration = (endMs - startMs) / 1000;
                    var wordDuration = segWords.length > 0 ? segDuration / segWords.length : 0;

                    for (var w = 0; w < segWords.length; w++) {
                        if (!segWords[w]) continue;
                        var wStart = (startMs / 1000) + (w * wordDuration);
                        var wEnd = wStart + wordDuration;
                        words.push({
                            text: segWords[w],
                            start: wStart,
                            end: wEnd,
                            type: "word"
                        });
                    }

                    fullTextParts.push(text);
                }

                onProgress(100);
                callback({
                    words: words,
                    text: fullTextParts.join(" "),
                    language: "es"
                });
            } catch(e) {
                callback({ error: "Error al leer resultado de whisper.cpp: " + e.message });
            }
        });

        child.on("error", function(err) {
            finished = true;
            clearInterval(watchdog);
            if (safeFilePath !== filePath) { try { fs.unlinkSync(safeFilePath); } catch(e) {} }
            callback({ error: "Error al ejecutar whisper.cpp: " + err.message });
        });
    };

    // ═══════════════════════════════════════════════════════════════
    // Whisper API (OpenAI)
    // ═══════════════════════════════════════════════════════════════

    SpeechToText.prototype._transcribeWhisperAPI = function(filePath, onProgress, callback) {
        var key = this.keys.whisper_api || "";
        if (!key || key.length < 5) {
            callback({ error: "API Key de OpenAI no configurada para Whisper." });
            return;
        }
        if (!https) {
            callback({ error: "Node.js https no disponible." });
            return;
        }

        onProgress(5);

        var fileBuffer = fs.readFileSync(filePath);
        var fileName = path ? path.basename(filePath) : "audio.wav";
        var fileSizeMB = fileBuffer.length / (1024 * 1024);

        if (fileSizeMB > 25) {
            callback({ error: "Archivo excede 25MB (" + fileSizeMB.toFixed(1) + "MB). Whisper API tiene límite de 25MB." });
            return;
        }

        onProgress(10);

        var boundary = "----WhisperBoundary" + Date.now();

        var preamble = "--" + boundary + "\r\n" +
            'Content-Disposition: form-data; name="file"; filename="' + fileName + '"\r\n' +
            "Content-Type: audio/wav\r\n\r\n";

        var fields = "\r\n--" + boundary + "\r\n" +
            'Content-Disposition: form-data; name="model"\r\n\r\nwhisper-1' +
            "\r\n--" + boundary + "\r\n" +
            'Content-Disposition: form-data; name="language"\r\n\r\nes' +
            "\r\n--" + boundary + "\r\n" +
            'Content-Disposition: form-data; name="response_format"\r\n\r\nverbose_json' +
            "\r\n--" + boundary + "\r\n" +
            'Content-Disposition: form-data; name="timestamp_granularities[]"\r\n\r\nword' +
            "\r\n--" + boundary + "--\r\n";

        var preambleBuf = Buffer.from(preamble, "utf8");
        var fieldsBuf = Buffer.from(fields, "utf8");
        var bodyBuffer = Buffer.concat([preambleBuf, fileBuffer, fieldsBuf]);

        var opts = {
            hostname: "api.openai.com", port: 443,
            path: "/v1/audio/transcriptions", method: "POST",
            headers: {
                "Authorization": "Bearer " + key,
                "Content-Type": "multipart/form-data; boundary=" + boundary,
                "Content-Length": bodyBuffer.length
            }
        };

        onProgress(30);

        var self = this;
        var req = https.request(opts, function(res) {
            var data = "";
            res.on("data", function(chunk) { data += chunk; });
            res.on("end", function() {
                self._activeRequest = null;
                if (self._aborted) { callback({ error: "Transcripción cancelada." }); return; }
                onProgress(90);
                try {
                    var resp = JSON.parse(data);
                    if (resp.error) {
                        callback({ error: "Whisper API: " + (resp.error.message || JSON.stringify(resp.error)) });
                        return;
                    }

                    var words = [];
                    if (resp.words && resp.words.length > 0) {
                        words = resp.words.map(function(w) {
                            return { text: w.word || w.text || "", start: w.start || 0, end: w.end || 0, type: "word" };
                        });
                    } else if (resp.segments && resp.segments.length > 0) {
                        resp.segments.forEach(function(seg) {
                            var segWords = (seg.text || "").trim().split(/\s+/);
                            var segDur = (seg.end - seg.start);
                            var wordDur = segWords.length > 0 ? segDur / segWords.length : 0;
                            for (var w = 0; w < segWords.length; w++) {
                                if (!segWords[w]) continue;
                                words.push({
                                    text: segWords[w],
                                    start: seg.start + (w * wordDur),
                                    end: seg.start + ((w + 1) * wordDur),
                                    type: "word"
                                });
                            }
                        });
                    }

                    onProgress(100);
                    callback({
                        words: words,
                        text: resp.text || "",
                        language: resp.language || "es"
                    });
                } catch(e) {
                    callback({ error: "Error al parsear respuesta Whisper API: " + e.message });
                }
            });
        });

        req.on("error", function(e) {
            self._activeRequest = null;
            if (self._aborted) { callback({ error: "Transcripción cancelada." }); return; }
            callback({ error: "Error de conexión con Whisper API: " + e.message });
        });

        this._activeRequest = req;
        req.write(bodyBuffer);
        req.end();
    };

    // ─── Verify Keys ─────────────────────────────────────────────

    SpeechToText.prototype.verifyKey = function(callback) {
        switch (this.provider) {
            case "elevenlabs":
                this._verifyElevenLabsKey(callback);
                break;
            case "whisper_local":
                var status = this.getWhisperLocalStatus();
                callback({ valid: status.ready, status: status });
                break;
            case "whisper_api":
                this._verifyOpenAIKey(callback);
                break;
            default:
                callback({ valid: false, error: "Proveedor desconocido" });
        }
    };

    SpeechToText.prototype._verifyElevenLabsKey = function(callback) {
        var key = this.keys.elevenlabs || "";
        if (!key || key.length < 5) { callback({ valid: false, error: "Key vacía" }); return; }

        if (https) {
            var req = https.request({
                hostname: "api.elevenlabs.io", port: 443, path: "/v1/user", method: "GET",
                headers: { "xi-api-key": key }
            }, function(res) {
                var statusCode = res.statusCode;
                var data = "";
                res.on("data", function(chunk) { data += chunk; });
                res.on("end", function() {
                    if (statusCode === 200) {
                        callback({ valid: true });
                        return;
                    }
                    if (statusCode === 403) {
                        // Key is recognized but lacks user_read scope — still valid for STT
                        callback({ valid: true });
                        return;
                    }
                    try {
                        var result = JSON.parse(data);
                        var msg = result.detail || result.message || result.error || "HTTP " + statusCode;
                        if (typeof msg === "object") msg = JSON.stringify(msg);
                        callback({ valid: false, error: msg });
                    } catch(e) {
                        callback({ valid: false, error: "HTTP " + statusCode });
                    }
                });
            });
            req.on("error", function(e) { callback({ valid: false, error: "Conexión: " + e.message }); });
            req.end();
        } else {
            callback({ valid: false, error: "https no disponible" });
        }
    };

    SpeechToText.prototype._verifyOpenAIKey = function(callback) {
        var key = this.keys.whisper_api || "";
        if (!key || key.length < 5) { callback({ valid: false, error: "Key vacía" }); return; }

        if (https) {
            var req = https.request({
                hostname: "api.openai.com", port: 443, path: "/v1/models", method: "GET",
                headers: { "Authorization": "Bearer " + key }
            }, function(res) {
                var data = "";
                res.on("data", function(chunk) { data += chunk; });
                res.on("end", function() {
                    try {
                        var result = JSON.parse(data);
                        callback({ valid: !result.error });
                    } catch(e) { callback({ valid: false, error: "Respuesta inválida" }); }
                });
            });
            req.on("error", function(e) { callback({ valid: false, error: e.message }); });
            req.end();
        } else {
            callback({ valid: false, error: "https no disponible" });
        }
    };

    // ─── SRT Generation (word-by-word) ─────────────────────────

    function formatSrtTime(seconds) {
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = Math.floor(seconds % 60);
        var ms = Math.round((seconds - Math.floor(seconds)) * 1000);
        return pad2(h) + ":" + pad2(m) + ":" + pad2(s) + "," + pad3(ms);
    }

    function pad2(n) { return n < 10 ? "0" + n : String(n); }
    function pad3(n) { return n < 10 ? "00" + n : n < 100 ? "0" + n : String(n); }

    /**
     * Generate a word-by-word SRT from transcription result.
     * Each subtitle entry is a small group of words (configurable).
     */
    SpeechToText.prototype.generateSRT = function(result, wordsPerLine) {
        if (!result || !result.words || result.words.length === 0) return "";

        wordsPerLine = wordsPerLine || 5;
        var words = result.words.filter(function(w) { return w.type === "word" && w.text; });
        if (words.length === 0) return "";

        var lines = [];
        var idx = 1;

        for (var i = 0; i < words.length; i += wordsPerLine) {
            var chunk = words.slice(i, Math.min(i + wordsPerLine, words.length));
            var startTime = chunk[0].start;
            var endTime = chunk[chunk.length - 1].end;
            var text = chunk.map(function(w) { return w.text; }).join(" ");

            lines.push(String(idx));
            lines.push(formatSrtTime(startTime) + " --> " + formatSrtTime(endTime));
            lines.push(text);
            lines.push("");
            idx++;
        }

        return lines.join("\n");
    };

    /**
     * Generate a single-word-per-line SRT for maximum precision.
     */
    SpeechToText.prototype.generateWordSRT = function(result) {
        if (!result || !result.words || result.words.length === 0) return "";

        var words = result.words.filter(function(w) { return w.type === "word" && w.text; });
        if (words.length === 0) return "";

        var lines = [];
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            lines.push(String(i + 1));
            lines.push(formatSrtTime(w.start) + " --> " + formatSrtTime(w.end));
            lines.push(w.text);
            lines.push("");
        }

        return lines.join("\n");
    };

    /**
     * Save a single SRT file (one-line subtitles, grouped by wordsPerLine) to a folder.
     * Returns { path } or { error }.
     */
    SpeechToText.prototype.saveSRT = function(result, outputFolder, baseName, wordsPerLine) {
        if (!fs) return { error: "fs no disponible" };
        if (!result || !result.words || result.words.length === 0) return { error: "Sin datos de transcripción" };

        var safeName = (baseName || "transcription").replace(/[^a-zA-Z0-9_\-\. áéíóúñÁÉÍÓÚÑ]/g, "_");
        var paths = {};

        try {
            var srtContent = this.generateSRT(result, wordsPerLine || 8);
            var srtPath = path ? path.join(outputFolder, safeName + ".srt") : (outputFolder + "/" + safeName + ".srt");
            fs.writeFileSync(srtPath, srtContent, "utf8");
            paths.path = srtPath;
        } catch(e) {
            paths.error = e.message;
        }

        return paths;
    };

    global.SpeechToText = SpeechToText;

})(window);
