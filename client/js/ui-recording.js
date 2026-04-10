/**
 * Editor-Pro — Recording Notes UI Module
 * Extracted from main.js for organizational clarity.
 * All behavior is identical to the original.
 */
(function(global) {
    "use strict";

    var EP = global.EditorProUI = global.EditorProUI || {};

    // ─── Shared references (captured at init time, not load time) ─
    var state, csInterface, fs, path, os, aiAnalyzer, stt, recorder;
    var on, clearContainer, safeCallback, showToast, showElement, hideElement;
    var disableBtn, enableBtn, esc, escAttr, escExtend, setProgress;
    var checkAIReady, expandSection, formatTime, formatTimeFull, navigateToTime;
    var refreshSequenceInfo, buildTimedTranscript, copyToClipboard;
    var getPromptContext, togglePromptEditorById, savePromptById, resetPromptById;
    var normalizeSupertextNewlines, normalizeSt2Fields, escSupertextHtml;
    var secsToSRTTime, pad2, pad3, truncate, formatFileSize;
    var refreshAllHeaderProgress, updateAIStatus, showInfoModal, refreshProviderUI;
    var parseTextClipsFromXML, sttResultToSRT, parseSRT, srtTimeToSeconds;
    var loadTranscriptText, onTranscriptChange;
    var readTranscriptFromProjectFile, readCaptionsFromProjectFile;
    var srtSegmentsToSttResult, renderTranscriptFromSegments, bindCollapsibles;
    var MP_ANTICIPATION_SECS;
    var findTranscriptFiles, showTranscriptExportInstructions;
    var getTakeAnalysisPromptContext, toggleSettings;

    function _initRefs() {
        state       = global._epState;
        csInterface = global._epCSInterface;
        fs          = global._epFs;
        path        = global._epPath;
        os          = global._epOs;
        aiAnalyzer   = global._epAiAnalyzer;
        stt          = global._epStt;
        recorder     = global._epRecorder;

        on                       = global._epOn;
        clearContainer           = global._epClearContainer;
        safeCallback             = global._epSafeCallback;
        showToast                = global._epShowToast;
        showElement              = global._epShowElement;
        hideElement              = global._epHideElement;
        disableBtn               = global._epDisableBtn;
        enableBtn                = global._epEnableBtn;
        esc                      = global._epEsc;
        escAttr                  = global._epEscAttr;
        escExtend                = global._epEscExtend;
        setProgress              = global._epSetProgress;
        checkAIReady             = global._epCheckAIReady;
        expandSection            = global._epExpandSection;
        formatTime               = global._epFormatTime;
        formatTimeFull           = global._epFormatTimeFull;
        navigateToTime           = global._epNavigateToTime;
        refreshSequenceInfo      = global._epRefreshSequenceInfo;
        buildTimedTranscript     = global._epBuildTimedTranscript;
        copyToClipboard          = global._epCopyToClipboard;
        getPromptContext         = global._epGetPromptContext;
        togglePromptEditorById   = global._epTogglePromptEditorById;
        savePromptById           = global._epSavePromptById;
        resetPromptById          = global._epResetPromptById;
        normalizeSupertextNewlines = global._epNormalizeSupertextNewlines;
        normalizeSt2Fields       = global._epNormalizeSt2Fields;
        escSupertextHtml         = global._epEscSupertextHtml;
        secsToSRTTime            = global._epSecsToSRTTime;
        pad2                     = global._epPad2;
        pad3                     = global._epPad3;
        truncate                 = global._epTruncate;
        formatFileSize           = global._epFormatFileSize;
        refreshAllHeaderProgress = global._epRefreshAllHeaderProgress;
        updateAIStatus           = global._epUpdateAIStatus;
        showInfoModal            = global._epShowInfoModal;
        refreshProviderUI        = global._epRefreshProviderUI;
        parseTextClipsFromXML    = global._epParseTextClipsFromXML;
        sttResultToSRT           = global._epSttResultToSRT;
        parseSRT                 = global._epParseSRT;
        srtTimeToSeconds         = global._epSrtTimeToSeconds;
        loadTranscriptText       = global._epLoadTranscriptText;
        onTranscriptChange       = global._epOnTranscriptChange;
        readTranscriptFromProjectFile = global._epReadTranscriptFromProjectFile;
        readCaptionsFromProjectFile = global._epReadCaptionsFromProjectFile;
        srtSegmentsToSttResult   = global._epSrtSegmentsToSttResult;
        renderTranscriptFromSegments = global._epRenderTranscriptFromSegments;
        bindCollapsibles         = global._epBindCollapsibles;
        MP_ANTICIPATION_SECS     = global._epMP_ANTICIPATION_SECS || 0.35;
        findTranscriptFiles      = global._epFindTranscriptFiles;
        showTranscriptExportInstructions = global._epShowTranscriptExportInstructions;
        getTakeAnalysisPromptContext = global._epGetTakeAnalysisPromptContext;
        toggleSettings           = global._epToggleSettings;
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
        if (window.EPLogger) EPLogger.log("recording", "stt-start", "provider=" + state.settings.sttProvider + " audio=" + state.audioFileName);
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
                    if (window.EPLogger) EPLogger.log("recording", "stt-cancelled", "");
                    showToast("Transcripción detenida", "info");
                } else {
                    if (window.EPLogger) EPLogger.error("recording", "stt-complete", result.error);
                    showToast("Error STT: " + result.error, "error");
                }
                showElement("recording-empty");
                return;
            }

            if (window.EPLogger) EPLogger.log("recording", "stt-complete", (result.words ? result.words.length : 0) + " words");
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
        if (window.EPLogger) EPLogger.log("recording", "segments-detected", detection.segments.length + " segments, " + detection.inPoints.length + " IN, " + detection.outPoints.length + " OUT");

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
        var list = clearContainer(document.getElementById("segment-list"));

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

        if (window.EPLogger) EPLogger.log("recording", "take-analysis-start", (recorder.words ? recorder.words.length : 0) + " words");
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
                    if (window.EPLogger) EPLogger.error("recording", "take-analysis-complete", result.error);
                    showToast("Error IA: " + result.error, "error");
                    return;
                }

                var adjustments = result.adjustments || [];
                var additional = result.additionalMarkers || [];
                if (window.EPLogger) EPLogger.log("recording", "take-analysis-complete", adjustments.length + " adjustments, " + additional.length + " additional markers");
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
        var list = clearContainer(document.getElementById("take-list"));

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
        if (window.EPLogger) EPLogger.log("recording", "markers-place", "");
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
        if (window.EPLogger) EPLogger.log("recording", "cuts-execute", recCutState.removeZones.length + " zones to remove");
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


    // ─── Expose to EditorProUI namespace ───────────────────────
    EP.recording = {
        init: _initRefs,
        toggleRecStep: toggleRecStep,
        openRecStep: openRecStep,
        startTranscription: startTranscription,
        stopTranscription: stopTranscription,
        placeMarkers: placeRecordingMarkers,
        exportMarkers: exportRecordingMarkers,
        executeRecCuts: executeRecCuts,
        startViewClassification: startViewClassification,
        applyViewClassification: applyViewClassification,
        renderSegmentList: renderSegmentList,
        handleAudioFileSelect: handleAudioFileSelect,
        loadAudioFile: loadAudioFile,
        clearAudio: clearAudio,
        exportFromSequence: exportFromSequence,
        refreshSTTProviderUI: refreshSTTProviderUI,
        refreshRecSttStatus: refreshRecSttStatus,
        saveSTTKey: saveSTTKey,
        applySttResultToRecordingNotes: applySttResultToRecordingNotes,
        startTakeAnalysis: startTakeAnalysis,
        cancelTakeAnalysis: cancelTakeAnalysis,
        addSupplementaryMarkers: addSupplementaryMarkers,
        refreshTraerTranscriptButtons: refreshTraerTranscriptButtons,
        refreshTranscriptWhisperAudioStatus: refreshTranscriptWhisperAudioStatus,
        loadLastWhisperIntoTranscript: loadLastWhisperIntoTranscript,
        loadLastWhisperIntoRecordingNotes: loadLastWhisperIntoRecordingNotes,
        fetchCaptionsForRecording: fetchCaptionsForRecording,
        handleSrtRecordingSelect: handleSrtRecordingSelect,
        setSttProgress: setSttProgress,
        refreshSttHeaderProgressVisibility: refreshSttHeaderProgressVisibility,
        expandSection: expandSection,
        refreshWhisperLocalStatus: refreshWhisperLocalStatus,
        applyWhisperResultToTranscriptCard: applyWhisperResultToTranscriptCard,
        restoreRecCutBackup: restoreRecCutBackup,
        saveSRTFiles: saveSRTFiles,
        renderClickableTranscript: renderClickableTranscript,
        clearRenderedTranscript: clearRenderedTranscript,
        setRecStepHint: setRecStepHint,
        recStepStart: recStepStart,
        recStepEnd: recStepEnd,
        setTranscribeButtonStop: setTranscribeButtonStop
    };

})(window);