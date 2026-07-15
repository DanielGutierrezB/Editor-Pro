/**
 * Editor-Pro — Edit Suggestions + Reel Proposal UI Module
 * Extracted from main.js for organizational clarity.
 * All behavior is identical to the original.
 */
(function(global) {
    "use strict";

    var EP = global.EditorProUI = global.EditorProUI || {};

    // ─── Shared references (captured at init time, not load time) ─
    var state, csInterface, fs, path, os, aiAnalyzer;
    var on, clearContainer, safeCallback, showToast, showElement, hideElement;
    var disableBtn, enableBtn, esc, escAttr, escExtend, setProgress, evalScriptWithJson;
    var checkAIReady, expandSection, formatTime, formatTimeFull, navigateToTime;
    var parseTranscriptJson, _getTranscriptFolders;
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
        evalScriptWithJson       = global._epEvalScriptWithJson;
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
        parseTranscriptJson      = global._epParseTranscriptJson;
        _getTranscriptFolders    = global._epGetTranscriptFolders;
    }

    function getEditColor(type) {
        var colors = { redundancy: 6, cut: 0, highlight: 4, transition: 2, rhythm: 3, clarity: 5 };
        return colors[type] !== undefined ? colors[type] : 6;
    }

    // ═══════════════════════════════════════════════════════════════
    // EDIT SUGGESTIONS 2 — Three categories with independent markers
    // ═══════════════════════════════════════════════════════════════

    function startEditSuggestions2() {
        if (state.es2Analyzing) return;
        if (!state.transcript || state.transcript.trim().length === 0) {
            showToast("Carga una transcripción primero", "error");
            return;
        }
        if (!checkAIReady()) return;

        state.es2Analyzing = true;
        expandSection("editsuggestions2");

        hideElement("es2-results");
        hideElement("es2-empty");
        showElement("es2-progress");
        setES2Progress(20, "Analizando contenido...");
        disableBtn("btn-editsuggestions2");

        var timedTranscript = buildTimedTranscript();
        if (window.EPLogger) EPLogger.log("edit-suggestions", "analysis-start", "segmentCount=" + (timedTranscript ? timedTranscript.split("\n").length : 0));
        if (window.EPLogger) EPLogger.log("edit-suggestions", "api-call", "provider=" + (aiAnalyzer.getProviderName ? aiAnalyzer.getProviderName() : "ai"));

        aiAnalyzer.analyzeEditSuggestions2(timedTranscript, getPromptContext("es2"), function(result) {
            setES2Progress(100, "Completado");

            setTimeout(function() {
                try {
                    hideElement("es2-progress");
                    hideElement("es2-progress-header");
                    enableBtn("btn-editsuggestions2");

                    if (result.error) {
                        if (window.EPLogger) EPLogger.error("edit-suggestions", "error", result.error);
                        showToast("Error: " + result.error, "error");
                        showElement("es2-empty");
                        return;
                    }

                    if (window.EPLogger) EPLogger.log("edit-suggestions", "api-response", "responseLen=" + JSON.stringify(result).length);
                    state.es2Highlights = result.highlights || [];
                    state.es2Suggestions = result.suggestions || [];
                    state.es2Errors = postProcessES2Errors(result.errors || []);
                    renderES2Results(result);
                    showElement("es2-results");

                    var total = state.es2Highlights.length + state.es2Suggestions.length + state.es2Errors.length;
                    showToast(total + " observaciones encontradas", "success");
                } finally {
                    state.es2Analyzing = false;
                }
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

        var list = clearContainer(document.getElementById("es2-list"));

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
            if (!err.occurrences || err.occurrences.length === 0) return;
            err.occurrences.forEach(function(occ, occIdx) {
                var isKeep = occIdx === err.keepIndex;
                var label = err.occurrences.length >= 2
                    ? (isKeep ? "✓ CONSERVAR" : "✗ ELIMINAR")
                    : "⚠ " + (err.type || "ERROR").toUpperCase();
                markers.push({
                    time: occ.time,
                    endTime: occ.endTime || occ.time + 5,
                    name: "[ER" + (errIdx + 1) + "] " + label + " — " + err.title,
                    comment: err.type.toUpperCase() + ": " + (occ.text || err.description || ""),
                    color: isKeep ? 5 : 1
                });
            });
        });
        placeES2MarkerBatch(markers, "[ER", "errores");
    }

    function placeES2SingleErrorMarkers(errIdx) {
        var err = state.es2Errors[errIdx];
        if (!err || !err.occurrences || err.occurrences.length === 0) {
            showToast("Este error no tiene ocurrencias para marcar", "info");
            return;
        }
        var markers = [];
        err.occurrences.forEach(function(occ, occIdx) {
            var isKeep = occIdx === err.keepIndex;
            var label = err.occurrences.length >= 2
                ? (isKeep ? "✓ CONSERVAR" : "✗ ELIMINAR")
                : "⚠ " + (err.type || "ERROR").toUpperCase();
            markers.push({
                time: occ.time,
                endTime: occ.endTime || occ.time + 5,
                name: "[ER" + (errIdx + 1) + "] " + label + " — " + err.title,
                comment: err.type.toUpperCase() + ": " + (occ.text || err.description || ""),
                color: isKeep ? 5 : 1
            });
        });

        if (markers.length === 0) return;
        evalScriptWithJson("addMarkersFromFile", markers, function(err, data) {
            if (err) { showToast("Error al colocar marcadores", "error"); return; }
            if (data.error) { showToast("Error: " + data.error, "error"); return; }
            showToast(data.placed + " marcadores colocados", "success");
        });
    }

    function placeES2MarkerBatch(markers, prefix, label) {
        if (markers.length === 0) {
            showToast("No hay " + label + " para marcar", "info");
            return;
        }

        csInterface.evalScript('clearMarkersByPrefix("' + prefix + '")', function() {
            evalScriptWithJson("addMarkersFromFile", markers, function(err, data) {
                if (err) { showToast("Error al colocar marcadores", "error"); return; }
                if (data.error) { showToast("Error: " + data.error, "error"); return; }
                showToast(data.placed + " marcadores de " + label + " colocados", "success");
                refreshSequenceInfo();
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
        if (state.es2Analyzing) return;
        if (!state.transcript || state.transcript.trim().length === 0) {
            showToast("Carga una transcripción primero", "error");
            return;
        }
        if (!checkAIReady()) return;

        state.es2Analyzing = true;
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
                try {
                    hideElement("rp-progress");
                    hideElement("rp-progress-header");
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
                } finally {
                    state.es2Analyzing = false;
                }
            }, 500);
        });
    }

    function renderReelResults(result) {
        var assessment = document.getElementById("rp-assessment");
        assessment.innerHTML = esc(result.assessment || "Análisis completado");

        var list = clearContainer(document.getElementById("rp-list"));

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
        var reelName = (state.sequenceName || "Secuencia") + "_Reel";
        if (state.reelProposals.length > 1) {
            reelName += "_" + (reelIdx + 1);
        }

        var keepZones = reel.segments.map(function(seg) {
            return { start: seg.time, end: seg.endTime || seg.time + 5 };
        });

        disableBtn("btn-reelproposal");
        showToast("Generando secuencia de reel...", "info");

        evalScriptWithJson("createReelSequence", { reelName: reelName, keepZones: keepZones }, function(err, data) {
            enableBtn("btn-reelproposal");
            if (err) { showToast("Error al crear secuencia de reel", "error"); return; }
            if (data.error) {
                showToast("Error: " + data.error, "error");
                return;
            }
            var msg = "Reel creado: " + (data.reelName || reelName);
            if (data.frameChanged) msg += " (9:16)";
            showToast(msg, "success");
            refreshSequenceInfo();
        }, { fileName: "EditorPro_reel_" + reelIdx + ".json" });
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



    // ═══════════════════════════════════════════════════════════════
    // EDIT SUGGESTIONS — BATCH MODE
    // ═══════════════════════════════════════════════════════════════

    var _es2BatchResults = {};
    var _es2BatchQueue = [];
    var _es2BatchCancelled = false;
    var _es2BatchCurrentNav = -1;
    var _es2BatchRunning = false;
    var ES2_BATCH_CONCURRENCY = 3;

    function es2BatchOpen() {
        if (!checkAIReady()) return;
        _es2BatchResults = {};
        _es2BatchQueue = [];
        _es2BatchCancelled = false;
        _es2BatchCurrentNav = -1;
        hideElement("es2-batch-progress");
        hideElement("es2-results");
        hideElement("es2-batch-nav");
        showElement("es2-batch-panel");

        var listEl = document.getElementById("es2-batch-list");
        listEl.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:12px;text-align:center">Buscando secuencias...</div>';

        var cache = (state && state.transcriptCache) ? state.transcriptCache : {};
        csInterface.evalScript("getAllProjectSequences()", function(res) {
            try {
                var data = JSON.parse(res);
                var seqs = data.sequences || [];
                var withTranscript = [];

                for (var si = 0; si < seqs.length; si++) {
                    if (!seqs[si].isOpen) continue;
                    var sname = seqs[si].name;
                    var hasT = cache[sname] || _es2BatchFindTranscript(_getTranscriptFolders(), sname);
                    if (hasT) {
                        withTranscript.push({ name: sname, id: seqs[si].sequenceID, transcriptPath: hasT });
                    }
                }

                withTranscript.sort(function(a, b) { return a.name.localeCompare(b.name); });
                _es2BatchQueue = withTranscript;

                var countEl = document.getElementById("es2-batch-count");
                if (countEl) countEl.textContent = withTranscript.length + " encontradas";

                if (withTranscript.length === 0) {
                    listEl.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:12px;text-align:center">No se encontraron secuencias abiertas con transcript. Importa al menos un transcript primero.</div>';
                    return;
                }

                _es2BatchRenderCards();
            } catch(e) {
                listEl.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:12px">Error: ' + e.message + '</div>';
            }
        });
    }

    function _es2BatchFindTranscript(folders, seqName) {
        if (!seqName || !fs || !path) return null;
        var baseName = seqName.replace(/[\/\\:*?"<>|]/g, "_");
        for (var fi = 0; fi < folders.length; fi++) {
            var folder = folders[fi];
            var jp = path.join(folder, baseName + ".json");
            if (fs.existsSync(jp)) return jp;
            var sp = path.join(folder, baseName + ".srt");
            if (fs.existsSync(sp)) return sp;
        }
        return null;
    }

    function _es2BatchLoadTranscript(filePath) {
        if (!filePath || !fs) return null;
        try {
            var segments = null;

            if (filePath.toLowerCase().endsWith(".json")) {
                var parsed = parseTranscriptJson(filePath);
                if (parsed && parsed.words && parsed.words.length > 5) {
                    var srt = sttResultToSRT(parsed);
                    segments = parseSRT(srt);
                }
                if (!segments || segments.length < 3) {
                    var raw = fs.readFileSync(filePath, "utf8");
                    var jsonData = JSON.parse(raw);
                    if (jsonData.segments && jsonData.segments.length > 0 && jsonData.segments[0].words) {
                        segments = [];
                        for (var si = 0; si < jsonData.segments.length; si++) {
                            var seg = jsonData.segments[si];
                            var words = seg.words || [];
                            var text = words.map(function(w) { return w.text || ""; }).join(" ").trim();
                            if (text) {
                                segments.push({
                                    startTime: seg.start || 0,
                                    endTime: (seg.start || 0) + (seg.duration || 5),
                                    text: text
                                });
                            }
                        }
                    }
                }
            } else {
                var content = fs.readFileSync(filePath, "utf8");
                segments = parseSRT(content);
            }

            if (segments && segments.length > 3) {
                return segments.map(function(s) {
                    return "[" + s.startTime.toFixed(1) + "s - " + s.endTime.toFixed(1) + "s] " + s.text;
                }).join("\n");
            }
            return null;
        } catch(_e) { return null; }
    }

    function _es2BatchRenderCards() {
        var listEl = document.getElementById("es2-batch-list");
        listEl.innerHTML = "";

        for (var wi = 0; wi < _es2BatchQueue.length; wi++) {
            var s = _es2BatchQueue[wi];
            var r = _es2BatchResults[s.name];

            var item = document.createElement("div");
            item.className = "batch-seq-item" + (r && r.result ? " es2-done" : "");
            item.dataset.seqName = s.name;

            var cb = document.createElement("input");
            cb.type = "checkbox";
            cb.className = "batch-seq-checkbox es2b-check";
            cb.checked = true;
            cb.dataset.seqName = s.name;
            cb.dataset.seqId = s.id;
            cb.dataset.transcript = s.transcriptPath;
            cb.addEventListener("click", function(e) { e.stopPropagation(); });

            var info = document.createElement("div");
            info.className = "batch-seq-info";

            var nameEl = document.createElement("div");
            nameEl.className = "batch-seq-name";
            nameEl.textContent = s.name;
            info.appendChild(nameEl);

            var meta = document.createElement("div");
            meta.className = "batch-seq-meta";
            meta.dataset.seqName = s.name;
            info.appendChild(meta);

            var stats = document.createElement("div");
            stats.className = "batch-seq-stats";
            stats.dataset.seqName = s.name;

            if (r && r.result) {
                _es2BatchFillCardPills(stats, meta, r);
            } else if (r && r.error) {
                var errPill = document.createElement("span");
                errPill.className = "batch-stat-pill es2-error";
                errPill.textContent = "Error";
                stats.appendChild(errPill);
                meta.textContent = r.error.substring(0, 50);
            } else {
                var pendPill = document.createElement("span");
                pendPill.className = "batch-stat-pill es2-pending";
                pendPill.textContent = "Pendiente";
                stats.appendChild(pendPill);
                meta.textContent = path.basename(s.transcriptPath);
            }

            item.appendChild(cb);
            item.appendChild(info);
            item.appendChild(stats);

            if (r && r.result) {
                (function(seqName) {
                    item.addEventListener("click", function(e) {
                        if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
                        _es2BatchNavigateTo(seqName);
                    });
                })(s.name);
            }

            listEl.appendChild(item);
        }
    }

    function _es2BatchFillCardPills(statsEl, metaEl, r) {
        var res = r.result;
        var nErr = (res.errors || []).length;
        var nSug = (res.suggestions || []).length;
        var nHl = (res.highlights || []).length;
        var nTotal = nErr + nSug + nHl;

        var totalPill = document.createElement("span");
        totalPill.className = "batch-stat-pill es2-total";
        totalPill.textContent = nTotal;
        statsEl.appendChild(totalPill);

        if (nErr > 0) {
            var ep = document.createElement("span");
            ep.className = "batch-stat-pill es2-errors";
            ep.textContent = nErr + " error" + (nErr > 1 ? "es" : "");
            statsEl.appendChild(ep);
        }
        if (nSug > 0) {
            var sp = document.createElement("span");
            sp.className = "batch-stat-pill es2-suggestions";
            sp.textContent = nSug + " sugerencia" + (nSug > 1 ? "s" : "");
            statsEl.appendChild(sp);
        }
        if (nHl > 0) {
            var hp = document.createElement("span");
            hp.className = "batch-stat-pill es2-highlights";
            hp.textContent = nHl + " highlight" + (nHl > 1 ? "s" : "");
            statsEl.appendChild(hp);
        }

        metaEl.textContent = nTotal + " observaciones";
    }

    function _es2BatchSetProgress(pct, text) {
        var fill = document.getElementById("es2-batch-progress-fill");
        var label = document.getElementById("es2-batch-progress-text");
        if (fill) fill.style.width = Math.min(pct, 100) + "%";
        if (label) label.textContent = text || "";
    }

    function _es2BatchUpdateCardStatus(seqName, pillClass, pillText) {
        var card = document.querySelector('.batch-seq-item[data-seq-name="' + seqName.replace(/"/g, '\\"') + '"]');
        if (!card) return;
        var stats = card.querySelector(".batch-seq-stats");
        if (stats) {
            stats.innerHTML = "";
            var r = _es2BatchResults[seqName];
            if (r && r.result) {
                var meta = card.querySelector(".batch-seq-meta");
                _es2BatchFillCardPills(stats, meta, r);
            } else {
                var pill = document.createElement("span");
                pill.className = "batch-stat-pill " + pillClass;
                pill.textContent = pillText;
                stats.appendChild(pill);
            }
        }

        var r2 = _es2BatchResults[seqName];
        if (r2 && r2.result && !card.classList.contains("es2-done")) {
            card.classList.add("es2-done");
            (function(sn) {
                card.addEventListener("click", function(e) {
                    if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
                    _es2BatchNavigateTo(sn);
                });
            })(seqName);
        }
    }

    function _es2BatchSetCancelBtn(running) {
        var btn = document.getElementById("btn-es2-batch-cancel");
        if (!btn) return;
        if (running) {
            btn.textContent = "Detener";
            btn.style.borderColor = "rgba(248,113,113,0.4)";
            btn.style.color = "#f87171";
        } else {
            btn.textContent = "Cerrar Batch";
            btn.style.borderColor = "";
            btn.style.color = "";
        }
    }

    function es2BatchClose() {
        if (_es2BatchRunning) {
            _es2BatchCancelled = true;
            _es2BatchRunning = false;
            _es2BatchSetCancelBtn(false);
            showToast("Proceso detenido", "info");
            hideElement("es2-batch-progress");
            enableBtn("btn-es2-batch-analyze");
            return;
        }
        _es2BatchCancelled = true;
        _es2BatchCurrentNav = -1;
        hideElement("es2-batch-panel");
        hideElement("es2-batch-nav");
    }

    function es2BatchAnalyzeAll() {
        var checks = document.querySelectorAll(".es2b-check:checked");
        if (checks.length === 0) { showToast("Selecciona al menos una secuencia", "info"); return; }
        if (!checkAIReady()) return;

        _es2BatchCancelled = false;
        _es2BatchRunning = true;
        _es2BatchSetCancelBtn(true);
        disableBtn("btn-es2-batch-analyze");
        showElement("es2-batch-progress");

        var queue = [];
        checks.forEach(function(cb) {
            queue.push({ name: cb.dataset.seqName, id: cb.dataset.seqId, transcript: cb.dataset.transcript });
        });

        var total = queue.length;
        var completed = 0;
        var nextIdx = 0;

        function onItemDone() {
            completed++;
            var pct = Math.round((completed / total) * 100);
            _es2BatchSetProgress(pct, completed + "/" + total + " analizadas");

            if (_es2BatchCancelled || completed >= total) {
                _es2BatchRunning = false;
                _es2BatchSetCancelBtn(false);
                hideElement("es2-batch-progress");
                enableBtn("btn-es2-batch-analyze");
                _es2BatchRenderCards();
                var totalObs = 0;
                for (var k in _es2BatchResults) {
                    var br = _es2BatchResults[k];
                    if (br && br.result) {
                        totalObs += (br.result.errors || []).length + (br.result.suggestions || []).length + (br.result.highlights || []).length;
                    }
                }
                showToast(completed + " secuencias analizadas — " + totalObs + " observaciones", "success");
                return;
            }
            launchNext();
        }

        function launchNext() {
            while (nextIdx < total && (nextIdx - completed) < ES2_BATCH_CONCURRENCY) {
                launchOne(nextIdx);
                nextIdx++;
            }
        }

        function launchOne(idx) {
            if (_es2BatchCancelled) return;
            var item = queue[idx];
            _es2BatchUpdateCardStatus(item.name, "es2-analyzing", "Analizando...");

            var timedTranscript = _es2BatchLoadTranscript(item.transcript);
            if (!timedTranscript) {
                _es2BatchUpdateCardStatus(item.name, "es2-error", "Sin transcript");
                _es2BatchResults[item.name] = { error: "No transcript", seqId: item.id };
                onItemDone();
                return;
            }

            aiAnalyzer.analyzeEditSuggestions2(timedTranscript, getPromptContext("es2"), function(result) {
                if (_es2BatchCancelled) return;
                if (result.error) {
                    _es2BatchUpdateCardStatus(item.name, "es2-error", "Error");
                    _es2BatchResults[item.name] = { error: result.error, seqId: item.id };
                } else {
                    result.errors = postProcessES2Errors(result.errors || []);
                    _es2BatchResults[item.name] = { result: result, seqId: item.id, transcript: item.transcript };
                    var nObs = (result.errors || []).length + (result.suggestions || []).length + (result.highlights || []).length;
                    _es2BatchUpdateCardStatus(item.name, "es2-total", nObs + " observaciones");
                }
                onItemDone();
            });
        }

        launchNext();
    }

    function _es2BatchGetAnalyzedNames() {
        var names = [];
        for (var qi = 0; qi < _es2BatchQueue.length; qi++) {
            var n = _es2BatchQueue[qi].name;
            if (_es2BatchResults[n] && _es2BatchResults[n].result) names.push(n);
        }
        return names;
    }

    function _es2BatchNavigateTo(seqName) {
        var r = _es2BatchResults[seqName];
        if (!r || !r.result) return;

        _es2BatchSaveCurrentEdits();

        var analyzed = _es2BatchGetAnalyzedNames();
        _es2BatchCurrentNav = analyzed.indexOf(seqName);

        // Notify main.js to update _lastSeqName BEFORE opening (prevents polling race)
        if (window._epNotifyBatchSeqSwitch) window._epNotifyBatchSeqSwitch(seqName);
        csInterface.evalScript('openSequenceById("' + r.seqId.replace(/"/g, '\\"') + '")', function() {});

        state.es2Highlights = r.result.highlights || [];
        state.es2Suggestions = r.result.suggestions || [];
        state.es2Errors = r.result.errors || [];
        renderES2Results(r.result);

        hideElement("es2-batch-panel");
        hideElement("es2-empty");
        showElement("es2-results");
        _es2BatchUpdateNav();
        showElement("es2-batch-nav");
    }

    function _es2BatchSaveCurrentEdits() {
        if (_es2BatchCurrentNav < 0) return;
        var analyzed = _es2BatchGetAnalyzedNames();
        var name = analyzed[_es2BatchCurrentNav];
        if (name && _es2BatchResults[name] && _es2BatchResults[name].result) {
            _es2BatchResults[name].result.highlights = state.es2Highlights;
            _es2BatchResults[name].result.suggestions = state.es2Suggestions;
            _es2BatchResults[name].result.errors = state.es2Errors;
        }
    }

    function _es2BatchUpdateNav() {
        var analyzed = _es2BatchGetAnalyzedNames();
        var prevBtn = document.getElementById("btn-es2-bnav-prev");
        var nextBtn = document.getElementById("btn-es2-bnav-next");
        if (prevBtn) prevBtn.className = "btn-batch-nav" + (_es2BatchCurrentNav <= 0 ? " disabled" : "");
        if (nextBtn) nextBtn.className = "btn-batch-nav" + (_es2BatchCurrentNav >= analyzed.length - 1 ? " disabled" : "");
    }

    function es2BatchNavPrev() {
        var analyzed = _es2BatchGetAnalyzedNames();
        if (_es2BatchCurrentNav > 0) {
            _es2BatchNavigateTo(analyzed[_es2BatchCurrentNav - 1]);
        }
    }

    function es2BatchNavNext() {
        var analyzed = _es2BatchGetAnalyzedNames();
        if (_es2BatchCurrentNav < analyzed.length - 1) {
            _es2BatchNavigateTo(analyzed[_es2BatchCurrentNav + 1]);
        }
    }

    function es2BatchNavBack() {
        _es2BatchSaveCurrentEdits();
        _es2BatchCurrentNav = -1;
        hideElement("es2-batch-nav");
        hideElement("es2-results");
        _es2BatchRenderCards();
        showElement("es2-batch-panel");
    }

    // ─── Expose to EditorProUI namespace ───────────────────────
    EP.editSuggestions = {
        init: _initRefs,
        start: startEditSuggestions2,
        render: renderES2Results,
        exportData: exportEditSuggestions2,
        placeHighlightMarkers: placeES2HighlightMarkers,
        placeSuggestionMarkers: placeES2SuggestionMarkers,
        placeErrorMarkers: placeES2ErrorMarkers,
        setES2Progress: setES2Progress,
        refreshES2HeaderProgressVisibility: refreshES2HeaderProgressVisibility,
        getEditColor: getEditColor,
        startReelProposal: startReelProposal,
        renderReelResults: renderReelResults,
        exportReelProposals: exportReelProposals,
        setRPProgress: setRPProgress,
        refreshRPHeaderProgressVisibility: refreshRPHeaderProgressVisibility,
        batchOpen: es2BatchOpen,
        batchAnalyzeAll: es2BatchAnalyzeAll,
        batchClose: es2BatchClose,
        batchNavPrev: es2BatchNavPrev,
        batchNavNext: es2BatchNavNext,
        batchNavBack: es2BatchNavBack,
        isBatchActive: function() { return _es2BatchRunning || _es2BatchCurrentNav >= 0; }
    };

})(window);