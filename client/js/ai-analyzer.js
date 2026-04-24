/**
 * AI Analyzer - Multi-provider: Ollama (local), Gemini, Claude, GPT
 * Extended for Premiere Pro: SpellCheck, Smart Supertexts, Edit Suggestions
 */

(function(global) {
    "use strict";

    var https, http;
    try { https = require("https"); } catch(e) { https = null; }
    try { http = require("http"); } catch(e) { http = null; }

    var PROVIDERS = {
        ollama: {
            name: "Ollama (Local)",
            host: "localhost",
            port: 11434,
            path: "/api/chat",
            local: true,
            keyPlaceholder: "",
            models: [
                { id: "mistral-small3.1:latest", label: "Mistral Small 3.1 (instalado)" }
            ],
            visionModels: [
                { id: "moondream:latest", label: "Moondream (ligero, 1.8B)" },
                { id: "llava:7b", label: "LLaVA 7B" },
                { id: "llava:13b", label: "LLaVA 13B" },
                { id: "llama3.2-vision:11b", label: "Llama 3.2 Vision 11B" }
            ],
            defaultModel: "mistral-small3.1:latest"
        },
        google: {
            name: "Gemini",
            host: "generativelanguage.googleapis.com",
            local: false,
            keyPlaceholder: "AIza...",
            models: [
                { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash (rápido)" },
                { id: "gemini-2.5-pro-preview-05-06", label: "Gemini 2.5 Pro (recomendado)" },
                { id: "gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash" }
            ],
            defaultModel: "gemini-2.0-flash"
        },
        anthropic: {
            name: "Claude",
            host: "api.anthropic.com",
            path: "/v1/messages",
            local: false,
            keyPlaceholder: "sk-ant-...",
            models: [
                { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (recomendado)" },
                { id: "claude-haiku-4-20250514", label: "Claude Haiku 4 (rápido)" },
                { id: "claude-opus-4-20250514", label: "Claude Opus 4 (máxima calidad)" }
            ],
            defaultModel: "claude-sonnet-4-20250514"
        },
        openai: {
            name: "GPT",
            host: "api.openai.com",
            path: "/v1/chat/completions",
            local: false,
            keyPlaceholder: "sk-...",
            models: [
                { id: "gpt-4o-mini", label: "GPT-4o Mini (rápido)" },
                { id: "gpt-4o", label: "GPT-4o (recomendado)" },
                { id: "gpt-4-turbo", label: "GPT-4 Turbo" }
            ],
            defaultModel: "gpt-4o-mini"
        },
        openrouter: {
            name: "OpenRouter",
            host: "openrouter.ai",
            path: "/api/v1/chat/completions",
            local: false,
            keyPlaceholder: "sk-or-...",
            models: [
                { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4 (recomendado)" },
                { id: "anthropic/claude-opus-4", label: "Claude Opus 4 (máxima calidad)" },
                { id: "anthropic/claude-haiku-4", label: "Claude Haiku 4 (rápido)" },
                { id: "google/gemini-2.5-pro-preview", label: "Gemini 2.5 Pro (Google)" },
                { id: "google/gemini-2.5-flash-preview", label: "Gemini 2.5 Flash (rápido)" },
                { id: "openai/gpt-4o-mini", label: "GPT-4o Mini (OpenAI)" },
                { id: "openai/gpt-4o", label: "GPT-4o (OpenAI)" },
                { id: "deepseek/deepseek-chat-v3-0324", label: "DeepSeek V3 (económico)" },
                { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick (Meta)" },
                { id: "mistralai/mistral-medium-3", label: "Mistral Medium 3" }
            ],
            defaultModel: "anthropic/claude-sonnet-4"
        }
    };

    function AIAnalyzer() {
        this.provider = "ollama";
        this.keys = { anthropic: "", openai: "", google: "", openrouter: "" };
        this.model = PROVIDERS.ollama.defaultModel;
        // Salidas JSON largas (Motion-Pro, supertextos en clases largas)
        this.maxTokens = 16384;
        this.ollamaUrl = "http://localhost:11434";
        /** Tiempo máximo por petición HTTP (ms). Clases largas + Ollama local pueden tardar mucho. */
        this.requestTimeoutMs = 900000;
    }

    AIAnalyzer.PROVIDERS = PROVIDERS;

    AIAnalyzer.prototype.setProvider = function(provider) {
        if (!PROVIDERS[provider]) return;
        this.provider = provider;
        this.model = PROVIDERS[provider].defaultModel;
    };

    AIAnalyzer.prototype.setApiKey = function(provider, key) {
        if (provider && this.keys.hasOwnProperty(provider)) {
            this.keys[provider] = (key || "").trim();
        }
    };

    AIAnalyzer.prototype.setModel = function(model) {
        this.model = model || PROVIDERS[this.provider].defaultModel;
    };

    AIAnalyzer.prototype.setOllamaUrl = function(url) {
        this.ollamaUrl = (url || "http://localhost:11434").replace(/\/+$/, "");
    };

    AIAnalyzer.prototype.getActiveKey = function() {
        return this.keys[this.provider] || "";
    };

    AIAnalyzer.prototype.isConfigured = function() {
        if (this.provider === "ollama") return true;
        var key = this.getActiveKey();
        return key && key.length > 5;
    };

    AIAnalyzer.prototype.getProviderInfo = function() {
        return PROVIDERS[this.provider];
    };

    // ─── SYSTEM MESSAGES per analysis type ────────────────────────

    // Load system messages from Prompts/ folder on disk, with hardcoded fallbacks
    var _promptsFs, _promptsPath;
    try { _promptsFs = require("fs"); _promptsPath = require("path"); } catch(e) {}

    function _loadPrompt(relativePath, fallback) {
        if (!_promptsFs || !_promptsPath) return fallback;
        try {
            // Resolve from extension root: Prompts/{path}
            var extRoot = (typeof CSInterface !== "undefined") ? new CSInterface().getSystemPath(SystemPath.EXTENSION) : "";
            if (!extRoot) return fallback;
            var filePath = _promptsPath.join(extRoot, "Prompts", relativePath);
            if (_promptsFs.existsSync(filePath)) {
                return _promptsFs.readFileSync(filePath, "utf8").trim();
            }
        } catch(e) {}
        return fallback;
    }

    var SYSTEM_MSGS = {
        spellcheck: _loadPrompt("SpellCheck/system.md",
            "Eres un corrector de textos profesional especializado en video educativo y subtítulos. Responde ÚNICAMENTE con JSON válido, sin markdown ni bloques de código."),

        supertexts: _loadPrompt("SmartSupertexts/system.md",
            "Eres un productor de video educativo experto en contenido de e-learning. Tu trabajo es identificar los momentos clave de una clase o lección que merecen un texto en pantalla (supertexto) para reforzar el aprendizaje. Responde ÚNICAMENTE con JSON válido, sin markdown ni bloques de código."),

        editsuggestions2: _loadPrompt("EditSuggestions/system.md",
            "Eres un editor de video profesional especializado en contenido educativo. Analizas transcripciones para identificar highlights, sugerir cortes, y detectar errores de edición como contenido repetido. Tu análisis es preciso con los tiempos y agrupas segmentos adyacentes que pertenecen al mismo bloque. Responde ÚNICAMENTE con JSON válido, sin markdown ni bloques de código."),

        reelproposal: _loadPrompt("ReelProposal/system.md",
            "Eres un estratega de contenido digital experto en crear reels virales de alta retención para Instagram, YouTube Shorts y Facebook Reels a partir de clases educativas. Sabes exactamente qué fragmentos de una clase pueden funcionar como contenido corto impactante. Eres crítico y honesto — si el contenido no sirve para reels, lo dices. Responde ÚNICAMENTE con JSON válido, sin markdown ni bloques de código."),

        takeAnalysis: _loadPrompt("RecordingNotes/system-takeAnalysis.md",
            "Eres un productor de video educativo experto en post-producción de clases grabadas. Tu trabajo es analizar segmentos de una grabación para identificar tomas repetidas de un mismo contenido, entender la continuidad del discurso entre ellas, y generar notas precisas para el editor. Responde ÚNICAMENTE con JSON válido, sin markdown ni bloques de código."),

        supplementReview: _loadPrompt("RecordingNotes/system-supplementReview.md",
            "Eres un editor de video educativo experto. Tu trabajo es validar que las tomas seleccionadas de una clase grabada cubren todo el contenido necesario, y detectar si hay contenido valioso fuera de las tomas detectadas que debería incluirse. Eres conservador: prefieres no sugerir nada antes que sugerir cambios innecesarios. NUNCA sugieres reactivar tomas si el contenido ya está cubierto por las tomas activas. Responde ÚNICAMENTE con JSON válido, sin markdown ni bloques de código."),

        motionProposals: _loadPrompt("MotionPro/analysis-system.md",
            "Eres un director de motion graphics educativos. Analizas transcripciones de clases y decides qué momentos se beneficiarían de apoyo visual animado (motion graphics). Los motion graphics deben ser DEMOSTRATIVOS, no literales — no repiten el texto sino que ilustran el concepto visualmente. Solo propones motions donde realmente agregan valor educativo. IMPORTANTE: Los tiempos de tus propuestas DEBEN coincidir exactamente con los tiempos de la transcripción. Cada motion dura lo que dure la narración del concepto — NO uses duraciones uniformes. Responde ÚNICAMENTE con JSON válido, sin markdown ni bloques de código.")
    };

    // ─── PROMPTS (loaded from Prompts/ folder with hardcoded fallbacks) ────

    var _promptTemplates = {};
    function _getPromptTemplate(toolPath, fallback) {
        if (_promptTemplates[toolPath] !== undefined) return _promptTemplates[toolPath];
        var content = _loadPrompt(toolPath, "");
        _promptTemplates[toolPath] = content || fallback;
        return _promptTemplates[toolPath];
    }

    AIAnalyzer.prototype._buildSpellCheckPrompt = function(text, context) {
        context = context || {};
        var template = _getPromptTemplate("SpellCheck/prompt.md", "");
        if (template) {
            return template.replace("{TEXT}", text).replace("{DETECTED_LANG}", context.detectedLang || "auto");
        }
        return "Analiza el siguiente texto de un video educativo (subtítulos/captions de Premiere Pro).\n\n" +
            "TEXTO:\n\"" + text + "\"\n" +
            "IDIOMA DETECTADO: " + (context.detectedLang || "auto") + "\n\n" +
            "REALIZA UN ANÁLISIS COMPRENSIVO:\n" +
            "1. ORTOGRAFÍA CONTEXTUAL: Verificar si cada palabra es la correcta en contexto.\n" +
            "2. GRAMÁTICA: Concordancia, conjugación, preposiciones, artículos.\n" +
            "3. PUNTUACIÓN: Signos faltantes, espaciado.\n" +
            "4. ESTILO: Sugerencias para subtítulos de video educativo (claridad, concisión).\n" +
            "5. COHERENCIA: Que el texto tenga sentido en el contexto de una clase.\n\n" +
            "IMPORTANTE: Si el texto es correcto, dilo claramente.\n" +
            "Responde ÚNICAMENTE con JSON válido, SIN markdown, SIN bloques de código.\n\n" +
            "FORMATO:\n" +
            '{"score":0,"summary":"","detectedLang":"es","suggestedText":"","issues":[{"type":"spelling","severity":"error","original":"","suggestion":"","explanation":""}]}';
    };

    AIAnalyzer.prototype._buildSupertextsPrompt = function(transcript, context) {
        context = context || {};
        var template = _getPromptTemplate("SmartSupertexts/prompt.md", "");
        if (template) return template.replace("{TRANSCRIPT}", transcript);
        return this._buildSupertextsPromptFallback(transcript, context);
    };

    AIAnalyzer.prototype._buildSupertextsPromptFallback = function(transcript) {
        return "Analiza la siguiente transcripción de una clase educativa grabada en video.\n\nTRANSCRIPCIÓN COMPLETA (los tiempos entre corchetes están en SEGUNDOS):\n" + transcript + "\n\nIdentifica los MOMENTOS CLAVE donde vale la pena mostrar un SUPERTEXTO en pantalla.\nResponde ÚNICAMENTE con JSON válido.\n\nFORMATO:\n{\"supertexts\":[{\"time\":10.0,\"endTime\":15.0,\"text\":\"Ejemplo\",\"type\":\"title\",\"importance\":\"high\",\"reason\":\"Nuevo tema\"}],\"summary\":\"\",\"totalFound\":0}";
    };

    AIAnalyzer.prototype._buildEditSuggestions2Prompt = function(transcript, context) {
        context = context || {};
        var template = _getPromptTemplate("EditSuggestions/prompt.md", "");
        if (template) return template.replace("{TRANSCRIPT}", transcript);
        return "Analiza la siguiente transcripción de una clase educativa.\n\nTRANSCRIPCIÓN:\n" + transcript + "\n\nAnaliza la edición en 3 categorías: highlights, sugerencias, errores.\nResponde ÚNICAMENTE con JSON válido.\n\nFORMATO:\n{\"highlights\":[],\"suggestions\":[],\"errors\":[],\"summary\":\"\",\"overallScore\":85}";
    };

    AIAnalyzer.prototype._buildReelProposalPrompt = function(transcript, context) {
        context = context || {};
        var template = _getPromptTemplate("ReelProposal/prompt.md", "");
        if (template) return template.replace("{TRANSCRIPT}", transcript);
        return "Analiza la siguiente transcripción.\n\nTRANSCRIPCIÓN:\n" + transcript + "\n\nPropone REELS de alta retención.\nResponde ÚNICAMENTE con JSON válido.\n\nFORMATO:\n{\"reels\":[],\"assessment\":\"\",\"notSuitable\":[]}";
    };

    // ─── Generic send method ─────────────────────────────────────

    AIAnalyzer.prototype.abort = function() {
        if (this._activeTimeoutId) {
            try { clearTimeout(this._activeTimeoutId); } catch(e) {}
            this._activeTimeoutId = null;
        }
        if (this._activeRequest) {
            try { this._activeRequest.abort(); } catch(e) {}
            this._activeRequest = null;
        }
        this._aborted = true;
    };

    // ── Auto-correct provider/model mismatches ──────────────────
    // Fixes cases where API key type doesn't match selected provider
    // (e.g. sk-ant-* key with OpenRouter provider, or vice versa)
    var _ANTHROPIC_MODEL_MAP = {
        "anthropic/claude-sonnet-4":  "claude-sonnet-4-20250514",
        "anthropic/claude-opus-4":    "claude-opus-4-20250514",
        "anthropic/claude-haiku-4":   "claude-haiku-4-20250514"
    };
    var _REVERSE_ANTHROPIC_MAP = {};
    (function() { for (var k in _ANTHROPIC_MODEL_MAP) { _REVERSE_ANTHROPIC_MAP[_ANTHROPIC_MODEL_MAP[k]] = k; } })();

    AIAnalyzer.prototype._resolveProviderModel = function() {
        var p = this.provider;
        var m = this.model;
        var key = this.getActiveKey();

        // Key-based auto-detect
        if (key) {
            if (key.indexOf("sk-ant-") === 0 && p === "openrouter") {
                console.log("[ai-analyzer] Auto-correcting provider openrouter → anthropic (key is sk-ant-*)");
                p = "anthropic";
            } else if (key.indexOf("sk-or-") === 0 && p === "anthropic") {
                console.log("[ai-analyzer] Auto-correcting provider anthropic → openrouter (key is sk-or-*)");
                p = "openrouter";
            }
        }

        // Model format normalization
        if (p === "anthropic" && m && m.indexOf("/") !== -1) {
            var mapped = _ANTHROPIC_MODEL_MAP[m];
            if (mapped) {
                console.log("[ai-analyzer] Model remap: " + m + " → " + mapped);
                m = mapped;
            } else {
                m = m.replace(/^anthropic\//, "");
            }
        } else if (p === "openrouter" && m && m.indexOf("/") === -1) {
            var rev = _REVERSE_ANTHROPIC_MAP[m];
            if (rev) {
                console.log("[ai-analyzer] Model remap: " + m + " → " + rev);
                m = rev;
            }
        }

        return { provider: p, model: m };
    };

    AIAnalyzer.prototype._send = function(systemMsg, userPrompt, callback, images) {
        var self = this;
        self._aborted = false;

        // Auto-correct provider/model before sending
        var resolved = self._resolveProviderModel();
        var savedProvider = self.provider;
        var savedModel = self.model;
        self.provider = resolved.provider;
        self.model = resolved.model;

        var timeoutMs = self.requestTimeoutMs || 900000;
        var sendFinished = false;
        self._activeTimeoutId = null;
        var _sendStart = Date.now();
        if (window.EPLogger) EPLogger.log("ai-analyzer", "api-call", "provider=" + self.provider + " model=" + self.model + " promptLen=" + (userPrompt ? userPrompt.length : 0));
        var wrappedCallback = function(result) {
            if (sendFinished) return;
            sendFinished = true;
            if (self._activeTimeoutId) {
                try { clearTimeout(self._activeTimeoutId); } catch(e) {}
                self._activeTimeoutId = null;
            }
            self._activeRequest = null;
            if (self._aborted) return;
            var elapsed = ((Date.now() - _sendStart) / 1000).toFixed(1);
            if (result && result.error) {
                if (window.EPLogger) EPLogger.error("ai-analyzer", "api-response", result.error + " (" + elapsed + "s)");
            } else {
                var resLen = result ? JSON.stringify(result).length : 0;
                if (window.EPLogger) EPLogger.log("ai-analyzer", "api-response", "ok responseLen=" + resLen + " (" + elapsed + "s)");
            }
            // Restore original provider/model (auto-correct is per-request only)
            self.provider = savedProvider;
            self.model = savedModel;
            callback(result);
        };
        var body;

        switch (this.provider) {
            case "ollama":
                var userMsg = { role: "system", content: systemMsg };
                var userContent = { role: "user", content: userPrompt };
                if (images && images.length > 0) userContent.images = images;
                body = JSON.stringify({
                    model: this.model,
                    messages: [userMsg, userContent],
                    stream: false,
                    format: "json",
                    options: { temperature: 0.2, num_predict: this.maxTokens }
                });
                break;
            case "anthropic":
                body = JSON.stringify({
                    model: this.model,
                    max_tokens: this.maxTokens,
                    system: systemMsg,
                    messages: [{ role: "user", content: userPrompt }]
                });
                break;
            case "openai":
            case "openrouter":
                body = JSON.stringify({
                    model: this.model,
                    max_tokens: this.maxTokens,
                    temperature: 0.2,
                    messages: [
                        { role: "system", content: systemMsg },
                        { role: "user", content: userPrompt }
                    ]
                });
                break;
            case "google":
                body = JSON.stringify({
                    contents: [{ parts: [{ text: systemMsg + "\n\n" + userPrompt }] }],
                    generationConfig: {
                        temperature: 0.2,
                        maxOutputTokens: this.maxTokens,
                        responseMimeType: "application/json"
                    }
                });
                break;
        }

        var onTimeout = function() {
            try { if (self._activeRequest && self._activeRequest.abort) self._activeRequest.abort(); } catch(e) {}
            wrappedCallback({
                error: "Tiempo de espera agotado (" + Math.round(timeoutMs / 60000) + " min). " +
                    "Si usas Ollama en local con una clase muy larga, prueba un modelo más rápido, " +
                    "usa Gemini/GPT en la nube en Ajustes, o divide la transcripción."
            });
        };
        self._activeTimeoutId = setTimeout(onTimeout, timeoutMs);

        if (this.provider === "ollama") {
            this._activeRequest = this._requestOllama(body, wrappedCallback);
        } else if (https) {
            this._activeRequest = this._requestNode(body, wrappedCallback);
        } else {
            this._activeRequest = this._requestXHR(body, wrappedCallback);
        }
    };

    // ─── Public API: analyze methods ─────────────────────────────

    AIAnalyzer.prototype.analyzeSpellCheck = function(text, context, callback) {
        if (!this.isConfigured()) {
            callback({ error: "API key no configurada para " + PROVIDERS[this.provider].name });
            return;
        }
        if (!text || text.trim().length === 0) {
            callback({ score: 100, summary: "Texto vacío", issues: [], suggestedText: text });
            return;
        }
        var prompt = this._buildSpellCheckPrompt(text, context);
        this._send(SYSTEM_MSGS.spellcheck, prompt, callback);
    };

    AIAnalyzer.prototype.analyzeSupertexts = function(transcript, context, callback) {
        if (!this.isConfigured()) {
            callback({ error: "API key no configurada para " + PROVIDERS[this.provider].name });
            return;
        }
        if (!transcript || transcript.trim().length === 0) {
            callback({ error: "Transcripción vacía" });
            return;
        }
        // Force Sonnet for supertexts (faster, cheaper, good quality for this task)
        var originalModel = this.model;
        if (this.provider === "openrouter" && this.model.indexOf("opus") !== -1) {
            this.model = "anthropic/claude-sonnet-4";
        } else if (this.provider === "anthropic" && this.model.indexOf("opus") !== -1) {
            this.model = "claude-sonnet-4-20250514";
        }
        var self = this;
        var systemMsg = (context && context.customSystemMsg) || SYSTEM_MSGS.supertexts;
        var prompt = (context && context.customPrompt)
            ? context.customPrompt.replace("{TRANSCRIPT}", transcript)
            : this._buildSupertextsPrompt(transcript, context);
        this._send(systemMsg, prompt, function(result) {
            self.model = originalModel;
            callback(result);
        });
    };

    AIAnalyzer.prototype.analyzeEditSuggestions2 = function(transcript, context, callback) {
        if (!this.isConfigured()) {
            callback({ error: "API key no configurada para " + PROVIDERS[this.provider].name });
            return;
        }
        if (!transcript || transcript.trim().length === 0) {
            callback({ error: "Transcripción vacía" });
            return;
        }
        var systemMsg = (context && context.customSystemMsg) || SYSTEM_MSGS.editsuggestions2;
        var prompt = (context && context.customPrompt)
            ? context.customPrompt.replace("{TRANSCRIPT}", transcript)
            : this._buildEditSuggestions2Prompt(transcript, context);
        this._send(systemMsg, prompt, callback);
    };

    AIAnalyzer.prototype.analyzeReelProposal = function(transcript, context, callback) {
        if (!this.isConfigured()) {
            callback({ error: "API key no configurada para " + PROVIDERS[this.provider].name });
            return;
        }
        if (!transcript || transcript.trim().length === 0) {
            callback({ error: "Transcripción vacía" });
            return;
        }
        var systemMsg = (context && context.customSystemMsg) || SYSTEM_MSGS.reelproposal;
        var prompt = (context && context.customPrompt)
            ? context.customPrompt.replace("{TRANSCRIPT}", transcript)
            : this._buildReelProposalPrompt(transcript, context);
        this._send(systemMsg, prompt, callback);
    };

    // ─── Motion-Pro Analysis ──────────────────────────────────────

    AIAnalyzer.prototype._buildMotionProposalsPrompt = function(transcript) {
        var template = _getPromptTemplate("MotionPro/analysis-prompt.md", "");
        if (template) return template.replace("{TRANSCRIPT}", transcript);
        return "Analiza la siguiente transcripción.\n\nTRANSCRIPCIÓN:\n" + transcript + "\n\nIdentifica momentos para MOTION GRAPHICS.\nResponde con JSON: {\"proposals\":[{startTime,endTime,type,description,priority,transcriptSegment}]}";
    };

    AIAnalyzer.prototype.analyzeMotionProposals = function(transcript, context, callback) {
        if (!this.isConfigured()) {
            callback({ error: "API key no configurada para " + PROVIDERS[this.provider].name });
            return;
        }
        if (!transcript || transcript.trim().length === 0) {
            callback({ error: "Transcripción vacía" });
            return;
        }
        var systemMsg = (context && context.customSystemMsg) || SYSTEM_MSGS.motionProposals;
        var prompt = (context && context.customPrompt)
            ? context.customPrompt.replace("{TRANSCRIPT}", transcript)
            : this._buildMotionProposalsPrompt(transcript);
        this._send(systemMsg, prompt, callback);
    };

    // ─── Take Analysis (Recording Notes) ─────────────────────────

    AIAnalyzer.prototype._buildSegmentTexts = function(segments) {
        return segments.map(function(seg, i) {
            return "TOMA " + (i + 1) + " [" + seg.inTime.toFixed(1) + "s - " + seg.outTime.toFixed(1) + "s] " +
                "(duración: " + (seg.outTime - seg.inTime).toFixed(1) + "s):\n" +
                "Primera frase: \"" + (seg.firstPhrase || "") + "\"\n" +
                "Última frase: \"" + (seg.lastPhrase || "") + "\"\n" +
                "Transcripción completa:\n\"" + seg.fullText + "\"\n";
        }).join("\n---\n");
    };

    AIAnalyzer.prototype._buildTakeAnalysisPrompt = function(segments) {
        var segmentTexts = this._buildSegmentTexts(segments);

        return "Analiza las siguientes tomas de una grabación de clase educativa. " +
            "Cada toma está delimitada por comandos de voz del profesor (\"retoma\" para iniciar, \"pausa\" para cortar).\n\n" +
            "TOMAS:\n" + segmentTexts + "\n\n" +
            "CONCEPTOS:\n" +
            "- Un SEGMENTO es una parte temática de la clase (un concepto o idea).\n" +
            "- Una TOMA es una grabación de un segmento. Puede haber múltiples tomas del mismo segmento.\n" +
            "- Si dos tomas dicen lo mismo o casi lo mismo al inicio, son tomas repetidas del mismo segmento.\n\n" +
            "Tu tarea:\n" +
            "1. AGRUPAR las tomas que son REPETICIONES del mismo segmento temático.\n" +
            "   - Un profesor puede grabar 2-3 tomas del mismo párrafo buscando la mejor versión.\n" +
            "2. Para cada GRUPO, explicar:\n" +
            "   - ¿De qué trata? (tema/concepto)\n" +
            "   - ¿Qué varía entre cada toma? (énfasis, claridad, profundidad, errores)\n" +
            "   - CONTINUIDAD: Si una toma termina con el discurso incompleto pero otra lo completa, " +
            "indicarlo explícitamente.\n" +
            "3. Las tomas que NO son repeticiones deben aparecer como grupos de 1 sola toma.\n" +
            "4. Para cada toma, generar un COMENTARIO descriptivo para el marcador IN.\n\n" +
            "REGLAS:\n" +
            "- Los números de toma (segmentIndex) deben coincidir exactamente con los de arriba\n" +
            "- Numerar las tomas dentro de cada grupo: Toma 1, Toma 2, etc.\n" +
            "- Los comentarios deben ser concisos pero informativos\n\n" +
            "Responde ÚNICAMENTE con JSON válido:\n" +
            '{"groups":[{"topic":"","description":"","continuityNote":"","takes":[{"segmentIndex":1,"takeNumber":1,"comment":"","variation":""}]}],"totalGroups":0,"totalTakes":0,"summary":""}';
    };

    AIAnalyzer.prototype.analyzeTakes = function(segments, context, callback) {
        if (typeof context === "function") { callback = context; context = null; }
        if (!this.isConfigured()) {
            callback({ error: "IA no configurada. Configura un proveedor en Ajustes." });
            return;
        }
        if (!segments || segments.length === 0) {
            callback({ error: "No hay segmentos para analizar." });
            return;
        }
        var systemMsg = (context && context.customSystemMsg) || SYSTEM_MSGS.takeAnalysis;
        var prompt;
        if (context && context.customPrompt) {
            var segmentTexts = this._buildSegmentTexts(segments);
            prompt = context.customPrompt.replace("{SEGMENTS}", segmentTexts);
        } else {
            prompt = this._buildTakeAnalysisPrompt(segments);
        }
        this._send(systemMsg, prompt, callback);
    };

    // ─── Continuity Review (structured single-pass) ──────────────

    AIAnalyzer.prototype._buildReviewPrompt = function(reviewCtx) {
        return "Eres el editor final de una clase educativa grabada. El profesor grabó múltiples tomas " +
            "y un sistema automático seleccionó las mejores. A continuación verás:\n" +
            "1. Las TOMAS SELECCIONADAS: lo que el estudiante verá, en orden.\n" +
            "2. Las TOMAS NO SELECCIONADAS: lo que fue descartado y por qué, con su contenido completo.\n" +
            "3. CONTENIDO FUERA DE TOMAS: texto del transcript que no forma parte de ninguna toma detectada.\n\n" +
            "═══ TOMAS SELECCIONADAS (" + (reviewCtx.activeCount || 0) + " activas) ═══\n\n" +
            (reviewCtx.cutSequence || "(vacía)") + "\n\n" +
            "═══ TOMAS NO SELECCIONADAS (" + (reviewCtx.inactiveCount || 0) + " descartadas) ═══\n\n" +
            (reviewCtx.inactiveSummary || "(ninguna)") + "\n\n" +
            "═══ CONTENIDO FUERA DE TOMAS ═══\n" +
            "(Texto que el profesor dijo SIN usar palabras clave de inicio/fin como \"retomemos\", \"pausa\", conteos, etc. " +
            "El sistema no detectó estos momentos como tomas.)\n\n" +
            (reviewCtx.gapContent || "(ninguno)") + "\n\n" +
            "═══ TU TAREA ═══\n\n" +
            "A) EVALUACIÓN DE TOMAS NO SELECCIONADAS:\n" +
            "Compara el contenido completo de cada toma no seleccionada con las tomas seleccionadas.\n" +
            "¿Hay algún concepto, explicación o información ÚNICA en una toma no seleccionada " +
            "que NO aparece en NINGUNA toma seleccionada (ni siquiera con otras palabras)?\n" +
            "Solo si ese contenido es esencial para que el estudiante entienda la clase, sugiere activarla en \"adjustments\".\n" +
            "Si TODO el contenido de las no seleccionadas ya está cubierto por las seleccionadas, NO sugieras nada.\n\n" +
            "B) BÚSQUEDA DE TOMAS OCULTAS:\n" +
            "Analiza el contenido fuera de tomas. Estos son momentos donde el profesor habló " +
            "sin usar las palabras clave de inicio/fin, por lo que el sistema no los detectó como tomas.\n" +
            "Evalúa si hay contenido relevante para la clase que NO está cubierto por ninguna toma seleccionada.\n" +
            "Si lo hay, sugiere pares de marcadores IN + OUT en \"additionalMarkers\" para capturar ese contenido.\n" +
            "Ignora los comandos de voz (\"retomemos\", \"pausa\", conteos) que aparezcan en este texto.\n" +
            "Si no hay contenido valioso fuera de las tomas, NO sugieras marcadores.\n\n" +
            "REGLAS ESTRICTAS:\n" +
            "- Si las tomas seleccionadas cubren todo el contenido necesario, devuelve arrays vacíos. ESTO ES LO PREFERIDO.\n" +
            "- Máximo 3 sugerencias en total. Menos es mejor.\n" +
            "- Cada adjustment debe usar un segIndex que EXISTA en las tomas listadas.\n" +
            "- Los segIndex son los números de toma mostrados (Toma 1, Toma 2, etc.). NO uses segIndex 0.\n" +
            "- Todo par de marcadores IN/OUT adicional debe ir junto (un IN seguido de un OUT).\n" +
            "- NO sugieras activar tomas que son re-tomas de algo que ya está cubierto en las seleccionadas.\n" +
            "- NO sugieras tomas ocultas que solo contengan saludos, despedidas, charla informal o contenido trivial.\n\n" +
            "Responde ÚNICAMENTE con JSON válido:\n" +
            '{"adjustments":[{"segIndex":N,"action":"activate","reason":"qué concepto único se pierde sin esta toma"}],' +
            '"additionalMarkers":[{"type":"IN|OUT","approximateText":"cita textual del momento exacto","comment":"qué contenido valioso contiene"}],' +
            '"summary":"Objetivo de la clase: [tema]. Resultado: [evaluación breve]"}';
    };

    AIAnalyzer.prototype.reviewContinuity = function(reviewCtx, context, callback) {
        if (typeof context === "function") { callback = context; context = null; }
        if (!this.isConfigured()) {
            callback({ error: "IA no configurada. Configura un proveedor en Ajustes." });
            return;
        }
        if (!reviewCtx || (!reviewCtx.cutSequence && (reviewCtx.activeCount || 0) === 0)) {
            callback({ error: "No hay tomas para analizar." });
            return;
        }
        var systemMsg = (context && context.customSystemMsg) || SYSTEM_MSGS.supplementReview;
        var prompt;
        if (context && context.customPrompt) {
            prompt = context.customPrompt
                .replace("{SEQUENCE}", reviewCtx.cutSequence || "")
                .replace("{INACTIVE}", reviewCtx.inactiveSummary || "")
                .replace("{GAPS}", reviewCtx.gapContent || "")
                .replace("{TRANSCRIPT}", reviewCtx.gapContent || "")
                .replace("{DETECTED}", reviewCtx.cutSequence || "");
        } else {
            prompt = this._buildReviewPrompt(reviewCtx);
        }
        this._send(systemMsg, prompt, callback);
    };

    AIAnalyzer.prototype.getDefaultSupplementPrompt = function() {
        return this._buildReviewPrompt({
            cutSequence: "[TOMA 1 | 0:00 - 0:30 | 30.0s]\n\"{SEQUENCE}\"\n\n--- CORTE: 10.0s eliminados ---\n\n[TOMA 3 | 0:40 - 1:10 | 30.0s]\n\"continuación del tema...\"",
            inactiveSummary: "TOMA 2 (re-toma 1/2, hay mejor version activa) [0:30 - 0:40 | 10.0s]:\n\"{INACTIVE}\"",
            gapContent: "[1:10 - 1:25 | 15.0s]:\n\"{GAPS}\"",
            activeCount: 2,
            inactiveCount: 1,
            totalCount: 3
        });
    };

    // ─── Vision: View Classification ─────────────────────────────

    AIAnalyzer.prototype.getVisionModels = function() {
        return (PROVIDERS.ollama && PROVIDERS.ollama.visionModels) || [];
    };

    AIAnalyzer.prototype.classifyView = function(imagesBase64, visionModel, callback) {
        if (!imagesBase64 || imagesBase64.length === 0) {
            callback({ error: "No hay imágenes para clasificar." });
            return;
        }
        var savedModel = this.model;
        var savedProvider = this.provider;
        this.model = visionModel || "moondream:latest";
        this.provider = "ollama";

        var systemMsg = "Eres un clasificador de tomas de video educativo. " +
            "Tu único trabajo es determinar si el profesor está mirando a la cámara (toma a cámara) " +
            "o mirando hacia un monitor/pantalla/PC (toma a PC). " +
            "Responde ÚNICAMENTE con JSON válido, sin markdown.";

        var prompt = "Observa estos frames de una toma de clase educativa grabada. " +
            "Clasifica el tipo de toma según la posición del profesor:\n" +
            "- CAM: el profesor mira hacia la cámara, está de frente al espectador\n" +
            "- PC: el profesor mira hacia un monitor, pantalla o computadora, está de perfil o de espaldas\n\n" +
            "Responde con JSON: {\"view\":\"CAM\" o \"PC\",\"confidence\":\"alta\" o \"media\" o \"baja\"}";

        var self = this;
        this._send(systemMsg, prompt, function(result) {
            self.model = savedModel;
            self.provider = savedProvider;
            callback(result);
        }, imagesBase64);
    };

    // ─── Request config per provider ─────────────────────────────
    AIAnalyzer.prototype._getRequestConfig = function() {
        var key = this.getActiveKey();

        switch (this.provider) {
            case "anthropic":
                return {
                    hostname: "api.anthropic.com", port: 443, path: "/v1/messages", method: "POST",
                    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
                    url: "https://api.anthropic.com/v1/messages"
                };
            case "openai":
                return {
                    hostname: "api.openai.com", port: 443, path: "/v1/chat/completions", method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
                    url: "https://api.openai.com/v1/chat/completions"
                };
            case "openrouter":
                return {
                    hostname: "openrouter.ai", port: 443, path: "/api/v1/chat/completions", method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
                    url: "https://openrouter.ai/api/v1/chat/completions"
                };
            case "google":
                var gPath = "/v1beta/models/" + this.model + ":generateContent?key=" + key;
                return {
                    hostname: "generativelanguage.googleapis.com", port: 443, path: gPath, method: "POST",
                    headers: { "Content-Type": "application/json" },
                    url: "https://generativelanguage.googleapis.com" + gPath
                };
        }
    };

    // ─── Parse response per provider ─────────────────────────────
    AIAnalyzer.prototype._parseResponse = function(data, callback) {
        try {
            var response = JSON.parse(data);

            if (response.error) {
                callback({ error: response.error.message || response.error.type || JSON.stringify(response.error) });
                return;
            }

            var content = "";

            switch (this.provider) {
                case "ollama":
                    if (response.message && response.message.content) content = response.message.content;
                    break;
                case "anthropic":
                    if (response.content && response.content.length > 0) {
                        for (var i = 0; i < response.content.length; i++) {
                            if (response.content[i].type === "text") { content = response.content[i].text; break; }
                        }
                    }
                    break;
                case "openai":
                case "openrouter":
                    if (response.choices && response.choices.length > 0) content = response.choices[0].message.content;
                    break;
                case "google":
                    if (response.candidates && response.candidates.length > 0) {
                        var parts = response.candidates[0].content.parts;
                        if (parts && parts.length > 0) content = parts[0].text;
                    }
                    break;
            }

            if (!content) {
                callback({ error: "Respuesta vacía de " + PROVIDERS[this.provider].name });
                return;
            }

            var cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
            var result = JSON.parse(cleaned);
            callback(result);

        } catch(e) {
            if (window.EPLogger) EPLogger.error("ai-analyzer", "parse-response", e.message + " rawLen=" + (data ? data.length : 0));
            callback({ error: "Error al procesar respuesta: " + e.message, raw: data });
        }
    };

    // ─── Ollama request (HTTP local) ─────────────────────────────
    AIAnalyzer.prototype._requestOllama = function(body, callback) {
        var self = this;

        if (http) {
            var urlParts = this.ollamaUrl.replace("http://", "").split(":");
            var host = urlParts[0] || "localhost";
            var port = parseInt(urlParts[1]) || 11434;

            var opts = {
                hostname: host, port: port, path: "/api/chat", method: "POST",
                headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
            };

            var req = http.request(opts, function(res) {
                var data = "";
                res.on("data", function(chunk) { data += chunk; });
                res.on("end", function() { self._parseResponse(data, callback); });
            });
            req.on("error", function(e) {
                if (e.code === "ECONNREFUSED") {
                    callback({ error: "No se pudo conectar a Ollama. Asegúrate de que esté corriendo (ollama serve)." });
                } else if (e.code !== "ECONNRESET") {
                    callback({ error: "Error de conexión con Ollama: " + e.message });
                }
            });
            req.write(body);
            req.end();
            return req;
        } else {
            var xhr = new XMLHttpRequest();
            xhr.open("POST", this.ollamaUrl + "/api/chat", true);
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.onload = function() { self._parseResponse(xhr.responseText, callback); };
            xhr.onerror = function() {
                callback({ error: "No se pudo conectar a Ollama." });
            };
            xhr.send(body);
            return xhr;
        }
    };

    // ─── Node.js HTTPS request (cloud providers) ─────────────────
    AIAnalyzer.prototype._requestNode = function(body, callback) {
        var self = this;
        var config = this._getRequestConfig();
        var nodeOpts = {
            hostname: config.hostname, port: config.port,
            path: config.path, method: config.method, headers: config.headers
        };
        nodeOpts.headers["Content-Length"] = Buffer.byteLength(body);

        var req = https.request(nodeOpts, function(res) {
            var data = "";
            res.on("data", function(chunk) { data += chunk; });
            res.on("end", function() { self._parseResponse(data, callback); });
        });
        req.on("error", function(e) {
            if (e.code !== "ECONNRESET") callback({ error: "Error de conexión: " + e.message });
        });
        req.write(body);
        req.end();
        return req;
    };

    // ─── XHR request (browser fallback for cloud) ────────────────
    AIAnalyzer.prototype._requestXHR = function(body, callback) {
        var self = this;
        var config = this._getRequestConfig();
        var xhr = new XMLHttpRequest();
        xhr.open("POST", config.url, true);
        for (var h in config.headers) { xhr.setRequestHeader(h, config.headers[h]); }
        xhr.onload = function() { self._parseResponse(xhr.responseText, callback); };
        xhr.onerror = function() { callback({ error: "Error de conexión con " + PROVIDERS[self.provider].name }); };
        xhr.send(body);
        return xhr;
    };

    // ─── Fetch installed Ollama models ───────────────────────────
    AIAnalyzer.prototype.fetchOllamaModels = function(callback) {
        if (http) {
            var urlParts = this.ollamaUrl.replace("http://", "").split(":");
            var host = urlParts[0] || "localhost";
            var port = parseInt(urlParts[1]) || 11434;

            var req = http.get({ hostname: host, port: port, path: "/api/tags" }, function(res) {
                var data = "";
                res.on("data", function(chunk) { data += chunk; });
                res.on("end", function() {
                    try {
                        var resp = JSON.parse(data);
                        var models = (resp.models || []).map(function(m) {
                            return { id: m.name, label: m.name + " (" + formatSize(m.size) + ")" };
                        });
                        callback(null, models);
                    } catch(e) { callback(e.message, []); }
                });
            });
            req.on("error", function(e) { callback(e.message, []); });
        } else {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", this.ollamaUrl + "/api/tags", true);
            xhr.onload = function() {
                try {
                    var resp = JSON.parse(xhr.responseText);
                    var models = (resp.models || []).map(function(m) {
                        return { id: m.name, label: m.name + " (" + formatSize(m.size) + ")" };
                    });
                    callback(null, models);
                } catch(e) { callback(e.message, []); }
            };
            xhr.onerror = function() { callback("No se pudo conectar a Ollama", []); };
            xhr.send();
        }
    };

    function formatSize(bytes) {
        if (!bytes) return "?";
        var gb = bytes / (1024 * 1024 * 1024);
        if (gb >= 1) return gb.toFixed(1) + " GB";
        return (bytes / (1024 * 1024)).toFixed(0) + " MB";
    }

    AIAnalyzer.DEFAULT_SYSTEM_MSGS = SYSTEM_MSGS;

    AIAnalyzer.prototype.getDefaultSupertextsPrompt = function() {
        return this._buildSupertextsPrompt("{TRANSCRIPT}", {});
    };

    AIAnalyzer.prototype.getDefaultEditSuggestions2Prompt = function() {
        return this._buildEditSuggestions2Prompt("{TRANSCRIPT}", {});
    };

    AIAnalyzer.prototype.getDefaultReelProposalPrompt = function() {
        return this._buildReelProposalPrompt("{TRANSCRIPT}", {});
    };

    AIAnalyzer.prototype.getDefaultMotionProposalsPrompt = function() {
        return this._buildMotionProposalsPrompt("{TRANSCRIPT}");
    };

    AIAnalyzer.prototype.getDefaultTakeAnalysisPrompt = function() {
        var fakeSegments = [{ inTime: 0, outTime: 10, firstPhrase: "", lastPhrase: "", fullText: "{SEGMENTS}" }];
        var fullPrompt = this._buildTakeAnalysisPrompt(fakeSegments);
        return fullPrompt.replace(
            /SEGMENTOS:\n[\s\S]*?\n\nTu tarea/,
            "SEGMENTOS:\n{SEGMENTS}\n\nTu tarea"
        );
    };

    global.AIAnalyzer = AIAnalyzer;

})(window);
