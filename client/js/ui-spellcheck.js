/**
 * Editor-Pro — SpellCheck UI Module
 * Extracted from main.js for organizational clarity.
 * All behavior is identical to the original.
 */
(function(global) {
    "use strict";

    var EP = global.EditorProUI = global.EditorProUI || {};

    // ─── Shared references (captured at init time, not load time) ─
    var state, csInterface, fs, path, os, engine, aiAnalyzer;
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

    function _initRefs() {
        state       = global._epState;
        csInterface = global._epCSInterface;
        fs          = global._epFs;
        path        = global._epPath;
        os          = global._epOs;
        engine       = global._epEngine;
        aiAnalyzer   = global._epAiAnalyzer;

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
    }

    function startSpellCheck() {
        if (state.analyzing) return;
        if (!checkAIReady()) return;

        state.analyzing = true;
        state.clipResults = {};
        expandSection("spellcheck");
        if (window.EPLogger) EPLogger.log("spellcheck", "start", "wordCount=" + (state.textClips ? state.textClips.length : 0));

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
                if (window.EPLogger) EPLogger.log("spellcheck", "start", "wordCount=" + state.textClips.length);

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
                if (window.EPLogger) EPLogger.error("spellcheck", "error", e.message);
                finishSpellCheck();
                showToast("Error: " + e.message, "error");
            } finally {
                // Ensure analyzing is reset even on unexpected errors
                if (!state.textClips || state.textClips.length === 0) {
                    state.analyzing = false;
                }
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
        var list = clearContainer(document.getElementById("sc-clip-list"));

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
            if (window.EPLogger) EPLogger.log("spellcheck", "complete", "0 issues found");
            finishSpellCheck();
            showToast("Análisis completado — sin correcciones necesarias", "success");
            return;
        }

        if (window.EPLogger) EPLogger.log("spellcheck", "complete", markers.length + " issues found");
        setProgress("sc-progress-fill", "sc-progress-text", 95, "Colocando " + markers.length + " marcador(es)...");

        csInterface.evalScript('clearMarkersByPrefix("[SC]")', function() {
            writeAndPlaceMarkers(markers, function(ok) {
                if (!ok && window.EPLogger) EPLogger.error("spellcheck", "error", "Failed to place correction markers");
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
            if (window.EPLogger) EPLogger.log("spellcheck", "dict-add", word);
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
            if (window.EPLogger) EPLogger.log("spellcheck", "dict-add", word);
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



    // ─── Expose to EditorProUI namespace ───────────────────────
    EP.spellcheck = {
        init: _initRefs,
        start: startSpellCheck,
        finish: finishSpellCheck,
        render: renderSpellCheckResults,
        autoPlaceMarkers: autoPlaceCorrectionMarkers,
        writeAndPlaceMarkers: writeAndPlaceMarkers,
        loadDictionary: loadCustomDictionary,
        saveDictionary: saveDictionary,
        addDictWord: addDictWord,
        addWordToDictionary: addWordToDictionary,
        removeDictWord: removeDictWord,
        renderDictionary: renderDictionary,
        filterDictionaryIssues: filterDictionaryIssues
    };

})(window);