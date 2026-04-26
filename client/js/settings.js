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
        var isOllama = prov === "ollama";

        var provSelect = document.getElementById("ai-provider-select");
        if (provSelect) provSelect.value = prov;

        var apiKeyGroup = document.getElementById("api-key-group");
        if (apiKeyGroup) apiKeyGroup.style.display = isOllama ? "none" : "";

        var ollamaStatus = document.getElementById("ollama-status");
        if (ollamaStatus) ollamaStatus.classList.toggle("hidden", !isOllama);

        var keyInput = document.getElementById("api-key-input");
        if (keyInput && !isOllama) {
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
            ["google", "anthropic", "openai", "openrouter"].forEach(function(p) {
                var name = AIAnalyzer.PROVIDERS[p].name;
                var hasKey = keys[p] && keys[p].length > 5;
                parts.push('<span class="' + (hasKey ? "key-ok" : "key-missing") + (p === prov ? " key-active" : "") + '">' + name + ' ' + (hasKey ? "✓" : "✗") + '</span>');
            });
            statusEl.innerHTML = parts.join("  ");
        }

        if (isOllama) checkOllamaConnection();
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
        var isOllama = state.settings.aiProvider === "ollama";

        var sttOk = stt && stt.isConfigured();
        var sttName = stt ? SpeechToText.PROVIDERS[state.settings.sttProvider].name : "STT";
        var sttLabel = sttName + (sttOk ? " ✓" : " ✗");

        var aiLabel = "";
        if (isOllama) {
            aiLabel = state.ollamaConnected ? "Ollama ✓" : "Ollama ✗";
        } else if (aiAnalyzer.isConfigured()) {
            aiLabel = info.name + " ✓";
        } else {
            aiLabel = info.name + " ✗";
        }

        var connected = sttOk && (isOllama ? state.ollamaConnected : aiAnalyzer.isConfigured());
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
    global.saveApiKey = saveApiKey;
    global.updateAIStatus = updateAIStatus;
    global.toggleSettings = toggleSettings;
    global.checkAIReady = checkAIReady;
    global._epUpdateAIStatus = updateAIStatus;
    global._epRefreshProviderUI = refreshProviderUI;
    global._epToggleSettings = toggleSettings;
    global._epCheckAIReady = checkAIReady;

})(window);
