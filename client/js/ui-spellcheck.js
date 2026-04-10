/**
 * Editor-Pro — SpellCheck UI Module
 * Extracted from main.js for organizational clarity.
 * All behavior is identical to the original.
 */
(function(global) {
    "use strict";

    var EP = global.EditorProUI = global.EditorProUI || {};

    // ─── Shared references from main.js ─────────────────────────
    var state       = global._epState;
    var csInterface = global._epCSInterface;
    var fs          = global._epFs;
    var path        = global._epPath;
    var os          = global._epOs;
    var engine       = global._epEngine;
    var aiAnalyzer   = global._epAiAnalyzer;

    // Shared utility shortcuts
    var on                       = global._epOn;
    var clearContainer           = global._epClearContainer;
    var safeCallback             = global._epSafeCallback;
    var showToast                = global._epShowToast;
    var showElement              = global._epShowElement;
    var hideElement              = global._epHideElement;
    var disableBtn               = global._epDisableBtn;
    var enableBtn                = global._epEnableBtn;
    var esc                      = global._epEsc;
    var escAttr                  = global._epEscAttr;
    var escExtend                = global._epEscExtend;
    var setProgress              = global._epSetProgress;
    var checkAIReady             = global._epCheckAIReady;
    var expandSection            = global._epExpandSection;
    var formatTime               = global._epFormatTime;
    var formatTimeFull           = global._epFormatTimeFull;
    var navigateToTime           = global._epNavigateToTime;
    var refreshSequenceInfo      = global._epRefreshSequenceInfo;
    var buildTimedTranscript     = global._epBuildTimedTranscript;
    var copyToClipboard          = global._epCopyToClipboard;
    var getPromptContext         = global._epGetPromptContext;
    var togglePromptEditorById   = global._epTogglePromptEditorById;
    var savePromptById           = global._epSavePromptById;
    var resetPromptById          = global._epResetPromptById;
    var normalizeSupertextNewlines = global._epNormalizeSupertextNewlines;
    var normalizeSt2Fields       = global._epNormalizeSt2Fields;
    var escSupertextHtml         = global._epEscSupertextHtml;
    var secsToSRTTime            = global._epSecsToSRTTime;
    var pad2                     = global._epPad2;
    var pad3                     = global._epPad3;
    var truncate                 = global._epTruncate;
    var formatFileSize           = global._epFormatFileSize;
    var refreshAllHeaderProgress = global._epRefreshAllHeaderProgress;
    var updateAIStatus           = global._epUpdateAIStatus;
    var showInfoModal            = global._epShowInfoModal;
    var refreshProviderUI        = global._epRefreshProviderUI;
    var parseTextClipsFromXML    = global._epParseTextClipsFromXML;
    var sttResultToSRT           = global._epSttResultToSRT;
    var parseSRT                 = global._epParseSRT;
    var srtTimeToSeconds         = global._epSrtTimeToSeconds;
    var loadTranscriptText       = global._epLoadTranscriptText;
    var onTranscriptChange       = global._epOnTranscriptChange;
    var readTranscriptFromProjectFile = global._epReadTranscriptFromProjectFile;
    var readCaptionsFromProjectFile = global._epReadCaptionsFromProjectFile;
    var srtSegmentsToSttResult   = global._epSrtSegmentsToSttResult;
    var renderTranscriptFromSegments = global._epRenderTranscriptFromSegments;
    var bindCollapsibles         = global._epBindCollapsibles;
    var MP_ANTICIPATION_SECS     = global._epMP_ANTICIPATION_SECS || 0.35;

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



    // ─── Expose to EditorProUI namespace ───────────────────────
    EP.spellcheck = {
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