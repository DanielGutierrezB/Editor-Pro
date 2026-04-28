/**
 * Editor-Pro — B-Roll UI Module
 * Handles all DOM interactions for the B-Roll tab.
 * v1.8.31: inline generation progress in Step 2
 */
(function(global) {
    "use strict";

    var EP = global.EditorProUI = global.EditorProUI || {};

    // ── Shared references (captured at init time) ──────────────────────────────
    var state, csInterface, broll, aiAnalyzer;
    var on, showToast, showElement, hideElement, disableBtn, enableBtn;
    var esc, escAttr, formatTime, checkAIReady, expandSection;
    var refreshSequenceInfo, bindCollapsibles, refreshAllHeaderProgress;

    var _sessionKey = "";
    var _genProgress = { current: 0, total: 0, startMs: 0 };

    function _initRefs() {
        state       = global._epState;
        csInterface = global._epCSInterface;
        broll       = global._epBroll;
        aiAnalyzer  = global._epAiAnalyzer;

        on                       = global._epOn;
        showToast                = global._epShowToast;
        showElement              = global._epShowElement;
        hideElement              = global._epHideElement;
        disableBtn               = global._epDisableBtn;
        enableBtn                = global._epEnableBtn;
        esc                      = global._epEsc;
        escAttr                  = global._epEscAttr;
        formatTime               = global._epFormatTime;
        checkAIReady             = global._epCheckAIReady;
        expandSection            = global._epExpandSection;
        refreshSequenceInfo      = global._epRefreshSequenceInfo;
        bindCollapsibles         = global._epBindCollapsibles;
        refreshAllHeaderProgress = global._epRefreshAllHeaderProgress;
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    function _el(id) { return document.getElementById(id); }

    function _setDotStatus(dotId, textId, online, label) {
        var dot = _el(dotId);
        var text = _el(textId);
        if (dot) dot.className = "br-server-dot " + (online ? "br-dot-on" : "br-dot-off");
        if (text) text.textContent = label;
    }

    var _serverCheckRetries = 0;

    function _refreshServerStatus() {
        if (!broll) return;

        // 1. Motion-Pro server (retry up to 3 times with 2s delay for auto-start)
        broll.checkServer(function(ok) {
            if (!ok && _serverCheckRetries < 3) {
                _serverCheckRetries++;
                setTimeout(_refreshServerStatus, 2000);
                _setDotStatus("br-dep-server-dot", "br-dep-server-text", false,
                    "Motion Server — iniciando...");
                return;
            }
            _serverCheckRetries = 0;
            _setDotStatus("br-dep-server-dot", "br-dep-server-text", ok,
                ok ? "Motion Server (:3847)" : "Motion Server — detenido");
        });

        // 2. Image provider check — ComfyUI, Gemini, FAL, or none
        var settings = broll.getSettings();
        var comfyRow = _el("br-dep-comfy-row");
        if (settings.imageProvider === "comfyui") {
            if (comfyRow) comfyRow.style.display = "";
            var comfyUrl = settings.imageEndpointUrl || "http://localhost:8188";
            broll._get("/api/broll/check-comfyui?url=" + encodeURIComponent(comfyUrl), function(err, result) {
                if (!err && result && result.ok) {
                    _setDotStatus("br-dep-comfy-dot", "br-dep-comfy-text", true,
                        "ComfyUI (" + (result.device || "?") + ")");
                } else {
                    _setDotStatus("br-dep-comfy-dot", "br-dep-comfy-text", false,
                        "ComfyUI — " + (err ? "servidor detenido" : (result && result.error ? result.error : "no conecta")));
                }
            });
        } else if (settings.imageProvider === "gemini_image") {
            if (comfyRow) comfyRow.style.display = "";
            var hasKey = !!(settings.imageGeminiApiKey && settings.imageGeminiApiKey.trim());
            _setDotStatus("br-dep-comfy-dot", "br-dep-comfy-text", hasKey,
                hasKey ? "Gemini Flash Image — API key configurada" : "Gemini Flash Image — falta API key");
        } else if (settings.imageProvider === "fal") {
            if (comfyRow) comfyRow.style.display = "";
            var hasFalKey = !!(settings.imageFalApiKey && settings.imageFalApiKey.trim());
            _setDotStatus("br-dep-comfy-dot", "br-dep-comfy-text", hasFalKey,
                hasFalKey ? "FAL.ai — API key configurada" : "FAL.ai — falta API key");
        } else {
            _setDotStatus("br-dep-comfy-dot", "br-dep-comfy-text", false, "ComfyUI — no seleccionado");
            if (comfyRow) comfyRow.style.display = "none";
        }

        // 3. Video provider check (gemini_video and fal need API keys)
        var vidRow = _el("br-dep-vid-row");
        var vidProv2 = settings.videoProvider;
        if (vidProv2 === "gemini_video") {
            if (vidRow) vidRow.style.display = "";
            var hasVidKey = !!(settings.videoGeminiApiKey && settings.videoGeminiApiKey.trim());
            _setDotStatus("br-dep-vid-dot", "br-dep-vid-text", hasVidKey,
                hasVidKey ? "Gemini Veo — API key configurada" : "Gemini Veo — falta API key");
        } else if (vidProv2 === "fal") {
            if (vidRow) vidRow.style.display = "";
            var hasVidFalKey = !!(settings.videoFalApiKey && settings.videoFalApiKey.trim());
            _setDotStatus("br-dep-vid-dot", "br-dep-vid-text", hasVidFalKey,
                hasVidFalKey ? "FAL.ai video — API key configurada" : "FAL.ai video — falta API key");
        } else {
            if (vidRow) vidRow.style.display = "none";
        }

        // 4. ffmpeg
        try {
            var exec = require("child_process").exec;
            exec("ffmpeg -version 2>/dev/null || /opt/homebrew/bin/ffmpeg -version 2>/dev/null", { timeout: 3000 }, function(err) {
                _setDotStatus("br-dep-ffmpeg-dot", "br-dep-ffmpeg-text", !err,
                    !err ? "ffmpeg ✓" : "ffmpeg — no instalado");
            });
        } catch(e) {
            _setDotStatus("br-dep-ffmpeg-dot", "br-dep-ffmpeg-text", false, "ffmpeg — error");
        }
    }

    function _getTranscriptText() {
        var raw = state.transcript || "";
        if (state.segments && state.segments.length > 0) {
            // Format with timestamps for better LLM context
            var lines = [];
            for (var i = 0; i < state.segments.length; i++) {
                var seg = state.segments[i];
                if (seg && seg.startTime !== undefined && seg.text) {
                    lines.push("[" + seg.startTime + " --> " + seg.endTime + "] " + seg.text);
                }
            }
            if (lines.length > 0) return lines.join("\n");
        }
        return raw;
    }

    // ── Step 1: Analysis ───────────────────────────────────────────────────────

    function _renderNoTranscript() {
        var transcriptSrc = _getTranscriptText();
        var warn = _el("br-no-transcript");
        if (warn) warn.style.display = transcriptSrc.trim() ? "none" : "";
        var btn = _el("btn-br-analyze");
        if (btn) {
            var hasTranscript = !!transcriptSrc.trim();
            btn.disabled = !hasTranscript;
            if (hasTranscript) {
                btn.classList.remove("btn-disabled");
            } else {
                btn.classList.add("btn-disabled");
            }
        }
        var hint = _el("br-step-hint-1");
        if (hint && transcriptSrc.trim()) {
            hint.textContent = "Listo para analizar";
        }
    }

    function startAnalysis() {
        var transcript = _getTranscriptText();
        if (!transcript.trim()) {
            showToast("Carga una transcripción primero", "error");
            return;
        }
        if (!checkAIReady()) return;
        if (!broll) return;

        // Analysis uses ai-analyzer directly — no server needed
        if (window.EPLogger) EPLogger.log("broll", "analyze-start", "transcriptLen=" + transcript.length);

        // Check "Solo en marcadores" toggle — filter B-Roll to marker ranges
        var markersOnly = document.getElementById("br-markers-only");
        if (markersOnly && markersOnly.checked && csInterface) {
            var _markersDone = false;
            var _markersTimeout = setTimeout(function() {
                if (_markersDone) return;
                _markersDone = true;
                console.warn("[BRoll] getSequenceMarkers timed out after 15s, proceeding without markers");
                if (window.EPLogger) EPLogger.log("broll", "markers-timeout", "15s exceeded");
                showToast("Timeout leyendo marcadores — continuando sin filtro", "warning");
                _proceedWithRhythmAnalysis(transcript);
            }, 15000);

            csInterface.evalScript('getSequenceMarkers()', function(res) {
                if (_markersDone) return;
                _markersDone = true;
                clearTimeout(_markersTimeout);
                try {
                    var data = JSON.parse(res);
                    if (data.markers && data.markers.length > 0) {
                        var markerText = '\n\nGENERAR B-ROLL SOLO EN ESTOS RANGOS DE TIEMPO (marcadores del editor):\n';
                        for (var i = 0; i < data.markers.length; i++) {
                            var m = data.markers[i];
                            var mStart = parseFloat(m.startSeconds);
                            var mEnd = parseFloat(m.endSeconds);
                            // Point markers (zero duration): use ±5 seconds range
                            if (Math.abs(mEnd - mStart) < 0.1) {
                                mStart = Math.max(0, mStart - 5);
                                mEnd = mEnd + 5;
                            }
                            markerText += '  Marcador ' + (i + 1) + ': [' + mStart.toFixed(1) + 's - ' + mEnd.toFixed(1) + 's] ' + (m.name || '') + '\n';
                        }
                        markerText += '\nSOLO propón B-Roll dentro de estos rangos. NO propongas B-Roll fuera de los marcadores.\n';
                        transcript += markerText;

                        if (window.EPLogger) EPLogger.log("broll", "markers-filter", data.markers.length + " markers loaded");
                        showToast(data.markers.length + " marcadores detectados", "info");
                    } else {
                        showToast("No hay marcadores en la secuencia", "warning");
                    }
                } catch(e) {
                    console.warn("[BRoll] Marker parsing error:", e.message);
                }
                _proceedWithRhythmAnalysis(transcript);
            });
        } else {
            _proceedWithRhythmAnalysis(transcript);
        }
    }

    // ── Rhythm analysis integration ────────────────────────────────────────────

    function _proceedWithRhythmAnalysis(transcript) {
        // Enhance transcript with rhythm analysis if transcriptJson is available and server is running
        if (state.transcriptJson && broll) {
            broll.checkServer(function(serverOk) {
                if (!serverOk) {
                    _doAnalysis(transcript);
                    return;
                }
                try {
                    var _rhythmDone = false;
                    var _rhythmTimeout = setTimeout(function() {
                        if (_rhythmDone) return;
                        _rhythmDone = true;
                        console.warn("[BRoll] Rhythm analysis timed out after 10s, proceeding without it");
                        if (window.EPLogger) EPLogger.log("broll", "rhythm-timeout", "10s exceeded");
                        _doAnalysis(transcript);
                    }, 10000);

                    broll._post("/api/rhythm", { transcriptJson: state.transcriptJson }, function(err, rhythmResult) {
                        if (_rhythmDone) return;
                        _rhythmDone = true;
                        clearTimeout(_rhythmTimeout);
                        if (!err && rhythmResult && rhythmResult.promptText) {
                            transcript += rhythmResult.promptText;
                            if (window.EPLogger) EPLogger.log("broll", "rhythm-analysis",
                                (rhythmResult.summary.pauseCount || 0) + " pauses, " +
                                (rhythmResult.summary.topicChangeCount || 0) + " topic changes, " +
                                (rhythmResult.summary.emphasisCount || 0) + " emphasis points");
                        }
                        _doAnalysis(transcript);
                    });
                } catch(e) {
                    console.warn("[BRoll] Rhythm analysis failed:", e.message);
                    _doAnalysis(transcript);
                }
            });
        } else {
            _doAnalysis(transcript);
        }
    }

    // Extract transcript text that falls within a given time range
    function _enrichProposalsWithTranscript(proposals) {
        var segments = state.segments;
        if (!segments || segments.length === 0) return;

        for (var i = 0; i < proposals.length; i++) {
            var p = proposals[i];
            var pStart = _parseTimecode(p.startTime);
            var pEnd = _parseTimecode(p.endTime);
            if (pStart < 0 || pEnd < 0) continue;

            var texts = [];
            for (var s = 0; s < segments.length; s++) {
                var seg = segments[s];
                if (!seg || !seg.text) continue;
                var segStart = _parseTimecode(seg.startTime);
                var segEnd = _parseTimecode(seg.endTime);
                // Check overlap: segment overlaps with proposal time range
                if (segEnd > pStart && segStart < pEnd) {
                    texts.push(seg.text.trim());
                }
            }
            p.transcriptText = texts.join(" ") || "";
        }
    }

    function _parseTimecode(tc) {
        if (!tc) return -1;
        var parts = String(tc).replace(",", ".").split(":");
        if (parts.length === 3) return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
        if (parts.length === 2) return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
        return parseFloat(parts[0]) || -1;
    }

    function _doAnalysis(transcript) {
        // Reset previous results — new analysis = fresh start
        if (broll) {
            broll.proposals = [];
            broll.clips = [];
            broll.scenes = [];
            broll.saveState(_sessionKey);
        }
        var step2 = _el("br-proposals-section");
        if (step2) step2.style.display = "none";
        var step3 = _el("br-clips-section");
        if (step3) step3.style.display = "none";
        var list = _el("br-proposal-list");
        if (list) list.innerHTML = "";
        var clipsList = _el("br-clips-list");
        if (clipsList) clipsList.innerHTML = "";

        var btn = _el("btn-br-analyze");
        if (btn) { btn.disabled = true; btn.textContent = "Analizando…"; }
        _el("br-step-hint-1") && (_el("br-step-hint-1").textContent = "Procesando…");

        var aiSettings = {
            provider: state.settings.aiProvider,
            model: state.settings.aiModel,
            apiKey: aiAnalyzer ? aiAnalyzer.getActiveKey() : ""
        };

        broll.analyze(transcript, aiSettings, function(err, proposals) {
            if (btn) { btn.disabled = false; btn.textContent = "🎯 Analizar B-Roll"; }
            if (err) {
                if (window.EPLogger) EPLogger.error("broll", "analyze-error", err.message);
                showToast("Error al analizar: " + err.message, "error");
                return;
            }
            if (!proposals || proposals.length === 0) {
                showToast("No se encontraron momentos de B-roll", "warning");
                return;
            }
            // Enrich proposals with transcript text from the matching time range
            _enrichProposalsWithTranscript(proposals);
            broll.saveState(_sessionKey);
            _renderProposals(proposals);
            // Reveal and expand step 2, collapse others
            _collapseAllSteps();
            var step2 = _el("br-proposals-section");
            if (step2) step2.style.display = "";
            var step2Body = _el("br-step-body-2");
            if (step2Body) step2Body.classList.remove("hidden");
            var step2Arrow = step2 ? step2.querySelector(".rec-step-arrow") : null;
            if (step2Arrow) step2Arrow.textContent = "▾";

            var scenesCount = broll.scenes.length;
            var shotsCount = proposals.length;
            var hintText = scenesCount > 0
                ? scenesCount + " escenas, " + shotsCount + " planos"
                : shotsCount + " momentos";
            _el("br-step-hint-1") && (_el("br-step-hint-1").textContent = hintText);
            showToast(hintText + " de B-roll encontrados", "success");
        });
    }

    // ── Shot type badge helper ─────────────────────────────────────────────────

    function _shotTypeBadge(shotType) {
        if (!shotType) return "";
        var st = String(shotType).toUpperCase();
        return '<span class="br-shot-type-badge br-shot-' + esc(st.toLowerCase()) + '">' + esc(st) + '</span>';
    }

    // ── Render proposals (scene-grouped or flat) ───────────────────────────────

    function _renderProposals(proposals) {
        var list = _el("br-proposal-list");
        if (!list) return;
        list.innerHTML = "";

        var count = _el("br-proposal-count");
        if (count) count.textContent = proposals.length;

        // Check if scene-based
        var hasScenes = broll && broll.hasScenes();

        if (hasScenes) {
            var sceneGroups = broll.getProposalsByScene();
            for (var gi = 0; gi < sceneGroups.length; gi++) {
                var group = sceneGroups[gi];
                // Scene header
                var sceneHeader = document.createElement("div");
                sceneHeader.className = "br-scene-header";

                var totalDuration = 0;
                for (var di = 0; di < group.proposals.length; di++) {
                    var pStart = _parseTimecode(group.proposals[di].startTime);
                    var pEnd = _parseTimecode(group.proposals[di].endTime);
                    if (pStart >= 0 && pEnd >= 0) totalDuration += (pEnd - pStart);
                }

                var styleEmoji = { photorealistic: '📸', comic_sketch: '✏️', blueprint: '📐', courtroom_sketch: '🎨' };
                var styleLabel = group.proposals[0] && group.proposals[0].visualStyle ? group.proposals[0].visualStyle : '';
                var styleBadge = styleLabel ? ' · ' + (styleEmoji[styleLabel] || '🎨') + ' ' + styleLabel.replace(/_/g, ' ') : '';

                sceneHeader.innerHTML =
                    '<div class="br-scene-title">🎬 ' + esc(group.title) + '</div>' +
                    '<div class="br-scene-meta">' +
                        '<span class="br-scene-narrative">' + esc(group.narrative) + '</span>' +
                        ' · ' + group.proposals.length + ' planos · ' + Math.round(totalDuration) + 's' + styleBadge +
                    '</div>' +
                    (group.visualWorld ? '<div class="br-scene-world">🌍 ' + esc(group.visualWorld.substring(0, 120)) + (group.visualWorld.length > 120 ? '…' : '') + '</div>' : '');

                list.appendChild(sceneHeader);

                // Shots within this scene
                for (var si = 0; si < group.proposals.length; si++) {
                    list.appendChild(_buildProposalCard(group.proposals[si], si));
                }
            }
        } else {
            // Legacy flat rendering
            for (var i = 0; i < proposals.length; i++) {
                list.appendChild(_buildProposalCard(proposals[i], i));
            }
        }

        _updateSelectedCount();

        // Show summary bar
        var summary = _el("br-proposals-summary");
        if (summary) summary.classList.remove("hidden");
    }

    function _buildProposalCard(proposal, idx) {
        var card = document.createElement("div");
        card.className = "br-proposal-card";
        card.dataset.id = proposal.id;

        var checkId = "br-prop-check-" + proposal.id;

        var shotBadge = proposal.shotType ? _shotTypeBadge(proposal.shotType) : "";
        var orderLabel = proposal.shotOrder ? '<span class="br-shot-order">Plano ' + proposal.shotOrder + '</span>' : '';
        var heroBadge = proposal.isHero ? '<span class="br-hero-badge">⭐ Hero</span>' : '';

        // Build clip name for display
        var proposalSeqPrefix = (broll._currentSequenceName || "BRoll").replace(/[^a-zA-Z0-9_-]/g, "_");
        var proposalClipName = proposalSeqPrefix + "_BRoll_" + String(idx + 1).toString().padStart(2, "0");

        card.innerHTML =
            '<input type="checkbox" id="' + checkId + '" class="br-proposal-check" checked>' +
            '<div class="br-proposal-body">' +
                '<div class="br-proposal-timecode">' +
                    '<span class="br-timecode-link" data-time="' + escAttr(proposal.startTime) + '">' + esc(proposal.startTime) + '</span>' +
                    (shotBadge ? ' ' + shotBadge : '') +
                    (heroBadge ? ' ' + heroBadge : '') +
                    (orderLabel ? ' ' + orderLabel : '') +
                    '<span class="br-clip-name-label">' + esc(proposalClipName) + '</span>' +
                '</div>' +
                '<div class="br-proposal-desc">' + esc(proposal.description) + '</div>' +
                '<div class="br-proposal-rationale">' + esc(proposal.rationale) + '</div>' +
                (proposal.transcriptText
                    ? '<div class="br-proposal-transcript">🎙 <em>' + esc(proposal.transcriptText.substring(0, 150)) + (proposal.transcriptText.length > 150 ? '…' : '') + '</em></div>'
                    : '') +
                '<button class="btn btn-sm btn-ghost br-copy-prompt" data-prompt="' + escAttr(proposal.description) + '" title="Copiar prompt de imagen">📋 Copy Prompt</button>' +
            '</div>';

        card.addEventListener("click", function(e) {
            if (e.target.type === "checkbox") return;
            // Copy prompt button
            if (e.target.classList.contains("br-copy-prompt")) {
                e.stopPropagation();
                var prompt = e.target.dataset.prompt || "";
                if (prompt && navigator.clipboard) {
                    navigator.clipboard.writeText(prompt).then(function() {
                        showToast("Prompt copiado al clipboard", "success");
                    });
                } else if (prompt) {
                    // Fallback for CEP WebKit
                    var ta = document.createElement("textarea");
                    ta.value = prompt; ta.style.position = "fixed"; ta.style.left = "-9999px";
                    document.body.appendChild(ta); ta.select();
                    document.execCommand("copy"); document.body.removeChild(ta);
                    showToast("Prompt copiado al clipboard", "success");
                }
                return;
            }
            // If clicking the timecode link, navigate to that time
            if (e.target.classList.contains("br-timecode-link")) {
                e.stopPropagation();
                _navigateToTime(e.target.dataset.time);
                return;
            }
            var cb = document.getElementById(checkId);
            if (cb) cb.checked = !cb.checked;
            card.classList.toggle("selected", cb ? cb.checked : false);
            _updateSelectedCount();
        });

        // Need to set up checkbox listener after appending to DOM
        setTimeout(function() {
            var cb = document.getElementById(checkId);
            if (cb) {
                cb.addEventListener("change", function() {
                    card.classList.toggle("selected", cb.checked);
                    _updateSelectedCount();
                });
                card.classList.add("selected");
            }
        }, 0);

        return card;
    }

    function _updateSelectedCount() {
        var checked = document.querySelectorAll(".br-proposal-check:checked");
        var el = _el("br-selected-count");
        if (el) el.textContent = checked.length;
        var btn = _el("btn-br-generate");
        if (btn) {
            var hasSelection = checked.length > 0;
            btn.disabled = !hasSelection;
            if (hasSelection) btn.classList.remove("btn-disabled");
            else btn.classList.add("btn-disabled");
        }
    }

    function toggleSelectAll() {
        var all = document.querySelectorAll(".br-proposal-check");
        var anyUnchecked = false;
        all.forEach(function(cb) { if (!cb.checked) anyUnchecked = true; });
        all.forEach(function(cb) {
            cb.checked = anyUnchecked;
            var card = cb.closest(".br-proposal-card");
            if (card) card.classList.toggle("selected", anyUnchecked);
        });
        _updateSelectedCount();
    }

    // ── Step 3: Clip selection helpers ────────────────────────────────────────

    function _getSelectedClipIds() {
        var ids = [];
        document.querySelectorAll(".br-clip-check:checked").forEach(function(cb) {
            var card = cb.closest(".br-clip-card");
            if (card) ids.push(card.id.replace("br-clip-card-", ""));
        });
        return ids;
    }

    function _updateClipSelectedCount() {
        if (!broll) return;
        var total = broll.clips.filter(function(c) { return c.status === "image"; }).length;
        var selected = _getSelectedClipIds().length;
        var el = _el("br-clips-selected-count");
        if (el) el.textContent = selected + "/" + total + " seleccionados";
        var btn = _el("btn-br-animate-selected");
        if (btn) {
            btn.disabled = selected === 0;
            if (selected === 0) btn.classList.add("btn-disabled");
            else btn.classList.remove("btn-disabled");
        }
    }

    function toggleSelectAllClips() {
        var all = document.querySelectorAll(".br-clip-check");
        var anyUnchecked = false;
        all.forEach(function(cb) { if (!cb.checked) anyUnchecked = true; });
        all.forEach(function(cb) {
            cb.checked = anyUnchecked;
            var card = cb.closest(".br-clip-card");
            if (card) card.classList.toggle("selected", anyUnchecked);
        });
        _updateClipSelectedCount();
    }

    // ── Accordion helper ─────────────────────────────────────────────────────

    function _collapseAllSteps() {
        ["1","2","3","4"].forEach(function(n) {
            var body = _el("br-step-body-" + n);
            if (body) body.classList.add("hidden");
            var section = document.querySelector("[data-br-step='" + n + "'].rec-step-header");
            if (section) {
                var arrow = section.querySelector(".rec-step-arrow");
                if (arrow) arrow.textContent = "▸";
            }
        });
    }

    // ── Output dir: "BRoll Generation" next to .prproj ───────────────────────

    function _resolveBrollOutputDir(callback) {
        if (!csInterface) return callback();
        csInterface.evalScript("getActiveSequenceInfo()", function(res) {
            try {
                var info = JSON.parse(res);
                if (info.projectPath) {
                    var projDir = require("path").dirname(info.projectPath);
                    var seqName = _sessionKey || info.sequenceName || "default";
                    // Sanitize sequence name for filesystem
                    var safeSeqName = seqName.replace(/[<>:"/\\|?*]/g, "_").substring(0, 80);
                    var brollDir = require("path").join(projDir, "BRoll Generation", safeSeqName);
                    if (!require("fs").existsSync(brollDir)) {
                        require("fs").mkdirSync(brollDir, { recursive: true });
                    }
                    broll.setOutputDir(brollDir);
                    broll._currentSequenceName = safeSeqName;
                    if (window.EPLogger) EPLogger.log("broll", "output-dir", brollDir);
                }
            } catch(e) {}
            callback();
        });
    }

    // ── Step 2: Generate images ────────────────────────────────────────────────

    function startGeneration() {
        var selected = [];
        document.querySelectorAll(".br-proposal-check:checked").forEach(function(cb) {
            var card = cb.closest(".br-proposal-card");
            if (card) selected.push(card.dataset.id);
        });
        if (selected.length === 0) { showToast("Selecciona al menos una propuesta", "error"); return; }
        if (!broll) return;

        if (window.EPLogger) EPLogger.log("broll", "generate-start", selected.length + " proposals, provider=" + (broll.getSettings().imageProvider || "?"));

        // Resolve output dir: "BRoll Generation" folder next to .prproj
        _resolveBrollOutputDir(function() {
        broll.checkServer(function(ok) {
            if (!ok) {
                if (window.EPLogger) EPLogger.error("broll", "generate-error", "server not running");
                showToast("Inicia el servidor Motion-Pro primero", "error");
                return;
            }

            var btn = _el("btn-br-generate");
            if (btn) { btn.disabled = true; btn.style.display = "none"; }
            var stopBtn = _el("btn-br-stop");
            if (stopBtn) stopBtn.style.display = "";
            broll.generating = true;
            broll.generateCancelRequested = false;

            // Collapse Step 1 only — keep Step 2 open to show inline progress
            var step1Body = _el("br-step-body-1");
            if (step1Body) step1Body.classList.add("hidden");
            var step1Hdr = document.querySelector("[data-br-step='1'].rec-step-header");
            if (step1Hdr) { var a1 = step1Hdr.querySelector(".rec-step-arrow"); if (a1) a1.textContent = "▸"; }

            // Show Step 3 (hidden initially — clips count will update in real-time)
            var step3 = _el("br-clips-section");
            if (step3) step3.style.display = "";

            // Initialize inline progress tracker
            _genProgress.current = 0;
            _genProgress.total = selected.length;
            _genProgress.startMs = Date.now();
            _setInlineProgress(0, selected.length, "", 0);

            // Use scene-aware generation if we have scenes
            if (broll.hasScenes()) {
                _generateByScenes(selected, function() {
                    _onGenerationComplete(btn, stopBtn);
                });
            } else {
                _generateNext(selected, 0, function() {
                    _onGenerationComplete(btn, stopBtn);
                });
            }
        });
        }); // _resolveBrollOutputDir
    }

    function _onGenerationComplete(btn, stopBtn) {
        broll.generating = false;
        if (btn) { btn.disabled = false; btn.style.display = ""; }
        if (stopBtn) stopBtn.style.display = "none";
        broll.saveState(_sessionKey);

        _hideInlineProgress();
        _clearHeaderProgress();

        if (broll.clips.length > 0) {
            var clipCount = broll.clips.length;
            showToast(clipCount + " imágenes generadas. Revisa y anima los clips.", "success");
            var hint2 = _el("br-step-hint-2");
            if (hint2) hint2.textContent = "✅ " + clipCount + " clips generados";

            // Collapse Step 2, expand Step 3
            var step2Body = _el("br-step-body-2");
            if (step2Body) step2Body.classList.add("hidden");
            var step2Hdr = document.querySelector("[data-br-step='2'].rec-step-header");
            if (step2Hdr) { var a2 = step2Hdr.querySelector(".rec-step-arrow"); if (a2) a2.textContent = "▸"; }

            var step3 = _el("br-clips-section");
            if (step3) step3.style.display = "";
            var step3Body = _el("br-step-body-3");
            if (step3Body) step3Body.classList.remove("hidden");
            var step3Hdr = document.querySelector("[data-br-step='3'].rec-step-header");
            if (step3Hdr) { var a3 = step3Hdr.querySelector(".rec-step-arrow"); if (a3) a3.textContent = "▾"; }

            var hint3 = _el("br-step-hint-3");
            if (hint3) hint3.textContent = clipCount + " clips";
        } else {
            showToast("No se generaron imágenes — revisa la conexión con ComfyUI", "error");
            var hint2Err = _el("br-step-hint-2");
            if (hint2Err) hint2Err.textContent = "⚠ Sin clips";
            var step3Err = _el("br-clips-section");
            if (step3Err) step3Err.style.display = "none";
        }
        _renderClips();
    }

    // ── Scene-aware generation: Hero Shot = txt2img, all others = img2img from Hero ─

    function _generateByScenes(selectedIds, done) {
        // Group selected IDs by scene
        var sceneOrder = [];
        var sceneMap = {};

        for (var i = 0; i < selectedIds.length; i++) {
            var proposal = broll._findProposal(selectedIds[i]);
            if (!proposal) continue;
            var sid = proposal.sceneId || "__noscene__";
            if (!sceneMap[sid]) {
                sceneMap[sid] = [];
                sceneOrder.push(sid);
            }
            sceneMap[sid].push(selectedIds[i]);
        }

        var totalShots = selectedIds.length;
        var completedShots = 0;

        function nextScene(si) {
            if (broll.generateCancelRequested || si >= sceneOrder.length) return done();
            var sid = sceneOrder[si];
            var shotIds = sceneMap[sid];

            if (sid === "__noscene__") {
                _generateNext(shotIds, 0, function() { nextScene(si + 1); });
                return;
            }

            // Sort shots by shotOrder
            shotIds.sort(function(a, b) {
                var pa = broll._findProposal(a);
                var pb = broll._findProposal(b);
                return ((pa && pa.shotOrder) || 0) - ((pb && pb.shotOrder) || 0);
            });

            // Find Hero Shot: isHero:true, fallback to first by shotOrder
            var heroShotId = null;
            var heroProposal = null;
            for (var hi = 0; hi < shotIds.length; hi++) {
                var hp = broll._findProposal(shotIds[hi]);
                if (hp && hp.isHero) { heroShotId = shotIds[hi]; heroProposal = hp; break; }
            }
            if (!heroShotId) { heroShotId = shotIds[0]; heroProposal = broll._findProposal(heroShotId); }

            // Remaining shots (non-hero), preserving shotOrder sequence
            var remainingIds = shotIds.filter(function(id) { return id !== heroShotId; });

            var sceneInfo = broll._findScene ? broll._findScene(sid) : null;
            var sceneTitle = (sceneInfo && sceneInfo.title) ? sceneInfo.title : (sid !== "__noscene__" ? sid : "");
            _setHeaderProgress(completedShots / totalShots * 100, (completedShots + 1) + "/" + totalShots);
            _setInlineProgress(completedShots + 1, totalShots, sceneTitle, Math.round((Date.now() - _genProgress.startMs) / 1000));
            _renderClips();

            // Generate Hero Shot first with txt2img (full creative freedom)
            broll.generateImage(heroShotId,
                function(pId, status, elapsed) {
                    _refreshClipCard(pId, status, elapsed);
                    if (status === "generating" && elapsed > 0) {
                        _setInlineProgress(completedShots + 1, totalShots, sceneTitle, elapsed);
                    }
                },
                function(err) {
                    if (err) {
                        if (window.EPLogger) EPLogger.error("broll", "generate-image-error", "hero shot: " + err.message);
                        showToast("Error generando Hero Shot: " + err.message, "error");
                    } else {
                        if (window.EPLogger) EPLogger.log("broll", "generate-image-ok", "scene " + sid + " hero shot");
                        _renderClips();
                        broll.saveState(_sessionKey);
                        _updateStep3CountLive();
                    }
                    completedShots++;

                    var heroClip = broll._findClip(heroShotId);
                    var referenceImagePath = null;
                    if (heroClip && heroClip.versions.length > 0) {
                        var heroVersion = heroClip.versions[heroClip.activeVersion];
                        if (heroVersion && heroVersion.imagePath) {
                            referenceImagePath = heroVersion.imagePath;
                        }
                        _placeClip(heroClip.id, function() {
                            // 2s delay before starting remaining shots to avoid FAL 429
                            setTimeout(function() {
                                _generateSceneShots(remainingIds, 0, referenceImagePath, heroProposal, function() {
                                    completedShots += remainingIds.length;
                                    // Retry failed shots from this scene
                                    _retryFailedSceneShots(sid, shotIds, referenceImagePath, heroProposal, function() {
                                        broll.redistributeSceneClips(sid);
                                        nextScene(si + 1);
                                    });
                                });
                            }, 2000);
                        });
                    } else {
                        // Hero failed — generate remaining as txt2img
                        setTimeout(function() {
                            _generateSceneShots(remainingIds, 0, null, heroProposal, function() {
                                completedShots += remainingIds.length;
                                _retryFailedSceneShots(sid, shotIds, null, heroProposal, function() {
                                    broll.redistributeSceneClips(sid);
                                    nextScene(si + 1);
                                });
                            });
                        }, 2000);
                    }
                }
            );
        }

        nextScene(0);
    }

    // heroProposal — used to determine denoise strength by shot type similarity
    // Retry shots that failed in this scene (e.g. 429 rate limit)
    function _retryFailedSceneShots(sceneId, allShotIds, referenceImagePath, heroProposal, done) {
        if (broll.generateCancelRequested) return done();

        // Find shots that don't have a clip (failed during generation)
        var failedIds = [];
        for (var i = 0; i < allShotIds.length; i++) {
            var clip = broll._findClip(allShotIds[i]);
            if (!clip || clip.status === "error") {
                failedIds.push(allShotIds[i]);
            }
        }

        if (failedIds.length === 0) return done();

        console.log("[BRoll] Retrying " + failedIds.length + " failed shots for scene " + sceneId + " after 5s...");
        showToast("Reintentando " + failedIds.length + " shots fallidos...", "info");

        // Wait 5s before retrying to let FAL rate limit cool down
        setTimeout(function() {
            _generateSceneShots(failedIds, 0, referenceImagePath, heroProposal, done);
        }, 5000);
    }

    function _generateSceneShots(shotIds, startIdx, referenceImagePath, heroProposal, done) {
        if (broll.generateCancelRequested || startIdx >= shotIds.length) return done();

        var shotId = shotIds[startIdx];
        _renderClips();

        var genOptions = null;
        if (referenceImagePath) {
            var tgtProp = broll._findProposal(shotId);
            var heroType = heroProposal ? heroProposal.shotType : null;
            var tgtType = tgtProp ? tgtProp.shotType : null;
            // Same type as Hero → keep more structure; different type → more creative freedom
            var denoise = (heroType && tgtType && heroType === tgtType) ? 0.65 : 0.9;
            genOptions = { referenceImagePath: referenceImagePath, denoise: denoise };
        }

        broll.generateImage(shotId,
            function(pId, status, elapsed) {
                _refreshClipCard(pId, status, elapsed);
                if (status === "generating" && elapsed > 0) {
                    _setInlineProgress(_genProgress.current + 1, _genProgress.total, "", elapsed);
                }
            },
            function(err) {
                if (err) {
                    if (window.EPLogger) EPLogger.error("broll", "generate-image-error", "scene shot " + (startIdx + 1) + ": " + err.message);
                    showToast("Error generando plano " + (startIdx + 1) + ": " + err.message, "error");
                } else {
                    if (window.EPLogger) EPLogger.log("broll", "generate-image-ok", "shot " + (startIdx + 1));
                    _renderClips();
                    broll.saveState(_sessionKey);
                    _updateStep3CountLive();
                }

                var clip = broll._findClip(shotId);
                if (clip) {
                    _placeClip(clip.id, function() {
                        setTimeout(function() {
                            _generateSceneShots(shotIds, startIdx + 1, referenceImagePath, heroProposal, done);
                        }, 2000);
                    });
                } else {
                    setTimeout(function() {
                        _generateSceneShots(shotIds, startIdx + 1, referenceImagePath, heroProposal, done);
                    }, 2000);
                }
            },
            genOptions
        );
    }

    // ── Legacy flat generation (non-scene proposals) ───────────────────────────

    function _generateNext(ids, idx, done) {
        if (broll.generateCancelRequested || idx >= ids.length) return done();
        var proposalId = ids[idx];
        _renderClips(); // show current state

        var pct = idx / ids.length * 100;
        _setHeaderProgress(pct, (idx + 1) + "/" + ids.length);
        _setInlineProgress(idx + 1, ids.length, "", Math.round((Date.now() - _genProgress.startMs) / 1000));

        broll.generateImage(proposalId,
            function(pId, status, elapsed) {
                _refreshClipCard(pId, status, elapsed);
                if (status === "generating" && elapsed > 0) {
                    _setInlineProgress(idx + 1, ids.length, "", elapsed);
                }
            },
            function(err) {
                _genProgress.current = idx + 1;
                if (err) {
                    if (window.EPLogger) EPLogger.error("broll", "generate-image-error", "clip " + (idx + 1) + ": " + err.message);
                    showToast("Error generando " + (idx + 1) + ": " + err.message, "error");
                    setTimeout(function() { _generateNext(ids, idx + 1, done); }, 2000);
                } else {
                    if (window.EPLogger) EPLogger.log("broll", "generate-image-ok", "clip " + (idx + 1) + "/" + ids.length);
                    _renderClips();
                    broll.saveState(_sessionKey);
                    _updateStep3CountLive();
                    // Auto-place in timeline immediately after generation
                    var clip = broll._findClip(proposalId);
                    if (clip) {
                        _placeClip(clip.id, function() {
                            setTimeout(function() { _generateNext(ids, idx + 1, done); }, 2000);
                        });
                    } else {
                        setTimeout(function() { _generateNext(ids, idx + 1, done); }, 2000);
                    }
                }
            }
        );
    }

    function cancelGeneration() {
        if (broll) broll.generateCancelRequested = true;
    }

    // ── Step 3: Clips control panel ────────────────────────────────────────────

    function _renderClips() {
        var list = _el("br-clips-list");
        if (!list || !broll) return;
        list.innerHTML = "";

        var clips = broll.clips;
        if (clips.length === 0) {
            list.innerHTML = '<div class="empty-state-mini"><p class="empty-text">Sin clips generados aún</p></div>';
            return;
        }

        var hasScenes = broll.hasScenes();

        if (hasScenes) {
            // Group clips by scene
            var sceneGroups = broll.getClipsByScene();
            var clipNum = 0;
            for (var gi = 0; gi < sceneGroups.length; gi++) {
                var group = sceneGroups[gi];

                // Scene header for clips
                if (group.sceneId) {
                    var sceneInfo = broll._findScene(group.sceneId);
                    var sceneHdr = document.createElement("div");
                    sceneHdr.className = "br-scene-header br-scene-header-clips";
                    sceneHdr.innerHTML =
                        '<div class="br-scene-title">🎬 ' + esc(group.title || (sceneInfo && sceneInfo.title) || group.sceneId) + '</div>' +
                        '<div class="br-scene-meta">' + group.clips.length + ' planos</div>';
                    list.appendChild(sceneHdr);
                }

                for (var ci = 0; ci < group.clips.length; ci++) {
                    clipNum++;
                    list.appendChild(_buildClipCard(group.clips[ci], clipNum));
                }
            }
        } else {
            for (var i = 0; i < clips.length; i++) {
                list.appendChild(_buildClipCard(clips[i], i + 1));
            }
        }

        // Add click delegation for timecode links in clips
        list.addEventListener("click", function(e) {
            var link = e.target.closest ? e.target.closest(".br-timecode-link") : null;
            if (!link) {
                // Manual fallback for older CEP WebKit
                var t = e.target;
                while (t && t !== list) {
                    if (t.classList && t.classList.contains("br-timecode-link")) { link = t; break; }
                    t = t.parentElement;
                }
            }
            if (link && link.dataset.time) {
                e.stopPropagation();
                _navigateToTime(link.dataset.time);
            }
        });

        var countEl = _el("br-clips-count");
        if (countEl) countEl.textContent = clips.length;

        // Show "animate selection" row only if there are image-stage clips
        var hasImages = clips.some(function(c) { return c.status === "image"; });
        var batchRow = _el("br-batch-animate-row");
        if (batchRow) batchRow.style.display = hasImages ? "" : "none";

        // Defer count update so checkboxes are in DOM
        setTimeout(_updateClipSelectedCount, 0);
    }

    function _buildClipCard(clip, num) {
        var div = document.createElement("div");
        div.className = "br-clip-card" + (clip.status === "placed" ? " placed" : clip.status === "error" ? " error" : "");
        div.id = "br-clip-card-" + clip.id;

        var version = clip.versions[clip.activeVersion] || null;
        var hasImage = version && version.imagePath;
        var hasVideo = version && version.videoPath;

        // Checkbox: checked by default for image and video clips
        var checkId = "br-clip-check-" + clip.id;
        var isCheckable = clip.status === "image" || clip.status === "video";

        // Version options
        var versionOpts = "";
        for (var i = 0; i < clip.versions.length; i++) {
            var v = clip.versions[i];
            var sel = i === clip.activeVersion ? " selected" : "";
            versionOpts += '<option value="' + i + '"' + sel + '>v' + v.version + ' — ' + v.status + '</option>';
        }

        // Thumbnail
        var thumbHtml = "";
        if (hasImage && version.imageBase64) {
            thumbHtml = '<div class="br-clip-thumb-wrap">' +
                '<img class="br-clip-thumb" src="' + escAttr(version.imageBase64) + '" alt="preview" onclick="EditorProUI.broll._expandImage(this.src)" style="cursor:zoom-in">' +
                '<div class="br-clip-thumb-overlay">' +
                    (hasVideo ? "🎬 Video listo" : "📸 Imagen") +
                    ' · ' + esc(clip.startTime) +
                '</div>' +
            '</div>';
        } else if (clip.status === "generating" || clip.status === "animating") {
            thumbHtml = '<div class="br-clip-thumb-wrap">' +
                '<div class="br-clip-thumb-placeholder">⏳</div>' +
                '<div class="br-clip-thumb-overlay">' + (clip.status === "animating" ? "Animando…" : "Generando…") + '</div>' +
            '</div>';
        } else {
            thumbHtml = '<div class="br-clip-thumb-wrap"><div class="br-clip-thumb-placeholder">🖼</div></div>';
        }

        // Shot type badge + hero badge
        var shotBadge = clip.shotType ? _shotTypeBadge(clip.shotType) : "";
        var heroBadge = clip.isHero ? '<span class="br-hero-badge">⭐ Hero</span>' : '';

        // Actions
        var btnPlace = hasImage
            ? '<button class="btn btn-sm btn-success" onclick="EditorProUI.broll._placeClip(\'' + clip.id + '\')">📌 Colocar</button>'
            : '<button class="btn btn-sm btn-success" disabled>📌 Colocar</button>';
        var btnAnimate = hasImage && !hasVideo
            ? '<button class="btn btn-sm btn-ghost" onclick="EditorProUI.broll._animateClip(\'' + clip.id + '\')">🎬 Animar</button>'
            : (hasVideo ? '<button class="btn btn-sm btn-ghost" onclick="EditorProUI.broll._animateClip(\'' + clip.id + '\')">🔄 Re-animar</button>' : '');
        var btnRegen = hasImage
            ? '<button class="btn btn-sm btn-ghost" onclick="EditorProUI.broll._regenClip(\'' + clip.id + '\')">🔄 Regenerar</button>'
            : '';

        // Build display clip name
        var clipSeqPrefix = (broll._currentSequenceName || "BRoll").replace(/[^a-zA-Z0-9_-]/g, "_");
        var clipDisplayName = clipSeqPrefix + "_BRoll_" + num;

        div.innerHTML =
            '<input type="checkbox" id="' + checkId + '" class="br-clip-check"' + (isCheckable ? ' checked' : '') + '>' +
            '<div class="br-clip-header">' +
                '<span class="br-clip-num">' + num + '</span>' +
                '<span class="br-clip-timecode br-timecode-link" data-time="' + escAttr(clip.startTime) + '">' + esc(clip.startTime) + '</span>' +
                (shotBadge ? shotBadge : '') +
                (heroBadge ? heroBadge : '') +
                '<span class="br-clip-name-label">' + esc(clipDisplayName) + '</span>' +
                '<span class="br-status-badge" data-status="' + escAttr(clip.status) + '">' + _statusLabel(clip.status) + '</span>' +
            '</div>' +
            thumbHtml +
            '<div class="br-clip-body">' +
                (clip.versions.length > 1
                    ? '<div class="br-version-row"><span class="br-version-label">Versión:</span>' +
                        '<select class="br-version-select" onchange="EditorProUI.broll._switchVersion(\'' + clip.id + '\', this.value)">' + versionOpts + '</select></div>'
                    : '') +
                '<div class="br-clip-desc">' + esc(clip.description) + '</div>' +
                (clip.transcriptText
                    ? '<div class="br-clip-transcript">🎙 <em>' + esc(clip.transcriptText.substring(0, 200)) + (clip.transcriptText.length > 200 ? '…' : '') + '</em></div>'
                    : '') +
                '<textarea class="br-feedback-input" id="br-feedback-' + clip.id + '" placeholder="Feedback para regenerar: ej. \'más colorido\', \'sin personas\'..." rows="2"></textarea>' +
                '<div class="br-clip-actions">' + btnPlace + btnAnimate + btnRegen + '</div>' +
            '</div>';

        // Sync card selected class and count on checkbox change
        setTimeout(function() {
            var cb = document.getElementById(checkId);
            if (cb) {
                if (isCheckable) div.classList.add("selected");
                cb.addEventListener("change", function() {
                    div.classList.toggle("selected", cb.checked);
                    _updateClipSelectedCount();
                });
            }
        }, 0);

        // Card click toggles checkbox (not for button/checkbox clicks)
        div.addEventListener("click", function(e) {
            if (e.target.type === "checkbox") return;
            if (e.target.closest && e.target.closest("button")) return;
            if (e.target.tagName === "BUTTON") return;
            if (e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
            if (e.target.classList.contains("br-timecode-link")) return;
            var cb = document.getElementById(checkId);
            if (cb) {
                cb.checked = !cb.checked;
                div.classList.toggle("selected", cb.checked);
                _updateClipSelectedCount();
            }
        });

        return div;
    }

    function _statusLabel(status) {
        var labels = {
            pending: "Pendiente", generating: "Generando…", image: "📸 Imagen",
            animating: "Animando…", video: "🎬 Video", placed: "✓ Colocado", error: "⚠ Error"
        };
        return labels[status] || status;
    }

    function _refreshClipCard(proposalId, status, elapsedSecs) {
        var clip = broll._findClip(proposalId);
        if (!clip) return;
        var existing = _el("br-clip-card-" + clip.id);
        if (existing) {
            var badge = existing.querySelector(".br-status-badge");
            if (badge) {
                badge.dataset.status = status;
                var label = _statusLabel(status);
                if (elapsedSecs > 0 && status === "generating") label = "⏳ Generando... (" + elapsedSecs + "s)";
                else if (elapsedSecs > 0 && status === "animating") label = "🎬 Animando... (" + elapsedSecs + "s)";
                badge.textContent = label;
            }
        }
    }

    function _switchVersion(clipId, versionIdx) {
        if (!broll) return;
        var clip = broll._findClipById(clipId);
        if (!clip) return;
        clip.activeVersion = parseInt(versionIdx, 10);
        broll.saveState(_sessionKey);
        _renderClips();
    }

    function _navigateToTime(timeStr) {
        if (!csInterface || !timeStr) return;
        var secs = broll._timeToSeconds(timeStr);
        csInterface.evalScript('movePlayhead(' + secs + ')', function() {});
    }

    function _placeClip(clipId, callback) {
        if (!broll) {
            console.error("[BRoll] _placeClip: broll not initialized");
            showToast("Error: módulo B-Roll no inicializado", "error");
            if (callback) callback();
            return;
        }
        if (!csInterface) {
            console.error("[BRoll] _placeClip: csInterface not available");
            showToast("Error: CSInterface no disponible", "error");
            if (callback) callback();
            return;
        }
        var clip = broll._findClipById(clipId);
        if (!clip) {
            console.error("[BRoll] _placeClip: clip not found:", clipId);
            showToast("Error: clip no encontrado", "error");
            if (callback) callback();
            return;
        }
        var version = clip.versions[clip.activeVersion];
        console.log("[BRoll] _placeClip:", clipId, "version:", clip.activeVersion,
            "imagePath:", version ? version.imagePath : "NONE",
            "videoPath:", version ? version.videoPath : "NONE",
            "status:", clip.status);
        broll.placeInTimeline(clipId, csInterface, function(err) {
            if (err) {
                if (window.EPLogger) EPLogger.error("broll", "place-error", err.message);
                console.error("[BRoll] placeInTimeline error:", err.message);
                showToast("Error al colocar: " + err.message, "error");
            } else {
                if (window.EPLogger) EPLogger.log("broll", "place-ok", clipId + " at " + clip.startTime);
                showToast("Clip colocado en timeline", "success");
                broll.saveState(_sessionKey);
                _renderClips();
            }
            if (callback) callback();
        });
    }

    function _animateClip(clipId) {
        if (!broll) return;
        broll.checkServer(function(ok) {
            if (!ok) { showToast("Inicia el servidor Motion-Pro primero", "error"); return; }
            _doAnimateClip(clipId);
        });
    }

    function _doAnimateClip(clipId) {
        var card = _el("br-clip-card-" + clipId);
        if (card) {
            var badge = card.querySelector(".br-status-badge");
            if (badge) { badge.dataset.status = "animating"; badge.textContent = _statusLabel("animating"); }
        }
        broll.animateClip(clipId,
            function(cId, status, elapsed) { _refreshClipCard(cId, status, elapsed); },
            function(err, clip) {
                if (err) { if (window.EPLogger) EPLogger.error("broll", "animate-error", err.message); showToast("Error al animar: " + err.message, "error"); }
                else { showToast("Video generado", "success"); }
                broll.saveState(_sessionKey);
                _renderClips();
            }
        );
    }

    function _regenClip(clipId) {
        if (!broll) return;
        var feedbackEl = _el("br-feedback-" + clipId);
        var feedback = feedbackEl ? feedbackEl.value.trim() : "";

        broll.checkServer(function(ok) {
            if (!ok) { showToast("Inicia el servidor Motion-Pro primero", "error"); return; }
            broll.regenerateImage(clipId, feedback,
                function(pId, status, elapsed) { _refreshClipCard(pId, status, elapsed); },
                function(err, clip) {
                    if (err) { if (window.EPLogger) EPLogger.error("broll", "regen-error", err.message); showToast("Error al regenerar: " + err.message, "error"); return; }
                    broll.saveState(_sessionKey);
                    showToast("Imagen regenerada", "success");
                    _renderClips();
                }
            );
        });
    }

    function startBatchAnimate() {
        if (!broll) return;
        var selectedIds = _getSelectedClipIds();
        if (selectedIds.length === 0) { showToast("Selecciona al menos un clip para animar", "error"); return; }
        broll.checkServer(function(ok) {
            if (!ok) { showToast("Inicia el servidor Motion-Pro primero", "error"); return; }
            var btn = _el("btn-br-animate-selected");
            if (btn) btn.disabled = true;
            broll.animateSelected(
                selectedIds,
                function(cId, status, elapsed) { _refreshClipCard(cId, status, elapsed); },
                function(idx, total, cId) {
                    _setHeaderProgress(idx / total * 100, (idx + 1) + "/" + total + " animando");
                },
                function(err, done, errors) {
                    if (btn) btn.disabled = false;
                    _clearHeaderProgress();
                    broll.saveState(_sessionKey);
                    if (errors && errors.length > 0) showToast(errors.length + " errores al animar. Ver consola.", "warning");
                    else showToast(done + " videos generados", "success");
                    _renderClips();
                }
            );
        });
    }

    // ── Settings ───────────────────────────────────────────────────────────────

    function _loadSettingsUI() {
        if (!broll) return;
        var s = broll.getSettings();
        // visualStyle removed from settings — AI proposes per scene now
        _setSelectVal("br-img-provider", s.imageProvider);
        _setInputVal("br-img-endpoint", s.imageEndpointUrl);
        _setInputVal("br-img-gemini-key", s.imageGeminiApiKey);
        _setInputVal("br-img-fal-key", s.imageFalApiKey);
        _setSelectVal("br-vid-provider", s.videoProvider);
        _setInputVal("br-vid-endpoint", s.videoEndpointUrl);
        _setInputVal("br-vid-kling-key", s.videoKlingApiKey);
        _setInputVal("br-vid-fal-key", s.videoFalApiKey);
        _setInputVal("br-vid-gemini-key", s.videoGeminiApiKey);
        _setSelectVal("br-track-select", s.trackIndex);
        _refreshSettingsVisibility();

        // Show saved model as placeholder while list loads
        if (s.imageProvider === "fal" && s.imageFalModel) {
            var imgSel = _el("br-img-fal-model");
            if (imgSel) imgSel.innerHTML = '<option value="' + s.imageFalModel + '">' + s.imageFalModel + ' (cargando lista...)</option>';
        }
        if (s.videoProvider === "fal" && s.videoFalModel) {
            var vidSel = _el("br-vid-fal-model");
            if (vidSel) vidSel.innerHTML = '<option value="' + s.videoFalModel + '">' + s.videoFalModel + ' (cargando lista...)</option>';
        }

        // Delay FAL model loading until server is likely ready (2s after init)
        if (s.imageProvider === "fal" || s.videoProvider === "fal") {
            setTimeout(function() {
                if (s.imageProvider === "fal") _loadFalModels("text-to-image", "br-img-fal-model", s.imageFalModel);
                if (s.videoProvider === "fal") _loadFalModels("image-to-video", "br-vid-fal-model", s.videoFalModel);
            }, 2500);
        }
    }

    // ── FAL.ai dynamic model loading ───────────────────────────────────────────

    var _falModelsLoaded = {};  // cache: { "text-to-image": [{id, name}], ... }

    function _loadFalModels(category, selectId, savedValue, attempt) {
        var sel = _el(selectId);
        if (!sel) return;
        attempt = attempt || 1;

        // Serve from memory cache if available
        if (_falModelsLoaded[category]) {
            _populateFalSelect(sel, _falModelsLoaded[category], savedValue);
            _setFalModelStatus(selectId, null);
            return;
        }

        sel.innerHTML = '<option value="">Cargando modelos...</option>';
        _setFalModelStatus(selectId, "⏳ Cargando" + (attempt > 1 ? " (intento " + attempt + "/3)" : "") + "...");

        if (!broll) return;
        broll._get("/api/broll/fal-models?category=" + encodeURIComponent(category), function(err, result) {
            if (err || !result || !result.models || result.models.length === 0) {
                if (attempt < 3) {
                    _setFalModelStatus(selectId, "⚠ Reintentando... (" + attempt + "/3)");
                    setTimeout(function() {
                        _loadFalModels(category, selectId, savedValue, attempt + 1);
                    }, 3000);
                } else {
                    // Keep saved value usable even if list failed
                    if (savedValue) {
                        sel.innerHTML = '<option value="' + savedValue + '">' + savedValue + '</option>';
                    } else {
                        sel.innerHTML = '<option value="">Error cargando modelos</option>';
                    }
                    _setFalModelStatus(selectId, "⚠ Error — pulsa ↺");
                }
                return;
            }
            _falModelsLoaded[category] = result.models;
            _populateFalSelect(sel, result.models, savedValue);
            _setFalModelStatus(selectId, "✅ " + result.models.length + " modelos");
        });
    }

    function _setFalModelStatus(selectId, text) {
        var el = _el(selectId + "-status");
        if (!el) return;
        el.textContent = text || "";
        el.style.display = text ? "" : "none";
    }

    function _reloadFalModels(category, selectId) {
        delete _falModelsLoaded[category];
        var savedValue = broll ? (category === "text-to-image" ? broll.getSettings().imageFalModel : broll.getSettings().videoFalModel) : "";
        _loadFalModels(category, selectId, savedValue, 1);
    }

    function _populateFalSelect(sel, models, savedValue) {
        sel.innerHTML = "";
        for (var i = 0; i < models.length; i++) {
            var opt = document.createElement("option");
            opt.value = models[i].id;
            opt.textContent = models[i].name;
            if (models[i].description) opt.title = models[i].description;
            sel.appendChild(opt);
        }
        // Restore saved value if it exists in the list
        if (savedValue) {
            sel.value = savedValue;
            // If savedValue not found in list, keep first option selected
        }
    }

    function _refreshSettingsVisibility() {
        var imgProv = _getSelectVal("br-img-provider");
        _toggleEl("br-img-endpoint-row",    imgProv === "comfyui");
        _toggleEl("br-img-gemini-key-row",  imgProv === "gemini_image");
        _toggleEl("br-img-fal-key-row",     imgProv === "fal");
        _toggleEl("br-img-fal-model-row",   imgProv === "fal");

        // Load FAL models on provider switch
        if (imgProv === "fal" && !_falModelsLoaded["text-to-image"]) {
            _loadFalModels("text-to-image", "br-img-fal-model", broll ? broll.getSettings().imageFalModel : "");
        }

        var vidProv = _getSelectVal("br-vid-provider");
        _toggleEl("br-vid-gemini-key-row",  vidProv === "gemini_video");
        _toggleEl("br-vid-fal-key-row",     vidProv === "fal");
        _toggleEl("br-vid-fal-model-row",   vidProv === "fal");

        if (vidProv === "fal" && !_falModelsLoaded["image-to-video"]) {
            _loadFalModels("image-to-video", "br-vid-fal-model", broll ? broll.getSettings().videoFalModel : "");
        }
    }

    function saveSettings() {
        if (!broll) return;
        broll.saveSettings({

            imageProvider:     _getSelectVal("br-img-provider"),
            imageEndpointUrl:  _getInputVal("br-img-endpoint"),
            imageGeminiApiKey: _getInputVal("br-img-gemini-key"),
            imageFalModel:     _getSelectVal("br-img-fal-model"),
            imageFalApiKey:    _getInputVal("br-img-fal-key"),
            videoProvider:      _getSelectVal("br-vid-provider"),
            videoEndpointUrl:   _getInputVal("br-vid-endpoint"),
            videoKlingApiKey:   _getInputVal("br-vid-kling-key"),
            videoFalModel:      _getSelectVal("br-vid-fal-model"),
            videoFalApiKey:     _getInputVal("br-vid-fal-key"),
            videoGeminiApiKey:  _getInputVal("br-vid-gemini-key"),
            trackIndex:        _getSelectVal("br-track-select")
        });
        showToast("Configuración B-Roll guardada", "success");
        _refreshServerStatus(); // re-check dependencies with new settings
    }

    function _setSelectVal(id, val) { var el = _el(id); if (el && val !== undefined) el.value = val; }
    function _setInputVal(id, val) { var el = _el(id); if (el && val !== undefined) el.value = val; }
    function _getSelectVal(id) { var el = _el(id); return el ? el.value : ""; }
    function _getInputVal(id) { var el = _el(id); return el ? el.value : ""; }
    function _toggleEl(id, show) { var el = _el(id); if (el) el.style.display = show ? "" : "none"; }

    // ── Header progress ────────────────────────────────────────────────────────

    function _setHeaderProgress(pct, text) {
        var wrap = _el("br-progress-header");
        var fill = _el("br-progress-header-fill");
        var label = _el("br-progress-header-text");
        if (wrap) wrap.classList.remove("hidden");
        if (fill) fill.style.width = Math.round(pct) + "%";
        if (label) label.textContent = text || "";
        if (refreshAllHeaderProgress) refreshAllHeaderProgress();
    }

    function _clearHeaderProgress() {
        var wrap = _el("br-progress-header");
        if (wrap) wrap.classList.add("hidden");
        if (refreshAllHeaderProgress) refreshAllHeaderProgress();
    }

    function _setInlineProgress(current, total, sceneName, elapsedSecs) {
        var wrap = _el("br-gen-progress");
        var fill = _el("br-gen-progress-fill");
        var text = _el("br-gen-progress-text");
        if (!wrap) return;
        wrap.style.display = "";
        var pct = total > 0 ? Math.round(current / total * 100) : 0;
        if (fill) fill.style.width = pct + "%";
        var line = "Generando plano " + current + "/" + total;
        if (sceneName) line += " — Escena: " + sceneName;
        if (elapsedSecs > 0) line += " — ⏳ " + elapsedSecs + "s";
        if (text) text.textContent = line;
        var hint = _el("br-step-hint-2");
        if (hint) hint.textContent = "⏳ Generando " + current + "/" + total + "…";
    }

    function _hideInlineProgress() {
        var wrap = _el("br-gen-progress");
        if (wrap) wrap.style.display = "none";
    }

    function _updateStep3CountLive() {
        var count = broll ? broll.clips.length : 0;
        var countEl = _el("br-clips-count");
        if (countEl) countEl.textContent = count;
        var hint3 = _el("br-step-hint-3");
        if (hint3 && count > 0) hint3.textContent = count + " clips";
    }

    function refreshHeaderProgressVisibility() {
        var wrap = _el("br-progress-header");
        if (!wrap) return;
        var generating = broll && broll.generating;
        if (!generating) wrap.classList.add("hidden");
    }

    // ── Session switch (called by sequence-controller) ─────────────────────────

    function switchToSequence(seqName) {
        if (!broll) return;
        _sessionKey = seqName || "";
        var loaded = broll.loadState(_sessionKey);
        _renderNoTranscript();
        _refreshServerStatus();
        _renderProposals(broll.proposals);
        _renderClips();
        var step2 = _el("br-proposals-section");
        if (step2) step2.style.display = broll.proposals.length > 0 ? "" : "none";
        var step3 = _el("br-clips-section");
        if (step3) step3.style.display = broll.clips.length > 0 ? "" : "none";
    }

    function updateAnalyzeButton() {
        _renderNoTranscript();
        _refreshServerStatus();
    }

    // ── Init ───────────────────────────────────────────────────────────────────

    function init() {
        _initRefs();
        _loadSettingsUI();
        _renderNoTranscript();
        _refreshServerStatus();

        on("btn-br-analyze",            "click", startAnalysis);
        on("btn-br-select-all",         "click", toggleSelectAll);
        on("btn-br-generate",           "click", startGeneration);
        on("btn-br-stop",               "click", cancelGeneration);
        on("btn-br-animate-selected",   "click", startBatchAnimate);
        on("btn-br-select-all-clips",   "click", toggleSelectAllClips);
        on("btn-br-save-settings",      "click", saveSettings);

        var imgProv = _el("br-img-provider");
        if (imgProv) imgProv.addEventListener("change", _refreshSettingsVisibility);
        var vidProv = _el("br-vid-provider");
        if (vidProv) vidProv.addEventListener("change", _refreshSettingsVisibility);

        // Step headers: accordion — only one open at a time
        var stepHeaders = document.querySelectorAll("[data-br-step]");
        stepHeaders.forEach(function(hdr) {
            if (!hdr.classList.contains("rec-step-header")) return;
            hdr.addEventListener("click", function() {
                var stepNum = hdr.getAttribute("data-br-step");
                var body = _el("br-step-body-" + stepNum);
                if (!body) return;
                var wasHidden = body.classList.contains("hidden");

                // Collapse all steps first
                stepHeaders.forEach(function(otherHdr) {
                    if (!otherHdr.classList.contains("rec-step-header")) return;
                    var otherNum = otherHdr.getAttribute("data-br-step");
                    var otherBody = _el("br-step-body-" + otherNum);
                    var otherArrow = otherHdr.querySelector(".rec-step-arrow");
                    if (otherBody) otherBody.classList.add("hidden");
                    if (otherArrow) otherArrow.textContent = "▸";
                });

                // Toggle clicked step
                if (wasHidden) {
                    body.classList.remove("hidden");
                    var arrow = hdr.querySelector(".rec-step-arrow");
                    if (arrow) arrow.textContent = "▾";
                }
            });
        });

        // Settings toggle — auto-retry empty FAL model lists when panel opens
        on("br-settings-toggle", "click", function() {
            var body = _el("br-settings-body");
            if (!body) return;
            var wasHidden = body.classList.contains("hidden");
            body.classList.toggle("hidden");
            if (wasHidden) {
                var s = broll ? broll.getSettings() : {};
                if (s.imageProvider === "fal" && !_falModelsLoaded["text-to-image"]) {
                    _loadFalModels("text-to-image", "br-img-fal-model", s.imageFalModel);
                }
                if (s.videoProvider === "fal" && !_falModelsLoaded["image-to-video"]) {
                    _loadFalModels("image-to-video", "br-vid-fal-model", s.videoFalModel);
                }
            }
        });

        on("btn-br-img-fal-reload", "click", function() { _reloadFalModels("text-to-image", "br-img-fal-model"); });
        on("btn-br-vid-fal-reload", "click", function() { _reloadFalModels("image-to-video", "br-vid-fal-model"); });

        // Subscribe to EventBus — self-contained, no need to wire in sequence-controller
        if (window.EventBus) {
            window.EventBus.on("sequence-changed", function(data) { switchToSequence(data.name); });
            window.EventBus.on("sequence-first-load", function(data) { switchToSequence(data.name); });
            window.EventBus.on("state-restored", function() { _renderNoTranscript(); _refreshServerStatus(); });
            window.EventBus.on("transcript-changed", function() { _renderNoTranscript(); });
        }
    }

    // ── Image expand overlay ───────────────────────────────────────────────────

    function _expandImage(src) {
        var overlay = document.createElement("div");
        overlay.className = "br-expand-overlay";
        var img = document.createElement("img");
        img.src = src;
        overlay.appendChild(img);
        overlay.addEventListener("click", function() {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        });
        document.body.appendChild(overlay);
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    EP.broll = {
        init: init,
        startAnalysis: startAnalysis,
        startGeneration: startGeneration,
        cancelGeneration: cancelGeneration,
        startBatchAnimate: startBatchAnimate,
        saveSettings: saveSettings,
        switchToSequence: switchToSequence,
        updateAnalyzeButton: updateAnalyzeButton,
        refreshHeaderProgressVisibility: refreshHeaderProgressVisibility,
        toggleSelectAll: toggleSelectAll,
        toggleSelectAllClips: toggleSelectAllClips,
        // Exposed for inline onclick in card HTML
        _placeClip: _placeClip,
        _animateClip: _animateClip,
        _regenClip: _regenClip,
        _switchVersion: _switchVersion,
        _expandImage: _expandImage,
    };

})(window);
