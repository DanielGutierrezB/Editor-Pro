/**
 * Editor-Pro - Main Controller for Premiere Pro
 * Cutter + SpellCheck + Smart Supertexts + Edit Suggestions + Recording Notes (STT + Take Analysis)
 */

(function() {
    "use strict";

    var csInterface = new CSInterface();
    var engine = null;
    var aiAnalyzer = null;
    var stt = null;
    var recorder = null;

    var fs, path, os;
    try { fs = require("fs"); path = require("path"); os = require("os"); } catch(e) {}

    var motionPro = null;

    var state = {
        transcript: "",
        segments: [],
        sequenceName: "",
        analyzing: false,
        ollamaConnected: false,
        textClips: [],
        clipResults: {},
        supertexts2: [],
        supertexts2Inserted: false,
        mogrtPaths: { title: "", bullet: "", step: "", definition: "", data: "", summary: "", highlight: "" },
        mogrtTrackIndex: "auto",
        es2Highlights: [],
        es2Suggestions: [],
        es2Errors: [],
        reelProposals: [],
        customDictionary: [],
        // Recording Notes state
        audioPath: "",
        audioFileName: "",
        audioFileSize: 0,
        transcribing: false,
        exporting: false,
        sttResult: null,
        detectionResult: null,
        takeResult: null,
        supplementaryPairs: [],
        aiAdjustments: [],
        aiSuggestionStates: {},
        markersPlaced: false,
        transcribeFolder: "",
        lastWhisperResult: null,
        // Motion-Pro state
        mpAnalyzing: false,
        mpGenerating: false,
        mpGenerateCancelRequested: false,
        settings: {
            aiProvider: "ollama",
            aiModel: "mistral-small3.1:latest",
            sttProvider: "elevenlabs",
            sttModel: "scribe_v1"
        }
    };

    // ─── Init ────────────────────────────────────────────────────
    function init() {
        var extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);
        engine = new SpellCheckEngine({ extensionPath: extensionPath, uiLanguage: "es" });
        aiAnalyzer = new AIAnalyzer();
        stt = new SpeechToText();
        recorder = new RecordingNotes();
        motionPro = new MotionPro();

        stt.setPluginDir(extensionPath);

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
    }

    function loadSavedSettings() {
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

    function bindEvents() {
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

        initPromptEditor();

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

    // ─── Sequence Info & Change Detection ─────────────────────────
    var _seqCache = {};
    var _lastSeqName = "";

    function refreshSequenceInfo() {
        csInterface.evalScript("getActiveSequenceInfo()", function(result) {
            try {
                var data = JSON.parse(result);
                if (data.error) {
                    document.getElementById("seq-name").textContent = "Sin secuencia activa";
                    document.getElementById("seq-meta").textContent = "";
                    return;
                }
                var newSeqName = data.name || "";
                var changed = newSeqName && newSeqName !== _lastSeqName && _lastSeqName !== "";

                if (changed) {
                    saveCurrentSequenceState();
                }

                state.sequenceName = newSeqName;
                _lastSeqName = newSeqName;
                document.getElementById("seq-name").textContent = newSeqName;
                var meta = [];
                if (data.textClipCount > 0) meta.push(data.textClipCount + " textos");
                if (data.markerCount > 0) meta.push(data.markerCount + " markers");
                document.getElementById("seq-meta").textContent = meta.join(" · ");

                if (changed) {
                    restoreSequenceState(newSeqName);
                    mpSwitchToSequence();
                }
            } catch(e) {}
        });

        csInterface.evalScript("getTranscribeFolder()", function(result) {
            try {
                var data = JSON.parse(result);
                if (data.success) state.transcribeFolder = data.path;
            } catch(e) {}
        });
    }

    function startSequencePolling() {
        setInterval(function() {
            csInterface.evalScript("getActiveSequenceInfo()", function(result) {
                try {
                    var data = JSON.parse(result);
                    if (data.error || !data.name) return;
                    if (data.name !== _lastSeqName && _lastSeqName !== "") {
                        saveCurrentSequenceState();
                        _lastSeqName = data.name;
                        state.sequenceName = data.name;
                        document.getElementById("seq-name").textContent = data.name;
                        var meta = [];
                        if (data.textClipCount > 0) meta.push(data.textClipCount + " textos");
                        if (data.markerCount > 0) meta.push(data.markerCount + " markers");
                        document.getElementById("seq-meta").textContent = meta.join(" · ");
                        restoreSequenceState(data.name);
                    } else if (!_lastSeqName) {
                        _lastSeqName = data.name;
                        state.sequenceName = data.name;
                    }
                } catch(e) {}
            });
        }, 2000);
    }

    // ─── Sequence Dropdown ─────────────────────────────────────

    function toggleSeqDropdown() {
        var panel = document.getElementById("seq-dropdown-panel");
        if (!panel) return;
        var wasHidden = panel.classList.contains("hidden");
        if (wasHidden) {
            saveCurrentSequenceState();
            populateSeqDropdown();
        }
        panel.classList.toggle("hidden");
    }

    function populateSeqDropdown() {
        var list = document.getElementById("seq-dropdown-list");
        if (!list) return;
        list.innerHTML = "";

        var names = Object.keys(_seqCache);
        if (_lastSeqName && names.indexOf(_lastSeqName) === -1) {
            saveCurrentSequenceState();
            names = Object.keys(_seqCache);
        }

        if (names.length === 0) {
            list.innerHTML = '<div class="seq-dropdown-empty">Sin secuencias con contenido</div>';
            return;
        }

        names.forEach(function(name) {
            var cached = _seqCache[name];
            var tags = buildSeqSummaryTags(cached);
            if (tags.length === 0) return;

            var item = document.createElement("div");
            item.className = "seq-dropdown-item" + (name === _lastSeqName ? " seq-active" : "");

            var nameSpan = document.createElement("div");
            nameSpan.className = "seq-dropdown-name";
            nameSpan.textContent = name;
            item.appendChild(nameSpan);

            var tagsDiv = document.createElement("div");
            tagsDiv.className = "seq-dropdown-tags";
            tags.forEach(function(tag) {
                var t = document.createElement("span");
                t.className = "seq-dropdown-tag";
                t.style.color = tag.color || "var(--text-muted)";
                t.textContent = tag.label;
                tagsDiv.appendChild(t);
            });
            item.appendChild(tagsDiv);

            (function(seqName) {
                item.addEventListener("click", function() {
                    openSequenceByName(seqName);
                    document.getElementById("seq-dropdown-panel").classList.add("hidden");
                });
            })(name);

            list.appendChild(item);
        });

        if (list.children.length === 0) {
            list.innerHTML = '<div class="seq-dropdown-empty">Sin secuencias con contenido</div>';
        }
    }

    function buildSeqSummaryTags(cached) {
        var tags = [];
        if (cached.transcript && cached.transcript.trim().length > 0) {
            tags.push({ label: "📝 Transcripción", color: "var(--text-secondary)" });
        }
        if (cached.es2Highlights && cached.es2Highlights.length > 0) {
            tags.push({ label: "⭐ " + cached.es2Highlights.length + " highlights", color: "var(--highlight)" });
        }
        if (cached.es2Suggestions && cached.es2Suggestions.length > 0) {
            tags.push({ label: "✂️ " + cached.es2Suggestions.length + " sugerencias", color: "var(--warning)" });
        }
        if (cached.es2Errors && cached.es2Errors.length > 0) {
            tags.push({ label: "🚨 " + cached.es2Errors.length + " errores", color: "var(--error)" });
        }
        if (cached.supertexts2 && cached.supertexts2.length > 0) {
            tags.push({ label: "💡 " + cached.supertexts2.length + " supertexts", color: "var(--success)" });
        }
        if (cached.reelProposals && cached.reelProposals.length > 0) {
            tags.push({ label: "🎬 " + cached.reelProposals.length + " reels", color: "#ec4899" });
        }
        if (cached.detectionResult) {
            var segs = cached.detectionResult.segments;
            if (segs && segs.length > 0) {
                tags.push({ label: "🎙 " + segs.length + " tomas", color: "var(--accent-bright)" });
            }
        }
        return tags;
    }

    function openSequenceByName(seqName) {
        if (seqName === _lastSeqName) return;
        saveCurrentSequenceState();

        var safeName = seqName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        csInterface.evalScript('findAndOpenSequenceByName("' + safeName + '")', function(result) {
            try {
                var res = JSON.parse(result);
                if (res.error) {
                    showToast("Error: " + res.error, "error");
                    return;
                }
                _lastSeqName = seqName;
                state.sequenceName = seqName;
                document.getElementById("seq-name").textContent = seqName;
                restoreSequenceState(seqName);
            } catch(e) {
                showToast("Error al abrir secuencia", "error");
            }
        });
    }

    // ─── Per-Sequence State Persistence ──────────────────────────

    function saveCurrentSequenceState() {
        if (!_lastSeqName) return;
        _seqCache[_lastSeqName] = {
            transcript: state.transcript,
            segments: state.segments,
            sttResult: state.sttResult,
            lastWhisperResult: state.lastWhisperResult,
            detectionResult: state.detectionResult,
            clipResults: state.clipResults,
            textClips: state.textClips,
            supertexts2: state.supertexts2,
            supertexts2Summary: document.getElementById("st2-summary") ? document.getElementById("st2-summary").innerHTML : "",
            es2Highlights: state.es2Highlights,
            es2Suggestions: state.es2Suggestions,
            es2Errors: state.es2Errors,
            es2ResultSummary: document.getElementById("es2-summary") ? document.getElementById("es2-summary").innerHTML : "",
            reelProposals: state.reelProposals,
            reelAssessment: document.getElementById("rp-assessment") ? document.getElementById("rp-assessment").innerHTML : ""
        };
    }

    function restoreSequenceState(seqName) {
        var cached = _seqCache[seqName];
        if (cached) {
            state.transcript = cached.transcript || "";
            state.segments = cached.segments || [];
            state.sttResult = cached.sttResult || null;
            state.lastWhisperResult = cached.lastWhisperResult || null;
            state.detectionResult = cached.detectionResult || null;
            state.clipResults = cached.clipResults || {};
            state.textClips = cached.textClips || [];
            state.supertexts2 = cached.supertexts2 || [];
            state.es2Highlights = cached.es2Highlights || [];
            state.es2Suggestions = cached.es2Suggestions || [];
            state.es2Errors = cached.es2Errors || [];
            state.reelProposals = cached.reelProposals || [];
            restoreUIFromState(cached);
            showToast("Secuencia: " + seqName, "info");
        } else {
            clearAllToolState();
            autoLoadTranscriptForSequence(seqName);
        }
    }

    function clearAllToolState() {
        state.transcript = "";
        state.segments = [];
        state.sttResult = null;
        state.detectionResult = null;
        state.clipResults = {};
        state.textClips = [];
        state.supertexts2 = [];
        state.es2Highlights = [];
        state.es2Suggestions = [];
        state.es2Errors = [];
        state.reelProposals = [];
        restoreUIFromState(null);
    }

    function restoreUIFromState(cached) {
        // Transcript
        var textarea = document.getElementById("transcript-input");
        if (textarea) textarea.value = state.transcript || "";
        onTranscriptChange();

        if (state.sttResult && state.sttResult.words && state.sttResult.words.length > 0) {
            renderTranscriptFromSegments();
            refreshTraerTranscriptButtons();
        } else {
            clearRenderedTranscript();
        }

        // SpellCheck
        if (state.clipResults && Object.keys(state.clipResults).length > 0) {
            renderSpellCheckResults();
            showElement("sc-results");
            hideElement("sc-empty");
        } else {
            document.getElementById("sc-clip-list").innerHTML = "";
            hideElement("sc-results");
            showElement("sc-empty");
        }

        // Smart Supertexts
        if (state.supertexts2 && state.supertexts2.length > 0) {
            renderSupertext2Results({
                summary: cached && cached.supertexts2Summary ? "" : state.supertexts2.length + " momentos clave identificados"
            });
            if (cached && cached.supertexts2Summary) {
                var stSummary = document.getElementById("st2-summary");
                if (stSummary) stSummary.innerHTML = cached.supertexts2Summary;
            }
            showElement("st2-results");
            hideElement("st2-empty");
        } else {
            document.getElementById("st2-list").innerHTML = "";
            document.getElementById("st2-summary").innerHTML = "";
            hideElement("st2-results");
            showElement("st2-empty");
        }

        // Edit Suggestions
        if ((state.es2Highlights && state.es2Highlights.length > 0) ||
            (state.es2Suggestions && state.es2Suggestions.length > 0) ||
            (state.es2Errors && state.es2Errors.length > 0)) {
            renderES2Results({
                summary: "",
                overallScore: undefined
            });
            if (cached && cached.es2ResultSummary) {
                var es2Summary = document.getElementById("es2-summary");
                if (es2Summary) es2Summary.innerHTML = cached.es2ResultSummary;
            }
            showElement("es2-results");
            hideElement("es2-empty");
        } else {
            var es2List = document.getElementById("es2-list");
            var es2Sum = document.getElementById("es2-summary");
            if (es2List) es2List.innerHTML = "";
            if (es2Sum) es2Sum.innerHTML = "";
            hideElement("es2-results");
            showElement("es2-empty");
        }

        // Reel Proposals
        if (state.reelProposals && state.reelProposals.length > 0) {
            renderReelResults({ reels: state.reelProposals, assessment: "", notSuitable: [] });
            if (cached && cached.reelAssessment) {
                var rpAssess = document.getElementById("rp-assessment");
                if (rpAssess) rpAssess.innerHTML = cached.reelAssessment;
            }
            showElement("rp-results");
            hideElement("rp-empty");
        } else {
            var rpList = document.getElementById("rp-list");
            var rpAssess = document.getElementById("rp-assessment");
            if (rpList) rpList.innerHTML = "";
            if (rpAssess) rpAssess.innerHTML = "";
            hideElement("rp-results");
            showElement("rp-empty");
        }
    }

    function autoLoadTranscriptForSequence(seqName) {
        if (!state.transcribeFolder || !seqName || !fs || !path) return;
        var jsonPath = path.join(state.transcribeFolder, seqName + ".json");
        try {
            if (fs.existsSync(jsonPath)) {
                var parsed = parseTranscriptJson(jsonPath);
                if (parsed && parsed.words && parsed.words.length > 5) {
                    state.sttResult = parsed;
                    state.lastWhisperResult = parsed;
                    refreshTraerTranscriptButtons();
                    applySttResultToRecordingNotes(parsed, true);
                    hideElement("recording-empty");
                    var srt = sttResultToSRT(parsed);
                    loadTranscriptText(srt, seqName + ".json");
                    showToast("Transcript cargado: " + seqName, "success");
                    return;
                }
            }
        } catch(e) {}

        var srtPath = path.join(state.transcribeFolder, seqName + ".srt");
        try {
            if (fs.existsSync(srtPath)) {
                var content = fs.readFileSync(srtPath, "utf8");
                var segments = parseSRT(content);
                if (segments && segments.length > 3) {
                    var sttResult = srtSegmentsToSttResult(segments);
                    state.sttResult = sttResult;
                    state.lastWhisperResult = sttResult;
                    refreshTraerTranscriptButtons();
                    applySttResultToRecordingNotes(sttResult, true);
                    hideElement("recording-empty");
                    var srt = sttResultToSRT(sttResult);
                    loadTranscriptText(srt, seqName + ".srt");
                    showToast("Transcript cargado: " + seqName, "success");
                    return;
                }
            }
        } catch(e) {}
    }

    // ─── Info Modal ─────────────────────────────────────────────

    function showInfoModal(title, bodyHtml) {
        var overlay = document.getElementById("info-modal-overlay");
        var titleEl = document.getElementById("info-modal-title");
        var bodyEl = document.getElementById("info-modal-body");
        if (!overlay || !titleEl || !bodyEl) return;
        titleEl.textContent = title;
        bodyEl.innerHTML = bodyHtml;
        overlay.classList.remove("hidden");
    }

    function hideInfoModal() {
        var overlay = document.getElementById("info-modal-overlay");
        if (overlay) overlay.classList.add("hidden");
    }

    function showTranscriptExportInstructions() {
        var seqName = state.sequenceName || "tu secuencia";
        showInfoModal("Cómo exportar el transcript de Premiere", [
            '<p>Para importar el transcript de la secuencia activa, primero debes exportarlo desde Premiere:</p>',
            '<ol>',
            '<li>Abre el panel <span class="info-step-highlight">Text</span> en Premiere Pro</li>',
            '<li>Ve a la pestaña <span class="info-step-highlight">Transcript</span></li>',
            '<li>Verifica que esté seleccionada la secuencia correcta: <span class="info-path">' + esc(seqName) + '</span></li>',
            '<li>Haz clic en el menú <span class="info-step-highlight">...</span> (tres puntos)</li>',
            '<li>Selecciona <span class="info-step-highlight">Export transcript (JSON)...</span></li>',
            '<li>Guárdalo con el nombre de la secuencia</li>',
            '</ol>',
            '<div class="info-note">',
            '<strong>Tip:</strong> Una vez exportado, haz clic en <strong>Cargar transcript JSON</strong> para seleccionar el archivo, o guárdalo en la carpeta <span class="info-path">Transcribe/</span> junto al proyecto y se cargará automáticamente al cambiar de secuencia.',
            '</div>'
        ].join(""));
    }

    // ─── Import Transcript JSON ─────────────────────────────────

    function copyTranscriptToFolder(sourcePath, seqName) {
        if (!fs || !path || !state.transcribeFolder || !seqName) return;
        try {
            var destPath = path.join(state.transcribeFolder, seqName + ".json");
            if (sourcePath !== destPath) {
                fs.copyFileSync(sourcePath, destPath);
            }
        } catch(e) {}
    }

    function handleJsonTranscriptSelect(evt) {
        var file = evt.target.files[0];
        if (!file) return;

        try {
            var content = fs.readFileSync(file.path, "utf8");
            var data = JSON.parse(content);
            var parsed = null;

            if (data.segments && Array.isArray(data.segments) && data.segments.length > 0 &&
                data.segments[0].words && typeof data.segments[0].start === "number") {
                parsed = parsePremiereTextPanelJson(data);
            } else {
                parsed = parseTranscriptJson(file.path);
            }

            if (!parsed || !parsed.words || parsed.words.length < 3) {
                showToast("No se encontraron palabras válidas en el JSON", "error");
                evt.target.value = "";
                return;
            }

            if (state.sequenceName) {
                copyTranscriptToFolder(file.path, state.sequenceName);
            }

            state.sttResult = parsed;
            state.lastWhisperResult = parsed;
            refreshTraerTranscriptButtons();
            applySttResultToRecordingNotes(parsed, true);
            hideElement("recording-empty");
            var srt = sttResultToSRT(parsed);
            loadTranscriptText(srt, path.basename(file.path));
            showToast("Transcript JSON cargado (" + parsed.words.length + " palabras)", "success");
        } catch(e) {
            showToast("Error al leer JSON: " + e.message, "error");
        }
        evt.target.value = "";
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

    function startSpellCheck() {
        if (state.analyzing) return;
        if (!checkAIReady()) return;

        state.analyzing = true;
        state.clipResults = {};
        expandSection("spellcheck");

        hideElement("sc-results");
        hideElement("sc-empty");
        showElement("sc-progress");
        setProgress("sc-progress-fill", "sc-progress-text", 5, "Exportando secuencia...");
        disableBtn("btn-spellcheck");

        csInterface.evalScript("exportSequenceXML()", function(result) {
            try {
                var data = JSON.parse(result);
                if (data.error) {
                    finishSpellCheck();
                    showToast(data.error, "error");
                    return;
                }

                document.getElementById("seq-name").textContent = data.sequenceName;
                setProgress("sc-progress-fill", "sc-progress-text", 15, "Leyendo clips de texto del XML...");

                state.textClips = parseTextClipsFromXML(data.path);

                if (state.textClips.length === 0) {
                    finishSpellCheck();
                    showToast("No se encontraron clips de texto (Essential Graphics) en la secuencia", "info");
                    showElement("sc-empty");
                    return;
                }

                setProgress("sc-progress-fill", "sc-progress-text", 20,
                    state.textClips.length + " clips de texto encontrados. Analizando...");
                analyzeClipSequential(0);

            } catch(e) {
                finishSpellCheck();
                showToast("Error: " + e.message, "error");
            }
        });
    }

    function analyzeClipSequential(idx) {
        if (idx >= state.textClips.length) {
            renderSpellCheckResults();
            showElement("sc-results");
            autoPlaceCorrectionMarkers();
            return;
        }

        var clip = state.textClips[idx];
        var total = state.textClips.length;
        var pct = 20 + Math.round(((idx) / total) * 80);
        setProgress("sc-progress-fill", "sc-progress-text", pct,
            "Analizando clip " + (idx + 1) + "/" + total + ": " + clip.clipName);

        var allTexts = state.textClips.map(function(c) { return { name: c.clipName, text: c.text }; });

        var textToAnalyze = filterDictionaryWords(clip.text);

        aiAnalyzer.analyzeSpellCheck(textToAnalyze, {
            layerName: clip.clipName,
            allLayerTexts: allTexts,
            detectedLang: engine.detectLanguage(clip.text)
        }, function(result) {
            result = filterDictionaryIssues(result);
            state.clipResults[idx] = result;
            analyzeClipSequential(idx + 1);
        });
    }

    function filterDictionaryWords(text) {
        return text;
    }

    function filterDictionaryIssues(result) {
        if (!result || !result.issues || state.customDictionary.length === 0) return result;

        var dict = state.customDictionary.map(function(w) { return w.toLowerCase(); });
        result.issues = result.issues.filter(function(issue) {
            var word = (issue.original || issue.word || "").toLowerCase();
            return dict.indexOf(word) === -1;
        });

        if (result.issues.length === 0 && result.score < 95) {
            result.score = Math.max(result.score, 95);
        }

        return result;
    }

    function finishSpellCheck() {
        state.analyzing = false;
        hideElement("sc-progress");
        enableBtn("btn-spellcheck");
        refreshSequenceInfo();
    }

    function renderSpellCheckResults() {
        var list = document.getElementById("sc-clip-list");
        list.innerHTML = "";

        state.textClips.forEach(function(clip, idx) {
            var result = state.clipResults[idx];
            if (!result) return;

            var el = document.createElement("div");
            el.className = "clip-item";

            var score = result.score || 0;
            var issues = result.issues || [];
            var scoreColor = score >= 80 ? "var(--success)" : score >= 50 ? "var(--warning)" : "var(--error)";
            var scoreBg = score >= 80 ? "var(--success-bg)" : score >= 50 ? "var(--warning-bg)" : "var(--error-bg)";

            var suggText = (result.suggestedText && result.suggestedText !== clip.text) ? result.suggestedText : "";
            var nameDisplay = esc(clip.text);
            if (suggText) {
                nameDisplay = '<span style="text-decoration:line-through;opacity:0.6">' + esc(clip.text) + '</span>' +
                    ' <span style="color:var(--success)">→ ' + esc(suggText) + '</span>';
            }

            var headerHtml =
                '<div class="clip-item-header" data-clip-idx="' + idx + '">' +
                    '<span class="clip-item-name">' + nameDisplay + '</span>' +
                    '<span class="clip-item-time">' + formatTimeFull(clip.startTime) + '</span>' +
                    '<span class="clip-item-score" style="background:' + scoreBg + ';color:' + scoreColor + '">' + score + '</span>' +
                '</div>';

            var bodyHtml = '<div class="clip-item-body hidden" id="clip-body-' + idx + '">';
            bodyHtml += '<div class="clip-text-preview">' + esc(clip.text) + '</div>';

            if (result.error) {
                bodyHtml += '<div class="ai-error-msg">' + esc(result.error) + '</div>';
            } else if (issues.length === 0) {
                bodyHtml += '<div class="empty-state-mini"><p class="empty-text">Sin problemas</p></div>';
            } else {
                bodyHtml += '<div class="clip-issues">';
                issues.forEach(function(issue) {
                    var sev = issue.severity === "error" ? "border-left:2px solid var(--error)" : "border-left:2px solid var(--warning)";
                    bodyHtml +=
                        '<div class="clip-issue" style="' + sev + '">' +
                            '<div style="flex:1">' +
                                '<strong>' + esc(issue.original || "") + '</strong> → ' +
                                '<span style="color:var(--success)">' + esc(issue.suggestion || "") + '</span>' +
                                '<br><span style="opacity:0.8;font-size:9px">' + esc(issue.explanation || "") + '</span>' +
                                '<div class="clip-issue-fix">' +
                                    '<button class="btn btn-sm btn-ghost btn-dict-issue" ' +
                                        'data-word="' + escAttr(issue.original || "") + '">+ Diccionario</button>' +
                                '</div>' +
                            '</div>' +
                        '</div>';
                });
                bodyHtml += '</div>';
            }

            if (result.suggestedText && result.suggestedText !== clip.text) {
                bodyHtml +=
                    '<div class="clip-suggested">' +
                        '<div class="clip-suggested-label">Texto corregido sugerido</div>' +
                        '<div class="clip-suggested-text">' + esc(result.suggestedText) + '</div>' +
                    '</div>';
            }

            bodyHtml += '</div>';
            el.innerHTML = headerHtml + bodyHtml;
            list.appendChild(el);

            el.querySelector(".clip-item-header").addEventListener("click", function() {
                var body = document.getElementById("clip-body-" + idx);
                if (body) body.classList.toggle("hidden");
                navigateToTime(clip.startTime);
            });
        });

        list.addEventListener("click", function(e) {
            var dictBtn = e.target.closest(".btn-dict-issue");
            if (dictBtn) {
                addWordToDictionary(dictBtn.dataset.word);
                return;
            }
        });
    }

    function autoPlaceCorrectionMarkers() {
        var markers = [];
        state.textClips.forEach(function(clip, idx) {
            var result = state.clipResults[idx];
            if (!result) return;
            var issues = result.issues || [];
            if (issues.length === 0 && (!result.suggestedText || result.suggestedText === clip.text)) return;

            var lines = [];
            if (result.suggestedText && result.suggestedText !== clip.text) {
                lines.push("Texto sugerido: " + result.suggestedText);
            }
            issues.forEach(function(iss) {
                lines.push((iss.original || "") + " → " + (iss.suggestion || "") +
                    (iss.explanation ? " (" + iss.explanation + ")" : ""));
            });

            markers.push({
                time: clip.startTime,
                endTime: clip.endTime,
                name: "[SC] " + clip.clipName + " — " + issues.length + " corrección(es)",
                comment: "Original: " + clip.text + "\n" + lines.join("\n"),
                color: 6
            });
        });

        if (markers.length === 0) {
            finishSpellCheck();
            showToast("Análisis completado — sin correcciones necesarias", "success");
            return;
        }

        setProgress("sc-progress-fill", "sc-progress-text", 95, "Colocando " + markers.length + " marcador(es)...");

        csInterface.evalScript('clearMarkersByPrefix("[SC]")', function() {
            writeAndPlaceMarkers(markers, function(ok) {
                finishSpellCheck();
                showToast(ok
                    ? markers.length + " marcador(es) de corrección colocados en la secuencia"
                    : "Error al crear marcadores", ok ? "success" : "error");
            });
        });
    }

    function writeAndPlaceMarkers(markers, callback) {
        if (!fs) { callback(false); return; }
        var tmpPath = require("os").tmpdir() + "/editorpro_sc_markers.json";
        try {
            fs.writeFileSync(tmpPath, JSON.stringify(markers, null, 2), "utf8");
            csInterface.evalScript('addMarkersFromFile("' + escExtend(tmpPath) + '")', function(res) {
                try {
                    var data = JSON.parse(res);
                    callback(data.success === true);
                } catch(e) { callback(false); }
            });
        } catch(e) { callback(false); }
    }

    // ─── Custom Dictionary ───────────────────────────────────────

    function loadCustomDictionary() {
        try {
            var saved = localStorage.getItem("pr_custom_dict");
            state.customDictionary = saved ? JSON.parse(saved) : [];
        } catch(e) {
            state.customDictionary = [];
        }
        renderDictionary();
    }

    function saveDictionary() {
        localStorage.setItem("pr_custom_dict", JSON.stringify(state.customDictionary));
        renderDictionary();
    }

    function addDictWord() {
        var input = document.getElementById("dict-word-input");
        if (!input) return;
        var word = input.value.trim();
        if (!word) return;

        if (state.customDictionary.indexOf(word) === -1) {
            state.customDictionary.push(word);
            saveDictionary();
            showToast("'" + word + "' agregada al diccionario", "success");
        }
        input.value = "";
    }

    function addWordToDictionary(word) {
        if (!word) return;
        word = word.trim();
        if (state.customDictionary.indexOf(word) === -1) {
            state.customDictionary.push(word);
            saveDictionary();
            showToast("'" + word + "' agregada al diccionario", "success");
        }
    }

    function removeDictWord(word) {
        var idx = state.customDictionary.indexOf(word);
        if (idx !== -1) {
            state.customDictionary.splice(idx, 1);
            saveDictionary();
        }
    }

    function renderDictionary() {
        var countEl = document.getElementById("dict-count");
        if (countEl) countEl.textContent = state.customDictionary.length + " palabras";

        var container = document.getElementById("dict-words");
        if (!container) return;
        container.innerHTML = "";

        state.customDictionary.forEach(function(word) {
            var tag = document.createElement("span");
            tag.className = "dict-word-tag";
            tag.innerHTML = esc(word) + ' <button class="dict-word-remove" title="Eliminar">✕</button>';
            tag.querySelector(".dict-word-remove").addEventListener("click", function() {
                removeDictWord(word);
            });
            container.appendChild(tag);
        });
    }

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

    // ═══════════════════════════════════════════════════════════════
    // SMART SUPERTEXTS — MOGRT graphic clips on timeline
    // ═══════════════════════════════════════════════════════════════

    var ST2_TYPES = ["title", "bullet", "step", "definition", "data", "summary", "highlight"];
    var ST2_BULLET_SPACING = 70;

    // ── Pedagogical timing constants ──
    // Anticipation: elements enter BEFORE the narrator says them so they're
    // already fully visible on-screen when the word is spoken.
    var ST2_ANTICIPATION_SECS = 1.0;
    // When grouped bullets are closer than this threshold, they appear
    // together (batch); beyond it they stagger in one-by-one.
    var ST2_BATCH_THRESHOLD_SECS = 3.0;
    // Minimum reading buffer added after last mention so the viewer has
    // time to absorb the text before it exits.
    var ST2_READING_BUFFER_SECS = 1.5;
    // Estimated reading speed: seconds per word for buffer calculation.
    var ST2_SECS_PER_WORD = 0.25;
    // Minimum on-screen duration for any element (avoids flash appearances).
    var ST2_MIN_DURATION_SECS = 3.0;

    // Motion Pro anticipation offset applied to timeline placement.
    var MP_ANTICIPATION_SECS = 0.8;

    function loadMOGRTConfig() {
        try {
            var saved = localStorage.getItem("edupro_mogrt_paths");
            if (saved) state.mogrtPaths = JSON.parse(saved);
        } catch(e) {}
        state.mogrtTrackIndex = localStorage.getItem("edupro_mogrt_track") || "auto";

        ST2_TYPES.forEach(function(t) {
            var fileEl = document.getElementById("st2-mogrt-file-" + t);
            if (fileEl) {
                if (state.mogrtPaths[t]) {
                    fileEl.textContent = state.mogrtPaths[t].replace(/.*[\/\\]/, "");
                    fileEl.className = "mogrt-type-file mogrt-ready";
                } else {
                    fileEl.textContent = "Sin configurar";
                    fileEl.className = "mogrt-type-file mogrt-not-set";
                }
            }
        });

        var trackSel = document.getElementById("st2-track-select");
        if (trackSel) trackSel.value = state.mogrtTrackIndex;
        updateMOGRTConfigStatus();
    }

    function selectMOGRTFile(type) {
        csInterface.evalScript("selectMOGRTFile()", function(result) {
            try {
                var data = JSON.parse(result);
                if (data.cancelled) return;
                if (data.error) { showToast(data.error, "error"); return; }
                state.mogrtPaths[type] = data.path;
                localStorage.setItem("edupro_mogrt_paths", JSON.stringify(state.mogrtPaths));
                var fileEl = document.getElementById("st2-mogrt-file-" + type);
                if (fileEl) {
                    fileEl.textContent = data.path.replace(/.*[\/\\]/, "");
                    fileEl.className = "mogrt-type-file mogrt-ready";
                }
                updateMOGRTConfigStatus();
                showToast(type + ": " + data.path.replace(/.*[\/\\]/, ""), "success");
            } catch(e) {
                showToast("Error al seleccionar MOGRT", "error");
            }
        });
    }

    function toggleMOGRTConfig() {
        var body = document.getElementById("mogrt-config-body");
        var icon = document.querySelector(".mogrt-toggle-icon");
        if (!body) return;
        body.classList.toggle("hidden");
        if (icon) icon.textContent = body.classList.contains("hidden") ? "▸" : "▾";
    }

    function updateMOGRTConfigStatus() {
        var statusEl = document.getElementById("mogrt-config-status");
        if (!statusEl) return;
        var configured = 0;
        ST2_TYPES.forEach(function(t) { if (state.mogrtPaths[t]) configured++; });
        if (configured === 0) {
            statusEl.textContent = "Sin configurar";
            statusEl.style.color = "var(--text-muted)";
        } else if (configured === ST2_TYPES.length) {
            statusEl.textContent = configured + "/" + ST2_TYPES.length + " ✓";
            statusEl.style.color = "var(--success)";
        } else {
            statusEl.textContent = configured + "/" + ST2_TYPES.length;
            statusEl.style.color = "var(--warning)";
        }
    }

    function loadMOGRTFolder() {
        csInterface.evalScript("selectFolder()", function(result) {
            try {
                var data = JSON.parse(result);
                if (data.cancelled || data.error) return;
                var folderPath = data.path;
                if (!folderPath || !fs) return;

                var pathEl = document.getElementById("mogrt-folder-path");
                if (pathEl) pathEl.textContent = folderPath.replace(/.*[\/\\]([^\/\\]+)$/, "$1");

                var files;
                try { files = fs.readdirSync(folderPath); } catch(e) {
                    showToast("Error al leer carpeta", "error");
                    return;
                }

                var mogrtFiles = files.filter(function(f) {
                    return f.toLowerCase().indexOf(".mogrt") === f.length - 6;
                });

                var matched = 0;
                ST2_TYPES.forEach(function(type) {
                    var typeLower = type.toLowerCase();
                    for (var i = 0; i < mogrtFiles.length; i++) {
                        var nameLower = mogrtFiles[i].toLowerCase().replace(".mogrt", "");
                        if (nameLower === typeLower || nameLower.indexOf(typeLower) !== -1) {
                            var fullPath = folderPath + path.sep + mogrtFiles[i];
                            state.mogrtPaths[type] = fullPath;
                            matched++;
                            break;
                        }
                    }
                });

                localStorage.setItem("edupro_mogrt_paths", JSON.stringify(state.mogrtPaths));
                loadMOGRTConfig();
                showToast(matched + " MOGRT" + (matched !== 1 ? "s" : "") + " asignados de " + mogrtFiles.length + " encontrados", matched > 0 ? "success" : "info");
            } catch(e) {
                showToast("Error al procesar carpeta", "error");
            }
        });
    }

    function getSupertext2PromptContext() { return getPromptContext("st2"); }

    function startSupertexts2() {
        if (state.analyzing) return;
        if (!checkAIReady()) return;

        state.analyzing = true;
        expandSection("supertexts2");
        hideElement("st2-results");
        hideElement("st2-empty");
        showElement("st2-progress");
        disableBtn("btn-supertexts2");

        if (state.transcript && state.transcript.trim().length > 0) {
            setST2Progress(15, "Usando transcripción cargada...");
            runSupertext2Analysis();
            return;
        }

        setST2Progress(5, "Buscando subtítulos en la secuencia...");
        csInterface.evalScript("getSequenceCaptions()", function(result) {
            try {
                var data = JSON.parse(result);

                if (data.captions && data.captions.length > 0) {
                    var srt = "";
                    data.captions.forEach(function(cap, i) {
                        srt += (i + 1) + "\n";
                        srt += secsToSRTTime(cap.startTime) + " --> " + secsToSRTTime(cap.endTime) + "\n";
                        srt += cap.text + "\n\n";
                    });
                    loadTranscriptText(srt, "secuencia (captions)");
                    setST2Progress(15, data.captions.length + " subtítulos encontrados. Analizando...");
                    runSupertext2Analysis();
                    return;
                }

                if (data.srtContent) {
                    loadTranscriptText(data.srtContent, "SRT del proyecto");
                    setST2Progress(15, "SRT encontrado. Analizando...");
                    runSupertext2Analysis();
                    return;
                }

                state.analyzing = false;
                hideElement("st2-progress"); hideElement("st2-progress-header");
                enableBtn("btn-supertexts2");
                showElement("st2-empty");
                showToast("No se encontraron subtítulos. Carga un SRT en la sección Transcripción", "info");
            } catch(e) {
                state.analyzing = false;
                hideElement("st2-progress"); hideElement("st2-progress-header");
                enableBtn("btn-supertexts2");
                showToast("Error: " + e.message, "error");
            }
        });
    }

    function runSupertext2Analysis() {
        setST2Progress(20, "Analizando transcripción con IA...");
        var timedTranscript = buildTimedTranscript();

        aiAnalyzer.analyzeSupertexts(timedTranscript, getSupertext2PromptContext(), function(result) {
            setST2Progress(100, "Completado");
            setTimeout(function() {
                hideElement("st2-progress"); hideElement("st2-progress-header");
                state.analyzing = false;
                enableBtn("btn-supertexts2");

                if (result.error) {
                    showToast("Error: " + result.error, "error");
                    showElement("st2-empty");
                    return;
                }

                state.supertexts2 = (result.supertexts || []).map(function(st) {
                    st.checked = true;
                    if (st.type) st.type = st.type.toLowerCase().replace(/_/g, "").replace("bulletpoint", "bullet").replace("datapoint", "data");
                    if (ST2_TYPES.indexOf(st.type) === -1) st.type = "bullet";
                    return st;
                });
                renderSupertext2Results(result);
                showElement("st2-results");
                showToast(state.supertexts2.length + " supertextos detectados", "success");
            }, 500);
        });
    }

    var _st2TypeFilter = null;
    var ST2_TYPE_COLORS = { title: "var(--accent-bright)", bullet: "var(--success)", step: "var(--info)", definition: "var(--warning)", data: "var(--highlight)", summary: "var(--brand-start)", highlight: "#facc15" };

    function renderSupertext2Results(result) {
        var summary = document.getElementById("st2-summary");
        summary.innerHTML = esc(result.summary || state.supertexts2.length + " momentos clave identificados");

        var list = document.getElementById("st2-list");
        list.innerHTML = "";

        if (state.supertexts2.length > 0) {
            var typeCounts = {};
            state.supertexts2.forEach(function(st) {
                var t = st.type || "bullet";
                typeCounts[t] = (typeCounts[t] || 0) + 1;
            });
            var countsDiv = document.createElement("div");
            countsDiv.className = "es2-counts-bar st2-filter-bar";
            ST2_TYPES.forEach(function(t) {
                if (!typeCounts[t]) return;
                var col = ST2_TYPE_COLORS[t] || "var(--text-secondary)";
                var tag = document.createElement("span");
                tag.className = "st2-filter-tag" + (_st2TypeFilter === t ? " st2-filter-active" : "");
                tag.style.color = col;
                tag.style.cursor = "pointer";
                tag.textContent = typeCounts[t] + " " + t;
                (function(type) {
                    tag.addEventListener("click", function(e) {
                        e.stopPropagation();
                        _st2TypeFilter = (_st2TypeFilter === type) ? null : type;
                        renderSupertext2Results(result);
                    });
                })(t);
                countsDiv.appendChild(tag);
            });
            if (_st2TypeFilter) {
                var clearTag = document.createElement("span");
                clearTag.className = "st2-filter-tag st2-filter-clear";
                clearTag.textContent = "✕ Todos";
                clearTag.style.cursor = "pointer";
                clearTag.addEventListener("click", function(e) {
                    e.stopPropagation();
                    _st2TypeFilter = null;
                    renderSupertext2Results(result);
                });
                countsDiv.appendChild(clearTag);
            }
            list.appendChild(countsDiv);
        }

        var typeOptions = ST2_TYPES.map(function(t) { return '<option value="' + t + '">' + t + '</option>'; }).join("");

        var allItems = state.supertexts2.map(function(st, idx) { st._idx = idx; return st; });
        var filtered = _st2TypeFilter
            ? allItems.filter(function(st) { return (st.type || "bullet") === _st2TypeFilter; })
            : allItems;
        var sorted = filtered.slice().sort(function(a, b) { return a.time - b.time; });

        var byGroup = {};
        var ungrouped = [];
        sorted.forEach(function(st) {
            if (st.group !== undefined && st.group !== null) {
                if (!byGroup[st.group]) byGroup[st.group] = [];
                byGroup[st.group].push(st);
            } else {
                ungrouped.push(st);
            }
        });

        // Sort within each group: title first, then by time
        var renderGroups = [];
        Object.keys(byGroup).forEach(function(gk) {
            var items = byGroup[gk];
            items.sort(function(a, b) {
                if (a.type === "title" && b.type !== "title") return -1;
                if (a.type !== "title" && b.type === "title") return 1;
                return a.time - b.time;
            });
            if (items.length >= 2) {
                renderGroups.push({ type: "group", items: items, sortTime: items[0].time });
            } else {
                ungrouped.push(items[0]);
            }
        });

        ungrouped.forEach(function(st) {
            renderGroups.push({ type: "single", items: [st], sortTime: st.time });
        });

        renderGroups.sort(function(a, b) { return a.sortTime - b.sortTime; });

        function renderItem(st, isChild) {
            var idx = st._idx;
            var el = document.createElement("div");
            var isTitle = st.type === "title";
            var classes = "supertext-item" + (st.checked ? " st-checked" : " st-unchecked");
            if (isChild) classes += " st-group-child";
            if (isTitle && !isChild) classes += " st-group-title";
            el.className = classes;
            el.dataset.st2Idx = idx;

            var dur = (st.endTime || st.time + 5) - st.time;
            var curType = st.type || "bullet";
            var typeClass = "type-" + curType;

            el.innerHTML =
                '<label class="st-checkbox-wrap">' +
                    '<input type="checkbox" class="st2-check" data-idx="' + idx + '"' + (st.checked ? " checked" : "") + '>' +
                '</label>' +
                '<div class="st-time">' + formatTimeFull(st.time) + '</div>' +
                '<div class="st-content">' +
                    '<div class="st-text">' + esc(st.text) + '</div>' +
                    '<div class="st-meta-row">' +
                        '<span class="st-type-badge ' + typeClass + '" data-idx="' + idx + '">' + esc(curType) + '</span>' +
                        '<select class="st2-type-select" data-idx="' + idx + '">' + typeOptions + '</select>' +
                        '<span style="font-size:9px;color:var(--text-muted)">' + dur.toFixed(1) + 's</span>' +
                        '<button class="btn btn-xs btn-ghost st2-replace-btn hidden" data-idx="' + idx + '" title="Reemplazar clip en timeline">↻</button>' +
                    '</div>' +
                    (st.reason ? '<div style="font-size:9px;color:var(--text-muted);margin-top:2px">' + esc(st.reason) + '</div>' : '') +
                '</div>';

            var sel = el.querySelector(".st2-type-select");
            if (sel) sel.value = curType;
            return el;
        }

        renderGroups.forEach(function(rg) {
            if (rg.type === "single") {
                list.appendChild(renderItem(rg.items[0], false));
            } else {
                var groupEl = document.createElement("div");
                groupEl.className = "st-group-wrapper";
                var groupVal = rg.items[0].group;
                var ungroupBtn = document.createElement("button");
                ungroupBtn.className = "st-ungroup-btn";
                ungroupBtn.title = "Desagrupar";
                ungroupBtn.dataset.group = groupVal;
                ungroupBtn.textContent = "Desagrupar";
                groupEl.appendChild(ungroupBtn);
                rg.items.forEach(function(st, i) {
                    groupEl.appendChild(renderItem(st, i > 0));
                });
                list.appendChild(groupEl);
            }
        });

        list.addEventListener("click", function(e) {
            var ungroupBtn = e.target.closest(".st-ungroup-btn");
            if (ungroupBtn) {
                var gVal = ungroupBtn.dataset.group;
                state.supertexts2.forEach(function(st) {
                    if (String(st.group) === String(gVal)) { delete st.group; }
                });
                renderSupertext2Results({ summary: summary.innerHTML });
                return;
            }
            var chk = e.target.closest(".st2-check");
            if (chk) {
                var i = parseInt(chk.dataset.idx);
                state.supertexts2[i].checked = chk.checked;
                var row = chk.closest(".supertext-item");
                if (row) {
                    row.classList.toggle("st-checked", chk.checked);
                    row.classList.toggle("st-unchecked", !chk.checked);
                }
                updateSelectAll2Label();
                return;
            }
            var replBtn = e.target.closest(".st2-replace-btn");
            if (replBtn) {
                replaceSingleSupertext(parseInt(replBtn.dataset.idx));
                return;
            }
            var item = e.target.closest(".supertext-item");
            if (item && !e.target.closest(".st-checkbox-wrap") && !e.target.closest(".st2-type-select")) {
                var stIdx = parseInt(item.dataset.st2Idx);
                if (!isNaN(stIdx) && state.supertexts2[stIdx]) navigateToTime(state.supertexts2[stIdx].time);
            }
        });

        list.addEventListener("change", function(e) {
            var sel = e.target.closest(".st2-type-select");
            if (sel) {
                var idx = parseInt(sel.dataset.idx);
                state.supertexts2[idx].type = sel.value;
                var badge = list.querySelector('.st-type-badge[data-idx="' + idx + '"]');
                if (badge) {
                    badge.className = "st-type-badge type-" + sel.value;
                    badge.textContent = sel.value;
                }
            }
        });

        updateSelectAll2Label();
    }

    function toggleSelectAllSupertexts2() {
        var allChecked = state.supertexts2.every(function(st) { return st.checked; });
        var newVal = !allChecked;
        state.supertexts2.forEach(function(st) { st.checked = newVal; });
        document.querySelectorAll(".st2-check").forEach(function(chk) { chk.checked = newVal; });
        document.querySelectorAll("#st2-list .supertext-item").forEach(function(el) {
            el.classList.toggle("st-checked", newVal);
            el.classList.toggle("st-unchecked", !newVal);
        });
        updateSelectAll2Label();
    }

    function updateSelectAll2Label() {
        var btn = document.getElementById("btn-st2-select-all");
        if (!btn) return;
        var allChecked = state.supertexts2.every(function(st) { return st.checked; });
        var checkedCount = state.supertexts2.filter(function(st) { return st.checked; }).length;
        btn.textContent = allChecked ? "Deseleccionar todos" : "Seleccionar todos (" + checkedCount + "/" + state.supertexts2.length + ")";
    }

    function _st2Anticipate(timeSecs) {
        return Math.max(0, timeSecs - ST2_ANTICIPATION_SECS);
    }

    function _st2ReadingBuffer(text) {
        var words = (text || "").split(/\s+/).length;
        return Math.max(ST2_READING_BUFFER_SECS, words * ST2_SECS_PER_WORD);
    }

    function _st2EnsureMinDuration(start, end) {
        if (end - start < ST2_MIN_DURATION_SECS) return start + ST2_MIN_DURATION_SECS;
        return end;
    }

    /**
     * Decides whether grouped items should appear as a batch (all at once)
     * or stagger in one-by-one based on the time gaps between them.
     * Returns an array of objects: { items: [], batchTime: number|null }
     *   - batchTime != null  → all items enter at batchTime
     *   - batchTime == null  → items keep individual times (stagger)
     */
    function _st2SmartBatch(cascade) {
        if (cascade.length <= 1) return [{ items: cascade, batchTime: null }];

        var maxGap = 0;
        for (var b = 1; b < cascade.length; b++) {
            var gap = cascade[b].time - cascade[b - 1].time;
            if (gap > maxGap) maxGap = gap;
        }

        if (maxGap <= ST2_BATCH_THRESHOLD_SECS) {
            return [{ items: cascade, batchTime: cascade[0].time }];
        }
        return [{ items: cascade, batchTime: null }];
    }

    function buildST2Payload(selected) {
        var sorted = selected.slice().sort(function(a, b) { return a.time - b.time; });

        var items = [];
        var processed = {};
        var i = 0;
        while (i < sorted.length) {
            var st = sorted[i];

            if (processed[st._idx !== undefined ? st._idx : i]) { i++; continue; }

            // Grouped title: collect its bullets and cascade as one unit
            if (st.type === "title" && st.group !== undefined && st.group !== null) {
                var cascade = [st];
                for (var k = i + 1; k < sorted.length; k++) {
                    if (sorted[k].group === st.group && sorted[k].type !== "title") {
                        cascade.push(sorted[k]);
                        processed[sorted[k]._idx !== undefined ? sorted[k]._idx : k] = true;
                    }
                }

                var lastItem = cascade[cascade.length - 1];
                var rawCascadeEnd = lastItem.endTime || lastItem.time + 5;
                var allText = cascade.map(function(c) { return c.text; }).join(" ");
                var cascadeEnd = rawCascadeEnd + _st2ReadingBuffer(allText);
                var cascadeLen = cascade.length;
                var titleSpacing = ST2_BULLET_SPACING * 0.4;

                var batches = _st2SmartBatch(cascade);
                var batch = batches[0];

                for (var c = 0; c < cascadeLen; c++) {
                    var cst = cascade[c];
                    var cType = cst.type || "bullet";
                    var posY = -ST2_BULLET_SPACING * (cascadeLen - 1 - c);
                    if (c === 0) posY -= titleSpacing;

                    var entryTime = batch.batchTime !== null
                        ? _st2Anticipate(batch.batchTime)
                        : _st2Anticipate(cst.time);

                    items.push({
                        time: entryTime,
                        endTime: _st2EnsureMinDuration(entryTime, cascadeEnd),
                        text: cst.text,
                        type: cType,
                        mogrtPath: state.mogrtPaths[cType] || state.mogrtPaths.bullet || "",
                        bulletTrackOffset: c,
                        bulletPositionY: posY
                    });
                }
                i++;
                continue;
            }

            // Ungrouped bullets with same group: cascade together
            if (st.type === "bullet" && st.group !== undefined && st.group !== null) {
                var bGroup = [st];
                var j = i + 1;
                while (j < sorted.length && sorted[j].type === "bullet" &&
                       sorted[j].group !== undefined && sorted[j].group === st.group) {
                    bGroup.push(sorted[j]);
                    processed[sorted[j]._idx !== undefined ? sorted[j]._idx : j] = true;
                    j++;
                }

                var bLast = bGroup[bGroup.length - 1];
                var rawBGroupEnd = bLast.endTime || bLast.time + 5;
                var bAllText = bGroup.map(function(b) { return b.text; }).join(" ");
                var bGroupEnd = rawBGroupEnd + _st2ReadingBuffer(bAllText);
                var bGroupLen = bGroup.length;

                var bBatches = _st2SmartBatch(bGroup);
                var bBatch = bBatches[0];

                for (var g = 0; g < bGroupLen; g++) {
                    var bEntryTime = bBatch.batchTime !== null
                        ? _st2Anticipate(bBatch.batchTime)
                        : _st2Anticipate(bGroup[g].time);

                    items.push({
                        time: bEntryTime,
                        endTime: _st2EnsureMinDuration(bEntryTime, bGroupEnd),
                        text: bGroup[g].text,
                        type: "bullet",
                        mogrtPath: state.mogrtPaths.bullet || "",
                        bulletTrackOffset: g,
                        bulletPositionY: -ST2_BULLET_SPACING * (bGroupLen - 1 - g)
                    });
                }
                i = j;
                continue;
            }

            // Independent item
            var type = st.type || "title";
            var rawEnd = st.endTime || st.time + 5;
            var readBuf = _st2ReadingBuffer(st.text);
            var entryIndep = _st2Anticipate(st.time);
            var endIndep = _st2EnsureMinDuration(entryIndep, rawEnd + readBuf);

            items.push({
                time: entryIndep,
                endTime: endIndep,
                text: st.text,
                type: type,
                mogrtPath: state.mogrtPaths[type] || "",
                bulletTrackOffset: 0,
                bulletPositionY: 0
            });
            i++;
        }
        return items;
    }

    function createSupertext2Graphics() {
        var selected = state.supertexts2.filter(function(st) { return st.checked; });
        if (selected.length === 0) {
            showToast("Selecciona al menos un supertexto", "info");
            return;
        }

        var usedTypes = {};
        selected.forEach(function(st) { usedTypes[st.type || "title"] = true; });
        var missing = [];
        Object.keys(usedTypes).forEach(function(t) {
            if (!state.mogrtPaths[t]) missing.push(t);
        });
        if (missing.length > 0) {
            showToast("Falta MOGRT para: " + missing.join(", "), "error");
            return;
        }
        if (!fs || !os) { showToast("Error: Node.js no disponible", "error"); return; }

        var trackIdx = state.mogrtTrackIndex === "auto" ? -1 : parseInt(state.mogrtTrackIndex);

        var items = buildST2Payload(selected);

        var payload = { baseTrackIndex: trackIdx, supertexts: items };

        var tmpFile = path.join(os.tmpdir(), "EditorPro_ST2_MOGRTs.json");
        fs.writeFileSync(tmpFile, JSON.stringify(payload), "utf8");
        var safePath = tmpFile.replace(/\\/g, "/");

        disableBtn("btn-st2-create-graphics");
        showElement("st2-progress");
        setST2Progress(10, "Insertando " + items.length + " gráficos en la línea de tiempo...");

        csInterface.evalScript('insertSupertextMOGRTs("' + escExtend(safePath) + '")', function(res) {
            hideElement("st2-progress"); hideElement("st2-progress-header");
            hideElement("st2-progress-header");
            enableBtn("btn-st2-create-graphics");
            try {
                var data = JSON.parse(res);
                if (data.error) {
                    showToast(data.error, "error");
                    return;
                }
                state.supertexts2Inserted = true;
                document.querySelectorAll(".st2-replace-btn").forEach(function(btn) { btn.classList.remove("hidden"); });
                var msg = data.inserted + " de " + data.total + " gráficos insertados";
                if (data.textSet > 0) msg += " (" + data.textSet + " con texto)";
                var toastType = "success";
                if (data.errors && data.errors.length > 0) {
                    msg += "\n" + data.errors.length + " advertencias:";
                    for (var ei = 0; ei < Math.min(data.errors.length, 3); ei++) {
                        msg += "\n• " + data.errors[ei];
                    }
                    if (data.errors.length > 3) msg += "\n• ... +" + (data.errors.length - 3) + " más";
                    console.log("ST2 errors:", JSON.stringify(data.errors));
                    if (data.textSet === 0) toastType = "error";
                }
                showToast(msg, data.inserted > 0 ? toastType : "error");
                refreshSequenceInfo();
            } catch(e) {
                showToast("Error al crear gráficos: " + e.message, "error");
            }
        });
    }

    function replaceSingleSupertext(idx) {
        var st = state.supertexts2[idx];
        if (!st) return;
        var type = st.type || "title";
        var mogrtPath = state.mogrtPaths[type];
        if (!mogrtPath) {
            showToast("Falta MOGRT para tipo: " + type, "error");
            return;
        }
        if (!fs || !os) { showToast("Error: Node.js no disponible", "error"); return; }

        var trackIdx = state.mogrtTrackIndex === "auto" ? -1 : parseInt(state.mogrtTrackIndex);
        var payload = {
            time: st.time,
            endTime: st.endTime || st.time + 5,
            text: st.text,
            type: type,
            mogrtPath: mogrtPath,
            trackIndex: trackIdx
        };

        var tmpFile = path.join(os.tmpdir(), "EditorPro_ST2_Replace.json");
        fs.writeFileSync(tmpFile, JSON.stringify(payload), "utf8");
        var safePath = tmpFile.replace(/\\/g, "/");

        csInterface.evalScript('replaceMOGRTClip("' + escExtend(safePath) + '")', function(res) {
            try {
                var data = JSON.parse(res);
                if (data.error) { showToast(data.error, "error"); return; }
                showToast("Clip reemplazado: " + st.text.substring(0, 30), "success");
            } catch(e) {
                showToast("Error al reemplazar", "error");
            }
        });
    }

    function exportSupertexts2() {
        if (state.supertexts2.length === 0) { showToast("Nada que exportar", "info"); return; }
        var lines = state.supertexts2.map(function(st) {
            return formatTimeFull(st.time) + " | " + st.type + " | " + st.text;
        });
        copyToClipboard(lines.join("\n"));
    }

    function getEditColor(type) {
        var colors = { redundancy: 6, cut: 0, highlight: 4, transition: 2, rhythm: 3, clarity: 5 };
        return colors[type] !== undefined ? colors[type] : 6;
    }

    // ═══════════════════════════════════════════════════════════════
    // EDIT SUGGESTIONS 2 — Three categories with independent markers
    // ═══════════════════════════════════════════════════════════════

    function startEditSuggestions2() {
        if (state.analyzing) return;
        if (!state.transcript || state.transcript.trim().length === 0) {
            showToast("Carga una transcripción primero", "error");
            return;
        }
        if (!checkAIReady()) return;

        state.analyzing = true;
        expandSection("editsuggestions2");

        hideElement("es2-results");
        hideElement("es2-empty");
        showElement("es2-progress");
        setES2Progress(20, "Analizando contenido...");
        disableBtn("btn-editsuggestions2");

        var timedTranscript = buildTimedTranscript();

        aiAnalyzer.analyzeEditSuggestions2(timedTranscript, getPromptContext("es2"), function(result) {
            setES2Progress(100, "Completado");

            setTimeout(function() {
                hideElement("es2-progress");
                hideElement("es2-progress-header");
                state.analyzing = false;
                enableBtn("btn-editsuggestions2");

                if (result.error) {
                    showToast("Error: " + result.error, "error");
                    showElement("es2-empty");
                    return;
                }

                state.es2Highlights = result.highlights || [];
                state.es2Suggestions = result.suggestions || [];
                state.es2Errors = postProcessES2Errors(result.errors || []);
                renderES2Results(result);
                showElement("es2-results");

                var total = state.es2Highlights.length + state.es2Suggestions.length + state.es2Errors.length;
                showToast(total + " observaciones encontradas", "success");
            }, 500);
        });
    }

    function postProcessES2Errors(errors) {
        var processed = errors.map(function(err) {
            if (!err.occurrences || err.occurrences.length < 2) return err;

            var sorted = err.occurrences.slice().sort(function(a, b) { return a.time - b.time; });
            var merged = [sorted[0]];
            for (var i = 1; i < sorted.length; i++) {
                var prev = merged[merged.length - 1];
                var curr = sorted[i];
                if (curr.time - prev.endTime < 3) {
                    prev.endTime = Math.max(prev.endTime, curr.endTime);
                    prev.text = prev.text + " → " + curr.text;
                } else {
                    merged.push(curr);
                }
            }
            err.occurrences = merged;
            if (err.keepIndex === undefined || err.keepIndex >= merged.length) {
                err.keepIndex = merged.length - 1;
            }
            err._applied = false;
            return err;
        });

        return mergeRelatedES2Errors(processed);
    }

    function mergeRelatedES2Errors(errors) {
        var BLOCK_GAP = 90;
        var used = {};
        var result = [];

        for (var i = 0; i < errors.length; i++) {
            if (used[i]) continue;
            var base = errors[i];
            if (base.type !== "repeated_content" || !base.occurrences || base.occurrences.length < 2) {
                result.push(base);
                used[i] = true;
                continue;
            }

            var group = [i];
            for (var j = i + 1; j < errors.length; j++) {
                if (used[j]) continue;
                var cand = errors[j];
                if (cand.type !== "repeated_content" || !cand.occurrences) continue;
                if (cand.occurrences.length !== base.occurrences.length) continue;

                var close = true;
                for (var k = 0; k < base.occurrences.length; k++) {
                    var aEnd = base.occurrences[k].endTime || base.occurrences[k].time + 5;
                    var bEnd = cand.occurrences[k].endTime || cand.occurrences[k].time + 5;
                    var gap = Math.max(0, Math.max(base.occurrences[k].time, cand.occurrences[k].time) - Math.min(aEnd, bEnd));
                    if (gap > BLOCK_GAP) {
                        close = false;
                        break;
                    }
                }

                if (close) {
                    group.push(j);
                    used[j] = true;
                }
            }
            used[i] = true;

            if (group.length === 1) {
                result.push(base);
                continue;
            }

            var titles = [];
            for (var g = 0; g < group.length; g++) titles.push(errors[group[g]].title);
            var mergedOccs = [];
            for (var k = 0; k < base.occurrences.length; k++) {
                var minT = Infinity, maxE = -Infinity, texts = [];
                for (var g = 0; g < group.length; g++) {
                    var occ = errors[group[g]].occurrences[k];
                    if (occ.time < minT) minT = occ.time;
                    var end = occ.endTime || occ.time + 5;
                    if (end > maxE) maxE = end;
                    if (occ.text) texts.push(occ.text);
                }
                mergedOccs.push({ time: minT, endTime: maxE, text: texts.join("; ") });
            }

            result.push({
                type: "repeated_content",
                title: titles.join(" + "),
                description: base.description + " (bloque completo repetido)",
                occurrences: mergedOccs,
                keepIndex: base.keepIndex,
                _applied: false
            });
        }

        return result;
    }

    function renderES2Results(result) {
        var summary = document.getElementById("es2-summary");
        var scoreHtml = "";
        if (result.overallScore !== undefined) {
            var s = result.overallScore;
            var col = s >= 80 ? "var(--success)" : s >= 50 ? "var(--warning)" : "var(--error)";
            scoreHtml = '<span style="color:' + col + ';font-weight:700">' + s + '/100</span> — ';
        }
        summary.innerHTML = scoreHtml + esc(result.summary || "Análisis completado");

        var list = document.getElementById("es2-list");
        list.innerHTML = "";

        var nErr = state.es2Errors.length;
        var nSug = state.es2Suggestions.length;
        var nHl = state.es2Highlights.length;
        if (nErr + nSug + nHl > 0) {
            var countsDiv = document.createElement("div");
            countsDiv.className = "es2-counts-bar";
            var parts = [];
            if (nErr > 0) parts.push('<span style="color:var(--error)">🚨 ' + nErr + ' error' + (nErr > 1 ? 'es' : '') + '</span>');
            if (nSug > 0) parts.push('<span style="color:var(--warning)">✂️ ' + nSug + ' sugerencia' + (nSug > 1 ? 's' : '') + '</span>');
            if (nHl > 0) parts.push('<span style="color:var(--highlight)">⭐ ' + nHl + ' highlight' + (nHl > 1 ? 's' : '') + '</span>');
            countsDiv.innerHTML = parts.join(' &nbsp;·&nbsp; ');
            list.appendChild(countsDiv);
        }

        if (nErr > 0) {
            renderES2Category(list, {
                label: "🚨 Errores de Edición",
                color: "var(--error)",
                items: state.es2Errors,
                markerFn: placeES2ErrorMarkers,
                renderItem: renderES2ErrorItem
            });
        }

        if (nSug > 0) {
            renderES2Category(list, {
                label: "✂️ Sugerencias de Edición",
                color: "var(--warning)",
                items: state.es2Suggestions,
                markerFn: placeES2SuggestionMarkers,
                renderItem: renderES2SuggestionItem
            });
        }

        if (nHl > 0) {
            renderES2Category(list, {
                label: "⭐ Highlights de la Clase",
                color: "var(--highlight)",
                items: state.es2Highlights,
                markerFn: placeES2HighlightMarkers,
                renderItem: renderES2HighlightItem
            });
        }

        if (nErr === 0 && nSug === 0 && nHl === 0) {
            list.innerHTML = '<div class="empty-state-mini"><p class="empty-text">Sin observaciones</p></div>';
        }
    }

    function renderES2Category(container, opts) {
        var header = document.createElement("div");
        header.className = "es2-category-header";
        header.innerHTML =
            '<span class="es2-category-label" style="color:' + opts.color + '">' + opts.label + ' (' + opts.items.length + ')</span>' +
            '<div class="es2-category-actions">' +
                '<button class="btn btn-sm btn-success es2-cat-markers" title="Colocar marcadores de esta categoría">📍 Marcadores</button>' +
            '</div>';
        header.querySelector(".es2-cat-markers").addEventListener("click", function(e) {
            e.stopPropagation();
            opts.markerFn();
        });
        container.appendChild(header);

        opts.items.forEach(function(item, idx) {
            var el = opts.renderItem(item, idx);
            container.appendChild(el);
        });
    }

    function renderES2HighlightItem(hl) {
        var el = document.createElement("div");
        el.className = "suggestion-item";
        var dur = ((hl.endTime || hl.time + 5) - hl.time).toFixed(1);
        el.innerHTML =
            '<div class="sg-time">' + formatTimeFull(hl.time) + '<br><span style="font-size:8px;color:var(--text-muted)">' + dur + 's</span></div>' +
            '<div class="sg-content">' +
                '<div class="sg-title">' + esc(hl.title) + '</div>' +
                '<div class="sg-description">' + esc(hl.description || "") + '</div>' +
                '<span class="sg-type-badge type-highlight">highlight</span>' +
            '</div>';
        el.addEventListener("click", function() { navigateToTime(hl.time); });
        return el;
    }

    function renderES2SuggestionItem(sg) {
        var el = document.createElement("div");
        el.className = "suggestion-item";
        var typeClass = "type-" + (sg.type || "cut");
        var dur = ((sg.endTime || sg.time + 5) - sg.time).toFixed(1);
        el.innerHTML =
            '<div class="sg-time">' + formatTimeFull(sg.time) + '<br><span style="font-size:8px;color:var(--text-muted)">' + dur + 's</span></div>' +
            '<div class="sg-content">' +
                '<div class="sg-title">' + esc(sg.title) + '</div>' +
                '<div class="sg-description">' + esc(sg.description || "") + '</div>' +
                (sg.action ? '<div class="sg-action">' + esc(sg.action) + '</div>' : '') +
                '<span class="sg-type-badge ' + typeClass + '">' + esc(sg.type || "edit") + '</span>' +
            '</div>';
        el.addEventListener("click", function() { navigateToTime(sg.time); });
        return el;
    }

    function renderES2ErrorItem(err, errIdx) {
        var el = document.createElement("div");
        el.className = "error-item" + (err._applied ? " error-applied" : "");
        el.setAttribute("data-error-idx", errIdx);

        var headerDiv = document.createElement("div");
        headerDiv.className = "error-item-header";
        var firstTime = err.occurrences && err.occurrences.length > 0 ? err.occurrences[0].time : 0;
        headerDiv.innerHTML =
            '<div class="sg-time">' + formatTimeFull(firstTime) + '</div>' +
            '<div class="sg-content">' +
                '<div class="sg-title">' + esc(err.title) + '<span class="error-applied-badge">✓ Aplicado</span></div>' +
                '<div class="sg-description">' + esc(err.description || "") + '</div>' +
                '<span class="sg-type-badge type-' + esc(err.type || "error") + '">' + esc(err.type || "error") + '</span>' +
            '</div>';
        headerDiv.addEventListener("click", function() { navigateToTime(firstTime); });
        el.appendChild(headerDiv);

        if (err.occurrences && err.occurrences.length > 0) {
            var occsDiv = document.createElement("div");
            occsDiv.className = "error-occurrences";
            err.occurrences.forEach(function(occ, occIdx) {
                var isKeep = occIdx === err.keepIndex;
                var occEl = document.createElement("div");
                occEl.className = "error-occurrence";
                occEl.innerHTML =
                    '<span class="error-occurrence-tag ' + (isKeep ? 'tag-keep' : 'tag-remove') + '">' + (isKeep ? 'conservar' : 'eliminar') + '</span>' +
                    '<span class="error-occurrence-time">' + formatTimeFull(occ.time) + ' - ' + formatTimeFull(occ.endTime || occ.time + 5) + '</span>' +
                    '<span class="error-occurrence-text">' + esc(occ.text || "") + '</span>';
                occEl.style.cursor = "pointer";
                (function(t) {
                    occEl.addEventListener("click", function(e) {
                        e.stopPropagation();
                        navigateToTime(t);
                    });
                })(occ.time);
                occsDiv.appendChild(occEl);
            });
            el.appendChild(occsDiv);
        }

        var actionsDiv = document.createElement("div");
        actionsDiv.className = "error-item-actions";
        var markBtn = document.createElement("button");
        markBtn.className = "btn btn-sm btn-success";
        markBtn.textContent = "📍 Marcadores";
        markBtn.title = "Coloca 2 marcadores: uno donde se dijo primero y otro donde se repite";
        markBtn.addEventListener("click", function(e) {
            e.stopPropagation();
            placeES2SingleErrorMarkers(errIdx);
        });
        actionsDiv.appendChild(markBtn);

        el.appendChild(actionsDiv);
        return el;
    }

    // ─── ES2 Marker Placement ────────────────────────────────────

    function placeES2HighlightMarkers() {
        var markers = [];
        state.es2Highlights.forEach(function(hl) {
            markers.push({
                time: hl.time,
                endTime: hl.endTime || hl.time + 5,
                name: "[HL2] " + hl.title,
                comment: "HIGHLIGHT: " + (hl.description || ""),
                color: 4
            });
        });
        placeES2MarkerBatch(markers, "[HL2]", "highlights");
    }

    function placeES2SuggestionMarkers() {
        var markers = [];
        state.es2Suggestions.forEach(function(sg) {
            markers.push({
                time: sg.time,
                endTime: sg.endTime || sg.time + 5,
                name: "[ED2] " + sg.title,
                comment: sg.type.toUpperCase() + ": " + (sg.description || "") + (sg.action ? " | " + sg.action : ""),
                color: getEditColor(sg.type)
            });
        });
        placeES2MarkerBatch(markers, "[ED2]", "sugerencias");
    }

    function placeES2ErrorMarkers() {
        var markers = [];
        state.es2Errors.forEach(function(err, errIdx) {
            if (!err.occurrences || err.occurrences.length < 2) return;
            err.occurrences.forEach(function(occ, occIdx) {
                var isKeep = occIdx === err.keepIndex;
                markers.push({
                    time: occ.time,
                    endTime: occ.endTime || occ.time + 5,
                    name: "[ER" + (errIdx + 1) + "] " + (isKeep ? "✓ CONSERVAR" : "✗ ELIMINAR") + " — " + err.title,
                    comment: err.type.toUpperCase() + ": " + (occ.text || err.description || ""),
                    color: isKeep ? 5 : 1
                });
            });
        });
        placeES2MarkerBatch(markers, "[ER", "errores");
    }

    function placeES2SingleErrorMarkers(errIdx) {
        var err = state.es2Errors[errIdx];
        if (!err || !err.occurrences || err.occurrences.length < 2) {
            showToast("Este error no tiene suficientes ocurrencias", "info");
            return;
        }
        var markers = [];
        err.occurrences.forEach(function(occ, occIdx) {
            var isKeep = occIdx === err.keepIndex;
            markers.push({
                time: occ.time,
                endTime: occ.endTime || occ.time + 5,
                name: "[ER" + (errIdx + 1) + "] " + (isKeep ? "✓ CONSERVAR" : "✗ ELIMINAR") + " — " + err.title,
                comment: err.type.toUpperCase() + ": " + (occ.text || err.description || ""),
                color: isKeep ? 5 : 1
            });
        });

        if (markers.length === 0) return;
        if (!fs || !os) {
            showToast("Error: Node.js no disponible", "error");
            return;
        }
        var tmpFile = path.join(os.tmpdir(), "pe_es2_err_markers.json");
        fs.writeFileSync(tmpFile, JSON.stringify(markers), "utf8");
        var safePath = tmpFile.replace(/\\/g, "/");
        csInterface.evalScript('addMarkersFromFile("' + safePath + '")', function(result) {
            try {
                var data = JSON.parse(result);
                if (data.error) { showToast("Error: " + data.error, "error"); return; }
                showToast(data.placed + " marcadores colocados", "success");
            } catch(e) {
                showToast("Error al colocar marcadores", "error");
            }
        });
    }

    function placeES2MarkerBatch(markers, prefix, label) {
        if (markers.length === 0) {
            showToast("No hay " + label + " para marcar", "info");
            return;
        }
        if (!fs || !os) {
            showToast("Error: Node.js no disponible", "error");
            return;
        }
        var tmpFile = path.join(os.tmpdir(), "pe_es2_markers.json");
        fs.writeFileSync(tmpFile, JSON.stringify(markers), "utf8");
        var safePath = tmpFile.replace(/\\/g, "/");

        csInterface.evalScript('clearMarkersByPrefix("' + prefix + '")', function() {
            csInterface.evalScript('addMarkersFromFile("' + safePath + '")', function(result) {
                try {
                    var data = JSON.parse(result);
                    if (data.error) { showToast("Error: " + data.error, "error"); return; }
                    showToast(data.placed + " marcadores de " + label + " colocados", "success");
                    refreshSequenceInfo();
                } catch(e) {
                    showToast("Error al colocar marcadores", "error");
                }
            });
        });
    }

    // ─── ES2 Progress & Export ───────────────────────────────────

    function setES2Progress(pct, text) {
        setProgress("es2-progress-fill", "es2-progress-text", pct, text);
        setProgress("es2-progress-header-fill", "es2-progress-header-text", pct, text);
        refreshES2HeaderProgressVisibility();
    }

    function refreshES2HeaderProgressVisibility() {
        var mainBar = document.getElementById("es2-progress");
        var isActive = mainBar && !mainBar.classList.contains("hidden");
        if (!isActive) {
            hideElement("es2-progress-header");
            return;
        }
        var es2Body = document.querySelector('[data-tool="editsuggestions2"]');
        if (!es2Body) return;
        es2Body = es2Body.nextElementSibling;
        var collapsed = es2Body && es2Body.classList.contains("hidden");
        var header = document.getElementById("es2-progress-header");
        if (header) header.classList.toggle("hidden", !collapsed);
    }

    function exportEditSuggestions2() {
        var lines = [];
        if (state.es2Highlights.length > 0) {
            lines.push("=== HIGHLIGHTS ===");
            state.es2Highlights.forEach(function(hl) {
                lines.push(formatTimeFull(hl.time) + " | HIGHLIGHT | " + hl.title);
            });
        }
        if (state.es2Suggestions.length > 0) {
            lines.push("=== SUGERENCIAS ===");
            state.es2Suggestions.forEach(function(sg) {
                lines.push(formatTimeFull(sg.time) + " | " + sg.type.toUpperCase() + " | " + sg.title);
            });
        }
        if (state.es2Errors.length > 0) {
            lines.push("=== ERRORES ===");
            state.es2Errors.forEach(function(err) {
                lines.push(err.type.toUpperCase() + " | " + err.title);
                if (err.occurrences) {
                    err.occurrences.forEach(function(occ, i) {
                        var tag = i === err.keepIndex ? "[CONSERVAR]" : "[ELIMINAR]";
                        lines.push("  " + tag + " " + formatTimeFull(occ.time) + " - " + formatTimeFull(occ.endTime || occ.time + 5) + " | " + (occ.text || ""));
                    });
                }
            });
        }
        if (lines.length === 0) { showToast("Nada que exportar", "info"); return; }
        copyToClipboard(lines.join("\n"));
        showToast("Sugerencias copiadas", "success");
    }

    // ═══════════════════════════════════════════════════════════════
    // REEL PROPOSAL — Analyze transcript for high-retention reels
    // ═══════════════════════════════════════════════════════════════

    function startReelProposal() {
        if (state.analyzing) return;
        if (!state.transcript || state.transcript.trim().length === 0) {
            showToast("Carga una transcripción primero", "error");
            return;
        }
        if (!checkAIReady()) return;

        state.analyzing = true;
        expandSection("reelproposal");

        hideElement("rp-results");
        hideElement("rp-empty");
        showElement("rp-progress");
        setRPProgress(20, "Analizando contenido para reels...");
        disableBtn("btn-reelproposal");

        var timedTranscript = buildTimedTranscript();

        aiAnalyzer.analyzeReelProposal(timedTranscript, getPromptContext("rp"), function(result) {
            setRPProgress(100, "Completado");

            setTimeout(function() {
                hideElement("rp-progress");
                hideElement("rp-progress-header");
                state.analyzing = false;
                enableBtn("btn-reelproposal");

                if (result.error) {
                    showToast("Error: " + result.error, "error");
                    showElement("rp-empty");
                    return;
                }

                state.reelProposals = result.reels || [];
                renderReelResults(result);
                showElement("rp-results");

                var count = state.reelProposals.length;
                showToast(count > 0 ? count + " propuesta(s) de reel" : "Sin reels viables", count > 0 ? "success" : "info");
            }, 500);
        });
    }

    function renderReelResults(result) {
        var assessment = document.getElementById("rp-assessment");
        assessment.innerHTML = esc(result.assessment || "Análisis completado");

        var list = document.getElementById("rp-list");
        list.innerHTML = "";

        if (result.notSuitable && result.notSuitable.length > 0) {
            var nsDiv = document.createElement("div");
            nsDiv.className = "reel-not-suitable";
            nsDiv.innerHTML = "<strong>⚠ Contenido no apto para reels de alta retención</strong>" +
                result.notSuitable.map(function(reason) { return "• " + esc(reason); }).join("<br>");
            list.appendChild(nsDiv);
        }

        if (state.reelProposals.length === 0 && (!result.notSuitable || result.notSuitable.length === 0)) {
            list.innerHTML = '<div class="empty-state-mini"><p class="empty-text">No se encontraron propuestas de reel viables</p></div>';
            return;
        }

        state.reelProposals.forEach(function(reel, idx) {
            var card = renderReelCard(reel, idx);
            list.appendChild(card);
        });
    }

    function renderReelCard(reel, idx) {
        var card = document.createElement("div");
        card.className = "reel-card";

        var header = document.createElement("div");
        header.className = "reel-card-header";
        var estDur = reel.estimatedDuration ? reel.estimatedDuration + "s" : "—";
        var platform = reel.platform || "all";
        header.innerHTML =
            '<div class="reel-card-num">' + (idx + 1) + '</div>' +
            '<div class="reel-card-info">' +
                '<div class="reel-card-title">' + esc(reel.title) + '</div>' +
                '<div class="reel-card-desc">' + esc(reel.description || "") + '</div>' +
                '<div class="reel-card-meta">' +
                    '<span class="reel-meta-tag reel-meta-duration">⏱ ' + estDur + '</span>' +
                    '<span class="reel-meta-tag reel-meta-platform">📱 ' + esc(platform) + '</span>' +
                '</div>' +
            '</div>';

        if (reel.segments && reel.segments.length > 0) {
            header.style.cursor = "pointer";
            header.addEventListener("click", function() { navigateToTime(reel.segments[0].time); });
        }
        card.appendChild(header);

        var body = document.createElement("div");
        body.className = "reel-card-body";

        if (reel.hookDescription) {
            var hookDiv = document.createElement("div");
            hookDiv.className = "reel-hook";
            hookDiv.textContent = "🎣 Hook: " + reel.hookDescription;
            body.appendChild(hookDiv);
        }

        if (reel.segments && reel.segments.length > 0) {
            var segsDiv = document.createElement("div");
            segsDiv.className = "reel-segments";
            reel.segments.forEach(function(seg) {
                var segEl = document.createElement("div");
                segEl.className = "reel-segment";
                segEl.innerHTML =
                    '<span class="reel-segment-time">' + formatTimeFull(seg.time) + ' - ' + formatTimeFull(seg.endTime || seg.time + 5) + '</span>' +
                    '<span class="reel-segment-purpose">' + esc(seg.purpose || "") + '</span>' +
                    '<span class="reel-segment-text">' + esc(seg.text || "") + '</span>';
                segEl.style.cursor = "pointer";
                (function(t) {
                    segEl.addEventListener("click", function(e) {
                        e.stopPropagation();
                        navigateToTime(t);
                    });
                })(seg.time);
                segsDiv.appendChild(segEl);
            });
            body.appendChild(segsDiv);
        }

        if (reel.retentionStrategy) {
            var retDiv = document.createElement("div");
            retDiv.className = "reel-retention";
            retDiv.textContent = "📊 Retención: " + reel.retentionStrategy;
            body.appendChild(retDiv);
        }

        var actionsDiv = document.createElement("div");
        actionsDiv.className = "reel-card-actions";

        var genBtn = document.createElement("button");
        genBtn.className = "btn btn-sm btn-success";
        genBtn.textContent = "🎬 Generar Contenido";
        genBtn.title = "Crea una nueva secuencia con los segmentos de este reel";
        (function(reelIdx) {
            genBtn.addEventListener("click", function(e) {
                e.stopPropagation();
                generateReelSequence(reelIdx);
            });
        })(idx);
        actionsDiv.appendChild(genBtn);

        body.appendChild(actionsDiv);
        card.appendChild(body);
        return card;
    }

    function generateReelSequence(reelIdx) {
        var reel = state.reelProposals[reelIdx];
        if (!reel || !reel.segments || reel.segments.length === 0) {
            showToast("Este reel no tiene segmentos", "info");
            return;
        }
        if (!fs || !os || !path) {
            showToast("Error: Node.js no disponible", "error");
            return;
        }

        var reelName = (state.sequenceName || "Secuencia") + "_Reel";
        if (state.reelProposals.length > 1) {
            reelName += "_" + (reelIdx + 1);
        }

        var keepZones = reel.segments.map(function(seg) {
            return { start: seg.time, end: seg.endTime || seg.time + 5 };
        });

        var payload = JSON.stringify({
            reelName: reelName,
            keepZones: keepZones
        });

        var tmpFile = path.join(os.tmpdir(), "EditorPro_reel_" + reelIdx + ".json");
        try {
            fs.writeFileSync(tmpFile, payload, "utf8");
        } catch(e) {
            showToast("Error al escribir archivo temporal: " + e.message, "error");
            return;
        }

        disableBtn("btn-reelproposal");
        showToast("Generando secuencia de reel...", "info");

        var escaped = escExtend(tmpFile);
        csInterface.evalScript('createReelSequence("' + escaped + '")', function(result) {
            enableBtn("btn-reelproposal");
            try {
                var data = JSON.parse(result);
                if (data.error) {
                    showToast("Error: " + data.error, "error");
                    return;
                }
                var msg = "Reel creado: " + (data.reelName || reelName);
                if (data.frameChanged) msg += " (9:16)";
                showToast(msg, "success");
                refreshSequenceInfo();
            } catch(e) {
                showToast("Error al crear secuencia de reel", "error");
            }
        });
    }

    function setRPProgress(pct, text) {
        setProgress("rp-progress-fill", "rp-progress-text", pct, text);
        setProgress("rp-progress-header-fill", "rp-progress-header-text", pct, text);
        refreshRPHeaderProgressVisibility();
    }

    function refreshRPHeaderProgressVisibility() {
        var mainBar = document.getElementById("rp-progress");
        var isActive = mainBar && !mainBar.classList.contains("hidden");
        if (!isActive) {
            hideElement("rp-progress-header");
            return;
        }
        var rpBody = document.querySelector('[data-tool="reelproposal"]');
        if (!rpBody) return;
        rpBody = rpBody.nextElementSibling;
        var collapsed = rpBody && rpBody.classList.contains("hidden");
        var header = document.getElementById("rp-progress-header");
        if (header) header.classList.toggle("hidden", !collapsed);
    }

    function exportReelProposals() {
        if (state.reelProposals.length === 0) { showToast("Nada que exportar", "info"); return; }
        var lines = [];
        state.reelProposals.forEach(function(reel, idx) {
            lines.push("=== REEL " + (idx + 1) + ": " + reel.title + " ===");
            lines.push("Duración: ~" + (reel.estimatedDuration || "?") + "s | Plataforma: " + (reel.platform || "all"));
            lines.push("Hook: " + (reel.hookDescription || "—"));
            if (reel.segments) {
                reel.segments.forEach(function(seg) {
                    lines.push("  " + formatTimeFull(seg.time) + " - " + formatTimeFull(seg.endTime || seg.time + 5) + " | " + (seg.purpose || "") + " | " + (seg.text || ""));
                });
            }
            lines.push("");
        });
        copyToClipboard(lines.join("\n"));
        showToast("Propuestas de reel copiadas", "success");
    }

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

                var found = findTranscriptFiles(info.projectPath, info.mediaPaths, info.sequenceName);
                if (found) {
                    var fileSrt = sttResultToSRT(found.result);
                    loadTranscriptText(fileSrt, path.basename(found.file));
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
            var window = xml.substring(searchStart, searchEnd);
            var jsonMatch = window.match(/\{[^{}]*"segmentList"\s*:\s*\[[\s\S]*?\]\s*\}/);
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
                    var window = xml.substring(Math.max(0, tIdx - 500), Math.min(xml.length, tIdx + 5000));
                    var b64Match = window.match(/[A-Za-z0-9+\/=]{100,}/g);
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

    // ─── Provider UI ─────────────────────────────────────────────

    function refreshProviderUI() {
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
        var prov = state.settings.aiProvider;
        if (prov === "ollama") return;
        var input = document.getElementById("api-key-input");
        var key = input ? input.value.trim() : "";
        aiAnalyzer.setApiKey(prov, key);
        localStorage.setItem("pr_key_" + prov, key);
        refreshProviderUI();
        updateAIStatus();
        showToast(key ? "API Key guardada" : "API Key eliminada", "success");
    }

    function updateAIStatus() {
        var el = document.getElementById("ai-status");
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
                refreshSTTProviderUI();
                refreshProviderUI();
            }
        }
    }

    function checkAIReady() {
        var isOllama = state.settings.aiProvider === "ollama";
        if (isOllama && !state.ollamaConnected) {
            showToast("Ollama no conectado. Ejecuta 'ollama serve'", "error");
            toggleSettings();
            return false;
        }
        if (!isOllama && !aiAnalyzer.isConfigured()) {
            showToast("Configura tu API Key primero", "error");
            toggleSettings();
            return false;
        }
        return true;
    }

    // ─── UI Helpers ──────────────────────────────────────────────

    function setProgress(fillId, textId, pct, text) {
        var fill = document.getElementById(fillId);
        var label = document.getElementById(textId);
        if (fill) fill.style.width = Math.min(pct, 100) + "%";
        if (label && text != null) label.textContent = text;
    }

    function setSttProgress(pct, text) {
        setProgress("stt-progress-fill", "stt-progress-text", pct, text);
        setProgress("stt-progress-fill-transcript", "stt-progress-text-transcript", pct, text);
        var fillT = document.getElementById("stt-progress-header-fill-transcript");
        var textT = document.getElementById("stt-progress-header-text-transcript");
        var fillR = document.getElementById("stt-progress-header-fill-recording");
        var textR = document.getElementById("stt-progress-header-text-recording");
        if (fillT) fillT.style.width = Math.min(pct, 100) + "%";
        if (textT && text != null) textT.textContent = text;
        if (fillR) fillR.style.width = Math.min(pct, 100) + "%";
        if (textR && text != null) textR.textContent = text;
        refreshSttHeaderProgressVisibility();
    }

    function refreshSttHeaderProgressVisibility() {
        if (!state.transcribing) {
            hideElement("stt-progress-header-transcript");
            hideElement("stt-progress-header-recording");
            return;
        }
        var transcriptBody = document.getElementById("transcript-body");
        var recordingBody = document.getElementById("recording-body");
        var transcriptCollapsed = transcriptBody && transcriptBody.classList.contains("hidden");
        var recordingCollapsed = recordingBody && recordingBody.classList.contains("hidden");
        var headerT = document.getElementById("stt-progress-header-transcript");
        var headerR = document.getElementById("stt-progress-header-recording");
        if (headerT) headerT.classList.toggle("hidden", !transcriptCollapsed);
        if (headerR) headerR.classList.toggle("hidden", !recordingCollapsed);
    }


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
    function escAttr(str) {
        if (!str) return "";
        return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function escExtend(str) {
        if (!str) return "";
        return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
    }

    function refreshAllHeaderProgress() {
        refreshSttHeaderProgressVisibility();
        refreshST2HeaderProgressVisibility();
        refreshES2HeaderProgressVisibility();
        refreshRPHeaderProgressVisibility();
        refreshMPHeaderProgressVisibility();
    }

    function setST2Progress(pct, text) {
        setProgress("st2-progress-fill", "st2-progress-text", pct, text);
        setProgress("st2-progress-header-fill", "st2-progress-header-text", pct, text);
        refreshST2HeaderProgressVisibility();
    }

    function refreshST2HeaderProgressVisibility() {
        var mainBar = document.getElementById("st2-progress");
        var isActive = mainBar && !mainBar.classList.contains("hidden");
        if (!isActive) {
            hideElement("st2-progress-header");
            return;
        }
        var st2Body = document.querySelector('[data-tool="supertexts2"]');
        if (!st2Body) return;
        st2Body = st2Body.nextElementSibling;
        var collapsed = st2Body && st2Body.classList.contains("hidden");
        var header = document.getElementById("st2-progress-header");
        if (header) header.classList.toggle("hidden", !collapsed);
    }

    function bindCollapsibles() {
        var allHeaders = document.querySelectorAll(".tool-card-header");
        allHeaders.forEach(function(hdr) {
            hdr.addEventListener("click", function() {
                var body = hdr.nextElementSibling;
                var icon = hdr.querySelector(".toggle-icon");
                if (!body) return;
                var wasHidden = body.classList.contains("hidden");

                if (wasHidden) {
                    allHeaders.forEach(function(otherHdr) {
                        var otherBody = otherHdr.nextElementSibling;
                        var otherIcon = otherHdr.querySelector(".toggle-icon");
                        if (otherBody && otherHdr !== hdr && !otherBody.classList.contains("hidden")) {
                            otherBody.classList.add("hidden");
                            if (otherIcon) otherIcon.textContent = "▸";
                        }
                    });
                    body.classList.remove("hidden");
                    if (icon) icon.textContent = "▾";
                } else {
                    body.classList.add("hidden");
                    if (icon) icon.textContent = "▸";
                }

                refreshAllHeaderProgress();
            });
        });

        document.querySelectorAll(".rec-step-header").forEach(function(hdr) {
            hdr.addEventListener("click", function() {
                var stepNum = hdr.getAttribute("data-rec-step");
                toggleRecStep(stepNum);
            });
        });
    }

    function toggleRecStep(stepNum) {
        var body = document.getElementById("rec-step-body-" + stepNum);
        if (!body) return;
        var isHidden = body.classList.contains("hidden");

        if (isHidden) {
            // Close all other steps
            document.querySelectorAll(".rec-step-body").forEach(function(b) {
                b.classList.add("hidden");
            });
            document.querySelectorAll(".rec-step-arrow").forEach(function(a) {
                a.textContent = "▸";
            });
            body.classList.remove("hidden");
            var arrow = body.previousElementSibling.querySelector(".rec-step-arrow");
            if (arrow) arrow.textContent = "▾";
        } else {
            body.classList.add("hidden");
            var arrow2 = body.previousElementSibling.querySelector(".rec-step-arrow");
            if (arrow2) arrow2.textContent = "▸";
        }
    }

    function openRecStep(stepNum) {
        document.querySelectorAll(".rec-step-body").forEach(function(b) {
            b.classList.add("hidden");
        });
        document.querySelectorAll(".rec-step-arrow").forEach(function(a) {
            a.textContent = "▸";
        });
        var body = document.getElementById("rec-step-body-" + stepNum);
        if (body) {
            body.classList.remove("hidden");
            var arrow = body.previousElementSibling.querySelector(".rec-step-arrow");
            if (arrow) arrow.textContent = "▾";
        }
    }

    var REC_STEP_INCOMPLETE_HINTS = { "": true, "Sin audio cargado": true, "Sin tomas detectadas": true };

    function setRecStepHint(stepNum, text) {
        var el = document.getElementById("rec-step-hint-" + stepNum);
        if (el) el.textContent = text || "";
        var hdr = document.querySelector('.rec-step-header[data-rec-step="' + stepNum + '"]');
        if (hdr) {
            var done = text && !REC_STEP_INCOMPLETE_HINTS[text];
            hdr.classList.toggle("rec-step-complete", !!done);
        }
    }

    var recStepTimers = {};
    var recProcessStartTime = 0;

    function recStepStart(stepNum) {
        recStepTimers[stepNum] = Date.now();
        if (!recProcessStartTime) recProcessStartTime = Date.now();
        var el = document.getElementById("rec-step-time-" + stepNum);
        if (el) el.textContent = "";
    }

    function recStepEnd(stepNum) {
        if (!recStepTimers[stepNum]) return;
        var elapsed = Date.now() - recStepTimers[stepNum];
        var el = document.getElementById("rec-step-time-" + stepNum);
        if (el) el.textContent = formatElapsed(elapsed);
        updateRecTotalTime();
    }

    function updateRecTotalTime() {
        if (!recProcessStartTime) return;
        var total = Date.now() - recProcessStartTime;
        var el = document.getElementById("rec-total-time-val");
        if (el) el.textContent = formatElapsed(total);
        showElement("rec-total-time");
    }

    function resetRecTimers() {
        recStepTimers = {};
        recProcessStartTime = 0;
        for (var i = 1; i <= 6; i++) {
            var el = document.getElementById("rec-step-time-" + i);
            if (el) el.textContent = "";
        }
        hideElement("rec-total-time");
    }

    function expandSection(tool) {
        var hdr = document.querySelector('[data-tool="' + tool + '"]');
        if (!hdr) return;
        var body = hdr.nextElementSibling;
        var icon = hdr.querySelector(".toggle-icon");
        if (body) body.classList.remove("hidden");
        if (icon) icon.textContent = "▾";
    }

    function truncate(str, maxLen) {
        if (!str) return "";
        return str.length <= maxLen ? str : str.substring(0, maxLen - 3) + "...";
    }

    function formatFileSize(bytes) {
        if (!bytes) return "0 B";
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / 1048576).toFixed(1) + " MB";
    }

    // ═══════════════════════════════════════════════════════════════
    // RECORDING NOTES — STT, Segment Detection, Take Analysis, Markers
    // ═══════════════════════════════════════════════════════════════

    // ─── STT Provider UI ─────────────────────────────────────────

    function refreshSTTProviderUI() {
        var prov = state.settings.sttProvider;
        var info = SpeechToText.PROVIDERS[prov];

        var provSelect = document.getElementById("stt-provider-select");
        if (provSelect) provSelect.value = prov;

        var keyGroup = document.getElementById("stt-key-group");
        if (keyGroup) keyGroup.style.display = info.needsKey ? "" : "none";

        var keyInput = document.getElementById("stt-api-key-input");
        if (keyInput && info.needsKey) {
            keyInput.placeholder = info.keyPlaceholder || "API Key...";
            keyInput.value = stt.getActiveKey() || "";
        }

        var whisperStatus = document.getElementById("whisper-local-status");
        if (whisperStatus) whisperStatus.classList.toggle("hidden", prov !== "whisper_local");
        if (prov === "whisper_local") refreshWhisperLocalStatus();

        var sttStatus = document.getElementById("stt-status");
        if (sttStatus) sttStatus.classList.add("hidden");

        var modelGroup = document.getElementById("stt-model-group");
        var modelSelect = document.getElementById("stt-model-select");
        if (modelSelect && info.models) {
            modelSelect.innerHTML = "";
            info.models.forEach(function(m) {
                var opt = document.createElement("option");
                opt.value = m.id;
                opt.textContent = m.label;
                modelSelect.appendChild(opt);
            });
            modelSelect.value = state.settings.sttModel;
        }
        if (modelGroup) modelGroup.style.display = (prov === "whisper_local") ? "none" : "";

        var btnText = document.getElementById("btn-transcribe-text");
        if (btnText) btnText.textContent = "Transcribir";

        refreshRecSttStatus();
    }

    function refreshRecSttStatus() {
        var el = document.getElementById("rec-stt-status");
        if (!el) return;
        var prov = state.settings.sttProvider;
        var info = SpeechToText.PROVIDERS[prov];
        var statusParts = [info ? info.name : prov];
        if (prov === "whisper_local") {
            var ws = stt.getWhisperLocalStatus();
            statusParts.push(ws.ready ? "✓ listo" : "✗ no configurado");
        } else if (info && info.needsKey) {
            var hasKey = !!stt.getActiveKey();
            statusParts.push(hasKey ? "✓ key configurada" : "✗ sin key");
        }
        el.textContent = "STT: " + statusParts.join(" — ");
    }

    function refreshWhisperLocalStatus() {
        var statusText = document.getElementById("whisper-local-status-text");
        if (!statusText) return;
        var status = stt.getWhisperLocalStatus();
        if (status.ready) {
            statusText.innerHTML = '<span class="stt-connected">✓ whisper.cpp listo — ' +
                esc(status.modelName || "modelo detectado") + '</span>';
        } else {
            var parts = [];
            if (!status.binaryFound) parts.push("binario no encontrado");
            if (!status.modelFound) parts.push("modelo no encontrado");
            statusText.innerHTML = '<span class="stt-disconnected">✗ ' + parts.join(", ") +
                '. Ejecuta whisper/setup-whisper.sh</span>';
        }
    }

    function saveSTTKey() {
        var prov = state.settings.sttProvider;
        var input = document.getElementById("stt-api-key-input");
        var key = input ? input.value.trim() : "";

        stt.setApiKey(prov, key);
        localStorage.setItem("edupro_stt_key_" + prov, key);

        if (key) {
            showElement("stt-status");
            document.getElementById("stt-status-text").innerHTML = '<span class="stt-checking">Verificando...</span>';
            stt.verifyKey(function(result) {
                if (result.valid) {
                    document.getElementById("stt-status-text").innerHTML = '<span class="stt-connected">✓ Key válida</span>';
                } else {
                    document.getElementById("stt-status-text").innerHTML = '<span class="stt-disconnected">✗ ' + (result.error || "Key inválida") + '</span>';
                }
            });
        } else {
            hideElement("stt-status");
        }

        updateAIStatus();
        refreshRecSttStatus();
        var provName = SpeechToText.PROVIDERS[prov].name;
        showToast(key ? "API Key de " + provName + " guardada" : "API Key eliminada", "success");
    }

    // ─── Audio Handling ──────────────────────────────────────────

    function handleAudioFileSelect(evt) {
        var file = evt.target.files[0];
        if (!file) return;
        if (fs && file.path) {
            loadAudioFile(file.path, file.name, file.size);
        } else {
            showToast("Error: No se puede acceder al archivo", "error");
        }
        evt.target.value = "";
    }

    function loadAudioFile(filePath, fileName, fileSize) {
        if (!recStepTimers[1]) recStepStart(1);
        state.audioPath = filePath;
        state.audioFileName = fileName;
        state.audioFileSize = fileSize;

        document.getElementById("audio-info").textContent = "Audio cargado";
        showElement("audio-badge");
        document.getElementById("audio-filename").textContent = fileName;
        document.getElementById("audio-filesize").textContent = formatFileSize(fileSize);

        enableBtn("btn-transcribe");
        hideElement("recording-empty");

        refreshTranscriptWhisperAudioStatus();
        setRecStepHint(1, fileName);
        recStepEnd(1);
        openRecStep(2);
        showToast("Audio cargado: " + fileName, "success");
    }

    function clearAudio() {
        resetRecTimers();
        state.audioPath = "";
        state.audioFileName = "";
        state.audioFileSize = 0;
        state.transcriptionBaseName = null;
        state.sttResult = null;
        state.detectionResult = null;
        state.takeResult = null;
        state.markersPlaced = false;
        state.aiAdjustments = [];
        state.aiSuggestionStates = {};

        document.getElementById("audio-info").textContent = "Sin audio cargado";
        hideElement("audio-badge");
        disableBtn("btn-transcribe");
        disableBtn("btn-analyze-takes");

        hideElement("transcript-preview-section");
        hideElement("detect-section");
        hideElement("analyze-section");
        hideElement("markers-section");
        hideElement("rec-cut-section");
        showElement("recording-empty");

        setRecStepHint(1, "Sin audio cargado");
        setRecStepHint(2, "");
        setRecStepHint(3, "");
        setRecStepHint(4, "");
        setRecStepHint(5, "");
        setRecStepHint(6, "");
        openRecStep(1);

        refreshTranscriptWhisperAudioStatus();
    }

    function getTranscriptionBaseName() {
        var name = (state.sequenceName || state.audioFileName || "transcription").replace(/\.\w+$/, "").replace(/[^a-zA-Z0-9_\-\. áéíóúñÁÉÍÓÚÑ]/g, "_");
        var d = new Date();
        var yy = ("0" + (d.getFullYear() % 100)).slice(-2);
        var mm = ("0" + (d.getMonth() + 1)).slice(-2);
        var dd = ("0" + d.getDate()).slice(-2);
        var hh = ("0" + d.getHours()).slice(-2);
        var min = ("0" + d.getMinutes()).slice(-2);
        var ss = ("0" + d.getSeconds()).slice(-2);
        return name + "_" + yy + "-" + mm + "-" + dd + "_" + hh + "-" + min + "-" + ss;
    }

    // ─── Export from Sequence ────────────────────────────────────

    function exportFromSequence() {
        if (state.exporting) return;

        recStepStart(1);
        state.exporting = true;
        disableBtn("btn-export-seq");
        disableBtn("btn-load-audio");
        showElement("export-progress");
        setProgress("export-progress-fill", "export-progress-text", 5, "Buscando preset de audio WAV...");

        csInterface.evalScript("findOrCreateAudioPreset()", function(presetResult) {
            var presetData;
            try { presetData = JSON.parse(presetResult); } catch(e) {
                finishExport("Error al obtener preset: respuesta inválida");
                return;
            }

            if (presetData.error) {
                finishExport(presetData.error);
                return;
            }

            var delay = presetData.cached ? 100 : 2000;

            setTimeout(function() {
                setProgress("export-progress-fill", "export-progress-text", 30, "Exportando audio de la secuencia (puede tardar)...");

                var presetPath = presetData.path.replace(/\\/g, "/");
                csInterface.evalScript('exportSequenceAudio("' + escExtend(presetPath) + '")', function(exportResult) {
                    var exportData;
                    try { exportData = JSON.parse(exportResult); } catch(e) {
                        finishExport("Error al exportar: respuesta inválida");
                        return;
                    }

                    if (exportData.error) {
                        finishExport("Error: " + exportData.error);
                        return;
                    }

                    setProgress("export-progress-fill", "export-progress-text", 100, "Audio exportado");

                    state.transcriptionBaseName = exportData.baseName || getTranscriptionBaseName();

                    if (exportData.transcribeFolder) {
                        state.transcribeFolder = exportData.transcribeFolder;
                    }

                    var filePath = exportData.path;
                    var fileName = state.transcriptionBaseName + ".wav";
                    var fileSize = 0;
                    try { if (fs) fileSize = fs.statSync(filePath).size; } catch(e) {}

                    setTimeout(function() {
                        state.exporting = false;
                        enableBtn("btn-export-seq");
                        enableBtn("btn-load-audio");
                        hideElement("export-progress");
                        loadAudioFile(filePath, fileName, fileSize);
                        refreshTranscriptWhisperAudioStatus();
                        showToast("Audio exportado en carpeta Transcribe/", "success");
                    }, 400);
                });
            }, delay);
        });
    }

    function finishExport(errorMsg) {
        state.exporting = false;
        enableBtn("btn-export-seq");
        enableBtn("btn-load-audio");
        hideElement("export-progress");
        showToast(errorMsg, "error");
    }

    // ─── Transcription ───────────────────────────────────────────

    function startTranscription() {
        if (state.transcribing) {
            stopTranscription();
            return;
        }
        if (!state.audioPath) {
            showToast("Carga un archivo de audio primero", "error");
            return;
        }
        if (!stt.isConfigured()) {
            var prov = state.settings.sttProvider;
            if (prov === "whisper_local") {
                showToast("Whisper local no configurado. Ejecuta whisper/setup-whisper.sh", "error");
            } else {
                showToast("Configura tu API Key de " + SpeechToText.PROVIDERS[prov].name + " en Ajustes", "error");
                toggleSettings();
            }
            return;
        }

        if (!state.transcriptionBaseName) {
            state.transcriptionBaseName = getTranscriptionBaseName();
        }
        recStepStart(2);
        state.transcribing = true;
        setTranscribeButtonStop(true);
        showElement("stt-progress");
        showElement("stt-progress-transcript");
        hideElement("recording-empty");

        var provName = SpeechToText.PROVIDERS[state.settings.sttProvider].name;
        setSttProgress(5, "Enviando audio a " + provName + "...");
        refreshSttHeaderProgressVisibility();

        stt.transcribe(state.audioPath, function(pct) {
            var label = pct < 40 ? "Subiendo audio..." :
                        pct < 90 ? "Transcribiendo..." :
                        "Finalizando...";
            setSttProgress(pct, label);
        }, function(result) {
            state.transcribing = false;
            setTranscribeButtonStop(false);
            hideElement("stt-progress");
            hideElement("stt-progress-transcript");
            hideElement("stt-progress-header-transcript");
            hideElement("stt-progress-header-recording");

            if (result.error) {
                if (result.error === "Transcripción cancelada.") {
                    showToast("Transcripción detenida", "info");
                } else {
                    showToast("Error STT: " + result.error, "error");
                }
                showElement("recording-empty");
                return;
            }

            state.sttResult = result;
            state.lastWhisperResult = result;

            applySttResultToRecordingNotes(result);
            refreshTraerTranscriptButtons();
            playCompletionSound();
        });
    }

    function stopTranscription() {
        stt.abort();
        state.transcribing = false;
        setTranscribeButtonStop(false);
        hideElement("stt-progress");
        hideElement("stt-progress-transcript");
        hideElement("stt-progress-header-transcript");
        if (!state.autoPilotRunning) {
            hideElement("stt-progress-header-recording");
            showElement("recording-empty");
            showToast("Transcripción detenida", "info");
        }
    }

    function setTranscribeButtonStop(isStop) {
        var btn = document.getElementById("btn-transcribe");
        var txt = document.getElementById("btn-transcribe-text");
        if (!btn) return;
        if (isStop) {
            btn.classList.remove("btn-disabled");
            btn.classList.add("btn-stop");
            if (txt) txt.textContent = "Detener";
        } else {
            btn.classList.remove("btn-stop");
            enableBtn("btn-transcribe");
            if (txt) txt.textContent = "Transcribir";
        }
    }

    function playCompletionSound() {
        try {
            var ctx = new (window.AudioContext || window.webkitAudioContext)();
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            osc.type = "sine";
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.12);
        } catch(e) {}
    }

    function applyWhisperResultToTranscriptCard(result) {
        if (!result || !result.words) return;
        var lineSrt = stt.generateSRT(result, 8);
        if (!lineSrt) return;
        var textarea = document.getElementById("transcript-input");
        if (textarea) {
            textarea.value = lineSrt;
            onTranscriptChange();
        }
        renderClickableTranscript(result.words);
    }

    function renderClickableTranscript(words, wordsPerLine) {
        var container = document.getElementById("transcript-rendered");
        var textarea = document.getElementById("transcript-input");
        if (!container || !words || words.length === 0) return;

        wordsPerLine = wordsPerLine || 8;
        var filtered = words.filter(function(w) { return w.type === "word" && w.text; });
        if (filtered.length === 0) return;

        var html = "";
        for (var i = 0; i < filtered.length; i += wordsPerLine) {
            var chunk = filtered.slice(i, Math.min(i + wordsPerLine, filtered.length));
            var ts = formatTimeFull(chunk[0].start);
            html += '<div class="tr-line">';
            html += '<span class="tr-time">[' + ts + ']</span> ';
            for (var j = 0; j < chunk.length; j++) {
                html += '<span class="tw" data-start="' + chunk[j].start + '">' + esc(chunk[j].text) + '</span> ';
            }
            html += '</div>';
        }
        container.innerHTML = html;
        container.classList.remove("hidden");
        if (textarea) textarea.classList.add("hidden");

        container.onclick = function(evt) {
            var span = evt.target.closest(".tw");
            if (!span) return;
            var t = parseFloat(span.dataset.start);
            if (!isNaN(t)) navigateToTime(t);
        };
    }

    function clearRenderedTranscript() {
        var container = document.getElementById("transcript-rendered");
        var textarea = document.getElementById("transcript-input");
        if (container) { container.innerHTML = ""; container.classList.add("hidden"); }
        if (textarea) textarea.classList.remove("hidden");
    }

    function renderRecordingTranscriptPreview(words, detection, wordsPerLine) {
        var container = document.getElementById("transcript-preview");
        if (!container || !words || words.length === 0) return;

        wordsPerLine = wordsPerLine || 8;
        var filtered = words.filter(function(w) { return w.type === "word" && w.text; });
        if (filtered.length === 0) return;

        var inSet = {};
        var outSet = {};
        if (detection) {
            (detection.inPoints || []).forEach(function(p) { inSet[p.wordIndex] = true; });
            (detection.outPoints || []).forEach(function(p) { outSet[p.wordIndex] = true; });
        }

        var wordIndexMap = {};
        var wordIdx = 0;
        for (var wi = 0; wi < words.length; wi++) {
            if (words[wi].type === "word" && words[wi].text) {
                wordIndexMap[wordIdx] = wi;
                wordIdx++;
            }
        }

        var html = "";
        for (var i = 0; i < filtered.length; i += wordsPerLine) {
            var chunk = filtered.slice(i, Math.min(i + wordsPerLine, filtered.length));
            var ts = formatTimeFull(chunk[0].start);
            html += '<div class="tr-line">';
            html += '<span class="tr-time">[' + ts + ']</span> ';
            for (var j = 0; j < chunk.length; j++) {
                var globalIdx = wordIndexMap[i + j];
                var cls = "tw";
                if (inSet[globalIdx]) cls += " keyword-in";
                else if (outSet[globalIdx]) cls += " keyword-out";
                html += '<span class="' + cls + '" data-start="' + chunk[j].start + '">' + esc(chunk[j].text) + '</span> ';
            }
            html += '</div>';
        }
        container.innerHTML = html;

        container.onclick = function(evt) {
            var span = evt.target.closest(".tw");
            if (!span) return;
            var t = parseFloat(span.dataset.start);
            if (!isNaN(t)) navigateToTime(t);
        };
    }

    function applySttResultToRecordingNotes(result, skipSave) {
        if (!result) return;
        recStepEnd(2);
        recStepStart(3);
        recorder.loadTranscription(result);
        if (!skipSave) saveSRTFiles(result);

        var wordCount = (result.words || []).filter(function(w) { return w.type === "word"; }).length;
        var wcEl = document.getElementById("rec-transcript-word-count");
        if (wcEl) wcEl.textContent = wordCount + " palabras";
        showElement("transcript-preview-section");

        var detection = recorder.detectSegments();
        state.detectionResult = detection;

        renderRecordingTranscriptPreview(result.words, detection);

        showElement("detect-section");
        showElement("detect-summary");

        document.getElementById("detect-trigger-count").textContent = detection.inPoints.length + detection.outPoints.length;
        document.getElementById("detect-trigger-detail").textContent = detection.inPoints.length + " IN / " + detection.outPoints.length + " OUT";

        updateDetectSummary();
        renderSegmentList(detection.segments, detection.takeGroups);
        setRecStepHint(2, wordCount + " palabras");

        if (detection.segments.length > 0) {
            recorder.generateSimpleMarkers();
            showElement("analyze-section");
            enableBtn("btn-analyze-takes");
            showElement("markers-section");
            updateMarkersActiveCount();
            hideElement("rec-cut-section");
            state.markersPlaced = false;
            var activeCount = getActiveSegmentCount();
            var toastMsg = activeCount + " tomas activas de " + detection.segments.length;
            if (detection.filteredCount > 0) toastMsg += " (" + detection.filteredCount + " descartadas)";
            if (detection.retakeGroupCount > 0) toastMsg += " (" + detection.retakeGroupCount + " re-tomas)";
            setRecStepHint(3, activeCount + " activas / " + detection.segments.length + " tomas");
            recStepEnd(3);
            openRecStep(3);
            showToast(toastMsg, "success");
        } else {
            setRecStepHint(3, "Sin tomas detectadas");
            recStepEnd(3);
            showToast("No se detectaron segmentos. Verifica que el audio contenga \"retomemos\" / \"3,2,1\" (IN) y \"pausa\" (OUT).", "info");
        }
    }

    function loadLastWhisperIntoTranscript() {
        if (!state.lastWhisperResult) return;
        var lineSrt = stt.generateSRT(state.lastWhisperResult, 8);
        if (!lineSrt) return;
        var textarea = document.getElementById("transcript-input");
        if (textarea) {
            textarea.value = lineSrt;
            onTranscriptChange();
        }
        renderClickableTranscript(state.lastWhisperResult.words);
        expandSection("transcript");
        showToast("Transcripción cargada (SRT por línea)", "success");
    }

    function handleSrtRecordingSelect(evt) {
        var file = evt.target.files[0];
        if (!file) return;

        var processSrt = function(content) {
            var segments = parseSRT(content);
            if (!segments || segments.length === 0) {
                showToast("No se encontraron subtítulos válidos en el archivo", "error");
                return;
            }
            var words = [];
            segments.forEach(function(seg) {
                var segWords = seg.text.split(/\s+/).filter(function(w) { return w.length > 0; });
                var segDuration = seg.endTime - seg.startTime;
                var wordDur = segWords.length > 0 ? segDuration / segWords.length : segDuration;
                for (var i = 0; i < segWords.length; i++) {
                    words.push({
                        type: "word",
                        text: segWords[i],
                        start: seg.startTime + (i * wordDur),
                        end: seg.startTime + ((i + 1) * wordDur)
                    });
                }
            });
            var fullText = segments.map(function(s) { return s.text; }).join(" ");
            var sttResult = { words: words, text: fullText, language: "es" };

            state.sttResult = sttResult;
            state.lastWhisperResult = sttResult;
            refreshTraerTranscriptButtons();
            applySttResultToRecordingNotes(sttResult, true);
            hideElement("recording-empty");
            showToast(segments.length + " subtítulos cargados desde " + file.name, "success");
        };

        if (fs) {
            try {
                processSrt(fs.readFileSync(file.path, "utf8"));
            } catch(e) {
                showToast("Error al leer archivo: " + e.message, "error");
            }
        } else {
            var reader = new FileReader();
            reader.onload = function(e) { processSrt(e.target.result); };
            reader.readAsText(file);
        }
        evt.target.value = "";
    }

    function fetchCaptionsForRecording() {
        var btn = document.getElementById("btn-fetch-captions-recording");
        if (btn) { btn.textContent = "Buscando..."; btn.classList.add("btn-disabled"); }
        var resetBtn = function() {
            if (btn) { btn.textContent = "Traer de secuencia"; btn.classList.remove("btn-disabled"); }
        };

        function loadResult(sttResult, source) {
            state.sttResult = sttResult;
            state.lastWhisperResult = sttResult;
            refreshTraerTranscriptButtons();
            applySttResultToRecordingNotes(sttResult, true);
            hideElement("recording-empty");
            var srt = sttResultToSRT(sttResult);
            loadTranscriptText(srt, source);
            resetBtn();
            showToast("Transcripción cargada desde " + source, "success");
        }

        csInterface.evalScript("getSequenceTranscriptInfo()", function(result) {
            try {
                var info = JSON.parse(result);
                if (info.error) {
                    showToast(info.error, "error");
                    resetBtn();
                    return;
                }

                var found = findTranscriptFiles(info.projectPath, info.mediaPaths, info.sequenceName);
                if (found) {
                    var source = found.type === "prtranscript" ? "transcript de Premiere" : path.basename(found.file);
                    loadResult(found.result, source);
                    return;
                }

                var embedded = readTranscriptFromProjectFile(info.projectPath);
                if (embedded && embedded.words.length > 5) {
                    loadResult(embedded, "transcript de Premiere (" + info.sequenceName + ")");
                    return;
                }

                var captions = readCaptionsFromProjectFile(info.projectPath, info.sequenceId);
                if (captions && captions.length > 0) {
                    var sttResult = captionsToSttResult(captions);
                    loadResult(sttResult, "captions de secuencia (" + captions.length + ")");
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

    function captionsToSttResult(captions) {
        var words = [];
        for (var i = 0; i < captions.length; i++) {
            var cap = captions[i];
            var capWords = cap.text.split(/\s+/).filter(function(w) { return w.length > 0; });
            var capDuration = cap.endTime - cap.startTime;
            var wordDur = capWords.length > 0 ? capDuration / capWords.length : capDuration;
            for (var w = 0; w < capWords.length; w++) {
                words.push({
                    type: "word",
                    text: capWords[w],
                    start: cap.startTime + (w * wordDur),
                    end: cap.startTime + ((w + 1) * wordDur)
                });
            }
        }
        var fullText = captions.map(function(c) { return c.text; }).join(" ");
        return { words: words, text: fullText, language: "es" };
    }

    function loadLastWhisperIntoRecordingNotes() {
        if (!state.lastWhisperResult) return;
        state.sttResult = state.lastWhisperResult;
        applySttResultToRecordingNotes(state.lastWhisperResult, true);
        showToast("Transcripción cargada en Notas de grabación", "success");
    }

    function refreshTraerTranscriptButtons() {
        var hasLast = !!state.lastWhisperResult;
        var btnTranscript = document.getElementById("btn-bring-whisper-transcript");
        var btnRecording = document.getElementById("btn-bring-whisper-recording");
        if (btnTranscript) {
            btnTranscript.classList.toggle("hidden", !hasLast);
            btnTranscript.disabled = !hasLast;
        }
        if (btnRecording) {
            btnRecording.classList.toggle("hidden", !hasLast);
            btnRecording.disabled = !hasLast;
        }
    }

    function refreshTranscriptWhisperAudioStatus() {
        var el = document.getElementById("transcript-whisper-audio-status");
        if (el) {
            if (state.audioPath && state.audioFileName) {
                el.textContent = "Audio: " + state.audioFileName;
            } else {
                el.textContent = "Sin audio cargado";
            }
        }
        var btn = document.getElementById("btn-transcribe-whisper");
        if (btn) {
            var hasAudio = !!(state.audioPath && state.audioFileName);
            btn.disabled = !hasAudio;
            btn.classList.toggle("btn-disabled", !hasAudio);
        }
    }

    function saveSRTFiles(result) {
        if (!result || !result.words || result.words.length === 0) return;
        var outputFolder = state.transcribeFolder;
        if (!outputFolder) {
            csInterface.evalScript("getTranscribeFolder()", function(res) {
                try {
                    var data = JSON.parse(res);
                    if (data.success) {
                        state.transcribeFolder = data.path;
                        doSaveSRT(result, data.path);
                    }
                } catch(e) {}
            });
            return;
        }
        doSaveSRT(result, outputFolder);
    }

    function doSaveSRT(result, folder) {
        var baseName = state.transcriptionBaseName || getTranscriptionBaseName();
        var srtResult = stt.saveSRT(result, folder, baseName, 1);
        if (srtResult.path) {
            showToast("SRT guardado en Transcribe/", "success");
        }
    }

    function renderSegmentList(segments, takeGroups) {
        var list = document.getElementById("segment-list");
        list.innerHTML = "";

        var activeCount = getActiveSegmentCount();
        var filteredCount = 0;
        var retakeGroupCount = 0;
        for (var s = 0; s < segments.length; s++) {
            if (segments[s].filtered) filteredCount++;
        }
        if (takeGroups) {
            for (var g = 0; g < takeGroups.length; g++) {
                if (takeGroups[g].takes.length > 1) retakeGroupCount++;
            }
        }

        if (filteredCount > 0 || retakeGroupCount > 0) {
            var summary = document.createElement("div");
            summary.className = "segment-summary";
            var parts = [];
            parts.push('<strong>' + activeCount + '</strong> tomas activas de ' + segments.length);
            if (filteredCount > 0) parts.push('<span class="summary-filtered">' + filteredCount + ' descartadas</span>');
            if (retakeGroupCount > 0) parts.push('<span class="summary-retakes">' + retakeGroupCount + ' re-tomas</span>');
            summary.innerHTML = parts.join(' · ');
            list.appendChild(summary);
        }

        segments.forEach(function(seg) {
            var isActive = isSegmentActive(seg);
            var el = document.createElement("div");
            var classes = "segment-item type-in";
            if (!isActive) classes += " seg-inactive";
            else classes += " seg-active";
            if (seg.filtered && !seg._userOverride) classes += " seg-filtered";
            else if (seg.retakeTotal > 1 && !seg.recommended && !seg._userOverride) classes += " seg-not-recommended";
            el.className = classes;
            el.setAttribute("data-seg-index", seg.index);

            var badgeText = "TOMA " + seg.index;
            var statusTags = "";
            if (seg.filtered && !seg._userOverride) {
                statusTags = '<span class="seg-filter-tag">' + esc(seg.filterReason) + '</span>';
            } else if (seg.retakeTotal > 1) {
                statusTags = '<span class="seg-retake-tag">' + seg.retakeNum + '/' + seg.retakeTotal;
                if (isActive) statusTags += ' ★';
                statusTags += '</span>';
            }
            if (seg._userOverride) {
                statusTags += '<span class="seg-user-tag">manual</span>';
            }

            var toggleIcon = isActive
                ? '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.2"/><path d="M4 7l2 2 4-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
                : '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.2"/></svg>';

            el.innerHTML =
                '<button class="seg-toggle" data-seg-index="' + seg.index + '" title="' + (isActive ? "Desactivar toma" : "Activar toma") + '">' + toggleIcon + '</button>' +
                '<span class="segment-badge">' + badgeText + '</span>' +
                statusTags +
                '<div class="segment-info">' +
                    '<div class="segment-title">' + esc(seg.firstPhrase || seg.fullText.substring(0, 60)) + '</div>' +
                    '<div class="segment-comment">' + esc(truncate(seg.fullText, 120)) + '</div>' +
                    '<div class="segment-time">' + formatTimeFull(seg.inTime) + ' → ' + formatTimeFull(seg.outTime) + '</div>' +
                '</div>' +
                '<span class="segment-duration">' + seg.duration.toFixed(1) + 's</span>';

            el.querySelector(".segment-info").addEventListener("click", function() {
                navigateToTime(seg.inTime);
            });

            el.querySelector(".seg-toggle").addEventListener("click", function(e) {
                e.stopPropagation();
                toggleSegment(seg);
            });

            list.appendChild(el);
        });
    }

    function isSegmentActive(seg) {
        if (seg._userOverride !== undefined) return seg._userOverride;
        return !seg.filtered && seg.recommended;
    }

    function getActiveSegmentCount() {
        var count = 0;
        var segs = recorder.segments || [];
        for (var i = 0; i < segs.length; i++) {
            if (isSegmentActive(segs[i])) count++;
        }
        return count;
    }

    function getActiveSegments() {
        var result = [];
        var segs = recorder.segments || [];
        for (var i = 0; i < segs.length; i++) {
            if (isSegmentActive(segs[i])) result.push(segs[i]);
        }
        return result;
    }

    function toggleSegment(seg) {
        var wasActive = isSegmentActive(seg);
        seg._userOverride = !wasActive;
        onSegmentSelectionChanged();
    }

    function onSegmentSelectionChanged() {
        recorder.generateSimpleMarkers();
        renderSegmentList(recorder.segments, recorder.takeGroups);
        updateDetectSummary();
        updateMarkersActiveCount();
        state.markersPlaced = false;
        hideElement("rec-cut-section");
        var ac = getActiveSegmentCount();
        setRecStepHint(3, ac + " activas / " + (recorder.segments || []).length + " tomas");
    }

    function updateDetectSummary() {
        var active = getActiveSegments();
        var keepTotal = 0;
        active.forEach(function(seg) { keepTotal += seg.duration; });

        var lastWord = (recorder.words || []).filter(function(w) { return w.type === "word"; });
        var audioDuration = lastWord.length > 0 ? lastWord[lastWord.length - 1].end : 0;
        var removeTotal = Math.max(0, audioDuration - keepTotal);

        var removeZoneCount = 0;
        if (active.length > 0) {
            if (active[0].inTime > 0.5) removeZoneCount++;
            for (var gz = 0; gz < active.length - 1; gz++) {
                if (active[gz + 1].inTime - active[gz].outTime > 0.1) removeZoneCount++;
            }
            if (audioDuration - active[active.length - 1].outTime > 0.5) removeZoneCount++;
        }

        document.getElementById("detect-keep-duration").textContent = formatTimeFull(keepTotal);
        document.getElementById("detect-keep-detail").textContent = active.length + " bloque" + (active.length !== 1 ? "s" : "");
        document.getElementById("detect-remove-duration").textContent = formatTimeFull(removeTotal);
        document.getElementById("detect-remove-detail").textContent = removeZoneCount + " zona" + (removeZoneCount !== 1 ? "s" : "");
    }

    function updateMarkersActiveCount() {
        var count = getActiveSegmentCount();
        var el = document.getElementById("markers-active-count");
        if (el) el.textContent = count + " toma" + (count !== 1 ? "s" : "") + " activa" + (count !== 1 ? "s" : "") + " para colocar como marcadores.";
        setRecStepHint(5, count + " toma" + (count !== 1 ? "s" : "") + " activa" + (count !== 1 ? "s" : ""));
    }

    // ─── Supplementary AI Review ────────────────────────────────

    function buildGapContent() {
        var words = recorder.words;
        if (!words || !words.length) return "(ninguno)";
        var segs = recorder.segments;
        if (!segs || !segs.length) return "(ninguno)";

        var sorted = segs.slice().sort(function(a, b) { return a.inTime - b.inTime; });

        var gapGroups = [];
        var currentGap = [];

        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            if (w.type !== "word") continue;

            var covered = false;
            for (var s = 0; s < sorted.length; s++) {
                if (w.start >= sorted[s].inTime - 0.1 && w.start <= sorted[s].outTime + 0.1) {
                    covered = true;
                    break;
                }
            }

            if (!covered) {
                currentGap.push(w);
            } else {
                if (currentGap.length > 0) {
                    gapGroups.push(currentGap);
                    currentGap = [];
                }
            }
        }
        if (currentGap.length > 0) gapGroups.push(currentGap);

        var gapLines = [];
        for (var g = 0; g < gapGroups.length; g++) {
            var gWords = gapGroups[g];
            if (gWords.length < 5) continue;

            var dur = gWords[gWords.length - 1].end - gWords[0].start;
            if (dur < 3) continue;

            var text = gWords.map(function(w) { return w.text; }).join(" ");
            gapLines.push("[" + formatTimeFull(gWords[0].start) + " - " + formatTimeFull(gWords[gWords.length - 1].end) + " | " + dur.toFixed(1) + "s]:\n\"" + text + "\"");
        }

        return gapLines.length > 0 ? gapLines.join("\n\n") : "(ninguno)";
    }

    function buildAIReviewContext() {
        var segs = recorder.segments || [];
        var active = [];
        var inactive = [];

        for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];
            var info = {
                index: seg.index,
                inTime: seg.inTime,
                outTime: seg.outTime,
                duration: seg.duration || (seg.outTime - seg.inTime),
                firstPhrase: seg.firstPhrase || "",
                fullText: seg.fullText || "",
                retakeNum: seg.retakeNum || 0,
                retakeTotal: seg.retakeTotal || 0
            };
            if (isSegmentActive(seg)) {
                active.push(info);
            } else {
                var reason = "";
                if (seg.filtered) reason = "filtrada: " + (seg.filterReason || "descartada");
                else if ((seg.retakeTotal || 0) > 1) reason = "re-toma " + (seg.retakeNum || "?") + "/" + seg.retakeTotal + ", hay mejor version activa";
                else if (seg._userOverride === false) reason = "desactivada manualmente";
                else reason = "no seleccionada";
                info.reason = reason;
                inactive.push(info);
            }
        }

        active.sort(function(a, b) { return a.inTime - b.inTime; });
        inactive.sort(function(a, b) { return a.inTime - b.inTime; });

        var cutLines = [];
        for (var a = 0; a < active.length; a++) {
            var t = active[a];
            var label = "TOMA " + t.index;
            if (t.retakeTotal > 1) label += " [mejor de " + t.retakeTotal + " tomas]";
            cutLines.push("[" + label + " | " + formatTimeFull(t.inTime) + " - " + formatTimeFull(t.outTime) + " | " + t.duration.toFixed(1) + "s]\n\"" + t.fullText + "\"");

            if (a < active.length - 1) {
                var gapStart = t.outTime;
                var gapEnd = active[a + 1].inTime;
                var gapDur = gapEnd - gapStart;
                if (gapDur > 0.5) {
                    var gapInactive = [];
                    for (var j = 0; j < inactive.length; j++) {
                        if (inactive[j].inTime >= gapStart - 0.5 && inactive[j].outTime <= gapEnd + 0.5) {
                            gapInactive.push("Toma " + inactive[j].index + " (" + inactive[j].reason + ")");
                        }
                    }
                    var gapNote = "--- CORTE: " + gapDur.toFixed(1) + "s eliminados";
                    if (gapInactive.length > 0) gapNote += " [contenían: " + gapInactive.join(", ") + "]";
                    gapNote += " ---";
                    cutLines.push(gapNote);
                }
            }
        }

        var inactiveLines = [];
        for (var n = 0; n < inactive.length; n++) {
            var it = inactive[n];
            inactiveLines.push("TOMA " + it.index + " (" + it.reason + ") [" + formatTimeFull(it.inTime) + " - " + formatTimeFull(it.outTime) + " | " + it.duration.toFixed(1) + "s]:\n\"" + it.fullText + "\"");
        }

        var gapContent = buildGapContent();

        return {
            cutSequence: cutLines.join("\n\n"),
            inactiveSummary: inactiveLines.length > 0 ? inactiveLines.join("\n\n") : "(ninguna)",
            gapContent: gapContent,
            activeCount: active.length,
            inactiveCount: inactive.length,
            totalCount: segs.length
        };
    }

    function startTakeAnalysis() {
        if (state.analyzing) {
            cancelTakeAnalysis();
            return;
        }
        if (!recorder.words || recorder.words.length === 0) {
            showToast("No hay transcript para revisar", "error");
            return;
        }
        if (!checkAIReady()) return;

        recStepStart(4);
        state.analyzing = true;
        state.supplementaryPairs = [];
        setAnalyzeButtonMode("cancel");
        showElement("take-progress");
        hideElement("take-results");
        setProgress("take-progress-fill", "take-progress-text", 20, "Analizando tomas con IA...");

        var reviewContext = buildAIReviewContext();

        aiAnalyzer.reviewContinuity(reviewContext, getTakeAnalysisPromptContext(), function(result) {
            setProgress("take-progress-fill", "take-progress-text", 100, "Completado");

            setTimeout(function() {
                hideElement("take-progress");
                state.analyzing = false;
                setAnalyzeButtonMode("analyze");

                if (result.error) {
                    showToast("Error IA: " + result.error, "error");
                    return;
                }

                var adjustments = result.adjustments || [];
                var additional = result.additionalMarkers || [];
                resolveSupplementaryTimecodes(additional);
                var pairs = pairAdditionalMarkers(additional);
                state.supplementaryPairs = pairs;
                state.aiAdjustments = adjustments;

                var totalSuggestions = adjustments.length + pairs.length;

                showElement("take-results");
                document.getElementById("take-group-count").textContent = totalSuggestions;

                recStepEnd(4);
                if (totalSuggestions === 0) {
                    setRecStepHint(4, "Sin ajustes");
                    showToast("La IA validó la continuidad — la selección es correcta", "success");
                    document.getElementById("take-list").innerHTML =
                        '<div class="empty-state-mini"><p class="empty-text">La continuidad de la clase es correcta con las tomas seleccionadas.</p></div>';
                    hideElement("btn-add-supplement-markers");
                } else {
                    renderAISuggestions(adjustments, pairs);
                    if (adjustments.length > 0) {
                        showElement("btn-add-supplement-markers");
                    } else {
                        hideElement("btn-add-supplement-markers");
                    }
                    setRecStepHint(4, totalSuggestions + " sugerencia" + (totalSuggestions !== 1 ? "s" : ""));
                    var parts = [];
                    if (adjustments.length > 0) parts.push(adjustments.length + " ajuste" + (adjustments.length !== 1 ? "s" : ""));
                    if (pairs.length > 0) parts.push(pairs.length + " toma" + (pairs.length !== 1 ? "s" : "") + " oculta" + (pairs.length !== 1 ? "s" : ""));
                    showToast("IA sugiere: " + parts.join(" + "), "success");
                }
            }, 500);
        });
    }

    function cancelTakeAnalysis() {
        aiAnalyzer.abort();
        state.analyzing = false;
        hideElement("take-progress");
        setAnalyzeButtonMode("analyze");
        showToast("Análisis detenido", "info");
    }

    function setAnalyzeButtonMode(mode) {
        var btn = document.getElementById("btn-analyze-takes");
        if (!btn) return;
        var textEl = btn.querySelector(".btn-analyze-text");
        if (mode === "cancel") {
            btn.classList.remove("btn-disabled", "btn-analyze-alt");
            btn.classList.add("btn-analyze-cancel");
            if (textEl) textEl.textContent = "Detener análisis";
        } else {
            btn.classList.remove("btn-analyze-cancel");
            btn.classList.add("btn-analyze-alt");
            btn.classList.remove("btn-disabled");
            if (textEl) textEl.textContent = "Revisar con IA";
        }
    }

    function resolveSupplementaryTimecodes(markers) {
        var words = recorder.words.filter(function(w) { return w.type === "word"; });
        if (!words.length) return;

        var allText = words.map(function(w) { return w.text.toLowerCase().replace(/[.,!?;:…"""'']/g, ""); });

        markers.forEach(function(m) {
            var searchText = (m.approximateText || m.timeHint || "").toLowerCase().replace(/[.,!?;:…"""'']/g, "");
            var searchWords = searchText.split(/\s+/).filter(function(w) { return w.length > 1; });
            if (searchWords.length === 0) return;

            var bestIdx = -1, bestScore = 0;
            for (var i = 0; i <= allText.length - searchWords.length; i++) {
                var score = 0;
                for (var j = 0; j < searchWords.length && i + j < allText.length; j++) {
                    if (allText[i + j] === searchWords[j]) score++;
                }
                if (score > bestScore) { bestScore = score; bestIdx = i; }
            }

            if (bestIdx >= 0 && bestScore >= Math.max(1, Math.floor(searchWords.length * 0.4))) {
                m._resolvedTime = words[bestIdx].start;
                m._resolvedEndTime = words[Math.min(bestIdx + searchWords.length - 1, words.length - 1)].end;
            }
        });
    }

    function pairAdditionalMarkers(markers) {
        var pairs = [];
        var i = 0;
        while (i < markers.length) {
            if (markers[i].type === "IN" && i + 1 < markers.length && markers[i + 1].type === "OUT") {
                pairs.push({ inMarker: markers[i], outMarker: markers[i + 1] });
                i += 2;
            } else {
                var m = markers[i];
                pairs.push({
                    inMarker: m.type === "IN" ? m : null,
                    outMarker: m.type === "OUT" ? m : null
                });
                i++;
            }
        }
        return pairs;
    }

    function getAcceptedAIMarkers() {
        var states = state.aiSuggestionStates || {};
        var pairs = state.supplementaryPairs || [];
        var result = [];

        for (var i = 0; i < pairs.length; i++) {
            if (!states["mkr_" + i]) continue;
            var pair = pairs[i];

            if (pair.inMarker && pair.inMarker._resolvedTime !== undefined) {
                var inEnd = pair.outMarker && pair.outMarker._resolvedTime !== undefined
                    ? pair.outMarker._resolvedTime
                    : (pair.inMarker._resolvedEndTime || pair.inMarker._resolvedTime + 10);
                var inDuration = Math.min(10, inEnd - pair.inMarker._resolvedTime);
                result.push({
                    time: pair.inMarker._resolvedTime,
                    endTime: pair.inMarker._resolvedTime + inDuration,
                    name: "[RN] IA: " + (pair.inMarker.comment || "Toma oculta"),
                    comment: "Sugerencia IA — " + (pair.inMarker.comment || ""),
                    color: 6
                });
            }
            if (pair.outMarker && pair.outMarker._resolvedTime !== undefined) {
                result.push({
                    time: pair.outMarker._resolvedTime,
                    name: "[RN] IA: OUT",
                    comment: "OUT: Sugerencia IA — " + (pair.outMarker.comment || ""),
                    color: 6
                });
            }
        }

        return result;
    }

    function renderAISuggestions(adjustments, pairs) {
        var list = document.getElementById("take-list");
        list.innerHTML = "";

        state.aiSuggestionStates = {};

        if (adjustments.length > 0) {
            var adjHeader = document.createElement("div");
            adjHeader.className = "ai-section-header";
            adjHeader.textContent = "Ajustes a tomas existentes";
            list.appendChild(adjHeader);

            adjustments.forEach(function(adj, idx) {
                var seg = null;
                for (var i = 0; i < recorder.segments.length; i++) {
                    if (recorder.segments[i].index === adj.segIndex) { seg = recorder.segments[i]; break; }
                }
                var key = "adj_" + idx;
                state.aiSuggestionStates[key] = true;

                var el = document.createElement("div");
                var isActivate = adj.action === "activate";
                el.className = "segment-item ai-suggestion-item " + (isActivate ? "ai-activate" : "ai-deactivate");
                el.setAttribute("data-suggestion", key);

                var actionBadge = isActivate
                    ? '<span class="segment-badge ai-badge-activate">ACTIVAR</span>'
                    : '<span class="segment-badge ai-badge-deactivate">DESACTIVAR</span>';

                var segLabel = seg ? ("Toma " + adj.segIndex + " — " + esc(truncate(seg.firstPhrase || "", 50))) : ("Toma " + adj.segIndex);

                el.innerHTML = actionBadge +
                    '<div class="segment-info">' +
                        '<div class="segment-title">' + segLabel + '</div>' +
                        '<div class="segment-comment">' + esc(adj.reason || "") + '</div>' +
                    '</div>' +
                    '<div class="ai-suggestion-actions">' +
                        '<button class="btn-ai-accept active" data-key="' + key + '" title="Aceptar">✓</button>' +
                        '<button class="btn-ai-reject" data-key="' + key + '" title="Rechazar">✕</button>' +
                    '</div>';

                el.style.cursor = "pointer";
                (function(adjRef, segRef) {
                    el.addEventListener("click", function(e) {
                        if (e.target.closest(".ai-suggestion-actions")) return;
                        if (segRef) previewAISuggestion(adjRef, segRef);
                    });
                })(adj, seg);

                el.querySelector(".btn-ai-accept").addEventListener("click", function() { toggleAISuggestion(key, true); });
                el.querySelector(".btn-ai-reject").addEventListener("click", function() { toggleAISuggestion(key, false); });

                list.appendChild(el);
            });
        }

        if (pairs.length > 0) {
            var mkrHeader = document.createElement("div");
            mkrHeader.className = "ai-section-header";
            mkrHeader.textContent = "Tomas ocultas detectadas";
            list.appendChild(mkrHeader);

            pairs.forEach(function(pair, idx) {
                var key = "mkr_" + idx;
                state.aiSuggestionStates[key] = true;

                var inM = pair.inMarker;
                var outM = pair.outMarker;
                var display = inM || outM;
                if (!display) return;

                var el = document.createElement("div");
                el.className = "segment-item ai-suggestion-item ai-hidden-take";
                el.setAttribute("data-suggestion", key);

                var inTimeStr = inM && inM._resolvedTime !== undefined ? formatTimeFull(inM._resolvedTime) : "";
                var outTimeStr = outM && outM._resolvedTime !== undefined ? formatTimeFull(outM._resolvedTime) : "";
                var timeRange = inTimeStr && outTimeStr ? inTimeStr + " → " + outTimeStr : (inTimeStr || outTimeStr);

                var outDetailHtml = "";
                if (outM) {
                    outDetailHtml = '<div class="ai-out-detail hidden">' +
                        '<strong>OUT:</strong> ' + esc(truncate(outM.approximateText || "", 100)) +
                        (outTimeStr ? ' <span class="segment-time">' + outTimeStr + '</span>' : '') +
                        '</div>';
                }

                el.innerHTML =
                    '<span class="segment-badge ai-badge-hidden">IN</span>' +
                    '<div class="segment-info">' +
                        '<div class="segment-title">' + esc(display.comment || "Toma oculta") + '</div>' +
                        '<div class="segment-comment">"' + esc(truncate((inM || outM).approximateText || "", 120)) + '"</div>' +
                        (timeRange ? '<div class="segment-time">' + timeRange + '</div>' : '') +
                        outDetailHtml +
                    '</div>' +
                    '<div class="ai-suggestion-actions">' +
                        '<button class="btn-ai-accept active" data-key="' + key + '" title="Aceptar">✓</button>' +
                        '<button class="btn-ai-reject" data-key="' + key + '" title="Rechazar">✕</button>' +
                    '</div>';

                el.style.cursor = "pointer";
                (function(pairRef) {
                    el.addEventListener("click", function(e) {
                        if (e.target.closest(".ai-suggestion-actions")) return;
                        var outDetail = el.querySelector(".ai-out-detail");
                        if (outDetail) outDetail.classList.toggle("hidden");
                        if (pairRef.inMarker && pairRef.inMarker._resolvedTime !== undefined) {
                            previewAdditionalMarker(pairRef.inMarker);
                        }
                    });
                })(pair);

                el.querySelector(".btn-ai-accept").addEventListener("click", function() { toggleAISuggestion(key, true); });
                el.querySelector(".btn-ai-reject").addEventListener("click", function() { toggleAISuggestion(key, false); });

                list.appendChild(el);
            });
        }

        updateAISuggestionCount();
    }

    function toggleAISuggestion(key, accepted) {
        state.aiSuggestionStates[key] = accepted;
        var item = document.querySelector('[data-suggestion="' + key + '"]');
        if (item) {
            var acceptBtn = item.querySelector(".btn-ai-accept");
            var rejectBtn = item.querySelector(".btn-ai-reject");
            if (accepted) {
                acceptBtn.classList.add("active");
                rejectBtn.classList.remove("active");
                item.classList.remove("ai-rejected");
            } else {
                acceptBtn.classList.remove("active");
                rejectBtn.classList.add("active");
                item.classList.add("ai-rejected");
            }
        }
        updateAISuggestionCount();
    }

    function updateAISuggestionCount() {
        var states = state.aiSuggestionStates || {};
        var adjAccepted = 0;
        var adjTotal = 0;
        for (var k in states) {
            if (k.indexOf("adj_") === 0) {
                adjTotal++;
                if (states[k]) adjAccepted++;
            }
        }
        var btnEl = document.getElementById("btn-add-supplement-markers");
        if (btnEl) {
            if (adjTotal === 0) {
                hideElement("btn-add-supplement-markers");
            } else {
                btnEl.textContent = "Aplicar " + adjAccepted + " de " + adjTotal + " ajuste" + (adjTotal !== 1 ? "s" : "");
                if (adjAccepted === 0) btnEl.classList.add("btn-disabled");
                else btnEl.classList.remove("btn-disabled");
            }
        }
    }

    function previewAISuggestion(adj, seg) {
        if (!seg) return;
        csInterface.evalScript('clearMarkersByPrefix("[PREVIEW]")', function() {
            var previewMarkers = [];
            var isActivate = adj.action === "activate";

            // "ANTES" markers (orange, color 3): show current state of the segment
            previewMarkers.push({
                time: seg.inTime,
                endTime: seg.inTime + 5,
                name: "[PREVIEW] ANTES — IN",
                comment: (isActivate ? "Actualmente INACTIVA" : "Actualmente ACTIVA") + " — Toma " + seg.index,
                color: 3
            });
            previewMarkers.push({
                time: seg.outTime,
                name: "[PREVIEW] ANTES — OUT",
                comment: (isActivate ? "Esta toma NO se conserva en el corte actual" : "Esta toma SÍ se conserva en el corte actual"),
                color: 3
            });

            // "SUGERIDO" markers (blue, color 6): show what the AI suggests
            previewMarkers.push({
                time: seg.inTime + 0.1,
                endTime: seg.inTime + 5,
                name: "[PREVIEW] SUGERIDO — IN",
                comment: (isActivate ? "IA sugiere ACTIVAR" : "IA sugiere DESACTIVAR") + " — " + (adj.reason || ""),
                color: 6
            });
            previewMarkers.push({
                time: seg.outTime + 0.1,
                name: "[PREVIEW] SUGERIDO — OUT",
                comment: (isActivate ? "Incluir esta toma en el corte final" : "Excluir esta toma del corte final"),
                color: 6
            });

            var tmpFile = path.join(os.tmpdir(), "edupro_preview_markers.json");
            try {
                fs.writeFileSync(tmpFile, JSON.stringify(previewMarkers), "utf8");
            } catch(e) { return; }
            var safePath = tmpFile.replace(/\\/g, "/");
            csInterface.evalScript('addMarkersFromFile("' + escExtend(safePath) + '")', function() {
                navigateToTime(Math.max(0, seg.inTime - 1));
            });
        });
    }

    function previewAdditionalMarker(mkr) {
        if (mkr._resolvedTime === undefined) return;
        csInterface.evalScript('clearMarkersByPrefix("[PREVIEW]")', function() {
            var startTime = mkr._resolvedTime;
            var endTime = mkr._resolvedEndTime || (startTime + 5);
            var previewMarkers = [{
                time: startTime,
                endTime: endTime,
                name: "[PREVIEW] " + mkr.type + " sugerido",
                comment: (mkr.comment || "Marcador sugerido") + " — \"" + (mkr.approximateText || "").substring(0, 80) + "\"",
                color: 6
            }];
            var tmpFile = path.join(os.tmpdir(), "edupro_preview_markers.json");
            try { fs.writeFileSync(tmpFile, JSON.stringify(previewMarkers), "utf8"); } catch(e) { return; }
            var safePath = tmpFile.replace(/\\/g, "/");
            csInterface.evalScript('addMarkersFromFile("' + escExtend(safePath) + '")', function() {
                navigateToTime(Math.max(0, startTime - 1));
            });
        });
    }

    function clearPreviewMarkers() {
        csInterface.evalScript('clearMarkersByPrefix("[PREVIEW]")', function() {});
    }

    function addSupplementaryMarkers() {
        var states = state.aiSuggestionStates || {};
        var applied = 0;

        var adjustments = state.aiAdjustments || [];
        adjustments.forEach(function(adj, idx) {
            if (!states["adj_" + idx]) return;
            for (var i = 0; i < recorder.segments.length; i++) {
                if (recorder.segments[i].index === adj.segIndex) {
                    recorder.segments[i]._userOverride = (adj.action === "activate");
                    applied++;
                    break;
                }
            }
        });

        onSegmentSelectionChanged();

        if (applied > 0) {
            showToast(applied + " toma" + (applied !== 1 ? "s" : "") + " ajustada" + (applied !== 1 ? "s" : ""), "success");
        } else {
            showToast("Sin cambios", "info");
        }
        hideElement("btn-add-supplement-markers");
    }

    function renderTakeGroups(groups) {
        var list = document.getElementById("take-list");
        list.innerHTML = "";

        groups.forEach(function(group) {
            var groupEl = document.createElement("div");
            groupEl.className = "take-group";

            var header = document.createElement("div");
            header.className = "take-group-header";
            header.innerHTML =
                '<span class="take-group-title">' + esc(group.topic) + '</span>' +
                '<span class="take-group-count">' + group.takes.length + ' toma' + (group.takes.length !== 1 ? "s" : "") + '</span>';
            groupEl.appendChild(header);

            var body = document.createElement("div");
            body.className = "take-group-body";

            if (group.description) {
                var desc = document.createElement("div");
                desc.className = "segment-comment";
                desc.style.padding = "4px 8px";
                desc.textContent = group.description;
                body.appendChild(desc);
            }

            if (group.continuityNote) {
                var cont = document.createElement("div");
                cont.className = "take-note";
                cont.style.padding = "2px 8px 4px";
                cont.textContent = "Continuidad: " + group.continuityNote;
                body.appendChild(cont);
            }

            group.takes.forEach(function(take) {
                var takeEl = document.createElement("div");
                takeEl.className = "take-item";
                takeEl.innerHTML =
                    '<span class="take-label">' + esc(take.label) + '</span>' +
                    '<div class="take-content">' +
                        '<div class="take-phrase">IN: ' + esc(take.firstPhrase || "") + '</div>' +
                        '<div class="take-phrase">OUT: ' + esc(take.lastPhrase || "") + '</div>' +
                        (take.variation ? '<div class="take-note">' + esc(take.variation) + '</div>' : '') +
                    '</div>' +
                    '<span class="take-time">' + formatTimeFull(take.inTime) + '<br>' + take.duration.toFixed(1) + 's</span>';

                takeEl.addEventListener("click", function() {
                    navigateToTime(take.inTime);
                });

                body.appendChild(takeEl);
            });

            groupEl.appendChild(body);
            list.appendChild(groupEl);
        });
    }

    // ─── Recording Markers ───────────────────────────────────────

    function placeRecordingMarkers() {
        recStepStart(5);

        csInterface.evalScript("getActiveSequenceInfo()", function(seqRes) {
            var fps = 0;
            try {
                var seqInfo = JSON.parse(seqRes);
                fps = seqInfo.frameRate || 0;
            } catch(e) {}

            recorder.generateSimpleMarkers();
            var markers = recorder.markers.slice();

            // Snap marker times to frame boundaries (IN → floor, OUT → ceil)
            if (fps > 0) {
                for (var mi = 0; mi < markers.length; mi++) {
                    var m = markers[mi];
                    var isOut = (m.name && m.name.indexOf("OUT") !== -1);
                    m.time = isOut
                        ? snapToFrameCeil(m.time, fps)
                        : snapToFrameFloor(m.time, fps);
                    if (m.endTime) m.endTime = m.time + 10;
                }
            }

            var aiMarkers = getAcceptedAIMarkers();
            if (aiMarkers.length > 0) {
                if (fps > 0) {
                    for (var ai = 0; ai < aiMarkers.length; ai++) {
                        var am = aiMarkers[ai];
                        var amIsOut = (am.name && am.name.indexOf("OUT") !== -1);
                        am.time = amIsOut
                            ? snapToFrameCeil(am.time, fps)
                            : snapToFrameFloor(am.time, fps);
                        if (am.endTime) am.endTime = am.time + 10;
                    }
                }
                markers = markers.concat(aiMarkers);
                markers.sort(function(a, b) { return a.time - b.time; });
            }

            if (!markers || markers.length === 0) {
                showToast("No hay marcadores para colocar", "info");
                return;
            }

            if (!fs || !os) {
                showToast("Error: Node.js no disponible", "error");
                return;
            }

            csInterface.evalScript('clearMarkersByPrefix("[RN]")', function() {
                csInterface.evalScript('clearMarkersByPrefix("[PREVIEW]")', function() {
                    _doPlaceMarkers(markers);
                });
            });
        });
    }

    function _doPlaceMarkers(markers) {
        if (!fs || !os) {
            showToast("Error: Node.js no disponible", "error");
            return;
        }

        var tmpFile = path.join(os.tmpdir(), "edupro_markers.json");
        var markerData = markers.map(function(m) {
            return {
                time: m.time,
                endTime: m.endTime,
                name: m.name || "",
                comment: m.comment || "",
                color: m.color !== undefined ? m.color : -1
            };
        });

        try {
            fs.writeFileSync(tmpFile, JSON.stringify(markerData), "utf8");
        } catch(e) {
            showToast("Error al escribir archivo temporal: " + e.message, "error");
            return;
        }

        var safePath = tmpFile.replace(/\\/g, "/");
        csInterface.evalScript('addMarkersFromFile("' + escExtend(safePath) + '")', function(result) {
            try {
                var data = JSON.parse(result);
                if (data.error) {
                    showToast("Error: " + data.error, "error");
                    return;
                }

                showElement("markers-result");
                var activeCount = getActiveSegmentCount();
                var aiCount = getAcceptedAIMarkers().length;
                document.getElementById("markers-result-msg").textContent =
                    data.placed + " marcadores colocados";
                var detailParts = [activeCount + " tomas IN + " + activeCount + " OUT"];
                if (aiCount > 0) detailParts.push(aiCount + " sugerencia" + (aiCount !== 1 ? "s" : "") + " IA (azul)");
                document.getElementById("markers-result-detail").textContent = detailParts.join(" · ");

                state.markersPlaced = true;
                setRecStepHint(5, data.placed + " marcadores");
                recStepEnd(5);
                showRecCutSection();
                showViewsSection();
                openRecStep(6);
                showToast(data.placed + " marcadores colocados — puedes cortar la secuencia", "success");
                refreshSequenceInfo();
            } catch(e) {
                showToast("Error al colocar marcadores", "error");
            }
        });
    }

    // ─── Recording Cuts ─────────────────────────────────────────

    var recCutState = {
        keepBlocks: [],
        removeZones: [],
        cutting: false,
        seqDuration: 0,
        fps: 0
    };

    function snapToFrameFloor(seconds, fps) {
        if (!fps || fps <= 0) return seconds;
        return Math.floor(seconds * fps) / fps;
    }

    function snapToFrameCeil(seconds, fps) {
        if (!fps || fps <= 0) return seconds;
        return Math.ceil(seconds * fps) / fps;
    }

    function buildRecCutZones() {
        var recommended = recorder.getRecommendedSegments();
        if (!recommended || recommended.length === 0) return;

        var fps = recCutState.fps;

        recCutState.keepBlocks = recommended.map(function(seg) {
            return {
                inTime: snapToFrameFloor(seg.inTime, fps),
                outTime: snapToFrameCeil(seg.outTime, fps),
                comment: "Toma " + seg.index + " - " + (seg.firstPhrase || "")
            };
        });

        var zones = [];
        if (recCutState.keepBlocks[0].inTime > 0.1) {
            zones.push({ start: 0, end: recCutState.keepBlocks[0].inTime, label: "Pre-inicio" });
        }
        for (var k = 0; k < recCutState.keepBlocks.length - 1; k++) {
            var gapStart = recCutState.keepBlocks[k].outTime;
            var gapEnd = recCutState.keepBlocks[k + 1].inTime;
            if (gapEnd - gapStart > 0.05) {
                zones.push({ start: gapStart, end: gapEnd, label: "Brecha " + (k + 1) });
            }
        }
        var lastOut = recCutState.keepBlocks[recCutState.keepBlocks.length - 1].outTime;
        if (recCutState.seqDuration > 0 && recCutState.seqDuration - lastOut > 0.1) {
            zones.push({ start: lastOut, end: recCutState.seqDuration, label: "Post-final" });
        }
        recCutState.removeZones = zones;
    }

    function showRecCutSection() {
        csInterface.evalScript("getActiveSequenceInfo()", function(res) {
            try {
                var info = JSON.parse(res);
                recCutState.seqDuration = info.durationSeconds || 0;
                recCutState.fps = info.frameRate || 0;
            } catch(e) {
                recCutState.seqDuration = 0;
                recCutState.fps = 0;
            }

            buildRecCutZones();

            if (recCutState.removeZones.length === 0) {
                hideElement("rec-cut-section");
                return;
            }

            var keepDur = 0, removeDur = 0;
            recCutState.keepBlocks.forEach(function(b) { keepDur += b.outTime - b.inTime; });
            recCutState.removeZones.forEach(function(z) { removeDur += z.end - z.start; });

            document.getElementById("rec-cut-keep-dur").textContent = formatTimeFull(keepDur);
            document.getElementById("rec-cut-keep-detail").textContent = recCutState.keepBlocks.length + " bloque" + (recCutState.keepBlocks.length !== 1 ? "s" : "");
            document.getElementById("rec-cut-remove-dur").textContent = formatTimeFull(removeDur);
            document.getElementById("rec-cut-remove-detail").textContent = recCutState.removeZones.length + " zona" + (recCutState.removeZones.length !== 1 ? "s" : "");

            renderRecCutBlocks();
            showElement("rec-cut-section");
            hideElement("rec-cut-done");
            setRecStepHint(6, recCutState.keepBlocks.length + " mantener / " + recCutState.removeZones.length + " eliminar");
        });
    }

    function renderRecCutBlocks() {
        var list = document.getElementById("rec-cut-blocks");
        list.innerHTML = "";

        var items = [];
        for (var k = 0; k < recCutState.keepBlocks.length; k++) {
            var b = recCutState.keepBlocks[k];
            items.push({ type: "keep", start: b.inTime, end: b.outTime, label: b.comment || ("Bloque " + (k + 1)) });
        }
        for (var r = 0; r < recCutState.removeZones.length; r++) {
            var z = recCutState.removeZones[r];
            items.push({ type: "remove", start: z.start, end: z.end, label: z.label || ("Zona " + (r + 1)) });
        }
        items.sort(function(a, b) { return a.start - b.start; });

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var dur = item.end - item.start;
            var isKeep = item.type === "keep";
            var el = document.createElement("div");
            el.className = "block-item " + item.type;
            el.innerHTML =
                '<span class="block-badge ' + item.type + '">' + (isKeep ? "MANTENER" : "ELIMINAR") + '</span>' +
                '<div class="block-info">' +
                    '<div class="block-label">' + esc(item.label) + '</div>' +
                    '<div class="block-time">' + formatTimeFull(item.start) + ' → ' + formatTimeFull(item.end) + '</div>' +
                '</div>' +
                '<span class="block-duration">' + dur.toFixed(1) + 's</span>';
            el.style.cursor = "pointer";
            (function(startTime) {
                el.addEventListener("click", function() { navigateToTime(startTime); });
            })(item.start);
            list.appendChild(el);
        }
    }

    function executeRecCuts() {
        if (recCutState.cutting) return;
        if (!recCutState.removeZones || recCutState.removeZones.length === 0) {
            showToast("No hay zonas para cortar", "info");
            return;
        }
        recStepStart(6);
        if (!fs || !os || !path) {
            showToast("Error: Node.js no disponible", "error");
            return;
        }

        recCutState.cutting = true;
        var btn = document.getElementById("btn-rec-cut");
        var btnText = document.getElementById("btn-rec-cut-text");
        if (btn) btn.classList.add("btn-disabled");
        showElement("rec-cut-progress");
        setProgress("rec-cut-progress-fill", "rec-cut-progress-text", 10, "Creando backup de la secuencia...");

        csInterface.evalScript("backupSequence()", function(backupRes) {
            var backup;
            try { backup = JSON.parse(backupRes); } catch(e) {
                finishRecCut("Error al parsear backup: respuesta inválida");
                return;
            }
            if (backup.error) {
                finishRecCut("Error en backup: " + backup.error);
                return;
            }

            setProgress("rec-cut-progress-fill", "rec-cut-progress-text", 30, "Backup creado. Escribiendo instrucciones...");

            var cutData = JSON.stringify({
                removeZones: recCutState.removeZones,
                seqName: state.sequenceName || "Secuencia",
                timestamp: new Date().toISOString()
            });

            var tmpPath = path.join(os.tmpdir(), "RecNotes_cuts.json");
            try {
                fs.writeFileSync(tmpPath, cutData, "utf8");
            } catch(e) {
                finishRecCut("Error al escribir archivo temporal: " + e.message);
                return;
            }

            setProgress("rec-cut-progress-fill", "rec-cut-progress-text", 50, "Procesando " + recCutState.removeZones.length + " zonas...");

            var escaped = escExtend(tmpPath);
            csInterface.evalScript('executeCuts("' + escaped + '")', function(cutResult) {
                var result;
                try { result = JSON.parse(cutResult); } catch(e) {
                    finishRecCut("Error al parsear resultado de cortes");
                    return;
                }
                if (result.error) {
                    finishRecCut("Error: " + result.error);
                    return;
                }

                setProgress("rec-cut-progress-fill", "rec-cut-progress-text", 100, "Cortes completados");

                setTimeout(function() {
                    hideElement("rec-cut-progress");
                    recCutState.cutting = false;
                    if (btn) btn.classList.remove("btn-disabled");

                    var stats = result.stats || {};
                    showElement("rec-cut-done");
                    document.getElementById("rec-cut-done-msg").textContent =
                        "Cortes ejecutados — Método: " + (stats.method || "InOut+Extract");
                    document.getElementById("rec-cut-done-detail").textContent =
                        (stats.removed || 0) + " zonas eliminadas" +
                        (stats.errors > 0 ? " | " + stats.errors + " errores" : "");

                    setRecStepHint(6, "Cortes aplicados");
                    recStepEnd(6);
                    updateRecTotalTime();
                    showToast("Cortes ejecutados en la secuencia", "success");
                    refreshSequenceInfo();
                }, 400);
            });
        });
    }

    function finishRecCut(errorMsg) {
        hideElement("rec-cut-progress");
        recCutState.cutting = false;
        var btn = document.getElementById("btn-rec-cut");
        if (btn) btn.classList.remove("btn-disabled");
        if (errorMsg) showToast(errorMsg, "error");
    }

    function restoreRecCutBackup() {
        csInterface.evalScript("restoreBackup()", function(result) {
            try {
                var data = JSON.parse(result);
                if (data.error) {
                    showToast(data.error, "error");
                    return;
                }
                hideElement("rec-cut-done");
                showToast("Backup restaurado. Secuencia original activa.", "success");
                refreshSequenceInfo();
            } catch(e) {
                showToast("Error al restaurar backup", "error");
            }
        });
    }

    // ─── Step 7: View Classification ────────────────────────────

    var viewState = {
        classifications: [],
        videoClips: [],
        ffmpegPath: null
    };

    function showViewsSection() {
        var el = document.getElementById("rec-views-section");
        if (el) el.style.display = "";
        populateVisionModels();
    }

    function populateVisionModels() {
        var sel = document.getElementById("view-vision-model");
        if (!sel || sel.options.length > 0) return;
        var models = aiAnalyzer.getVisionModels();
        for (var i = 0; i < models.length; i++) {
            var opt = document.createElement("option");
            opt.value = models[i].id;
            opt.textContent = models[i].label;
            sel.appendChild(opt);
        }
    }

    function checkFFmpeg(callback) {
        var exec;
        try { exec = require("child_process").exec; } catch(e) {
            callback(null);
            return;
        }
        exec("ffmpeg -version", function(err) {
            if (err) {
                exec("/opt/homebrew/bin/ffmpeg -version", function(err2) {
                    callback(err2 ? null : "/opt/homebrew/bin/ffmpeg");
                });
            } else {
                callback("ffmpeg");
            }
        });
    }

    function getPrimaryVideoSource(clips) {
        if (!clips || clips.length === 0) return null;

        var pathCounts = {};
        var pathInfo = {};
        for (var i = 0; i < clips.length; i++) {
            var p = clips[i].path;
            pathCounts[p] = (pathCounts[p] || 0) + 1;
            if (!pathInfo[p] || clips[i].startSec < pathInfo[p].startSec) {
                pathInfo[p] = clips[i];
            }
        }

        var bestPath = null;
        var bestCount = 0;
        for (var pp in pathCounts) {
            if (pathCounts[pp] > bestCount) {
                bestCount = pathCounts[pp];
                bestPath = pp;
            }
        }

        return bestPath ? { path: bestPath, baseOffset: pathInfo[bestPath].inPointSec || 0 } : null;
    }

    function extractFramesForTake(ffmpeg, videoPath, times, outputDir, takeIdx, callback) {
        var exec;
        try { exec = require("child_process").exec; } catch(e) { callback([]); return; }

        var results = [];
        var pending = times.length;
        if (pending === 0) { callback([]); return; }

        times.forEach(function(t, fi) {
            var outFile = path.join(outputDir, "take" + takeIdx + "_f" + fi + ".jpg");
            var cmd = '"' + ffmpeg + '" -y -ss ' + t.toFixed(3) + ' -i "' + videoPath + '" -frames:v 1 -q:v 3 "' + outFile + '"';
            exec(cmd, { timeout: 15000 }, function(err) {
                if (!err && fs.existsSync(outFile)) {
                    results[fi] = outFile;
                } else {
                    results[fi] = null;
                }
                pending--;
                if (pending === 0) callback(results.filter(function(r) { return r; }));
            });
        });
    }

    function readFramesAsBase64(framePaths) {
        var images = [];
        for (var i = 0; i < framePaths.length; i++) {
            try {
                var buf = fs.readFileSync(framePaths[i]);
                images.push(buf.toString("base64"));
            } catch(e) {}
        }
        return images;
    }

    function startViewClassification() {
        if (!recorder.segments || recorder.segments.length === 0) {
            showToast("No hay tomas detectadas", "error");
            return;
        }

        var activeTakes = [];
        for (var i = 0; i < recorder.segments.length; i++) {
            if (isSegmentActive(recorder.segments[i])) activeTakes.push(recorder.segments[i]);
        }
        if (activeTakes.length === 0) {
            showToast("No hay tomas activas para clasificar", "error");
            return;
        }

        recStepStart(7);
        showElement("view-progress");
        hideElement("view-results");
        setProgress("view-progress-fill", "view-progress-text", 5, "Verificando FFmpeg...");

        checkFFmpeg(function(ffmpegCmd) {
            if (!ffmpegCmd) {
                hideElement("view-progress");
                showToast("FFmpeg no encontrado. Instálalo con: brew install ffmpeg", "error");
                return;
            }
            viewState.ffmpegPath = ffmpegCmd;

            setProgress("view-progress-fill", "view-progress-text", 10, "Obteniendo rutas de video...");
            csInterface.evalScript("getVideoClipPaths()", function(res) {
                try {
                    var data = JSON.parse(res);
                    if (data.error) { showToast(data.error, "error"); hideElement("view-progress"); return; }
                    viewState.videoClips = data.clips || [];
                } catch(e) { showToast("Error al leer clips: " + e.message, "error"); hideElement("view-progress"); return; }

                var primary = getPrimaryVideoSource(viewState.videoClips);
                if (!primary) {
                    showToast("No se encontraron clips de video con ruta de archivo", "error");
                    hideElement("view-progress");
                    return;
                }
                viewState.primarySource = primary;

                var framesDir = path.join(os.tmpdir(), "edupro_frames");
                try { if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir); } catch(e) {}

                setProgress("view-progress-fill", "view-progress-text", 15, "Extrayendo frames de " + path.basename(primary.path) + "...");
                extractAllTakeFrames(ffmpegCmd, activeTakes, primary, framesDir, function(takeFrames) {
                    classifyAllTakes(activeTakes, takeFrames, function() {
                        hideElement("view-progress");
                        showElement("view-results");
                        renderViewResults(activeTakes);
                        populateTrackDropdowns();
                        recStepEnd(7);
                        var camCount = 0, pcCount = 0;
                        for (var c = 0; c < viewState.classifications.length; c++) {
                            if (viewState.classifications[c].view === "CAM") camCount++;
                            else pcCount++;
                        }
                        setRecStepHint(7, camCount + " CAM, " + pcCount + " PC");
                        showToast("Clasificación completa: " + camCount + " CAM, " + pcCount + " PC", "success");
                    });
                });
            });
        });
    }

    function extractAllTakeFrames(ffmpegCmd, takes, primarySource, framesDir, callback) {
        var allFrames = [];
        var idx = 0;
        var videoPath = primarySource.path;
        var baseOffset = primarySource.baseOffset || 0;

        function next() {
            if (idx >= takes.length) { callback(allFrames); return; }
            var take = takes[idx];
            var pct = 15 + Math.round((idx / takes.length) * 35);
            setProgress("view-progress-fill", "view-progress-text", pct, "Extrayendo frames toma " + (idx + 1) + "/" + takes.length + "...");

            var mid = (take.inTime + take.outTime) / 2;
            var frameTimes = [
                baseOffset + take.inTime + 1,
                baseOffset + mid,
                baseOffset + Math.max(take.inTime + 2, take.outTime - 1)
            ];
            for (var ft = 0; ft < frameTimes.length; ft++) {
                if (frameTimes[ft] < 0) frameTimes[ft] = 0;
            }

            extractFramesForTake(ffmpegCmd, videoPath, frameTimes, framesDir, idx, function(frames) {
                allFrames.push(frames);
                idx++;
                next();
            });
        }
        next();
    }

    function classifyAllTakes(takes, takeFrames, callback) {
        viewState.classifications = [];
        var modelSel = document.getElementById("view-vision-model");
        var visionModel = modelSel ? modelSel.value : "moondream:latest";
        var idx = 0;

        function next() {
            if (idx >= takes.length) { callback(); return; }
            var pct = 50 + Math.round((idx / takes.length) * 45);
            setProgress("view-progress-fill", "view-progress-text", pct, "Clasificando toma " + (idx + 1) + "/" + takes.length + "...");

            var frames = takeFrames[idx] || [];
            if (frames.length === 0) {
                viewState.classifications.push({ view: "CAM", confidence: "baja", takeIndex: takes[idx].index });
                idx++;
                next();
                return;
            }

            var images = readFramesAsBase64(frames);
            if (images.length === 0) {
                viewState.classifications.push({ view: "CAM", confidence: "baja", takeIndex: takes[idx].index });
                idx++;
                next();
                return;
            }

            var takeRef = takes[idx];
            aiAnalyzer.classifyView(images, visionModel, function(result) {
                var view = "CAM";
                var confidence = "baja";
                if (result && !result.error) {
                    view = (result.view || "CAM").toUpperCase();
                    if (view !== "CAM" && view !== "PC") view = "CAM";
                    confidence = result.confidence || "media";
                }
                viewState.classifications.push({ view: view, confidence: confidence, takeIndex: takeRef.index });
                idx++;
                next();
            });
        }
        next();
    }

    function renderViewResults(takes) {
        var list = document.getElementById("view-list");
        if (!list) return;
        list.innerHTML = "";

        var camCount = 0, pcCount = 0;
        for (var i = 0; i < viewState.classifications.length; i++) {
            var cls = viewState.classifications[i];
            var take = takes[i];
            if (!take) continue;

            if (cls.view === "CAM") camCount++; else pcCount++;

            var el = document.createElement("div");
            el.className = "view-item";
            el.setAttribute("data-view-idx", i);

            var badgeClass = cls.view === "CAM" ? "view-badge-cam" : "view-badge-pc";
            el.innerHTML =
                '<span class="' + badgeClass + '">' + cls.view + '</span>' +
                '<div class="view-item-info">' +
                    '<div class="view-item-title">Toma ' + take.index + ' — ' + esc(truncate(take.firstPhrase || "", 40)) + '</div>' +
                    '<div class="view-item-detail">' + formatTimeFull(take.inTime) + ' - ' + formatTimeFull(take.outTime) + ' | ' + take.duration.toFixed(1) + 's</div>' +
                '</div>' +
                '<span class="view-confidence">' + cls.confidence + '</span>' +
                '<button class="view-toggle-btn" data-vidx="' + i + '">Cambiar</button>';

            (function(index) {
                el.querySelector(".view-toggle-btn").addEventListener("click", function(e) {
                    e.stopPropagation();
                    var c = viewState.classifications[index];
                    c.view = c.view === "CAM" ? "PC" : "CAM";
                    c.confidence = "manual";
                    renderViewResults(takes);
                });
            })(i);

            list.appendChild(el);
        }

        var summary = document.getElementById("view-result-summary");
        if (summary) summary.textContent = camCount + " CAM / " + pcCount + " PC";
    }

    function populateTrackDropdowns() {
        csInterface.evalScript("getVideoTrackNames()", function(res) {
            try {
                var data = JSON.parse(res);
                if (!data.success || !data.tracks) return;
                var selCam = document.getElementById("view-track-cam");
                var selPc = document.getElementById("view-track-pc");
                if (!selCam || !selPc) return;

                selCam.innerHTML = "";
                selPc.innerHTML = "";
                for (var t = 0; t < data.tracks.length; t++) {
                    var name = data.tracks[t].name;
                    var optC = document.createElement("option");
                    optC.value = name;
                    optC.textContent = name;
                    selCam.appendChild(optC);

                    var optP = document.createElement("option");
                    optP.value = name;
                    optP.textContent = name;
                    selPc.appendChild(optP);
                }
                if (data.tracks.length >= 2) selPc.selectedIndex = 1;
            } catch(e) {}
        });
    }

    function applyViewClassification() {
        if (viewState.classifications.length === 0) {
            showToast("No hay clasificaciones para aplicar", "error");
            return;
        }

        var trackCam = document.getElementById("view-track-cam");
        var trackPc = document.getElementById("view-track-pc");
        var camTrack = trackCam ? trackCam.value : "";
        var pcTrack = trackPc ? trackPc.value : "";

        if (!camTrack || !pcTrack) {
            showToast("Selecciona los tracks para CAM y PC", "error");
            return;
        }

        var activeTakes = [];
        for (var s = 0; s < recorder.segments.length; s++) {
            if (isSegmentActive(recorder.segments[s])) activeTakes.push(recorder.segments[s]);
        }

        for (var i = 0; i < viewState.classifications.length; i++) {
            var cls = viewState.classifications[i];
            var take = activeTakes[i];
            if (!take) continue;
            take._viewTag = cls.view;
        }

        recorder.generateSimpleMarkers();
        var markers = recorder.markers;

        var viewMap = {};
        for (var m = 0; m < markers.length; m++) {
            var mk = markers[m];
            if (mk.name.indexOf("OUT") !== -1) continue;
            if (mk.name.indexOf("[CAM]") !== -1) viewMap[mk.name] = [camTrack];
            else if (mk.name.indexOf("[PC]") !== -1) viewMap[mk.name] = [pcTrack];
        }

        saveViewPreset(viewMap);

        if (state.markersPlaced) {
            var allMarkers = markers.slice();
            var aiMarkers = getAcceptedAIMarkers();
            if (aiMarkers.length > 0) {
                allMarkers = allMarkers.concat(aiMarkers);
                allMarkers.sort(function(a, b) { return a.time - b.time; });
            }
            csInterface.evalScript('clearMarkersByPrefix("[RN]")', function() {
                csInterface.evalScript('clearMarkersByPrefix("[PREVIEW]")', function() {
                    _doPlaceMarkers(allMarkers);
                });
            });
        }

        showElement("view-applied-msg");
        var appliedText = document.getElementById("view-applied-text");
        if (appliedText) appliedText.textContent = "Vistas aplicadas — Preset guardado para Cortes Automáticos";
        showToast("Vistas aplicadas y preset generado", "success");
    }

    function saveViewPreset(viewMap) {
        var VIEW_PRESETS_KEY = "editorpro_view_presets";
        var store;
        try {
            var raw = localStorage.getItem(VIEW_PRESETS_KEY);
            store = raw ? JSON.parse(raw) : null;
        } catch(e) {}
        if (!store || !store.presets) store = { presets: {}, active: "Default" };

        store.presets["Auto (Notas de Grabación)"] = viewMap;
        try {
            localStorage.setItem(VIEW_PRESETS_KEY, JSON.stringify(store));
        } catch(e) {}
    }

    function exportRecordingMarkers() {
        var text = recorder.exportAsText();
        if (!text) {
            showToast("No hay datos para exportar", "info");
            return;
        }
        copyToClipboard(text);
        showToast("Notas copiadas al portapapeles", "success");
    }

    function formatElapsed(ms) {
        var s = Math.floor(ms / 1000);
        if (s < 60) return s + "s";
        var m = Math.floor(s / 60);
        s = s % 60;
        return m + "m " + s + "s";
    }

    // ═══════════════════════════════════════════════════════════════
    // ═══ MOTION-PRO ═══════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════

    function mpInit() {
        mpUpdateServerUI();
        mpCheckServerStatus();
        mpUpdateAnalyzeButton();
        mpBindStepHeaders();

        // Resolve session from active sequence, then load state + render UI
        mpResolveOutputDir(function() {
            mpRenderFullUI();
        });
    }

    function mpBindStepHeaders() {
        document.querySelectorAll(".mp-step-header").forEach(function(hdr) {
            hdr.addEventListener("click", function() {
                var stepNum = hdr.getAttribute("data-mp-step");
                mpToggleStep(stepNum);
            });
        });
    }

    function mpToggleStep(stepNum) {
        var body = document.getElementById("mp-step-body-" + stepNum);
        if (!body) return;
        var isHidden = body.classList.contains("hidden");

        if (isHidden) {
            document.querySelectorAll("[id^='mp-step-body-']").forEach(function(b) {
                b.classList.add("hidden");
            });
            document.querySelectorAll(".mp-step-header .rec-step-arrow").forEach(function(a) {
                a.textContent = "▸";
            });
            body.classList.remove("hidden");
            var arrow = body.previousElementSibling.querySelector(".rec-step-arrow");
            if (arrow) arrow.textContent = "▾";
        } else {
            body.classList.add("hidden");
            var arrow2 = body.previousElementSibling.querySelector(".rec-step-arrow");
            if (arrow2) arrow2.textContent = "▸";
        }
    }

    function mpShowStep(num) {
        var el = document.getElementById(num === 2 ? "mp-proposals-section" : num === 3 ? "mp-control-section" : null);
        if (el) el.style.display = "";
    }

    // ─── Server management ────────────────────────────────────────

    function mpCheckServerStatus() {
        if (!motionPro) return;
        motionPro.checkServer(function(running) {
            mpUpdateServerUI();
        });
    }

    function mpToggleServer() {
        if (motionPro.serverRunning) {
            motionPro.stopServer();
            mpUpdateServerUI();
            showToast("Servidor Motion-Pro detenido", "info");
        } else {
            var extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);
            var btn = document.getElementById("btn-mp-server-toggle");
            if (btn) { btn.textContent = "Iniciando..."; btn.disabled = true; }

            motionPro.startServer(extensionPath, function(err, ok) {
                if (btn) btn.disabled = false;
                if (err) {
                    showToast("Error al iniciar servidor: " + err.message, "error");
                } else {
                    showToast("Servidor Motion-Pro iniciado", "success");
                }
                mpUpdateServerUI();
            });
        }
    }

    function mpUpdateServerUI() {
        var dot = document.getElementById("mp-server-indicator");
        var text = document.getElementById("mp-server-text");
        var btn = document.getElementById("btn-mp-server-toggle");
        var running = motionPro && motionPro.serverRunning;

        if (dot) {
            dot.classList.toggle("mp-dot-on", running);
            dot.classList.toggle("mp-dot-off", !running);
        }
        if (text) text.textContent = running ? "Servidor activo (:" + MotionPro.SERVER_PORT + ")" : "Servidor detenido";
        if (btn) btn.textContent = running ? "Detener" : "Iniciar";
    }

    // ─── Analysis ─────────────────────────────────────────────────

    function mpUpdateAnalyzeButton() {
        var btn = document.getElementById("btn-mp-analyze");
        var warn = document.getElementById("mp-no-transcript");
        var hasTranscript = state.transcript && state.transcript.trim().length > 0;
        if (btn) btn.classList.toggle("btn-disabled", !hasTranscript);
        if (warn) warn.classList.toggle("hidden", hasTranscript);
    }

    function _mpBuildSeqPrefix() {
        var name = state.sequenceName || "";
        if (!name) return "mp";
        // Extract first two parts: "13_2603_curso..." → "13-2603"
        var parts = name.split(/[_\-\s]+/);
        var prefix = "";
        if (parts.length >= 2) {
            prefix = parts[0] + "-" + parts[1];
        } else if (parts.length === 1) {
            prefix = parts[0];
        }
        // Sanitize: only a-z, 0-9, hyphens (Remotion compatible)
        prefix = prefix.replace(/[^a-zA-Z0-9-]/g, "").substring(0, 12);
        return prefix || "mp";
    }

    // ─── Brandfetch Logo API ──────────────────────────────────────

    var _mpBrandfetchKey = "";

    function mpSaveBrandfetchKey() {
        var input = document.getElementById("mp-brandfetch-key");
        var key = input ? input.value.trim() : "";
        if (key) {
            localStorage.setItem("editorpro_brandfetch_key", key);
            _mpBrandfetchKey = key;
            if (input) input.value = "";
            showToast("Brandfetch key guardada", "success");
        } else {
            localStorage.removeItem("editorpro_brandfetch_key");
            _mpBrandfetchKey = "";
            showToast("Brandfetch key eliminada", "info");
        }
        mpUpdateBrandfetchUI();
    }

    function mpLoadBrandfetchKey() {
        _mpBrandfetchKey = localStorage.getItem("editorpro_brandfetch_key") || "";
        mpUpdateBrandfetchUI();
    }

    function mpUpdateBrandfetchUI() {
        var dot = document.getElementById("mp-brandfetch-dot");
        var text = document.getElementById("mp-brandfetch-text");
        var hasKey = _mpBrandfetchKey && _mpBrandfetchKey.length > 3;
        if (dot) {
            dot.classList.toggle("mp-dot-on", hasKey);
            dot.classList.toggle("mp-dot-off", !hasKey);
        }
        if (text) text.textContent = hasKey ? "Logos activos" : "Sin configurar";
    }

    function mpGetBrandfetchKey() {
        return _mpBrandfetchKey || "";
    }

    function _mpGetFeedbackDir() {
        if (!_mpOutputDir) return null;
        var dir = path.join(_mpOutputDir, "feedback");
        try {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            return dir;
        } catch(e) { return null; }
    }

    // ─── Generation Prompts Panel ───────────────────────────────

    function mpToggleGenPromptsPanel() {
        var body = document.getElementById("mp-gen-prompts-body");
        var icon = document.getElementById("mp-gen-prompts-icon");
        if (!body) return;
        var hidden = body.classList.contains("hidden");
        body.classList.toggle("hidden");
        if (icon) icon.textContent = hidden ? "▾" : "▸";
        if (hidden) mpLoadGenPrompts();
    }

    function mpBindGenPromptAccordions() {
        document.querySelectorAll(".mp-gp-item-header").forEach(function(hdr) {
            hdr.addEventListener("click", function() {
                var key = hdr.getAttribute("data-mp-gp");
                var body = document.querySelector('[data-mp-gp-body="' + key + '"]');
                var arrow = hdr.querySelector(".mp-gp-item-arrow");
                if (!body) return;
                var hidden = body.classList.contains("hidden");
                body.classList.toggle("hidden");
                if (arrow) arrow.textContent = hidden ? "▾" : "▸";
            });
        });
    }

    function mpLoadGenPrompts() {
        if (!motionPro || !motionPro.serverRunning) {
            showToast("Inicia el servidor primero para cargar los prompts", "info");
            return;
        }
        motionPro._get("/api/prompts", function(err, data) {
            if (err || !data) {
                showToast("Error al cargar prompts: " + (err ? err.message : "sin datos"), "error");
                return;
            }
            var sysEl = document.getElementById("mp-gp-system");
            var styleEl = document.getElementById("mp-gp-style");
            var designEl = document.getElementById("mp-gp-design");
            var typesEl = document.getElementById("mp-gp-types");
            if (sysEl) sysEl.value = data.system || "";
            if (styleEl) styleEl.value = data.style || "";
            if (designEl) designEl.value = data.design || "";
            if (typesEl) { typesEl.value = data.types || ""; typesEl.readOnly = true; }
        });
    }

    function mpSaveGenPrompts() {
        if (!motionPro || !motionPro.serverRunning) {
            showToast("Inicia el servidor primero", "error");
            return;
        }
        var sysEl = document.getElementById("mp-gp-system");
        var styleEl = document.getElementById("mp-gp-style");
        var designEl = document.getElementById("mp-gp-design");

        var body = {};
        if (sysEl) body.system = sysEl.value;
        if (styleEl) body.style = styleEl.value;
        if (designEl) body.design = designEl.value;

        motionPro._post("/api/prompts", body, function(err, result) {
            if (err || (result && result.error)) {
                showToast("Error al guardar: " + (err ? err.message : result.error), "error");
            } else {
                showToast("Prompts guardados. El servidor recargó las reglas.", "success");
            }
        });
    }

    function mpResetGenPrompts() {
        var extRoot = csInterface.getSystemPath(SystemPath.EXTENSION);
        var originals = [
            { central: "system.md", local: "SYSTEM_PROMPT.md", src: "/Users/danielgutierrez/Downloads/SYSTEM_PROMPT.md" },
            { central: "style-guide.md", local: "STYLE_GUIDE.md", src: "/Users/danielgutierrez/Downloads/STYLE_GUIDE.md" },
            { central: "design-fundamentals.md", local: "DESIGN_FUNDAMENTALS.md", src: "/Users/danielgutierrez/Downloads/DESIGN_FUNDAMENTALS.md" }
        ];
        try {
            var promptsDir = path.join(extRoot, "Prompts", "MotionPro");
            var serverLib = path.join(extRoot, "motion-server", "lib");
            originals.forEach(function(o) {
                if (fs.existsSync(o.src)) {
                    fs.copyFileSync(o.src, path.join(promptsDir, o.central));
                    fs.copyFileSync(o.src, path.join(serverLib, o.local));
                }
            });
            showToast("Prompts restaurados a los originales", "success");
            mpLoadGenPrompts();
        } catch(e) {
            showToast("Error al restaurar: " + e.message, "error");
        }
    }

    function mpMovePlayhead(timeSecs) {
        csInterface.evalScript('movePlayhead(' + parseFloat(timeSecs) + ')', function(res) {
            try {
                var r = JSON.parse(res);
                if (r.error) console.warn("[Motion-Pro] movePlayhead:", r.error);
            } catch(e) {}
        });
    }

    function mpStartAnalysis() {
        if (state.mpAnalyzing) return;
        if (!state.transcript || state.transcript.trim().length === 0) {
            showToast("Carga una transcripción primero", "error");
            return;
        }
        if (!aiAnalyzer.isConfigured()) {
            showToast("Configura un proveedor de IA en Settings", "error");
            return;
        }

        state.mpAnalyzing = true;

        motionPro.proposals = [];
        motionPro.motions = [];
        motionPro.saveState();

        var proposalList = document.getElementById("mp-proposal-list");
        if (proposalList) proposalList.innerHTML = "";
        hideElement("mp-proposals-summary");
        var proposalsSection = document.getElementById("mp-proposals-section");
        if (proposalsSection) proposalsSection.style.display = "none";

        var motionsList = document.getElementById("mp-motions-list");
        if (motionsList) motionsList.innerHTML = "";
        hideElement("mp-motions-summary");
        var controlSection = document.getElementById("mp-control-section");
        if (controlSection) controlSection.style.display = "none";

        showElement("mp-analyze-progress");
        mpSetProgress("mp-analyze", 20, "Analizando transcripción...");

        var timedTranscript = buildTimedTranscript();

        aiAnalyzer.analyzeMotionProposals(timedTranscript, getPromptContext("mp"), function(result) {
            state.mpAnalyzing = false;
            hideElement("mp-analyze-progress");
            refreshMPHeaderProgressVisibility();

            if (result && result.error) {
                showToast("Error en análisis: " + result.error, "error");
                return;
            }

            var proposals = [];
            try {
                var parsed = (typeof result === "string") ? JSON.parse(result) : result;
                var arr = parsed.proposals || parsed.moments || parsed;
                if (!Array.isArray(arr)) arr = [arr];

                var seqPrefix = _mpBuildSeqPrefix();

                for (var i = 0; i < arr.length; i++) {
                    var p = arr[i];
                    var pType = (p.type || p.tipo || "title").toLowerCase();
                    var pId = String(i + 1) + "-" + pType + "-" + seqPrefix;
                    proposals.push({
                        id: pId,
                        startTime: parseFloat(p.startTime || p.timestamp_start || p.start || 0),
                        endTime: parseFloat(p.endTime || p.timestamp_end || p.end || 0),
                        type: pType,
                        description: p.description || p.descripcion || "",
                        priority: p.priority || p.prioridad || "media",
                        selected: true,
                        transcriptSegment: p.transcriptSegment || p.segment || ""
                    });
                }
            } catch(e) {
                showToast("Error al parsear respuesta IA: " + e.message, "error");
                return;
            }

            motionPro.proposals = proposals;
            motionPro.saveState();
            mpShowStep(2);
            mpRenderProposals();
            mpToggleStep("2");

            var hint = document.getElementById("mp-step-hint-1");
            if (hint) hint.textContent = proposals.length + " momentos detectados";
            showToast(proposals.length + " momentos identificados para motions", "success");
        });
    }

    // ─── Proposals rendering ──────────────────────────────────────

    var _mpTypeFilter = null;

    function mpRenderProposals() {
        var list = document.getElementById("mp-proposal-list");
        if (!list) return;
        list.innerHTML = "";

        var proposals = motionPro.proposals;

        // Type counts + filter bar
        if (proposals.length > 0) {
            var typeCounts = {};
            var totalDuration = 0;
            var priorityCounts = { alta: 0, media: 0, baja: 0 };
            for (var t = 0; t < proposals.length; t++) {
                var tp = proposals[t].type || "title";
                typeCounts[tp] = (typeCounts[tp] || 0) + 1;
                totalDuration += (proposals[t].endTime - proposals[t].startTime) || 0;
                var pri = proposals[t].priority || "media";
                if (priorityCounts[pri] !== undefined) priorityCounts[pri]++;
            }

            var filterBar = document.createElement("div");
            filterBar.className = "es2-counts-bar st2-filter-bar mp-filter-bar";

            var typeKeys = Object.keys(MotionPro.TYPES);
            typeKeys.forEach(function(typeKey) {
                if (!typeCounts[typeKey]) return;
                var info = MotionPro.TYPES[typeKey];
                var tag = document.createElement("span");
                tag.className = "st2-filter-tag" + (_mpTypeFilter === typeKey ? " st2-filter-active" : "");
                tag.style.color = info.color;
                tag.style.borderColor = (_mpTypeFilter === typeKey) ? info.color + "66" : "transparent";
                tag.style.cursor = "pointer";
                tag.textContent = typeCounts[typeKey] + " " + info.label;
                (function(type) {
                    tag.addEventListener("click", function(e) {
                        e.stopPropagation();
                        _mpTypeFilter = (_mpTypeFilter === type) ? null : type;
                        mpRenderProposals();
                    });
                })(typeKey);
                filterBar.appendChild(tag);
            });

            if (_mpTypeFilter) {
                var clearTag = document.createElement("span");
                clearTag.className = "st2-filter-tag st2-filter-clear";
                clearTag.textContent = "✕ Todos";
                clearTag.style.cursor = "pointer";
                clearTag.addEventListener("click", function(e) {
                    e.stopPropagation();
                    _mpTypeFilter = null;
                    mpRenderProposals();
                });
                filterBar.appendChild(clearTag);
            }

            list.appendChild(filterBar);

            // Summary line
            var summaryLine = document.createElement("div");
            summaryLine.className = "mp-summary-line";
            summaryLine.innerHTML =
                '<span>' + proposals.length + ' momentos</span>' +
                '<span class="mp-summary-sep">·</span>' +
                '<span>' + Math.round(totalDuration) + 's de motions</span>' +
                '<span class="mp-summary-sep">·</span>' +
                '<span class="mp-priority-high">' + priorityCounts.alta + ' alta</span>' +
                '<span class="mp-priority-med">' + priorityCounts.media + ' media</span>' +
                '<span class="mp-priority-low">' + priorityCounts.baja + ' baja</span>';
            list.appendChild(summaryLine);
        }

        // Filter proposals
        var filtered = proposals;
        if (_mpTypeFilter) {
            filtered = [];
            for (var f = 0; f < proposals.length; f++) {
                if ((proposals[f].type || "title") === _mpTypeFilter) filtered.push(proposals[f]);
            }
        }

        // Render cards
        for (var i = 0; i < filtered.length; i++) {
            var p = filtered[i];
            var origIdx = proposals.indexOf(p);

            var typeInfo = MotionPro.TYPES[p.type] || { label: p.type, color: "#818cf8" };
            var priorityClass = p.priority === "alta" ? "mp-priority-high" : p.priority === "baja" ? "mp-priority-low" : "mp-priority-med";

            var card = document.createElement("div");
            card.className = "mp-proposal-card";
            card.setAttribute("data-mp-idx", origIdx);
            card.innerHTML =
                '<label class="mp-proposal-check">' +
                    '<input type="checkbox" ' + (p.selected ? 'checked' : '') + ' data-mp-idx="' + origIdx + '">' +
                '</label>' +
                '<div class="mp-proposal-info">' +
                    '<div class="mp-proposal-top">' +
                        '<span class="mp-type-badge" style="background:' + typeInfo.color + '22;color:' + typeInfo.color + ';border:1px solid ' + typeInfo.color + '44">' + esc(typeInfo.label) + '</span>' +
                        '<span class="mp-proposal-time">' + formatTimeFull(p.startTime) + ' — ' + formatTimeFull(p.endTime) + '</span>' +
                        '<span class="mp-proposal-dur">' + (p.endTime - p.startTime).toFixed(1) + 's</span>' +
                        '<span class="' + priorityClass + '">' + esc(p.priority) + '</span>' +
                    '</div>' +
                    '<div class="mp-proposal-desc">' + esc(p.description) + '</div>' +
                '</div>';

            var cb = card.querySelector("input[type=checkbox]");
            (function(idx, startTime) {
                cb.addEventListener("change", function() {
                    motionPro.proposals[idx].selected = this.checked;
                    mpUpdateSelectionCount();
                    motionPro.saveState();
                });
                var infoEl = card.querySelector(".mp-proposal-info");
                if (infoEl) {
                    infoEl.style.cursor = "pointer";
                    infoEl.addEventListener("click", function() {
                        document.querySelectorAll(".mp-proposal-card.mp-card-active").forEach(function(c) {
                            c.classList.remove("mp-card-active");
                        });
                        infoEl.closest(".mp-proposal-card").classList.add("mp-card-active");
                        mpMovePlayhead(startTime);
                    });
                }
            })(origIdx, p.startTime);

            list.appendChild(card);
        }

        showElement("mp-proposals-summary");
        var countEl = document.getElementById("mp-proposal-count");
        if (countEl) countEl.textContent = proposals.length;
        mpUpdateSelectionCount();
    }

    function mpUpdateSelectionCount() {
        var count = 0;
        for (var i = 0; i < motionPro.proposals.length; i++) {
            if (motionPro.proposals[i].selected) count++;
        }
        var el = document.getElementById("mp-selected-count");
        if (el) el.textContent = count;
        var btn = document.getElementById("btn-mp-generate");
        if (btn) btn.classList.toggle("btn-disabled", count === 0);
    }

    function mpToggleSelectAll() {
        var proposals = motionPro.proposals;
        var allSelected = true;
        for (var i = 0; i < proposals.length; i++) {
            if (!proposals[i].selected) { allSelected = false; break; }
        }
        var newVal = !allSelected;
        for (var j = 0; j < proposals.length; j++) {
            proposals[j].selected = newVal;
        }
        motionPro.saveState();
        mpRenderProposals();
    }

    // ─── Generation pipeline ──────────────────────────────────────

    var _mpOutputDir = "";
    var _mpSessionName = "";

    function _mpSanitizeName(name) {
        return (name || "unknown").replace(/[^a-zA-Z0-9_-]/g, "-").substring(0, 60);
    }

    function mpResolveOutputDir(callback) {
        csInterface.evalScript("getActiveSequenceInfo()", function(res) {
            try {
                var info = JSON.parse(res);
                if (info.projectPath && info.name) {
                    var projDir = path.dirname(info.projectPath);
                    var mpRoot = path.join(projDir, "Motion-Pro");
                    var sessionName = _mpSanitizeName(info.name);
                    var sessionDir = path.join(mpRoot, sessionName);

                    if (!fs.existsSync(sessionDir)) {
                        fs.mkdirSync(sessionDir, { recursive: true });
                    }

                    _mpOutputDir = sessionDir;
                    _mpSessionName = sessionName;

                    var sessionLabel = document.getElementById("mp-session-name");
                    if (sessionLabel) sessionLabel.textContent = info.name || sessionName;

                    // Switch session in motionPro if sequence changed (not during generation)
                    if (!state.mpGenerating && !state.mpAnalyzing) {
                        if (motionPro.switchSession(sessionName)) {
                            mpRenderFullUI();
                        }
                    }

                    callback(sessionDir);
                    return;
                }
            } catch(e) {}
            _mpOutputDir = "";
            callback("");
        });
    }

    function mpSwitchToSequence() {
        mpResolveOutputDir(function(dir) {
            if (dir) {
                mpRenderFullUI();
            }
        });
    }

    function mpRenderFullUI() {
        // Don't touch UI during active generation/analysis
        if (state.mpGenerating || state.mpAnalyzing) return;

        mpUpdateAnalyzeButton();
        if (motionPro.proposals.length > 0) {
            mpShowStep(2);
            mpRenderProposals();
        } else {
            var proposalsSection = document.getElementById("mp-proposals-section");
            if (proposalsSection) proposalsSection.style.display = "none";
        }
        if (motionPro.motions.length > 0) {
            mpShowStep(3);
            mpRenderControlPanel();
        } else {
            var controlSection = document.getElementById("mp-control-section");
            if (controlSection) controlSection.style.display = "none";
        }
    }

    function mpStartGeneration() {
        if (state.mpGenerating) return;
        if (!motionPro.serverRunning) {
            showToast("Inicia el servidor Motion-Pro primero", "error");
            return;
        }

        var selected = [];
        for (var i = 0; i < motionPro.proposals.length; i++) {
            if (motionPro.proposals[i].selected) selected.push(motionPro.proposals[i]);
        }
        if (selected.length === 0) {
            showToast("Selecciona al menos una propuesta", "error");
            return;
        }

        state.mpGenerating = true;
        state.mpGenerateCancelRequested = false;
        showElement("mp-generate-progress");
        mpSetProgress("mp-generate", 5, "Preparando carpeta del proyecto...");

        mpResolveOutputDir(function(outputDir) {
            if (outputDir) {
                showToast("Archivos en: " + outputDir, "info");
            }
            _runGenerationPipeline(selected, outputDir);
        });
    }

    function mpCancelGeneration() {
        if (!state.mpGenerating) return;
        state.mpGenerateCancelRequested = true;
        showToast("Deteniendo… termina el clip en curso y se cancela el resto.", "info");
        var txt = document.getElementById("mp-generate-progress-text");
        if (txt) txt.textContent = "Deteniendo después del clip actual…";
    }

    function _runGenerationPipeline(selected, outputDir) {
        var aiConfig = {
            provider: state.settings.aiProvider,
            model: state.settings.aiModel,
            apiKey: aiAnalyzer.getActiveKey(),
            brandfetchKey: mpGetBrandfetchKey()
        };

        var total = selected.length;
        var done = 0;
        var errors = [];

        mpShowStep(3);

        function processNext() {
            if (state.mpGenerateCancelRequested) {
                state.mpGenerateCancelRequested = false;
                state.mpGenerating = false;
                hideElement("mp-generate-progress");
                refreshMPHeaderProgressVisibility();
                motionPro.saveState();
                mpRenderControlPanel();

                var hint = document.getElementById("mp-step-hint-2");
                if (hint) hint.textContent = done + "/" + total + " generados (detenido)";

                showToast("Generación detenida: " + done + " de " + total + " completados.", "info");
                return;
            }

            if (done >= total) {
                state.mpGenerateCancelRequested = false;
                state.mpGenerating = false;
                hideElement("mp-generate-progress");
                refreshMPHeaderProgressVisibility();
                motionPro.saveState();
                mpRenderControlPanel();

                var hint = document.getElementById("mp-step-hint-2");
                if (hint) hint.textContent = (total - errors.length) + "/" + total + " generados";

                if (errors.length > 0) {
                    showToast(errors.length + " errores, " + (total - errors.length) + " generados", "error");
                } else {
                    showToast(total + " motions generados y colocados en timeline", "success");
                }
                return;
            }

            var proposal = selected[done];
            var pct = Math.round(((done + 0.3) / total) * 100);
            mpSetProgress("mp-generate", pct, "Generando " + (done + 1) + "/" + total + ": " + proposal.type + "...");

            var segment = proposal.transcriptSegment || mpExtractSegment(proposal.startTime, proposal.endTime);

            motionPro.generateMotion(proposal, segment, aiConfig, function(err, result) {
                done++;

                if (err) {
                    errors.push({ id: proposal.id, error: err.message });
                    console.warn("[Motion-Pro] Generation error:", err.message);
                    mpSetProgress("mp-generate", Math.round((done / total) * 100), "Error en " + proposal.id + " — continuando...");
                    processNext();
                } else {
                    mpSetProgress("mp-generate", Math.round((done / total) * 100), "Colocando " + done + "/" + total + " en timeline...");
                    mpPlaceSingleInTimeline(result.motionId, function() {
                        motionPro.saveState();
                        mpRenderControlPanel();
                        processNext();
                    });
                }
            }, outputDir);
        }

        processNext();
    }

    function mpExtractSegment(startTime, endTime) {
        if (!state.segments || state.segments.length === 0) return state.transcript || "";
        var parts = [];
        for (var i = 0; i < state.segments.length; i++) {
            var seg = state.segments[i];
            var segStart = parseFloat(seg.startTime) || 0;
            var segEnd = parseFloat(seg.endTime) || 0;
            if (segEnd > startTime && segStart < endTime) {
                parts.push("[" + segStart.toFixed(1) + "s] " + (seg.text || ""));
            }
        }
        return parts.length > 0 ? parts.join("\n") : state.transcript || "";
    }

    // ─── Place in timeline ────────────────────────────────────────

    function mpNormalizeMediaPath(p) {
        if (!p || typeof p !== "string") return p;
        var s = p.replace(/^file:\/\//i, "");
        if (s.indexOf("%") !== -1) {
            try { s = decodeURIComponent(s); } catch(e) {}
        }
        try {
            if (path) s = path.normalize(s);
        } catch(e) {}
        return s;
    }

    function mpPlaceSingleInTimeline(motionId, callback) {
        var motion = motionPro._findMotion(motionId);
        if (!motion) { if (callback) callback(); return; }
        var v = motionPro.getActiveVersion(motionId);
        if (!v || !v.mp4Path) { if (callback) callback(); return; }

        var mpStart = Math.max(0, motion.startTime - MP_ANTICIPATION_SECS);
        var mpDuration = motion.endTime - mpStart;
        var mediaPath = mpNormalizeMediaPath(v.mp4Path);

        var payload = {
            clips: [{
                mp4Path: mediaPath,
                startTimeSecs: mpStart,
                durationSecs: mpDuration,
                clipName: "MP: " + motion.id + "-v" + v.version
            }]
        };

        var tmpPath = _writeTempJson(payload, "mp_place");
        if (!tmpPath) { if (callback) callback(); return; }

        csInterface.evalScript('importAndPlaceMotions("' + tmpPath.replace(/\\/g, "\\\\") + '")', function(res) {
            if (res === undefined || res === null || (typeof res === "string" && res.trim() === "")) {
                console.warn("[Motion-Pro] Place: evalScript returned empty");
                showToast("Motion-Pro: Premiere no respondió al colocar el clip. Activa la secuencia correcta y recarga el panel (Cmd+R en el panel).", "error");
                if (callback) callback();
                return;
            }
            try {
                var result = typeof res === "string" ? JSON.parse(res) : res;
                if (result.error) {
                    console.warn("[Motion-Pro] Place error:", result.error);
                    showToast("Motion-Pro: no se colocó en timeline — " + result.error, "error");
                } else {
                    var errList = result.errors && result.errors.length ? result.errors.join("; ") : "";
                    var ins = result.inserted;
                    var okInsert = errList ? false : (typeof ins === "number" ? ins >= 1 : true);
                    if (!okInsert) {
                        var msg = errList || (typeof ins === "number" && ins < 1 ? "Ningún clip insertado (¿archivo no visible para Premiere?)" : "Colocación incompleta");
                        console.warn("[Motion-Pro] Place failed:", msg, result);
                        showToast("Motion-Pro: " + msg, "error");
                    } else {
                        motion.placedInTimeline = true;
                        motion.baseTrackIndex = result.trackIndex != null ? result.trackIndex : -1;
                        // Lleva el playhead al inicio del motion (si no, parece “vacío” al estar el clip más adelante o arriba del todo en pistas)
                        mpMovePlayhead(mpStart);
                        var vn = result.videoTrackNumber;
                        if (typeof vn === "number" && vn > 0) {
                            console.log("[Motion-Pro] Clip en pista de video V" + vn + " (~" + Math.round(mpStart) + "s)");
                        }
                    }
                }
            } catch(e) {
                console.warn("[Motion-Pro] Place parse error:", e.message, res);
                showToast("Motion-Pro: respuesta inválida al colocar (¿ExtendScript?). " + e.message, "error");
            }
            if (callback) callback();
        });
    }

    function mpReplaceInTimeline(motionId, version) {
        var motion = motionPro._findMotion(motionId);
        if (!motion) return;
        var v = version;

        var payload = {
            mp4Path: v.mp4Path,
            startTimeSecs: Math.max(0, motion.startTime - MP_ANTICIPATION_SECS),
            oldTrackIndex: motion.baseTrackIndex,
            newTrackIndex: motion.baseTrackIndex + (v.version - 1),
            clipName: "MP: " + motionId + "-v" + v.version,
            oldClipPattern: "MP: " + motionId
        };

        var tmpPath = _writeTempJson(payload, "mp_replace");
        if (!tmpPath) return;

        csInterface.evalScript('replaceMotionOnTrack("' + tmpPath.replace(/\\/g, "\\\\") + '")', function(res) {
            try {
                var result = JSON.parse(res);
                if (result.error) {
                    showToast("Error al reemplazar: " + result.error, "error");
                } else {
                    showToast("Clip actualizado a v" + v.version, "success");
                    motionPro.saveState();
                    mpRenderControlPanel();
                }
            } catch(e) {
                showToast("Error: " + e.message, "error");
            }
        });
    }

    function _writeTempJson(data, prefix) {
        try {
            var tmpDir = os ? os.tmpdir() : "/tmp";
            var filePath = path.join(tmpDir, (prefix || "mp") + "_" + Date.now() + ".json");
            fs.writeFileSync(filePath, JSON.stringify(data), "utf8");
            return filePath;
        } catch(e) {
            console.error("[Motion-Pro] Write temp JSON error:", e.message);
            return null;
        }
    }

    // ─── Control Panel rendering ──────────────────────────────────

    function _mpAddRefImage(preview, src, title) {
        var wrap = document.createElement("span");
        wrap.className = "mp-ref-wrap";
        var img = document.createElement("img");
        img.src = src;
        img.className = "mp-ref-thumb";
        img.title = title || "ref";
        var rm = document.createElement("span");
        rm.className = "mp-ref-remove";
        rm.textContent = "✕";
        rm.addEventListener("click", function() { wrap.remove(); });
        wrap.appendChild(img);
        wrap.appendChild(rm);
        preview.appendChild(wrap);
    }

    function mpRenderControlPanel() {
        var list = document.getElementById("mp-motions-list");
        if (!list) return;
        list.innerHTML = "";

        // Do not clear mpGenerating here — this runs after each motion during batch generation
        // and would hide the progress bar and confuse state until the pipeline finishes.

        var motions = motionPro.motions;
        showElement("mp-motions-summary");
        var countEl = document.getElementById("mp-motions-count");
        if (countEl) countEl.textContent = motions.length;

        for (var i = 0; i < motions.length; i++) {
            var m = motions[i];
            var activeV = motionPro.getActiveVersion(m.id);
            var typeInfo = MotionPro.TYPES[m.type] || { label: m.type, color: "#818cf8" };

            var card = document.createElement("div");
            card.className = "mp-motion-card";
            card.setAttribute("data-motion-id", m.id);

            var statusBadge = activeV ? (
                activeV.status === "placed" || m.placedInTimeline ?
                    '<span class="mp-status-badge mp-status-placed">En timeline</span>' :
                activeV.status === "rendered" ?
                    '<span class="mp-status-badge mp-status-rendered">Renderizado</span>' :
                activeV.status === "error" ?
                    '<span class="mp-status-badge mp-status-error">Error</span>' :
                    '<span class="mp-status-badge mp-status-generating">Generando...</span>'
            ) : '';

            var versionOptions = '';
            for (var v = 0; v < m.versions.length; v++) {
                var ver = m.versions[v];
                versionOptions += '<option value="' + ver.version + '"' +
                    (ver.version === m.activeVersion ? ' selected' : '') + '>v' + ver.version +
                    (ver.feedback ? ' (feedback)' : '') + '</option>';
            }

            card.innerHTML =
                '<div class="mp-motion-header mp-clickable-header">' +
                    '<span class="mp-type-badge" style="background:' + typeInfo.color + '22;color:' + typeInfo.color + ';border:1px solid ' + typeInfo.color + '44">' + esc(typeInfo.label) + '</span>' +
                    '<span class="mp-motion-time">' + formatTimeFull(m.startTime) + ' — ' + formatTimeFull(m.endTime) + '</span>' +
                    statusBadge +
                '</div>' +
                '<div class="mp-motion-desc">' + esc(m.description) + '</div>' +
                '<div class="mp-motion-controls">' +
                    '<div class="mp-version-row">' +
                        '<label class="mp-version-label">Versión:</label>' +
                        '<select class="mp-version-select select-input" data-motion-id="' + m.id + '">' + versionOptions + '</select>' +
                    '</div>' +
                    '<div class="mp-action-row">' +
                        '<button class="btn btn-sm btn-ghost mp-btn-studio" data-motion-id="' + m.id + '" title="Abrir en Remotion Studio">🖥 Remotion</button>' +
                        '<button class="btn btn-sm btn-ghost mp-btn-regen" data-motion-id="' + m.id + '" title="Regenerar del todo">🔄 Regenerar</button>' +
                    '</div>' +
                    '<div class="mp-regen-progress hidden" data-motion-id="' + m.id + '">' +
                        '<div class="progress-track"><div class="progress-fill mp-regen-fill" style="width:0%"></div></div>' +
                        '<span class="progress-text mp-regen-text">Regenerando...</span>' +
                    '</div>' +
                    '<div class="mp-feedback-row">' +
                        '<textarea class="mp-feedback-input" data-motion-id="' + m.id + '" placeholder="Feedback: ej. Hazlo más sutil, cambia colores..." rows="2"></textarea>' +
                        '<div class="mp-feedback-actions">' +
                            '<button class="btn btn-sm btn-ghost mp-btn-ref-img" data-motion-id="' + m.id + '" title="Adjuntar imagen">📎 Imagen</button>' +
                            '<button class="btn btn-sm btn-ghost mp-btn-paste-img" data-motion-id="' + m.id + '" title="Pegar imagen del clipboard">📋 Pegar</button>' +
                            '<button class="btn btn-sm btn-ghost mp-btn-still" data-motion-id="' + m.id + '" title="Capturar frame actual de Premiere">📷 Still</button>' +
                            '<button class="btn btn-sm btn-success mp-btn-feedback" data-motion-id="' + m.id + '">Enviar</button>' +
                        '</div>' +
                        '<div class="mp-ref-preview" data-motion-id="' + m.id + '"></div>' +
                        '<div class="mp-feedback-progress hidden" data-motion-id="' + m.id + '">' +
                            '<div class="progress-track"><div class="progress-fill mp-fb-fill" style="width:0%"></div></div>' +
                            '<span class="progress-text mp-fb-text">Procesando feedback...</span>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            list.appendChild(card);

            (function(motionId, startTime) {
                // Click header to navigate
                var header = card.querySelector(".mp-clickable-header");
                if (header) {
                    header.style.cursor = "pointer";
                    header.addEventListener("click", function() { mpMovePlayhead(startTime); });
                }

                // Version dropdown
                var sel = card.querySelector(".mp-version-select");
                if (sel) sel.addEventListener("change", function() {
                    var newVer = parseInt(this.value);
                    motionPro.setActiveVersion(motionId, newVer);
                    var v = motionPro.getActiveVersion(motionId);
                    if (v && v.mp4Path) mpReplaceInTimeline(motionId, v);
                    motionPro.saveState();
                    mpRenderControlPanel();
                });

                // Remotion Studio
                var studioBtn = card.querySelector(".mp-btn-studio");
                if (studioBtn) studioBtn.addEventListener("click", function() {
                    var av = motionPro.getActiveVersion(motionId);
                    if (!av) return;
                    motionPro.startStudio(function(err) {
                        if (err) console.warn("[Motion-Pro] Studio error:", err.message);
                        motionPro.getStudioUrl(av.compositionId, function(err2, url) {
                            if (url) {
                                try { require("child_process").exec('open "' + url + '"'); } catch(e) {}
                                showToast("Abriendo Remotion Studio...", "info");
                            }
                        });
                    }, _mpOutputDir);
                });

                // Regenerate
                var regenBtn = card.querySelector(".mp-btn-regen");
                var regenProgress = card.querySelector('.mp-regen-progress[data-motion-id="' + motionId + '"]');
                if (regenBtn) regenBtn.addEventListener("click", function() {
                    if (!motionPro.serverRunning) { showToast("Inicia el servidor primero", "error"); return; }
                    if (state.mpGenerating) return;
                    state.mpGenerating = true;
                    regenBtn.disabled = true;
                    regenBtn.textContent = "Regenerando...";
                    if (regenProgress) {
                        regenProgress.classList.remove("hidden");
                        var rf = regenProgress.querySelector(".mp-regen-fill");
                        if (rf) rf.style.width = "40%";
                    }

                    var mot = motionPro._findMotion(motionId);
                    var segment = mot ? mpExtractSegment(mot.startTime, mot.endTime) : "";
                    var aiConfig = { provider: state.settings.aiProvider, model: state.settings.aiModel, apiKey: aiAnalyzer.getActiveKey() };

                    motionPro.regenerateFull(motionId, segment, aiConfig, function(err, result) {
                        state.mpGenerating = false;
                        if (err) {
                            showToast("Error al regenerar: " + err.message, "error");
                        } else {
                            showToast("Motion regenerado (v" + result.version + ")", "success");
                            if (result.mp4Path) {
                                var v = motionPro.getActiveVersion(motionId);
                                if (v) mpReplaceInTimeline(motionId, v);
                            }
                        }
                        motionPro.saveState();
                        mpRenderControlPanel();
                    }, _mpOutputDir || undefined);
                });

                // Helper: save base64 image to feedback dir
                function _saveImgToFeedback(b64Data, suffix) {
                    var fbDir = _mpGetFeedbackDir();
                    if (!fbDir || !fs) return "";
                    try {
                        var ts = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
                        var name = motionId + "_" + suffix + "_" + ts + ".png";
                        var filePath = path.join(fbDir, name);
                        var raw = b64Data.replace(/^data:image\/\w+;base64,/, "");
                        fs.writeFileSync(filePath, Buffer.from(raw, "base64"));
                        return name;
                    } catch(e) { return ""; }
                }

                // Image file picker
                var refBtn = card.querySelector(".mp-btn-ref-img");
                var preview = card.querySelector('.mp-ref-preview[data-motion-id="' + motionId + '"]');
                if (refBtn) refBtn.addEventListener("click", function() {
                    var input = document.createElement("input");
                    input.type = "file"; input.accept = "image/*";
                    input.addEventListener("change", function() {
                        if (!input.files || !input.files[0]) return;
                        var reader = new FileReader();
                        reader.onload = function(e) {
                            var saved = _saveImgToFeedback(e.target.result, "ref");
                            _mpAddRefImage(preview, e.target.result, saved || input.files[0].name);
                        };
                        reader.readAsDataURL(input.files[0]);
                    });
                    input.click();
                });

                // Paste from clipboard
                var pasteBtn = card.querySelector(".mp-btn-paste-img");
                if (pasteBtn) pasteBtn.addEventListener("click", function() {
                    if (!navigator.clipboard || !navigator.clipboard.read) {
                        showToast("Clipboard API no disponible", "info");
                        return;
                    }
                    navigator.clipboard.read().then(function(items) {
                        for (var ci = 0; ci < items.length; ci++) {
                            var types = items[ci].types;
                            for (var ti = 0; ti < types.length; ti++) {
                                if (types[ti].indexOf("image") === 0) {
                                    items[ci].getType(types[ti]).then(function(blob) {
                                        var reader = new FileReader();
                                        reader.onload = function(e) {
                                            var saved = _saveImgToFeedback(e.target.result, "paste");
                                            _mpAddRefImage(preview, e.target.result, saved || "clipboard");
                                        };
                                        reader.readAsDataURL(blob);
                                    });
                                    return;
                                }
                            }
                        }
                        showToast("No hay imagen en el clipboard", "info");
                    }).catch(function() { showToast("No se pudo leer el clipboard", "error"); });
                });

                // Still from Premiere (export current frame)
                var stillBtn = card.querySelector(".mp-btn-still");
                if (stillBtn) stillBtn.addEventListener("click", function() {
                    stillBtn.disabled = true;
                    stillBtn.textContent = "Capturando...";
                    csInterface.evalScript("exportCurrentFrame()", function(res) {
                        stillBtn.disabled = false;
                        stillBtn.textContent = "📷 Still";
                        try {
                            var r = JSON.parse(res);
                            if (r.path && fs) {
                                // Copy to feedback folder for persistence
                                var feedbackDir = _mpGetFeedbackDir();
                                var savedPath = "";
                                if (feedbackDir) {
                                    var timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
                                    var stillName = motionId + "_still_" + timestamp + ".png";
                                    savedPath = path.join(feedbackDir, stillName);
                                    try { fs.copyFileSync(r.path, savedPath); } catch(ec) { savedPath = ""; }
                                }

                                var imgData = fs.readFileSync(savedPath || r.path);
                                var b64 = "data:image/png;base64," + imgData.toString("base64");
                                _mpAddRefImage(preview, b64, savedPath ? path.basename(savedPath) : "premiere-still");
                                showToast("Still guardado" + (savedPath ? " en feedback/" : ""), "success");
                            } else if (r.error) {
                                showToast("Error: " + r.error, "error");
                            }
                        } catch(e) { showToast("Error al capturar still", "error"); }
                    });
                });

                // Feedback button
                var fbBtn = card.querySelector(".mp-btn-feedback");
                var textarea = card.querySelector(".mp-feedback-input");
                var fbProgress = card.querySelector('.mp-feedback-progress[data-motion-id="' + motionId + '"]');

                if (fbBtn) fbBtn.addEventListener("click", function() {
                    if (!motionPro.serverRunning) { showToast("Inicia el servidor primero", "error"); return; }
                    var feedback = textarea ? textarea.value.trim() : "";
                    if (!feedback) { showToast("Escribe feedback primero", "info"); return; }
                    if (state.mpGenerating) { showToast("Espera a que termine el proceso actual", "info"); return; }
                    state.mpGenerating = true;

                    fbBtn.disabled = true;
                    fbBtn.textContent = "Procesando...";
                    if (textarea) textarea.disabled = true;
                    if (fbProgress) {
                        fbProgress.classList.remove("hidden");
                        var fill = fbProgress.querySelector(".mp-fb-fill");
                        var txt = fbProgress.querySelector(".mp-fb-text");
                        if (fill) fill.style.width = "30%";
                        if (txt) txt.textContent = "Enviando feedback al LLM...";
                    }

                    var aiConfig = { provider: state.settings.aiProvider, model: state.settings.aiModel, apiKey: aiAnalyzer.getActiveKey() };

                    motionPro.regenerateWithFeedback(motionId, feedback, aiConfig, function(err, result) {
                        state.mpGenerating = false;
                        if (err) {
                            showToast("Error con feedback: " + err.message, "error");
                        } else {
                            showToast("Versión " + result.version + " creada con feedback", "success");
                            if (result.mp4Path) {
                                var v = motionPro.getActiveVersion(motionId);
                                if (v) mpReplaceInTimeline(motionId, v);
                            }
                        }
                        motionPro.saveState();
                        mpRenderControlPanel();
                    }, _mpOutputDir || undefined);
                });
            })(m.id, m.startTime);
        }
    }

    function mpSetProgress(prefix, pct, text) {
        var fill = document.getElementById(prefix + "-progress-fill");
        var txt = document.getElementById(prefix + "-progress-text");
        if (fill) fill.style.width = pct + "%";
        if (txt) txt.textContent = text || "";
        setProgress("mp-progress-header-fill", "mp-progress-header-text", pct, text || "");
        refreshMPHeaderProgressVisibility();
    }

    function refreshMPHeaderProgressVisibility() {
        var analyzeBar = document.getElementById("mp-analyze-progress");
        var generateBar = document.getElementById("mp-generate-progress");
        var analyzeActive = analyzeBar && !analyzeBar.classList.contains("hidden");
        var generateActive = generateBar && !generateBar.classList.contains("hidden");
        var isActive = analyzeActive || generateActive;

        if (!isActive) {
            hideElement("mp-progress-header");
            return;
        }
        var mpBody = document.getElementById("motionpro-body");
        var collapsed = mpBody && mpBody.classList.contains("hidden");
        var header = document.getElementById("mp-progress-header");
        if (header) header.classList.toggle("hidden", !collapsed);
    }

    // ─── Start ───────────────────────────────────────────────────
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

})();
