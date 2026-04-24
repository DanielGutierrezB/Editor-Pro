/**
 * provider-ui.js — AI and STT provider configuration UI
 * Handles provider selection, API key management, Ollama connection check,
 * and the settings panel. Also owns loadSavedSettings().
 * Depends on: utils.js, state.js (loaded before this)
 * Exposes: window.ProviderUI = { ... } and backward-compat window._ep* bindings
 */
(function(global) {
    "use strict";

    function _state() { return global._epState; }
    function _ai() { return global._epAiAnalyzer; }
    function _stt() { return global._epStt; }

    // ─── Settings persistence ─────────────────────────────────────

    function loadSavedSettings() {
        var ai = _ai();
        var stt = _stt();
        var st = _state();
        if (!ai || !stt || !st) return;

        var provider = localStorage.getItem("pr_provider") || "ollama";
        var model = localStorage.getItem("pr_model") || "";

        st.settings.aiProvider = provider;
        ai.setProvider(provider);

        ["anthropic", "openai", "google", "openrouter"].forEach(function(p) {
            var k = localStorage.getItem("pr_key_" + p) || "";
            ai.setApiKey(p, k);
        });

        ai.setOllamaUrl(localStorage.getItem("pr_ollama_url") || "http://localhost:11434");

        if (model) {
            st.settings.aiModel = model;
            ai.setModel(model);
        } else {
            st.settings.aiModel = global.AIAnalyzer.PROVIDERS[provider].defaultModel;
            ai.setModel(st.settings.aiModel);
        }

        // STT settings
        var sttProv = localStorage.getItem("edupro_stt_provider") || "elevenlabs";
        st.settings.sttProvider = sttProv;
        stt.setProvider(sttProv);

        var elKey = localStorage.getItem("edupro_stt_key_elevenlabs") || localStorage.getItem("edupro_stt_key") || "";
        stt.setApiKey("elevenlabs", elKey);
        var whisperKey = localStorage.getItem("edupro_stt_key_whisper_api") || "";
        stt.setApiKey("whisper_api", whisperKey);

        var sttModel = localStorage.getItem("edupro_stt_model") || global.SpeechToText.PROVIDERS[sttProv].defaultModel;
        stt.setModel(sttModel);
        st.settings.sttModel = sttModel;
    }

    // ─── Provider UI rendering ────────────────────────────────────

    function refreshProviderUI() {
        var st = _state();
        var ai = _ai();
        var stt = _stt();
        if (!st || !ai) return;

        var prov = st.settings.aiProvider;
        var info = global.AIAnalyzer.PROVIDERS[prov];
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
            keyInput.value = ai.keys[prov] || "";
        }

        var modelSelect = document.getElementById("ai-model-select");
        if (modelSelect) {
            modelSelect.innerHTML = "";
            info.models.forEach(function(m) {
                var opt = document.createElement("option");
                opt.value = m.id; opt.textContent = m.label;
                modelSelect.appendChild(opt);
            });
            modelSelect.value = st.settings.aiModel;
        }

        var statusEl = document.getElementById("api-key-status");
        if (statusEl && stt) {
            var keys = ai.keys;
            var parts = [];
            var sttOk = stt.isConfigured();
            var sttName = global.SpeechToText.PROVIDERS[st.settings.sttProvider].name;
            parts.push('<span class="' + (sttOk ? "key-ok" : "key-missing") + '">' + sttName + ' ' + (sttOk ? "✓" : "✗") + '</span>');
            parts.push('<span class="' + (st.ollamaConnected ? "key-ok" : "key-missing") + (isOllama ? " key-active" : "") + '">Ollama ' + (st.ollamaConnected ? "✓" : "✗") + '</span>');
            ["google", "anthropic", "openai", "openrouter"].forEach(function(p) {
                var name = global.AIAnalyzer.PROVIDERS[p].name;
                var hasKey = keys[p] && keys[p].length > 5;
                parts.push('<span class="' + (hasKey ? "key-ok" : "key-missing") + (p === prov ? " key-active" : "") + '">' + name + ' ' + (hasKey ? "✓" : "✗") + '</span>');
            });
            statusEl.innerHTML = parts.join("  ");
        }

        if (isOllama) checkOllamaConnection();
    }

    function checkOllamaConnection() {
        var ai = _ai();
        var st = _state();
        if (!ai || !st) return;

        var statusText = document.getElementById("ollama-status-text");
        if (statusText) statusText.innerHTML = '<span class="ollama-checking">Verificando...</span>';

        ai.fetchOllamaModels(function(err, models) {
            if (err || !models || models.length === 0) {
                st.ollamaConnected = false;
                if (statusText) statusText.innerHTML = '<span class="ollama-disconnected">✗ Ollama no disponible</span>';
                updateAIStatus();
                return;
            }

            st.ollamaConnected = true;
            if (statusText) statusText.innerHTML = '<span class="ollama-connected">✓ Conectado — ' + models.length + ' modelo(s)</span>';

            var modelSelect = document.getElementById("ai-model-select");
            if (modelSelect && st.settings.aiProvider === "ollama") {
                modelSelect.innerHTML = "";
                models.forEach(function(m) {
                    var opt = document.createElement("option");
                    opt.value = m.id; opt.textContent = m.label;
                    modelSelect.appendChild(opt);
                });

                var saved = st.settings.aiModel;
                var found = models.some(function(m) { return m.id === saved; });
                if (found) { modelSelect.value = saved; }
                else if (models.length > 0) {
                    modelSelect.value = models[0].id;
                    st.settings.aiModel = models[0].id;
                    ai.setModel(models[0].id);
                    localStorage.setItem("pr_model", models[0].id);
                }
            }
            updateAIStatus();
        });
    }

    function saveApiKey() {
        var st = _state();
        var ai = _ai();
        if (!st || !ai) return;
        var prov = st.settings.aiProvider;
        if (prov === "ollama") return;
        var input = document.getElementById("api-key-input");
        var key = input ? input.value.trim() : "";
        ai.setApiKey(prov, key);
        localStorage.setItem("pr_key_" + prov, key);
        refreshProviderUI();
        updateAIStatus();
        if (global.EPUtils) global.EPUtils.showToast(key ? "API Key guardada" : "API Key eliminada", "success");
    }

    function updateAIStatus() {
        var el = document.getElementById("ai-status");
        if (!el) return;
        var st = _state();
        var ai = _ai();
        var stt = _stt();
        if (!st || !ai) return;

        var info = global.AIAnalyzer.PROVIDERS[st.settings.aiProvider];
        var isOllama = st.settings.aiProvider === "ollama";

        var sttOk = stt && stt.isConfigured();
        var sttName = stt ? global.SpeechToText.PROVIDERS[st.settings.sttProvider].name : "STT";
        var sttLabel = sttName + (sttOk ? " ✓" : " ✗");

        var aiLabel = "";
        if (isOllama) {
            aiLabel = st.ollamaConnected ? "Ollama ✓" : "Ollama ✗";
        } else if (ai.isConfigured()) {
            aiLabel = info.name + " ✓";
        } else {
            aiLabel = info.name + " ✗";
        }

        var connected = sttOk && (isOllama ? st.ollamaConnected : ai.isConfigured());
        el.innerHTML = '<span class="' + (connected ? "ai-connected" : "ai-disconnected") + '">' +
            sttLabel + ' · ' + aiLabel + '</span>';
    }

    function toggleSettings() {
        var panel = document.getElementById("settings-panel");
        if (panel) {
            panel.classList.toggle("hidden");
            if (!panel.classList.contains("hidden")) {
                if (global.EditorProUI && global.EditorProUI.recording) global.EditorProUI.recording.refreshSTTProviderUI();
                refreshProviderUI();
            }
        }
    }

    function checkAIReady() {
        var st = _state();
        var ai = _ai();
        if (!st || !ai) return false;
        var isOllama = st.settings.aiProvider === "ollama";
        if (isOllama && !st.ollamaConnected) {
            if (global.EPUtils) global.EPUtils.showToast("Ollama no conectado. Ejecuta 'ollama serve'", "error");
            toggleSettings();
            return false;
        }
        if (!isOllama && !ai.isConfigured()) {
            if (global.EPUtils) global.EPUtils.showToast("Configura tu API Key primero", "error");
            toggleSettings();
            return false;
        }
        return true;
    }

    // ─── Expose API ───────────────────────────────────────────────

    global.ProviderUI = {
        loadSavedSettings: loadSavedSettings,
        refreshProviderUI: refreshProviderUI,
        checkOllamaConnection: checkOllamaConnection,
        saveApiKey: saveApiKey,
        updateAIStatus: updateAIStatus,
        toggleSettings: toggleSettings,
        checkAIReady: checkAIReady
    };

    // Backward-compat bindings consumed by UI modules
    global._epCheckAIReady = checkAIReady;
    global._epUpdateAIStatus = updateAIStatus;
    global._epRefreshProviderUI = refreshProviderUI;
    global._epToggleSettings = toggleSettings;

})(window);
