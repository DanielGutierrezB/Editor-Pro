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
            description: "Local — MLX (Apple Silicon), whisper.cpp o Whisper Python. Sin internet, rápido",
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

    /**
     * Entorno para los procesos hijos de transcripción. CRÍTICO: Premiere lanza
     * el panel con un PATH mínimo (/usr/bin:/bin), y whisper (mlx/python) invoca
     * `ffmpeg` internamente para decodificar el audio. Sin ffmpeg en el PATH,
     * mlx_whisper atrapa el fallo, imprime "Skipping..." y sale con código 0 SIN
     * escribir el JSON → luego falla al leerlo (ENOENT). Aquí garantizamos que
     * las rutas de Homebrew/local estén en el PATH del hijo.
     */
    SpeechToText.prototype._childEnv = function() {
        var env = {};
        try { for (var k in process.env) env[k] = process.env[k]; } catch(e) {}
        var extra = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];
        var parts = (env.PATH || "").split(":").filter(function(p) { return p; });
        for (var i = 0; i < extra.length; i++) {
            if (parts.indexOf(extra[i]) === -1) parts.push(extra[i]);
        }
        env.PATH = parts.join(":");
        return env;
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

    var WHISPER_BIN_KEY = "editorpro_whisper_binary";
    var WHISPER_MODEL_KEY = "editorpro_whisper_model";

    function _lsGet(key) {
        try { return (typeof localStorage !== "undefined") ? localStorage.getItem(key) : null; } catch(e) { return null; }
    }

    SpeechToText.prototype._findWhisperBinary = function() {
        if (!fs) return { binary: null };

        // Override manual desde Ajustes
        var manual = _lsGet(WHISPER_BIN_KEY);
        if (manual) {
            try { if (fs.existsSync(manual)) return { binary: manual, manual: true }; } catch(e) {}
        }

        var candidates = [];
        if (this._pluginDir) {
            candidates.push(this._pluginDir + "/whisper/whisper-cli");
            candidates.push(this._pluginDir + "/whisper/main");
        }
        // Homebrew instala el binario como whisper-cli o whisper-cpp según versión
        candidates.push("/opt/homebrew/bin/whisper-cli");
        candidates.push("/opt/homebrew/bin/whisper-cpp");
        candidates.push("/usr/local/bin/whisper-cli");
        candidates.push("/usr/local/bin/whisper-cpp");
        // Builds locales típicos de whisper.cpp
        var home = (typeof process !== "undefined" && process.env) ? (process.env.HOME || "") : "";
        if (home) {
            candidates.push(home + "/whisper.cpp/build/bin/whisper-cli");
            candidates.push(home + "/whisper.cpp/main");
        }
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
            var names = ["whisper-cli", "whisper-cpp"];
            for (var n = 0; n < names.length; n++) {
                try {
                    var whichCmd = (process && process.platform === 'win32') ? ('where ' + names[n] + ' 2>NUL') : ('which ' + names[n] + ' 2>/dev/null');
                    var found = childProcess.execSync(whichCmd, { encoding: "utf8" }).trim();
                    if (found) return { binary: found.split(/\r?\n/)[0] };
                } catch(e) {}
            }
        }

        return { binary: null };
    };

    // Prioridad de modelos por calidad (mayor score = mejor)
    function _whisperModelScore(name) {
        var n = name.toLowerCase();
        if (n.indexOf("large-v3-turbo") !== -1 || n.indexOf("large_v3_turbo") !== -1) return 90;
        if (n.indexOf("large-v3") !== -1 || n.indexOf("large_v3") !== -1) return 100;
        if (n.indexOf("large-v2") !== -1 || n.indexOf("large_v2") !== -1) return 80;
        if (n.indexOf("large") !== -1) return 75;
        if (n.indexOf("turbo") !== -1) return 70;
        if (n.indexOf("medium") !== -1) return 60;
        if (n.indexOf("small") !== -1) return 40;
        if (n.indexOf("base") !== -1) return 20;
        if (n.indexOf("tiny") !== -1) return 10;
        return 30;
    }

    function _isGgmlModelFile(name) {
        var n = name.toLowerCase();
        if (!(/\.(bin|gguf)$/.test(n))) return false;
        // Evitar binarios que no son modelos (p.ej. .bin genéricos pequeños se filtran por score>0 igual)
        return n.indexOf("ggml") !== -1 || n.indexOf("gguf") !== -1 || n.indexOf("whisper") !== -1 ||
               n.indexOf("large") !== -1 || n.indexOf("medium") !== -1 || n.indexOf("small") !== -1 ||
               n.indexOf("base") !== -1 || n.indexOf("tiny") !== -1 || n.indexOf("turbo") !== -1;
    }

    SpeechToText.prototype._whisperModelDirs = function() {
        var home = (typeof process !== "undefined" && process.env) ? (process.env.HOME || "") : "";
        var dirs = [];
        if (this._pluginDir) dirs.push(this._pluginDir + "/whisper");
        if (home) {
            dirs.push(home + "/.cache/whisper");
            dirs.push(home + "/.whisper");
            dirs.push(home + "/models");
            dirs.push(home + "/whisper.cpp/models");
            dirs.push(home + "/Library/Application Support/MacWhisper/models");
            dirs.push(home + "/Library/Application Support/com.goodsnooze.MacWhisper/models");
        }
        dirs.push("/opt/homebrew/share/whisper.cpp");
        dirs.push("/opt/homebrew/share/whisper-cpp");
        dirs.push("/usr/local/share/whisper.cpp");
        dirs.push("/usr/local/share/whisper-cpp");
        return dirs;
    };

    /**
     * Busca el mejor modelo ggml/gguf de whisper.cpp: override manual primero,
     * luego escaneo de carpetas conocidas (cualquier nombre, no solo ggml-*),
     * incluida la cache de Hugging Face. Devuelve el de mayor calidad.
     */
    var WHISPER_MODEL_AUTO_KEY = "editorpro_whisper_model_auto";

    SpeechToText.prototype._findWhisperModel = function() {
        if (!fs) return null;

        var manual = _lsGet(WHISPER_MODEL_KEY);
        if (manual && /\.(bin|gguf)$/i.test(manual)) {
            try { if (fs.existsSync(manual)) return manual; } catch(e) {}
        }

        // Resultado de una búsqueda profunda anterior (Spotlight)
        var auto = _lsGet(WHISPER_MODEL_AUTO_KEY);
        if (auto) {
            try {
                if (fs.existsSync(auto)) return auto;
                localStorage.removeItem(WHISPER_MODEL_AUTO_KEY);
            } catch(e) {}
        }

        var best = null;
        var bestScore = -1;

        function scanDir(dir) {
            var files;
            try { files = fs.readdirSync(dir); } catch(e) { return; }
            for (var i = 0; i < files.length; i++) {
                if (!_isGgmlModelFile(files[i])) continue;
                var full = dir + "/" + files[i];
                try {
                    var st = fs.statSync(full);
                    if (!st.isFile() || st.size < 50 * 1024 * 1024) continue; // los modelos reales pesan >50MB
                } catch(e2) { continue; }
                var score = _whisperModelScore(files[i]);
                if (score > bestScore) { bestScore = score; best = full; }
            }
        }

        var dirs = this._whisperModelDirs();
        for (var d = 0; d < dirs.length; d++) scanDir(dirs[d]);

        // Cache de Hugging Face: ~/.cache/huggingface/hub/models--*whisper*/snapshots/<sha>/
        var home = (typeof process !== "undefined" && process.env) ? (process.env.HOME || "") : "";
        if (home) {
            var hub = home + "/.cache/huggingface/hub";
            try {
                var repos = fs.readdirSync(hub);
                for (var r = 0; r < repos.length; r++) {
                    if (repos[r].toLowerCase().indexOf("whisper") === -1) continue;
                    var snaps = hub + "/" + repos[r] + "/snapshots";
                    var shas;
                    try { shas = fs.readdirSync(snaps); } catch(e3) { continue; }
                    for (var s = 0; s < shas.length; s++) scanDir(snaps + "/" + shas[s]);
                }
            } catch(e4) {}
        }

        return best;
    };

    /**
     * Búsqueda profunda del modelo con Spotlight (mdfind, solo macOS): busca
     * archivos ggml/gguf en TODO el disco indexado, sin depender de carpetas
     * conocidas. El resultado se persiste para no repetir la búsqueda.
     * callback(modelPath | null)
     */
    SpeechToText.prototype.deepSearchWhisperModel = function(callback) {
        if (!childProcess || !fs || (typeof process !== "undefined" && process.platform === "win32")) {
            callback(null);
            return;
        }
        var queries = [
            "mdfind -name ggml 2>/dev/null",
            "mdfind -name gguf 2>/dev/null"
        ];
        var lines = [];
        var pending = queries.length;

        function finish() {
            var best = null;
            var bestScore = -1;
            for (var i = 0; i < lines.length; i++) {
                var p = lines[i].trim();
                if (!p || !/\.(bin|gguf)$/i.test(p)) continue;
                var name = p.replace(/\\/g, "/").split("/").pop();
                if (!_isGgmlModelFile(name)) continue;
                try {
                    var st = fs.statSync(p);
                    if (!st.isFile() || st.size < 50 * 1024 * 1024) continue;
                } catch(e) { continue; }
                var score = _whisperModelScore(name);
                if (score > bestScore) { bestScore = score; best = p; }
            }
            if (best) {
                try { localStorage.setItem(WHISPER_MODEL_AUTO_KEY, best); } catch(e) {}
            }
            callback(best);
        }

        for (var q = 0; q < queries.length; q++) {
            childProcess.exec(queries[q], { timeout: 20000, maxBuffer: 20 * 1024 * 1024 }, function(err, stdout) {
                if (!err && stdout) lines = lines.concat(String(stdout).split("\n"));
                pending--;
                if (pending === 0) finish();
            });
        }
    };

    /**
     * Detecta el Whisper de Python (openai-whisper): comando `whisper` en PATH
     * + modelos .pt en ~/.cache/whisper/. Ese formato NO es compatible con
     * whisper.cpp, así que se usa como motor alternativo.
     */
    SpeechToText.prototype._findWhisperPython = function() {
        if (!fs || !childProcess) return { binary: null, model: null };
        var binary = null;
        try {
            var whichCmd = (process && process.platform === 'win32') ? 'where whisper 2>NUL' : 'which whisper 2>/dev/null';
            var found = childProcess.execSync(whichCmd, { encoding: "utf8" }).trim();
            if (found) binary = found.split(/\r?\n/)[0];
        } catch(e) {}
        if (!binary) return { binary: null, model: null };

        var home = (typeof process !== "undefined" && process.env) ? (process.env.HOME || "") : "";
        var best = null;
        var bestScore = -1;
        if (home) {
            try {
                var files = fs.readdirSync(home + "/.cache/whisper");
                for (var i = 0; i < files.length; i++) {
                    if (!/\.pt$/i.test(files[i])) continue;
                    var score = _whisperModelScore(files[i]);
                    if (score > bestScore) { bestScore = score; best = files[i].replace(/\.pt$/i, ""); }
                }
            } catch(e2) {}
        }
        // El comando whisper puede descargar el modelo solo, pero solo lo
        // reportamos como listo si ya hay un modelo descargado.
        return { binary: binary, model: best };
    };

    /**
     * Whisper MLX (Apple Silicon) — motor preferido en Macs M-series.
     * Usa el CLI `mlx_whisper` (paquete mlx-whisper) instalado en el venv
     * dedicado del plugin (~/.editorpro/mlx-whisper-venv), o en PATH/--user.
     * Produce words[] con timestamps REALES (mismo JSON que openai-whisper),
     * pero mucho más rápido en el M3 (~15-20x tiempo real).
     * El modelo se descarga/cachea en ~/.cache/huggingface (mlx-community).
     */
    var MLX_BIN_KEY = "editorpro_mlx_binary";
    var MLX_BIN_AUTO_KEY = "editorpro_mlx_binary_auto";
    var MLX_MODEL_KEY = "editorpro_mlx_model";
    var MLX_DEFAULT_MODEL = "mlx-community/whisper-large-v3-turbo";

    /**
     * Rutas donde acaba el CLI `mlx_whisper` según quién lo instaló. Nuestro
     * setup-mlx.sh usa un venv propio, pero el paquete lo instala cualquier pip
     * y **otras herramientas del editor también lo instalan** (un `pip3 install
     * mlx-whisper` con el Python de python.org deja el CLI en
     * /Library/Frameworks/Python.framework/Versions/<ver>/bin, que es el caso
     * real que no detectábamos).
     *
     * Las carpetas con versión en el nombre se recorren, no se adivinan.
     */
    SpeechToText.prototype._mlxCandidatePaths = function() {
        var home = (typeof process !== "undefined" && process.env) ? (process.env.HOME || "") : "";
        var list = [];
        var manual = _lsGet(MLX_BIN_KEY);
        if (manual) list.push(manual);
        var auto = _lsGet(MLX_BIN_AUTO_KEY);
        if (auto) list.push(auto);

        if (home) {
            list.push(home + "/.editorpro/mlx-whisper-venv/bin/mlx_whisper");
            list.push(home + "/.local/bin/mlx_whisper");
            list.push(home + "/.local/pipx/venvs/mlx-whisper/bin/mlx_whisper");
        }
        list.push("/opt/homebrew/bin/mlx_whisper");
        list.push("/usr/local/bin/mlx_whisper");

        // Carpetas con la versión de Python en el nombre: se enumeran.
        var versioned = [
            "/Library/Frameworks/Python.framework/Versions",   // python.org (system)
            home ? home + "/Library/Python" : null,             // pip3 install --user
            home ? home + "/Library/Frameworks/Python.framework/Versions" : null
        ];
        for (var v = 0; v < versioned.length; v++) {
            if (!versioned[v]) continue;
            var entries = [];
            try { entries = fs.readdirSync(versioned[v]); } catch(e) { continue; }
            for (var e2 = 0; e2 < entries.length; e2++) {
                list.push(versioned[v] + "/" + entries[e2] + "/bin/mlx_whisper");
            }
        }

        // Entornos conda/miniforge, habituales en Apple Silicon para ML.
        var condaRoots = [];
        if (home) {
            condaRoots.push(home + "/miniforge3");
            condaRoots.push(home + "/miniconda3");
            condaRoots.push(home + "/anaconda3");
        }
        condaRoots.push("/opt/miniforge3");
        condaRoots.push("/opt/miniconda3");
        for (var c = 0; c < condaRoots.length; c++) {
            list.push(condaRoots[c] + "/bin/mlx_whisper");
            var envs = [];
            try { envs = fs.readdirSync(condaRoots[c] + "/envs"); } catch(e) { envs = []; }
            for (var en = 0; en < envs.length; en++) {
                list.push(condaRoots[c] + "/envs/" + envs[en] + "/bin/mlx_whisper");
            }
        }
        return list;
    };

    /**
     * El PATH real del usuario, preguntándole a su shell de login.
     *
     * Premiere lanza el panel con un PATH mínimo (/usr/bin:/bin), así que el
     * `which` de toda la vida no ve **nada** de lo que el editor tenga
     * instalado: ni Homebrew, ni el Python de python.org. Es el mismo problema
     * que ya resuelve así `claude-code.js`. Cuesta el arranque del shell, por
     * eso solo se pregunta cuando las rutas conocidas no dieron nada.
     */
    SpeechToText.prototype._findMlxViaShell = function() {
        if (!childProcess || (typeof process !== "undefined" && process.platform === "win32")) return null;
        var shell = (typeof process !== "undefined" && process.env && process.env.SHELL) || "/bin/zsh";
        try {
            var out = childProcess.execFileSync(shell, ["-lc", "command -v mlx_whisper"], {
                encoding: "utf8", timeout: 8000
            });
            var p = String(out || "").split("\n")[0].trim();
            if (p && fs.existsSync(p)) return p;
        } catch(e) {}
        return null;
    };

    var _mlxBinCache = null;   // null = sin averiguar; "" = averiguado y no está

    SpeechToText.prototype._findMlxWhisper = function(force) {
        if (!fs || !childProcess) return { binary: null, model: null };

        if (force) _mlxBinCache = null;
        var binary = _mlxBinCache;

        if (binary === null) {
            binary = "";
            var candidates = this._mlxCandidatePaths();
            for (var i = 0; i < candidates.length; i++) {
                try {
                    if (candidates[i] && fs.existsSync(candidates[i])) { binary = candidates[i]; break; }
                } catch(e) {}
            }
            // El PATH del usuario, no el que hereda el panel.
            if (!binary) {
                try {
                    var env = this._childEnv();
                    var found = childProcess.execSync("which mlx_whisper 2>/dev/null",
                        { encoding: "utf8", env: env }).trim();
                    if (found) binary = found.split(/\r?\n/)[0];
                } catch(e) {}
            }
            if (!binary) binary = this._findMlxViaShell() || "";

            _mlxBinCache = binary;
            // Lo encontrado se recuerda: la próxima vez no se paga el shell.
            if (binary) { try { localStorage.setItem(MLX_BIN_AUTO_KEY, binary); } catch(e) {} }
            if (global.EPLogger) global.EPLogger.log("stt", "mlx-detect", binary || "no encontrado");
        }

        if (!binary) return { binary: null, model: null };

        var home = (typeof process !== "undefined" && process.env) ? (process.env.HOME || "") : "";

        // Modelo: override manual, o repo cacheado en HuggingFace, o el default
        var model = null;
        try { model = localStorage.getItem(MLX_MODEL_KEY); } catch(e) {}
        if (!model) model = MLX_DEFAULT_MODEL;

        var modelLabel = model.split("/").pop();
        var cached = false;
        if (home) {
            try {
                var repoDir = "models--" + model.replace(/\//g, "--");
                cached = fs.existsSync(home + "/.cache/huggingface/hub/" + repoDir);
            } catch(e) {}
        }
        return { binary: binary, model: model, modelLabel: modelLabel, cached: cached };
    };

    /**
     * Busca `mlx_whisper` en todo el disco indexado con Spotlight.
     *
     * Es la red para el instalador que se lo lleva a un venv privado suyo —igual
     * que nuestro ~/.editorpro/mlx-whisper-venv, que nadie de fuera podría
     * adivinar—: ahí no está en el PATH ni en ninguna carpeta estándar, así que
     * ni las rutas conocidas ni el shell de login lo encuentran.
     *
     * Solo cuenta el CLI (`.../bin/mlx_whisper`): mdfind devuelve también la
     * carpeta del paquete en site-packages, que no es ejecutable.
     * callback(rutaOEnNull)
     */
    SpeechToText.prototype.deepSearchMlxWhisper = function(callback) {
        if (!childProcess || !fs || (typeof process !== "undefined" && process.platform === "win32")) {
            callback(null);
            return;
        }
        childProcess.exec("mdfind -name mlx_whisper 2>/dev/null",
            { timeout: 20000, maxBuffer: 10 * 1024 * 1024 },
            function(err, stdout) {
                var lines = (!err && stdout) ? String(stdout).split("\n") : [];
                var best = null;
                for (var i = 0; i < lines.length; i++) {
                    var p = lines[i].trim();
                    if (!p || !/\/bin\/mlx_whisper$/.test(p)) continue;
                    try { if (!fs.statSync(p).isFile()) continue; } catch(e) { continue; }
                    best = p;
                    break;
                }
                if (best) {
                    try { localStorage.setItem(MLX_BIN_AUTO_KEY, best); } catch(e) {}
                    _mlxBinCache = null;   // que la próxima lectura lo vea
                    if (global.EPLogger) global.EPLogger.log("stt", "mlx-deep-search", best);
                } else if (global.EPLogger) {
                    global.EPLogger.log("stt", "mlx-deep-search", "sin resultados");
                }
                callback(best);
            });
    };

    /** Vuelve a mirar si hay MLX instalado, ignorando lo que ya se averiguó. */
    SpeechToText.prototype.refreshMlxDetection = function() {
        return this._findMlxWhisper(true);
    };

    SpeechToText.prototype.getWhisperLocalStatus = function() {
        // Motor preferido en Apple Silicon: Whisper MLX
        var isMac = !(typeof process !== "undefined" && process && process.platform === "win32");
        if (isMac) {
            var mlx = this._findMlxWhisper();
            if (mlx.binary) {
                return {
                    engine: "mlx",
                    binaryFound: true,
                    binaryPath: mlx.binary,
                    modelFound: true,       // mlx_whisper descarga/cachea el modelo solo
                    modelPath: null,
                    modelName: mlx.modelLabel + " (MLX)" + (mlx.cached ? "" : " · se descargará al primer uso"),
                    mlxModel: mlx.model,
                    ready: true
                };
            }
        }

        var binary = this._findWhisperBinary();
        var model = this._findWhisperModel();

        if (binary.binary && model) {
            var parts = model.replace(/\\/g, "/").split("/");
            return {
                engine: "cpp",
                binaryFound: true,
                binaryPath: binary.binary,
                modelFound: true,
                modelPath: model,
                modelName: parts[parts.length - 1] || "",
                ready: true
            };
        }

        // Fallback: Whisper de Python (openai-whisper) con modelos .pt
        var py = this._findWhisperPython();
        if (py.binary && py.model) {
            return {
                engine: "python",
                binaryFound: true,
                binaryPath: py.binary,
                modelFound: true,
                modelPath: null,
                modelName: py.model + " (Python)",
                pythonModel: py.model,
                ready: true
            };
        }

        return {
            engine: binary.binary ? "cpp" : (py.binary ? "python" : null),
            binaryFound: !!(binary.binary || py.binary),
            binaryPath: binary.binary || py.binary || null,
            modelFound: !!model,
            modelPath: model || null,
            modelName: "",
            searchedDirs: this._whisperModelDirs(),
            ready: false
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

    SpeechToText.prototype._transcribeWhisperLocal = function(filePath, onProgress, callback, _noWordLevel) {
        if (!childProcess) {
            callback({ error: "child_process no disponible." });
            return;
        }

        var self = this;
        var status = this.getWhisperLocalStatus();

        if (!status.ready && !status.modelFound) {
            // Último intento: búsqueda profunda del modelo en todo el disco
            onProgress(2);
            // Antes de buscar un modelo de whisper.cpp, mirar si hay un
            // mlx_whisper instalado por otra herramienta: es el motor preferido
            // y se trae su propio modelo, así que resuelve el problema entero.
            // Aquí también, no solo en Ajustes: se puede llegar a transcribir sin
            // haber abierto nunca ese panel.
            this.deepSearchMlxWhisper(function(mlxFound) {
                if (mlxFound && self.getWhisperLocalStatus().ready) {
                    self._transcribeWhisperLocal(filePath, onProgress, callback);
                    return;
                }
                self.deepSearchWhisperModel(function() {
                    var retry = self.getWhisperLocalStatus();
                    if (!retry.ready) {
                        var missing = [];
                        if (!retry.binaryFound) missing.push("binario (mlx_whisper / whisper-cli / whisper)");
                        if (!retry.modelFound) missing.push("modelo (busqué en carpetas conocidas y con Spotlight)");
                        callback({ error: "Whisper local no disponible: falta " + missing.join(" y ") +
                            ". Instálalo con whisper/setup-mlx.sh (Apple Silicon) o whisper/setup-whisper.sh, " +
                            "o señala el tuyo con \"Elegir binario...\" / \"Elegir modelo...\" en Ajustes." });
                        return;
                    }
                    self._transcribeWhisperLocal(filePath, onProgress, callback);
                });
            });
            return;
        }

        if (!status.ready) {
            callback({ error: "Whisper local no disponible: falta el binario (mlx_whisper / whisper-cli / whisper). Instálalo con whisper/setup-mlx.sh (Apple Silicon) o whisper/setup-whisper.sh, o señala el tuyo con \"Elegir binario...\" en Ajustes." });
            return;
        }

        if (status.engine === "mlx") {
            this._transcribeWhisperMlx(filePath, status, onProgress, callback);
            return;
        }

        if (status.engine === "python") {
            this._transcribeWhisperPython(filePath, status, onProgress, callback);
            return;
        }

        var binaryInfo = { binary: status.binaryPath };
        var modelPath = status.modelPath;

        var threads = 4;
        if (os && os.cpus) {
            try { threads = Math.max(1, Math.min(os.cpus().length - 1, 8)); } catch(e) {}
        }

        onProgress(5);

        var safeFilePath = this._ensureAccessiblePath(filePath);
        onProgress(10);

        var jsonOutPath = safeFilePath + ".json";
        // Timestamps REALES por palabra: -ml 1 (un token por segmento) + -sow
        // (dividir en palabras). Si el build no soporta estos flags, reintenta
        // sin ellos (cae a estimación). Sin esto, los tiempos por palabra se
        // estiman dividiendo la frase — impreciso para colocar cortes.
        var wordLevel = !_noWordLevel;
        var args = ["-m", modelPath, "-f", safeFilePath, "-l", "es", "-t", String(threads), "-oj", "-pp"];
        if (wordLevel) args = args.concat(["-ml", "1", "-sow"]);
        var stderrBuf = "";
        var finished = false;
        var child = childProcess.spawn(binaryInfo.binary, args, { env: this._childEnv() });
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
                // Reintentar sin los flags de word-level por si el build no los soporta
                if (wordLevel) {
                    if (safeFilePath !== filePath) { try { fs.unlinkSync(safeFilePath); } catch(e) {} }
                    self._transcribeWhisperLocal(filePath, onProgress, callback, true);
                    return;
                }
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
                    if (!text) continue;

                    var segWords = text.split(/\s+/).filter(function(x) { return x; });
                    var segStart = startMs / 1000;
                    var segEnd = endMs / 1000;

                    if (segWords.length === 1) {
                        // Con -ml 1/-sow cada segmento es una palabra: tiempo REAL
                        words.push({ text: segWords[0], start: segStart, end: segEnd, type: "word" });
                    } else {
                        // Respaldo (build sin word-level): repartir el tiempo del
                        // segmento PONDERADO por longitud de cada palabra en vez
                        // de uniforme — reduce el error de alineación.
                        var totalChars = 0;
                        var c;
                        for (c = 0; c < segWords.length; c++) totalChars += segWords[c].length + 1;
                        var segDur = Math.max(0, segEnd - segStart);
                        var acc = segStart;
                        for (c = 0; c < segWords.length; c++) {
                            var frac = totalChars > 0 ? (segWords[c].length + 1) / totalChars : (1 / segWords.length);
                            var wDur = segDur * frac;
                            words.push({ text: segWords[c], start: acc, end: acc + wDur, type: "word" });
                            acc += wDur;
                        }
                    }

                    fullTextParts.push(text);
                }

                onProgress(100);
                callback({
                    words: cleanHallucinatedRepeats(words),
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

    /**
     * Whisper de Python (openai-whisper): `whisper <wav> --model large-v3
     * --output_format json --word_timestamps True`. Produce words[] con
     * timestamps reales por palabra (mejor que los pseudo-words de whisper.cpp
     * sin -ml). Los modelos .pt viven en ~/.cache/whisper/.
     */
    SpeechToText.prototype._transcribeWhisperPython = function(filePath, status, onProgress, callback) {
        onProgress(5);
        var safeFilePath = this._ensureAccessiblePath(filePath);
        onProgress(10);

        var outDir = os ? os.tmpdir() : "/tmp";
        var args = [
            safeFilePath,
            "--model", status.pythonModel || "large-v3",
            "--language", "es",
            "--output_format", "json",
            "--word_timestamps", "True",
            "--output_dir", outDir,
            "--verbose", "False"
        ];

        var finished = false;
        var child = childProcess.spawn(status.binaryPath, args, { env: this._childEnv() });
        this._activeRequest = child;

        // El Python whisper con large-v3 puede tardar mucho: watchdog por
        // inactividad (10 min sin output), no por tiempo total.
        var lastActivity = Date.now();
        var watchdog = setInterval(function() {
            if (finished) { clearInterval(watchdog); return; }
            if (Date.now() - lastActivity > 600000) {
                clearInterval(watchdog);
                try { child.kill("SIGKILL"); } catch(e) {}
                callback({ error: "Whisper (Python) sin actividad por 10 minutos — cancelado." });
            }
        }, 15000);

        var stderrBuf = "";
        child.stderr.on("data", function(chunk) {
            lastActivity = Date.now();
            stderrBuf += chunk.toString();
            // tqdm: " 45%|####..." — usar el último porcentaje visto
            var matches = stderrBuf.match(/(\d+)%\|/g);
            if (matches && matches.length > 0) {
                var pct = parseInt(matches[matches.length - 1]);
                if (!isNaN(pct)) onProgress(10 + Math.round(pct * 0.85));
            }
            if (stderrBuf.length > 100000) stderrBuf = stderrBuf.slice(-20000);
        });
        child.stdout.on("data", function() { lastActivity = Date.now(); });

        var self = this;
        child.on("close", function(code) {
            finished = true;
            self._activeRequest = null;
            clearInterval(watchdog);

            function cleanupCopy() {
                if (safeFilePath !== filePath) { try { fs.unlinkSync(safeFilePath); } catch(e) {} }
            }

            if (self._aborted) {
                cleanupCopy();
                callback({ error: "Transcripción cancelada." });
                return;
            }
            if (code !== 0) {
                cleanupCopy();
                callback({ error: "Whisper (Python) terminó con código " + code + "." });
                return;
            }

            // El output es <outDir>/<basename sin extensión>.json
            var base = safeFilePath.replace(/\\/g, "/").split("/").pop().replace(/\.[^.]+$/, "");
            var jsonOutPath = (path ? path.join(outDir, base + ".json") : outDir + "/" + base + ".json");

            try {
                var data = JSON.parse(fs.readFileSync(jsonOutPath, "utf8"));
                try { fs.unlinkSync(jsonOutPath); } catch(e) {}
                cleanupCopy();

                var words = parseWhisperSegmentsToWords(data);
                if (words.length === 0) {
                    callback({ error: "Whisper (Python) no devolvió palabras con timestamps." });
                    return;
                }
                onProgress(100);
                callback({ words: words, text: data.text || "", language: data.language || "es" });
            } catch(e2) {
                cleanupCopy();
                callback({ error: "Error al leer resultado de Whisper (Python): " + e2.message });
            }
        });

        child.on("error", function(err) {
            finished = true;
            clearInterval(watchdog);
            if (safeFilePath !== filePath) { try { fs.unlinkSync(safeFilePath); } catch(e) {} }
            callback({ error: "Error al ejecutar Whisper (Python): " + err.message });
        });
    };

    /**
     * Parser compartido del JSON de Whisper (openai-whisper y mlx_whisper usan
     * el mismo esquema: { text, language, segments:[{ words:[{word,start,end}] }] }).
     * Devuelve words[] normalizado ({text,start,end,type:"word"}).
     */
    // Normaliza un token para comparar (minúsculas, sin acentos ni puntuación).
    function _normRepeatToken(text) {
        var t = String(text || "").toLowerCase();
        try { t = t.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch(e) {}
        return t.replace(/[.,!?;:…"“”'’¿¡()\[\]—–\-]/g, "").replace(/\s+/g, "");
    }

    /**
     * Elimina alucinaciones de Whisper: rachas de la MISMA palabra repetida
     * muchas veces seguidas ("nuevo nuevo nuevo ..."), típicas en silencios o
     * música. En habla real casi nunca se repite la misma palabra ≥ minRun veces
     * seguidas, así que esas rachas se descartan enteras (no son voz real y
     * ensucian el clamp y el detector de repeticiones).
     */
    function cleanHallucinatedRepeats(words, opts) {
        opts = opts || {};
        var minWordRun = opts.minWordRun || 6;   // palabra suelta repetida N veces
        var minPhraseReps = opts.minPhraseReps || 3; // frase (≥2 palabras) repetida N veces
        var maxPhraseLen = opts.maxPhraseLen || 8;
        if (!words || words.length < 3) return words || [];

        var N = words.length;
        var norm = new Array(N);
        for (var n = 0; n < N; n++) norm[n] = _normRepeatToken(words[n].text);

        var keep = new Array(N);
        for (var z = 0; z < N; z++) keep[z] = true;

        var i = 0;
        while (i < N) {
            // Buscar el loop (patrón de longitud L=1..maxPhraseLen) que MÁS cubre
            // desde i. Whisper alucina repitiendo la misma palabra o frase muchas
            // veces seguidas en silencios/música. Se descarta el run entero.
            var bestL = 0, bestReps = 0;
            for (var L = 1; L <= maxPhraseLen && i + 2 * L <= N; L++) {
                // El patrón base no debe ser puro vacío (puntuación)
                var patternEmpty = true;
                for (var q = 0; q < L; q++) { if (norm[i + q] !== "") { patternEmpty = false; break; } }
                if (patternEmpty) continue;

                var reps = 1;
                while (true) {
                    var base = i + reps * L;
                    if (base + L > N) break;
                    var same = true;
                    for (var k = 0; k < L; k++) {
                        if (norm[i + k] !== norm[base + k]) { same = false; break; }
                    }
                    if (!same) break;
                    reps++;
                }
                var threshold = (L === 1) ? minWordRun : minPhraseReps;
                if (reps >= threshold && reps * L > bestReps * bestL) { bestL = L; bestReps = reps; }
            }
            if (bestL > 0) {
                for (var d = 0; d < bestReps * bestL; d++) keep[i + d] = false;
                i += bestReps * bestL;
            } else {
                i++;
            }
        }

        var out = [];
        for (var m = 0; m < N; m++) if (keep[m]) out.push(words[m]);
        return out;
    }
    SpeechToText.cleanHallucinatedRepeats = cleanHallucinatedRepeats;

    function parseWhisperSegmentsToWords(data) {
        var words = [];
        var segments = (data && data.segments) || [];
        for (var i = 0; i < segments.length; i++) {
            var segWords = segments[i].words || [];
            for (var w = 0; w < segWords.length; w++) {
                var wd = segWords[w];
                var txt = String(wd.word || wd.text || "").trim();
                if (!txt) continue;
                if (typeof wd.start !== "number" || typeof wd.end !== "number") continue;
                words.push({ text: txt, start: wd.start, end: wd.end, type: "word" });
            }
        }
        return cleanHallucinatedRepeats(words);
    }
    SpeechToText.parseWhisperSegmentsToWords = parseWhisperSegmentsToWords;

    /**
     * Whisper MLX (Apple Silicon): `mlx_whisper <wav> --model <repo> --language es
     * --word-timestamps True --output-format json`. Timestamps reales por palabra,
     * muy rápido en el M-series. El resultado se escribe en <outDir>/<name>.json.
     */
    SpeechToText.prototype._transcribeWhisperMlx = function(filePath, status, onProgress, callback) {
        onProgress(5);
        var safeFilePath = this._ensureAccessiblePath(filePath);
        onProgress(10);

        var outDir = os ? os.tmpdir() : "/tmp";
        var outName = "epmlx_" + Date.now();
        var model = status.mlxModel || MLX_DEFAULT_MODEL;
        var args = [
            safeFilePath,
            "--model", model,
            "--language", "es",
            "--word-timestamps", "True",
            // Anti-alucinación: no condicionar en el texto previo (principal
            // causa de loops "nuevo nuevo nuevo...") y saltar silencios largos
            // donde Whisper suele alucinar.
            "--condition-on-previous-text", "False",
            "--hallucination-silence-threshold", "2",
            "--output-format", "json",
            "--output-dir", outDir,
            "--output-name", outName,
            "--verbose", "False"
        ];

        var finished = false;
        var child = childProcess.spawn(status.binaryPath, args, { env: this._childEnv() });
        this._activeRequest = child;

        // Watchdog por inactividad: la primera vez puede tardar (descarga del
        // modelo), luego es muy rápido. 10 min sin ninguna salida → cancelar.
        var lastActivity = Date.now();
        var watchdog = setInterval(function() {
            if (finished) { clearInterval(watchdog); return; }
            if (Date.now() - lastActivity > 600000) {
                clearInterval(watchdog);
                try { child.kill("SIGKILL"); } catch(e) {}
                callback({ error: "Whisper MLX sin actividad por 10 minutos — cancelado." });
            }
        }, 15000);

        var stderrBuf = "";
        child.stderr.on("data", function(chunk) {
            lastActivity = Date.now();
            stderrBuf += chunk.toString();
            // Barra tqdm de frames: " 53%|█████▎ | 7784/14673"
            var matches = stderrBuf.match(/(\d+)%\|/g);
            if (matches && matches.length > 0) {
                var pct = parseInt(matches[matches.length - 1], 10);
                if (!isNaN(pct)) onProgress(10 + Math.round(pct * 0.85));
            }
            if (stderrBuf.length > 100000) stderrBuf = stderrBuf.slice(-20000);
        });
        child.stdout.on("data", function() { lastActivity = Date.now(); });

        var self = this;
        child.on("close", function(code) {
            finished = true;
            self._activeRequest = null;
            clearInterval(watchdog);

            function cleanupCopy() {
                if (safeFilePath !== filePath) { try { fs.unlinkSync(safeFilePath); } catch(e) {} }
            }

            if (self._aborted) {
                cleanupCopy();
                callback({ error: "Transcripción cancelada." });
                return;
            }
            if (code !== 0) {
                cleanupCopy();
                callback({ error: "Whisper MLX terminó con código " + code + ". " +
                    (stderrBuf ? stderrBuf.slice(-200) : "Revisa el audio o reinstala con whisper/setup-mlx.sh.") });
                return;
            }

            var jsonOutPath = (path ? path.join(outDir, outName + ".json") : outDir + "/" + outName + ".json");
            // mlx_whisper puede salir con código 0 pero NO escribir el JSON si no
            // pudo decodificar el audio (típico: no encontró `ffmpeg` en el PATH
            // del proceso — imprime "Skipping ... FileNotFoundError").
            if (!fs.existsSync(jsonOutPath)) {
                cleanupCopy();
                var tail = (stderrBuf || "").replace(/\s+/g, " ").trim().slice(-300);
                var hint = /ffmpeg|FileNotFound|Skipping/i.test(stderrBuf)
                    ? "mlx_whisper no pudo decodificar el audio (¿falta ffmpeg en el PATH del proceso?)."
                    : "mlx_whisper no generó resultado.";
                callback({ error: hint + (tail ? " Detalle: " + tail : "") });
                return;
            }
            try {
                var data = JSON.parse(fs.readFileSync(jsonOutPath, "utf8"));
                try { fs.unlinkSync(jsonOutPath); } catch(e) {}
                cleanupCopy();

                var words = parseWhisperSegmentsToWords(data);
                if (words.length === 0) {
                    callback({ error: "Whisper MLX no devolvió palabras con timestamps." });
                    return;
                }
                onProgress(100);
                callback({ words: words, text: data.text || "", language: data.language || "es" });
            } catch(e2) {
                cleanupCopy();
                callback({ error: "Error al leer resultado de Whisper MLX: " + e2.message });
            }
        });

        child.on("error", function(err) {
            finished = true;
            clearInterval(watchdog);
            if (safeFilePath !== filePath) { try { fs.unlinkSync(safeFilePath); } catch(e) {} }
            callback({ error: "Error al ejecutar Whisper MLX: " + err.message });
        });
    };

    // ═══════════════════════════════════════════════════════════════
    // Transcripción por regiones (ahorro de tiempo)
    // ═══════════════════════════════════════════════════════════════

    SpeechToText.prototype._findFfmpeg = function(callback) {
        if (!childProcess) { callback(null); return; }
        var exec = childProcess.exec;
        exec("ffmpeg -version", function(err) {
            if (!err) { callback("ffmpeg"); return; }
            if (process && process.platform !== "win32") {
                exec("/opt/homebrew/bin/ffmpeg -version", function(err2) {
                    callback(err2 ? null : "/opt/homebrew/bin/ffmpeg");
                });
            } else {
                callback(null);
            }
        });
    };

    /**
     * Transcribe solo ventanas [{start,end}] (segundos) del audio, cortando
     * cada una con ffmpeg y desplazando los timestamps a tiempo de secuencia.
     * Devuelve el mismo formato normalizado {words, text, language, partial,
     * windows}. Si no hay ffmpeg, cae a transcribir el archivo completo.
     */
    SpeechToText.prototype.transcribeRegions = function(filePath, regions, onProgress, callback) {
        var self = this;
        if (!regions || regions.length === 0) {
            this.transcribe(filePath, onProgress, callback);
            return;
        }
        this._findFfmpeg(function(ffmpeg) {
            if (!ffmpeg) {
                // Sin ffmpeg no se puede cortar: transcribir todo (y avisar)
                self.transcribe(filePath, onProgress, function(res) {
                    if (res && !res.error) res.fellBackToFull = true;
                    callback(res);
                });
                return;
            }
            var tmpDir = os ? os.tmpdir() : "/tmp";
            // Si Premiere exportó el audio a una ruta protegida (TemporaryItems /
            // sandbox), ffmpeg no la puede leer y TODAS las ventanas fallarían.
            // Copiar a una ruta accesible una sola vez antes de cortar.
            var srcPath = self._ensureAccessiblePath(filePath);
            var srcIsCopy = (srcPath !== filePath);
            var allWords = [];
            var textParts = [];
            var language = "es";
            var idx = 0;
            var totalDur = 0;
            for (var r = 0; r < regions.length; r++) totalDur += Math.max(0, regions[r].end - regions[r].start);
            var doneDur = 0;
            var diagnostics = [];   // por qué falló cada ventana (para diagnóstico)
            var okRegions = 0;

            function cleanup(slicePath) {
                try { fs.unlinkSync(slicePath); } catch(e) {}
            }

            function finishCleanup() {
                if (srcIsCopy) { try { fs.unlinkSync(srcPath); } catch(e) {} }
            }

            function nextRegion() {
                if (idx >= regions.length) {
                    if (allWords.length === 0) {
                        // Ninguna ventana produjo palabras: en vez de fallar,
                        // caer a transcribir el archivo completo (más lento pero
                        // robusto) y adjuntar el diagnóstico de por qué falló cada
                        // ventana, para poder corregir el modo rápido después.
                        var detail = diagnostics.length ? diagnostics.join(" | ") : "sin detalle";
                        self.transcribe(srcPath, onProgress, function(res) {
                            finishCleanup();
                            if (res && !res.error) {
                                res.fellBackToFull = true;
                                res.regionFallbackReason = detail;
                            } else if (res) {
                                res.error = "Regiones sin palabras (" + detail + "). Y el fallback completo también falló: " + res.error;
                            }
                            callback(res);
                        });
                        return;
                    }
                    finishCleanup();
                    allWords.sort(function(a, b) { return a.start - b.start; });
                    callback({
                        words: allWords,
                        text: textParts.join(" "),
                        language: language,
                        partial: true,
                        windows: regions,
                        regionDiagnostics: diagnostics.length ? diagnostics : null
                    });
                    return;
                }
                var reg = regions[idx];
                var regNum = idx + 1;
                var dur = Math.max(0, reg.end - reg.start);
                var slicePath = (path ? path.join(tmpDir, "epmrv_slice_" + Date.now() + "_" + idx + ".wav") : tmpDir + "/epmrv_slice_" + idx + ".wav");
                var cmd = '"' + ffmpeg + '" -y -ss ' + reg.start.toFixed(3) + ' -i "' + srcPath +
                    '" -t ' + dur.toFixed(3) + ' -ar 16000 -ac 1 -c:a pcm_s16le "' + slicePath + '"';

                childProcess.exec(cmd, { maxBuffer: 8 * 1024 * 1024 }, function(err, stdout, stderr) {
                    if (err) {
                        // Si falla el corte de una ventana, registrar y seguir
                        var ffMsg = (err && err.message ? err.message : "") + " " + (stderr || "");
                        diagnostics.push("v" + regNum + " (" + reg.start.toFixed(0) + "-" + reg.end.toFixed(0) + "s): ffmpeg falló — " + ffMsg.replace(/\s+/g, " ").trim().slice(0, 160));
                        idx++;
                        nextRegion();
                        return;
                    }
                    // Verificar que el slice existe y no está vacío antes de transcribir
                    var sliceOk = false;
                    try { sliceOk = fs.existsSync(slicePath) && fs.statSync(slicePath).size > 1024; } catch(_e) {}
                    if (!sliceOk) {
                        diagnostics.push("v" + regNum + " (" + reg.start.toFixed(0) + "-" + reg.end.toFixed(0) + "s): el slice quedó vacío (¿ventana fuera del audio o ruta protegida?)");
                        cleanup(slicePath);
                        idx++;
                        nextRegion();
                        return;
                    }
                    var regStart = reg.start;
                    self.transcribe(slicePath, function(pct) {
                        var base = totalDur > 0 ? (doneDur / totalDur) : (idx / regions.length);
                        var span = totalDur > 0 ? (dur / totalDur) : (1 / regions.length);
                        onProgress(Math.min(99, Math.round((base + span * (pct / 100)) * 100)),
                            { region: regNum, total: regions.length, windowSeconds: totalDur });
                    }, function(result) {
                        cleanup(slicePath);
                        if (result && result.error) {
                            diagnostics.push("v" + regNum + " (" + reg.start.toFixed(0) + "-" + reg.end.toFixed(0) + "s): " + result.error);
                        } else if (result && result.words && result.words.length > 0) {
                            for (var w = 0; w < result.words.length; w++) {
                                var wd = result.words[w];
                                allWords.push({
                                    text: wd.text,
                                    start: wd.start + regStart,
                                    end: wd.end + regStart,
                                    type: wd.type || "word"
                                });
                            }
                            if (result.text) textParts.push(result.text);
                            if (result.language) language = result.language;
                            okRegions++;
                        } else {
                            diagnostics.push("v" + regNum + " (" + reg.start.toFixed(0) + "-" + reg.end.toFixed(0) + "s): 0 palabras");
                        }
                        doneDur += dur;
                        idx++;
                        nextRegion();
                    });
                });
            }
            nextRegion();
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
            try { if (outputFolder && !fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder, { recursive: true }); } catch(_e) {}
            fs.writeFileSync(srtPath, srtContent, "utf8");
            paths.path = srtPath;
        } catch(e) {
            paths.error = e.message;
        }

        return paths;
    };

    global.SpeechToText = SpeechToText;

})(window);
