/**
 * Editor-Pro — Motion-Pro UI Module
 * Extracted from main.js for organizational clarity.
 * All behavior is identical to the original.
 */
(function(global) {
    "use strict";

    var EP = global.EditorProUI = global.EditorProUI || {};

    // ─── Shared references (captured at init time, not load time) ─
    var state, csInterface, fs, path, os, motionPro, aiAnalyzer;
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
        motionPro    = global._epMotionPro;
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

    function mpInit() {
        _initRefs();
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
        if (state.mpAnalyzing) return;
        if (btn) btn.classList.toggle("btn-disabled", !hasTranscript);
        if (warn) warn.classList.toggle("hidden", hasTranscript);
    }

    var _mpAnalysisHeartbeat = null;
    var _mpAnalysisCancelled = false;

    function mpClearMotionAnalysisHeartbeat() {
        if (_mpAnalysisHeartbeat) {
            clearInterval(_mpAnalysisHeartbeat);
            _mpAnalysisHeartbeat = null;
        }
    }

    function mpSetMotionAnalyzeButtonMode(analyzing) {
        var btn = document.getElementById("btn-mp-analyze");
        if (!btn) return;
        var textEl = btn.querySelector(".btn-analyze-text");
        if (analyzing) {
            btn.classList.remove("btn-disabled");
            btn.classList.add("btn-analyze-cancel");
            if (textEl) textEl.textContent = "Detener análisis";
        } else {
            btn.classList.remove("btn-analyze-cancel");
            if (textEl) textEl.textContent = "Analizar para Motions";
            mpUpdateAnalyzeButton();
        }
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
            { central: "system.md", local: "SYSTEM_PROMPT.md" },
            { central: "style-guide.md", local: "STYLE_GUIDE.md" },
            { central: "design-fundamentals.md", local: "DESIGN_FUNDAMENTALS.md" }
        ];
        try {
            var promptsDir = path.join(extRoot, "Prompts", "MotionPro");
            var serverLib = path.join(extRoot, "motion-server", "lib");
            originals.forEach(function(o) {
                // Restore from the canonical source in Prompts/MotionPro → motion-server/lib
                var centralPath = path.join(promptsDir, o.central);
                var localPath = path.join(serverLib, o.local);
                if (fs.existsSync(centralPath)) {
                    fs.copyFileSync(centralPath, localPath);
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
        if (state.mpAnalyzing) {
            _mpAnalysisCancelled = true;
            aiAnalyzer.abort();
            mpClearMotionAnalysisHeartbeat();
            state.mpAnalyzing = false;
            hideElement("mp-analyze-progress");
            refreshMPHeaderProgressVisibility();
            mpSetMotionAnalyzeButtonMode(false);
            showToast("Análisis detenido", "info");
            return;
        }
        if (!state.transcript || state.transcript.trim().length === 0) {
            showToast("Carga una transcripción primero", "error");
            return;
        }
        if (!aiAnalyzer.isConfigured()) {
            showToast("Configura un proveedor de IA en Settings", "error");
            return;
        }

        _mpAnalysisCancelled = false;
        state.mpAnalyzing = true;
        mpSetMotionAnalyzeButtonMode(true);

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
        mpSetProgress("mp-analyze", 15, "Analizando transcripción… (puede tardar varios minutos en clases largas)");

        var tick = 0;
        mpClearMotionAnalysisHeartbeat();
        _mpAnalysisHeartbeat = setInterval(function() {
            tick++;
            var elapsed = tick * 15;
            var pct = Math.min(15 + tick * 3, 42);
            mpSetProgress("mp-analyze", pct, "Analizando… ~" + elapsed + "s — si tarda demasiado, prueba IA en la nube en Ajustes o pulsa Detener");
        }, 15000);

        var timedTranscript = buildTimedTranscript();

        aiAnalyzer.analyzeMotionProposals(timedTranscript, getPromptContext("mp"), function(result) {
            mpClearMotionAnalysisHeartbeat();
            if (_mpAnalysisCancelled) return;
            state.mpAnalyzing = false;
            mpSetMotionAnalyzeButtonMode(false);
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
        var list = clearContainer(document.getElementById("mp-proposal-list"));
        if (!list) return;

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
        mpUpdateMotionProEmptyState();
    }

    function mpUpdateMotionProEmptyState() {
        var empty = document.getElementById("mp-empty");
        if (!empty || !motionPro) return;
        var has = (motionPro.proposals && motionPro.proposals.length > 0) ||
            (motionPro.motions && motionPro.motions.length > 0);
        empty.classList.toggle("hidden", !!has);
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
        mpUpdateMotionProEmptyState();
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
        return s;
    }

    /** Paths embedded in ExtendScript string literals — escape \\ and " */
    function mpEscapePathForEvalScript(p) {
        if (p === undefined || p === null) return "";
        return String(p).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }

    /** Duración del clip en timeline: no mayor que el vídeo real (evita franja rayada). Resta ~2 frames por redondeo contenedor/Premiere. */
    var MP_TIMELINE_FPS = 30;
    function mpComputeClipDurationSecs(motion, v) {
        var mpStart = Math.max(0, motion.startTime - MP_ANTICIPATION_SECS);
        var proposalDur = Math.max(0.1, motion.endTime - mpStart);
        if (v && typeof v.mediaDurationSec === "number" && v.mediaDurationSec > 0.05) {
            var safeMedia = Math.max(0.05, v.mediaDurationSec - 2 / MP_TIMELINE_FPS);
            return Math.min(proposalDur, safeMedia);
        }
        return proposalDur;
    }

    function mpPlaceSingleInTimeline(motionId, callback) {
        var motion = motionPro._findMotion(motionId);
        if (!motion) { if (callback) callback(); return; }
        var v = motionPro.getActiveVersion(motionId);
        if (!v || !v.mp4Path) { if (callback) callback(); return; }

        var mpStart = Math.max(0, motion.startTime - MP_ANTICIPATION_SECS);
        var mpDuration = mpComputeClipDurationSecs(motion, v);
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

        csInterface.evalScript('importAndPlaceMotions("' + mpEscapePathForEvalScript(tmpPath) + '")', function(res) {
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

        var mpStartRep = Math.max(0, motion.startTime - MP_ANTICIPATION_SECS);
        var payload = {
            mp4Path: mpNormalizeMediaPath(v.mp4Path),
            startTimeSecs: mpStartRep,
            durationSecs: mpComputeClipDurationSecs(motion, v),
            oldTrackIndex: motion.baseTrackIndex,
            newTrackIndex: motion.baseTrackIndex + (v.version - 1),
            clipName: "MP: " + motionId + "-v" + v.version,
            oldClipPattern: "MP: " + motionId
        };

        var tmpPath = _writeTempJson(payload, "mp_replace");
        if (!tmpPath) return;

        csInterface.evalScript('replaceMotionOnTrack("' + mpEscapePathForEvalScript(tmpPath) + '")', function(res) {
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
        var list = clearContainer(document.getElementById("mp-motions-list"));
        if (!list) return;

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
        mpUpdateMotionProEmptyState();
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



    // ─── Expose to EditorProUI namespace ───────────────────────
    EP.motionPro = {
        init: mpInit,
        checkServerStatus: mpCheckServerStatus,
        toggleServer: mpToggleServer,
        startAnalysis: mpStartAnalysis,
        startGeneration: mpStartGeneration,
        cancelGeneration: mpCancelGeneration,
        renderProposals: mpRenderProposals,
        renderControlPanel: mpRenderControlPanel,
        renderFullUI: mpRenderFullUI,
        toggleSelectAll: mpToggleSelectAll,
        saveBrandfetchKey: mpSaveBrandfetchKey,
        loadBrandfetchKey: mpLoadBrandfetchKey,
        toggleGenPromptsPanel: mpToggleGenPromptsPanel,
        saveGenPrompts: mpSaveGenPrompts,
        resetGenPrompts: mpResetGenPrompts,
        bindGenPromptAccordions: mpBindGenPromptAccordions,
        setProgress: mpSetProgress,
        refreshHeaderProgressVisibility: refreshMPHeaderProgressVisibility,
        resolveOutputDir: mpResolveOutputDir,
        bindStepHeaders: mpBindStepHeaders,
        switchToSequence: mpSwitchToSequence,
        updateAnalyzeButton: mpUpdateAnalyzeButton
    };

})(window);