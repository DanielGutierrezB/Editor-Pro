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
        _st2InitTrackFilter();
        _st2InitTabs();
    }

    // ═══════════════════════════════════════════════════════════════
    // SMART SUPERTEXTS — MOGRT graphic clips on timeline
    // ═══════════════════════════════════════════════════════════════

    var ST2_TYPES = ["title", "bullet", "step", "definition", "data", "highlight", "summary", "question"];
    var ST2_BULLET_SPACING = 100;
    var ST2_EXTRA_LINE_SPACING = 50;

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
            // Strip any existing bullet markers — the MOGRT already provides them visually
            if (lines.length > 0) {
                lines[0] = lines[0].trim().replace(/^[•·►▸▹‣⁃\-–—]\s*/, "");
            }
            // Max 1 line break (2 lines)
            if (lines.length > 2) lines = lines.slice(0, 2);
            t = lines.join("\n");
        } else {
            // Non-bullet types (definition, data, step, summary, etc.): also max 1 line break
            var nLines = t.split(/\r?\n/).filter(function(l) { return l.trim().length > 0; });
            if (nLines.length > 2) nLines = nLines.slice(0, 2);
            t = nLines.join("\n");
        }
        if (t === t.toUpperCase() && t.length > 3) {
            t = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
        }
        return t;
    }

    /** Cuenta líneas visibles en un texto (cada \n agrega una línea). Cap at 2 (max 1 line break). */
    function _st2LineCount(text) {
        if (!text) return 1;
        var s = normalizeSupertextNewlines(text);
        var lines = s.split(/\r?\n/).length;
        return Math.min(Math.max(1, lines), 2); // max 2 lines (1 line break)
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
    var ST2_MIN_DURATION_SECS = 6.0;  // Hard rule: ningún supertext dura menos de 6s (duración natural del MOGRT)

    // Motion Pro: ligero adelanto respecto al audio (demasiado = el gráfico “va por delante” del profesor).
    var MP_ANTICIPATION_SECS = 0.35;

    function loadMOGRTConfig() {
        try {
            var saved = localStorage.getItem("edupro_mogrt_paths");
            if (saved) state.mogrtPaths = JSON.parse(saved);
        } catch(e) {}
        state.mogrtTrackIndex = localStorage.getItem("edupro_mogrt_track") || "auto";

        // Auto-detect bundled MOGRTs if not already configured
        try {
            var extPath = csInterface.getSystemPath("extension");
            if (extPath && path && fs) {
                var mogrtDir = path.join(extPath, "mogrts");
                if (fs.existsSync(mogrtDir)) {
                    var changed = false;
                    var dirFiles = fs.readdirSync(mogrtDir);
                    var bundledAliases = {
                        title: ["title", "titulo", "título"],
                        bullet: ["bullet", "bullet_point", "bullets"],
                        step: ["step", "steps", "paso", "pasos"],
                        definition: ["definition", "definicion", "definición"],
                        data: ["data", "datos", "dato"],
                        highlight: ["highlight", "highlights", "destacado"],
                        summary: ["summary", "resumen"],
                        question: ["question", "pregunta", "preguntas"]
                    };
                    ST2_TYPES.forEach(function(t) {
                        if (!state.mogrtPaths[t] || !fs.existsSync(state.mogrtPaths[t])) {
                            var aliases = bundledAliases[t] || [t];
                            var bundled = null;
                            for (var fi = 0; fi < dirFiles.length; fi++) {
                                var fname = dirFiles[fi];
                                var base = fname.replace(/\.mogrt$/i, "").toLowerCase().replace(/[_\-\s]+/g, "");
                                for (var a = 0; a < aliases.length; a++) {
                                    if (base === aliases[a] || base.indexOf(aliases[a]) !== -1) {
                                        bundled = path.join(mogrtDir, fname);
                                        break;
                                    }
                                }
                                if (bundled) break;
                            }
                            if (bundled && fs.existsSync(bundled)) {
                                state.mogrtPaths[t] = bundled;
                                changed = true;
                                console.log("[Smart Supertexts] Auto-configured MOGRT for " + t + ": " + bundled);
                            }
                        }
                    });
                    if (changed) {
                        localStorage.setItem("edupro_mogrt_paths", JSON.stringify(state.mogrtPaths));
                    }
                }
            }
        } catch(e) { console.warn("[Smart Supertexts] Auto-detect MOGRTs error:", e.message); }

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

    function loadDefaultMOGRTs() {
        try {
            var extPath = csInterface.getSystemPath("extension");
            if (!extPath || !fs || !path) {
                showToast("No se pudo detectar la ruta de la extensión", "error");
                return;
            }
            var mogrtDir = path.join(extPath, "mogrts");
            if (!fs.existsSync(mogrtDir)) {
                showToast("Carpeta mogrts/ no encontrada en la extensión", "error");
                return;
            }

            var dirFiles = fs.readdirSync(mogrtDir);
            var defaultAliases = {
                title: ["title", "titulo", "título"],
                bullet: ["bullet", "bullet_point", "bullets"],
                step: ["step", "steps", "paso", "pasos"],
                definition: ["definition", "definicion", "definición"],
                data: ["data", "datos", "dato"],
                highlight: ["highlight", "highlights", "destacado"],
                summary: ["summary", "resumen"],
                question: ["question", "pregunta", "preguntas"]
            };

            var matched = 0;
            ST2_TYPES.forEach(function(t) {
                var aliases = defaultAliases[t] || [t];
                for (var fi = 0; fi < dirFiles.length; fi++) {
                    var fname = dirFiles[fi];
                    if (!fname.toLowerCase().endsWith(".mogrt")) continue;
                    var base = fname.replace(/\.mogrt$/i, "").toLowerCase().replace(/[_\-\s]+/g, "");
                    for (var a = 0; a < aliases.length; a++) {
                        if (base === aliases[a] || base.indexOf(aliases[a]) !== -1) {
                            state.mogrtPaths[t] = path.join(mogrtDir, fname);
                            matched++;
                            fi = dirFiles.length;
                            break;
                        }
                    }
                }
            });

            localStorage.setItem("edupro_mogrt_paths", JSON.stringify(state.mogrtPaths));
            loadMOGRTConfig();
            showToast(matched + "/" + ST2_TYPES.length + " MOGRTs cargados desde defaults", "success");
        } catch(e) {
            showToast("Error cargando defaults: " + e.message, "error");
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
                    return f.toLowerCase().indexOf(".mogrt") === f.length - 6 && f.charAt(0) !== ".";
                });

                // Map Spanish MOGRT names to types
                var TYPE_ALIASES = {
                    title: ["title", "titulo", "título"],
                    bullet: ["bullet", "bullet_point", "bullets"],
                    step: ["step", "steps", "paso", "pasos"],
                    definition: ["definition", "definicion", "definición"],
                    data: ["data", "datos", "dato"],
                    highlight: ["highlight", "highlights", "destacado"],
                    summary: ["summary", "resumen"],
                    question: ["question", "pregunta", "preguntas"]
                };

                var matched = 0;
                ST2_TYPES.forEach(function(type) {
                    var aliases = TYPE_ALIASES[type] || [type];
                    for (var i = 0; i < mogrtFiles.length; i++) {
                        var nameLower = mogrtFiles[i].toLowerCase().replace(".mogrt", "").replace(/[_\-\s]+/g, "");
                        for (var a = 0; a < aliases.length; a++) {
                            if (nameLower === aliases[a] || nameLower.indexOf(aliases[a]) !== -1) {
                                var fullPath = folderPath + path.sep + mogrtFiles[i];
                                state.mogrtPaths[type] = fullPath;
                                matched++;
                                i = mogrtFiles.length; // break outer
                                break;
                            }
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

        var filterChecks = document.querySelectorAll(".st2-track-filter:checked");
        var useFilter = filterChecks.length > 0;
        var hasCache = useFilter && state._trackRangesCache && Object.keys(state._trackRangesCache).length > 0;
        var effectiveConcurrency = (!useFilter || hasCache) ? ST2_BATCH_CONCURRENCY : 1;

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
            while (nextIdx < total && (nextIdx - completed) < effectiveConcurrency) {
                launchOne(nextIdx);
                nextIdx++;
            }
        }

        function _handleAnalysisResult(item, txEnd, result) {
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

            var txEnd = _st2ExtractTranscriptEnd(timedTranscript);

            if (!useFilter) {
                aiAnalyzer.analyzeSupertexts(timedTranscript, getSupertext2PromptContext(), function(result) {
                    _handleAnalysisResult(item, txEnd, result);
                });
                return;
            }

            // Filter mode: use cached ranges if available (parallel OK)
            if (hasCache && state._trackRangesCache[item.id]) {
                var checkedTracks = [];
                filterChecks.forEach(function(cb) { checkedTracks.push(parseInt(cb.value)); });
                var cachedRanges = [];
                for (var cti = 0; cti < checkedTracks.length; cti++) {
                    var tr = state._trackRangesCache[item.id][checkedTracks[cti]];
                    if (tr) { for (var cri = 0; cri < tr.length; cri++) cachedRanges.push(tr[cri]); }
                }
                if (cachedRanges.length > 0) {
                    cachedRanges.sort(function(a, b) { return a.start - b.start; });
                    // Merge overlapping ranges
                    var merged = [{ start: cachedRanges[0].start, end: cachedRanges[0].end }];
                    for (var mi = 1; mi < cachedRanges.length; mi++) {
                        var lastM = merged[merged.length - 1];
                        if (cachedRanges[mi].start <= lastM.end) {
                            if (cachedRanges[mi].end > lastM.end) lastM.end = cachedRanges[mi].end;
                        } else {
                            merged.push({ start: cachedRanges[mi].start, end: cachedRanges[mi].end });
                        }
                    }
                    var txForAI = _st2FilterTranscriptByRanges(timedTranscript, merged);
                    aiAnalyzer.analyzeSupertexts(txForAI, getSupertext2PromptContext(), function(result) {
                        _handleAnalysisResult(item, txEnd, result);
                    });
                } else {
                    // No clips on selected tracks for this sequence — skip
                    _st2BatchUpdateCardStatus(item.name, "st2-error", "Sin clips en tracks");
                    _st2BatchResults[item.name] = { error: "Sin clips en tracks seleccionados", seqId: item.id };
                    onItemDone();
                }
                return;
            }

            // Fallback: activate sequence and read live (sequential)
            csInterface.evalScript('openSequenceById("' + item.id.replace(/"/g, '\\"') + '")', function() {
                setTimeout(function() {
                    if (_st2BatchCancelled) { onItemDone(); return; }
                    _st2GetFilterRanges(function(ranges) {
                        var txForAI = ranges ? _st2FilterTranscriptByRanges(timedTranscript, ranges) : timedTranscript;
                        aiAnalyzer.analyzeSupertexts(txForAI, getSupertext2PromptContext(), function(result) {
                            _handleAnalysisResult(item, txEnd, result);
                        });
                    });
                }, 800);
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

        // Notify main.js to update _lastSeqName BEFORE opening (prevents polling race)
        if (window._epNotifyBatchSeqSwitch) window._epNotifyBatchSeqSwitch(seqName);
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
        setTimeout(function() { if (typeof _st2ResizeOpenStep === 'function') _st2ResizeOpenStep(); }, 100);
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
    // TRACK FILTER — pre-analysis filtering by clip ranges
    // ═══════════════════════════════════════════════════════════════

    function _st2FilterTranscriptByRanges(timedTranscript, ranges) {
        if (!timedTranscript || !ranges || ranges.length === 0) return timedTranscript;
        var lines = timedTranscript.split("\n");
        var filtered = lines.filter(function(line) {
            var m = line.match(/^\[(\d+\.?\d*)s\s*-\s*(\d+\.?\d*)s\]/);
            if (!m) return true;
            var lineStart = parseFloat(m[1]);
            var lineEnd = parseFloat(m[2]);
            for (var ri = 0; ri < ranges.length; ri++) {
                if (lineStart < ranges[ri].end && lineEnd > ranges[ri].start) return true;
            }
            return false;
        });
        return filtered.join("\n");
    }

    function _st2GetFilterRanges(callback) {
        var checks = document.querySelectorAll(".st2-track-filter:checked");
        if (checks.length === 0) { callback(null); return; }

        var trackIndices = [];
        checks.forEach(function(cb) { trackIndices.push(parseInt(cb.value)); });

        var allRanges = [];
        var pending = trackIndices.length;

        trackIndices.forEach(function(idx) {
            csInterface.evalScript('getClipRangesOnTrack(' + idx + ')', function(res) {
                try {
                    var data = JSON.parse(res);
                    if (data && data.ranges) {
                        for (var ri = 0; ri < data.ranges.length; ri++) {
                            allRanges.push(data.ranges[ri]);
                        }
                    }
                } catch(_e) {}
                pending--;
                if (pending === 0) {
                    if (allRanges.length === 0) { callback(null); return; }
                    allRanges.sort(function(a, b) { return a.start - b.start; });
                    var merged = [{ start: allRanges[0].start, end: allRanges[0].end }];
                    for (var i = 1; i < allRanges.length; i++) {
                        var last = merged[merged.length - 1];
                        if (allRanges[i].start <= last.end) {
                            if (allRanges[i].end > last.end) last.end = allRanges[i].end;
                        } else {
                            merged.push({ start: allRanges[i].start, end: allRanges[i].end });
                        }
                    }
                    callback(merged);
                }
            });
        });
    }

    function _st2SaveTrackFilterState() {
        var checked = [];
        document.querySelectorAll(".st2-track-filter:checked").forEach(function(cb) {
            checked.push(parseInt(cb.value));
        });
        localStorage.setItem("editorpro_st2_track_filter", JSON.stringify(checked));
    }

    function _st2InitTrackFilter() {
        try {
            var saved = localStorage.getItem("editorpro_st2_track_filter");
            if (saved) {
                var checked = JSON.parse(saved);
                document.querySelectorAll(".st2-track-filter").forEach(function(cb) {
                    cb.checked = checked.indexOf(parseInt(cb.value)) !== -1;
                });
            }
        } catch(_e) {}
        document.querySelectorAll(".st2-track-filter").forEach(function(cb) {
            cb.addEventListener("change", _st2SaveTrackFilterState);
        });
        var scanBtn = document.getElementById("btn-st2-scan-tracks");
        if (scanBtn) scanBtn.addEventListener("click", _st2ScanTracks);
    }

    function _st2ScanTracks() {
        var statusEl = document.getElementById("st2-scan-status");
        var btn = document.getElementById("btn-st2-scan-tracks");
        if (statusEl) statusEl.textContent = "Escaneando...";
        if (btn) { btn.disabled = true; btn.textContent = "⏳"; }

        csInterface.evalScript("getAllProjectSequences()", function(res) {
            try {
                var data = JSON.parse(res);
                var seqs = data.sequences || [];
                var openSeqs = seqs.filter(function(s) { return s.isOpen; });
                var activeSeqId = null;
                for (var ai = 0; ai < seqs.length; ai++) {
                    if (seqs[ai].isActive) { activeSeqId = seqs[ai].sequenceID; break; }
                }

                if (openSeqs.length === 0) {
                    if (statusEl) statusEl.textContent = "Sin secuencias abiertas";
                    if (btn) { btn.disabled = false; btn.textContent = "🔍 Escanear"; }
                    return;
                }

                state._trackRangesCache = {};
                var total = openSeqs.length;
                var current = 0;

                function scanNext() {
                    if (current >= total) {
                        if (activeSeqId) {
                            csInterface.evalScript('openSequenceById("' + activeSeqId.replace(/"/g, '\\"') + '")', function() {});
                        }
                        var maxTrackIdx = -1;
                        for (var sid in state._trackRangesCache) {
                            if (!state._trackRangesCache.hasOwnProperty(sid)) continue;
                            var trackMap = state._trackRangesCache[sid];
                            for (var tidxStr in trackMap) {
                                if (!trackMap.hasOwnProperty(tidxStr)) continue;
                                var ti = parseInt(tidxStr);
                                if (trackMap[tidxStr].length > 0 && ti > maxTrackIdx) maxTrackIdx = ti;
                            }
                        }
                        var labels = document.querySelectorAll(".st2-track-label");
                        labels.forEach(function(lbl) {
                            var cb = lbl.querySelector(".st2-track-filter");
                            if (!cb) return;
                            var trackIdx = parseInt(cb.value);
                            lbl.style.display = (maxTrackIdx >= 0 && trackIdx > maxTrackIdx) ? "none" : "";
                        });
                        var trackCount = maxTrackIdx + 1;
                        if (statusEl) statusEl.textContent = total + " seq · " + (trackCount > 0 ? trackCount + " tracks" : "sin clips");
                        if (btn) { btn.disabled = false; btn.textContent = "🔍 Escanear"; }
                        return;
                    }

                    var seq = openSeqs[current];
                    current++;
                    var seqId = seq.sequenceID;
                    if (statusEl) statusEl.textContent = "Escaneando " + current + "/" + total + "...";

                    csInterface.evalScript('openSequenceById("' + seqId.replace(/"/g, '\\"') + '")', function() {
                        setTimeout(function() {
                            state._trackRangesCache[seqId] = {};
                            var NUM_TRACKS = 8;
                            var tracksDone = 0;
                            for (var ti = 0; ti < NUM_TRACKS; ti++) {
                                (function(trackIndex) {
                                    csInterface.evalScript('getClipRangesOnTrack(' + trackIndex + ')', function(r) {
                                        try {
                                            var d = JSON.parse(r);
                                            state._trackRangesCache[seqId][trackIndex] = (d && d.ranges) ? d.ranges : [];
                                        } catch(_e) {
                                            state._trackRangesCache[seqId][trackIndex] = [];
                                        }
                                        tracksDone++;
                                        if (tracksDone >= NUM_TRACKS) scanNext();
                                    });
                                })(ti);
                            }
                        }, 600);
                    });
                }

                scanNext();
            } catch(e) {
                if (statusEl) statusEl.textContent = "Error: " + e.message;
                if (btn) { btn.disabled = false; btn.textContent = "🔍 Escanear"; }
            }
        });
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

        _st2GetFilterRanges(function(ranges) {
            var txForAI = timedTranscript;
            if (ranges) {
                txForAI = _st2FilterTranscriptByRanges(timedTranscript, ranges);
                var totalLines = timedTranscript.split("\n").filter(function(l) { return /^\[\d/.test(l); }).length;
                var keptLines = txForAI.split("\n").filter(function(l) { return /^\[\d/.test(l); }).length;
                setST2Progress(25, "Filtrado: " + keptLines + "/" + totalLines + " líneas. Analizando...");
            }

            aiAnalyzer.analyzeSupertexts(txForAI, getSupertext2PromptContext(), function(result) {
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
                        setTimeout(function() { if (typeof _st2ResizeOpenStep === 'function') _st2ResizeOpenStep(); }, 100);
                        showToast(state.supertexts2.length + " supertextos detectados", "success");
                    } finally {
                        state.analyzing = false;
                    }
                }, 500);
            });
        });
    }

    var _st2TypeFilter = null;
    var ST2_TYPE_COLORS = { title: "var(--accent-bright)", bullet: "var(--success)", step: "var(--info)", definition: "var(--warning)", data: "var(--highlight)", summary: "var(--brand-start)", highlight: "#facc15", question: "#f472b6" };

    // ── MOGRT property control definitions ──
    var ST2_FONT_WEIGHTS = [
        { label: "Regular", value: "DMSans-Regular" },
        { label: "Medium", value: "DMSans-Medium" },
        { label: "SemiBold", value: "DMSans-SemiBold" },
        { label: "Bold", value: "DMSans-Bold" },
        { label: "ExtraBold", value: "DMSans-ExtraBold" },
        { label: "Black", value: "DMSans-Black" }
    ];
    var ST2_COLOR_PRESETS = {
        definition: ["Vampire", "Green", "White"],
        data:       ["Vampire", "Green", "White"],
        step:       ["Vampire", "Green", "White"],
        summary:    ["Vampire", "Green", "White"],
        highlight:  ["White", "Vampire", "Green", "Yellow"]
    };
    var ST2_DEFAULT_FONT = {
        title: "DMSans-Bold", bullet: "DMSans-Bold", highlight: "DMSans-Bold",
        question: "DMSans-Bold", definition: "DMSans-Regular", data: "DMSans-Regular",
        step: "DMSans-Regular", summary: "DMSans-Regular"
    };

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

            // Build MOGRT property controls HTML
            var propsHtml = '';
            // Font weight (all types)
            var curFont = (st.mogrtProps && st.mogrtProps.fontStyle) || ST2_DEFAULT_FONT[curType] || 'DMSans-Bold';
            var fontOpts = ST2_FONT_WEIGHTS.map(function(fw) {
                return '<option value="' + fw.value + '"' + (fw.value === curFont ? ' selected' : '') + '>' + fw.label + '</option>';
            }).join('');
            propsHtml += '<select class="st2-prop-font" data-idx="' + idx + '" title="Font weight">' + fontOpts + '</select>';

            // Color preset (definition/data/step/summary/highlight)
            var colorPresets = ST2_COLOR_PRESETS[curType];
            if (colorPresets) {
                var curColor = (st.mogrtProps && st.mogrtProps.colorPreset !== undefined) ? st.mogrtProps.colorPreset : 1;
                var colorOpts = colorPresets.map(function(cp, ci) {
                    return '<option value="' + ci + '"' + (ci === curColor ? ' selected' : '') + '>' + cp + '</option>';
                }).join('');
                propsHtml += '<select class="st2-prop-color" data-idx="' + idx + '" title="Color preset">' + colorOpts + '</select>';
            }

            // Show Bullets (bullet only)
            if (curType === 'bullet') {
                var showBul = (st.mogrtProps && st.mogrtProps.showBullets !== undefined) ? st.mogrtProps.showBullets : true;
                propsHtml += '<label class="st2-prop-toggle" title="Show bullets"><input type="checkbox" class="st2-prop-showbullets" data-idx="' + idx + '"' + (showBul ? ' checked' : '') + '><span>Bullets</span></label>';
            }

            // Titulo: Recuadro off + Animación Salida
            if (curType === 'title') {
                var recOff = (st.mogrtProps && st.mogrtProps.recuadroOff !== undefined) ? st.mogrtProps.recuadroOff : true;
                var animSal = (st.mogrtProps && st.mogrtProps.animacionSalida !== undefined) ? st.mogrtProps.animacionSalida : true;
                propsHtml += '<label class="st2-prop-toggle" title="Recuadro"><input type="checkbox" class="st2-prop-recuadro" data-idx="' + idx + '"' + (recOff ? ' checked' : '') + '><span>Recuadro</span></label>';
                propsHtml += '<label class="st2-prop-toggle" title="Animación salida"><input type="checkbox" class="st2-prop-animsalida" data-idx="' + idx + '"' + (animSal ? ' checked' : '') + '><span>Anim. Salida</span></label>';
            }

            // Compact single-line text
            var displayText = (st.text || '').replace(/[\r\n]+/g, ' ').substring(0, 60);
            if ((st.text || '').length > 60) displayText += '…';

            el.innerHTML =
                '<label class="st-checkbox-wrap">' +
                    '<input type="checkbox" class="st2-check" data-idx="' + idx + '"' + (st.checked ? " checked" : "") + '>' +
                '</label>' +
                '<div class="st-time">' + formatTimeFull(st.time) + '</div>' +
                '<div class="st-content">' +
                    '<span class="st-text">' + esc(displayText) + '</span>' +
                    '<div class="st-meta-row">' +
                        '<span class="st-type-badge ' + typeClass + '" data-idx="' + idx + '">' + esc(curType) + '</span>' +
                        '<select class="st2-type-select" data-idx="' + idx + '">' + typeOptions + '</select>' +
                        '<span style="font-size:9px;color:var(--text-muted)">' + dur.toFixed(1) + 's</span>' +
                        '<button class="btn btn-xs btn-ghost st2-replace-btn hidden" data-idx="' + idx + '" title="Reemplazar clip en timeline">↻</button>' +
                    '</div>' +
                    '<div class="st-props-row">' + propsHtml + '</div>' +
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
            if (item && !e.target.closest(".st-checkbox-wrap") && !e.target.closest(".st2-type-select") && !e.target.closest(".st-props-row")) {
                var stIdx = parseInt(item.dataset.st2Idx);
                if (!isNaN(stIdx) && state.supertexts2[stIdx]) navigateToTime(state.supertexts2[stIdx].time);
            }
        });

        list.addEventListener("change", function(e) {
            // ── MOGRT property controls ──
            var fontSel = e.target.closest(".st2-prop-font");
            if (fontSel) {
                var fi = parseInt(fontSel.dataset.idx);
                if (!state.supertexts2[fi].mogrtProps) state.supertexts2[fi].mogrtProps = {};
                state.supertexts2[fi].mogrtProps.fontStyle = fontSel.value;
                return;
            }
            var colorSel = e.target.closest(".st2-prop-color");
            if (colorSel) {
                var ci2 = parseInt(colorSel.dataset.idx);
                if (!state.supertexts2[ci2].mogrtProps) state.supertexts2[ci2].mogrtProps = {};
                state.supertexts2[ci2].mogrtProps.colorPreset = parseInt(colorSel.value);
                return;
            }
            var showBul = e.target.closest(".st2-prop-showbullets");
            if (showBul) {
                var bi = parseInt(showBul.dataset.idx);
                if (!state.supertexts2[bi].mogrtProps) state.supertexts2[bi].mogrtProps = {};
                state.supertexts2[bi].mogrtProps.showBullets = showBul.checked;
                return;
            }
            var recuadro = e.target.closest(".st2-prop-recuadro");
            if (recuadro) {
                var ri = parseInt(recuadro.dataset.idx);
                if (!state.supertexts2[ri].mogrtProps) state.supertexts2[ri].mogrtProps = {};
                state.supertexts2[ri].mogrtProps.recuadroOff = recuadro.checked;
                return;
            }
            var animSal = e.target.closest(".st2-prop-animsalida");
            if (animSal) {
                var ai = parseInt(animSal.dataset.idx);
                if (!state.supertexts2[ai].mogrtProps) state.supertexts2[ai].mogrtProps = {};
                state.supertexts2[ai].mogrtProps.animacionSalida = animSal.checked;
                return;
            }

            var sel = e.target.closest(".st2-type-select");
            if (sel) {
                var idx = parseInt(sel.dataset.idx);
                state.supertexts2[idx].type = sel.value;
                // Re-render to update property controls for new type
                renderSupertext2Results(result);
                var badge = list.querySelector('.st-type-badge[data-idx="' + idx + '"]');
                if (badge) {
                    badge.className = "st-type-badge type-" + sel.value;
                    badge.textContent = sel.value;
                }
            }
        });

        updateSelectAll2Label();

        // Resize step body to fill available space after rendering results
        setTimeout(function() {
            if (typeof _st2ResizeOpenStep === 'function') _st2ResizeOpenStep();
        }, 100);
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
        _st2UpdateBulkToolbar();
    }

    /**
     * Multi-select toolbar: apply a property change to all checked items.
     */
    function _st2UpdateBulkToolbar() {
        var toolbar = document.getElementById("st2-bulk-toolbar");
        if (!toolbar) {
            // Create toolbar if it doesn't exist
            var container = document.getElementById("st2-results");
            if (!container) return;
            toolbar = document.createElement("div");
            toolbar.id = "st2-bulk-toolbar";
            toolbar.className = "st2-bulk-toolbar hidden";
            var refNode = document.getElementById("st2-list");
            if (refNode) container.insertBefore(toolbar, refNode);
            else container.appendChild(toolbar);
        }

        var checked = state.supertexts2.filter(function(st) { return st.checked; });
        if (checked.length < 2) {
            toolbar.classList.add("hidden");
            return;
        }
        toolbar.classList.remove("hidden");

        // Determine common types
        var types = {};
        checked.forEach(function(st) { types[st.type || "bullet"] = true; });
        var hasColorPreset = checked.some(function(st) { return !!ST2_COLOR_PRESETS[st.type]; });
        var hasBullets = !!types.bullet;
        var hasTitle = !!types.title;

        var html = '<span class="st2-bulk-label">' + checked.length + ' seleccionados:</span>';

        // Font weight
        var fontOpts = ST2_FONT_WEIGHTS.map(function(fw) {
            return '<option value="' + fw.value + '">' + fw.label + '</option>';
        }).join('');
        html += '<select class="st2-bulk-font" title="Font weight para seleccionados"><option value="">Font...</option>' + fontOpts + '</select>';

        // Color preset (if any selected type supports it)
        if (hasColorPreset) {
            // Use union of all presets
            var allPresets = {};
            checked.forEach(function(st) {
                var presets = ST2_COLOR_PRESETS[st.type];
                if (presets) presets.forEach(function(p) { allPresets[p] = true; });
            });
            var presetOpts = Object.keys(allPresets).map(function(p, i) {
                return '<option value="' + p + '">' + p + '</option>';
            }).join('');
            html += '<select class="st2-bulk-color" title="Color para seleccionados"><option value="">Color...</option>' + presetOpts + '</select>';
        }

        // Show Bullets toggle
        if (hasBullets) {
            html += '<label class="st2-prop-toggle"><input type="checkbox" class="st2-bulk-showbullets" checked><span>Bullets</span></label>';
        }

        toolbar.innerHTML = html;

        // Bind events
        var bulkFont = toolbar.querySelector(".st2-bulk-font");
        if (bulkFont) bulkFont.addEventListener("change", function() {
            var val = this.value;
            if (!val) return;
            state.supertexts2.forEach(function(st) {
                if (!st.checked) return;
                if (!st.mogrtProps) st.mogrtProps = {};
                st.mogrtProps.fontStyle = val;
            });
            // Update visible selects
            document.querySelectorAll(".st2-prop-font").forEach(function(sel) {
                var idx = parseInt(sel.dataset.idx);
                if (state.supertexts2[idx] && state.supertexts2[idx].checked) sel.value = val;
            });
            showToast(checked.length + " items → " + val.replace("DMSans-", ""), "success");
            this.value = "";
        });

        var bulkColor = toolbar.querySelector(".st2-bulk-color");
        if (bulkColor) bulkColor.addEventListener("change", function() {
            var val = this.value;
            if (!val) return;
            state.supertexts2.forEach(function(st) {
                if (!st.checked) return;
                var presets = ST2_COLOR_PRESETS[st.type];
                if (!presets) return;
                var idx = presets.indexOf(val);
                if (idx === -1) return;
                if (!st.mogrtProps) st.mogrtProps = {};
                st.mogrtProps.colorPreset = idx;
            });
            // Update visible selects
            document.querySelectorAll(".st2-prop-color").forEach(function(sel) {
                var idx = parseInt(sel.dataset.idx);
                var st = state.supertexts2[idx];
                if (st && st.checked && st.mogrtProps && st.mogrtProps.colorPreset !== undefined) {
                    sel.value = st.mogrtProps.colorPreset;
                }
            });
            showToast(checked.length + " items → " + val, "success");
            this.value = "";
        });

        var bulkBullets = toolbar.querySelector(".st2-bulk-showbullets");
        if (bulkBullets) bulkBullets.addEventListener("change", function() {
            var val = this.checked;
            state.supertexts2.forEach(function(st) {
                if (!st.checked || st.type !== "bullet") return;
                if (!st.mogrtProps) st.mogrtProps = {};
                st.mogrtProps.showBullets = val;
            });
            document.querySelectorAll(".st2-prop-showbullets").forEach(function(cb) {
                var idx = parseInt(cb.dataset.idx);
                if (state.supertexts2[idx] && state.supertexts2[idx].checked) cb.checked = val;
            });
            showToast("Bullets " + (val ? "on" : "off") + " para seleccionados", "success");
        });
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

    /**
     * Converts UI mogrtProps into the format ExtendScript expects:
     * key = displayName in MOGRT, value = appropriate type.
     */
    function _st2BuildMogrtProps(st) {
        if (!st.mogrtProps) return null;
        var props = {};
        var type = st.type || "bullet";
        var mp = st.mogrtProps;

        // Font style: apply to "Text" property (and "Title" for definition types)
        if (mp.fontStyle) {
            props["Text"] = { fontStyle: mp.fontStyle };
            // For definition/data/step/summary, also set Title font
            if (type === "definition" || type === "data" || type === "step" || type === "summary") {
                props["Title"] = { fontStyle: mp.fontStyle };
            }
        }

        // Color preset dropdown
        if (mp.colorPreset !== undefined) {
            props["Color"] = parseInt(mp.colorPreset);
        }

        // Show Bullets checkbox
        if (mp.showBullets !== undefined) {
            props["Show Bullets"] = !!mp.showBullets;
        }

        // Titulo: Recuadro off
        if (mp.recuadroOff !== undefined) {
            props["Recuadro off"] = !!mp.recuadroOff;
        }

        // Titulo: Animación Salida
        if (mp.animacionSalida !== undefined) {
            props["Animaci\u00f3n Salida"] = !!mp.animacionSalida;
        }

        return Object.keys(props).length > 0 ? props : null;
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

                // Calcular posiciones Y acumuladas.
                // Título (cascade[0]) y primer bullet (cascade[1]) ambos sin desplazar — cada MOGRT
                // tiene su posición nativa y van en tracks distintos.
                // Solo desde el segundo bullet en adelante se acumulan offsets.
                var cascYOffsets = [];
                // Find first bullet index (skip title)
                var firstBulletIdx = 0;
                for (var fi = 0; fi < cascadeLen; fi++) {
                    if (cascade[fi].type !== "title") { firstBulletIdx = fi; break; }
                }
                // Title and first bullet: no displacement
                for (var zi = 0; zi <= firstBulletIdx; zi++) {
                    cascYOffsets[zi] = 0;
                }
                // Subsequent bullets: accumulate from first bullet
                var accumY = 0;
                for (var cy = firstBulletIdx; cy < cascadeLen - 1; cy++) {
                    var lines = _st2LineCount(cascade[cy].text);
                    accumY += ST2_BULLET_SPACING + (lines > 1 ? ST2_EXTRA_LINE_SPACING : 0);
                    cascYOffsets[cy + 1] = accumY;
                }

                for (var c = 0; c < cascadeLen; c++) {
                    var cst = cascade[c];
                    var cType = cst.type || "bullet";

                    var entryTime = _st2Anticipate(cst.time);

                    var itemObj = {
                        time: entryTime,
                        endTime: _st2EnsureMinDuration(entryTime, cascadeEnd),
                        text: _st2FormatText(cst.text, cType, true),
                        type: cType,
                        mogrtPath: state.mogrtPaths[cType] || state.mogrtPaths.bullet || "",
                        bulletTrackOffset: c,
                        bulletPositionY: cascYOffsets[c],
                        _cascadeId: cascId
                    };
                    var cstProps = _st2BuildMogrtProps(cst);
                    if (cstProps) itemObj.mogrtProps = cstProps;

                    // When a title accompanies bullets, reposition & scale it
                    if (cType === "title" && cascadeLen > 1) {
                        var titleLines = _st2LineCount(cst.text);
                        if (titleLines > 1) {
                            // 2+ lines: Daniel's values
                            itemObj.titlePositionX = 491.1;
                            itemObj.titlePositionY = 196.0;
                            itemObj.titleScale = 64.5;
                        } else {
                            // 1 line: same X, slightly lower Y
                            itemObj.titlePositionX = 491.1;
                            itemObj.titlePositionY = 220.0;
                            itemObj.titleScale = 64.5;
                        }
                    }

                    items.push(itemObj);
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

                // Primer bullet sin mover, los siguientes se desplazan hacia abajo
                var bYOffsets = [];
                bYOffsets[0] = 0; // primer bullet: posición nativa del MOGRT
                var bAccumY = 0;
                for (var by = 0; by < bGroupLen - 1; by++) {
                    var bLines = _st2LineCount(bGroup[by].text);
                    bAccumY += ST2_BULLET_SPACING + (bLines > 1 ? ST2_EXTRA_LINE_SPACING : 0);
                    bYOffsets[by + 1] = bAccumY;
                }

                for (var g = 0; g < bGroupLen; g++) {
                    var bEntryTime = _st2Anticipate(bGroup[g].time);

                    var bItemObj = {
                        time: bEntryTime,
                        endTime: _st2EnsureMinDuration(bEntryTime, bGroupEnd),
                        text: _st2FormatText(bGroup[g].text, "bullet", true),
                        type: "bullet",
                        mogrtPath: state.mogrtPaths.bullet || "",
                        bulletTrackOffset: g,
                        bulletPositionY: bYOffsets[g],
                        _cascadeId: bCascId
                    };
                    var bGroupProps = _st2BuildMogrtProps(bGroup[g]);
                    if (bGroupProps) bItemObj.mogrtProps = bGroupProps;
                    items.push(bItemObj);
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

            var indepObj = {
                time: entryIndep,
                endTime: endIndep,
                text: _st2FormatText(st.text, type, false),
                type: type,
                mogrtPath: state.mogrtPaths[type] || "",
                bulletTrackOffset: 0,
                bulletPositionY: 0,
                _cascadeId: "s" + (cascadeCounter++)
            };
            var indepProps = _st2BuildMogrtProps(st);
            if (indepProps) indepObj.mogrtProps = indepProps;
            items.push(indepObj);
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

    // ═════════════════════════════════════════════════════════════
    // TAB NAVIGATION
    // ═════════════════════════════════════════════════════════════

    function _st2InitTabs() {
        // Accordion step headers — click to toggle, only one open at a time
        document.querySelectorAll('.st2-step-header').forEach(function(header) {
            header.addEventListener('click', function() {
                var step = this.dataset.st2Step;
                var body = document.getElementById('st2-step-body-' + step);
                var arrow = this.querySelector('.rec-step-arrow');
                var isOpen = body && !body.classList.contains('hidden');

                // Close all steps
                document.querySelectorAll('[id^="st2-step-body-"]').forEach(function(b) {
                    b.classList.add('hidden');
                    b.style.maxHeight = '';
                });
                document.querySelectorAll('.st2-step-header .rec-step-arrow').forEach(function(a) {
                    a.textContent = '\u25b8';
                });

                // Toggle current
                if (!isOpen && body) {
                    body.classList.remove('hidden');
                    if (arrow) arrow.textContent = '\u25be';
                    _st2ResizeOpenStep();
                }
            });
        });

        // Resize on window resize
        window.addEventListener('resize', _st2ResizeOpenStep);

        // Auto-expand to fullscreen when tool card body is shown
        var st2Card = document.querySelector('.st2-tool-card');
        var st2Body = st2Card ? st2Card.querySelector('.tool-card-body') : null;
        if (st2Body) {
            var observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(m) {
                    if (m.attributeName === 'class') {
                        var isVisible = !st2Body.classList.contains('hidden');
                        st2Card.classList.toggle('st2-expanded', isVisible);
                        if (isVisible) {
                            document.body.style.overflow = 'hidden';
                            // Multiple recalculations to catch layout settling
                            setTimeout(_st2ResizeOpenStep, 50);
                            setTimeout(_st2ResizeOpenStep, 200);
                            setTimeout(_st2ResizeOpenStep, 500);
                        } else {
                            document.body.style.overflow = '';
                        }
                    }
                });
            });
            observer.observe(st2Body, { attributes: true, attributeFilter: ['class'] });
        }

        // Control panel: scan button
        var scanBtn = document.getElementById('btn-st2-ctrl-scan');
        if (scanBtn) scanBtn.addEventListener('click', _st2CtrlScan);
        // Control panel: apply button
        var applyBtn = document.getElementById('btn-st2-ctrl-apply');
        if (applyBtn) applyBtn.addEventListener('click', _st2CtrlApply);

    }

    /**
     * Calculate and set the max-height of the open step body
     * so it fills all available vertical space.
     */
    function _st2ResizeOpenStep() {
        var toolCard = document.querySelector('.st2-tool-card');
        if (!toolCard) return;
        var cardBody = toolCard.querySelector('.tool-card-body:not(.hidden)');
        if (!cardBody) return;

        // Find the open step body
        var openBody = null;
        var bodies = cardBody.querySelectorAll('[id^="st2-step-body-"]');
        for (var i = 0; i < bodies.length; i++) {
            if (!bodies[i].classList.contains('hidden')) { openBody = bodies[i]; break; }
        }
        if (!openBody) return;

        // Reset to measure correctly
        openBody.style.maxHeight = 'none';
        openBody.style.overflowY = 'auto';

        // Total card height
        var totalHeight = toolCard.getBoundingClientRect().height;

        // Measure everything EXCEPT the open body
        var cardHeader = toolCard.querySelector('.tool-card-header');
        var usedHeight = cardHeader ? cardHeader.offsetHeight : 0;

        // Each step header height (just the clickable header, not the body)
        cardBody.querySelectorAll('.st2-step-header').forEach(function(sh) {
            usedHeight += sh.offsetHeight;
            // Add the step's border/margin
            var step = sh.closest('.rec-step');
            if (step) {
                var style = window.getComputedStyle(step);
                usedHeight += parseInt(style.marginTop || 0) + parseInt(style.marginBottom || 0);
                usedHeight += parseInt(style.borderTopWidth || 0) + parseInt(style.borderBottomWidth || 0);
            }
        });

        // Add card body padding
        var bodyStyle = window.getComputedStyle(cardBody);
        usedHeight += parseInt(bodyStyle.paddingTop || 0) + parseInt(bodyStyle.paddingBottom || 0);
        // Add open step's border-top (the body has a border-top from rec-step-body)
        usedHeight += 1;

        var available = totalHeight - usedHeight;
        if (available < 200) available = 200;

        openBody.style.maxHeight = available + 'px';
    }

    // ═════════════════════════════════════════════════════════════
    // CONTROL PANEL — Edit existing MOGRT clips in timeline
    // ═════════════════════════════════════════════════════════════

    var _st2CtrlClips = [];
    var _st2CtrlTypeFilter = null;
    var _st2MogrtSchemas = null; // Loaded from mogrts/schemas.json

    function _st2LoadMogrtSchemas() {
        if (_st2MogrtSchemas) return; // already loaded
        try {
            var extPath = csInterface.getSystemPath(SystemPath.EXTENSION);
            var schemaPath = path.join(extPath, 'mogrts', 'schemas.json');
            if (fs.existsSync(schemaPath)) {
                _st2MogrtSchemas = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
                $.writeln && $.writeln('[MOGRT] Loaded schemas: ' + Object.keys(_st2MogrtSchemas).join(', '));
            } else {
                _st2MogrtSchemas = {};
            }
        } catch(e) {
            _st2MogrtSchemas = {};
        }
    }

    function _st2GetSchemaForType(typeTag) {
        if (!_st2MogrtSchemas) _st2LoadMogrtSchemas();
        return _st2MogrtSchemas[typeTag.toUpperCase()] || null;
    }

    function _st2CtrlGetType(clip) {
        var m = (clip.name || '').match(/^\[([A-Z]+)\]/);
        return m ? m[1].toLowerCase() : 'unknown';
    }

    function _st2CtrlScan() {
        var statusEl = document.getElementById('st2-ctrl-status');
        if (statusEl) statusEl.textContent = 'Escaneando...';
        _st2CtrlTypeFilter = null;
        _st2CtrlLastSelectedKey = '';

        // Load MOGRT schemas if not already loaded
        _st2LoadMogrtSchemas();

        // Write schemas to temp file for ExtendScript to read
        var schemasForES = {};
        if (_st2MogrtSchemas) {
            for (var key in _st2MogrtSchemas) {
                if (!_st2MogrtSchemas.hasOwnProperty(key)) continue;
                var s = _st2MogrtSchemas[key];
                // Build a simple prop map: { propName: { type, min, max, options } }
                var propMap = {};
                (s.properties || []).forEach(function(p) {
                    var entry = { type: p.type };
                    if (p.type === 'slider') { entry.min = p.min; entry.max = p.max; }
                    if (p.type === 'dropdown') { entry.options = p.options; }
                    propMap[p.name] = entry;
                });
                schemasForES[key] = propMap;
            }
        }
        var tmpSchema = path.join(os.tmpdir(), 'EditorPro_MogrtSchemas.json');
        fs.writeFileSync(tmpSchema, JSON.stringify(schemasForES), 'utf8');
        var safeSchemaPath = tmpSchema.replace(/\\/g, '/');

        csInterface.evalScript('scanMOGRTClips("' + escExtend(safeSchemaPath) + '")', function(res) {
            try {
                var data = JSON.parse(res);
                if (data.error) { showToast(data.error, 'error'); if (statusEl) statusEl.textContent = ''; return; }
                _st2CtrlClips = data.clips || [];
                // Enrich clips with schema info
                _st2CtrlClips.forEach(function(c) {
                    c.selected = true;
                    var typeTag = _st2CtrlGetType(c);
                    var schema = _st2GetSchemaForType(typeTag);
                    if (schema) {
                        // Merge schema info into clip properties
                        (c.properties || []).forEach(function(p) {
                            var schemaProp = schema.properties.find(function(sp) { return sp.name === p.name; });
                            if (schemaProp) {
                                if (schemaProp.type === 'slider') {
                                    p.min = schemaProp.min;
                                    p.max = schemaProp.max;
                                }
                                if (schemaProp.type === 'dropdown') {
                                    p.options = schemaProp.options;
                                }
                                if (schemaProp.type === 'text') {
                                    p.defaultFont = schemaProp.font;
                                    p.defaultFontSize = schemaProp.fontSize;
                                }
                            }
                        });
                    }
                });
                if (statusEl) statusEl.textContent = _st2CtrlClips.length + ' clips MOGRT';
                _st2CtrlRender();
            } catch(e) {
                showToast('Error: ' + e.message, 'error');
                if (statusEl) statusEl.textContent = '';
            }
        });
    }

    function _st2CtrlRender() {
        var list = document.getElementById('st2-ctrl-list');
        var empty = document.getElementById('st2-ctrl-empty');
        var propsContainer = document.getElementById('st2-ctrl-props-container');
        if (!list) return;

        if (_st2CtrlClips.length === 0) {
            list.innerHTML = '';
            if (empty) empty.classList.remove('hidden');
            if (propsContainer) propsContainer.innerHTML = '';
            var existingFilter = document.getElementById('st2-ctrl-filter-bar');
            if (existingFilter) existingFilter.remove();
            return;
        }
        if (empty) empty.classList.add('hidden');

        // Build type filter bar
        var typeCounts = {};
        _st2CtrlClips.forEach(function(c) {
            var t = _st2CtrlGetType(c);
            typeCounts[t] = (typeCounts[t] || 0) + 1;
        });

        var filterBar = document.getElementById('st2-ctrl-filter-bar');
        if (!filterBar) {
            filterBar = document.createElement('div');
            filterBar.id = 'st2-ctrl-filter-bar';
            filterBar.className = 'st2-ctrl-filter-bar';
            // Insert before toolbar
            if (propsContainer && propsContainer.parentNode) propsContainer.parentNode.insertBefore(filterBar, propsContainer);
        }
        filterBar.innerHTML = '';
        var typeKeys = Object.keys(typeCounts).sort();
        // "All" pill
        var allPill = document.createElement('span');
        allPill.className = 'st2-ctrl-filter-tag' + (!_st2CtrlTypeFilter ? ' active' : '');
        allPill.textContent = 'Todos (' + _st2CtrlClips.length + ')';
        allPill.addEventListener('click', function() {
            _st2CtrlTypeFilter = null;
            _st2CtrlApplyFilter();
        });
        filterBar.appendChild(allPill);
        typeKeys.forEach(function(t) {
            var pill = document.createElement('span');
            pill.className = 'st2-ctrl-filter-tag' + (_st2CtrlTypeFilter === t ? ' active' : '');
            var col = ST2_TYPE_COLORS[t] || 'var(--text-secondary)';
            pill.style.color = (_st2CtrlTypeFilter === t) ? '' : col;
            pill.textContent = typeCounts[t] + ' ' + t;
            pill.addEventListener('click', function() {
                _st2CtrlTypeFilter = (_st2CtrlTypeFilter === t) ? null : t;
                _st2CtrlApplyFilter();
            });
            filterBar.appendChild(pill);
        });

        // Render clip list
        _st2CtrlRenderList();
    }

    function _st2CtrlApplyFilter() {
        // Update filter pills
        var filterBar = document.getElementById('st2-ctrl-filter-bar');
        if (filterBar) {
            filterBar.querySelectorAll('.st2-ctrl-filter-tag').forEach(function(pill, i) {
                if (i === 0) {
                    pill.classList.toggle('active', !_st2CtrlTypeFilter);
                } else {
                    var pillType = pill.textContent.replace(/^\d+\s+/, '');
                    pill.classList.toggle('active', _st2CtrlTypeFilter === pillType);
                }
            });
        }
        // Update selection: select only filtered type, deselect others
        if (_st2CtrlTypeFilter) {
            _st2CtrlClips.forEach(function(c) {
                c.selected = (_st2CtrlGetType(c) === _st2CtrlTypeFilter);
            });
        } else {
            _st2CtrlClips.forEach(function(c) { c.selected = true; });
        }
        _st2CtrlRenderList();
    }

    function _st2CtrlRenderList() {
        var list = document.getElementById('st2-ctrl-list');
        if (!list) return;
        list.innerHTML = '';

        var visible = _st2CtrlTypeFilter
            ? _st2CtrlClips.filter(function(c) { return _st2CtrlGetType(c) === _st2CtrlTypeFilter; })
            : _st2CtrlClips;

        visible.forEach(function(clip) {
            var idx = _st2CtrlClips.indexOf(clip);
            var el = document.createElement('div');
            el.className = 'supertext-item' + (clip.selected ? ' st-checked' : ' st-unchecked');
            el.dataset.ctrlIdx = idx;

            var clipName = clip.name || 'MOGRT';
            var typeTag = _st2CtrlGetType(clip);
            var typeClass = 'type-' + typeTag;
            var textPreview = clipName.replace(/^\[[A-Z]+\]\s*/, '');
            var startTime = clip.startTime !== undefined ? formatTimeFull(clip.startTime) : '?';
            var dur = (clip.endTime && clip.startTime) ? (clip.endTime - clip.startTime).toFixed(1) + 's' : '';

            el.innerHTML =
                '<label class="st-checkbox-wrap">' +
                    '<input type="checkbox" class="st2-ctrl-check" data-idx="' + idx + '"' + (clip.selected ? ' checked' : '') + '>' +
                '</label>' +
                '<div class="st-time">' + startTime + '</div>' +
                '<div class="st-content">' +
                    '<div class="st-text">' + esc(textPreview) + '</div>' +
                    '<div class="st-meta-row">' +
                        '<span class="st-type-badge ' + typeClass + '">' + typeTag + '</span>' +
                        '<span style="font-size:9px;color:var(--text-muted)">V' + ((clip.trackIndex || 0) + 1) + '</span>' +
                        (dur ? '<span style="font-size:9px;color:var(--text-muted)">' + dur + '</span>' : '') +
                    '</div>' +
                '</div>';

            list.appendChild(el);
        });

        _st2CtrlUpdateCount();

        // Bind checkbox changes via delegation (only once)
        if (!list._st2Bound) {
            list._st2Bound = true;
            list.addEventListener('change', function(e) {
                var chk = e.target.closest('.st2-ctrl-check');
                if (chk) {
                    var idx = parseInt(chk.dataset.idx);
                    _st2CtrlClips[idx].selected = chk.checked;
                    var row = chk.closest('.supertext-item');
                    if (row) {
                        row.classList.toggle('st-checked', chk.checked);
                        row.classList.toggle('st-unchecked', !chk.checked);
                    }
                    _st2CtrlUpdateCount();
                }
            });
        }
    }

    var _st2CtrlLastSelectedKey = '';
    function _st2CtrlUpdateCount() {
        var selected = _st2CtrlClips.filter(function(c) { return c.selected; });
        // Only rebuild panel if the set of selected clips changed
        var key = selected.map(function(c) { return c.trackIndex + ':' + c.clipIndex; }).join(',');
        if (key !== _st2CtrlLastSelectedKey) {
            _st2CtrlLastSelectedKey = key;
            _st2CtrlBuildPropsPanel();
        }
        // Update count label if it exists
        var titleEl = document.querySelector('.st2-props-panel-title');
        if (titleEl) titleEl.textContent = selected.length + ' seleccionados';
    }

    /**
     * Dynamically build the property panel from the intersection of
     * all selected clips' editable properties.
     */
    function _st2CtrlBuildPropsPanel() {
        var container = document.getElementById('st2-ctrl-props-container');
        if (!container) return;

        var selected = _st2CtrlClips.filter(function(c) { return c.selected; });
        if (selected.length === 0) {
            container.innerHTML = '';
            return;
        }

        // Find common properties across all selected clips
        // A property is "common" if every selected clip has it (by name + type)
        var propMap = {}; // name -> { type, count, values, propInfo }
        selected.forEach(function(clip) {
            if (!clip.properties) return;
            clip.properties.forEach(function(p) {
                var key = p.name;
                if (!propMap[key]) {
                    propMap[key] = { type: p.type, count: 0, values: [], propInfo: p };
                }
                propMap[key].count++;
                propMap[key].values.push(p.value);
            });
        });

        // Only show properties present in ALL selected clips (or at least 1 for flexibility)
        var commonProps = [];
        for (var key in propMap) {
            if (!propMap.hasOwnProperty(key)) continue;
            var pm = propMap[key];
            // Skip unknown/json/object/group types
            if (pm.type === 'unknown' || pm.type === 'json' || pm.type === 'object' || pm.type === 'group') continue;
            commonProps.push({ name: key, type: pm.type, count: pm.count, values: pm.values, propInfo: pm.propInfo });
        }

        if (commonProps.length === 0) {
            container.innerHTML = '<div style="font-size:10px;color:var(--text-muted);padding:8px">Sin propiedades editables</div>';
            return;
        }

        var html = '<div class="st2-props-panel">';
        html += '<div class="st2-props-panel-title">' + selected.length + ' seleccionados</div>';

        commonProps.forEach(function(cp) {
            html += '<div class="st2-prop-row" data-prop-name="' + esc(cp.name) + '" data-prop-type="' + cp.type + '">';
            html += '<span class="st2-prop-label">' + esc(cp.name) + '</span>';
            html += '<div class="st2-prop-control">';

            if (cp.type === 'color') {
                // Color swatch with popup picker
                var colorVal = cp.values[0] || '#ffffff';
                if (!colorVal || colorVal.length !== 7 || colorVal[0] !== '#') colorVal = '#ffffff';
                html += '<div style="position:relative">';
                html += '<div class="st2-color-swatch st2-ctrl-dynamic" data-prop="' + esc(cp.name) + '" data-value="' + colorVal + '" style="background:' + colorVal + '" title="' + colorVal + '"></div>';
                html += '</div>';

            } else if (cp.type === 'checkbox') {
                // Toggle switch
                var isOn = cp.values[0] === true;
                html += '<button type="button" class="st2-toggle' + (isOn ? ' on' : '') + ' st2-ctrl-dynamic" data-prop="' + esc(cp.name) + '" data-value="' + isOn + '"></button>';

            } else if (cp.type === 'dropdown') {
                // Dropdown with named options
                var dropVal = cp.values[0] || 0;
                var opts = cp.propInfo.options || [];
                html += '<select class="st2-ctrl-dynamic" data-prop="' + esc(cp.name) + '" data-subtype="dropdown">';
                html += '<option value="">Sin cambio</option>';
                for (var oi = 0; oi < opts.length; oi++) {
                    html += '<option value="' + oi + '"' + (oi === dropVal ? ' selected' : '') + '>' + esc(String(opts[oi])) + '</option>';
                }
                html += '</select>';

            } else if (cp.type === 'slider') {
                // Slider with number input
                var sliderVal = cp.values[0] || 0;
                var sMin = cp.propInfo.min !== undefined ? cp.propInfo.min : 0;
                var sMax = cp.propInfo.max !== undefined ? cp.propInfo.max : 100;
                html += '<input type="range" class="st2-ctrl-slider st2-ctrl-dynamic" data-prop="' + esc(cp.name) + '" value="' + sliderVal + '" min="' + sMin + '" max="' + sMax + '" step="0.5">';
                html += '<input type="number" class="st2-ctrl-slider-num" data-prop="' + esc(cp.name) + '" value="' + sliderVal + '" step="0.5" style="width:50px;font-size:10px;padding:3px;background:#2a2a2a;color:#e0e0e0;border:1px solid rgba(255,255,255,0.15);border-radius:4px;margin-left:4px">';

            } else if (cp.type === 'text') {
                // Text: show preview + font weight dropdown
                var fontName = cp.propInfo.fontStyle || '';
                var shortFont = fontName.replace(/^[A-Za-z]+-/, '');
                var textPreview = String(cp.values[0] || '').substring(0, 25);
                html += '<span style="font-size:9px;color:var(--text-muted);margin-right:4px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(textPreview) + '</span>';
                html += '<select class="st2-ctrl-dynamic" data-prop="' + esc(cp.name) + '" data-subtype="font">';
                html += '<option value="">' + esc(shortFont || 'Font...') + '</option>';
                ST2_FONT_WEIGHTS.forEach(function(fw) {
                    html += '<option value="' + fw.value + '"' + (fw.value === fontName ? ' selected' : '') + '>' + fw.label + '</option>';
                });
                html += '</select>';
            }

            html += '</div></div>';
        });

        html += '<div class="st2-props-apply">';
        html += '<button id="btn-st2-ctrl-apply" class="btn-analyze btn-analyze-alt" style="width:100%"><span>\u2705 Aplicar</span></button>';
        html += '</div></div>';

        container.innerHTML = html;

        // Bind events on new elements
        var applyBtn = document.getElementById('btn-st2-ctrl-apply');
        if (applyBtn) applyBtn.addEventListener('click', _st2CtrlApply);

        // Toggle buttons
        container.querySelectorAll('.st2-toggle').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var isOn = this.classList.toggle('on');
                this.dataset.value = isOn ? 'true' : 'false';
                this.dataset.changed = 'true';
            });
        });

        // Color swatches — open popup picker on click
        // Platzi brand palette
        var COLOR_PALETTE_PRIMARY = [
            { hex: '#141515', name: 'Negro' },
            { hex: '#F7FBF8', name: 'Blanco' },
            { hex: '#0AE98A', name: 'Verde' }
        ];
        var COLOR_PALETTE_SECONDARY = [
            { hex: '#0AB5E9', name: 'Azul' },
            { hex: '#A561FF', name: 'Morado' },
            { hex: '#E53256', name: 'Rojo' },
            { hex: '#F5D400', name: 'Amarillo' },
            { hex: '#F55A00', name: 'Naranja' },
            { hex: '#FF61E2', name: 'Rosa' }
        ];
        var COLOR_PALETTE_ALL = COLOR_PALETTE_PRIMARY.concat(COLOR_PALETTE_SECONDARY);
        container.querySelectorAll('.st2-color-swatch').forEach(function(swatch) {
            swatch.addEventListener('click', function(e) {
                e.stopPropagation();
                // Close any existing popup
                var existing = document.querySelector('.st2-color-popup');
                if (existing) existing.remove();

                var currentColor = (this.dataset.value || '#ffffff').toLowerCase();
                var popup = document.createElement('div');
                popup.className = 'st2-color-popup';
                var html = '<div class="st2-color-section-label">Primaria</div><div class="st2-color-popup-grid">';
                COLOR_PALETTE_PRIMARY.forEach(function(c) {
                    var sel = (c.hex.toLowerCase() === currentColor) ? ' selected' : '';
                    html += '<div class="st2-color-popup-cell' + sel + '" data-color="' + c.hex + '" style="background:' + c.hex + '" title="' + c.name + '"></div>';
                });
                html += '</div><div class="st2-color-section-label">Secundaria</div><div class="st2-color-popup-grid">';
                COLOR_PALETTE_SECONDARY.forEach(function(c) {
                    var sel = (c.hex.toLowerCase() === currentColor) ? ' selected' : '';
                    html += '<div class="st2-color-popup-cell' + sel + '" data-color="' + c.hex + '" style="background:' + c.hex + '" title="' + c.name + '"></div>';
                });
                html += '</div>';
                html += '<div class="st2-color-hex-row"><input class="st2-color-hex-input" value="' + (this.dataset.value || '#ffffff') + '" maxlength="7" placeholder="#RRGGBB"><button class="btn btn-xs btn-success" style="font-size:9px;padding:2px 6px">OK</button></div>';
                popup.innerHTML = html;
                this.parentNode.appendChild(popup);

                var swatchEl = this;
                // Click on palette cell
                popup.querySelectorAll('.st2-color-popup-cell').forEach(function(cell) {
                    cell.addEventListener('click', function(ev) {
                        ev.stopPropagation();
                        var c = this.dataset.color;
                        swatchEl.style.background = c;
                        swatchEl.dataset.value = c;
                        swatchEl.dataset.changed = 'true';
                        swatchEl.title = c;
                        popup.querySelector('.st2-color-hex-input').value = c;
                        popup.querySelectorAll('.st2-color-popup-cell').forEach(function(cc) { cc.classList.remove('selected'); });
                        this.classList.add('selected');
                    });
                });
                // OK button
                popup.querySelector('.btn-success').addEventListener('click', function(ev) {
                    ev.stopPropagation();
                    var hex = popup.querySelector('.st2-color-hex-input').value.trim();
                    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
                        swatchEl.style.background = hex;
                        swatchEl.dataset.value = hex;
                        swatchEl.dataset.changed = 'true';
                        swatchEl.title = hex;
                    }
                    popup.remove();
                });
                // Hex input enter
                popup.querySelector('.st2-color-hex-input').addEventListener('keydown', function(ev) {
                    if (ev.key === 'Enter') {
                        ev.preventDefault();
                        popup.querySelector('.btn-success').click();
                    }
                });
                // Close on outside click
                setTimeout(function() {
                    document.addEventListener('click', function closePopup() {
                        popup.remove();
                        document.removeEventListener('click', closePopup);
                    }, { once: true });
                }, 10);
            });
        });

        // Number inputs — track changes
        container.querySelectorAll('input[type="number"]').forEach(function(inp) {
            inp.addEventListener('change', function() { this.dataset.changed = 'true'; });
        });

        // Slider + number sync
        container.querySelectorAll('.st2-ctrl-slider').forEach(function(slider) {
            var propName = slider.dataset.prop;
            var numInput = container.querySelector('.st2-ctrl-slider-num[data-prop="' + propName + '"]');
            slider.addEventListener('input', function() {
                this.dataset.changed = 'true';
                if (numInput) numInput.value = this.value;
            });
            if (numInput) {
                numInput.addEventListener('change', function() {
                    slider.value = this.value;
                    slider.dataset.changed = 'true';
                });
            }
        });

        // Select changes
        container.querySelectorAll('select.st2-ctrl-dynamic').forEach(function(sel) {
            sel.addEventListener('change', function() { this.dataset.changed = 'true'; });
        });
    }

    function _st2CtrlApply() {
        var selected = _st2CtrlClips.filter(function(c) { return c.selected; });
        if (selected.length === 0) { showToast('Selecciona al menos un clip', 'info'); return; }

        var container = document.getElementById('st2-ctrl-props-container');
        if (!container) return;

        // Read all changed dynamic controls
        var props = {};
        container.querySelectorAll('.st2-ctrl-dynamic').forEach(function(ctrl) {
            if (ctrl.dataset.changed !== 'true') return;
            var propName = ctrl.dataset.prop;
            if (!propName) return;
            var propType = ctrl.closest('.st2-prop-row').dataset.propType;

            if (ctrl.classList.contains('st2-color-swatch')) {
                // Color swatch: convert hex to [r,g,b,a]
                var hex = ctrl.dataset.value;
                var r = parseInt(hex.substr(1,2), 16) / 255;
                var g = parseInt(hex.substr(3,2), 16) / 255;
                var b = parseInt(hex.substr(5,2), 16) / 255;
                props[propName] = [r, g, b, 1];
            } else if (ctrl.classList.contains('st2-toggle')) {
                // Checkbox toggle
                props[propName] = ctrl.dataset.value === 'true';
            } else if (ctrl.type === 'number') {
                // Number (slider or dropdown index)
                props[propName] = parseFloat(ctrl.value);
            } else if (ctrl.tagName === 'SELECT') {
                if (!ctrl.value) return; // "Sin cambio" selected
                if (ctrl.dataset.subtype === 'font') {
                    // Font weight change on text property
                    props[propName] = { fontStyle: ctrl.value };
                } else if (ctrl.dataset.subtype === 'dropdown') {
                    // Dropdown: send as integer index
                    props[propName] = parseInt(ctrl.value);
                } else {
                    props[propName] = parseFloat(ctrl.value);
                    if (isNaN(props[propName])) props[propName] = ctrl.value;
                }
            }
        });

        if (Object.keys(props).length === 0) { showToast('Selecciona un cambio (font, color, bullets)', 'info'); return; }

        // Build payload for ExtendScript
        var payload = {
            clips: selected.map(function(c) {
                return { trackIndex: c.trackIndex, startTime: c.startTime, properties: props };
            })
        };

        var tmpFile = path.join(os.tmpdir(), 'EditorPro_ST2_CtrlApply.json');
        fs.writeFileSync(tmpFile, JSON.stringify(payload), 'utf8');
        var safePath = tmpFile.replace(/\\/g, '/');

        showToast('Aplicando a ' + selected.length + ' clips...', 'info');
        csInterface.evalScript('applyMOGRTProperties("' + escExtend(safePath) + '")', function(res) {
            try {
                var data = JSON.parse(res);
                if (data.error) { showToast(data.error, 'error'); return; }
                showToast(data.modified + ' clips modificados', 'success');
                // Re-scan to refresh values, preserving current filter
                var savedFilter = _st2CtrlTypeFilter;
                _st2CtrlScan();
                // Restore filter after scan completes
                setTimeout(function() {
                    if (savedFilter) {
                        _st2CtrlTypeFilter = savedFilter;
                        _st2CtrlApplyFilter();
                    }
                }, 500);
            } catch(e) {
                showToast('Error: ' + e.message, 'error');
            }
        });
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
        loadDefaultMOGRTs: loadDefaultMOGRTs,
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