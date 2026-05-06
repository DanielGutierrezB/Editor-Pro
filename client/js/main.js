/**
 * Editor-Pro - Main Controller for Premiere Pro
 * Thin orchestrator: init, event binding, module delegation, auto-update.
 * Business logic lives in extracted modules (see js/ directory).
 */

(function() {
    "use strict";

    var csInterface = new CSInterface();
    window._epCSInterface = csInterface;
    var engine = null;
    var aiAnalyzer = null;
    var stt = null;
    var recorder = null;

    var fs, path, os;
    try { fs = require("fs"); path = require("path"); os = require("os"); } catch(e) {}

    var motionPro = null;
    var broll = null;

    // State is defined in state.js and exposed as window._epState before this script loads.
    var state = window._epState;

    // ─── Expose static globals for UI modules ────────────────────
    window._epFs = fs;
    window._epPath = path;
    window._epOs = os;

    // ─── Aliases for functions now in external modules ──────────
    var loadSavedSettings = function() { return window.loadSavedSettings(); };
    var refreshProviderUI = function() { return window.refreshProviderUI(); };
    var updateAIStatus = function() { return window.updateAIStatus(); };
    var refreshSequenceInfo = function() { return window.refreshSequenceInfo(); };
    var startSequencePolling = function() { return window.startSequencePolling(); };
    var toggleSeqDropdown = function() { return window.toggleSeqDropdown(); };
    var toggleSettings = function() { return window.toggleSettings(); };
    var saveApiKey = function() { return window.saveApiKey(); };
    var checkOllamaConnection = function() { return window.checkOllamaConnection(); };
    var handleJsonTranscriptSelect = function(e) { return window.handleJsonTranscriptSelect(e); };
    var checkAIReady = function() { return window.checkAIReady(); };
    var autoLoadTranscriptForSequence = function(n) { return window.autoLoadTranscriptForSequence(n); };

    // Aliases from extracted modules
    var showInfoModal = function(t, b) { return window._epShowInfoModal(t, b); };
    var hideInfoModal = function() { return window._epHideInfoModal ? window._epHideInfoModal() : undefined; };
    var showToast = function(m, t) { return window._epShowToast(m, t); };
    var showElement = function(id) { return window._epShowElement(id); };
    var hideElement = function(id) { return window._epHideElement(id); };
    var on = function(id, evt, fn) { return window._epOn(id, evt, fn); };

    // ─── Init ────────────────────────────────────────────────────
    function init() {
        if (window.EPLogger) EPLogger.log("main", "init-start", "Editor-Pro initializing");
        var extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);

        // Re-evaluar host/index.jsx para cargar funciones nuevas sin cerrar el panel
        var hostPath = extensionPath + "/host/index.jsx";
        csInterface.evalScript('$.evalFile("' + hostPath.replace(/\\/g, "/").replace(/"/g, '\\"') + '")');

        engine = new SpellCheckEngine({ extensionPath: extensionPath, uiLanguage: "es" });
        aiAnalyzer = new AIAnalyzer();
        stt = new SpeechToText();
        recorder = new RecordingNotes();
        motionPro = new MotionPro();
        broll = new BRoll();

        stt.setPluginDir(extensionPath);

        // ─── Expose init-time references for UI modules ──────────
        window._epCSInterface = csInterface;
        window._epEngine = engine;
        window._epAiAnalyzer = aiAnalyzer;
        window._epStt = stt;
        window._epRecorder = recorder;
        window._epMotionPro = motionPro;
        window._epBroll = broll;

        // Initialize UI modules (capture shared references now that _ep* globals are set)
        if (window.EditorProUI && window.EditorProUI.spellcheck && window.EditorProUI.spellcheck.init) window.EditorProUI.spellcheck.init();
        if (window.EditorProUI && window.EditorProUI.supertexts && window.EditorProUI.supertexts.init) window.EditorProUI.supertexts.init();
        if (window.EditorProUI && window.EditorProUI.editSuggestions && window.EditorProUI.editSuggestions.init) window.EditorProUI.editSuggestions.init();
        if (window.EditorProUI && window.EditorProUI.recording && window.EditorProUI.recording.init) window.EditorProUI.recording.init();

        loadSavedSettings();
        loadCustomDictionary();
        bindEvents();
        refreshTraerTranscriptButtons();
        refreshTranscriptWhisperAudioStatus();
        refreshSTTProviderUI();
        refreshProviderUI();
        updateAIStatus();
        refreshSequenceInfo();
        startSequencePolling();
        mpInit();
        brInit();

        // Initialize prompt editor
        if (window.PromptEditor && window.PromptEditor.init) window.PromptEditor.init();

        on("btn-seq-dropdown", "click", toggleSeqDropdown);
        document.addEventListener("click", function(e) {
            var panel = document.getElementById("seq-dropdown-panel");
            var btn = document.getElementById("btn-seq-dropdown");
            if (panel && !panel.classList.contains("hidden") && !panel.contains(e.target) && !btn.contains(e.target)) {
                panel.classList.add("hidden");
            }
        });

        if (window.EPLogger) EPLogger.log("main", "init-complete", "provider=" + state.settings.aiProvider + " model=" + state.settings.aiModel + " stt=" + state.settings.sttProvider);
    }

    function saveDebugLog() {
        if (!window.EPLogger) { showToast("Logger no disponible", "error"); return; }
        var downloadsDir;
        try {
            downloadsDir = path.join(os.homedir(), "Downloads");
        } catch(e) {
            showToast("No se pudo determinar la carpeta Downloads", "error");
            return;
        }
        var saved = EPLogger.saveToFile(downloadsDir);
        if (saved) {
            showToast("Log guardado: " + saved, "success");
        } else {
            showToast("Error al guardar log", "error");
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // EVENT BINDING — all UI → function connections
    // ═══════════════════════════════════════════════════════════════

    function bindEvents() {
        on("btn-save-log", "click", saveDebugLog);
        on("btn-settings", "click", toggleSettings);
        on("btn-save-api-key", "click", saveApiKey);
        on("btn-ollama-refresh", "click", checkOllamaConnection);

        on("ai-provider-select", "change", function() {
            var prov = this.value;
            state.settings.aiProvider = prov;
            aiAnalyzer.setProvider(prov);
            state.settings.aiModel = AIAnalyzer.PROVIDERS[prov].defaultModel;
            aiAnalyzer.setModel(state.settings.aiModel);
            localStorage.setItem("pr_provider", prov);
            localStorage.setItem("pr_model", state.settings.aiModel);
            refreshProviderUI();
            updateAIStatus();
            if (prov === "ollama") checkOllamaConnection();
        });

        on("ai-model-select", "change", function() {
            state.settings.aiModel = this.value;
            aiAnalyzer.setModel(this.value);
            localStorage.setItem("pr_model", this.value);
            updateAIStatus();
        });

        // Transcript — Whisper
        on("btn-load-audio-transcript", "click", function() {
            var input = document.getElementById("audio-file-input");
            if (input) input.click();
        });
        on("btn-export-seq-transcript", "click", exportFromSequence);
        on("btn-transcribe-whisper", "click", function() {
            expandSection("recording");
            startTranscription();
        });
        on("btn-bring-whisper-transcript", "click", loadLastWhisperIntoTranscript);

        // Transcript
        on("btn-fetch-captions", "click", fetchCaptionsFromSequence);
        on("btn-load-srt", "click", loadSRTFile);
        on("btn-paste-transcript", "click", pasteFromClipboard);
        on("btn-clear-transcript", "click", clearTranscript);
        var textarea = document.getElementById("transcript-input");
        if (textarea) textarea.addEventListener("input", onTranscriptChange);
        var fileInput = document.getElementById("srt-file-input");
        if (fileInput) fileInput.addEventListener("change", handleFileSelect);

        // Info modal
        on("btn-info-modal-close", "click", hideInfoModal);

        // JSON transcript import buttons
        var jsonInput = document.getElementById("json-transcript-input");
        if (jsonInput) jsonInput.addEventListener("change", handleJsonTranscriptSelect);
        on("btn-load-json-transcript", "click", function() {
            var input = document.getElementById("json-transcript-input");
            if (input) input.click();
        });
        on("btn-load-json-recording", "click", function() {
            var input = document.getElementById("json-transcript-input");
            if (input) input.click();
        });

        // SpellCheck
        on("btn-spellcheck", "click", startSpellCheck);

        // Dictionary
        on("btn-dict-add", "click", addDictWord);
        var dictInput = document.getElementById("dict-word-input");
        if (dictInput) dictInput.addEventListener("keydown", function(e) {
            if (e.key === "Enter") addDictWord();
        });

        // Smart Supertexts (MOGRT)
        on("btn-supertexts2", "click", startSupertexts2);
        on("btn-st2-select-all", "click", toggleSelectAllSupertexts2);
        on("btn-st2-create-graphics", "click", createSupertext2Graphics);
        on("btn-st2-export", "click", exportSupertexts2);
        on("btn-st2-exclude-track", "click", st2ExcludeByTrack);
        on("btn-st2-prompt-toggle", "click", function() { togglePromptEditorById("st2"); });
        on("btn-st2-prompt-save", "click", function() { savePromptById("st2"); });
        on("btn-st2-prompt-reset", "click", function() { resetPromptById("st2"); });
        document.querySelectorAll(".btn-mogrt-pick").forEach(function(btn) {
            btn.addEventListener("click", function() { selectMOGRTFile(btn.dataset.mogrtType); });
        });
        var st2TrackSel = document.getElementById("st2-track-select");
        if (st2TrackSel) st2TrackSel.addEventListener("change", function() {
            state.mogrtTrackIndex = this.value;
            localStorage.setItem("edupro_mogrt_track", this.value);
        });
        loadMOGRTConfig();

        on("mogrt-config-toggle", "click", toggleMOGRTConfig);
        on("btn-mogrt-default", "click", loadDefaultMOGRTs);
        on("btn-mogrt-folder", "click", loadMOGRTFolder);

        // Smart Supertexts — Batch
        on("btn-st2-batch", "click", st2BatchOpen);
        on("btn-st2-batch-analyze", "click", st2BatchAnalyzeAll);
        on("btn-st2-batch-create", "click", st2BatchCreateAll);
        on("btn-st2-batch-cancel", "click", st2BatchClose);
        on("btn-st2-bnav-prev", "click", st2BatchNavPrev);
        on("btn-st2-bnav-next", "click", st2BatchNavNext);
        on("btn-st2-bnav-back", "click", st2BatchNavBack);
        var st2BSelAll = document.getElementById("st2-batch-select-all");
        if (st2BSelAll) st2BSelAll.addEventListener("change", function() {
            var checked = this.checked;
            document.querySelectorAll(".st2b-check").forEach(function(cb) { cb.checked = checked; });
        });

        // Edit Suggestions — Batch
        on("btn-es2-batch", "click", es2BatchOpen);
        on("btn-es2-batch-analyze", "click", es2BatchAnalyzeAll);
        on("btn-es2-batch-cancel", "click", es2BatchClose);
        on("btn-es2-bnav-prev", "click", es2BatchNavPrev);
        on("btn-es2-bnav-next", "click", es2BatchNavNext);
        on("btn-es2-bnav-back", "click", es2BatchNavBack);
        var es2BSelAll = document.getElementById("es2-batch-select-all");
        if (es2BSelAll) es2BSelAll.addEventListener("change", function() {
            var checked = this.checked;
            document.querySelectorAll(".es2b-check").forEach(function(cb) { cb.checked = checked; });
        });

        // Edit Suggestions
        on("btn-editsuggestions2", "click", startEditSuggestions2);
        on("btn-es2-export", "click", exportEditSuggestions2);
        on("btn-es2-prompt-toggle", "click", function() { togglePromptEditorById("es2"); });
        on("btn-es2-prompt-save", "click", function() { savePromptById("es2"); });
        on("btn-es2-prompt-reset", "click", function() { resetPromptById("es2"); });

        // Reel Proposal
        on("btn-reelproposal", "click", startReelProposal);
        on("btn-rp-export", "click", exportReelProposals);
        on("btn-rp-prompt-toggle", "click", function() { togglePromptEditorById("rp"); });
        on("btn-rp-prompt-save", "click", function() { savePromptById("rp"); });
        on("btn-rp-prompt-reset", "click", function() { resetPromptById("rp"); });

        // STT provider settings
        on("stt-provider-select", "change", function() {
            var prov = this.value;
            state.settings.sttProvider = prov;
            stt.setProvider(prov);
            localStorage.setItem("edupro_stt_provider", prov);
            refreshSTTProviderUI();
            updateAIStatus();
        });
        on("btn-save-stt-key", "click", saveSTTKey);
        on("btn-whisper-refresh", "click", refreshWhisperLocalStatus);
        on("stt-model-select", "change", function() {
            state.settings.sttModel = this.value;
            stt.setModel(this.value);
            localStorage.setItem("edupro_stt_model", this.value);
        });

        // Recording Notes - Audio
        on("btn-load-audio", "click", function() {
            var input = document.getElementById("audio-file-input");
            if (input) input.click();
        });
        on("btn-export-seq", "click", exportFromSequence);
        on("btn-clear-audio", "click", clearAudio);
        var audioInput = document.getElementById("audio-file-input");
        if (audioInput) audioInput.addEventListener("change", handleAudioFileSelect);

        // Recording Notes - Transcribe / Analyze / Markers
        on("btn-transcribe", "click", startTranscription);
        on("btn-load-srt-recording", "click", function() {
            var input = document.getElementById("srt-file-input-recording");
            if (input) input.click();
        });
        var srtRecInput = document.getElementById("srt-file-input-recording");
        if (srtRecInput) srtRecInput.addEventListener("change", handleSrtRecordingSelect);
        on("btn-bring-whisper-recording", "click", loadLastWhisperIntoRecordingNotes);
        on("btn-fetch-captions-recording", "click", fetchCaptionsForRecording);
        on("btn-analyze-takes", "click", startTakeAnalysis);

        on("btn-add-supplement-markers", "click", addSupplementaryMarkers);
        on("btn-place-markers", "click", placeRecordingMarkers);
        on("btn-export-markers", "click", exportRecordingMarkers);
        on("btn-rec-cut", "click", executeRecCuts);
        on("btn-rec-cut-restore", "click", restoreRecCutBackup);
        on("btn-classify-views", "click", startViewClassification);
        on("btn-apply-views", "click", applyViewClassification);

        // Take Analysis prompt editor
        on("btn-ta-prompt-toggle", "click", function() { togglePromptEditorById("ta"); });
        on("btn-ta-prompt-save", "click", function() { savePromptById("ta"); });
        on("btn-ta-prompt-reset", "click", function() { resetPromptById("ta"); });

        // Motion-Pro
        on("btn-mp-open-studio", "click", function() {
            if (!motionPro || !motionPro.serverRunning) {
                showToast("Inicia el servidor primero", "info");
                return;
            }
            motionPro.startStudio(function(err, result) {
                if (err) console.warn("[Motion-Pro] Studio error:", err.message);
                var url = (result && result.url) || "http://localhost:3000";
                try { require("child_process").exec('open "' + url + '"'); } catch(e) {}
                var mpUI = window.EditorProUI && window.EditorProUI.motionPro;
                var _mpSessionName = (mpUI && mpUI.getSessionName) ? mpUI.getSessionName() : "global";
                showToast("Abriendo Remotion Studio (sesión: " + _mpSessionName + ")", "info");
            }, (window.EditorProUI && window.EditorProUI.motionPro && window.EditorProUI.motionPro.getOutputDir) ? window.EditorProUI.motionPro.getOutputDir() : undefined);
        });
        on("btn-mp-docs", "click", function() {
            try { require("child_process").exec('open "http://localhost:' + MotionPro.SERVER_PORT + '/docs/docs.html"'); } catch(e) {}
        });
        on("btn-mp-server-toggle", "click", mpToggleServer);
        on("btn-mp-brandfetch-save", "click", mpSaveBrandfetchKey);
        mpLoadBrandfetchKey();
        on("btn-mp-analyze", "click", mpStartAnalysis);
        on("btn-mp-select-all", "click", mpToggleSelectAll);
        on("btn-mp-generate", "click", mpStartGeneration);
        on("btn-mp-generate-cancel", "click", mpCancelGeneration);
        on("btn-mp-prompt-toggle", "click", function() { togglePromptEditorById("mp"); });
        on("btn-mp-prompt-save", "click", function() { savePromptById("mp"); });
        on("btn-mp-prompt-reset", "click", function() { resetPromptById("mp"); });

        // Generation prompts panel
        on("mp-gen-prompts-toggle", "click", mpToggleGenPromptsPanel);
        on("btn-mp-gp-save", "click", mpSaveGenPrompts);
        on("btn-mp-gp-reset", "click", mpResetGenPrompts);
        mpBindGenPromptAccordions();

        bindCollapsibles();
    }

    // ═══════════════════════════════════════════════════════════════
    // TRANSCRIPT — delegates to TranscriptManager module
    // ═══════════════════════════════════════════════════════════════

    function _TM() { return window.TranscriptManager; }

    function fetchCaptionsFromSequence() { if (_TM()) _TM().fetchCaptionsFromSequence(); }

    function loadSRTFile() {
        var fileInput = document.getElementById("srt-file-input");
        if (fileInput) fileInput.click();
    }

    function handleFileSelect(evt) { if (_TM()) _TM().handleFileSelect(evt); }
    function pasteFromClipboard() { if (_TM()) _TM().pasteFromClipboard(); }

    function clearTranscript() {
        if (_TM()) _TM().clearTranscript();
        // mpUpdateAnalyzeButton already called inside TranscriptManager.clearTranscript
    }

    function onTranscriptChange() {
        if (_TM()) _TM().onTranscriptChange();
        mpUpdateAnalyzeButton();
        brUpdateAnalyzeButton();
        if (window.EventBus) window.EventBus.emit("transcript-changed", {});
    }

    // ═══════════════════════════════════════════════════════════════
    // COLLAPSIBLES + FULLSCREEN
    // ═══════════════════════════════════════════════════════════════

    function bindCollapsibles() {
        var allHeaders = document.querySelectorAll(".tool-card-header");
        allHeaders.forEach(function(hdr) {
            hdr.addEventListener("click", function() {
                var body = hdr.nextElementSibling;
                var icon = hdr.querySelector(".toggle-icon");
                if (!body) return;
                var wasHidden = body.classList.contains("hidden");

                document.querySelectorAll(".tool-card-body").forEach(function(b) {
                    b.classList.add("hidden");
                });
                document.querySelectorAll(".toggle-icon").forEach(function(i) {
                    i.textContent = "▸";
                });

                if (wasHidden) {
                    body.classList.remove("hidden");
                    if (icon) icon.textContent = "▾";
                    if (window.EPLogger) EPLogger.log("main", "tool-open", hdr.getAttribute("data-tool") || "unknown");
                }

                refreshAllHeaderProgress();
            });
        });

        document.querySelectorAll(".rec-step-header").forEach(function(hdr) {
            hdr.addEventListener("click", function() {
                var stepNum = hdr.getAttribute("data-rec-step");
                if (window.EditorProUI && window.EditorProUI.recording) {
                    window.EditorProUI.recording.toggleRecStep(stepNum);
                }
            });
        });

        // Inject fullscreen toggle buttons into each tool card header
        document.querySelectorAll(".tool-card-header").forEach(function(hdr) {
            var fsBtn = document.createElement("button");
            fsBtn.className = "btn-fullscreen";
            fsBtn.innerHTML = "⛶";
            fsBtn.title = "Pantalla completa";
            fsBtn.addEventListener("click", function(e) {
                e.stopPropagation();
                var card = hdr.closest(".tool-card");
                if (!card) return;
                var body = hdr.nextElementSibling;

                if (card.classList.contains("fullscreen")) {
                    card.classList.remove("fullscreen");
                    fsBtn.innerHTML = "⛶";
                    fsBtn.title = "Pantalla completa";
                    document.body.style.overflow = "";
                } else {
                    if (body && body.classList.contains("hidden")) {
                        body.classList.remove("hidden");
                        var icon = hdr.querySelector(".toggle-icon");
                        if (icon) icon.textContent = "▾";
                    }
                    card.classList.add("fullscreen");
                    fsBtn.innerHTML = "✕";
                    fsBtn.title = "Salir de pantalla completa";
                    document.body.style.overflow = "hidden";
                }
            });
            var toggleIcon = hdr.querySelector(".toggle-icon");
            if (toggleIcon) {
                toggleIcon.parentNode.insertBefore(fsBtn, toggleIcon);
            } else {
                hdr.appendChild(fsBtn);
            }
        });

        // ESC key exits fullscreen
        document.addEventListener("keydown", function(e) {
            if (e.key === "Escape") {
                var fsCard = document.querySelector(".tool-card.fullscreen");
                if (fsCard) {
                    fsCard.classList.remove("fullscreen");
                    var btn = fsCard.querySelector(".btn-fullscreen");
                    if (btn) { btn.innerHTML = "⛶"; btn.title = "Pantalla completa"; }
                    document.body.style.overflow = "";
                }
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // PROXY FUNCTIONS — delegate to UI modules
    // ═══════════════════════════════════════════════════════════════

    function expandSection(tool) {
        if (window.EditorProUI && window.EditorProUI.recording && window.EditorProUI.recording.expandSection) {
            return window.EditorProUI.recording.expandSection(tool);
        }
        var hdr = document.querySelector('[data-tool="' + tool + '"]');
        if (!hdr) return;
        var body = hdr.nextElementSibling;
        var icon = hdr.querySelector(".toggle-icon");
        if (body) body.classList.remove("hidden");
        if (icon) icon.textContent = "▾";
    }

    function clearRenderedTranscript() {
        var container = document.getElementById("transcript-rendered");
        var textarea = document.getElementById("transcript-input");
        if (container) { container.innerHTML = ""; container.classList.add("hidden"); }
        if (textarea) textarea.classList.remove("hidden");
    }

    // Prompt editor delegates
    function togglePromptEditorById(id) { if (window._epTogglePromptEditorById) window._epTogglePromptEditorById(id); }
    function savePromptById(id) { if (window._epSavePromptById) window._epSavePromptById(id); }
    function resetPromptById(id) { if (window._epResetPromptById) window._epResetPromptById(id); }

    // SpellCheck delegates
    function renderSpellCheckResults() { if (window.EditorProUI && window.EditorProUI.spellcheck) window.EditorProUI.spellcheck.render(); }
    function startSpellCheck() { if (window.EditorProUI && window.EditorProUI.spellcheck) window.EditorProUI.spellcheck.start(); }
    function loadCustomDictionary() { if (window.EditorProUI && window.EditorProUI.spellcheck) window.EditorProUI.spellcheck.loadDictionary(); }
    function addDictWord() { if (window.EditorProUI && window.EditorProUI.spellcheck) window.EditorProUI.spellcheck.addDictWord(); }

    // Supertexts delegates
    function renderSupertext2Results(r) { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.render(r); }
    function startSupertexts2() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.start(); }
    function toggleSelectAllSupertexts2() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.toggleSelectAll(); }
    function createSupertext2Graphics() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.createGraphics(); }
    function exportSupertexts2() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.exportData(); }
    function st2ExcludeByTrack() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.excludeByTrack(); }
    function selectMOGRTFile(type) { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.selectMOGRTFile(type); }
    function loadMOGRTConfig() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.loadMOGRTConfig(); }
    function toggleMOGRTConfig() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.toggleMOGRTConfig(); }
    function loadDefaultMOGRTs() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.loadDefaultMOGRTs(); }
    function loadMOGRTFolder() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.loadMOGRTFolder(); }
    function st2BatchOpen() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.batchOpen(); }
    function st2BatchAnalyzeAll() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.batchAnalyzeAll(); }
    function st2BatchCreateAll() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.batchCreateAll(); }
    function st2BatchClose() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.batchClose(); }
    function st2BatchNavPrev() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.batchNavPrev(); }
    function st2BatchNavNext() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.batchNavNext(); }
    function st2BatchNavBack() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.batchNavBack(); }

    // Edit Suggestions delegates
    function es2BatchOpen() { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.batchOpen(); }
    function es2BatchAnalyzeAll() { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.batchAnalyzeAll(); }
    function es2BatchClose() { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.batchClose(); }
    function es2BatchNavPrev() { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.batchNavPrev(); }
    function es2BatchNavNext() { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.batchNavNext(); }
    function es2BatchNavBack() { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.batchNavBack(); }
    function renderES2Results(r) { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.render(r); }
    function renderReelResults(r) { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.renderReelResults(r); }
    function startEditSuggestions2() { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.start(); }
    function exportEditSuggestions2() { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.exportData(); }
    function startReelProposal() { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.startReelProposal(); }
    function exportReelProposals() { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.exportReelProposals(); }

    // Recording delegates
    function startTranscription() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.startTranscription(); }
    function exportFromSequence() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.exportFromSequence(); }
    function handleAudioFileSelect(evt) { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.handleAudioFileSelect(evt); }
    function clearAudio() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.clearAudio(); }
    function saveSTTKey() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.saveSTTKey(); }
    function startTakeAnalysis() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.startTakeAnalysis(); }
    function addSupplementaryMarkers() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.addSupplementaryMarkers(); }
    function placeRecordingMarkers() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.placeMarkers(); }
    function exportRecordingMarkers() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.exportMarkers(); }
    function executeRecCuts() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.executeRecCuts(); }
    function restoreRecCutBackup() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.restoreRecCutBackup(); }
    function startViewClassification() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.startViewClassification(); }
    function applyViewClassification() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.applyViewClassification(); }
    function handleSrtRecordingSelect(evt) { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.handleSrtRecordingSelect(evt); }
    function loadLastWhisperIntoTranscript() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.loadLastWhisperIntoTranscript(); }
    function loadLastWhisperIntoRecordingNotes() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.loadLastWhisperIntoRecordingNotes(); }
    function fetchCaptionsForRecording() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.fetchCaptionsForRecording(); }
    function refreshSTTProviderUI() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.refreshSTTProviderUI(); }
    function refreshWhisperLocalStatus() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.refreshWhisperLocalStatus(); }
    function refreshTraerTranscriptButtons() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.refreshTraerTranscriptButtons(); }
    function refreshTranscriptWhisperAudioStatus() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.refreshTranscriptWhisperAudioStatus(); }
    function setSttProgress(p, t) { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.setSttProgress(p, t); }
    function applySttResultToRecordingNotes(r, s) { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.applySttResultToRecordingNotes(r, s); }
    function renderClickableTranscript(w, n) { if (window.EditorProUI && window.EditorProUI.recording && window.EditorProUI.recording.renderClickableTranscript) window.EditorProUI.recording.renderClickableTranscript(w, n); }

    // Motion-Pro delegates
    function mpInit() { if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.init(); }
    function mpSwitchToSequence() { if (window.EditorProUI && window.EditorProUI.motionPro && window.EditorProUI.motionPro.switchToSequence) window.EditorProUI.motionPro.switchToSequence(); }

    // B-Roll delegates
    function brInit() { if (window.EditorProUI && window.EditorProUI.broll) window.EditorProUI.broll.init(); }
    function brSwitchToSequence(n) { if (window.EditorProUI && window.EditorProUI.broll && window.EditorProUI.broll.switchToSequence) window.EditorProUI.broll.switchToSequence(n); }
    function brUpdateAnalyzeButton() { if (window.EditorProUI && window.EditorProUI.broll) window.EditorProUI.broll.updateAnalyzeButton(); }
    function mpUpdateAnalyzeButton() { if (window.EditorProUI && window.EditorProUI.motionPro && window.EditorProUI.motionPro.updateAnalyzeButton) window.EditorProUI.motionPro.updateAnalyzeButton(); }
    function mpToggleServer() { if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.toggleServer(); }
    function mpStartAnalysis() { if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.startAnalysis(); }
    function mpToggleSelectAll() { if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.toggleSelectAll(); }
    function mpStartGeneration() { if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.startGeneration(); }
    function mpCancelGeneration() { if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.cancelGeneration(); }
    function mpSaveBrandfetchKey() { if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.saveBrandfetchKey(); }
    function mpLoadBrandfetchKey() { if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.loadBrandfetchKey(); }
    function mpToggleGenPromptsPanel() { if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.toggleGenPromptsPanel(); }
    function mpSaveGenPrompts() { if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.saveGenPrompts(); }
    function mpResetGenPrompts() { if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.resetGenPrompts(); }
    function mpBindGenPromptAccordions() { if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.bindGenPromptAccordions(); }

    // Progress delegates
    function setST2Progress(p, t) { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.setST2Progress(p, t); }
    function setES2Progress(p, t) { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.setES2Progress(p, t); }
    function setRPProgress(p, t) { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.setRPProgress(p, t); }

    function refreshAllHeaderProgress() {
        if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.refreshSttHeaderProgressVisibility();
        if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.refreshES2HeaderProgressVisibility();
        if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.refreshRPHeaderProgressVisibility();
        if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.refreshHeaderProgressVisibility();
        if (window.EditorProUI && window.EditorProUI.broll) window.EditorProUI.broll.refreshHeaderProgressVisibility();
    }

    // ─── Expose remaining bindings for UI modules ────────────────
    window._epBindCollapsibles = bindCollapsibles;
    window._epRefreshAllHeaderProgress = refreshAllHeaderProgress;
    window._epMP_ANTICIPATION_SECS = 0.35;

    // ═══════════════════════════════════════════════════════════════
    // AUTO-UPDATE ON RELOAD  (delegated to updater.js / EPUpdater)
    // ═══════════════════════════════════════════════════════════════

    function _checkForUpdates() {
        if (window.EPUpdater) window.EPUpdater.checkForUpdates();
    }

    function _showVersion() {
        try {
            var extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);
            if (!extensionPath) extensionPath = csInterface.getSystemPath("extension");
            if (extensionPath) {
                // Strip file:/// prefix if present (Windows CSInterface quirk)
                extensionPath = extensionPath.replace(/^file:\/{0,3}/, "");
                // Decode URI components (%20 → space)
                try { extensionPath = decodeURIComponent(extensionPath); } catch(_) {}
            }
            var versionFile = path.join(extensionPath, "VERSION");
            if (fs.existsSync(versionFile)) {
                var ver = fs.readFileSync(versionFile, "utf8").trim();
                var label = document.getElementById("version-label");
                if (label) {
                    label.textContent = "v" + ver;
                    label.title = "Editor-Pro v" + ver;
                }
            }
        } catch(e) { console.warn("[Editor-Pro] _showVersion error:", e.message); }
    }
    setTimeout(_showVersion, 500);
    setTimeout(_checkForUpdates, 5000);

    function _cleanupBeforeReload(callback) {
        try {
            if (window._epMotionPro && typeof window._epMotionPro.stopServer === "function") {
                console.log("[Editor-Pro] Stopping motion-server before reload...");
                window._epMotionPro.stopServer(function() { callback(); });
                setTimeout(callback, 2000);
                return;
            }
        } catch(_e) {}
        callback();
    }

    window.checkAndReload = function() {
        // If update already detected, apply immediately
        if (window.EPUpdater && window.EPUpdater.isUpdateAvailable()) {
            window.EPUpdater.doUpdate();
            return;
        }

        // Otherwise, check for updates first, then decide
        var btn = document.getElementById("btn-reload");
        if (btn) { btn.innerHTML = "⏳"; btn.title = "Verificando updates..."; }

        if (window.EPUpdater && window.EPUpdater.checkForUpdates) {
            window.EPUpdater.checkForUpdates(function(hasUpdate) {
                if (hasUpdate) {
                    window.EPUpdater.doUpdate();
                } else {
                    if (btn) { btn.innerHTML = "⏳"; btn.title = "Recargando..."; }
                    _cleanupBeforeReload(function() { location.reload(); });
                }
            });
        } else {
            _cleanupBeforeReload(function() { location.reload(); });
        }
    };

    // ─── Start ───────────────────────────────────────────────────
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

})();
