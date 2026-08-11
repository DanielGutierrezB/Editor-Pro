/**
 * settings.js — AI provider and STT settings: save/load, UI refresh, validation
 * All functions access window._epAiAnalyzer / window._epStt at call time (set by init.js before use).
 * Exposes: window.loadSavedSettings, window.refreshProviderUI, window.checkOllamaConnection,
 *          window.saveApiKey, window.updateAIStatus, window.toggleSettings, window.checkAIReady
 */
(function(global) {
    "use strict";

    function loadSavedSettings() {
        var state = global._epState;
        var aiAnalyzer = global._epAiAnalyzer;
        var stt = global._epStt;

        var provider = localStorage.getItem("pr_provider") || "ollama";
        var model = localStorage.getItem("pr_model") || "";

        // Validate provider exists, fall back to ollama if corrupted
        if (!AIAnalyzer.PROVIDERS[provider]) provider = "ollama";

        state.settings.aiProvider = provider;
        aiAnalyzer.setProvider(provider);

        ["anthropic", "openai", "google", "openrouter"].forEach(function(p) {
            var k = localStorage.getItem("pr_key_" + p) || "";
            aiAnalyzer.setApiKey(p, k);
        });

        aiAnalyzer.setOllamaUrl(localStorage.getItem("pr_ollama_url") || "http://localhost:11434");

        if (model) {
            state.settings.aiModel = model;
            aiAnalyzer.setModel(model);
        } else {
            state.settings.aiModel = AIAnalyzer.PROVIDERS[provider].defaultModel;
            aiAnalyzer.setModel(state.settings.aiModel);
        }

        // STT settings
        var sttProv = localStorage.getItem("edupro_stt_provider") || "elevenlabs";
        // Validate STT provider exists, fall back to elevenlabs if corrupted
        if (!SpeechToText.PROVIDERS[sttProv]) sttProv = "elevenlabs";
        state.settings.sttProvider = sttProv;
        stt.setProvider(sttProv);

        var elKey = localStorage.getItem("edupro_stt_key_elevenlabs") || localStorage.getItem("edupro_stt_key") || "";
        stt.setApiKey("elevenlabs", elKey);
        var whisperKey = localStorage.getItem("edupro_stt_key_whisper_api") || "";
        stt.setApiKey("whisper_api", whisperKey);

        var sttModel = localStorage.getItem("edupro_stt_model") || SpeechToText.PROVIDERS[sttProv].defaultModel;
        stt.setModel(sttModel);
        state.settings.sttModel = sttModel;
    }

    function refreshProviderUI() {
        var state = global._epState;
        var aiAnalyzer = global._epAiAnalyzer;
        var stt = global._epStt;

        var prov = state.settings.aiProvider;
        var info = AIAnalyzer.PROVIDERS[prov];
        if (!info) { prov = "ollama"; info = AIAnalyzer.PROVIDERS[prov]; state.settings.aiProvider = prov; }
        var isOllama = prov === "ollama";
        var isClaudeCode = prov === "claude_code";
        var needsKey = !isOllama && !isClaudeCode;

        var provSelect = document.getElementById("ai-provider-select");
        if (provSelect) provSelect.value = prov;

        var apiKeyGroup = document.getElementById("api-key-group");
        if (apiKeyGroup) apiKeyGroup.style.display = needsKey ? "" : "none";

        var ollamaStatus = document.getElementById("ollama-status");
        if (ollamaStatus) ollamaStatus.classList.toggle("hidden", !isOllama);

        var ccStatus = document.getElementById("cc-status");
        if (ccStatus) ccStatus.classList.toggle("hidden", !isClaudeCode);

        var modelsRefresh = document.getElementById("btn-ai-models-refresh");
        if (modelsRefresh) modelsRefresh.classList.toggle("hidden", prov !== "anthropic");

        var keyInput = document.getElementById("api-key-input");
        if (keyInput && needsKey) {
            keyInput.placeholder = info.keyPlaceholder;
            keyInput.value = aiAnalyzer.keys[prov] || "";
        }

        var modelSelect = document.getElementById("ai-model-select");
        if (modelSelect) {
            modelSelect.innerHTML = "";
            info.models.forEach(function(m) {
                var opt = document.createElement("option");
                opt.value = m.id; opt.textContent = m.label;
                modelSelect.appendChild(opt);
            });
            modelSelect.value = state.settings.aiModel;
        }

        var statusEl = document.getElementById("api-key-status");
        if (statusEl) {
            var keys = aiAnalyzer.keys;
            var parts = [];
            var sttOk = stt && stt.isConfigured();
            var sttName = stt ? SpeechToText.PROVIDERS[state.settings.sttProvider].name : "STT";
            parts.push('<span class="' + (sttOk ? "key-ok" : "key-missing") + '">' + sttName + ' ' + (sttOk ? "✓" : "✗") + '</span>');
            parts.push('<span class="' + (state.ollamaConnected ? "key-ok" : "key-missing") + (isOllama ? " key-active" : "") + '">Ollama ' + (state.ollamaConnected ? "✓" : "✗") + '</span>');
            var ccOk = state.ccSession && state.ccSession.loggedIn;
            parts.push('<span class="' + (ccOk ? "key-ok" : "key-missing") + (isClaudeCode ? " key-active" : "") + '">Mi Claude ' + (ccOk ? "✓" : "✗") + '</span>');
            ["google", "anthropic", "openai", "openrouter"].forEach(function(p) {
                var name = AIAnalyzer.PROVIDERS[p].name;
                var hasKey = keys[p] && keys[p].length > 5;
                parts.push('<span class="' + (hasKey ? "key-ok" : "key-missing") + (p === prov ? " key-active" : "") + '">' + name + ' ' + (hasKey ? "✓" : "✗") + '</span>');
            });
            statusEl.innerHTML = parts.join("  ");
        }

        if (isOllama) checkOllamaConnection();
        if (isClaudeCode) checkClaudeCodeSession();
    }

    // ─── Claude con la sesión del usuario (CLI de Claude Code) ───

    function ccStatusText(html) {
        var el = document.getElementById("cc-status-text");
        if (el) el.innerHTML = html;
    }

    function ccSetButtons(loggedIn) {
        var login = document.getElementById("btn-cc-login");
        var logout = document.getElementById("btn-cc-logout");
        if (login) login.textContent = loggedIn ? "Cambiar de cuenta" : "Iniciar sesión";
        if (logout) logout.classList.toggle("hidden", !loggedIn);
    }

    /** Lee `claude auth status` y refleja la cuenta conectada en Ajustes. */
    function checkClaudeCodeSession(cb) {
        var state = global._epState;
        var cc = global.EPClaudeCode;

        if (!cc || !cc.isInstalled()) {
            state.ccSession = { installed: false, loggedIn: false };
            ccStatusText('<span class="ollama-disconnected">✗ Claude Code no está instalado</span>' +
                '<span class="cc-hint">Instálalo en la Terminal: npm install -g @anthropic-ai/claude-code</span>');
            ccSetButtons(false);
            updateAIStatus();
            if (cb) cb();
            return;
        }

        ccStatusText('<span class="ollama-checking">Verificando sesión...</span>');
        cc.status(function(err, st) {
            if (err || !st) {
                state.ccSession = { installed: true, loggedIn: false };
                ccStatusText('<span class="ollama-disconnected">✗ No se pudo leer la sesión</span>' +
                    '<span class="cc-hint">' + global.EPUtils.esc(err || "") + '</span>');
                ccSetButtons(false);
                updateAIStatus();
                if (cb) cb();
                return;
            }

            state.ccSession = {
                installed: true,
                loggedIn: st.loggedIn,
                email: st.email,
                orgName: st.orgName
            };

            if (st.loggedIn) {
                var who = st.email || "cuenta de Claude";
                var org = st.orgName ? " · " + st.orgName : "";
                ccStatusText('<span class="ollama-connected">✓ Sesión activa</span>' +
                    '<span class="cc-hint cc-account">Conectado como <strong>' +
                    global.EPUtils.esc(who) + '</strong>' + global.EPUtils.esc(org) + '</span>');
            } else {
                ccStatusText('<span class="ollama-disconnected">✗ Sin sesión</span>' +
                    '<span class="cc-hint">Inicia sesión con tu cuenta de Claude para usar tu plan sin API key.</span>');
            }
            ccSetButtons(st.loggedIn);
            updateAIStatus();
            if (cb) cb();
        });
    }

    /**
     * El login es OAuth en el navegador: se abre la Terminal con el comando y el
     * panel queda sondeando hasta que la sesión quede lista.
     */
    function claudeCodeLogin() {
        var state = global._epState;
        var cc = global.EPClaudeCode;
        if (!cc) return;
        if (!cc.isInstalled()) {
            if (global._epShowToast) global._epShowToast("Instala Claude Code primero: npm install -g @anthropic-ai/claude-code", "error");
            return;
        }
        var hadSession = !!(state.ccSession && state.ccSession.loggedIn);

        cc.login(function(err) {
            if (err) {
                if (global._epShowToast) global._epShowToast("No se pudo abrir el login: " + err, "error");
                return;
            }
            if (global._epShowToast) global._epShowToast("Completa el login en la Terminal que se abrió", "info");

            // Si ya había sesión, `auth status` seguiría diciendo "conectado"
            // mientras el usuario aún está en el navegador: no se puede detectar
            // el final del re-login, así que se le pide confirmar con Verificar.
            if (hadSession) {
                ccStatusText('<span class="ollama-checking">Termina el login en la Terminal y el navegador...</span>' +
                    '<span class="cc-hint">Cuando acabes, pulsa "Verificar" para comprobar la sesión.</span>');
                return;
            }

            ccStatusText('<span class="ollama-checking">Termina el login en la Terminal y el navegador...</span>' +
                '<span class="cc-hint">Esta ventana se actualiza sola al conectar.</span>');
            cc.waitForLogin({}, function(waitErr) {
                if (waitErr) {
                    checkClaudeCodeSession();
                    return;
                }
                checkClaudeCodeSession(function() {
                    if (global._epShowToast) global._epShowToast("Sesión de Claude conectada", "success");
                });
            });
        });
    }

    function claudeCodeLogout() {
        var cc = global.EPClaudeCode;
        if (!cc) return;
        ccStatusText('<span class="ollama-checking">Cerrando sesión...</span>');
        cc.logout(function(err) {
            if (err && global._epShowToast) global._epShowToast("Error al cerrar sesión: " + err, "error");
            checkClaudeCodeSession();
        });
    }

    /** Llamada real mínima: confirma que la sesión sirve para pedir respuestas. */
    function verifyClaudeCode() {
        var aiAnalyzer = global._epAiAnalyzer;
        ccStatusText('<span class="ollama-checking">Probando una respuesta de Claude...</span>');
        aiAnalyzer.verifyClaudeCode(function(err, res) {
            if (err) {
                ccStatusText('<span class="ollama-disconnected">✗ Claude respondió con error</span>' +
                    '<span class="cc-hint">' + global.EPUtils.esc(err) + '</span>');
                if (global._epShowToast) global._epShowToast("Claude no respondió: " + err, "error");
                return;
            }
            var used = res && res.model ? res.model : "";
            ccStatusText('<span class="ollama-connected">✓ Claude respondió correctamente</span>' +
                (used ? '<span class="cc-hint cc-account">Modelo usado: <strong>' +
                    global.EPUtils.esc(used) + '</strong></span>' : ""));
            if (global._epShowToast) global._epShowToast("Claude está listo", "success");
        }, function(secs) {
            // Sin el contador, una espera larga parece que el panel se colgó.
            ccStatusText('<span class="ollama-checking">Esperando a Claude... ' + secs + 's</span>' +
                '<span class="cc-hint">Máximo 30 s; si se pasa, casi siempre es la sesión caducada.</span>');
        });
    }

    /** Trae de la API los modelos que Claude ofrece hoy (proveedor con API key). */
    function refreshAnthropicModels() {
        var state = global._epState;
        var aiAnalyzer = global._epAiAnalyzer;
        if (state.settings.aiProvider !== "anthropic") return;

        if (global._epShowToast) global._epShowToast("Consultando modelos de Claude...", "info");
        aiAnalyzer.fetchAnthropicModels(function(err, models) {
            if (err) {
                if (global._epShowToast) global._epShowToast(err, "error");
                return;
            }
            AIAnalyzer.PROVIDERS.anthropic.models = models;
            var select = document.getElementById("ai-model-select");
            if (select) {
                select.innerHTML = "";
                models.forEach(function(m) {
                    var opt = document.createElement("option");
                    opt.value = m.id; opt.textContent = m.label;
                    select.appendChild(opt);
                });
                var saved = state.settings.aiModel;
                var found = models.some(function(m) { return m.id === saved; });
                if (found) {
                    select.value = saved;
                } else {
                    select.value = models[0].id;
                    state.settings.aiModel = models[0].id;
                    aiAnalyzer.setModel(models[0].id);
                    localStorage.setItem("pr_model", models[0].id);
                }
            }
            if (global._epShowToast) global._epShowToast(models.length + " modelo(s) disponibles", "success");
            updateAIStatus();
        });
    }

    function checkOllamaConnection() {
        var state = global._epState;
        var aiAnalyzer = global._epAiAnalyzer;

        var statusText = document.getElementById("ollama-status-text");
        if (statusText) statusText.innerHTML = '<span class="ollama-checking">Verificando...</span>';

        aiAnalyzer.fetchOllamaModels(function(err, models) {
            if (err || !models || models.length === 0) {
                state.ollamaConnected = false;
                if (statusText) statusText.innerHTML = '<span class="ollama-disconnected">✗ Ollama no disponible</span>';
                updateAIStatus();
                return;
            }

            state.ollamaConnected = true;
            if (statusText) statusText.innerHTML = '<span class="ollama-connected">✓ Conectado — ' + models.length + ' modelo(s)</span>';

            var modelSelect = document.getElementById("ai-model-select");
            if (modelSelect && state.settings.aiProvider === "ollama") {
                modelSelect.innerHTML = "";
                models.forEach(function(m) {
                    var opt = document.createElement("option");
                    opt.value = m.id; opt.textContent = m.label;
                    modelSelect.appendChild(opt);
                });

                var saved = state.settings.aiModel;
                var found = models.some(function(m) { return m.id === saved; });
                if (found) { modelSelect.value = saved; }
                else if (models.length > 0) {
                    modelSelect.value = models[0].id;
                    state.settings.aiModel = models[0].id;
                    aiAnalyzer.setModel(models[0].id);
                    localStorage.setItem("pr_model", models[0].id);
                }
            }
            updateAIStatus();
        });
    }

    function saveApiKey() {
        var state = global._epState;
        var aiAnalyzer = global._epAiAnalyzer;

        var prov = state.settings.aiProvider;
        if (prov === "ollama") return;
        var input = document.getElementById("api-key-input");
        var key = input ? input.value.trim() : "";
        aiAnalyzer.setApiKey(prov, key);
        localStorage.setItem("pr_key_" + prov, key);
        refreshProviderUI();
        updateAIStatus();
        if (global._epShowToast) global._epShowToast(key ? "API Key guardada" : "API Key eliminada", "success");
    }

    function updateAIStatus() {
        var state = global._epState;
        var aiAnalyzer = global._epAiAnalyzer;
        var stt = global._epStt;

        var el = document.getElementById("ai-status");
        if (!el) return;
        var info = AIAnalyzer.PROVIDERS[state.settings.aiProvider];
        if (!info) { state.settings.aiProvider = "ollama"; info = AIAnalyzer.PROVIDERS["ollama"]; }
        var isOllama = state.settings.aiProvider === "ollama";

        var sttOk = stt && stt.isConfigured();
        var sttName = stt ? SpeechToText.PROVIDERS[state.settings.sttProvider].name : "STT";
        var sttLabel = sttName + (sttOk ? " ✓" : " ✗");

        var isClaudeCode = state.settings.aiProvider === "claude_code";
        var ccReady = !!(state.ccSession && state.ccSession.loggedIn);

        var aiLabel = "";
        if (isOllama) {
            aiLabel = state.ollamaConnected ? "Ollama ✓" : "Ollama ✗";
        } else if (isClaudeCode) {
            aiLabel = "Mi Claude " + (ccReady ? "✓" : "✗");
        } else if (aiAnalyzer.isConfigured()) {
            aiLabel = info.name + " ✓";
        } else {
            aiLabel = info.name + " ✗";
        }

        var aiOk = isOllama ? state.ollamaConnected : (isClaudeCode ? ccReady : aiAnalyzer.isConfigured());
        var connected = sttOk && aiOk;
        el.innerHTML = '<span class="' + (connected ? "ai-connected" : "ai-disconnected") + '">' +
            sttLabel + ' · ' + aiLabel + '</span>';
    }

    function toggleSettings() {
        var panel = document.getElementById("settings-panel");
        if (panel) {
            panel.classList.toggle("hidden");
            if (!panel.classList.contains("hidden")) {
                // Delegate to ui-recording module for STT UI refresh
                if (global.EditorProUI && global.EditorProUI.recording) {
                    global.EditorProUI.recording.refreshSTTProviderUI();
                }
                refreshProviderUI();
            }
        }
    }

    function checkAIReady() {
        var state = global._epState;
        var aiAnalyzer = global._epAiAnalyzer;

        var isOllama = state.settings.aiProvider === "ollama";
        if (isOllama && !state.ollamaConnected) {
            if (global._epShowToast) global._epShowToast("Ollama no conectado. Ejecuta 'ollama serve'", "error");
            toggleSettings();
            return false;
        }
        if (state.settings.aiProvider === "claude_code") {
            var cc = global.EPClaudeCode;
            if (!cc || !cc.isInstalled()) {
                if (global._epShowToast) global._epShowToast("Instala Claude Code: npm install -g @anthropic-ai/claude-code", "error");
                toggleSettings();
                return false;
            }
            // Si aún no se ha leído la sesión, se deja pasar: la primera llamada
            // real dirá si hace falta iniciar sesión.
            if (state.ccSession && state.ccSession.installed && !state.ccSession.loggedIn) {
                if (global._epShowToast) global._epShowToast("Inicia sesión con tu cuenta de Claude en Ajustes", "error");
                toggleSettings();
                return false;
            }
            return true;
        }
        if (!isOllama && !aiAnalyzer.isConfigured()) {
            if (global._epShowToast) global._epShowToast("Configura tu API Key primero", "error");
            toggleSettings();
            return false;
        }
        return true;
    }

    global.loadSavedSettings = loadSavedSettings;
    global.refreshProviderUI = refreshProviderUI;
    global.checkOllamaConnection = checkOllamaConnection;
    global.checkClaudeCodeSession = checkClaudeCodeSession;
    global.claudeCodeLogin = claudeCodeLogin;
    global.claudeCodeLogout = claudeCodeLogout;
    global.verifyClaudeCode = verifyClaudeCode;
    global.refreshAnthropicModels = refreshAnthropicModels;
    global.saveApiKey = saveApiKey;
    global.updateAIStatus = updateAIStatus;
    global.toggleSettings = toggleSettings;
    global.checkAIReady = checkAIReady;
    global._epUpdateAIStatus = updateAIStatus;
    global._epRefreshProviderUI = refreshProviderUI;
    global._epToggleSettings = toggleSettings;
    global._epCheckAIReady = checkAIReady;

})(window);
