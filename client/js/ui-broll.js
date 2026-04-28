/**
 * Editor-Pro — B-Roll UI Orchestrator
 * Thin init + settings + accordion + session switch.
 * Proposal/generation logic in ui-broll-proposals.js, clip UI in ui-broll-clips.js.
 * v1.8.61: Refactored from god object into focused modules
 */
(function(global) {
    "use strict";

    var EP = global.EditorProUI = global.EditorProUI || {};
    var brollUI = EP.broll = EP.broll || {};

    // ── Shared references ──────────────────────────────────────────────────────
    var state, csInterface, broll, aiAnalyzer;
    var on, showToast, showElement, hideElement, disableBtn, enableBtn;
    var esc, escAttr, formatTime, checkAIReady, expandSection;
    var refreshSequenceInfo, bindCollapsibles, refreshAllHeaderProgress;

    function _el(id) { return document.getElementById(id); }

    function _initRefs() {
        state       = global._epState;
        csInterface = global._epCSInterface;
        broll       = global._epBroll;
        aiAnalyzer  = global._epAiAnalyzer;

        on                       = global._epOn;
        showToast                = global._epShowToast;
        showElement              = global._epShowElement;
        hideElement              = global._epHideElement;
        disableBtn               = global._epDisableBtn;
        enableBtn                = global._epEnableBtn;
        esc                      = global._epEsc;
        escAttr                  = global._epEscAttr;
        formatTime               = global._epFormatTime;
        checkAIReady             = global._epCheckAIReady;
        expandSection            = global._epExpandSection;
        refreshSequenceInfo      = global._epRefreshSequenceInfo;
        bindCollapsibles         = global._epBindCollapsibles;
        refreshAllHeaderProgress = global._epRefreshAllHeaderProgress;
    }

    // ── Server status ──────────────────────────────────────────────────────────

    function _setDotStatus(dotId, textId, online, label) {
        var dot = _el(dotId); var text = _el(textId);
        if (dot) dot.className = "br-server-dot " + (online ? "br-dot-on" : "br-dot-off");
        if (text) text.textContent = label;
    }

    var _serverCheckRetries = 0;

    function _refreshServerStatus() {
        if (!broll) return;
        broll.checkServer(function(ok) {
            if (!ok && _serverCheckRetries < 3) {
                _serverCheckRetries++;
                setTimeout(_refreshServerStatus, 2000);
                _setDotStatus("br-dep-server-dot", "br-dep-server-text", false, "Motion Server — iniciando...");
                return;
            }
            _serverCheckRetries = 0;
            _setDotStatus("br-dep-server-dot", "br-dep-server-text", ok, ok ? "Motion Server (:3847)" : "Motion Server — detenido");
        });

        var settings = broll.getSettings();
        var comfyRow = _el("br-dep-comfy-row");

        if (settings.imageProvider === "comfyui") {
            if (comfyRow) comfyRow.style.display = "";
            var comfyUrl = settings.imageEndpointUrl || "http://localhost:8188";
            broll._get("/api/broll/check-comfyui?url=" + encodeURIComponent(comfyUrl), function(err, result) {
                _setDotStatus("br-dep-comfy-dot", "br-dep-comfy-text",
                    !err && result && result.ok,
                    !err && result && result.ok ? "ComfyUI (" + (result.device || "?") + ")" : "ComfyUI — " + (err ? "detenido" : (result && result.error || "no conecta")));
            });
        } else if (settings.imageProvider === "gemini_image") {
            if (comfyRow) comfyRow.style.display = "";
            var hasKey = !!(settings.imageGeminiApiKey && settings.imageGeminiApiKey.trim());
            _setDotStatus("br-dep-comfy-dot", "br-dep-comfy-text", hasKey, hasKey ? "Gemini Flash Image — API key configurada" : "Gemini Flash Image — falta API key");
        } else if (settings.imageProvider === "fal") {
            if (comfyRow) comfyRow.style.display = "";
            var hasFalKey = !!(settings.imageFalApiKey && settings.imageFalApiKey.trim());
            _setDotStatus("br-dep-comfy-dot", "br-dep-comfy-text", hasFalKey, hasFalKey ? "FAL.ai — API key configurada" : "FAL.ai — falta API key");
        } else {
            if (comfyRow) comfyRow.style.display = "none";
        }

        var vidRow = _el("br-dep-vid-row");
        if (settings.videoProvider === "gemini_video") {
            if (vidRow) vidRow.style.display = "";
            var hasVidKey = !!(settings.videoGeminiApiKey && settings.videoGeminiApiKey.trim());
            _setDotStatus("br-dep-vid-dot", "br-dep-vid-text", hasVidKey, hasVidKey ? "Gemini Veo — OK" : "Gemini Veo — falta API key");
        } else if (settings.videoProvider === "fal") {
            if (vidRow) vidRow.style.display = "";
            var hasVFal = !!(settings.videoFalApiKey && settings.videoFalApiKey.trim());
            _setDotStatus("br-dep-vid-dot", "br-dep-vid-text", hasVFal, hasVFal ? "FAL.ai video — OK" : "FAL.ai video — falta API key");
        } else {
            if (vidRow) vidRow.style.display = "none";
        }

        try {
            require("child_process").exec("ffmpeg -version 2>/dev/null || /opt/homebrew/bin/ffmpeg -version 2>/dev/null", { timeout: 3000 }, function(err) {
                _setDotStatus("br-dep-ffmpeg-dot", "br-dep-ffmpeg-text", !err, !err ? "ffmpeg ✓" : "ffmpeg — no instalado");
            });
        } catch(e) {
            _setDotStatus("br-dep-ffmpeg-dot", "br-dep-ffmpeg-text", false, "ffmpeg — error");
        }
    }

    // ── Settings ───────────────────────────────────────────────────────────────

    var _falModelsLoaded = {};

    function _loadSettingsUI() {
        if (!broll) return;
        var s = broll.getSettings();
        _setSelectVal("br-img-provider", s.imageProvider);
        _setInputVal("br-img-endpoint", s.imageEndpointUrl);
        _setInputVal("br-img-gemini-key", s.imageGeminiApiKey);
        _setInputVal("br-img-fal-key", s.imageFalApiKey);
        _setSelectVal("br-vid-provider", s.videoProvider);
        _setInputVal("br-vid-endpoint", s.videoEndpointUrl);
        _setInputVal("br-vid-kling-key", s.videoKlingApiKey);
        _setInputVal("br-vid-fal-key", s.videoFalApiKey);
        _setInputVal("br-vid-gemini-key", s.videoGeminiApiKey);
        _setSelectVal("br-track-select", s.trackIndex);
        _refreshSettingsVisibility();

        if (s.imageProvider === "fal" && s.imageFalModel) {
            var imgSel = _el("br-img-fal-model");
            if (imgSel) imgSel.innerHTML = '<option value="' + s.imageFalModel + '">' + s.imageFalModel + ' (cargando...)</option>';
        }
        if (s.videoProvider === "fal" && s.videoFalModel) {
            var vidSel = _el("br-vid-fal-model");
            if (vidSel) vidSel.innerHTML = '<option value="' + s.videoFalModel + '">' + s.videoFalModel + ' (cargando...)</option>';
        }
        if (s.imageProvider === "fal" || s.videoProvider === "fal") {
            setTimeout(function() {
                if (s.imageProvider === "fal") _loadFalModels("text-to-image", "br-img-fal-model", s.imageFalModel);
                if (s.videoProvider === "fal") _loadFalModels("image-to-video", "br-vid-fal-model", s.videoFalModel);
            }, 2500);
        }
    }

    function _loadFalModels(category, selectId, savedValue, attempt) {
        var sel = _el(selectId); if (!sel) return;
        attempt = attempt || 1;
        if (_falModelsLoaded[category]) { _populateFalSelect(sel, _falModelsLoaded[category], savedValue); return; }
        sel.innerHTML = '<option value="">Cargando modelos...</option>';
        if (!broll) return;
        broll._get("/api/broll/fal-models?category=" + encodeURIComponent(category), function(err, result) {
            if (err || !result || !result.models || result.models.length === 0) {
                if (attempt < 3) { setTimeout(function() { _loadFalModels(category, selectId, savedValue, attempt + 1); }, 3000); }
                else if (savedValue) { sel.innerHTML = '<option value="' + savedValue + '">' + savedValue + '</option>'; }
                return;
            }
            _falModelsLoaded[category] = result.models;
            _populateFalSelect(sel, result.models, savedValue);
        });
    }

    function _populateFalSelect(sel, models, savedValue) {
        sel.innerHTML = "";
        for (var i = 0; i < models.length; i++) {
            var opt = document.createElement("option");
            opt.value = models[i].id; opt.textContent = models[i].name;
            sel.appendChild(opt);
        }
        if (savedValue) sel.value = savedValue;
    }

    function _refreshSettingsVisibility() {
        var imgProv = _getSelectVal("br-img-provider");
        _toggleEl("br-img-endpoint-row", imgProv === "comfyui");
        _toggleEl("br-img-gemini-key-row", imgProv === "gemini_image");
        _toggleEl("br-img-fal-key-row", imgProv === "fal");
        _toggleEl("br-img-fal-model-row", imgProv === "fal");
        if (imgProv === "fal" && !_falModelsLoaded["text-to-image"]) _loadFalModels("text-to-image", "br-img-fal-model", broll ? broll.getSettings().imageFalModel : "");

        var vidProv = _getSelectVal("br-vid-provider");
        _toggleEl("br-vid-gemini-key-row", vidProv === "gemini_video");
        _toggleEl("br-vid-fal-key-row", vidProv === "fal");
        _toggleEl("br-vid-fal-model-row", vidProv === "fal");
        if (vidProv === "fal" && !_falModelsLoaded["image-to-video"]) _loadFalModels("image-to-video", "br-vid-fal-model", broll ? broll.getSettings().videoFalModel : "");
    }

    function saveSettings() {
        if (!broll) return;
        broll.saveSettings({
            imageProvider: _getSelectVal("br-img-provider"),
            imageEndpointUrl: _getInputVal("br-img-endpoint"),
            imageGeminiApiKey: _getInputVal("br-img-gemini-key"),
            imageFalModel: _getSelectVal("br-img-fal-model"),
            imageFalApiKey: _getInputVal("br-img-fal-key"),
            videoProvider: _getSelectVal("br-vid-provider"),
            videoEndpointUrl: _getInputVal("br-vid-endpoint"),
            videoKlingApiKey: _getInputVal("br-vid-kling-key"),
            videoFalModel: _getSelectVal("br-vid-fal-model"),
            videoFalApiKey: _getInputVal("br-vid-fal-key"),
            videoGeminiApiKey: _getInputVal("br-vid-gemini-key"),
            trackIndex: _getSelectVal("br-track-select")
        });
        showToast("Configuración B-Roll guardada", "success");
        _refreshServerStatus();
    }

    function _setSelectVal(id, val) { var el = _el(id); if (el && val !== undefined) el.value = val; }
    function _setInputVal(id, val) { var el = _el(id); if (el && val !== undefined) el.value = val; }
    function _getSelectVal(id) { var el = _el(id); return el ? el.value : ""; }
    function _getInputVal(id) { var el = _el(id); return el ? el.value : ""; }
    function _toggleEl(id, show) { var el = _el(id); if (el) el.style.display = show ? "" : "none"; }

    // ── Session switch ─────────────────────────────────────────────────────────

    function switchToSequence(seqName) {
        if (!broll) return;
        // Cancel any in-progress generation when switching sequences (Bug fix: race condition)
        if (broll.generating) { broll.generateCancelRequested = true; }
        brollUI._setSessionKey(seqName || "");
        broll.loadState(seqName || "");
        brollUI.renderNoTranscript();
        _refreshServerStatus();
        brollUI.renderProposals(broll.proposals);
        if (brollUI._renderClips) brollUI._renderClips();
        var step2 = _el("br-proposals-section");
        if (step2) step2.style.display = broll.proposals.length > 0 ? "" : "none";
        var step3 = _el("br-clips-section");
        if (step3) step3.style.display = broll.clips.length > 0 ? "" : "none";
    }

    function updateAnalyzeButton() {
        brollUI.renderNoTranscript();
        _refreshServerStatus();
    }

    // ── Init ───────────────────────────────────────────────────────────────────

    function init() {
        _initRefs();

        // Pass refs to sub-modules
        var refs = {
            state: state, csInterface: csInterface, broll: broll, aiAnalyzer: aiAnalyzer,
            on: on, showToast: showToast, showElement: showElement, hideElement: hideElement,
            disableBtn: disableBtn, enableBtn: enableBtn, esc: esc, escAttr: escAttr,
            formatTime: formatTime, checkAIReady: checkAIReady, expandSection: expandSection,
            refreshAllHeaderProgress: refreshAllHeaderProgress
        };
        if (brollUI._initProposalRefs) brollUI._initProposalRefs(refs);
        if (brollUI._initClipRefs) brollUI._initClipRefs(refs);

        _loadSettingsUI();
        brollUI.renderNoTranscript();
        _refreshServerStatus();

        // Bind events
        on("btn-br-analyze", "click", brollUI.startAnalysis);
        on("btn-br-select-all", "click", brollUI.toggleSelectAll);
        on("btn-br-generate", "click", brollUI.startGeneration);
        on("btn-br-stop", "click", brollUI.cancelGeneration);
        on("btn-br-animate-selected", "click", brollUI.startBatchAnimate);
        on("btn-br-select-all-clips", "click", brollUI.toggleSelectAllClips);
        on("btn-br-save-settings", "click", saveSettings);

        var imgProv = _el("br-img-provider");
        if (imgProv) imgProv.addEventListener("change", _refreshSettingsVisibility);
        var vidProv = _el("br-vid-provider");
        if (vidProv) vidProv.addEventListener("change", _refreshSettingsVisibility);

        // Step accordion — only one open at a time
        var stepHeaders = document.querySelectorAll("[data-br-step]");
        stepHeaders.forEach(function(hdr) {
            if (!hdr.classList.contains("rec-step-header")) return;
            hdr.addEventListener("click", function() {
                var stepNum = hdr.getAttribute("data-br-step");
                var body = _el("br-step-body-" + stepNum); if (!body) return;
                var wasHidden = body.classList.contains("hidden");
                stepHeaders.forEach(function(o) {
                    if (!o.classList.contains("rec-step-header")) return;
                    var oBody = _el("br-step-body-" + o.getAttribute("data-br-step"));
                    var oArrow = o.querySelector(".rec-step-arrow");
                    if (oBody) oBody.classList.add("hidden");
                    if (oArrow) oArrow.textContent = "▸";
                });
                if (wasHidden) {
                    body.classList.remove("hidden");
                    var arrow = hdr.querySelector(".rec-step-arrow"); if (arrow) arrow.textContent = "▾";
                }
            });
        });

        // Settings toggle
        on("br-settings-toggle", "click", function() {
            var body = _el("br-settings-body"); if (!body) return;
            body.classList.toggle("hidden");
        });

        on("btn-br-img-fal-reload", "click", function() { delete _falModelsLoaded["text-to-image"]; _loadFalModels("text-to-image", "br-img-fal-model", broll ? broll.getSettings().imageFalModel : ""); });
        on("btn-br-vid-fal-reload", "click", function() { delete _falModelsLoaded["image-to-video"]; _loadFalModels("image-to-video", "br-vid-fal-model", broll ? broll.getSettings().videoFalModel : ""); });

        // FIX Bug 3: Timecode click delegation — set up ONCE here, not inside _renderClips
        var brClipsList = _el("br-clips-list");
        if (brClipsList) {
            brClipsList.addEventListener("click", function(e) {
                var link = e.target.closest ? e.target.closest(".br-timecode-link") : null;
                if (!link) {
                    var t = e.target;
                    while (t && t !== brClipsList) {
                        if (t.classList && t.classList.contains("br-timecode-link")) { link = t; break; }
                        t = t.parentElement;
                    }
                }
                if (link && link.dataset.time) {
                    e.stopPropagation();
                    brollUI._navigateToTime(link.dataset.time);
                }
            });
        }

        // EventBus subscriptions
        if (window.EventBus) {
            window.EventBus.on("sequence-changed", function(data) { switchToSequence(data.name); });
            window.EventBus.on("sequence-first-load", function(data) { switchToSequence(data.name); });
            window.EventBus.on("state-restored", function() { brollUI.renderNoTranscript(); _refreshServerStatus(); });
            window.EventBus.on("transcript-changed", function() { brollUI.renderNoTranscript(); });
        }
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    brollUI.init = init;
    brollUI.saveSettings = saveSettings;
    brollUI.switchToSequence = switchToSequence;
    brollUI.updateAnalyzeButton = updateAnalyzeButton;
    brollUI.refreshHeaderProgressVisibility = function() {
        var wrap = _el("br-progress-header");
        if (wrap && !(broll && broll.generating)) wrap.classList.add("hidden");
    };

})(window);
