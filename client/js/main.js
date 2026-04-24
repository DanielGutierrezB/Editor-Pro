/**
 * Editor-Pro v2.0.0 — Main Controller
 * Cutter + SpellCheck + Smart Supertexts + Edit Suggestions + Recording Notes + Motion-Pro
 *
 * This file is the app coordinator: it creates module instances, wires events,
 * and provides thin proxy functions to UI modules. Business logic lives in:
 *   utils.js, state.js, transcript-parser.js, transcript-manager.js,
 *   prompt-editor.js, sequence-manager.js, provider-ui.js
 */
(function() {
    "use strict";

    var csInterface = new CSInterface();
    window._epCSInterface = csInterface;

    var engine = null;
    var aiAnalyzer = null;
    var stt = null;
    var recorder = null;
    var motionPro = null;

    var fs, path, os;
    try { fs = require("fs"); path = require("path"); os = require("os"); } catch(e) {}

    // Expose Node.js refs for modules that need them
    window._epFs = fs;
    window._epPath = path;
    window._epOs = os;

    // Motion-Pro constants consumed by UI modules
    window._epMP_ANTICIPATION_SECS = 0.35;

    // ─── Init ─────────────────────────────────────────────────────

    function init() {
        if (window.EPLogger) EPLogger.log("main", "init-start", "Editor-Pro v2.0.0 initializing");
        var extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);

        // Load host/index.jsx
        csInterface.evalScript('$.evalFile("' + extensionPath.replace(/\\/g, "/").replace(/"/g, '\\"') + '/host/index.jsx")');

        // Create module instances
        engine = new SpellCheckEngine({ extensionPath: extensionPath, uiLanguage: "es" });
        aiAnalyzer = new AIAnalyzer();
        stt = new SpeechToText();
        recorder = new RecordingNotes();
        motionPro = new MotionPro();

        stt.setPluginDir(extensionPath);

        // Expose instances for other modules
        window._epEngine = engine;
        window._epAiAnalyzer = aiAnalyzer;
        window._epStt = stt;
        window._epRecorder = recorder;
        window._epMotionPro = motionPro;

        // Init UI modules (must come after instance refs are set)
        var EP = window.EditorProUI;
        if (EP && EP.spellcheck && EP.spellcheck.init) EP.spellcheck.init();
        if (EP && EP.spellcheck && EP.spellcheck.loadDictionary) EP.spellcheck.loadDictionary();
        if (EP && EP.supertexts && EP.supertexts.init) EP.supertexts.init();
        if (EP && EP.editSuggestions && EP.editSuggestions.init) EP.editSuggestions.init();
        if (EP && EP.recording && EP.recording.init) EP.recording.init();

        // Load persisted settings (provider, API keys, STT)
        if (window.ProviderUI) window.ProviderUI.loadSavedSettings();

        // Init prompt editors now that AIAnalyzer instance is available
        if (window.PromptEditor) window.PromptEditor.init();

        // Bind all UI events
        bindEvents();

        // Refresh UI state
        refreshUI();

        // Init sequence polling
        if (window.SequenceManager) {
            window.SequenceManager.refreshSequenceInfo();
            window.SequenceManager.startSequencePolling();
        }

        // Motion-Pro init (delegates to ui-motion-pro.js)
        if (EP && EP.motionPro && EP.motionPro.init) EP.motionPro.init();

        // Sequence dropdown close-on-outside-click
        if (window.EPUtils) window.EPUtils.on("btn-seq-dropdown", "click", function() {
            if (window.SequenceManager) window.SequenceManager.toggleSeqDropdown();
        });
        document.addEventListener("click", function(e) {
            var panel = document.getElementById("seq-dropdown-panel");
            var btn = document.getElementById("btn-seq-dropdown");
            if (panel && !panel.classList.contains("hidden") && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
                panel.classList.add("hidden");
            }
        });

        if (window.EPLogger) EPLogger.log("main", "init-complete", "provider=" + window._epState.settings.aiProvider);
    }

    function refreshUI() {
        if (window.ProviderUI) {
            window.ProviderUI.refreshProviderUI();
            window.ProviderUI.updateAIStatus();
        }
        if (window.EditorProUI && window.EditorProUI.recording) {
            window.EditorProUI.recording.refreshTraerTranscriptButtons();
            window.EditorProUI.recording.refreshTranscriptWhisperAudioStatus();
            window.EditorProUI.recording.refreshSTTProviderUI();
        }
    }

    function saveDebugLog() {
        if (!window.EPLogger) { if (window.EPUtils) window.EPUtils.showToast("Logger no disponible", "error"); return; }
        var downloadsDir;
        try { downloadsDir = path.join(os.homedir(), "Downloads"); } catch(e) {
            if (window.EPUtils) window.EPUtils.showToast("No se pudo determinar la carpeta Downloads", "error");
            return;
        }
        var saved = EPLogger.saveToFile(downloadsDir);
        if (window.EPUtils) window.EPUtils.showToast(saved ? "Log guardado: " + saved : "Error al guardar log", saved ? "success" : "error");
    }

    // ─── Event binding ────────────────────────────────────────────

    function bindEvents() {
        var on = window.EPUtils ? window.EPUtils.on : function() {};

        on("btn-save-log", "click", saveDebugLog);
        on("btn-settings", "click", function() { if (window.ProviderUI) window.ProviderUI.toggleSettings(); });
        on("btn-save-api-key", "click", function() { if (window.ProviderUI) window.ProviderUI.saveApiKey(); });
        on("btn-ollama-refresh", "click", function() { if (window.ProviderUI) window.ProviderUI.checkOllamaConnection(); });

        on("ai-provider-select", "change", function() {
            var st = window._epState;
            var prov = this.value;
            st.settings.aiProvider = prov;
            aiAnalyzer.setProvider(prov);
            st.settings.aiModel = window.AIAnalyzer.PROVIDERS[prov].defaultModel;
            aiAnalyzer.setModel(st.settings.aiModel);
            localStorage.setItem("pr_provider", prov);
            localStorage.setItem("pr_model", st.settings.aiModel);
            if (window.ProviderUI) { window.ProviderUI.refreshProviderUI(); window.ProviderUI.updateAIStatus(); }
            if (prov === "ollama" && window.ProviderUI) window.ProviderUI.checkOllamaConnection();
        });

        on("ai-model-select", "change", function() {
            var st = window._epState;
            st.settings.aiModel = this.value;
            aiAnalyzer.setModel(this.value);
            localStorage.setItem("pr_model", this.value);
            if (window.ProviderUI) window.ProviderUI.updateAIStatus();
        });

        // Transcript — Whisper shortcut from transcript card
        on("btn-load-audio-transcript", "click", function() {
            var input = document.getElementById("audio-file-input");
            if (input) input.click();
        });
        on("btn-export-seq-transcript", "click", function() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.exportFromSequence(); });
        on("btn-transcribe-whisper", "click", function() {
            if (window.EPUtils) window.EPUtils.expandSection("recording");
            if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.startTranscription();
        });
        on("btn-bring-whisper-transcript", "click", function() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.loadLastWhisperIntoTranscript(); });

        // Transcript card
        on("btn-fetch-captions", "click", function() { if (window.TranscriptManager) window.TranscriptManager.fetchCaptionsFromSequence(); });
        on("btn-load-srt", "click", function() { var el = document.getElementById("srt-file-input"); if (el) el.click(); });
        on("btn-paste-transcript", "click", function() { if (window.TranscriptManager) window.TranscriptManager.pasteFromClipboard(); });
        on("btn-clear-transcript", "click", function() { if (window.TranscriptManager) window.TranscriptManager.clearTranscript(); });

        var textarea = document.getElementById("transcript-input");
        if (textarea) textarea.addEventListener("input", function() { if (window.TranscriptManager) window.TranscriptManager.onTranscriptChange(); });

        var fileInput = document.getElementById("srt-file-input");
        if (fileInput) fileInput.addEventListener("change", function(evt) { if (window.TranscriptManager) window.TranscriptManager.handleFileSelect(evt); });

        // Info modal
        on("btn-info-modal-close", "click", function() { if (window.EPUtils) window.EPUtils.hideInfoModal(); });

        // JSON transcript
        var jsonInput = document.getElementById("json-transcript-input");
        if (jsonInput) jsonInput.addEventListener("change", function(evt) { if (window.TranscriptManager) window.TranscriptManager.handleJsonTranscriptSelect(evt); });
        on("btn-load-json-transcript", "click", function() { var el = document.getElementById("json-transcript-input"); if (el) el.click(); });
        on("btn-load-json-recording", "click", function() { var el = document.getElementById("json-transcript-input"); if (el) el.click(); });

        // SpellCheck
        on("btn-spellcheck", "click", function() { if (window.EditorProUI && window.EditorProUI.spellcheck) window.EditorProUI.spellcheck.start(); });
        on("btn-dict-add", "click", function() { if (window.EditorProUI && window.EditorProUI.spellcheck) window.EditorProUI.spellcheck.addDictWord(); });
        var dictInput = document.getElementById("dict-word-input");
        if (dictInput) dictInput.addEventListener("keydown", function(e) {
            if (e.key === "Enter" && window.EditorProUI && window.EditorProUI.spellcheck) window.EditorProUI.spellcheck.addDictWord();
        });

        // Smart Supertexts
        on("btn-supertexts2", "click", function() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.start(); });
        on("btn-st2-select-all", "click", function() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.toggleSelectAll(); });
        on("btn-st2-create-graphics", "click", function() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.createGraphics(); });
        on("btn-st2-export", "click", function() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.exportData(); });
        on("btn-st2-exclude-track", "click", function() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.excludeByTrack(); });
        on("btn-st2-prompt-toggle", "click", function() { if (window.PromptEditor) window.PromptEditor.toggle("st2"); });
        on("btn-st2-prompt-save", "click", function() { if (window.PromptEditor) window.PromptEditor.save("st2"); });
        on("btn-st2-prompt-reset", "click", function() { if (window.PromptEditor) window.PromptEditor.reset("st2"); });
        document.querySelectorAll(".btn-mogrt-pick").forEach(function(btn) {
            btn.addEventListener("click", function() {
                if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.selectMOGRTFile(btn.dataset.mogrtType);
            });
        });
        var st2TrackSel = document.getElementById("st2-track-select");
        if (st2TrackSel) st2TrackSel.addEventListener("change", function() {
            window._epState.mogrtTrackIndex = this.value;
            localStorage.setItem("edupro_mogrt_track", this.value);
        });
        if (window.EditorProUI && window.EditorProUI.supertexts && window.EditorProUI.supertexts.loadMOGRTConfig) window.EditorProUI.supertexts.loadMOGRTConfig();
        on("mogrt-config-toggle", "click", function() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.toggleMOGRTConfig(); });
        on("btn-mogrt-folder", "click", function() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.loadMOGRTFolder(); });

        // Smart Supertexts — Batch
        on("btn-st2-batch", "click", function() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.batchOpen(); });
        on("btn-st2-batch-analyze", "click", function() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.batchAnalyzeAll(); });
        on("btn-st2-batch-create", "click", function() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.batchCreateAll(); });
        on("btn-st2-batch-cancel", "click", function() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.batchClose(); });
        on("btn-st2-bnav-prev", "click", function() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.batchNavPrev(); });
        on("btn-st2-bnav-next", "click", function() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.batchNavNext(); });
        on("btn-st2-bnav-back", "click", function() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.batchNavBack(); });
        var st2BSelAll = document.getElementById("st2-batch-select-all");
        if (st2BSelAll) st2BSelAll.addEventListener("change", function() {
            var checked = this.checked;
            document.querySelectorAll(".st2b-check").forEach(function(cb) { cb.checked = checked; });
        });

        // Edit Suggestions
        on("btn-editsuggestions2", "click", function() { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.start(); });
        on("btn-es2-export", "click", function() { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.exportData(); });
        on("btn-es2-prompt-toggle", "click", function() { if (window.PromptEditor) window.PromptEditor.toggle("es2"); });
        on("btn-es2-prompt-save", "click", function() { if (window.PromptEditor) window.PromptEditor.save("es2"); });
        on("btn-es2-prompt-reset", "click", function() { if (window.PromptEditor) window.PromptEditor.reset("es2"); });

        // Edit Suggestions — Batch
        on("btn-es2-batch", "click", function() { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.batchOpen(); });
        on("btn-es2-batch-analyze", "click", function() { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.batchAnalyzeAll(); });
        on("btn-es2-batch-cancel", "click", function() { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.batchClose(); });
        on("btn-es2-bnav-prev", "click", function() { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.batchNavPrev(); });
        on("btn-es2-bnav-next", "click", function() { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.batchNavNext(); });
        on("btn-es2-bnav-back", "click", function() { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.batchNavBack(); });
        var es2BSelAll = document.getElementById("es2-batch-select-all");
        if (es2BSelAll) es2BSelAll.addEventListener("change", function() {
            var checked = this.checked;
            document.querySelectorAll(".es2b-check").forEach(function(cb) { cb.checked = checked; });
        });

        // Reel Proposal
        on("btn-reelproposal", "click", function() { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.startReelProposal(); });
        on("btn-rp-export", "click", function() { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.exportReelProposals(); });
        on("btn-rp-prompt-toggle", "click", function() { if (window.PromptEditor) window.PromptEditor.toggle("rp"); });
        on("btn-rp-prompt-save", "click", function() { if (window.PromptEditor) window.PromptEditor.save("rp"); });
        on("btn-rp-prompt-reset", "click", function() { if (window.PromptEditor) window.PromptEditor.reset("rp"); });

        // STT provider settings
        on("stt-provider-select", "change", function() {
            var st = window._epState;
            var prov = this.value;
            st.settings.sttProvider = prov;
            stt.setProvider(prov);
            localStorage.setItem("edupro_stt_provider", prov);
            if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.refreshSTTProviderUI();
            if (window.ProviderUI) window.ProviderUI.updateAIStatus();
        });
        on("btn-save-stt-key", "click", function() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.saveSTTKey(); });
        on("btn-whisper-refresh", "click", function() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.refreshWhisperLocalStatus(); });
        on("stt-model-select", "change", function() {
            var st = window._epState;
            st.settings.sttModel = this.value;
            stt.setModel(this.value);
            localStorage.setItem("edupro_stt_model", this.value);
        });

        // Recording Notes — Audio
        on("btn-load-audio", "click", function() { var el = document.getElementById("audio-file-input"); if (el) el.click(); });
        on("btn-export-seq", "click", function() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.exportFromSequence(); });
        on("btn-clear-audio", "click", function() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.clearAudio(); });
        var audioInput = document.getElementById("audio-file-input");
        if (audioInput) audioInput.addEventListener("change", function(evt) { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.handleAudioFileSelect(evt); });

        // Recording Notes — Transcribe / Analyze / Markers
        on("btn-transcribe", "click", function() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.startTranscription(); });
        on("btn-load-srt-recording", "click", function() { var el = document.getElementById("srt-file-input-recording"); if (el) el.click(); });
        var srtRecInput = document.getElementById("srt-file-input-recording");
        if (srtRecInput) srtRecInput.addEventListener("change", function(evt) { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.handleSrtRecordingSelect(evt); });
        on("btn-bring-whisper-recording", "click", function() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.loadLastWhisperIntoRecordingNotes(); });
        on("btn-fetch-captions-recording", "click", function() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.fetchCaptionsForRecording(); });
        on("btn-analyze-takes", "click", function() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.startTakeAnalysis(); });
        on("btn-add-supplement-markers", "click", function() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.addSupplementaryMarkers(); });
        on("btn-place-markers", "click", function() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.placeMarkers(); });
        on("btn-export-markers", "click", function() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.exportMarkers(); });
        on("btn-rec-cut", "click", function() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.executeRecCuts(); });
        on("btn-rec-cut-restore", "click", function() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.restoreRecCutBackup(); });
        on("btn-classify-views", "click", function() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.startViewClassification(); });
        on("btn-apply-views", "click", function() { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.applyViewClassification(); });

        // Take Analysis prompt
        on("btn-ta-prompt-toggle", "click", function() { if (window.PromptEditor) window.PromptEditor.toggle("ta"); });
        on("btn-ta-prompt-save", "click", function() { if (window.PromptEditor) window.PromptEditor.save("ta"); });
        on("btn-ta-prompt-reset", "click", function() { if (window.PromptEditor) window.PromptEditor.reset("ta"); });

        // Motion-Pro
        on("btn-mp-open-studio", "click", function() {
            if (!motionPro || !motionPro.serverRunning) {
                if (window.EPUtils) window.EPUtils.showToast("Inicia el servidor primero", "info");
                return;
            }
            var mpUI = window.EditorProUI && window.EditorProUI.motionPro;
            var outputDir = mpUI && mpUI.getOutputDir ? mpUI.getOutputDir() : undefined;
            var sessionName = mpUI && mpUI.getSessionName ? mpUI.getSessionName() : "global";
            motionPro.startStudio(function(err, result) {
                if (err) console.warn("[Motion-Pro] Studio error:", err.message);
                var url = (result && result.url) || "http://localhost:3000";
                try { require("child_process").exec('open "' + url + '"'); } catch(e) {}
                if (window.EPUtils) window.EPUtils.showToast("Abriendo Remotion Studio (sesión: " + sessionName + ")", "info");
            }, outputDir);
        });
        on("btn-mp-docs", "click", function() {
            try { require("child_process").exec('open "http://localhost:' + MotionPro.SERVER_PORT + '/docs/docs.html"'); } catch(e) {}
        });
        on("btn-mp-server-toggle", "click", function() { if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.toggleServer(); });
        on("btn-mp-brandfetch-save", "click", function() { if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.saveBrandfetchKey(); });
        if (window.EditorProUI && window.EditorProUI.motionPro && window.EditorProUI.motionPro.loadBrandfetchKey) window.EditorProUI.motionPro.loadBrandfetchKey();
        on("btn-mp-analyze", "click", function() { if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.startAnalysis(); });
        on("btn-mp-select-all", "click", function() { if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.toggleSelectAll(); });
        on("btn-mp-generate", "click", function() { if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.startGeneration(); });
        on("btn-mp-generate-cancel", "click", function() { if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.cancelGeneration(); });
        on("btn-mp-prompt-toggle", "click", function() { if (window.PromptEditor) window.PromptEditor.toggle("mp"); });
        on("btn-mp-prompt-save", "click", function() { if (window.PromptEditor) window.PromptEditor.save("mp"); });
        on("btn-mp-prompt-reset", "click", function() { if (window.PromptEditor) window.PromptEditor.reset("mp"); });
        on("mp-gen-prompts-toggle", "click", function() { if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.toggleGenPromptsPanel(); });
        on("btn-mp-gp-save", "click", function() { if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.saveGenPrompts(); });
        on("btn-mp-gp-reset", "click", function() { if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.resetGenPrompts(); });
        if (window.EditorProUI && window.EditorProUI.motionPro && window.EditorProUI.motionPro.bindGenPromptAccordions) window.EditorProUI.motionPro.bindGenPromptAccordions();

        bindCollapsibles();
    }

    // ─── Collapsible tool cards & fullscreen ──────────────────────

    function bindCollapsibles() {
        var allHeaders = document.querySelectorAll(".tool-card-header");
        allHeaders.forEach(function(hdr) {
            hdr.addEventListener("click", function() {
                var body = hdr.nextElementSibling;
                var icon = hdr.querySelector(".toggle-icon");
                if (!body) return;
                var wasHidden = body.classList.contains("hidden");

                document.querySelectorAll(".tool-card-body").forEach(function(b) { b.classList.add("hidden"); });
                document.querySelectorAll(".toggle-icon").forEach(function(i) { i.textContent = "▸"; });

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
                if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.toggleRecStep(stepNum);
            });
        });

        // Inject fullscreen toggle into each tool card header
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
                    fsBtn.innerHTML = "⛶"; fsBtn.title = "Pantalla completa";
                    document.body.style.overflow = "";
                } else {
                    if (body && body.classList.contains("hidden")) {
                        body.classList.remove("hidden");
                        var icon = hdr.querySelector(".toggle-icon");
                        if (icon) icon.textContent = "▾";
                    }
                    card.classList.add("fullscreen");
                    fsBtn.innerHTML = "✕"; fsBtn.title = "Salir de pantalla completa";
                    document.body.style.overflow = "hidden";
                }
            });
            var toggleIcon = hdr.querySelector(".toggle-icon");
            if (toggleIcon) toggleIcon.parentNode.insertBefore(fsBtn, toggleIcon);
            else hdr.appendChild(fsBtn);
        });

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

    function refreshAllHeaderProgress() {
        var EP = window.EditorProUI;
        if (EP && EP.recording) EP.recording.refreshSttHeaderProgressVisibility();
        if (EP && EP.editSuggestions) {
            EP.editSuggestions.refreshES2HeaderProgressVisibility();
            EP.editSuggestions.refreshRPHeaderProgressVisibility();
        }
        if (EP && EP.motionPro) EP.motionPro.refreshHeaderProgressVisibility();
    }

    // ─── Auto-update / version display ───────────────────────────

    var _updateAvailable = false;
    var _originalReloadHTML = "";

    function _showVersion() {
        try {
            var extensionPath = csInterface.getSystemPath("extension");
            var versionFile = path.join(extensionPath, "VERSION");
            if (fs.existsSync(versionFile)) {
                var ver = fs.readFileSync(versionFile, "utf8").trim();
                var label = document.getElementById("version-label");
                if (label) { label.textContent = "v" + ver; label.title = "Editor-Pro v" + ver; }
            }
        } catch(e) {}
    }

    function _checkForUpdates() {
        try {
            var exec = require("child_process").exec;
            var extensionPath = csInterface.getSystemPath("extension");
            exec("cd '" + extensionPath + "' && BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main) && git fetch origin $BRANCH 2>&1 && git diff --stat HEAD origin/$BRANCH",
                { timeout: 15000 },
                function(err, stdout) {
                    if (stdout && stdout.trim() && stdout.indexOf("files changed") !== -1) {
                        _updateAvailable = true;
                        var btn = document.getElementById("btn-reload");
                        if (btn) {
                            _originalReloadHTML = btn.innerHTML;
                            btn.style.cssText = "background:#0ae98d;color:#1a1d23;border-radius:6px;padding:3px 8px;font-size:10px;font-weight:700;animation:pulse-update 1.5s infinite;white-space:nowrap;";
                            btn.innerHTML = "⬇";
                            btn.title = "Hay una actualización disponible — click para actualizar";
                        }
                    }
                }
            );
        } catch(e) {}
    }

    function _cleanupBeforeReload(callback) {
        try {
            if (window.motionPro && typeof window.motionPro.stopServer === "function") {
                console.log("[Editor-Pro] Stopping motion-server before reload...");
                window.motionPro.stopServer(function() { callback(); });
                setTimeout(callback, 2000);
                return;
            }
        } catch(_e) {}
        callback();
    }

    window.checkAndReload = function() {
        var btn = document.getElementById("btn-reload");
        var originalHTML = _originalReloadHTML || btn.innerHTML;
        btn.innerHTML = "⏳";
        btn.title = "Verificando updates...";
        btn.style.animation = "";

        try {
            var exec = require("child_process").exec;
            var extensionPath = csInterface.getSystemPath("extension");

            exec("cd '" + extensionPath + "' && BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main) && git fetch origin $BRANCH 2>&1 && git diff --stat HEAD origin/$BRANCH",
                { timeout: 15000 },
                function(err, stdout) {
                    if (stdout && stdout.trim() && stdout.indexOf("files changed") !== -1) {
                        btn.innerHTML = "⬇️"; btn.title = "Descargando update...";
                        exec("cd '" + extensionPath + "' && BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main) && git pull origin $BRANCH 2>&1",
                            { timeout: 30000 },
                            function(err2) {
                                if (!err2) {
                                    btn.innerHTML = "✅"; btn.title = "Actualizado! Recargando...";
                                    _cleanupBeforeReload(function() { location.reload(); });
                                } else {
                                    btn.innerHTML = "❌"; btn.title = "Error: " + (err2.message || "git pull falló");
                                    setTimeout(function() { btn.innerHTML = originalHTML; btn.title = "Recargar panel"; }, 3000);
                                }
                            }
                        );
                    } else {
                        btn.innerHTML = "✅"; btn.title = "Sin updates — recargando...";
                        _cleanupBeforeReload(function() { location.reload(); });
                    }
                }
            );
        } catch(e) {
            _cleanupBeforeReload(function() { location.reload(); });
        }
    };

    // ─── Thin proxy window._ep* bindings (backward compat) ───────
    // These are consumed by UI modules that pre-date the modular architecture.
    // New code should call module APIs directly.

    window._epBindCollapsibles = bindCollapsibles;
    window._epRefreshAllHeaderProgress = refreshAllHeaderProgress;

    // Supertext helpers still needed by ui-supertexts.js (also defined here for compat)
    window._epNormalizeSupertextNewlines = function(str) { return window.EPUtils ? window.EPUtils.normalizeSupertextNewlines(str) : str; };
    window._epNormalizeSt2Fields = function(st) { return window.EPUtils ? window.EPUtils.normalizeSt2Fields(st) : st; };
    window._epEscSupertextHtml = function(str) { return window.EPUtils ? window.EPUtils.escSupertextHtml(str) : str; };

    // Proxy: progress helpers used by batch navigators
    function setST2Progress(p, t) { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.setST2Progress(p, t); }
    function setES2Progress(p, t) { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.setES2Progress(p, t); }
    function setRPProgress(p, t) { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.setRPProgress(p, t); }

    // ─── Start ────────────────────────────────────────────────────

    setTimeout(_showVersion, 500);
    setTimeout(_checkForUpdates, 5000);

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

})();
