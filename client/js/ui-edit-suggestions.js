/**
 * Editor-Pro — Edit Suggestions + Reel Proposal UI Module
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
                try {
                    hideElement("es2-progress");
                    hideElement("es2-progress-header");
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
                } finally {
                    state.analyzing = false;
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
                    state.analyzing = false;
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



    // ─── Expose to EditorProUI namespace ───────────────────────
    EP.editSuggestions = {
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
        refreshRPHeaderProgressVisibility: refreshRPHeaderProgressVisibility
    };

})(window);