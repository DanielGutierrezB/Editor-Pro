/**
 * Editor-Pro - Main Controller for Premiere Pro
 * Cutter + SpellCheck + Smart Supertexts + Edit Suggestions + Recording Notes (STT + Take Analysis)
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

    // State is defined in state.js and exposed as window._epState before this script loads.
    var state = window._epState;

    // ─── Expose static globals for UI modules ────────────────────
    window._epFs = fs;
    window._epPath = path;
    window._epOs = os;

    // ─── Aliases for functions now in external modules ──────────
    // These modules load before main.js, so window.X is set by the time this IIFE runs.
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
    var showInfoModal = function(t, b) { return window.showInfoModal(t, b); };
    var hideInfoModal = function() { return window.hideInfoModal(); };
    var showTranscriptExportInstructions = function() { return window.showTranscriptExportInstructions(); };
    var autoLoadTranscriptForSequence = function(n) { return window.autoLoadTranscriptForSequence(n); };
    var _buildTranscriptCache = function(cb) { return window._buildTranscriptCache(cb); };
    var _saveLastTranscriptFolder = function(p) { return window._saveLastTranscriptFolder(p); };
    var _getTranscriptFolders = function() { return window._getTranscriptFolders(); };
    var _tryLoadTranscriptFromFolder = function(f, n) { return window._tryLoadTranscriptFromFolder(f, n); };
    var copyTranscriptToFolder = function(s, n) { return window.copyTranscriptToFolder(s, n); };

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

        stt.setPluginDir(extensionPath);

        // ─── Expose init-time references for UI modules ──────────
        window._epCSInterface = csInterface;
        window._epEngine = engine;
        window._epAiAnalyzer = aiAnalyzer;
        window._epStt = stt;
        window._epRecorder = recorder;
        window._epMotionPro = motionPro;

        // Initialize UI modules (capture shared references now that _ep* globals are set)
        if (window.EditorProUI && window.EditorProUI.spellcheck && window.EditorProUI.spellcheck.init) window.EditorProUI.spellcheck.init();
        if (window.EditorProUI && window.EditorProUI.supertexts && window.EditorProUI.supertexts.init) window.EditorProUI.supertexts.init();
        if (window.EditorProUI && window.EditorProUI.editSuggestions && window.EditorProUI.editSuggestions.init) window.EditorProUI.editSuggestions.init();
        if (window.EditorProUI && window.EditorProUI.recording && window.EditorProUI.recording.init) window.EditorProUI.recording.init();
        // motionPro.init() is called via mpInit() below, which calls _initRefs() internally

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

        initPromptEditor();

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
        on("btn-ta-prompt-toggle", "click", toggleTaPromptEditor);
        on("btn-ta-prompt-save", "click", saveTaPrompt);
        on("btn-ta-prompt-reset", "click", resetTaPrompt);

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
                showToast("Abriendo Remotion Studio (sesión: " + (_mpSessionName || "global") + ")", "info");
            }, _mpOutputDir);
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

    function on(id, evt, fn) {
        var el = document.getElementById(id);
        if (el) el.addEventListener(evt, fn);
    }

    /**
     * Clear a container's children and remove all event listeners by
     * replacing the node with a clean clone. Returns the new node.
     */
    function clearContainer(el) {
        if (!el) return el;
        var clone = el.cloneNode(false); // shallow clone — no children, no listeners
        if (el.parentNode) {
            el.parentNode.replaceChild(clone, el);
        }
        return clone;
    }

    /**
     * Wrap a callback function in try-catch that shows errors to the user.
     * Usage: safeCallback(function(result) { ... })
     */
    function safeCallback(fn) {
        return function() {
            try {
                return fn.apply(this, arguments);
            } catch(e) {
                console.error("[Editor-Pro] Callback error:", e);
                showToast("Error interno: " + (e.message || e), "error");
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // SPELLCHECK — analyzes text clips on the timeline
    // ═══════════════════════════════════════════════════════════════

    // ─── Parse FCP XML to extract text clips ────────────────────
    function parseTextClipsFromXML(xmlPath) {
        if (!fs) return [];

        try {
            var xml = fs.readFileSync(xmlPath, "utf8");
            var clips = [];

            // Get sequence timebase
            var tbMatch = xml.match(/<sequence[^>]*>[\s\S]*?<rate>\s*<timebase>(\d+)<\/timebase>\s*<ntsc>(TRUE|FALSE)<\/ntsc>/);
            var timebase = tbMatch ? parseInt(tbMatch[1]) : 24;
            var isNtsc = tbMatch ? tbMatch[2] === "TRUE" : false;
            var fps = isNtsc ? timebase * 1000 / 1001 : timebase;

            // Find video tracks
            var trackRegex = /<track[^>]*>[\s\S]*?<\/track>/g;
            var trackMatch;
            var trackIdx = 0;

            while ((trackMatch = trackRegex.exec(xml)) !== null) {
                var trackXml = trackMatch[0];
                if (trackXml.indexOf("<clipitem") === -1) continue;

                var clipRegex = /<clipitem[^>]*>([\s\S]*?)<\/clipitem>/g;
                var clipMatch;

                while ((clipMatch = clipRegex.exec(trackXml)) !== null) {
                    var clipXml = clipMatch[1];

                    if (clipXml.indexOf("GraphicAndType") === -1) continue;

                    var nameMatch = clipXml.match(/<filter>\s*<effect>\s*<name>([^<]+)<\/name>\s*<effectid>GraphicAndType<\/effectid>/);
                    if (!nameMatch) continue;

                    var text = nameMatch[1].trim();
                    if (!text || text.length === 0) continue;

                    var startMatch = clipXml.match(/<start>(\d+)<\/start>/);
                    var endMatch = clipXml.match(/<end>(\d+)<\/end>/);
                    var clipNameMatch = clipXml.match(/^[\s\S]*?<name>([^<]+)<\/name>/);

                    var startFrame = startMatch ? parseInt(startMatch[1]) : 0;
                    var endFrame = endMatch ? parseInt(endMatch[1]) : startFrame + 120;

                    clips.push({
                        clipName: text,
                        text: text,
                        startTime: startFrame / fps,
                        endTime: endFrame / fps,
                        trackIndex: trackIdx
                    });
                }

                trackIdx++;
            }

            return clips;
        } catch(e) {
            console.log("Error parsing XML:", e.message);
            return [];
        }
    }

    // [EXTRACTED] SpellCheck UI → see ui-*.js
    // ═══════════════════════════════════════════════════════════════
    // PROMPT EDITOR — view/edit AI prompts with version history
    // ═══════════════════════════════════════════════════════════════

    var PROMPT_CONFIGS = {
        st2: {
            storageKey: "pr_st2",
            defaultSystem: function() { return AIAnalyzer.DEFAULT_SYSTEM_MSGS.supertexts; },
            defaultUser: function() { return aiAnalyzer.getDefaultSupertextsPrompt(); }
        },
        es2: {
            storageKey: "pr_es2",
            defaultSystem: function() { return AIAnalyzer.DEFAULT_SYSTEM_MSGS.editsuggestions2; },
            defaultUser: function() { return aiAnalyzer.getDefaultEditSuggestions2Prompt(); }
        },
        rp: {
            storageKey: "pr_rp",
            defaultSystem: function() { return AIAnalyzer.DEFAULT_SYSTEM_MSGS.reelproposal; },
            defaultUser: function() { return aiAnalyzer.getDefaultReelProposalPrompt(); }
        },
        ta: {
            storageKey: "pr_ta",
            defaultSystem: function() { return AIAnalyzer.DEFAULT_SYSTEM_MSGS.supplementReview; },
            defaultUser: function() { return aiAnalyzer.getDefaultSupplementPrompt(); }
        },
        mp: {
            storageKey: "pr_mp",
            defaultSystem: function() { return AIAnalyzer.DEFAULT_SYSTEM_MSGS.motionProposals; },
            defaultUser: function() { return aiAnalyzer.getDefaultMotionProposalsPrompt(); }
        }
    };

    function getPromptVersions(prefix) {
        try {
            var raw = localStorage.getItem(prefix + "_prompt_versions");
            return raw ? JSON.parse(raw) : [];
        } catch(e) { return []; }
    }

    function savePromptVersions(prefix, versions) {
        localStorage.setItem(prefix + "_prompt_versions", JSON.stringify(versions));
    }

    function initPromptEditor() {
        Object.keys(PROMPT_CONFIGS).forEach(function(id) {
            initSinglePromptEditor(id);
        });
    }

    function initSinglePromptEditor(id) {
        var cfg = PROMPT_CONFIGS[id];
        var systemEl = document.getElementById(id + "-prompt-system");
        var userEl = document.getElementById(id + "-prompt-user");
        if (!systemEl || !userEl) return;

        var savedSystem = localStorage.getItem(cfg.storageKey + "_system_prompt");
        var savedUser = localStorage.getItem(cfg.storageKey + "_user_prompt");

        systemEl.value = savedSystem || cfg.defaultSystem();
        userEl.value = savedUser || cfg.defaultUser();

        var toggleBtn = document.getElementById("btn-" + id + "-prompt-toggle");
        if (toggleBtn && (savedSystem || savedUser)) {
            toggleBtn.textContent = "⚙ Prompt personalizado";
        }

        renderPromptVersionList(id);
    }

    function togglePromptEditorById(id) {
        var editor = document.getElementById(id + "-prompt-editor");
        var btn = document.getElementById("btn-" + id + "-prompt-toggle");
        if (!editor) return;
        var isHidden = editor.classList.contains("hidden");
        if (isHidden) {
            editor.classList.remove("hidden");
            if (btn) btn.textContent = "⚙ Ocultar Prompt";
        } else {
            editor.classList.add("hidden");
            var cfg = PROMPT_CONFIGS[id];
            var hasCustom = localStorage.getItem(cfg.storageKey + "_user_prompt");
            if (btn) btn.textContent = hasCustom ? "⚙ Prompt personalizado" : "⚙ Editar Prompt";
        }
    }

    function savePromptById(id) {
        var cfg = PROMPT_CONFIGS[id];
        var systemEl = document.getElementById(id + "-prompt-system");
        var userEl = document.getElementById(id + "-prompt-user");
        if (!systemEl || !userEl) return;

        var systemVal = systemEl.value;
        var userVal = userEl.value;

        localStorage.setItem(cfg.storageKey + "_system_prompt", systemVal);
        localStorage.setItem(cfg.storageKey + "_user_prompt", userVal);

        var versions = getPromptVersions(cfg.storageKey);
        var now = new Date();
        var label = "v" + (versions.length + 1) + " — " +
            now.toLocaleDateString("es", { day: "2-digit", month: "short" }) + " " +
            now.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
        versions.push({ label: label, system: systemVal, user: userVal, ts: now.toISOString() });
        if (versions.length > 20) versions = versions.slice(-20);
        savePromptVersions(cfg.storageKey, versions);

        renderPromptVersionList(id);
        showToast("Prompt guardado como " + label, "success");
        var btn = document.getElementById("btn-" + id + "-prompt-toggle");
        if (btn) btn.textContent = "⚙ Prompt personalizado";
    }

    function resetPromptById(id) {
        var cfg = PROMPT_CONFIGS[id];
        localStorage.removeItem(cfg.storageKey + "_system_prompt");
        localStorage.removeItem(cfg.storageKey + "_user_prompt");

        var systemEl = document.getElementById(id + "-prompt-system");
        var userEl = document.getElementById(id + "-prompt-user");
        if (systemEl) systemEl.value = cfg.defaultSystem();
        if (userEl) userEl.value = cfg.defaultUser();

        showToast("Prompt restaurado al original", "info");
        var btn = document.getElementById("btn-" + id + "-prompt-toggle");
        if (btn) btn.textContent = "⚙ Editar Prompt";
    }

    function renderPromptVersionList(id) {
        var cfg = PROMPT_CONFIGS[id];
        var container = document.getElementById(id + "-prompt-versions");
        if (!container) return;

        var versions = getPromptVersions(cfg.storageKey);
        if (versions.length === 0) {
            container.innerHTML = '<span class="prompt-versions-empty">Sin versiones guardadas</span>';
            return;
        }

        var html = '<select id="' + id + '-version-select" class="prompt-version-select">' +
            '<option value="">Historial (' + versions.length + ' versiones)</option>';
        for (var i = versions.length - 1; i >= 0; i--) {
            html += '<option value="' + i + '">' + esc(versions[i].label) + '</option>';
        }
        html += '</select>';
        html += '<button class="btn btn-sm btn-ghost prompt-version-delete" data-promptid="' + id + '" title="Eliminar versión seleccionada">🗑</button>';
        container.innerHTML = html;

        var select = document.getElementById(id + "-version-select");
        if (select) {
            select.addEventListener("change", function() {
                var idx = parseInt(this.value, 10);
                if (isNaN(idx)) return;
                loadPromptVersion(id, idx);
            });
        }
        var delBtn = container.querySelector(".prompt-version-delete");
        if (delBtn) {
            delBtn.addEventListener("click", function() {
                var sel = document.getElementById(id + "-version-select");
                var idx = sel ? parseInt(sel.value, 10) : NaN;
                if (isNaN(idx)) { showToast("Selecciona una versión primero", "info"); return; }
                deletePromptVersion(id, idx);
            });
        }
    }

    function loadPromptVersion(id, versionIdx) {
        var cfg = PROMPT_CONFIGS[id];
        var versions = getPromptVersions(cfg.storageKey);
        if (!versions[versionIdx]) return;

        var v = versions[versionIdx];
        var systemEl = document.getElementById(id + "-prompt-system");
        var userEl = document.getElementById(id + "-prompt-user");
        if (systemEl) systemEl.value = v.system;
        if (userEl) userEl.value = v.user;

        showToast("Cargada: " + v.label + ". Haz clic en Guardar para activarla.", "info");
    }

    function deletePromptVersion(id, versionIdx) {
        var cfg = PROMPT_CONFIGS[id];
        var versions = getPromptVersions(cfg.storageKey);
        if (!versions[versionIdx]) return;
        var label = versions[versionIdx].label;
        versions.splice(versionIdx, 1);
        savePromptVersions(cfg.storageKey, versions);
        renderPromptVersionList(id);
        showToast("Eliminada: " + label, "info");
    }

    function toggleTaPromptEditor() { togglePromptEditorById("ta"); }
    function saveTaPrompt() { savePromptById("ta"); }
    function resetTaPrompt() { resetPromptById("ta"); }

    function getPromptContext(id) {
        var cfg = PROMPT_CONFIGS[id];
        var savedSystem = localStorage.getItem(cfg.storageKey + "_system_prompt");
        var savedUser = localStorage.getItem(cfg.storageKey + "_user_prompt");
        var ctx = {};
        if (savedSystem) ctx.customSystemMsg = savedSystem;
        if (savedUser) ctx.customPrompt = savedUser;
        return ctx;
    }

    function getTakeAnalysisPromptContext() { return getPromptContext("ta"); }

    function secsToSRTTime(secs) {
        var h = Math.floor(secs / 3600);
        var m = Math.floor((secs % 3600) / 60);
        var s = Math.floor(secs % 60);
        var ms = Math.floor((secs % 1) * 1000);
        return pad2(h) + ":" + pad2(m) + ":" + pad2(s) + "," + pad3(ms);
    }

    function pad2(n) { return (n < 10 ? "0" : "") + n; }
    function pad3(n) { return (n < 10 ? "00" : n < 100 ? "0" : "") + n; }

    // [EXTRACTED] Smart Supertexts UI → see ui-*.js
    // [EXTRACTED] Edit Suggestions + Reel Proposal UI → see ui-*.js
    // ─── Transcript Handling ─────────────────────────────────────

    function loadSRTFile() {
        var fileInput = document.getElementById("srt-file-input");
        if (fileInput) fileInput.click();
    }

    function fetchCaptionsFromSequence() {
        var btn = document.getElementById("btn-fetch-captions");
        if (btn) { btn.textContent = "Buscando..."; btn.classList.add("btn-disabled"); }
        var resetBtn = function() {
            if (btn) { btn.textContent = "🎬 Traer de secuencia"; btn.classList.remove("btn-disabled"); }
        };

        csInterface.evalScript("getSequenceTranscriptInfo()", function(result) {
            try {
                var info = JSON.parse(result);
                if (info.error) {
                    showToast(info.error, "error");
                    resetBtn();
                    return;
                }

                // Priority 1: Check known transcript folders (last import path, Transcribe/)
                var knownFolders = _getTranscriptFolders();
                for (var kf = 0; kf < knownFolders.length; kf++) {
                    if (_tryLoadTranscriptFromFolder(knownFolders[kf], info.sequenceName)) {
                        resetBtn();
                        return;
                    }
                }

                // Priority 2: Search near project/media files
                var found = findTranscriptFiles(info.projectPath, info.mediaPaths, info.sequenceName);
                if (found) {
                    var fileSrt = sttResultToSRT(found.result);
                    loadTranscriptText(fileSrt, path.basename(found.file));
                    _saveLastTranscriptFolder(found.file);
                    resetBtn();
                    return;
                }

                var embedded = readTranscriptFromProjectFile(info.projectPath);
                if (embedded && embedded.words.length > 5) {
                    var embSrt = sttResultToSRT(embedded);
                    loadTranscriptText(embSrt, "transcript de Premiere (" + info.sequenceName + ")");
                    resetBtn();
                    return;
                }

                var captions = readCaptionsFromProjectFile(info.projectPath, info.sequenceId);
                if (captions && captions.length > 0) {
                    var capSrt = "";
                    for (var i = 0; i < captions.length; i++) {
                        var cap = captions[i];
                        capSrt += (i + 1) + "\n";
                        capSrt += secsToSRTTime(cap.startTime) + " --> " + secsToSRTTime(cap.endTime) + "\n";
                        capSrt += cap.text + "\n\n";
                    }
                    loadTranscriptText(capSrt.trim(), "secuencia (" + captions.length + " captions)");
                    resetBtn();
                    return;
                }

                resetBtn();
                showTranscriptExportInstructions();
            } catch(e) {
                resetBtn();
                showToast("Error al buscar transcript: " + e.message, "error");
            }
        });
    }

    function sttResultToSRT(sttResult) {
        if (!sttResult || !sttResult.words || sttResult.words.length === 0) return "";
        var lines = [];
        var chunkSize = 8;
        var words = sttResult.words;
        var idx = 1;
        for (var i = 0; i < words.length; i += chunkSize) {
            var chunk = words.slice(i, Math.min(i + chunkSize, words.length));
            var startTime = chunk[0].start;
            var endTime = chunk[chunk.length - 1].end;
            var text = chunk.map(function(w) { return w.text; }).join(" ");
            lines.push(idx + "\n" + secsToSRTTime(startTime) + " --> " + secsToSRTTime(endTime) + "\n" + text + "\n");
            idx++;
        }
        return lines.join("\n");
    }

    function readTranscriptFromProjectFile(projectPath) {
        if (!fs) return null;
        var zlib;
        try { zlib = require("zlib"); } catch(e) { return null; }

        var buf = fs.readFileSync(projectPath);
        var xml;
        try {
            xml = zlib.gunzipSync(buf).toString("utf8");
        } catch(e) {
            xml = buf.toString("utf8");
        }

        var TICKS_PER_SEC = 254016000000;

        // Look for embedded .prtranscript JSON data (segmentList)
        var segListIdx = xml.indexOf('"segmentList"');
        if (segListIdx === -1) segListIdx = xml.indexOf("segmentList");
        if (segListIdx !== -1) {
            var searchStart = Math.max(0, segListIdx - 500);
            var searchEnd = Math.min(xml.length, segListIdx + 100000);
            var xmlWindow = xml.substring(searchStart, searchEnd);
            var jsonMatch = xmlWindow.match(/\{[^{}]*"segmentList"\s*:\s*\[[\s\S]*?\]\s*\}/);
            if (jsonMatch) {
                try {
                    var data = JSON.parse(jsonMatch[0]);
                    if (data.segmentList && data.segmentList.length > 0) {
                        var words = [];
                        var textParts = [];
                        for (var i = 0; i < data.segmentList.length; i++) {
                            var seg = data.segmentList[i];
                            var segText = seg.transcript || seg.text || "";
                            if (!segText) continue;
                            textParts.push(segText);
                            var items = seg.items || seg.words || [];
                            if (items.length > 0) {
                                for (var w = 0; w < items.length; w++) {
                                    var item = items[w];
                                    if (item.type === "punctuation" && !item.content) continue;
                                    var wordText = item.content || item.text || "";
                                    if (!wordText.trim()) continue;
                                    var wStart = typeof item.startTimeInTicks === "number" ?
                                        item.startTimeInTicks / TICKS_PER_SEC : (item.start || 0);
                                    var wEnd = typeof item.endTimeInTicks === "number" ?
                                        item.endTimeInTicks / TICKS_PER_SEC : (item.end || wStart + 0.1);
                                    words.push({ text: wordText, start: wStart, end: wEnd, type: "word" });
                                }
                            } else {
                                var segStart = typeof seg.startTimeInTicks === "number" ?
                                    seg.startTimeInTicks / TICKS_PER_SEC : (seg.startTime || seg.start || 0);
                                var segEnd = typeof seg.endTimeInTicks === "number" ?
                                    seg.endTimeInTicks / TICKS_PER_SEC : (seg.endTime || seg.end || segStart + 1);
                                var segWords = segText.split(/\s+/).filter(function(w) { return w.length > 0; });
                                var segDur = segEnd - segStart;
                                var wordDur = segWords.length > 0 ? segDur / segWords.length : segDur;
                                for (var sw = 0; sw < segWords.length; sw++) {
                                    words.push({
                                        text: segWords[sw],
                                        start: segStart + (sw * wordDur),
                                        end: segStart + ((sw + 1) * wordDur),
                                        type: "word"
                                    });
                                }
                            }
                        }
                        if (words.length > 5) {
                            return { words: words, text: textParts.join(" "), language: data.language || "es" };
                        }
                    }
                } catch(e) {}
            }
        }

        // Look for base64-encoded transcript data blocks that decode to JSON with segmentList
        var b64Pattern = /[A-Za-z0-9+\/=]{200,}/g;
        var b64Match;
        var tried = 0;
        while ((b64Match = b64Pattern.exec(xml)) !== null && tried < 20) {
            tried++;
            try {
                var decoded = Buffer.from(b64Match[0], "base64").toString("utf8");
                if (decoded.indexOf("segmentList") !== -1) {
                    var jsonStart = decoded.indexOf("{");
                    var jsonEnd = decoded.lastIndexOf("}");
                    if (jsonStart !== -1 && jsonEnd > jsonStart) {
                        var jsonStr = decoded.substring(jsonStart, jsonEnd + 1);
                        var data2 = JSON.parse(jsonStr);
                        if (data2.segmentList && data2.segmentList.length > 0) {
                            var result = parsePrTranscriptData(data2);
                            if (result && result.words.length > 5) return result;
                        }
                    }
                }
            } catch(e) {}
        }

        return null;
    }

    function parsePrTranscriptData(data) {
        var TICKS_PER_SEC = 254016000000;
        var words = [];
        var textParts = [];
        var segments = data.segmentList || data.segments || [];
        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            var segText = seg.transcript || seg.text || "";
            if (!segText) continue;
            textParts.push(segText);
            var items = seg.items || seg.words || [];
            if (items.length > 0) {
                for (var w = 0; w < items.length; w++) {
                    var item = items[w];
                    if (item.type === "punctuation" && !item.content) continue;
                    var wordText = item.content || item.text || "";
                    if (!wordText.trim()) continue;
                    var wStart = typeof item.startTimeInTicks === "number" ?
                        item.startTimeInTicks / TICKS_PER_SEC : (item.start || 0);
                    var wEnd = typeof item.endTimeInTicks === "number" ?
                        item.endTimeInTicks / TICKS_PER_SEC : (item.end || wStart + 0.1);
                    words.push({ text: wordText, start: wStart, end: wEnd, type: "word" });
                }
            } else {
                var segStart = typeof seg.startTimeInTicks === "number" ?
                    seg.startTimeInTicks / TICKS_PER_SEC : (seg.startTime || seg.start || 0);
                var segEnd = typeof seg.endTimeInTicks === "number" ?
                    seg.endTimeInTicks / TICKS_PER_SEC : (seg.endTime || seg.end || segStart + 1);
                var segWords = segText.split(/\s+/).filter(function(w) { return w.length > 0; });
                var segDur = segEnd - segStart;
                var wordDur = segWords.length > 0 ? segDur / segWords.length : segDur;
                for (var sw = 0; sw < segWords.length; sw++) {
                    words.push({
                        text: segWords[sw],
                        start: segStart + (sw * wordDur),
                        end: segStart + ((sw + 1) * wordDur),
                        type: "word"
                    });
                }
            }
        }
        if (words.length === 0) return null;
        return { words: words, text: textParts.join(" "), language: data.language || "es" };
    }

    function readCaptionsFromProjectFile(projectPath, sequenceId) {
        if (!fs) return null;
        var zlib;
        try { zlib = require("zlib"); } catch(e) { return null; }

        var buf = fs.readFileSync(projectPath);
        var xml;
        try {
            xml = zlib.gunzipSync(buf).toString("utf8");
        } catch(e) {
            xml = buf.toString("utf8");
        }

        var TICKS_PER_SEC = 254016000000;
        var captions = [];

        // --- Phase 1: Collect SyntheticCaption base64 blocks via indexOf ---
        var captionDataList = [];
        var SC_MARKER = "SyntheticCaption";
        var searchPos = 0;
        while (true) {
            var scIdx = xml.indexOf(SC_MARKER, searchPos);
            if (scIdx === -1) break;
            var after = scIdx + SC_MARKER.length;
            while (after < xml.length && " \t\r\n".indexOf(xml[after]) !== -1) after++;
            if (after < xml.length && xml[after] === "0") {
                after++;
                while (after < xml.length && " \t\r\n".indexOf(xml[after]) !== -1) after++;
                var b64Start = after;
                while (after < xml.length && "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(xml[after]) !== -1) after++;
                var b64 = xml.substring(b64Start, after);
                if (b64.length > 50) {
                    captionDataList.push({ b64: b64, pos: scIdx });
                }
            }
            searchPos = scIdx + 1;
        }

        // --- Phase 1b: If no SyntheticCaption found, try XML tag-based extraction ---
        if (captionDataList.length === 0) {
            var tagMarkers = ["<CaptionText>", "<SubType>SyntheticCaption</SubType>"];
            for (var m = 0; m < tagMarkers.length && captionDataList.length === 0; m++) {
                var tIdx = 0;
                while (true) {
                    tIdx = xml.indexOf(tagMarkers[m], tIdx);
                    if (tIdx === -1) break;
                    var xmlChunk = xml.substring(Math.max(0, tIdx - 500), Math.min(xml.length, tIdx + 5000));
                    var b64Match = xmlChunk.match(/[A-Za-z0-9+\/=]{100,}/g);
                    if (b64Match) {
                        for (var bm = 0; bm < b64Match.length; bm++) {
                            captionDataList.push({ b64: b64Match[bm], pos: tIdx });
                        }
                    }
                    tIdx++;
                }
            }
        }

        if (captionDataList.length === 0) {
            return captions;
        }

        // --- Phase 2: Collect timing data ---
        var timings = [];
        var TM_MARKER = "BE.Prefs.LabelColors.7";
        searchPos = 0;
        while (true) {
            var tmIdx = xml.indexOf(TM_MARKER, searchPos);
            if (tmIdx === -1) break;
            var tmAfter = tmIdx + TM_MARKER.length;
            var tmWindow = xml.substring(tmAfter, Math.min(xml.length, tmAfter + 200));
            var tmMatch = tmWindow.match(/^\s+(\d{12,})\s+(\d{12,})\s+[0-9a-f-]{36}/);
            if (tmMatch) {
                timings.push({
                    start: parseInt(tmMatch[1], 10),
                    end: parseInt(tmMatch[2], 10),
                    pos: tmIdx
                });
            }
            searchPos = tmIdx + 1;
        }

        // --- Phase 2b: Alternative timing extraction from tick-pair patterns ---
        if (timings.length === 0) {
            var tickPattern = /(\d{12,})\s+(\d{12,})\s+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
            var tkm;
            while ((tkm = tickPattern.exec(xml)) !== null) {
                var s = parseInt(tkm[1], 10), e = parseInt(tkm[2], 10);
                if (s < e && s >= 0 && e < 100 * 60 * 60 * TICKS_PER_SEC) {
                    timings.push({ start: s, end: e, pos: tkm.index });
                }
            }
        }

        // --- Phase 3: Match captions to timings ---
        // Strategy A: Position-based (nearest preceding timing within range)
        var usedTimings = {};
        for (var i = 0; i < captionDataList.length; i++) {
            var cd = captionDataList[i];
            var text = decodeSyntheticCaption(cd.b64);
            if (!text || text.length === 0) continue;

            var bestTiming = null;
            var bestDist = Infinity;
            for (var t = 0; t < timings.length; t++) {
                if (usedTimings[t]) continue;
                var dist = cd.pos - timings[t].pos;
                if (dist > 0 && dist < bestDist && dist < 5000) {
                    bestDist = dist;
                    bestTiming = t;
                }
            }

            if (bestTiming !== null) {
                captions.push({
                    text: text,
                    startTime: timings[bestTiming].start / TICKS_PER_SEC,
                    endTime: timings[bestTiming].end / TICKS_PER_SEC
                });
                usedTimings[bestTiming] = true;
            }
        }

        // Strategy B: Sequential matching fallback
        if (captions.length === 0 && captionDataList.length > 0 && timings.length > 0) {
            timings.sort(function(a, b) { return a.pos - b.pos; });
            captionDataList.sort(function(a, b) { return a.pos - b.pos; });
            var tIdx2 = 0;
            for (var j = 0; j < captionDataList.length; j++) {
                var txt = decodeSyntheticCaption(captionDataList[j].b64);
                if (!txt) continue;
                if (tIdx2 < timings.length) {
                    captions.push({
                        text: txt,
                        startTime: timings[tIdx2].start / TICKS_PER_SEC,
                        endTime: timings[tIdx2].end / TICKS_PER_SEC
                    });
                    tIdx2++;
                } else {
                    captions.push({ text: txt, startTime: 0, endTime: 0 });
                }
            }
        }

        // Strategy C: If we have caption data but zero timings, still return text with dummy times
        if (captions.length === 0 && captionDataList.length > 0) {
            for (var k = 0; k < captionDataList.length; k++) {
                var txt2 = decodeSyntheticCaption(captionDataList[k].b64);
                if (txt2) {
                    captions.push({ text: txt2, startTime: k, endTime: k + 1 });
                }
            }
        }

        captions.sort(function(a, b) { return a.startTime - b.startTime; });
        return captions;
    }

    function decodeSyntheticCaption(b64) {
        try {
            var buffer = Buffer.from(b64, "base64");
            if (buffer.length < 8) return null;

            // SyntheticCaption binary: header bytes + 4-byte LE text-length + UTF-8 text + null padding
            // Trim trailing null bytes
            var end = buffer.length;
            while (end > 0 && buffer[end - 1] === 0) end--;
            if (end < 8) return null;

            // The text (UTF-8) is at the end, preceded by a uint32LE length field
            // Try all possible text lengths to find where the length field matches
            for (var tryLen = 1; tryLen < Math.min(end, 1000); tryLen++) {
                var lenOffset = end - tryLen - 4;
                if (lenOffset < 0) break;
                var readLen = buffer.readUInt32LE(lenOffset);
                if (readLen === tryLen) {
                    var text = buffer.slice(lenOffset + 4, lenOffset + 4 + readLen).toString("utf8");
                    // Validate: text should be mostly printable
                    var printable = 0;
                    for (var c = 0; c < text.length; c++) {
                        var code = text.charCodeAt(c);
                        if (code >= 0x20 && code < 0xFFFE) printable++;
                    }
                    if (printable > text.length * 0.7 && text.trim().length > 0) {
                        return text.trim();
                    }
                }
            }

            // Fallback: try scanning for readable UTF-8 text near the end
            var lastChunk = buffer.slice(Math.max(0, end - 500), end).toString("utf8");
            var readable = lastChunk.match(/[\x20-\x7E\u00A0-\uFFFF]{2,}/g);
            if (readable && readable.length > 0) {
                return readable[readable.length - 1].trim();
            }

            return null;
        } catch(e) {
            return null;
        }
    }

    function findTranscriptFiles(projectPath, mediaPaths, sequenceName) {
        if (!fs || !path) return null;

        var projectDir = path.dirname(projectPath);
        var seqLower = (sequenceName || "").toLowerCase();

        function fileMatchesSequence(filePath) {
            if (!seqLower) return true;
            var baseName = path.basename(filePath).replace(/\.[^.]+$/, "").toLowerCase();
            return baseName.indexOf(seqLower) === 0 || seqLower.indexOf(baseName) === 0;
        }

        // Phase 1: .prtranscript next to media files (always sequence-specific via mediaPaths)
        for (var mp = 0; mp < (mediaPaths || []).length; mp++) {
            var prt = mediaPaths[mp] + ".prtranscript";
            try {
                if (fs.existsSync(prt)) {
                    var parsed = parsePrTranscript(prt);
                    if (parsed && parsed.words.length > 5) return { type: "prtranscript", result: parsed, file: prt };
                }
            } catch(e) {}
            var noExtBase = mediaPaths[mp].replace(/\.[^.]+$/, "");
            var prt2 = noExtBase + ".prtranscript";
            try {
                if (prt2 !== prt && fs.existsSync(prt2)) {
                    var parsed2 = parsePrTranscript(prt2);
                    if (parsed2 && parsed2.words.length > 5) return { type: "prtranscript", result: parsed2, file: prt2 };
                }
            } catch(e) {}
        }

        // Phase 2: Scan project dir and media dirs for candidate files
        var candidates = [];
        var SKIP = { "node_modules":1, ".git":1, "Adobe Premiere Pro Auto-Save":1 };
        var VALID_EXTS = { ".srt":1, ".prtranscript":1, ".json":1 };

        function scanDir(dir, depth) {
            if (depth > 2) return;
            try {
                var entries = fs.readdirSync(dir);
                for (var i = 0; i < entries.length; i++) {
                    var fullPath = path.join(dir, entries[i]);
                    var ext = path.extname(entries[i]).toLowerCase();
                    try {
                        var stat = fs.statSync(fullPath);
                        if (stat.isFile() && VALID_EXTS[ext]) {
                            candidates.push({ path: fullPath, ext: ext, mtime: stat.mtimeMs || 0 });
                        } else if (stat.isDirectory() && depth < 2 && !SKIP[entries[i]]) {
                            scanDir(fullPath, depth + 1);
                        }
                    } catch(e) {}
                }
            } catch(e) {}
        }

        scanDir(projectDir, 0);

        var mediaDirs = {};
        for (var m = 0; m < (mediaPaths || []).length; m++) {
            var mDir = path.dirname(mediaPaths[m]);
            if (!mediaDirs[mDir] && mDir !== projectDir) {
                mediaDirs[mDir] = true;
                scanDir(mDir, 1);
            }
        }

        // Phase 3: Only return files that match the active sequence name
        function tryFiles(ext, maxTries, parseFn) {
            var files = candidates.filter(function(c) { return c.ext === ext; });
            if (files.length === 0) return null;
            var matching = seqLower ? files.filter(function(f) { return fileMatchesSequence(f.path); }) : files;
            if (matching.length === 0) return null;
            matching.sort(function(a, b) { return b.mtime - a.mtime; });
            for (var i = 0; i < Math.min(matching.length, maxTries); i++) {
                var result = parseFn(matching[i]);
                if (result) return result;
            }
            return null;
        }

        var prtResult = tryFiles(".prtranscript", 3, function(f) {
            var p = parsePrTranscript(f.path);
            return (p && p.words.length > 5) ? { type: "prtranscript", result: p, file: f.path } : null;
        });
        if (prtResult) return prtResult;

        var jsonResult = tryFiles(".json", 5, function(f) {
            var p = parseTranscriptJson(f.path);
            return (p && p.words.length > 5) ? { type: "json", result: p, file: f.path } : null;
        });
        if (jsonResult) return jsonResult;

        var srtResult = tryFiles(".srt", 5, function(f) {
            try {
                var content = fs.readFileSync(f.path, "utf8");
                var segments = parseSRT(content);
                if (segments && segments.length > 3) {
                    return { type: "srt", result: srtSegmentsToSttResult(segments), file: f.path };
                }
            } catch(e) {}
            return null;
        });
        if (srtResult) return srtResult;

        return null;
    }

    function parseTranscriptJson(filePath) {
        try {
            var raw = fs.readFileSync(filePath, "utf8");
            var data = JSON.parse(raw);

            if (data.segmentList) {
                return parsePrTranscript(filePath);
            }

            // Premiere Text panel export: { language, segments: [{ start, duration, words: [{ start, duration, text }] }] }
            if (data.segments && Array.isArray(data.segments) && data.segments.length > 0 &&
                data.segments[0].words && typeof data.segments[0].start === "number") {
                return parsePremiereTextPanelJson(data);
            }

            if (data.segments && Array.isArray(data.segments)) {
                return parsePrTranscript(filePath);
            }

            if (data.transcript && Array.isArray(data.transcript)) {
                return parsePremiereExportJson(data);
            }
            if (data.results && data.results.items) {
                return parsePremiereExportJson(data);
            }
            if (Array.isArray(data) && data.length > 0 && data[0].words) {
                return parsePremiereExportJson({ segments: data });
            }

            return null;
        } catch(e) {
            return null;
        }
    }

    function parsePremiereTextPanelJson(data) {
        var words = [];
        var textParts = [];

        var segs = data.segments || [];
        for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];
            var segWords = seg.words || [];
            var segTextParts = [];

            for (var w = 0; w < segWords.length; w++) {
                var word = segWords[w];
                var txt = (word.text || "").trim();
                if (!txt || word.type === "punctuation") continue;
                var wStart = typeof word.start === "number" ? word.start : 0;
                var wEnd = typeof word.duration === "number" ? wStart + word.duration : wStart + 0.1;
                words.push({ text: txt, start: wStart, end: wEnd, type: "word" });
                segTextParts.push(txt);
            }

            if (segTextParts.length > 0) textParts.push(segTextParts.join(" "));
        }

        if (words.length === 0) return null;
        return { words: words, text: textParts.join(" "), language: data.language || "es" };
    }

    function parsePremiereExportJson(data) {
        var TICKS_PER_SEC = 254016000000;
        var words = [];
        var textParts = [];

        function addItems(items, fallbackStart, fallbackEnd) {
            if (!items || !items.length) return;
            for (var i = 0; i < items.length; i++) {
                var w = items[i];
                var txt = w.value || w.text || w.content || w.word || "";
                if (!txt.trim()) continue;
                if (w.type === "punctuation") { continue; }
                var s = 0, e = 0;
                if (typeof w.startTime === "number") { s = w.startTime; e = w.endTime || s + 0.1; }
                else if (typeof w.startTimeInTicks === "number") { s = w.startTimeInTicks / TICKS_PER_SEC; e = (w.endTimeInTicks || w.startTimeInTicks) / TICKS_PER_SEC; }
                else if (typeof w.start === "number") { s = w.start; e = w.end || s + 0.1; }
                else { s = fallbackStart; e = fallbackEnd; }
                words.push({ text: txt.trim(), start: s, end: e || s + 0.1, type: "word" });
            }
        }

        var segs = data.transcript || data.segments || data.results && data.results.items || [];
        if (!Array.isArray(segs)) segs = [segs];

        for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];
            var segText = seg.transcript || seg.text || seg.value || "";
            if (segText) textParts.push(segText);

            var segItems = seg.words || seg.items || seg.alternatives && seg.alternatives[0] && seg.alternatives[0].items || [];
            var sStart = typeof seg.startTime === "number" ? seg.startTime :
                         typeof seg.startTimeInTicks === "number" ? seg.startTimeInTicks / TICKS_PER_SEC :
                         (seg.start || 0);
            var sEnd = typeof seg.endTime === "number" ? seg.endTime :
                       typeof seg.endTimeInTicks === "number" ? seg.endTimeInTicks / TICKS_PER_SEC :
                       (seg.end || sStart + 1);

            if (segItems.length > 0) {
                addItems(segItems, sStart, sEnd);
                if (!segText) {
                    var partText = segItems.map(function(it) { return it.value || it.text || it.content || ""; }).join(" ");
                    if (partText.trim()) textParts.push(partText.trim());
                }
            } else if (segText) {
                var ws = segText.split(/\s+/).filter(function(w) { return w.length > 0; });
                var dur = sEnd - sStart;
                var wd = ws.length > 0 ? dur / ws.length : dur;
                for (var wi = 0; wi < ws.length; wi++) {
                    words.push({ text: ws[wi], start: sStart + wi * wd, end: sStart + (wi + 1) * wd, type: "word" });
                }
            }
        }

        if (words.length === 0) return null;
        return { words: words, text: textParts.join(" "), language: data.language || "es" };
    }

    function parsePrTranscript(filePath) {
        try {
            var content = fs.readFileSync(filePath, "utf8");
            var data = JSON.parse(content);
            var TICKS_PER_SEC = 254016000000;
            var words = [];
            var textParts = [];

            var segments = data.segmentList || data.segments || [];
            for (var i = 0; i < segments.length; i++) {
                var seg = segments[i];
                var segText = seg.transcript || seg.text || "";
                if (!segText) continue;
                textParts.push(segText);

                var items = seg.items || seg.words || [];
                if (items.length > 0) {
                    for (var w = 0; w < items.length; w++) {
                        var item = items[w];
                        if (item.type === "punctuation" && !item.content) continue;
                        var wordText = item.content || item.text || "";
                        if (!wordText.trim()) continue;
                        var wStart = typeof item.startTimeInTicks === "number" ?
                            item.startTimeInTicks / TICKS_PER_SEC :
                            (item.start || 0);
                        var wEnd = typeof item.endTimeInTicks === "number" ?
                            item.endTimeInTicks / TICKS_PER_SEC :
                            (item.end || wStart + 0.1);
                        words.push({ text: wordText, start: wStart, end: wEnd, type: "word" });
                    }
                } else {
                    var segStart = typeof seg.startTimeInTicks === "number" ?
                        seg.startTimeInTicks / TICKS_PER_SEC :
                        (seg.startTime || seg.start || 0);
                    var segEnd = typeof seg.endTimeInTicks === "number" ?
                        seg.endTimeInTicks / TICKS_PER_SEC :
                        (seg.endTime || seg.end || segStart + 1);
                    var segWords = segText.split(/\s+/).filter(function(w) { return w.length > 0; });
                    var segDur = segEnd - segStart;
                    var wordDur = segWords.length > 0 ? segDur / segWords.length : segDur;
                    for (var sw = 0; sw < segWords.length; sw++) {
                        words.push({
                            text: segWords[sw],
                            start: segStart + (sw * wordDur),
                            end: segStart + ((sw + 1) * wordDur),
                            type: "word"
                        });
                    }
                }
            }

            if (words.length === 0) return null;
            return { words: words, text: textParts.join(" "), language: data.language || "es" };
        } catch(e) {
            return null;
        }
    }

    function srtSegmentsToSttResult(segments) {
        var words = [];
        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            var segWords = seg.text.split(/\s+/).filter(function(w) { return w.length > 0; });
            var segDuration = seg.endTime - seg.startTime;
            var wordDur = segWords.length > 0 ? segDuration / segWords.length : segDuration;
            for (var w = 0; w < segWords.length; w++) {
                words.push({
                    type: "word",
                    text: segWords[w],
                    start: seg.startTime + (w * wordDur),
                    end: seg.startTime + ((w + 1) * wordDur)
                });
            }
        }
        var fullText = segments.map(function(s) { return s.text; }).join(" ");
        return { words: words, text: fullText, language: "es" };
    }

    function handleFileSelect(evt) {
        var file = evt.target.files[0];
        if (!file) return;

        if (fs && path) {
            try {
                var content = fs.readFileSync(file.path, "utf8");
                loadTranscriptText(content, file.name);
                _saveLastTranscriptFolder(file.path);
            } catch(e) {
                showToast("Error al leer archivo: " + e.message, "error");
            }
        } else {
            var reader = new FileReader();
            reader.onload = function(e) { loadTranscriptText(e.target.result, file.name); };
            reader.readAsText(file);
        }
        evt.target.value = "";
    }

    function pasteFromClipboard() {
        if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText().then(function(text) {
                if (text && text.trim()) loadTranscriptText(text, "clipboard");
                else showToast("Portapapeles vacío", "info");
            }).catch(function() { showToast("No se pudo acceder al portapapeles", "error"); });
        } else {
            showToast("Pega el texto directamente en el área de texto", "info");
        }
    }

    function clearTranscript() {
        state.transcript = "";
        state.segments = [];
        state.transcriptJson = null;
        var textarea = document.getElementById("transcript-input");
        if (textarea) textarea.value = "";
        document.getElementById("transcript-info").textContent = "Sin transcripción cargada";
        hideElement("transcript-stats");
        clearRenderedTranscript();
        mpUpdateAnalyzeButton();
    }

    function loadTranscriptText(text, source) {
        var textarea = document.getElementById("transcript-input");
        if (textarea) textarea.value = text;
        state._transcriptSource = source || "";
        onTranscriptChange();
        renderTranscriptFromSegments();
        showToast("Transcripción cargada desde " + source, "success");
    }

    function renderTranscriptFromSegments() {
        if (!state.segments || state.segments.length === 0) { clearRenderedTranscript(); return; }
        var words = [];
        state.segments.forEach(function(seg) {
            var segWords = seg.text.split(/\s+/).filter(function(w) { return w.length > 0; });
            var dur = seg.endTime - seg.startTime;
            var wordDur = segWords.length > 0 ? dur / segWords.length : dur;
            for (var i = 0; i < segWords.length; i++) {
                words.push({ type: "word", text: segWords[i], start: seg.startTime + (i * wordDur), end: seg.startTime + ((i + 1) * wordDur) });
            }
        });
        if (words.length > 0) renderClickableTranscript(words);
    }

    function onTranscriptChange() {
        var textarea = document.getElementById("transcript-input");
        if (!textarea) return;

        var text = textarea.value.trim();
        state.transcript = text;

        // Update transcript card title with status
        var titleEl = document.querySelector('[data-tool="transcript"] .tool-card-title');
        if (titleEl) {
            var src = state._transcriptSource || "";
            titleEl.innerHTML = text 
                ? "✅ Transcripción" + (src ? " <span style='font-size:11px;color:#888;font-weight:400;margin-left:6px'>" + src + "</span>" : "")
                : "📝 Transcripción";
            titleEl.style.color = text ? "#0ae98d" : "";
        }

        if (!text) {
            state.segments = [];
            document.getElementById("transcript-info").textContent = "Sin transcripción cargada";
            hideElement("transcript-stats");
            return;
        }

        state.segments = parseSRT(text);
        var wordCount = text.split(/\s+/).filter(function(w) { return w.length > 0; }).length;

        document.getElementById("transcript-info").textContent =
            "Transcripción cargada — " + state.segments.length + " segmentos";
        showElement("transcript-stats");
        document.getElementById("transcript-word-count").textContent = wordCount + " palabras";
        document.getElementById("transcript-segment-count").textContent = state.segments.length + " segmentos";

        if (state.segments.length > 0) {
            var last = state.segments[state.segments.length - 1];
            var dur = last.endTime || last.startTime || 0;
            document.getElementById("transcript-duration").textContent = formatTimeFull(dur);
        }

        mpUpdateAnalyzeButton();
    }

    function parseSRT(text) {
        var segments = [];
        var srtPattern = /(\d+)\r?\n(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})\r?\n([\s\S]*?)(?=\r?\n\r?\n|\r?\n\d+\r?\n|$)/g;
        var match;

        while ((match = srtPattern.exec(text)) !== null) {
            segments.push({
                index: parseInt(match[1]),
                startTime: srtTimeToSeconds(match[2]),
                endTime: srtTimeToSeconds(match[3]),
                text: match[4].replace(/\r?\n/g, " ").trim()
            });
        }
        if (segments.length > 0) return segments;

        var tsPattern = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(.*)/g;
        while ((match = tsPattern.exec(text)) !== null) {
            var h = 0, m = parseInt(match[1]), s = parseInt(match[2]);
            if (match[3]) { h = m; m = s; s = parseInt(match[3]); }
            segments.push({
                index: segments.length + 1,
                startTime: h * 3600 + m * 60 + s,
                endTime: h * 3600 + m * 60 + s + 5,
                text: match[4].trim()
            });
        }
        if (segments.length > 0) return segments;

        var lines = text.split(/\r?\n/).filter(function(l) { return l.trim().length > 0; });
        for (var i = 0; i < lines.length; i++) {
            segments.push({
                index: i + 1,
                startTime: i * 5,
                endTime: (i + 1) * 5,
                text: lines[i].trim()
            });
        }
        return segments;
    }

    function srtTimeToSeconds(timeStr) {
        var parts = timeStr.replace(",", ".").split(":");
        return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    }

    function buildTimedTranscript() {
        if (state.segments.length === 0) return state.transcript;
        return state.segments.map(function(seg) {
            return "[" + seg.startTime.toFixed(1) + "s - " + seg.endTime.toFixed(1) + "s] " + seg.text;
        }).join("\n");
    }

    function formatTime(secs) {
        var m = Math.floor(secs / 60);
        var s = Math.floor(secs % 60);
        return m + ":" + (s < 10 ? "0" : "") + s;
    }

    function formatTimeFull(secs) {
        var h = Math.floor(secs / 3600);
        var m = Math.floor((secs % 3600) / 60);
        var s = Math.floor(secs % 60);
        if (h > 0) return h + ":" + (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
        return m + ":" + (s < 10 ? "0" : "") + s;
    }

    // ─── Export ──────────────────────────────────────────────────

    function copyToClipboard(text) {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try { document.execCommand("copy"); } catch(e) {}
        document.body.removeChild(ta);
    }

    function navigateToTime(seconds) {
        csInterface.evalScript("movePlayhead(" + seconds + ")", function() {});
    }

    // ─── UI Helpers ──────────────────────────────────────────────

    function setProgress(fillId, textId, pct, text) {
        var fill = document.getElementById(fillId);
        var label = document.getElementById(textId);
        if (fill) fill.style.width = Math.min(pct, 100) + "%";
        if (label && text != null) label.textContent = text;
    }

    // [EXTRACTED] STT Progress helpers → see ui-*.js


    function showToast(msg, type) {
        var toast = document.getElementById("toast");
        if (!toast) return;
        toast.textContent = msg;
        toast.className = "toast toast-" + type + " show";
        clearTimeout(toast._timeout);
        toast._timeout = setTimeout(function() { toast.classList.remove("show"); }, 3500);
    }

    function showElement(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.classList.remove("hidden");
        if (el.style.display === "none") el.style.display = "";
    }
    function hideElement(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.classList.add("hidden");
        if (el.classList.contains("rec-step")) el.style.display = "none";
    }
    function disableBtn(id) { var el = document.getElementById(id); if (el) { el.disabled = true; el.classList.add("btn-disabled"); } }
    function enableBtn(id) { var el = document.getElementById(id); if (el) { el.disabled = false; el.classList.remove("btn-disabled"); } }

    function esc(str) {
        if (!str) return "";
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    /** El modelo a veces devuelve "\\n" como dos caracteres (backslash + n) en lugar de salto real. */
    // [EXTRACTED] Supertext text helpers → see ui-*.js
    function escAttr(str) {
        if (!str) return "";
        return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function escExtend(str) {
        if (!str) return "";
        return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
    }

    // [REMOVED] First refreshAllHeaderProgress() — duplicate of the delegating version below (v1.0.72)

    // [EXTRACTED] ST2 Progress helpers → see ui-*.js

    // [REMOVED] First bindCollapsibles() definition — duplicate of the complete version below (v1.0.72)

    // [EXTRACTED] Recording Notes UI → see ui-*.js

    // ═══════════════════════════════════════════════════════════════
    // ═══ MOTION-PRO ═══════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════

    // [EXTRACTED] Motion-Pro UI → see ui-*.js


    // ─── Proxy functions → delegated to UI modules ──────────────
    // These functions were extracted into UI modules but are still
    // called by main.js core. They delegate to the module if loaded.

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

    function truncate(str, maxLen) {
        return str.length <= maxLen ? str : str.substring(0, maxLen - 3) + "...";
    }

    function formatFileSize(bytes) {
        if (!bytes) return "0 B";
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / 1048576).toFixed(1) + " MB";
    }

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
                e.stopPropagation(); // Don't trigger card collapse
                var card = hdr.closest(".tool-card");
                if (!card) return;
                var body = hdr.nextElementSibling;

                if (card.classList.contains("fullscreen")) {
                    // Exit fullscreen
                    card.classList.remove("fullscreen");
                    fsBtn.innerHTML = "⛶";
                    fsBtn.title = "Pantalla completa";
                    document.body.style.overflow = "";
                } else {
                    // Enter fullscreen — first make sure card is expanded
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
            // Insert right before the toggle icon (▸) so they're side by side on the right
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

    // Proxy: delegate to module functions
    function clearRenderedTranscript() {
        var container = document.getElementById("transcript-rendered");
        var textarea = document.getElementById("transcript-input");
        if (container) { container.innerHTML = ""; container.classList.add("hidden"); }
        if (textarea) textarea.classList.remove("hidden");
    }
    function renderSpellCheckResults() { if (window.EditorProUI && window.EditorProUI.spellcheck) window.EditorProUI.spellcheck.render(); }
    function startSpellCheck() { if (window.EditorProUI && window.EditorProUI.spellcheck) window.EditorProUI.spellcheck.start(); }
    function loadCustomDictionary() { if (window.EditorProUI && window.EditorProUI.spellcheck) window.EditorProUI.spellcheck.loadDictionary(); }
    function addDictWord() { if (window.EditorProUI && window.EditorProUI.spellcheck) window.EditorProUI.spellcheck.addDictWord(); }
    function renderSupertext2Results(r) { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.render(r); }
    function startSupertexts2() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.start(); }
    function toggleSelectAllSupertexts2() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.toggleSelectAll(); }
    function createSupertext2Graphics() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.createGraphics(); }
    function exportSupertexts2() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.exportData(); }
    function st2ExcludeByTrack() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.excludeByTrack(); }
    function selectMOGRTFile(type) { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.selectMOGRTFile(type); }
    function loadMOGRTConfig() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.loadMOGRTConfig(); }
    function toggleMOGRTConfig() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.toggleMOGRTConfig(); }
    function loadMOGRTFolder() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.loadMOGRTFolder(); }
    function st2BatchOpen() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.batchOpen(); }
    function st2BatchAnalyzeAll() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.batchAnalyzeAll(); }
    function st2BatchCreateAll() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.batchCreateAll(); }
    function st2BatchClose() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.batchClose(); }
    function st2BatchNavPrev() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.batchNavPrev(); }
    function st2BatchNavNext() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.batchNavNext(); }
    function st2BatchNavBack() { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.batchNavBack(); }
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
    function mpInit() { if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.init(); }
    function applySttResultToRecordingNotes(r, s) { if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.applySttResultToRecordingNotes(r, s); }
    function renderClickableTranscript(w, n) { if (window.EditorProUI && window.EditorProUI.recording && window.EditorProUI.recording.renderClickableTranscript) window.EditorProUI.recording.renderClickableTranscript(w, n); }
    function mpSwitchToSequence() { if (window.EditorProUI && window.EditorProUI.motionPro && window.EditorProUI.motionPro.switchToSequence) window.EditorProUI.motionPro.switchToSequence(); }
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

    // refreshAllHeaderProgress delegates to all module progress helpers
    function refreshAllHeaderProgress() {
        if (window.EditorProUI && window.EditorProUI.recording) window.EditorProUI.recording.refreshSttHeaderProgressVisibility();
        if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.setST2Progress && 0; // handled internally
        if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.refreshES2HeaderProgressVisibility();
        if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.refreshRPHeaderProgressVisibility();
        if (window.EditorProUI && window.EditorProUI.motionPro) window.EditorProUI.motionPro.refreshHeaderProgressVisibility();
    }

    // Supertext helpers needed by main.js (also defined in ui-supertexts.js)
    function normalizeSupertextNewlines(str) {
        if (str === undefined || str === null) return "";
        var s = String(str);
        s = s.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n");
        return s;
    }
    function normalizeSt2Fields(st) {
        if (!st) return st;
        if (st.text != null) st.text = normalizeSupertextNewlines(st.text);
        if (st.reason != null) st.reason = normalizeSupertextNewlines(st.reason);
        return st;
    }
    function escSupertextHtml(str) {
        if (str === undefined || str === null) return "";
        var s = normalizeSupertextNewlines(str);
        return s.split(/\r?\n/).map(function(line) { return esc(line); }).join("<br>");
    }
    var MP_ANTICIPATION_SECS = 0.35;
    function _st2ExtractTranscriptEnd(timedTranscript) {
        if (!timedTranscript) return 0;
        var matches = timedTranscript.match(/\[\d+\.?\d*s\s*-\s*(\d+\.?\d*)s\]/g);
        if (!matches || matches.length === 0) return 0;
        var last = matches[matches.length - 1];
        var m = last.match(/-\s*(\d+\.?\d*)s\]/);
        return m ? parseFloat(m[1]) : 0;
    }
    function _st2CapEndTimes(s, t) { return s; }
    function setST2Progress(p, t) { if (window.EditorProUI && window.EditorProUI.supertexts) window.EditorProUI.supertexts.setST2Progress(p, t); }
    function setES2Progress(p, t) { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.setES2Progress(p, t); }
    function setRPProgress(p, t) { if (window.EditorProUI && window.EditorProUI.editSuggestions) window.EditorProUI.editSuggestions.setRPProgress(p, t); }

    // ─── Expose utility functions for UI modules ────────────────
    window._epOn = on;
    window._epClearContainer = clearContainer;
    window._epSafeCallback = safeCallback;
    window._epShowToast = showToast;
    window._epShowElement = showElement;
    window._epHideElement = hideElement;
    window._epDisableBtn = disableBtn;
    window._epEnableBtn = enableBtn;
    window._epEsc = esc;
    window._epEscAttr = escAttr;
    window._epEscExtend = escExtend;
    window._epSetProgress = setProgress;
    window._epExpandSection = expandSection;
    window._epFormatTime = formatTime;
    window._epFormatTimeFull = formatTimeFull;
    window._epNavigateToTime = navigateToTime;
    window._epBuildTimedTranscript = buildTimedTranscript;
    window._epCopyToClipboard = copyToClipboard;
    window._epGetPromptContext = getPromptContext;
    window._epTogglePromptEditorById = togglePromptEditorById;
    window._epSavePromptById = savePromptById;
    window._epResetPromptById = resetPromptById;
    window._epNormalizeSupertextNewlines = normalizeSupertextNewlines;
    window._epNormalizeSt2Fields = normalizeSt2Fields;
    window._epEscSupertextHtml = escSupertextHtml;
    window._epSecsToSRTTime = secsToSRTTime;
    window._epPad2 = pad2;
    window._epPad3 = pad3;
    window._epTruncate = truncate;
    window._epFormatFileSize = formatFileSize;
    window._epRefreshAllHeaderProgress = refreshAllHeaderProgress;
    window._epParseTextClipsFromXML = parseTextClipsFromXML;
    window._epSttResultToSRT = sttResultToSRT;
    window._epParseSRT = parseSRT;
    window._epSrtTimeToSeconds = srtTimeToSeconds;
    window._epLoadTranscriptText = loadTranscriptText;
    window._epOnTranscriptChange = onTranscriptChange;
    window._epReadTranscriptFromProjectFile = readTranscriptFromProjectFile;
    window._epReadCaptionsFromProjectFile = readCaptionsFromProjectFile;
    window._epSrtSegmentsToSttResult = srtSegmentsToSttResult;
    window._epRenderTranscriptFromSegments = renderTranscriptFromSegments;
    window._epBindCollapsibles = bindCollapsibles;
    window._epMP_ANTICIPATION_SECS = MP_ANTICIPATION_SECS;
    window._epParseTranscriptJson = parseTranscriptJson;
    window._epFindTranscriptFiles = findTranscriptFiles;
    window._epGetTakeAnalysisPromptContext = getTakeAnalysisPromptContext;

    // ─── Auto-update on reload ───────────────────────────────────
    var _updateAvailable = false;
    var _originalReloadHTML = "";

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

    // Show current version from VERSION file
    function _showVersion() {
        try {
            var extensionPath = csInterface.getSystemPath("extension");
            var versionFile = path.join(extensionPath, "VERSION");
            if (fs.existsSync(versionFile)) {
                var ver = fs.readFileSync(versionFile, "utf8").trim();
                var label = document.getElementById("version-label");
                if (label) {
                    label.textContent = "v" + ver;
                    label.title = "Editor-Pro v" + ver;
                }
            }
        } catch(e) {}
    }
    setTimeout(_showVersion, 500);

    // Check on startup after 5 seconds
    setTimeout(_checkForUpdates, 5000);

    /**
     * Kill motion-server before reload to prevent zombie processes.
     * Calls callback() when done (or immediately if MotionPro unavailable).
     */
    function _cleanupBeforeReload(callback) {
        try {
            if (window.motionPro && typeof window.motionPro.stopServer === "function") {
                console.log("[Editor-Pro] Stopping motion-server before reload...");
                window.motionPro.stopServer(function() { callback(); });
                // Safety: if stopServer hangs, reload anyway after 2s
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
                        btn.innerHTML = "⬇️";
                        btn.title = "Descargando update...";
                        exec("cd '" + extensionPath + "' && BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main) && git pull origin $BRANCH 2>&1",
                            { timeout: 30000 },
                            function(err2, stdout2) {
                                if (!err2) {
                                    btn.innerHTML = "✅";
                                    btn.title = "Actualizado! Recargando...";
                                    _cleanupBeforeReload(function() { location.reload(); });
                                } else {
                                    btn.innerHTML = "❌";
                                    btn.title = "Error: " + (err2.message || "git pull falló");
                                    setTimeout(function() { btn.innerHTML = originalHTML; btn.title = "Recargar panel"; }, 3000);
                                }
                            }
                        );
                    } else {
                        btn.innerHTML = "✅";
                        btn.title = "Sin updates — recargando...";
                        _cleanupBeforeReload(function() { location.reload(); });
                    }
                }
            );
        } catch(e) {
            _cleanupBeforeReload(function() { location.reload(); });
        }
    };

// ─── Start ───────────────────────────────────────────────────
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

})();
