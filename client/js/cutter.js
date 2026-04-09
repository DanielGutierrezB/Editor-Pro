/**
 * Editor-Pro — Cutter Module
 *
 * Reads sequence markers via ExtendScript, parses them into
 * IN/OUT blocks, displays a visual preview, and executes cuts.
 */

(function() {
    "use strict";

    var csInterface = new CSInterface();
    var fs, path, os;
    try { fs = require("fs"); path = require("path"); os = require("os"); } catch(e) {}

    // ─── State ───────────────────────────────────────────────

    var state = {
        seqName: "",
        seqDuration: 0,
        markers: [],
        keepBlocks: [],
        removeZones: [],
        analyzed: false,
        lastLog: [],
        postMarkers: [],
        selectedMarkerTimes: {},
        singleProcessing: false,
        singleStopping: false,
        batchMode: false,
        batchProcessing: false,
        batchStopping: false,
        batchSequences: [],
        batchResults: [],
        batchLog: [],
        warnings: [],
        videoTracks: [],
        viewMapping: {},
        currentBatchIdx: -1
    };

    // ─── DOM References ──────────────────────────────────────

    var dom = {
        seqName:            document.getElementById("seq-name"),
        markerCount:        document.getElementById("seq-meta"),
        btnAnalyze:         document.getElementById("btn-cutter-analyze"),
        analyzeProgress:    document.getElementById("cutter-progress"),
        analyzeProgressFill:document.getElementById("cutter-progress-fill"),
        analyzeProgressText:document.getElementById("cutter-progress-text"),
        emptyState:         document.getElementById("cutter-empty"),
        resultsSection:     document.getElementById("cutter-results"),
        keepDuration:       document.getElementById("cutter-keep-duration"),
        keepBlocks:         document.getElementById("cutter-keep-blocks"),
        removeDuration:     document.getElementById("cutter-remove-duration"),
        removeBlocks:       document.getElementById("cutter-remove-blocks"),
        commentCount:       document.getElementById("cutter-comment-count"),
        commentDetail:      document.getElementById("cutter-comment-detail"),
        blockList:          document.getElementById("cutter-block-list"),
        btnExecute:         document.getElementById("btn-cutter-execute"),
        resultDone:         document.getElementById("cutter-result-done"),
        resultMsg:          document.getElementById("cutter-result-msg"),
        resultDetail:       document.getElementById("cutter-result-detail"),
        btnRestore:         document.getElementById("btn-cutter-restore"),
        btnCopyLog:         document.getElementById("btn-cutter-copy-log"),
        markerManager:      document.getElementById("cutter-marker-manager"),
        markerMgrCount:     document.getElementById("cutter-marker-count"),
        markerList:         document.getElementById("cutter-marker-list"),
        btnDeleteNoComments:document.getElementById("btn-cutter-delete-no-comments"),
        btnDeleteSelected:  document.getElementById("btn-cutter-delete-selected"),
        selectedCount:      document.getElementById("cutter-selected-count"),
        confirmOverlay:     document.getElementById("cutter-confirm-overlay"),
        confirmMsg:         document.getElementById("cutter-confirm-msg"),
        btnCancel:          document.getElementById("btn-cutter-cancel"),
        btnConfirm:         document.getElementById("btn-cutter-confirm"),
        toast:              document.getElementById("toast"),
        // Batch
        btnBatchAnalyze:    document.getElementById("btn-batch-analyze"),
        batchSection:       document.getElementById("cutter-batch-section"),
        batchSeqCount:      document.getElementById("batch-seq-count"),
        batchSelectAllCb:   document.getElementById("batch-select-all-cb"),
        batchList:          document.getElementById("batch-list"),
        btnBatchExecute:    document.getElementById("btn-batch-execute"),
        batchDone:          document.getElementById("cutter-batch-done"),
        batchResultDetail:  document.getElementById("batch-result-detail"),
        batchResultsList:   document.getElementById("batch-results-list"),
        btnBatchCopyLog:    document.getElementById("btn-batch-copy-log"),
        btnBatchRestoreAll: document.getElementById("btn-batch-restore-all"),
        btnBatchBack:       document.getElementById("btn-batch-back"),
        // View Mapping & Collapsible
        selectAllCb:        document.getElementById("cutter-select-all-cb"),
        viewSection:        document.getElementById("cutter-view-section"),
        markerMgrToggle:    document.getElementById("marker-mgr-toggle"),
        markerMgrBody:      document.getElementById("marker-mgr-body"),
        // Header progress
        cutterBody:         document.getElementById("cutter-body"),
        headerProgress:     document.getElementById("cutter-progress-header"),
        headerProgressFill: document.getElementById("cutter-progress-header-fill"),
        headerProgressText: document.getElementById("cutter-progress-header-text")
    };

    // ─── Helpers ─────────────────────────────────────────────

    function formatTime(seconds) {
        var s = Math.max(0, Math.round(seconds));
        var h = Math.floor(s / 3600);
        var m = Math.floor((s % 3600) / 60);
        var sec = s % 60;

        if (h > 0) {
            return h + ":" + padZero(m) + ":" + padZero(sec);
        }
        return m + ":" + padZero(sec);
    }

    function formatTimecode(seconds) {
        var s = Math.max(0, seconds);
        var h = Math.floor(s / 3600);
        var m = Math.floor((s % 3600) / 60);
        var sec = Math.floor(s % 60);
        var frames = Math.round((s % 1) * 30);

        return padZero(h) + ":" + padZero(m) + ":" + padZero(sec) + ":" + padZero(frames);
    }

    function padZero(n) { return n < 10 ? "0" + n : "" + n; }

    function escExtend(p) {
        return p.replace(/\\/g, "/").replace(/'/g, "\\'");
    }

    function showToast(msg, type) {
        type = type || "info";
        dom.toast.textContent = msg;
        dom.toast.className = "toast toast-" + type + " show";
        setTimeout(function() { dom.toast.className = "toast"; }, 3000);
    }

    // ─── Header Progress Sync ─────────────────────────────────

    function syncHeaderProgress() {
        var isBodyHidden = dom.cutterBody && dom.cutterBody.classList.contains("hidden");
        var isProcessing = !dom.analyzeProgress.classList.contains("hidden");

        if (isProcessing && isBodyHidden) {
            dom.headerProgress.classList.remove("hidden");
            dom.headerProgressFill.style.width = dom.analyzeProgressFill.style.width;
            dom.headerProgressText.textContent = dom.analyzeProgressText.textContent;
        } else {
            dom.headerProgress.classList.add("hidden");
        }
    }

    // ─── CEP Communication ───────────────────────────────────

    function evalScript(script, callback) {
        csInterface.evalScript(script, function(result) {
            var data;
            try {
                data = JSON.parse(result);
            } catch(e) {
                data = { error: "Error parsing response: " + result };
            }
            if (callback) callback(data);
        });
    }

    // ─── Refresh Sequence Info ───────────────────────────────

    function refreshSequenceInfo() {
        evalScript("getActiveSequenceInfo()", function(data) {
            if (data.error) {
                state.seqName = "";
                state.seqDuration = 0;
                return;
            }
            state.seqName = data.name;
            var durSeconds = 0;
            if (data.duration) {
                durSeconds = parseFloat(data.duration) / 254016000000;
            }
            state.seqDuration = durSeconds;
        });
    }

    // ─── Marker Parsing ──────────────────────────────────────

    function isOutMarker(marker) {
        var c = (marker.comments || "").trim();
        return c.indexOf("OUT:") === 0;
    }

    function parseInComment(raw) {
        var trimmed = (raw || "").trim();
        // Format: "Editor note - transcript text" or "- transcript text"
        var dashIdx = trimmed.indexOf(" - ");
        if (dashIdx === -1 && trimmed.indexOf("- ") === 0) {
            // Starts with "- " → no editor comment, just transcript
            return { note: "", transcript: trimmed.substring(2).trim(), hasComment: false };
        }
        if (dashIdx > 0) {
            var note = trimmed.substring(0, dashIdx).trim();
            var transcript = trimmed.substring(dashIdx + 3).trim();
            return { note: note, transcript: transcript, hasComment: true };
        }
        // No dash at all → treat whole thing as transcript
        return { note: "", transcript: trimmed, hasComment: false };
    }

    function parseMarkers(markers) {
        if (!markers || markers.length === 0) {
            return { keepBlocks: [], removeZones: [], warnings: [], error: "No se encontraron marcadores." };
        }

        // Sort by start time
        markers.sort(function(a, b) { return a.startSeconds - b.startSeconds; });

        // Skip first marker (clapperboard)
        var working = markers.slice(1);

        if (working.length === 0) {
            return { keepBlocks: [], removeZones: [], warnings: [], error: "Solo se encontro el marcador de claqueta." };
        }

        var keepBlocks = [];
        var warnings = [];
        var currentIn = null;

        for (var i = 0; i < working.length; i++) {
            var m = working[i];

            if (isOutMarker(m)) {
                if (currentIn !== null) {
                    var rawComment = currentIn.comments || currentIn.name || "";
                    var parsed = parseInComment(rawComment);
                    keepBlocks.push({
                        inTime: currentIn.startSeconds,
                        outTime: m.startSeconds,
                        inComment: rawComment,
                        editorNote: parsed.note,
                        transcript: parsed.transcript,
                        hasComment: parsed.hasComment,
                        outComment: m.comments || "",
                        inName: currentIn.name || "",
                        outName: m.name || ""
                    });
                    currentIn = null;
                } else {
                    warnings.push({
                        type: "orphan-out",
                        time: m.startSeconds,
                        name: m.name || "",
                        comment: (m.comments || "").trim()
                    });
                }
            } else {
                currentIn = m;
            }
        }

        if (currentIn !== null) {
            warnings.push({
                type: "orphan-in",
                time: currentIn.startSeconds,
                name: currentIn.name || "",
                comment: (currentIn.comments || "").trim()
            });
        }

        if (keepBlocks.length === 0) {
            return { keepBlocks: [], removeZones: [], warnings: warnings, error: "No se encontraron pares IN/OUT validos." };
        }

        // Build remove zones
        var removeZones = [];

        // Zone 0: From sequence start to first IN
        if (keepBlocks[0].inTime > 0.1) {
            removeZones.push({
                start: 0,
                end: keepBlocks[0].inTime,
                label: "Pre-inicio"
            });
        }

        // Gaps between consecutive keep blocks
        for (var k = 0; k < keepBlocks.length - 1; k++) {
            var gapStart = keepBlocks[k].outTime;
            var gapEnd = keepBlocks[k + 1].inTime;
            if (gapEnd - gapStart > 0.05) {
                removeZones.push({
                    start: gapStart,
                    end: gapEnd,
                    label: "Brecha " + (k + 1)
                });
            }
        }

        // Zone last: From last OUT to sequence end
        var lastOut = keepBlocks[keepBlocks.length - 1].outTime;
        if (state.seqDuration > 0 && state.seqDuration - lastOut > 0.1) {
            removeZones.push({
                start: lastOut,
                end: state.seqDuration,
                label: "Post-final"
            });
        }

        return { keepBlocks: keepBlocks, removeZones: removeZones, warnings: warnings, error: null };
    }

    // ─── Render Block List ───────────────────────────────────

    function renderBlocks() {
        dom.blockList.innerHTML = "";

        // Build a combined timeline of keep/remove blocks sorted by time
        var allBlocks = [];

        for (var r = 0; r < state.removeZones.length; r++) {
            var rz = state.removeZones[r];
            allBlocks.push({
                type: "remove",
                start: rz.start,
                end: rz.end,
                label: rz.label,
                comment: ""
            });
        }

        for (var k = 0; k < state.keepBlocks.length; k++) {
            var kb = state.keepBlocks[k];
            allBlocks.push({
                type: "keep",
                start: kb.inTime,
                end: kb.outTime,
                label: "Bloque " + (k + 1),
                comment: kb.inComment,
                editorNote: kb.editorNote || "",
                transcript: kb.transcript || "",
                hasComment: kb.hasComment || false
            });
        }

        allBlocks.sort(function(a, b) { return a.start - b.start; });

        // Calculate totals
        var keepTotal = 0, removeTotal = 0;
        var keepCount = 0, removeCount = 0, commentCount = 0;

        for (var i = 0; i < allBlocks.length; i++) {
            var b = allBlocks[i];
            var dur = b.end - b.start;
            if (b.type === "keep") { keepTotal += dur; keepCount++; }
            else { removeTotal += dur; removeCount++; }
            if (b.hasComment) commentCount++;

            var div = document.createElement("div");
            var blockClass = "block-item " + b.type;
            if (b.hasComment) blockClass += " has-comment";
            div.className = blockClass;
            div.setAttribute("data-start", b.start);

            var badge = document.createElement("span");
            badge.className = "block-badge";
            badge.textContent = b.type === "keep" ? "KEEP" : "CUT";

            var info = document.createElement("div");
            info.className = "block-info";

            // For KEEP blocks with editor comments, show note + transcript separately
            if (b.type === "keep" && b.hasComment && b.editorNote) {
                var noteEl = document.createElement("div");
                noteEl.className = "block-note";
                var noteText = b.editorNote;
                if (noteText.length > 80) noteText = noteText.substring(0, 77) + "...";
                noteEl.textContent = noteText;
                info.appendChild(noteEl);

                if (b.transcript) {
                    var transEl = document.createElement("div");
                    transEl.className = "block-transcript";
                    var transText = b.transcript;
                    if (transText.length > 70) transText = transText.substring(0, 67) + "...";
                    transEl.textContent = transText;
                    info.appendChild(transEl);
                }
            } else {
                var comment = document.createElement("div");
                comment.className = "block-comment";
                var displayText = "";
                if (b.type === "keep") {
                    displayText = b.transcript || b.comment || b.label;
                } else {
                    displayText = b.label;
                }
                if (displayText.length > 80) displayText = displayText.substring(0, 77) + "...";
                comment.textContent = displayText;
                info.appendChild(comment);
            }

            var time = document.createElement("div");
            time.className = "block-time";
            time.textContent = formatTimecode(b.start) + " \u2192 " + formatTimecode(b.end);
            info.appendChild(time);

            var duration = document.createElement("span");
            duration.className = "block-duration";
            duration.textContent = formatTime(dur);

            div.appendChild(badge);
            div.appendChild(info);
            div.appendChild(duration);

            div.addEventListener("click", (function(startSec) {
                return function() {
                    evalScript("movePlayhead(" + startSec + ")", function() {});
                };
            })(b.start));

            dom.blockList.appendChild(div);
        }

        // Update summary
        dom.keepDuration.textContent = formatTime(keepTotal);
        dom.keepBlocks.textContent = keepCount + " bloque" + (keepCount !== 1 ? "s" : "");
        dom.removeDuration.textContent = formatTime(removeTotal);
        dom.removeBlocks.textContent = removeCount + " zona" + (removeCount !== 1 ? "s" : "");
        dom.commentCount.textContent = commentCount;
        dom.commentDetail.textContent = commentCount === 1 ? "nota" : "notas";
    }

    // ─── Warnings Display ─────────────────────────────────────

    function renderWarnings(warnings, container) {
        var existing = container.querySelector(".cutter-warnings");
        if (existing) existing.remove();

        if (!warnings || warnings.length === 0) return;

        var wrap = document.createElement("div");
        wrap.className = "cutter-warnings";
        wrap.style.cssText = "margin:8px 0;padding:8px 10px;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.25);border-radius:6px;";

        var title = document.createElement("div");
        title.style.cssText = "font-size:11px;font-weight:700;color:#fbbf24;margin-bottom:6px;display:flex;align-items:center;gap:5px;";
        title.textContent = "\u26A0 " + warnings.length + " marcador" + (warnings.length !== 1 ? "es" : "") + " con problemas";
        wrap.appendChild(title);

        for (var i = 0; i < warnings.length; i++) {
            var w = warnings[i];
            var row = document.createElement("div");
            row.style.cssText = "font-size:10px;color:#ccc;padding:4px 0;border-top:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;gap:6px;cursor:pointer;";
            row.addEventListener("click", (function(time) {
                return function() { evalScript("movePlayhead(" + time + ")", function() {}); };
            })(w.time));

            var badge = document.createElement("span");
            badge.style.cssText = "font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;flex-shrink:0;";
            if (w.type === "orphan-out") {
                badge.style.background = "rgba(248,113,113,0.15)";
                badge.style.color = "#f87171";
                badge.textContent = "OUT sin IN";
            } else {
                badge.style.background = "rgba(96,165,250,0.15)";
                badge.style.color = "#60a5fa";
                badge.textContent = "IN sin OUT";
            }

            var detail = document.createElement("span");
            detail.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
            var label = w.name ? "[" + w.name + "] " : "";
            var commentPreview = w.comment || "";
            if (commentPreview.length > 60) commentPreview = commentPreview.substring(0, 57) + "...";
            detail.textContent = label + commentPreview;

            var tc = document.createElement("span");
            tc.style.cssText = "font-size:9px;color:#888;flex-shrink:0;font-family:monospace;";
            tc.textContent = formatTimecode(w.time);

            row.appendChild(badge);
            row.appendChild(detail);
            row.appendChild(tc);
            wrap.appendChild(row);
        }

        container.insertBefore(wrap, container.firstChild);
    }

    // ─── Button Mode Helpers ────────────────────────────────

    function setAnalyzeButtonMode(mode) {
        var span = dom.btnAnalyze.querySelector("span");
        if (mode === "stop") {
            span.textContent = "Detener";
            dom.btnAnalyze.classList.remove("btn-disabled");
            dom.btnAnalyze.classList.add("btn-analyze-cancel");
        } else {
            span.textContent = "Leer Marcadores";
            dom.btnAnalyze.classList.remove("btn-analyze-cancel");
        }
    }

    function finishSingleProcessing() {
        state.singleProcessing = false;
        state.singleStopping = false;
        setAnalyzeButtonMode("default");
        dom.btnBatchAnalyze.classList.remove("btn-disabled");
    }

    function setBatchButtonMode(mode) {
        var span = dom.btnBatchAnalyze.querySelector("span");
        if (mode === "stop") {
            span.textContent = "Detener";
            dom.btnBatchAnalyze.classList.remove("btn-disabled", "btn-batch");
            dom.btnBatchAnalyze.classList.add("btn-analyze-cancel");
        } else {
            span.textContent = "Analizar Todas";
            dom.btnBatchAnalyze.classList.remove("btn-analyze-cancel");
            dom.btnBatchAnalyze.classList.add("btn-batch");
        }
    }

    // ─── Analyze Action ──────────────────────────────────────

    function doAnalyze() {
        state.singleProcessing = true;
        state.singleStopping = false;

        dom.emptyState.classList.add("hidden");
        dom.resultsSection.classList.add("hidden");
        dom.resultDone.classList.add("hidden");
        dom.batchSection.classList.add("hidden");
        dom.batchDone.classList.add("hidden");
        dom.analyzeProgress.classList.remove("hidden");
        dom.analyzeProgressFill.style.width = "20%";
        dom.analyzeProgressText.textContent = "Leyendo secuencia...";
        setAnalyzeButtonMode("stop");
        dom.btnBatchAnalyze.classList.add("btn-disabled");

        evalScript("getActiveSequenceInfo()", function(seqData) {
            if (seqData.error) {
                dom.analyzeProgress.classList.add("hidden");
                dom.emptyState.classList.remove("hidden");
                finishSingleProcessing();
                showToast(seqData.error, "error");
                return;
            }

            if (state.singleStopping) {
                dom.analyzeProgress.classList.add("hidden");
                dom.emptyState.classList.remove("hidden");
                finishSingleProcessing();
                showToast("Análisis detenido.", "info");
                return;
            }

            state.seqName = seqData.name;
            var durSeconds = 0;
            if (seqData.duration) {
                durSeconds = parseFloat(seqData.duration) / 254016000000;
            }
            state.seqDuration = durSeconds;

            dom.analyzeProgressFill.style.width = "50%";
            dom.analyzeProgressText.textContent = "Leyendo marcadores...";

            evalScript("getSequenceMarkers()", function(markerData) {
                dom.analyzeProgressFill.style.width = "80%";

                if (state.singleStopping) {
                    dom.analyzeProgress.classList.add("hidden");
                    dom.emptyState.classList.remove("hidden");
                    finishSingleProcessing();
                    showToast("Análisis detenido.", "info");
                    return;
                }

                if (markerData.error) {
                    dom.analyzeProgress.classList.add("hidden");
                    dom.emptyState.classList.remove("hidden");
                    finishSingleProcessing();
                    showToast(markerData.error, "error");
                    return;
                }

                state.markers = markerData.markers || [];
                dom.analyzeProgressText.textContent = "Analizando " + state.markers.length + " marcadores...";

                var result = parseMarkers(state.markers);

                dom.analyzeProgressFill.style.width = "100%";

                if (result.error) {
                    dom.analyzeProgress.classList.add("hidden");
                    dom.emptyState.classList.remove("hidden");
                    finishSingleProcessing();
                    showToast(result.error, "error");
                    return;
                }

                state.keepBlocks = result.keepBlocks;
                state.removeZones = result.removeZones;
                state.warnings = result.warnings || [];
                state.analyzed = true;

                setTimeout(function() {
                    dom.analyzeProgress.classList.add("hidden");
                    dom.resultsSection.classList.remove("hidden");
                    finishSingleProcessing();

                    renderBlocks();
                    renderWarnings(state.warnings, dom.resultsSection);

                    var toastMsg = state.keepBlocks.length + " bloques detectados, " +
                        state.removeZones.length + " zonas a eliminar";
                    if (state.warnings.length > 0) {
                        toastMsg += " (" + state.warnings.length + " advertencia" + (state.warnings.length !== 1 ? "s" : "") + ")";
                    }
                    showToast(toastMsg, state.warnings.length > 0 ? "info" : "success");
                }, 100);
            });
        });
    }

    // ─── Execute Cuts ────────────────────────────────────────

    function showConfirmDialog() {
        if (!state.analyzed || state.removeZones.length === 0) {
            showToast("No hay zonas para eliminar.", "info");
            return;
        }

        var totalRemove = 0;
        for (var i = 0; i < state.removeZones.length; i++) {
            totalRemove += (state.removeZones[i].end - state.removeZones[i].start);
        }

        dom.confirmMsg.textContent =
            "Se creara un backup de la secuencia \"" + state.seqName +
            "\" y se eliminaran " + state.removeZones.length +
            " zonas (" + formatTime(totalRemove) +
            "). Esta accion modificara la secuencia activa.";

        dom.confirmOverlay.classList.remove("hidden");
    }

    function hideConfirmDialog() {
        dom.confirmOverlay.classList.add("hidden");
        state._batchConfirmPending = false;
    }

    function doExecute() {
        hideConfirmDialog();
        state.singleProcessing = true;
        state.singleStopping = false;

        dom.resultsSection.classList.add("hidden");
        dom.analyzeProgress.classList.remove("hidden");
        dom.analyzeProgressFill.style.width = "10%";
        dom.analyzeProgressText.textContent = "Creando backup de secuencia...";
        setAnalyzeButtonMode("stop");
        dom.btnBatchAnalyze.classList.add("btn-disabled");

        // Step 1: Backup
        evalScript("backupSequence()", function(backupResult) {
            if (state.singleStopping) {
                dom.analyzeProgress.classList.add("hidden");
                dom.resultsSection.classList.remove("hidden");
                finishSingleProcessing();
                showToast("Proceso detenido antes de ejecutar cortes. Backup ya creado.", "info");
                return;
            }

            if (backupResult.error) {
                dom.analyzeProgressText.textContent = "Backup fallido, continuando...";
            } else {
                var bkName = backupResult.backupName || "backup";
                dom.analyzeProgressText.textContent = "Backup: " + bkName + ". Ejecutando cortes...";
            }
            dom.analyzeProgressFill.style.width = "30%";

            // Step 2: Write cut instructions to temp file
            var cutData = JSON.stringify({
                removeZones: state.removeZones,
                seqName: state.seqName,
                timestamp: new Date().toISOString()
            });

            var tmpDir = os.tmpdir();
            var tmpPath = path.join(tmpDir, "PRCutter_cuts.json");

            try {
                fs.writeFileSync(tmpPath, cutData, "utf8");
            } catch(e) {
                dom.analyzeProgress.classList.add("hidden");
                dom.resultsSection.classList.remove("hidden");
                finishSingleProcessing();
                showToast("Error al escribir archivo temporal: " + e.message, "error");
                return;
            }

            if (state.singleStopping) {
                dom.analyzeProgress.classList.add("hidden");
                dom.resultsSection.classList.remove("hidden");
                finishSingleProcessing();
                showToast("Proceso detenido antes de ejecutar cortes. Backup ya creado.", "info");
                return;
            }

            dom.analyzeProgressFill.style.width = "50%";
            dom.analyzeProgressText.textContent = "Procesando " + state.removeZones.length + " zonas...";

            // Step 3: Execute cuts via ExtendScript
            var escaped = escExtend(tmpPath);
            evalScript('executeCuts("' + escaped + '")', function(cutResult) {
                dom.analyzeProgressFill.style.width = "95%";
                dom.analyzeProgressText.textContent = "Cargando marcadores...";

                // Store log for copy button
                state.lastLog = (cutResult.log && cutResult.log.length > 0) ? cutResult.log : [];

                var s = cutResult.stats || {};

                if (cutResult.error) {
                    dom.analyzeProgress.classList.add("hidden");
                    finishSingleProcessing();
                    dom.resultsSection.classList.remove("hidden");
                    showToast("Error: " + cutResult.error, "error");
                    return;
                }

                dom.analyzeProgressFill.style.width = "100%";

                // Load remaining markers
                evalScript("getPostCutMarkers()", function(markerResult) {
                    setTimeout(function() {
                        dom.analyzeProgress.classList.add("hidden");
                        finishSingleProcessing();

                        var detail = "Metodo: " + (s.method || "?") +
                            " | Eliminados: " + (s.removed || 0) +
                            (s.errors > 0 ? " | Errores: " + s.errors : "");
                        dom.resultDetail.textContent = detail;
                        dom.resultMsg.textContent = "Cortes ejecutados";

                        dom.resultDone.classList.remove("hidden");
                        state.analyzed = false;

                        // Render marker list
                        if (markerResult.markers) {
                            state.postMarkers = markerResult.markers;
                            state.selectedMarkerTimes = {};
                            renderMarkerManager();
                            renderViewMapping();
                        }

                        showToast(
                            (s.removed || 0) > 0
                                ? "Cortes ejecutados: " + s.removed + " zonas eliminadas"
                                : "Ningun clip fue eliminado. Revisa el log.",
                            (s.removed || 0) > 0 ? "success" : "error"
                        );
                    }, 50);
                });
            });
        });
    }

    // ─── Restore Backup ──────────────────────────────────────

    function doRestore() {
        evalScript("restoreBackup()", function(result) {
            if (result.error) {
                showToast(result.error, "error");
                return;
            }
            dom.resultDone.classList.add("hidden");
            dom.emptyState.classList.remove("hidden");
            state.analyzed = false;
            showToast("Backup restaurado. Secuencia original activa.", "success");
            refreshSequenceInfo();
        });
    }

    // ─── Copy Log ────────────────────────────────────────────

    function doCopyLog() {
        if (!state.lastLog || state.lastLog.length === 0) {
            showToast("No hay log disponible.", "info");
            return;
        }
        try {
            var ta = document.createElement("textarea");
            ta.value = state.lastLog.join("\n");
            ta.style.cssText = "position:fixed;left:-9999px;";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            dom.btnCopyLog.textContent = "Copiado!";
            setTimeout(function() { dom.btnCopyLog.textContent = "Copiar Log"; }, 1500);
        } catch(e) {
            showToast("Error al copiar", "error");
        }
    }

    // ─── Marker Manager ──────────────────────────────────────

    // Premiere marker color index → CSS color
    var MARKER_COLORS = {
        0: "#39B54A", // Green
        1: "#EF4444", // Red
        2: "#A94BCA", // Purple
        3: "#E8832E", // Orange
        4: "#E8D832", // Yellow
        5: "#FFFFFF", // White
        6: "#2F78E4", // Blue
        7: "#19F4D6"  // Cyan
    };

    function getMarkerCssColor(colorIndex) {
        return MARKER_COLORS[colorIndex] || "#9898a8";
    }

    function renderMarkerManager() {
        dom.markerList.innerHTML = "";
        state.selectedMarkerTimes = {};
        if (dom.selectAllCb) dom.selectAllCb.checked = false;
        updateSelectedCount();

        var markers = state.postMarkers || [];
        dom.markerMgrCount.textContent = markers.length;

        for (var i = 0; i < markers.length; i++) {
            var mk = markers[i];
            var markerColor = getMarkerCssColor(mk.colorIndex);

            var row = document.createElement("div");
            row.className = "marker-item" + (mk.hasComment ? " marker-has-comment" : "");
            row.setAttribute("data-time", mk.startSeconds);
            // Cell background tinted with marker's actual color
            if (mk.hasComment) {
                row.style.background = "rgba(56, 152, 255, 0.10)";
                row.style.borderLeft = "3px solid #3898FF";
            } else {
                row.style.borderLeft = "3px solid " + markerColor;
            }

            var checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "marker-checkbox";
            checkbox.setAttribute("data-time", mk.startSeconds);
            checkbox.addEventListener("change", (function(time) {
                return function(e) {
                    e.stopPropagation();
                    if (e.target.checked) {
                        state.selectedMarkerTimes[time] = true;
                    } else {
                        delete state.selectedMarkerTimes[time];
                    }
                    updateSelectedCount();
                };
            })(mk.startSeconds));

            var colorDot = document.createElement("span");
            colorDot.className = "marker-color-dot";
            colorDot.style.background = markerColor;

            var info = document.createElement("div");
            info.className = "marker-item-info";

            var markerName = mk.name || "Marcador";

            if (mk.hasComment && mk.editorNote) {
                // Has editor comment: Name + transcript on line 1, full comment on line 2
                var headerEl = document.createElement("div");
                headerEl.className = "marker-item-header";
                var nameStrong = document.createElement("strong");
                nameStrong.textContent = markerName;
                headerEl.appendChild(nameStrong);
                var transcriptPart = mk.transcript ? " - " + mk.transcript : "";
                headerEl.appendChild(document.createTextNode(transcriptPart));
                info.appendChild(headerEl);

                var noteEl = document.createElement("div");
                noteEl.className = "marker-item-comment";
                noteEl.textContent = mk.editorNote;
                info.appendChild(noteEl);
            } else {
                // No editor comment: Name + raw comment all on one line
                var lineEl = document.createElement("div");
                lineEl.className = "marker-item-header";
                var nameStrong2 = document.createElement("strong");
                nameStrong2.textContent = markerName;
                lineEl.appendChild(nameStrong2);
                var rawPart = mk.comments || "";
                lineEl.appendChild(document.createTextNode(rawPart ? " " + rawPart : ""));
                info.appendChild(lineEl);
            }

            var time = document.createElement("div");
            time.className = "marker-item-time";
            time.textContent = formatTimecode(mk.startSeconds);
            info.appendChild(time);

            row.appendChild(checkbox);
            row.appendChild(colorDot);
            row.appendChild(info);

            row.addEventListener("click", (function(seconds) {
                return function(e) {
                    if (e.target.tagName === "INPUT") return;
                    evalScript("movePlayhead(" + seconds + ")", function() {});
                };
            })(mk.startSeconds));

            dom.markerList.appendChild(row);
        }
    }

    function updateSelectedCount() {
        var count = Object.keys(state.selectedMarkerTimes).length;
        dom.selectedCount.textContent = count;
        dom.btnDeleteSelected.style.opacity = count > 0 ? "1" : "0.4";
    }

    function refreshMarkerList() {
        evalScript("getPostCutMarkers()", function(result) {
            if (result.markers) {
                state.postMarkers = result.markers;
                state.selectedMarkerTimes = {};
                renderMarkerManager();
            }
        });
    }

    function doDeleteNoComments() {
        evalScript("deleteMarkersWithoutComments()", function(result) {
            if (result.error) {
                showToast(result.error, "error");
                return;
            }
            showToast(result.deleted + " marcadores eliminados, " + result.remaining + " restantes.", "success");
            refreshMarkerList();
            refreshSequenceInfo();
        });
    }

    function doDeleteSelected() {
        var times = Object.keys(state.selectedMarkerTimes);
        if (times.length === 0) {
            showToast("Selecciona marcadores primero.", "info");
            return;
        }
        var timesNum = [];
        for (var i = 0; i < times.length; i++) {
            timesNum.push(parseFloat(times[i]));
        }
        var escaped = JSON.stringify(timesNum).replace(/'/g, "\\'");
        evalScript("deleteMarkersByTimes('" + escaped + "')", function(result) {
            if (result.error) {
                showToast(result.error, "error");
                return;
            }
            showToast(result.deleted + " marcadores eliminados.", "success");
            refreshMarkerList();
            refreshSequenceInfo();
        });
    }

    // ─── Select All Markers ─────────────────────────────────

    function toggleSelectAllMarkers(checked) {
        var boxes = dom.markerList.querySelectorAll(".marker-checkbox");
        state.selectedMarkerTimes = {};
        for (var i = 0; i < boxes.length; i++) {
            boxes[i].checked = checked;
            if (checked) {
                var t = boxes[i].getAttribute("data-time");
                if (t) state.selectedMarkerTimes[t] = true;
            }
        }
        updateSelectedCount();
    }

    // ─── View Mapping (Camera Activation) ───────────────────

    var VIEW_PRESETS_KEY = "editorpro_view_presets";

    function loadPresetsStore() {
        try {
            var raw = localStorage.getItem(VIEW_PRESETS_KEY);
            if (raw) {
                var store = JSON.parse(raw);
                if (store && store.presets) return store;
            }
            // Migrate old single-mapping format
            var oldRaw = localStorage.getItem("editorpro_view_mapping");
            if (oldRaw) {
                var old = JSON.parse(oldRaw);
                var migrated = {};
                for (var k in old) {
                    if (old.hasOwnProperty(k)) {
                        migrated[k] = typeof old[k] === "string" ? (old[k] ? [old[k]] : []) : old[k];
                    }
                }
                var store2 = { presets: { "Default": migrated }, active: "Default" };
                localStorage.setItem(VIEW_PRESETS_KEY, JSON.stringify(store2));
                localStorage.removeItem("editorpro_view_mapping");
                return store2;
            }
        } catch(e) {}
        return { presets: { "Default": {} }, active: "Default" };
    }

    function savePresetsStore(store) {
        try { localStorage.setItem(VIEW_PRESETS_KEY, JSON.stringify(store)); } catch(e) {}
    }

    function getActivePresetMapping(store) {
        return store.presets[store.active] || {};
    }

    function getUniqueMarkerNames(markers) {
        var names = {};
        for (var i = 0; i < markers.length; i++) {
            var mk = markers[i];
            if (mk.isOut) continue;
            var n = (mk.name || "").trim();
            if (n && n !== "K") names[n] = true;
        }
        var result = [];
        for (var k in names) {
            if (names.hasOwnProperty(k)) result.push(k);
        }
        result.sort();
        return result;
    }

    function buildSegmentsFromMarkers(markers) {
        var filtered = [];
        for (var i = 0; i < markers.length; i++) {
            var mk = markers[i];
            if (!mk.isOut) {
                var n = (mk.name || "").trim();
                if (n && n !== "K") {
                    filtered.push({ time: mk.startSeconds, name: n });
                }
            }
        }
        filtered.sort(function(a, b) { return a.time - b.time; });

        var segments = [];
        for (var s = 0; s < filtered.length; s++) {
            var end = (s < filtered.length - 1) ? filtered[s + 1].time : (state.seqDuration || filtered[s].time + 3600);
            segments.push({ start: filtered[s].time, end: end, name: filtered[s].name });
        }
        return segments;
    }

    function updateMappingFromUI() {
        var mapping = {};
        var rows = dom.viewSection.querySelectorAll(".view-mapping-row");
        for (var r = 0; r < rows.length; r++) {
            var markerName = rows[r].getAttribute("data-marker-name");
            if (!markerName) continue;
            var checked = rows[r].querySelectorAll(".view-track-cb:checked");
            var tracks = [];
            for (var c = 0; c < checked.length; c++) {
                tracks.push(checked[c].value);
            }
            mapping[markerName] = tracks;
        }
        state.viewMapping = mapping;

        var store = loadPresetsStore();
        store.presets[store.active] = mapping;
        savePresetsStore(store);
    }

    function renderViewMapping() {
        dom.viewSection.innerHTML = "";
        dom.viewSection.classList.add("hidden");

        var markers = state.postMarkers || [];
        var names = getUniqueMarkerNames(markers);
        if (names.length === 0) return;

        evalScript("getVideoTrackNames()", function(data) {
            if (data.error || !data.tracks || data.tracks.length === 0) return;

            state.videoTracks = data.tracks;
            var store = loadPresetsStore();
            var mapping = getActivePresetMapping(store);

            var wrap = document.createElement("div");
            wrap.className = "view-section collapsible-section";

            // ── Header (collapsible) ──
            var header = document.createElement("div");
            header.className = "collapsible-header";
            var title = document.createElement("span");
            title.className = "view-section-title";
            title.textContent = "Vista de Cámaras";
            header.appendChild(title);
            var colIcon = document.createElement("span");
            colIcon.className = "collapsible-icon";
            colIcon.textContent = "\u25BE";
            header.appendChild(colIcon);
            header.addEventListener("click", function() {
                wrap.classList.toggle("collapsed");
            });
            wrap.appendChild(header);

            var body = document.createElement("div");
            body.className = "collapsible-body";

            // ── Preset Bar ──
            var presetBar = document.createElement("div");
            presetBar.className = "view-preset-bar";

            var presetSelect = document.createElement("select");
            presetSelect.className = "view-preset-select";
            var presetNames = Object.keys(store.presets);
            for (var p = 0; p < presetNames.length; p++) {
                var pOpt = document.createElement("option");
                pOpt.value = presetNames[p];
                pOpt.textContent = presetNames[p];
                if (presetNames[p] === store.active) pOpt.selected = true;
                presetSelect.appendChild(pOpt);
            }
            presetSelect.addEventListener("change", function() {
                var st = loadPresetsStore();
                st.active = presetSelect.value;
                savePresetsStore(st);
                renderViewMapping();
            });
            presetBar.appendChild(presetSelect);

            var btnNewPreset = document.createElement("button");
            btnNewPreset.className = "btn btn-ghost btn-sm";
            btnNewPreset.textContent = "+ Nuevo";
            btnNewPreset.addEventListener("click", function() {
                var name = prompt("Nombre del nuevo preset:");
                if (!name || !name.trim()) return;
                name = name.trim();
                var st = loadPresetsStore();
                if (st.presets[name]) {
                    showToast("Ya existe un preset con ese nombre.", "info");
                    return;
                }
                st.presets[name] = JSON.parse(JSON.stringify(st.presets[st.active] || {}));
                st.active = name;
                savePresetsStore(st);
                renderViewMapping();
            });
            presetBar.appendChild(btnNewPreset);

            var btnRename = document.createElement("button");
            btnRename.className = "btn btn-ghost btn-sm";
            btnRename.textContent = "Renombrar";
            btnRename.addEventListener("click", function() {
                var st = loadPresetsStore();
                var newName = prompt("Nuevo nombre:", st.active);
                if (!newName || !newName.trim() || newName.trim() === st.active) return;
                newName = newName.trim();
                if (st.presets[newName]) {
                    showToast("Ya existe un preset con ese nombre.", "info");
                    return;
                }
                st.presets[newName] = st.presets[st.active];
                delete st.presets[st.active];
                st.active = newName;
                savePresetsStore(st);
                renderViewMapping();
            });
            presetBar.appendChild(btnRename);

            if (presetNames.length > 1) {
                var btnDelete = document.createElement("button");
                btnDelete.className = "btn btn-ghost btn-sm btn-danger-text";
                btnDelete.textContent = "Borrar";
                btnDelete.addEventListener("click", function() {
                    var st = loadPresetsStore();
                    var keys = Object.keys(st.presets);
                    if (keys.length <= 1) return;
                    delete st.presets[st.active];
                    st.active = Object.keys(st.presets)[0];
                    savePresetsStore(st);
                    renderViewMapping();
                });
                presetBar.appendChild(btnDelete);
            }

            body.appendChild(presetBar);

            // ── Mapping rows ──
            var list = document.createElement("div");
            list.className = "view-mapping-list";

            for (var i = 0; i < names.length; i++) {
                (function(markerName) {
                    var saved = mapping[markerName] || [];
                    if (typeof saved === "string") saved = saved ? [saved] : [];

                    var row = document.createElement("div");
                    row.className = "view-mapping-row";
                    row.setAttribute("data-marker-name", markerName);

                    var nameEl = document.createElement("span");
                    nameEl.className = "view-mapping-name";
                    nameEl.textContent = markerName;
                    row.appendChild(nameEl);

                    var arrow = document.createElement("span");
                    arrow.className = "view-mapping-arrow";
                    arrow.textContent = "→";
                    row.appendChild(arrow);

                    var tracksWrap = document.createElement("div");
                    tracksWrap.className = "view-tracks-wrap";

                    for (var t = 0; t < data.tracks.length; t++) {
                        (function(trackName) {
                            var lbl = document.createElement("label");
                            lbl.className = "view-track-label";

                            var cb = document.createElement("input");
                            cb.type = "checkbox";
                            cb.className = "view-track-cb";
                            cb.value = trackName;
                            if (saved.indexOf(trackName) !== -1) cb.checked = true;

                            cb.addEventListener("change", updateMappingFromUI);

                            lbl.appendChild(cb);
                            lbl.appendChild(document.createTextNode(" " + trackName));
                            tracksWrap.appendChild(lbl);
                        })(data.tracks[t].name);
                    }

                    row.appendChild(tracksWrap);
                    list.appendChild(row);

                    state.viewMapping[markerName] = saved;
                })(names[i]);
            }

            body.appendChild(list);

            // ── Footer ──
            var footer = document.createElement("div");
            footer.className = "view-section-footer";

            var btnActivate = document.createElement("button");
            btnActivate.className = "btn-analyze btn-analyze-alt";
            btnActivate.style.cssText = "font-size:12px;padding:10px 12px;";
            btnActivate.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h4v8H2zM10 4h4v8h-4z" stroke="currentColor" stroke-width="1.2"/><path d="M6 8h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg> <span>Activar Vistas</span>';
            btnActivate.addEventListener("click", doActivateViews);
            footer.appendChild(btnActivate);
            body.appendChild(footer);

            wrap.appendChild(body);
            dom.viewSection.appendChild(wrap);
            dom.viewSection.classList.remove("hidden");
        });
    }

    function doActivateViews() {
        var hasAnyMapping = false;
        for (var k in state.viewMapping) {
            if (state.viewMapping.hasOwnProperty(k) && state.viewMapping[k] && state.viewMapping[k].length > 0) {
                hasAnyMapping = true;
                break;
            }
        }
        if (!hasAnyMapping) {
            showToast("Asigna al menos un track a un nombre de marcador.", "info");
            return;
        }

        var markers = state.postMarkers || [];
        var segments = buildSegmentsFromMarkers(markers);
        if (segments.length === 0) {
            showToast("No se encontraron segmentos válidos.", "info");
            return;
        }

        var activationData = JSON.stringify({
            mapping: state.viewMapping,
            segments: segments
        });

        var tmpDir = os.tmpdir();
        var tmpPath = path.join(tmpDir, "PRCutter_views.json");

        try {
            fs.writeFileSync(tmpPath, activationData, "utf8");
        } catch(e) {
            showToast("Error al escribir archivo temporal: " + e.message, "error");
            return;
        }

        var escaped = escExtend(tmpPath);
        showToast("Aplicando vistas...", "info");

        evalScript('activateViews("' + escaped + '")', function(result) {
            if (result.error) {
                showToast(result.error, "error");
                return;
            }
            showToast(
                "Vistas activadas: " + result.enabled + " clips habilitados, " +
                result.disabled + " deshabilitados.",
                "success"
            );
        });
    }

    // ─── Batch Mode ─────────────────────────────────────────

    function finishBatchProcessing() {
        state.batchProcessing = false;
        state.batchStopping = false;
        dom.btnAnalyze.classList.remove("btn-disabled");
        setBatchButtonMode("default");
    }

    function doBatchAnalyze() {
        state.batchMode = true;
        state.batchProcessing = true;
        state.batchStopping = false;
        state.batchSequences = [];
        state.batchResults = [];
        state.batchLog = [];

        var btnResume = document.getElementById("btn-cutter-resume-session");
        if (btnResume) btnResume.classList.add("hidden");
        dom.emptyState.classList.add("hidden");
        dom.resultsSection.classList.add("hidden");
        dom.resultDone.classList.add("hidden");
        dom.batchSection.classList.add("hidden");
        dom.batchDone.classList.add("hidden");
        if (dom.batchSelectAllCb) dom.batchSelectAllCb.checked = true;
        dom.analyzeProgress.classList.remove("hidden");
        dom.analyzeProgressFill.style.width = "5%";
        dom.analyzeProgressText.textContent = "Detectando secuencias abiertas...";
        dom.btnAnalyze.classList.add("btn-disabled");
        setBatchButtonMode("stop");

        evalScript("getAllProjectSequences()", function(data) {
            if (data.error) {
                dom.analyzeProgress.classList.add("hidden");
                dom.emptyState.classList.remove("hidden");
                finishBatchProcessing();
                showToast(data.error, "error");
                return;
            }

            var allSequences = data.sequences || [];
            var probeReliable = !!data.probeReliable;

            var sequences = [];
            for (var fi = 0; fi < allSequences.length; fi++) {
                if (probeReliable) {
                    if (allSequences[fi].isOpen) sequences.push(allSequences[fi]);
                } else {
                    sequences.push(allSequences[fi]);
                }
            }

            if (sequences.length === 0) {
                dom.analyzeProgress.classList.add("hidden");
                dom.emptyState.classList.remove("hidden");
                finishBatchProcessing();
                showToast("No se encontraron secuencias abiertas en el timeline.", "error");
                return;
            }

            var toAnalyze = [];
            for (var i = 0; i < sequences.length; i++) {
                if (sequences[i].markerCount >= 2) {
                    toAnalyze.push(sequences[i]);
                }
            }

            dom.analyzeProgressText.textContent = "Analizando " + toAnalyze.length + " secuencias...";

            var analyzed = 0;
            var total = toAnalyze.length;

            function analyzeNext() {
                if (state.batchStopping) {
                    dom.analyzeProgress.classList.add("hidden");
                    finishBatchProcessing();
                    if (state.batchSequences.length > 0) {
                        state.batchSequences.sort(function(a, b) {
                            return a.seqName.localeCompare(b.seqName);
                        });
                        renderBatchPreview();
                        dom.batchSection.classList.remove("hidden");
                        showToast("Detenido. " + state.batchSequences.length + " secuencias analizadas de " + total + ".", "info");
                    } else {
                        dom.emptyState.classList.remove("hidden");
                        showToast("Análisis detenido.", "info");
                    }
                    return;
                }

                if (analyzed >= total) {
                    setTimeout(function() {
                        dom.analyzeProgress.classList.add("hidden");
                        finishBatchProcessing();

                        if (state.batchSequences.length === 0) {
                            dom.emptyState.classList.remove("hidden");
                            showToast("Ninguna secuencia tiene pares IN/OUT válidos.", "info");
                            return;
                        }

                        state.batchSequences.sort(function(a, b) {
                            return a.seqName.localeCompare(b.seqName);
                        });

                        renderBatchPreview();
                        dom.batchSection.classList.remove("hidden");
                        showToast(state.batchSequences.length + " secuencias con cortes detectados.", "success");
                    }, 50);
                    return;
                }

                var seq = toAnalyze[analyzed];
                var pct = 10 + Math.round((analyzed / total) * 85);
                dom.analyzeProgressFill.style.width = pct + "%";
                dom.analyzeProgressText.textContent = "Analizando: " + seq.name + " (" + (analyzed + 1) + "/" + total + ")";

                evalScript('getMarkersForSequence("' + seq.sequenceID + '")', function(mData) {
                    if (mData.error || !mData.markers) {
                        analyzed++;
                        analyzeNext();
                        return;
                    }

                    var durSeconds = 0;
                    if (mData.duration) {
                        durSeconds = parseFloat(mData.duration) / 254016000000;
                    }

                    var prevDur = state.seqDuration;
                    state.seqDuration = durSeconds;
                    var result = parseMarkers(mData.markers);
                    state.seqDuration = prevDur;

                    var isValid = !result.error && result.keepBlocks.length > 0;
                    if (!isValid) {
                        analyzed++;
                        analyzeNext();
                        return;
                    }

                    var commentCount = 0;
                    for (var c = 0; c < result.keepBlocks.length; c++) {
                        if (result.keepBlocks[c].hasComment) commentCount++;
                    }

                    state.batchSequences.push({
                        seqId: seq.sequenceID,
                        seqName: seq.name,
                        seqDuration: durSeconds,
                        markers: mData.markers,
                        keepBlocks: result.keepBlocks,
                        removeZones: result.removeZones || [],
                        warnings: result.warnings || [],
                        commentCount: commentCount,
                        valid: true,
                        checked: true
                    });

                    analyzed++;
                    analyzeNext();
                });
            }

            if (total === 0) {
                dom.analyzeProgress.classList.add("hidden");
                dom.emptyState.classList.remove("hidden");
                finishBatchProcessing();
                showToast("Ninguna secuencia abierta tiene pares IN/OUT válidos.", "info");
                return;
            }

            analyzeNext();
        });
    }

    function renderBatchPreview() {
        dom.batchList.innerHTML = "";

        var validCount = 0;
        for (var i = 0; i < state.batchSequences.length; i++) {
            var seq = state.batchSequences[i];
            if (!seq.valid) continue;
            validCount++;

            var item = document.createElement("div");
            item.className = "batch-seq-item";

            var checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "batch-seq-checkbox";
            checkbox.checked = seq.checked;
            checkbox.setAttribute("data-idx", i);
            checkbox.addEventListener("change", (function(idx) {
                return function(e) {
                    state.batchSequences[idx].checked = e.target.checked;
                };
            })(i));

            var info = document.createElement("div");
            info.className = "batch-seq-info";

            var name = document.createElement("div");
            name.className = "batch-seq-name";
            name.textContent = seq.seqName;
            info.appendChild(name);

            var meta = document.createElement("div");
            meta.className = "batch-seq-meta";

            var keepDur = 0, removeDur = 0;
            for (var k = 0; k < seq.keepBlocks.length; k++) {
                keepDur += (seq.keepBlocks[k].outTime - seq.keepBlocks[k].inTime);
            }
            for (var r = 0; r < seq.removeZones.length; r++) {
                removeDur += (seq.removeZones[r].end - seq.removeZones[r].start);
            }
            meta.textContent = seq.keepBlocks.length + " bloques | " +
                seq.removeZones.length + " cortes | " +
                formatTime(removeDur) + " a eliminar";
            info.appendChild(meta);

            var stats = document.createElement("div");
            stats.className = "batch-seq-stats";

            var keepPill = document.createElement("span");
            keepPill.className = "batch-stat-pill keep";
            keepPill.textContent = seq.keepBlocks.length + " KEEP";
            stats.appendChild(keepPill);

            var removePill = document.createElement("span");
            removePill.className = "batch-stat-pill remove";
            removePill.textContent = seq.removeZones.length + " CUT";
            stats.appendChild(removePill);

            if (seq.commentCount > 0) {
                var commentPill = document.createElement("span");
                commentPill.className = "batch-stat-pill comment";
                commentPill.textContent = seq.commentCount + " notas";
                stats.appendChild(commentPill);
            }

            if (seq.warnings && seq.warnings.length > 0) {
                var warnPill = document.createElement("span");
                warnPill.className = "batch-stat-pill";
                warnPill.style.cssText = "background:rgba(251,191,36,0.1);color:#fbbf24;border:1px solid rgba(251,191,36,0.25);";
                warnPill.textContent = "\u26A0 " + seq.warnings.length;
                warnPill.title = seq.warnings.length + " marcador(es) con problemas";
                stats.appendChild(warnPill);
            }

            item.appendChild(checkbox);
            item.appendChild(info);
            item.appendChild(stats);
            dom.batchList.appendChild(item);
        }

        dom.batchSeqCount.textContent = validCount;
    }

    function showBatchConfirm() {
        var selected = [];
        for (var i = 0; i < state.batchSequences.length; i++) {
            if (state.batchSequences[i].checked && state.batchSequences[i].valid) {
                selected.push(state.batchSequences[i]);
            }
        }

        if (selected.length === 0) {
            showToast("Selecciona al menos una secuencia.", "info");
            return;
        }

        var totalRemove = 0;
        for (var s = 0; s < selected.length; s++) {
            for (var r = 0; r < selected[s].removeZones.length; r++) {
                totalRemove += (selected[s].removeZones[r].end - selected[s].removeZones[r].start);
            }
        }

        dom.confirmMsg.textContent =
            "Se creará un backup de cada secuencia y se ejecutarán los cortes en " +
            selected.length + " secuencia" + (selected.length !== 1 ? "s" : "") +
            " (" + formatTime(totalRemove) + " a eliminar en total). " +
            "Las secuencias se procesarán una a una.";

        dom.confirmOverlay.classList.remove("hidden");
        // Override confirm button to batch execute
        state._batchConfirmPending = true;
    }

    function doBatchExecute() {
        hideConfirmDialog();

        var selected = [];
        for (var i = 0; i < state.batchSequences.length; i++) {
            if (state.batchSequences[i].checked && state.batchSequences[i].valid) {
                selected.push(state.batchSequences[i]);
            }
        }

        if (selected.length === 0) return;

        state.batchResults = [];
        state.batchLog = [];
        state.batchProcessing = true;
        state.batchStopping = false;

        dom.batchSection.classList.add("hidden");
        dom.analyzeProgress.classList.remove("hidden");
        dom.analyzeProgressFill.style.width = "0%";
        dom.analyzeProgressText.textContent = "Preparando cortes en lote...";
        dom.btnAnalyze.classList.add("btn-disabled");
        setBatchButtonMode("stop");

        var current = 0;
        var total = selected.length;

        function processNext() {
            if (state.batchStopping) {
                dom.analyzeProgressFill.style.width = "100%";
                dom.analyzeProgressText.textContent = "Detenido.";
                dom.analyzeProgress.classList.add("hidden");
                finishBatchProcessing();
                if (state.batchResults.length > 0) {
                    renderBatchResults();
                    dom.batchDone.classList.remove("hidden");
                    showToast("Detenido. " + state.batchResults.length + " de " + total + " secuencias procesadas.", "info");
                } else {
                    dom.batchSection.classList.remove("hidden");
                    showToast("Proceso detenido antes de completar cortes.", "info");
                }
                return;
            }

            if (current >= total) {
                dom.analyzeProgressFill.style.width = "100%";
                dom.analyzeProgressText.textContent = "Lote completado.";

                setTimeout(function() {
                    dom.analyzeProgress.classList.add("hidden");
                    finishBatchProcessing();
                    renderBatchResults();
                    dom.batchDone.classList.remove("hidden");
                }, 50);
                return;
            }

            var seq = selected[current];
            var basePct = Math.round((current / total) * 100);
            dom.analyzeProgressFill.style.width = basePct + "%";
            dom.analyzeProgressText.textContent =
                "(" + (current + 1) + "/" + total + ") Abriendo: " + seq.seqName + "...";

            state.batchLog.push("=== " + seq.seqName + " ===");

            evalScript('openSequenceById("' + seq.seqId + '")', function(openResult) {
                if (openResult.error) {
                    state.batchLog.push("ERROR al abrir: " + openResult.error);
                    state.batchResults.push({
                        seqId: seq.seqId,
                        seqName: seq.seqName,
                        success: false,
                        error: openResult.error,
                        detail: "",
                        log: []
                    });
                    current++;
                    processNext();
                    return;
                }

                dom.analyzeProgressText.textContent =
                    "(" + (current + 1) + "/" + total + ") Backup: " + seq.seqName + "...";
                dom.analyzeProgressFill.style.width = basePct + Math.round((1 / total) * 25) + "%";

                evalScript("backupSequence()", function(backupResult) {
                    if (backupResult.error) {
                        state.batchLog.push("Backup fallo: " + backupResult.error);
                    } else {
                        state.batchLog.push("Backup: " + (backupResult.backupName || "OK"));
                    }

                    dom.analyzeProgressText.textContent =
                        "(" + (current + 1) + "/" + total + ") Cortando: " + seq.seqName + "...";
                    dom.analyzeProgressFill.style.width = basePct + Math.round((1 / total) * 50) + "%";

                    var cutData = JSON.stringify({
                        removeZones: seq.removeZones,
                        seqName: seq.seqName,
                        timestamp: new Date().toISOString()
                    });

                    var tmpDir = os.tmpdir();
                    var tmpPath = path.join(tmpDir, "PRCutter_batch_" + current + ".json");

                    try {
                        fs.writeFileSync(tmpPath, cutData, "utf8");
                    } catch(e) {
                        state.batchLog.push("ERROR archivo temporal: " + e.message);
                        state.batchResults.push({
                            seqId: seq.seqId,
                            seqName: seq.seqName,
                            success: false,
                            error: "Error escribiendo archivo temporal",
                            detail: "",
                            log: []
                        });
                        current++;
                        processNext();
                        return;
                    }

                    var escaped = escExtend(tmpPath);
                    evalScript('executeCuts("' + escaped + '")', function(cutResult) {
                        dom.analyzeProgressText.textContent =
                            "(" + (current + 1) + "/" + total + ") Finalizando: " + seq.seqName + "...";
                        dom.analyzeProgressFill.style.width = basePct + Math.round((1 / total) * 85) + "%";

                        var s = cutResult.stats || {};
                        var seqLog = cutResult.log || [];

                        for (var li = 0; li < seqLog.length; li++) {
                            state.batchLog.push("  " + seqLog[li]);
                        }

                        if (cutResult.error) {
                            state.batchLog.push("ERROR: " + cutResult.error);
                            state.batchResults.push({
                                seqId: seq.seqId,
                                seqName: seq.seqName,
                                success: false,
                                error: cutResult.error,
                                detail: "",
                                log: seqLog
                            });
                            current++;
                            processNext();
                        } else {
                            var detail = "Método: " + (s.method || "?") +
                                " | Eliminados: " + (s.removed || 0) +
                                (s.errors > 0 ? " | Errores: " + s.errors : "");
                            state.batchLog.push(detail);
                            state.batchResults.push({
                                seqId: seq.seqId,
                                seqName: seq.seqName,
                                success: true,
                                error: null,
                                detail: detail,
                                removed: s.removed || 0,
                                errors: s.errors || 0,
                                log: seqLog
                            });
                            current++;
                            processNext();
                        }
                    });
                });
            });
        }

        processNext();
    }

    function renderBatchResults() {
        dom.batchResultsList.innerHTML = "";

        var successCount = 0;
        var failCount = 0;
        var totalRemoved = 0;

        for (var i = 0; i < state.batchResults.length; i++) {
            var r = state.batchResults[i];
            if (r.success) { successCount++; totalRemoved += (r.removed || 0); }
            else failCount++;

            var item = document.createElement("div");
            item.className = "batch-result-item " + (r.success ? "success" : "error");

            var icon = document.createElement("span");
            icon.className = "batch-result-icon";
            icon.textContent = r.success ? "\u2713" : "\u2717";
            icon.style.color = r.success ? "var(--success)" : "var(--error)";

            var info = document.createElement("div");
            info.className = "batch-result-info";

            var nameRow = document.createElement("div");
            nameRow.className = "batch-result-name";
            if (r.success) {
                nameRow.style.cursor = "pointer";
                nameRow.style.textDecoration = "underline";
                nameRow.style.textDecorationColor = "rgba(255,255,255,0.3)";
                nameRow.addEventListener("click", (function(seqId, seqName) {
                    return function() { openBatchSequence(seqId, seqName); };
                })(r.seqId, r.seqName));
            }
            nameRow.textContent = r.seqName;
            info.appendChild(nameRow);

            var detail = document.createElement("div");
            detail.className = "batch-result-detail";
            detail.textContent = r.success ? r.detail : "Error: " + r.error;
            info.appendChild(detail);

            item.appendChild(icon);
            item.appendChild(info);

            if (r.success) {
                var restoreBtn = document.createElement("button");
                restoreBtn.className = "btn btn-ghost btn-sm btn-warning-text batch-restore-btn";
                restoreBtn.textContent = "Restaurar";
                restoreBtn.setAttribute("data-seq-id", r.seqId);
                restoreBtn.addEventListener("click", (function(seqId, seqName, btnEl) {
                    return function(e) {
                        e.stopPropagation();
                        doBatchRestore(seqId, seqName, btnEl);
                    };
                })(r.seqId, r.seqName, restoreBtn));
                item.appendChild(restoreBtn);
            }

            dom.batchResultsList.appendChild(item);
        }

        dom.batchResultDetail.textContent =
            successCount + " completada" + (successCount !== 1 ? "s" : "") +
            (failCount > 0 ? ", " + failCount + " con error" : "") +
            " | " + totalRemoved + " zonas eliminadas en total";
    }

    function findBatchIdx(seqId) {
        for (var i = 0; i < state.batchResults.length; i++) {
            if (state.batchResults[i].seqId === seqId) return i;
        }
        return -1;
    }

    function openBatchSequence(seqId, seqName) {
        state.currentBatchIdx = findBatchIdx(seqId);

        evalScript('openSequenceById("' + seqId + '")', function(result) {
            if (result.error) {
                showToast("Error al abrir: " + result.error, "error");
                return;
            }
            showToast("Secuencia abierta: " + seqName, "success");
            refreshSequenceInfo();

            dom.batchDone.classList.add("hidden");
            dom.resultDone.classList.remove("hidden");
            dom.resultMsg.textContent = seqName;
            dom.resultDetail.textContent = "";
            state.lastLog = [];

            dom.btnRestore.style.display = "none";
            dom.btnCopyLog.style.display = "none";

            renderBatchNavBar();

            evalScript("getPostCutMarkers()", function(markerResult) {
                if (markerResult.markers) {
                    state.postMarkers = markerResult.markers;
                    state.selectedMarkerTimes = {};
                    renderMarkerManager();
                    renderViewMapping();
                }
            });
        });
    }

    function renderBatchNavBar() {
        var existing = document.getElementById("batch-nav-bar");
        if (existing) existing.remove();

        var bar = document.createElement("div");
        bar.id = "batch-nav-bar";
        bar.className = "batch-nav-bar";

        var idx = state.currentBatchIdx;
        var total = state.batchResults.length;
        var hasPrev = idx > 0;
        var hasNext = idx < total - 1;

        var btnPrev = document.createElement("button");
        btnPrev.className = "btn-batch-nav" + (hasPrev ? "" : " disabled");
        btnPrev.innerHTML = "&#8592;";
        btnPrev.title = hasPrev ? state.batchResults[idx - 1].seqName : "";
        if (hasPrev) {
            btnPrev.addEventListener("click", function() {
                var prev = state.batchResults[idx - 1];
                openBatchSequence(prev.seqId, prev.seqName);
            });
        }

        var btnBack = document.createElement("button");
        btnBack.className = "btn-back-nav";
        btnBack.style.flex = "1";
        btnBack.innerHTML = "&#8592; Volver a resultados";
        btnBack.addEventListener("click", function() {
            dom.resultDone.classList.add("hidden");
            dom.batchDone.classList.remove("hidden");
            dom.btnRestore.style.display = "";
            dom.btnCopyLog.style.display = "";
            bar.remove();
        });

        var btnNext = document.createElement("button");
        btnNext.className = "btn-batch-nav" + (hasNext ? "" : " disabled");
        btnNext.innerHTML = "&#8594;";
        btnNext.title = hasNext ? state.batchResults[idx + 1].seqName : "";
        if (hasNext) {
            btnNext.addEventListener("click", function() {
                var next = state.batchResults[idx + 1];
                openBatchSequence(next.seqId, next.seqName);
            });
        }

        bar.appendChild(btnPrev);
        bar.appendChild(btnBack);
        bar.appendChild(btnNext);
        dom.resultDone.insertBefore(bar, dom.resultDone.firstChild);
    }

    function doBatchRestore(seqId, seqName, btnEl) {
        btnEl.textContent = "Restaurando...";
        btnEl.classList.add("btn-disabled");

        evalScript('restoreBackupById("' + seqId + '")', function(result) {
            if (result.error) {
                btnEl.textContent = "Error";
                btnEl.classList.remove("btn-disabled");
                showToast("Error: " + result.error, "error");
                return;
            }
            btnEl.textContent = "Restaurado";
            showToast("Backup restaurado: " + seqName, "success");
            refreshSequenceInfo();
        });
    }

    function doBatchRestoreAll() {
        var toRestore = [];
        for (var i = 0; i < state.batchResults.length; i++) {
            var r = state.batchResults[i];
            if (r.success && !r.restored) toRestore.push(r);
        }
        if (toRestore.length === 0) {
            showToast("No hay secuencias para restaurar.", "info");
            return;
        }

        dom.btnBatchRestoreAll.textContent = "Restaurando...";
        dom.btnBatchRestoreAll.classList.add("btn-disabled");

        var idx = 0;
        var restoredCount = 0;
        var failedCount = 0;
        function restoreNext() {
            if (idx >= toRestore.length) {
                if (restoredCount > 0) {
                    dom.btnBatchRestoreAll.textContent = "Todas restauradas";
                    showToast(restoredCount + " secuencia(s) restaurada(s).", "success");
                } else {
                    dom.btnBatchRestoreAll.textContent = "Restaurar todas";
                    dom.btnBatchRestoreAll.classList.remove("btn-disabled");
                    showToast("No se pudieron restaurar las secuencias. Backups no encontrados.", "error");
                }
                refreshSequenceInfo();
                return;
            }
            var r = toRestore[idx];
            evalScript('restoreBackupById("' + r.seqId + '")', function(result) {
                if (!result.error) {
                    r.restored = true;
                    restoredCount++;
                    var btns = dom.batchResultsList.querySelectorAll(".btn-warning-text");
                    for (var b = 0; b < btns.length; b++) {
                        if (btns[b].getAttribute("data-seq-id") === r.seqId) {
                            btns[b].textContent = "Restaurado";
                            btns[b].classList.add("btn-disabled");
                        }
                    }
                } else {
                    failedCount++;
                }
                idx++;
                restoreNext();
            });
        }
        restoreNext();
    }

    function doBatchCopyLog() {
        var log = state.batchLog || [];
        if (log.length === 0) {
            showToast("No hay log disponible.", "info");
            return;
        }
        try {
            var ta = document.createElement("textarea");
            ta.value = log.join("\n");
            ta.style.cssText = "position:fixed;left:-9999px;";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            dom.btnBatchCopyLog.textContent = "Copiado!";
            setTimeout(function() { dom.btnBatchCopyLog.textContent = "Copiar Log"; }, 1500);
        } catch(e) {
            showToast("Error al copiar", "error");
        }
    }

    function doBatchBack() {
        dom.batchDone.classList.add("hidden");
        dom.batchSection.classList.add("hidden");
        dom.resultDone.classList.add("hidden");
        dom.emptyState.classList.remove("hidden");
        dom.btnRestore.style.display = "";
        dom.btnCopyLog.style.display = "";
        var navBar = document.getElementById("batch-nav-bar");
        if (navBar) navBar.remove();
        state.batchMode = false;
        updateResumeButton();
        refreshSequenceInfo();
    }

    function updateResumeButton() {
        var btn = document.getElementById("btn-cutter-resume-session");
        if (!btn) return;
        var hasBatchDone = state.batchResults && state.batchResults.length > 0;
        var hasBatchPreview = state.batchSequences && state.batchSequences.length > 0 && !hasBatchDone;
        if (hasBatchDone || hasBatchPreview) {
            btn.classList.remove("hidden");
            btn.textContent = hasBatchDone
                ? "Volver a resultados (" + state.batchResults.length + " secuencias)"
                : "Volver al análisis (" + state.batchSequences.length + " secuencias)";
        } else {
            btn.classList.add("hidden");
        }
    }

    function doResumeSession() {
        dom.emptyState.classList.add("hidden");
        if (state.batchResults && state.batchResults.length > 0) {
            renderBatchResults();
            dom.batchDone.classList.remove("hidden");
        } else if (state.batchSequences && state.batchSequences.length > 0) {
            renderBatchPreview();
            dom.batchSection.classList.remove("hidden");
        }
        state.batchMode = true;
    }

    // ─── Event Listeners ─────────────────────────────────────

    function bindCutterEvents() {
        if (dom.btnAnalyze) dom.btnAnalyze.addEventListener("click", function() {
            if (state.singleProcessing) {
                state.singleStopping = true;
                dom.analyzeProgressText.textContent = "Deteniendo...";
                dom.btnAnalyze.classList.add("btn-disabled");
                return;
            }
            state.batchMode = false;
            dom.batchSection.classList.add("hidden");
            dom.batchDone.classList.add("hidden");
            doAnalyze();
        });
        if (dom.btnBatchAnalyze) dom.btnBatchAnalyze.addEventListener("click", function() {
            if (state.batchProcessing) {
                state.batchStopping = true;
                dom.analyzeProgressText.textContent = "Deteniendo...";
                dom.btnBatchAnalyze.classList.add("btn-disabled");
                return;
            }
            doBatchAnalyze();
        });
        if (dom.btnBatchExecute) dom.btnBatchExecute.addEventListener("click", showBatchConfirm);
        if (dom.batchSelectAllCb) dom.batchSelectAllCb.addEventListener("change", function() {
            var checked = dom.batchSelectAllCb.checked;
            for (var i = 0; i < state.batchSequences.length; i++) {
                state.batchSequences[i].checked = checked;
            }
            var boxes = dom.batchList.querySelectorAll(".batch-seq-checkbox");
            for (var b = 0; b < boxes.length; b++) {
                boxes[b].checked = checked;
            }
        });
        if (dom.btnBatchCopyLog) dom.btnBatchCopyLog.addEventListener("click", doBatchCopyLog);
        if (dom.btnBatchBack) dom.btnBatchBack.addEventListener("click", doBatchBack);
        var btnResume = document.getElementById("btn-cutter-resume-session");
        if (btnResume) btnResume.addEventListener("click", doResumeSession);
        if (dom.btnBatchRestoreAll) dom.btnBatchRestoreAll.addEventListener("click", doBatchRestoreAll);
        if (dom.btnExecute) dom.btnExecute.addEventListener("click", showConfirmDialog);
        if (dom.btnCancel) dom.btnCancel.addEventListener("click", hideConfirmDialog);
        if (dom.btnConfirm) dom.btnConfirm.addEventListener("click", function() {
            if (state._batchConfirmPending) {
                state._batchConfirmPending = false;
                doBatchExecute();
            } else {
                doExecute();
            }
        });
        if (dom.btnRestore) dom.btnRestore.addEventListener("click", doRestore);
        if (dom.btnCopyLog) dom.btnCopyLog.addEventListener("click", doCopyLog);
        if (dom.btnDeleteNoComments) dom.btnDeleteNoComments.addEventListener("click", doDeleteNoComments);
        if (dom.btnDeleteSelected) dom.btnDeleteSelected.addEventListener("click", doDeleteSelected);
        if (dom.selectAllCb) dom.selectAllCb.addEventListener("change", function() {
            toggleSelectAllMarkers(dom.selectAllCb.checked);
        });
        if (dom.markerMgrToggle) dom.markerMgrToggle.addEventListener("click", function() {
            dom.markerManager.classList.toggle("collapsed");
        });

        if (dom.confirmOverlay) dom.confirmOverlay.addEventListener("click", function(e) {
            if (e.target === dom.confirmOverlay) {
                state._batchConfirmPending = false;
                hideConfirmDialog();
            }
        });
    }

    // ─── Init ────────────────────────────────────────────────

    bindCutterEvents();
    refreshSequenceInfo();
    setInterval(refreshSequenceInfo, 10000);

    // Sync header progress whenever main progress or body visibility changes
    var progressObserver = new MutationObserver(syncHeaderProgress);
    if (dom.analyzeProgress) {
        progressObserver.observe(dom.analyzeProgress, { attributes: true, attributeFilter: ["class"] });
    }
    if (dom.analyzeProgressFill) {
        progressObserver.observe(dom.analyzeProgressFill, { attributes: true, attributeFilter: ["style"] });
    }
    if (dom.analyzeProgressText) {
        progressObserver.observe(dom.analyzeProgressText, { childList: true, characterData: true, subtree: true });
    }
    if (dom.cutterBody) {
        progressObserver.observe(dom.cutterBody, { attributes: true, attributeFilter: ["class"] });
    }

})();
