/**
 * Editor-Pro — Smart Supertexts UI Module
 * Extracted from main.js for organizational clarity.
 * All behavior is identical to the original.
 */
(function(global) {
    "use strict";

    var EP = global.EditorProUI = global.EditorProUI || {};

    // ─── Shared references (captured at init time, not load time) ─
    var state, csInterface, fs, path, os, aiAnalyzer;
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
    var _getTranscriptFolders, parseTranscriptJson, _buildTranscriptCache;

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
        _getTranscriptFolders    = global._epGetTranscriptFolders;
        parseTranscriptJson      = global._epParseTranscriptJson;
        _buildTranscriptCache    = global._epBuildTranscriptCache;
    }

    // ═══════════════════════════════════════════════════════════════
    // SMART SUPERTEXTS — MOGRT graphic clips on timeline
    // ═══════════════════════════════════════════════════════════════

    var ST2_TYPES = ["title", "bullet", "step", "definition", "data", "summary", "highlight"];
    var ST2_BULLET_SPACING = 70;
    var ST2_EXTRA_LINE_SPACING = 45;

    /**
     * Formatea el texto para el MOGRT:
     * - bullets/steps: si la línea ya empieza con número (1., 2.) no la toca;
     *   si no trae marcador, le pone "• " al inicio.
     * - Nunca todo mayúsculas.
     */
    /**
     * Formatea texto para MOGRT.
     * Solo añade "• " si el item pertenece a un grupo (isGrouped=true) y su tipo es bullet/step.
     * Items independientes (sin grupo) no reciben bullet — son frases/títulos autónomos.
     */
    function _st2FormatText(text, type, isGrouped) {
        var t = normalizeSupertextNewlines(text || "");
        if (isGrouped && (type === "bullet" || type === "step")) {
            var lines = t.split(/\r?\n/).filter(function(l) { return l.trim().length > 0; });
            if (lines.length > 0) {
                var first = lines[0].trim();
                if (!/^\d+[\.\)\-]/.test(first) && !/^[•·►▸▹‣⁃\-–—]/.test(first)) {
                    lines[0] = "• " + first;
                }
            }
            t = lines.join("\n");
        }
        if (t === t.toUpperCase() && t.length > 3) {
            t = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
        }
        return t;
    }

    /** Cuenta líneas visibles en un texto (cada \n agrega una línea). */
    function _st2LineCount(text) {
        if (!text) return 1;
        var s = normalizeSupertextNewlines(text);
        var lines = s.split(/\r?\n/).length;
        return Math.max(1, lines);
    }

    // ── Pedagogical timing constants ──
    // Anticipation: elements enter BEFORE the narrator says them so they're
    // already fully visible on-screen when the word is spoken.
    var ST2_ANTICIPATION_SECS = 1.0;
    // Solo aparecen juntos si son prácticamente simultáneos (< 0.3s).
    // Si no, cada bullet entra cuando el profesor lo dice.
    var ST2_BATCH_THRESHOLD_SECS = 0.3;
    // Minimum reading buffer added after last mention so the viewer has
    // time to absorb the text before it exits.
    var ST2_READING_BUFFER_SECS = 1.5;
    // Estimated reading speed: seconds per word for buffer calculation.
    var ST2_SECS_PER_WORD = 0.25;
    // Minimum on-screen duration for any element (avoids flash appearances).
    var ST2_MIN_DURATION_SECS = 3.0;

    // Motion Pro: ligero adelanto respecto al audio (demasiado = el gráfico “va por delante” del profesor).
    var MP_ANTICIPATION_SECS = 0.35;

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

    // ═══════════════════════════════════════════════════════════════
    // SMART SUPERTEXTS — BATCH MODE
    // ═══════════════════════════════════════════════════════════════

    var _st2BatchResults = {};
    var _st2BatchQueue = [];
    var _st2BatchCancelled = false;
    var _st2BatchCurrentNav = -1;
    var ST2_BATCH_CONCURRENCY = 3;

    // ── Open: scan open sequences with transcripts ─────────────

    function st2BatchOpen() {
        if (!checkAIReady()) return;
        _st2BatchResults = {};
        _st2BatchQueue = [];
        _st2BatchCancelled = false;
        _st2BatchCurrentNav = -1;
        hideElement("btn-st2-batch-create");
        hideElement("st2-batch-progress");
        hideElement("st2-results");
        hideElement("st2-batch-nav");
        showElement("st2-batch-panel");

        var listEl = document.getElementById("st2-batch-list");
        listEl.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:12px;text-align:center">Buscando secuencias...</div>';

        // Use getAllProjectSequences for isOpen info, transcript cache for lookups
        var cache = (state && state.transcriptCache) ? state.transcriptCache : {};
        csInterface.evalScript("getAllProjectSequences()", function(res) {
            try {
                var data = JSON.parse(res);
                var seqs = data.sequences || [];
                var withTranscript = [];

                for (var si = 0; si < seqs.length; si++) {
                    if (!seqs[si].isOpen) continue;
                    var sname = seqs[si].name;
                    var hasT = cache[sname] || _st2BatchFindTranscript(_getTranscriptFolders(), sname);
                    if (hasT) {
                        withTranscript.push({ name: sname, id: seqs[si].sequenceID, transcriptPath: hasT });
                    }
                }

                withTranscript.sort(function(a, b) { return a.name.localeCompare(b.name); });
                _st2BatchQueue = withTranscript;

                var countEl = document.getElementById("st2-batch-count");
                if (countEl) countEl.textContent = withTranscript.length + " encontradas";

                if (withTranscript.length === 0) {
                    listEl.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:12px;text-align:center">No se encontraron secuencias abiertas con transcript. Importa al menos un transcript primero.</div>';
                    return;
                }

                _st2BatchRenderCards();
            } catch(e) {
                listEl.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:12px">Error: ' + e.message + '</div>';
            }
        });
    }

    // ── Card rendering (cutter-style) ──────────────────────────

    function _st2BatchRenderCards() {
        var listEl = document.getElementById("st2-batch-list");
        listEl.innerHTML = "";

        for (var wi = 0; wi < _st2BatchQueue.length; wi++) {
            var s = _st2BatchQueue[wi];
            var r = _st2BatchResults[s.name];

            var item = document.createElement("div");
            item.className = "batch-seq-item" + (r && r.supertexts ? " st2-done" : "");
            item.dataset.seqName = s.name;

            var cb = document.createElement("input");
            cb.type = "checkbox";
            cb.className = "batch-seq-checkbox st2b-check";
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

            if (r && r.supertexts) {
                _st2BatchFillCardPills(stats, meta, r);
            } else if (r && r.error) {
                var errPill = document.createElement("span");
                errPill.className = "batch-stat-pill st2-error";
                errPill.textContent = "Error";
                stats.appendChild(errPill);
                meta.textContent = r.error.substring(0, 50);
            } else {
                var pendPill = document.createElement("span");
                pendPill.className = "batch-stat-pill st2-pending";
                pendPill.textContent = "Pendiente";
                stats.appendChild(pendPill);
                meta.textContent = path.basename(s.transcriptPath);
            }

            item.appendChild(cb);
            item.appendChild(info);
            item.appendChild(stats);

            if (r && r.supertexts && r.supertexts.length > 0) {
                var createBtn = document.createElement("button");
                createBtn.className = "st2b-create-btn";
                createBtn.textContent = "Crear";
                createBtn.dataset.seqName = s.name;
                createBtn.addEventListener("click", function(e) {
                    e.stopPropagation();
                    _st2BatchCreateSingle(this.dataset.seqName);
                });
                item.appendChild(createBtn);

                (function(seqName) {
                    item.addEventListener("click", function(e) {
                        if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
                        _st2BatchNavigateTo(seqName);
                    });
                })(s.name);
            }

            listEl.appendChild(item);
        }
    }

    function _st2BatchFillCardPills(statsEl, metaEl, r) {
        var sts = r.supertexts;
        var types = {};
        sts.forEach(function(st) { types[st.type] = (types[st.type] || 0) + 1; });

        var totalPill = document.createElement("span");
        totalPill.className = "batch-stat-pill st2-total";
        totalPill.textContent = sts.length;
        statsEl.appendChild(totalPill);

        var typeKeys = Object.keys(types).sort();
        for (var ti = 0; ti < typeKeys.length; ti++) {
            var t = typeKeys[ti];
            var pill = document.createElement("span");
            pill.className = "batch-stat-pill st2-" + t;
            pill.textContent = types[t] + " " + t;
            statsEl.appendChild(pill);
        }

        var checked = sts.filter(function(st) { return st.checked; }).length;
        metaEl.textContent = checked + "/" + sts.length + " seleccionados";
    }

    // ── Helpers ─────────────────────────────────────────────────

    function _st2BatchFindTranscript(folders, seqName) {
        if (!seqName || !fs || !path) return null;
        var baseName = seqName.replace(/[\/\\:*?"<>|]/g, "_");
        for (var fi = 0; fi < folders.length; fi++) {
            var folder = folders[fi];
            // Coincidencia exacta: nombreSecuencia.json o .srt
            var jp = path.join(folder, baseName + ".json");
            if (fs.existsSync(jp)) return jp;
            var sp = path.join(folder, baseName + ".srt");
            if (fs.existsSync(sp)) return sp;
        }
        return null;
    }

    /**
     * Carga un transcript y lo devuelve en el formato "[X.Xs - Y.Ys] texto"
     * que es el mismo que buildTimedTranscript() produce para análisis individual.
     */
    function _st2BatchLoadTranscript(filePath) {
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
                    var data = JSON.parse(raw);
                    if (data.segments && data.segments.length > 0 && data.segments[0].words) {
                        segments = [];
                        for (var si = 0; si < data.segments.length; si++) {
                            var seg = data.segments[si];
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

    function _st2BatchSetProgress(pct, text) {
        var fill = document.getElementById("st2-batch-progress-fill");
        var label = document.getElementById("st2-batch-progress-text");
        if (fill) fill.style.width = Math.min(pct, 100) + "%";
        if (label) label.textContent = text || "";
    }

    function _st2BatchUpdateCardStatus(seqName, pillClass, pillText) {
        var card = document.querySelector('.batch-seq-item[data-seq-name="' + seqName.replace(/"/g, '\\"') + '"]');
        if (!card) return;
        var stats = card.querySelector(".batch-seq-stats");
        if (stats) {
            stats.innerHTML = "";
            var r = _st2BatchResults[seqName];
            if (r && r.supertexts && r.supertexts.length > 0) {
                var meta = card.querySelector(".batch-seq-meta");
                _st2BatchFillCardPills(stats, meta, r);
            } else {
                var pill = document.createElement("span");
                pill.className = "batch-stat-pill " + pillClass;
                pill.textContent = pillText;
                stats.appendChild(pill);
            }
        }

        // Make card clickable + add Create button when analysis succeeds
        var r2 = _st2BatchResults[seqName];
        if (r2 && r2.supertexts && r2.supertexts.length > 0 && !card.classList.contains("st2-done")) {
            card.classList.add("st2-done");

            if (!card.querySelector(".st2b-create-btn")) {
                var createBtn = document.createElement("button");
                createBtn.className = "st2b-create-btn";
                createBtn.textContent = "Crear";
                createBtn.dataset.seqName = seqName;
                createBtn.addEventListener("click", function(e) {
                    e.stopPropagation();
                    _st2BatchCreateSingle(this.dataset.seqName);
                });
                card.appendChild(createBtn);
            }

            (function(sn) {
                card.addEventListener("click", function(e) {
                    if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
                    _st2BatchNavigateTo(sn);
                });
            })(seqName);
        }
    }

    var _st2BatchRunning = false;

    function st2BatchClose() {
        if (_st2BatchRunning) {
            _st2BatchCancelled = true;
            _st2BatchRunning = false;
            _st2BatchSetCancelBtn(false);
            showToast("Proceso detenido", "info");
            hideElement("st2-batch-progress");
            enableBtn("btn-st2-batch-analyze");
            enableBtn("btn-st2-batch-create");
            return;
        }
        _st2BatchCancelled = true;
        _st2BatchCurrentNav = -1;
        hideElement("st2-batch-panel");
        hideElement("st2-batch-nav");
    }

    function _st2BatchSetCancelBtn(running) {
        var btn = document.getElementById("btn-st2-batch-cancel");
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

    // ── Parallel Analysis ──────────────────────────────────────

    function st2BatchAnalyzeAll() {
        var checks = document.querySelectorAll(".st2b-check:checked");
        if (checks.length === 0) { showToast("Selecciona al menos una secuencia", "info"); return; }
        if (!checkAIReady()) return;
        if (window.EPLogger) EPLogger.log("supertexts", "batch-analyze-start", checks.length + " sequences");

        _st2BatchCancelled = false;
        _st2BatchRunning = true;
        _st2BatchSetCancelBtn(true);
        disableBtn("btn-st2-batch-analyze");
        hideElement("btn-st2-batch-create");
        showElement("st2-batch-progress");

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
            _st2BatchSetProgress(pct, completed + "/" + total + " analizadas");

            if (_st2BatchCancelled || completed >= total) {
                _st2BatchRunning = false;
                _st2BatchSetCancelBtn(false);
                hideElement("st2-batch-progress");
                enableBtn("btn-st2-batch-analyze");
                _st2BatchRenderCards();
                var totalST = 0;
                for (var k in _st2BatchResults) {
                    if (_st2BatchResults[k].supertexts) totalST += _st2BatchResults[k].supertexts.length;
                }
                if (totalST > 0) showElement("btn-st2-batch-create");
                showToast(completed + " secuencias analizadas — " + totalST + " supertextos", "success");
                return;
            }
            launchNext();
        }

        function launchNext() {
            while (nextIdx < total && (nextIdx - completed) < ST2_BATCH_CONCURRENCY) {
                launchOne(nextIdx);
                nextIdx++;
            }
        }

        function launchOne(idx) {
            if (_st2BatchCancelled) return;
            var item = queue[idx];
            _st2BatchUpdateCardStatus(item.name, "st2-analyzing", "Analizando...");

            var timedTranscript = _st2BatchLoadTranscript(item.transcript);
            if (!timedTranscript) {
                _st2BatchUpdateCardStatus(item.name, "st2-error", "Sin transcript");
                _st2BatchResults[item.name] = { error: "No transcript", seqId: item.id };
                onItemDone();
                return;
            }

            // Capturar el fin del transcript ANTES del análisis (no depender de state)
            var txEnd = _st2ExtractTranscriptEnd(timedTranscript);

            aiAnalyzer.analyzeSupertexts(timedTranscript, getSupertext2PromptContext(), function(result) {
                if (_st2BatchCancelled) return;

                if (result.error) {
                    _st2BatchUpdateCardStatus(item.name, "st2-error", "Error");
                    _st2BatchResults[item.name] = { error: result.error, seqId: item.id };
                } else {
                    var supertexts = (result.supertexts || []).map(function(st) {
                        if (st.type) st.type = st.type.toLowerCase().replace(/_/g, "").replace("bulletpoint", "bullet").replace("datapoint", "data");
                        if (ST2_TYPES.indexOf(st.type) === -1) st.type = "bullet";
                        normalizeSt2Fields(st);
                        st.checked = true;
                        return st;
                    });
                    supertexts = _st2CapEndTimes(supertexts, txEnd);
                    _st2BatchResults[item.name] = { supertexts: supertexts, seqId: item.id, transcript: item.transcript };
                    _st2BatchUpdateCardStatus(item.name, "st2-total", supertexts.length + " supertextos");
                }
                onItemDone();
            });
        }

        launchNext();
    }

    // ── Navigation: edit per class ─────────────────────────────

    function _st2BatchGetAnalyzedNames() {
        var names = [];
        for (var qi = 0; qi < _st2BatchQueue.length; qi++) {
            var n = _st2BatchQueue[qi].name;
            if (_st2BatchResults[n] && _st2BatchResults[n].supertexts) names.push(n);
        }
        return names;
    }

    function _st2BatchNavigateTo(seqName) {
        var r = _st2BatchResults[seqName];
        if (!r || !r.supertexts) return;

        // Save current edits if navigating away
        _st2BatchSaveCurrentEdits();

        var analyzed = _st2BatchGetAnalyzedNames();
        _st2BatchCurrentNav = analyzed.indexOf(seqName);

        // Activate sequence in Premiere
        csInterface.evalScript('openSequenceById("' + r.seqId.replace(/"/g, '\\"') + '")', function() {});

        // Load results into ST2 view
        state.supertexts2 = r.supertexts;
        renderSupertext2Results({ summary: r.supertexts.length + " supertextos — " + seqName });

        // Show nav bar + results, hide batch panel
        hideElement("st2-batch-panel");
        hideElement("st2-empty");
        showElement("st2-results");
        _st2BatchUpdateNav();
        showElement("st2-batch-nav");
    }

    function _st2BatchSaveCurrentEdits() {
        if (_st2BatchCurrentNav < 0) return;
        var analyzed = _st2BatchGetAnalyzedNames();
        var name = analyzed[_st2BatchCurrentNav];
        if (name && _st2BatchResults[name]) {
            _st2BatchResults[name].supertexts = state.supertexts2;
        }
    }

    function _st2BatchUpdateNav() {
        var analyzed = _st2BatchGetAnalyzedNames();
        var prevBtn = document.getElementById("btn-st2-bnav-prev");
        var nextBtn = document.getElementById("btn-st2-bnav-next");
        if (prevBtn) prevBtn.className = "btn-batch-nav" + (_st2BatchCurrentNav <= 0 ? " disabled" : "");
        if (nextBtn) nextBtn.className = "btn-batch-nav" + (_st2BatchCurrentNav >= analyzed.length - 1 ? " disabled" : "");
    }

    function st2BatchNavPrev() {
        var analyzed = _st2BatchGetAnalyzedNames();
        if (_st2BatchCurrentNav > 0) {
            _st2BatchNavigateTo(analyzed[_st2BatchCurrentNav - 1]);
        }
    }

    function st2BatchNavNext() {
        var analyzed = _st2BatchGetAnalyzedNames();
        if (_st2BatchCurrentNav < analyzed.length - 1) {
            _st2BatchNavigateTo(analyzed[_st2BatchCurrentNav + 1]);
        }
    }

    function st2BatchNavBack() {
        _st2BatchSaveCurrentEdits();
        _st2BatchCurrentNav = -1;
        hideElement("st2-batch-nav");
        hideElement("st2-results");
        _st2BatchRenderCards();
        showElement("st2-batch-panel");
    }

    // ── Per-class create ───────────────────────────────────────

    function _st2BatchCreateSingle(seqName) {
        var r = _st2BatchResults[seqName];
        if (!r || !r.supertexts || r.supertexts.length === 0) return;

        _st2BatchUpdateCardStatus(seqName, "st2-analyzing", "Creando...");

        csInterface.evalScript('openSequenceById("' + r.seqId.replace(/"/g, '\\"') + '")', function() {
            setTimeout(function() {
                var selected = r.supertexts.filter(function(st) { return st.checked; });
                if (selected.length === 0) {
                    _st2BatchUpdateCardStatus(seqName, "st2-error", "Nada seleccionado");
                    return;
                }
                state.supertexts2 = r.supertexts;
                var trackIdx = state.mogrtTrackIndex === "auto" ? -1 : parseInt(state.mogrtTrackIndex);
                var items = buildST2Payload(selected);
                var payload = { baseTrackIndex: trackIdx, supertexts: items };

                var tmpFile = path.join(os.tmpdir(), "EditorPro_ST2_Batch_" + Date.now() + ".json");
                fs.writeFileSync(tmpFile, JSON.stringify(payload), "utf8");
                var safePath = tmpFile.replace(/\\/g, "/");

                csInterface.evalScript('insertSupertextMOGRTs("' + escExtend(safePath) + '")', function(res) {
                    try {
                        var data = JSON.parse(res);
                        var ins = data.inserted || 0;
                        _st2BatchUpdateCardStatus(seqName, "st2-total", ins + " creados ✓");
                        showToast(seqName + ": " + ins + " gráficos insertados", "success");
                    } catch(e) {
                        _st2BatchUpdateCardStatus(seqName, "st2-error", "Error");
                        showToast("Error: " + e.message, "error");
                    }
                });
            }, 1500);
        });
    }

    // ── Bulk create all ────────────────────────────────────────

    function st2BatchCreateAll() {
        var names = [];
        for (var k in _st2BatchResults) {
            var r = _st2BatchResults[k];
            if (r && r.supertexts && r.supertexts.length > 0) {
                var checked = r.supertexts.filter(function(st) { return st.checked; }).length;
                if (checked > 0) names.push(k);
            }
        }
        names.sort();

        if (names.length === 0) { showToast("Sin supertextos seleccionados para crear", "info"); return; }

        _st2BatchCancelled = false;
        _st2BatchRunning = true;
        _st2BatchSetCancelBtn(true);
        disableBtn("btn-st2-batch-create");
        disableBtn("btn-st2-batch-analyze");
        showElement("st2-batch-progress");

        var total = names.length;
        var current = 0;
        var totalInserted = 0;

        function processNext() {
            if (_st2BatchCancelled || current >= total) {
                _st2BatchRunning = false;
                _st2BatchSetCancelBtn(false);
                hideElement("st2-batch-progress");
                enableBtn("btn-st2-batch-create");
                enableBtn("btn-st2-batch-analyze");
                _st2BatchRenderCards();
                showToast(totalInserted + " gráficos creados en " + current + " secuencias", "success");
                return;
            }

            var seqName = names[current];
            var r = _st2BatchResults[seqName];
            var pct = Math.round((current / total) * 100);
            _st2BatchSetProgress(pct, (current + 1) + "/" + total + " — " + seqName);
            _st2BatchUpdateCardStatus(seqName, "st2-analyzing", "Creando...");

            csInterface.evalScript('openSequenceById("' + r.seqId.replace(/"/g, '\\"') + '")', function() {
                setTimeout(function() {
                    state.supertexts2 = r.supertexts;
                    var selected = r.supertexts.filter(function(st) { return st.checked; });
                    var trackIdx = state.mogrtTrackIndex === "auto" ? -1 : parseInt(state.mogrtTrackIndex);
                    var items = buildST2Payload(selected);
                    var payload = { baseTrackIndex: trackIdx, supertexts: items };

                    var tmpFile = path.join(os.tmpdir(), "EditorPro_ST2_Batch_" + Date.now() + ".json");
                    fs.writeFileSync(tmpFile, JSON.stringify(payload), "utf8");
                    var safePath = tmpFile.replace(/\\/g, "/");

                    csInterface.evalScript('insertSupertextMOGRTs("' + escExtend(safePath) + '")', function(res) {
                        try {
                            var data = JSON.parse(res);
                            var ins = data.inserted || 0;
                            totalInserted += ins;
                            _st2BatchUpdateCardStatus(seqName, "st2-total", ins + " creados ✓");
                        } catch(e) {
                            _st2BatchUpdateCardStatus(seqName, "st2-error", "Error");
                        }
                        current++;
                        setTimeout(processNext, 500);
                    });
                }, 1500);
            });
        }

        processNext();
    }

    // ═══════════════════════════════════════════════════════════════

    function startSupertexts2() {
        if (state.analyzing) return;
        if (!checkAIReady()) return;

        if (window.EPLogger) EPLogger.log("supertexts", "analysis-start", "transcriptLen=" + (state.transcript ? state.transcript.length : 0));
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
                try {
                    hideElement("st2-progress"); hideElement("st2-progress-header");
                    enableBtn("btn-supertexts2");

                    if (result.error) {
                        if (window.EPLogger) EPLogger.error("supertexts", "analysis-complete", result.error);
                        showToast("Error: " + result.error, "error");
                        showElement("st2-empty");
                        return;
                    }

                    if (window.EPLogger) EPLogger.log("supertexts", "analysis-complete", (result.supertexts ? result.supertexts.length : 0) + " supertexts found");
                    var mapped = (result.supertexts || []).map(function(st) {
                        st.checked = true;
                        if (st.type) st.type = st.type.toLowerCase().replace(/_/g, "").replace("bulletpoint", "bullet").replace("datapoint", "data");
                        if (ST2_TYPES.indexOf(st.type) === -1) st.type = "bullet";
                        normalizeSt2Fields(st);
                        return st;
                    });
                    state.supertexts2 = _st2CapEndTimes(mapped, 0);
                    renderSupertext2Results(result);
                    showElement("st2-results");
                    showToast(state.supertexts2.length + " supertextos detectados", "success");
                } finally {
                    state.analyzing = false;
                }
            }, 500);
        });
    }

    var _st2TypeFilter = null;
    var ST2_TYPE_COLORS = { title: "var(--accent-bright)", bullet: "var(--success)", step: "var(--info)", definition: "var(--warning)", data: "var(--highlight)", summary: "var(--brand-start)", highlight: "#facc15" };

    function renderSupertext2Results(result) {
        var summary = document.getElementById("st2-summary");
        summary.innerHTML = escSupertextHtml(result.summary || state.supertexts2.length + " momentos clave identificados");

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
                    '<div class="st-text">' + escSupertextHtml(st.text) + '</div>' +
                    '<div class="st-meta-row">' +
                        '<span class="st-type-badge ' + typeClass + '" data-idx="' + idx + '">' + esc(curType) + '</span>' +
                        '<select class="st2-type-select" data-idx="' + idx + '">' + typeOptions + '</select>' +
                        '<span style="font-size:9px;color:var(--text-muted)">' + dur.toFixed(1) + 's</span>' +
                        '<button class="btn btn-xs btn-ghost st2-replace-btn hidden" data-idx="' + idx + '" title="Reemplazar clip en timeline">↻</button>' +
                    '</div>' +
                    (st.reason ? '<div style="font-size:9px;color:var(--text-muted);margin-top:2px">' + escSupertextHtml(st.reason) + '</div>' : '') +
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

    function st2ExcludeByTrack() {
        var sel = document.getElementById("st2-exclude-track");
        var infoEl = document.getElementById("st2-exclude-info");
        if (!sel) return;
        var trackIdx = parseInt(sel.value);
        if (infoEl) infoEl.textContent = "Leyendo pista V" + (trackIdx + 1) + "...";

        csInterface.evalScript('getClipRangesOnTrack(' + trackIdx + ')', function(res) {
            if (!res || res === "EvalScript error." || res.indexOf("is not") !== -1) {
                showToast("Cierra y abre el panel para cargar la función (host no actualizado)", "error");
                if (infoEl) infoEl.textContent = "Recargar panel";
                return;
            }
            try {
                var data = JSON.parse(res);
                if (data.error) {
                    showToast(data.error, "error");
                    if (infoEl) infoEl.textContent = "";
                    return;
                }
                var ranges = data.ranges || [];
                var skipped = data.skippedDisabled || 0;
                if (ranges.length === 0) {
                    var msg0 = "0 clips habilitados en V" + (trackIdx + 1);
                    if (skipped > 0) msg0 += " (" + skipped + " deshabilitados)";
                    showToast(msg0, "info");
                    if (infoEl) infoEl.textContent = msg0;
                    return;
                }

                var excluded = 0;
                for (var si = 0; si < state.supertexts2.length; si++) {
                    var st = state.supertexts2[si];
                    var stEnd = st.endTime || st.time + 5;
                    for (var ri = 0; ri < ranges.length; ri++) {
                        if (st.time < ranges[ri].end && stEnd > ranges[ri].start) {
                            if (st.checked) { st.checked = false; excluded++; }
                            break;
                        }
                    }
                }

                document.querySelectorAll(".st2-check").forEach(function(chk) {
                    var idx = parseInt(chk.dataset.idx);
                    if (!isNaN(idx) && state.supertexts2[idx]) {
                        chk.checked = state.supertexts2[idx].checked;
                        var row = chk.closest(".supertext-item");
                        if (row) {
                            row.classList.toggle("st-checked", state.supertexts2[idx].checked);
                            row.classList.toggle("st-unchecked", !state.supertexts2[idx].checked);
                        }
                    }
                });

                updateSelectAll2Label();
                var infoMsg = excluded + " excluidos por V" + (trackIdx + 1) + " (" + ranges.length + " clips habilitados";
                if (skipped > 0) infoMsg += ", " + skipped + " deshabilitados ignorados";
                infoMsg += ")";
                if (infoEl) infoEl.textContent = infoMsg;
                showToast(excluded + " supertextos excluidos por V" + (trackIdx + 1), excluded > 0 ? "success" : "info");
            } catch(e) {
                showToast("Error: " + e.message, "error");
                if (infoEl) infoEl.textContent = "";
            }
        });
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

    /**
     * Si todos los items de un grupo tienen el mismo time (la IA no asignó tiempos individuales),
     * los escalona automáticamente con un offset de ~1.5s entre cada uno.
     */
    var ST2_AUTO_STAGGER_SECS = 1.5;
    function _st2AutoStagger(cascade) {
        if (cascade.length < 2) return;
        var allSame = true;
        for (var s = 1; s < cascade.length; s++) {
            if (Math.abs(cascade[s].time - cascade[0].time) > 0.5) { allSame = false; break; }
        }
        if (allSame) {
            var baseTime = cascade[0].time;
            for (var s2 = 1; s2 < cascade.length; s2++) {
                cascade[s2].time = baseTime + s2 * ST2_AUTO_STAGGER_SECS;
            }
        }
    }

    function buildST2Payload(selected) {
        var sorted = selected.slice().sort(function(a, b) { return a.time - b.time; });

        var items = [];
        var processed = {};
        var cascadeCounter = 0;
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

                _st2AutoStagger(cascade);

                var lastItem = cascade[cascade.length - 1];
                var rawCascadeEnd = lastItem.endTime || lastItem.time + 5;
                var allText = cascade.map(function(c) { return c.text; }).join(" ");
                var cascadeEnd = rawCascadeEnd + _st2ReadingBuffer(allText);
                var cascadeLen = cascade.length;
                var titleSpacing = ST2_BULLET_SPACING * 0.4;
                var cascId = "c" + (cascadeCounter++);

                // Calcular posiciones Y acumuladas teniendo en cuenta líneas por ítem
                var cascYOffsets = [];
                var accumY = 0;
                for (var cy = cascadeLen - 1; cy >= 0; cy--) {
                    cascYOffsets[cy] = -accumY;
                    var lines = _st2LineCount(cascade[cy].text);
                    accumY += ST2_BULLET_SPACING + (lines - 1) * ST2_EXTRA_LINE_SPACING;
                }
                if (cascYOffsets[0] !== undefined) cascYOffsets[0] -= titleSpacing;

                for (var c = 0; c < cascadeLen; c++) {
                    var cst = cascade[c];
                    var cType = cst.type || "bullet";

                    var entryTime = _st2Anticipate(cst.time);

                    items.push({
                        time: entryTime,
                        endTime: _st2EnsureMinDuration(entryTime, cascadeEnd),
                        text: _st2FormatText(cst.text, cType, true),
                        type: cType,
                        mogrtPath: state.mogrtPaths[cType] || state.mogrtPaths.bullet || "",
                        bulletTrackOffset: c,
                        bulletPositionY: cascYOffsets[c],
                        _cascadeId: cascId
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

                _st2AutoStagger(bGroup);

                var bLast = bGroup[bGroup.length - 1];
                var rawBGroupEnd = bLast.endTime || bLast.time + 5;
                var bAllText = bGroup.map(function(b) { return b.text; }).join(" ");
                var bGroupEnd = rawBGroupEnd + _st2ReadingBuffer(bAllText);
                var bGroupLen = bGroup.length;
                var bCascId = "c" + (cascadeCounter++);

                var bYOffsets = [];
                var bAccumY = 0;
                for (var by = bGroupLen - 1; by >= 0; by--) {
                    bYOffsets[by] = -bAccumY;
                    var bLines = _st2LineCount(bGroup[by].text);
                    bAccumY += ST2_BULLET_SPACING + (bLines - 1) * ST2_EXTRA_LINE_SPACING;
                }

                for (var g = 0; g < bGroupLen; g++) {
                    var bEntryTime = _st2Anticipate(bGroup[g].time);

                    items.push({
                        time: bEntryTime,
                        endTime: _st2EnsureMinDuration(bEntryTime, bGroupEnd),
                        text: _st2FormatText(bGroup[g].text, "bullet", true),
                        type: "bullet",
                        mogrtPath: state.mogrtPaths.bullet || "",
                        bulletTrackOffset: g,
                        bulletPositionY: bYOffsets[g],
                        _cascadeId: bCascId
                    });
                }
                i = j;
                continue;
            }

            // Independent item (no cascade)
            var type = st.type || "title";
            var rawEnd = st.endTime || st.time + 5;
            var readBuf = _st2ReadingBuffer(st.text);
            var entryIndep = _st2Anticipate(st.time);
            var endIndep = _st2EnsureMinDuration(entryIndep, rawEnd + readBuf);

            items.push({
                time: entryIndep,
                endTime: endIndep,
                text: _st2FormatText(st.text, type, false),
                type: type,
                mogrtPath: state.mogrtPaths[type] || "",
                bulletTrackOffset: 0,
                bulletPositionY: 0,
                _cascadeId: "s" + (cascadeCounter++)
            });
            i++;
        }

        _st2TrimOverlaps(items);

        return items;
    }

    var ST2_OVERLAP_GAP_SECS = 0.8;

    /** Fin de la transcripción (tope absoluto para endTimes de supertextos). */
    function _st2TranscriptEndSec() {
        var best = 0;
        // Fuente 1: último segmento de la transcripción
        if (state.segments && state.segments.length > 0) {
            var last = state.segments[state.segments.length - 1];
            var e = last.endTime || last.startTime || 0;
            if (e > best) best = e;
        }
        // Fuente 2: si tenemos sttResult con palabras, tomar la última
        if (state.sttResult && state.sttResult.words && state.sttResult.words.length > 0) {
            var lastW = state.sttResult.words[state.sttResult.words.length - 1];
            var we = lastW.end || lastW.start || 0;
            if (we > best) best = we;
        }
        // Fuente 3: último TIME (no endTime) de los supertextos — el último momento que la IA anotó
        if (state.supertexts2 && state.supertexts2.length > 0) {
            var maxTime = 0;
            for (var si = 0; si < state.supertexts2.length; si++) {
                var t = state.supertexts2[si].time || 0;
                if (t > maxTime) maxTime = t;
            }
            var fromST = maxTime + 10;
            if (fromST > best) best = fromST;
        }
        return best;
    }

    /**
     * Recorta solapamientos entre CASCADAS/GRUPOS DISTINTOS.
     * Items de la misma cascada (_cascadeId) comparten endTime a propósito
     * porque van en pistas diferentes: NO se recortan entre sí.
     */
    function _st2TrimOverlaps(items) {
        if (!items || items.length === 0) return;

        // 1. Tope absoluto: nada pasa del fin de la transcripción + 2 s
        var txEnd = _st2TranscriptEndSec();
        if (txEnd > 0) {
            var absMax = txEnd + 2;
            for (var ai = 0; ai < items.length; ai++) {
                if (items[ai].endTime > absMax) {
                    items[ai].endTime = Math.max(items[ai].time + ST2_MIN_DURATION_SECS, absMax);
                }
            }
        }

        if (items.length < 2) return;

        // 2. Agrupar por _cascadeId (una cascada = un bloque visual que sale junto)
        var cascadeMap = {};
        var cascadeOrder = [];
        for (var ci = 0; ci < items.length; ci++) {
            var cid = items[ci]._cascadeId || ("_" + ci);
            if (!cascadeMap[cid]) {
                cascadeMap[cid] = { items: [], minTime: Infinity, maxEnd: 0 };
                cascadeOrder.push(cid);
            }
            var entry = cascadeMap[cid];
            entry.items.push(items[ci]);
            if (items[ci].time < entry.minTime) entry.minTime = items[ci].time;
            if (items[ci].endTime > entry.maxEnd) entry.maxEnd = items[ci].endTime;
        }

        // Ordenar cascadas por su tiempo más temprano
        cascadeOrder.sort(function(a, b) { return cascadeMap[a].minTime - cascadeMap[b].minTime; });

        // 3. Para cada cascada, si su endTime se mete en la siguiente, recortar
        for (var mi = 0; mi < cascadeOrder.length - 1; mi++) {
            var cur = cascadeMap[cascadeOrder[mi]];
            var nxt = cascadeMap[cascadeOrder[mi + 1]];
            var nextStart = nxt.minTime;
            var maxEnd = nextStart - ST2_OVERLAP_GAP_SECS;

            if (cur.maxEnd > maxEnd) {
                var cappedEnd = Math.max(cur.minTime + ST2_MIN_DURATION_SECS, maxEnd);
                for (var mj = 0; mj < cur.items.length; mj++) {
                    if (cur.items[mj].endTime > cappedEnd) {
                        cur.items[mj].endTime = cappedEnd;
                    }
                }
            }
        }
    }

    function createSupertext2Graphics() {
        var selected = state.supertexts2.filter(function(st) { return st.checked; });
        if (selected.length === 0) {
            showToast("Selecciona al menos un supertexto", "info");
            return;
        }
        if (window.EPLogger) EPLogger.log("supertexts", "mogrt-insert-start", selected.length + " selected");

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
                    if (window.EPLogger) EPLogger.error("supertexts", "mogrt-insert-complete", data.error);
                    showToast(data.error, "error");
                    return;
                }
                state.supertexts2Inserted = true;
                if (window.EPLogger) EPLogger.log("supertexts", "mogrt-insert-complete", data.inserted + "/" + data.total + " inserted, textSet=" + (data.textSet || 0));
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
            text: _st2FormatText(st.text, type, st.group !== undefined && st.group !== null),
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

    function _st2ExtractTranscriptEnd(timedTranscript) {
        if (!timedTranscript) return 0;
        var matches = timedTranscript.match(/\[\d+\.?\d*s\s*-\s*(\d+\.?\d*)s\]/g);
        if (!matches || matches.length === 0) return 0;
        var last = matches[matches.length - 1];
        var m = last.match(/-\s*(\d+\.?\d*)s\]/);
        return m ? parseFloat(m[1]) : 0;
    }

    function _st2CapEndTimes(supertexts, transcriptEndSec) {
        if (!supertexts || supertexts.length === 0) return supertexts;

        var cap = transcriptEndSec || 0;
        if (cap <= 0) cap = _st2TranscriptEndSec();

        if (cap <= 0) {
            var times = supertexts.map(function(st) { return st.time; }).sort(function(a, b) { return a - b; });
            var p90idx = Math.floor(times.length * 0.9);
            cap = times[p90idx] + 15;
        }

        if (cap <= 0) return supertexts;

        var filtered = [];
        for (var i = 0; i < supertexts.length; i++) {
            if (supertexts[i].time <= cap + 5) {
                if (supertexts[i].endTime > cap + 5) {
                    supertexts[i].endTime = cap + 5;
                }
                filtered.push(supertexts[i]);
            }
        }
        return filtered;
    }

    /** Texto de supertexto en HTML: escapa y muestra saltos de línea (no el literal \\n). */
    function escSupertextHtml(str) {
        if (str === undefined || str === null) return "";
        var s = normalizeSupertextNewlines(str);
        return s.split(/\r?\n/).map(function(line) { return esc(line); }).join("<br>");
    }

    // ─── Expose to EditorProUI namespace ───────────────────────
    EP.supertexts = {
        init: _initRefs,
        start: startSupertexts2,
        render: renderSupertext2Results,
        toggleSelectAll: toggleSelectAllSupertexts2,
        createGraphics: createSupertext2Graphics,
        replaceSingle: replaceSingleSupertext,
        exportData: exportSupertexts2,
        excludeByTrack: st2ExcludeByTrack,
        buildPayload: buildST2Payload,
        trimOverlaps: _st2TrimOverlaps,
        autoStagger: _st2AutoStagger,
        anticipate: _st2Anticipate,
        readingBuffer: _st2ReadingBuffer,
        capEndTimes: _st2CapEndTimes,
        extractTranscriptEnd: _st2ExtractTranscriptEnd,
        ensureMinDuration: _st2EnsureMinDuration,
        loadMOGRTConfig: loadMOGRTConfig,
        selectMOGRTFile: selectMOGRTFile,
        toggleMOGRTConfig: toggleMOGRTConfig,
        loadMOGRTFolder: loadMOGRTFolder,
        setST2Progress: setST2Progress,
        batchOpen: st2BatchOpen,
        batchClose: st2BatchClose,
        batchAnalyzeAll: st2BatchAnalyzeAll,
        batchCreateAll: st2BatchCreateAll,
        batchNavPrev: st2BatchNavPrev,
        batchNavNext: st2BatchNavNext,
        batchNavBack: st2BatchNavBack,
        isBatchActive: function() { return _st2BatchCurrentNav >= 0; },
        ST2_ANTICIPATION_SECS: ST2_ANTICIPATION_SECS,
        ST2_READING_BUFFER_SECS: ST2_READING_BUFFER_SECS,
        ST2_MIN_DURATION_SECS: ST2_MIN_DURATION_SECS,
        ST2_SECS_PER_WORD: ST2_SECS_PER_WORD,
        ST2_OVERLAP_GAP_SECS: ST2_OVERLAP_GAP_SECS
    };

})(window);