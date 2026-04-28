/**
 * ui-broll-proposals.js — B-Roll UI: Steps 1-2 (Analysis + Image Generation)
 * Proposal cards, scene headers, style dropdowns, generation flow.
 * Extends EditorProUI.broll namespace.
 */
(function(global) {
    "use strict";

    var EP = global.EditorProUI = global.EditorProUI || {};
    var brollUI = EP.broll = EP.broll || {};

    // ── Shared references (set by ui-broll.js init) ────────────────────────────
    var state, csInterface, broll, aiAnalyzer;
    var on, showToast, showElement, hideElement, disableBtn, enableBtn;
    var esc, escAttr, formatTime, checkAIReady, expandSection;
    var refreshAllHeaderProgress;

    var _sessionKey = "";
    var _genProgress = { current: 0, total: 0, startMs: 0 };

    function _el(id) { return document.getElementById(id); }

    // Called by ui-broll.js after all refs are ready
    function _initProposalRefs(refs) {
        state       = refs.state;
        csInterface = refs.csInterface;
        broll       = refs.broll;
        aiAnalyzer  = refs.aiAnalyzer;
        on          = refs.on;
        showToast   = refs.showToast;
        showElement = refs.showElement;
        hideElement = refs.hideElement;
        disableBtn  = refs.disableBtn;
        enableBtn   = refs.enableBtn;
        esc         = refs.esc;
        escAttr     = refs.escAttr;
        formatTime  = refs.formatTime;
        checkAIReady = refs.checkAIReady;
        expandSection = refs.expandSection;
        refreshAllHeaderProgress = refs.refreshAllHeaderProgress;
    }

    function _setSessionKey(key) { _sessionKey = key; }
    function _getSessionKey() { return _sessionKey; }

    // ── Transcript check ───────────────────────────────────────────────────────

    function _getTranscriptText() {
        var raw = state.transcript || "";
        if (state.segments && state.segments.length > 0) {
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

    function renderNoTranscript() {
        var transcriptSrc = _getTranscriptText();
        var warn = _el("br-no-transcript");
        if (warn) warn.style.display = transcriptSrc.trim() ? "none" : "";
        var btn = _el("btn-br-analyze");
        if (btn) {
            var hasTranscript = !!transcriptSrc.trim();
            btn.disabled = !hasTranscript;
            if (hasTranscript) btn.classList.remove("btn-disabled");
            else btn.classList.add("btn-disabled");
        }
        var hint = _el("br-step-hint-1");
        if (hint && transcriptSrc.trim()) hint.textContent = "Listo para analizar";
    }

    // ── Step 1: Analysis ───────────────────────────────────────────────────────

    function startAnalysis() {
        var transcript = _getTranscriptText();
        if (!transcript.trim()) { showToast("Carga una transcripción primero", "error"); return; }
        if (!checkAIReady()) return;
        if (!broll) return;

        if (window.EPLogger) EPLogger.log("broll", "analyze-start", "transcriptLen=" + transcript.length);

        var markersOnly = document.getElementById("br-markers-only");
        if (markersOnly && markersOnly.checked && csInterface) {
            var _markersDone = false;
            var _markersTimeout = setTimeout(function() {
                if (_markersDone) return;
                _markersDone = true;
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
                            if (Math.abs(mEnd - mStart) < 0.1) { mStart = Math.max(0, mStart - 5); mEnd = mEnd + 5; }
                            markerText += '  Marcador ' + (i + 1) + ': [' + mStart.toFixed(1) + 's - ' + mEnd.toFixed(1) + 's] ' + (m.name || '') + '\n';
                        }
                        markerText += '\nSOLO propón B-Roll dentro de estos rangos. NO propongas B-Roll fuera de los marcadores.\n';
                        transcript += markerText;
                        showToast(data.markers.length + " marcadores detectados", "info");
                    } else {
                        showToast("No hay marcadores en la secuencia", "warning");
                    }
                } catch(e) {}
                _proceedWithRhythmAnalysis(transcript);
            });
        } else {
            _proceedWithRhythmAnalysis(transcript);
        }
    }

    function _proceedWithRhythmAnalysis(transcript) {
        if (state.transcriptJson && broll) {
            broll.checkServer(function(serverOk) {
                if (!serverOk) { _doAnalysis(transcript); return; }
                try {
                    var _rhythmDone = false;
                    var _rhythmTimeout = setTimeout(function() {
                        if (_rhythmDone) return; _rhythmDone = true;
                        _doAnalysis(transcript);
                    }, 10000);

                    broll._post("/api/rhythm", { transcriptJson: state.transcriptJson }, function(err, rhythmResult) {
                        if (_rhythmDone) return; _rhythmDone = true;
                        clearTimeout(_rhythmTimeout);
                        if (!err && rhythmResult && rhythmResult.promptText) transcript += rhythmResult.promptText;
                        _doAnalysis(transcript);
                    });
                } catch(e) { _doAnalysis(transcript); }
            });
        } else {
            _doAnalysis(transcript);
        }
    }

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
                if (segEnd > pStart && segStart < pEnd) texts.push(seg.text.trim());
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
        if (broll) {
            broll.proposals = []; broll.clips = []; broll.scenes = [];
            broll.saveState(_sessionKey);
        }
        var step2 = _el("br-proposals-section"); if (step2) step2.style.display = "none";
        var step3 = _el("br-clips-section"); if (step3) step3.style.display = "none";
        var list = _el("br-proposal-list"); if (list) list.innerHTML = "";
        var clipsList = _el("br-clips-list"); if (clipsList) clipsList.innerHTML = "";

        var btn = _el("btn-br-analyze");
        if (btn) { btn.disabled = true; btn.textContent = "Analizando…"; }

        broll.analyze(transcript, {}, function(err, proposals) {
            if (btn) { btn.disabled = false; btn.textContent = "🎯 Analizar B-Roll"; }
            if (err) {
                if (window.EPLogger) EPLogger.error("broll", "analyze-error", err.message);
                showToast("Error al analizar: " + err.message, "error"); return;
            }
            if (!proposals || proposals.length === 0) { showToast("No se encontraron momentos de B-roll", "warning"); return; }
            _enrichProposalsWithTranscript(proposals);
            broll.saveState(_sessionKey);
            renderProposals(proposals);

            _collapseAllSteps();
            var s2 = _el("br-proposals-section"); if (s2) s2.style.display = "";
            var s2Body = _el("br-step-body-2"); if (s2Body) s2Body.classList.remove("hidden");
            var s2Arrow = s2 ? s2.querySelector(".rec-step-arrow") : null; if (s2Arrow) s2Arrow.textContent = "▾";

            var scenesCount = broll.scenes.length;
            var shotsCount = proposals.length;
            var hintText = scenesCount > 0 ? scenesCount + " escenas, " + shotsCount + " planos" : shotsCount + " momentos";
            var h1 = _el("br-step-hint-1"); if (h1) h1.textContent = hintText;
            showToast(hintText + " de B-roll encontrados", "success");
        });
    }

    // ── Shot type badge ────────────────────────────────────────────────────────

    function _shotTypeBadge(shotType) {
        if (!shotType) return "";
        var st = String(shotType).toUpperCase();
        return '<span class="br-shot-type-badge br-shot-' + esc(st.toLowerCase()) + '">' + esc(st) + '</span>';
    }

    // ── Render proposals ───────────────────────────────────────────────────────

    function renderProposals(proposals) {
        var list = _el("br-proposal-list");
        if (!list) return;
        list.innerHTML = "";

        var count = _el("br-proposal-count"); if (count) count.textContent = proposals.length;
        var hasScenes = broll && broll.hasScenes();

        if (hasScenes) {
            var sceneGroups = broll.getProposalsByScene();
            for (var gi = 0; gi < sceneGroups.length; gi++) {
                var group = sceneGroups[gi];
                var sceneHeader = document.createElement("div");
                sceneHeader.className = "br-scene-header";

                var totalDuration = 0;
                for (var di = 0; di < group.proposals.length; di++) {
                    var pStart = _parseTimecode(group.proposals[di].startTime);
                    var pEnd = _parseTimecode(group.proposals[di].endTime);
                    if (pStart >= 0 && pEnd >= 0) totalDuration += (pEnd - pStart);
                }

                var currentStyle = group.proposals[0] && group.proposals[0].visualStyle ? group.proposals[0].visualStyle : 'photorealistic';
                var sceneIdForStyle = group.sceneId || '';
                var styleOptions = [
                    { value: 'photorealistic', emoji: '📸', label: 'Fotorealista' },
                    { value: 'comic_sketch', emoji: '✏️', label: 'Comic Sketch' },
                    { value: 'blueprint', emoji: '📐', label: 'Blueprint' },
                    { value: 'courtroom_sketch', emoji: '🎨', label: 'Courtroom Sketch' }
                ];
                var styleSelectHtml = '<select class="br-scene-style-select" data-scene-id="' + escAttr(sceneIdForStyle) + '">';
                for (var so = 0; so < styleOptions.length; so++) {
                    var sel = styleOptions[so].value === currentStyle ? ' selected' : '';
                    styleSelectHtml += '<option value="' + styleOptions[so].value + '"' + sel + '>' + styleOptions[so].emoji + ' ' + styleOptions[so].label + '</option>';
                }
                styleSelectHtml += '</select>';

                sceneHeader.innerHTML =
                    '<div class="br-scene-title">🎬 ' + esc(group.title) + '</div>' +
                    '<div class="br-scene-meta">' +
                        '<span class="br-scene-narrative">' + esc(group.narrative) + '</span>' +
                        ' · ' + group.proposals.length + ' planos · ' + Math.round(totalDuration) + 's · ' + styleSelectHtml +
                    '</div>' +
                    (group.visualWorld ? '<div class="br-scene-world">🌍 ' + esc(group.visualWorld.substring(0, 120)) + (group.visualWorld.length > 120 ? '…' : '') + '</div>' : '');

                list.appendChild(sceneHeader);
                for (var si = 0; si < group.proposals.length; si++) {
                    list.appendChild(_buildProposalCard(group.proposals[si], si));
                }
            }
        } else {
            for (var i = 0; i < proposals.length; i++) {
                list.appendChild(_buildProposalCard(proposals[i], i));
            }
        }

        _updateSelectedCount();

        // Wire style dropdown changes
        var styleSelects = list.querySelectorAll(".br-scene-style-select");
        for (var ss = 0; ss < styleSelects.length; ss++) {
            styleSelects[ss].addEventListener("change", function(e) {
                var sceneId = e.target.dataset.sceneId;
                var newStyle = e.target.value;
                if (!broll || !sceneId) return;
                for (var pi = 0; pi < broll.proposals.length; pi++) {
                    if (broll.proposals[pi].sceneId === sceneId) broll.proposals[pi].visualStyle = newStyle;
                }
                showToast("Estilo cambiado a " + newStyle.replace(/_/g, " "), "success");
            });
        }

        var summary = _el("br-proposals-summary"); if (summary) summary.classList.remove("hidden");
    }

    function _buildProposalCard(proposal, idx) {
        var card = document.createElement("div");
        card.className = "br-proposal-card";
        card.dataset.id = proposal.id;

        var checkId = "br-prop-check-" + proposal.id;
        var shotBadge = proposal.shotType ? _shotTypeBadge(proposal.shotType) : "";
        var orderLabel = proposal.shotOrder ? '<span class="br-shot-order">Plano ' + proposal.shotOrder + '</span>' : '';
        var heroBadge = proposal.isHero ? '<span class="br-hero-badge">⭐ Hero</span>' : '';

        var proposalSeqPrefix = (broll._currentSequenceName || "BRoll").replace(/[^a-zA-Z0-9_-]/g, "_");
        var proposalClipName = proposalSeqPrefix + "_BRoll_" + String(idx + 1).toString().padStart(2, "0");

        card.innerHTML =
            '<input type="checkbox" id="' + checkId + '" class="br-proposal-check" checked>' +
            '<div class="br-proposal-body">' +
                '<div class="br-proposal-timecode">' +
                    '<span class="br-timecode-link" data-time="' + escAttr(proposal.startTime) + '">' + esc(proposal.startTime) + '</span>' +
                    (shotBadge ? ' ' + shotBadge : '') + (heroBadge ? ' ' + heroBadge : '') + (orderLabel ? ' ' + orderLabel : '') +
                    '<span class="br-clip-name-label">' + esc(proposalClipName) + '</span>' +
                '</div>' +
                '<div class="br-proposal-desc">' + esc(proposal.description) + '</div>' +
                '<div class="br-proposal-rationale">' + esc(proposal.rationale) + '</div>' +
                (proposal.transcriptText ? '<div class="br-proposal-transcript">🎙 <em>' + esc(proposal.transcriptText.substring(0, 150)) + (proposal.transcriptText.length > 150 ? '…' : '') + '</em></div>' : '') +
                '<button class="btn btn-sm btn-ghost br-copy-prompt" data-prompt="' + escAttr(proposal.description) + '" title="Copiar prompt de imagen">📋 Copy Prompt</button>' +
            '</div>';

        card.addEventListener("click", function(e) {
            if (e.target.type === "checkbox") return;
            if (e.target.classList.contains("br-copy-prompt")) {
                e.stopPropagation();
                var prompt = e.target.dataset.prompt || "";
                if (prompt && navigator.clipboard) {
                    navigator.clipboard.writeText(prompt).then(function() { showToast("Prompt copiado al clipboard", "success"); });
                } else if (prompt) {
                    var ta = document.createElement("textarea");
                    ta.value = prompt; ta.style.position = "fixed"; ta.style.left = "-9999px";
                    document.body.appendChild(ta); ta.select();
                    document.execCommand("copy"); document.body.removeChild(ta);
                    showToast("Prompt copiado al clipboard", "success");
                }
                return;
            }
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
        var el = _el("br-selected-count"); if (el) el.textContent = checked.length;
        var btn = _el("btn-br-generate");
        if (btn) {
            btn.disabled = checked.length === 0;
            if (checked.length > 0) btn.classList.remove("btn-disabled");
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

    function _navigateToTime(timeStr) {
        if (!csInterface || !timeStr) return;
        var secs = broll._timeToSeconds(timeStr);
        csInterface.evalScript('movePlayhead(' + secs + ')', function() {});
    }

    // ── Step 2: Generation flow ────────────────────────────────────────────────

    function _resolveBrollOutputDir(callback) {
        if (!csInterface) return callback();
        csInterface.evalScript("getActiveSequenceInfo()", function(res) {
            try {
                var info = JSON.parse(res);
                if (info.projectPath) {
                    var projDir = require("path").dirname(info.projectPath);
                    var seqName = _sessionKey || info.sequenceName || "default";
                    var safeSeqName = seqName.replace(/[<>:"/\\|?*]/g, "_").substring(0, 80);
                    var brollDir = require("path").join(projDir, "BRoll Generation", safeSeqName);
                    if (!require("fs").existsSync(brollDir)) require("fs").mkdirSync(brollDir, { recursive: true });
                    broll.setOutputDir(brollDir);
                    broll._currentSequenceName = safeSeqName;
                }
            } catch(e) {}
            callback();
        });
    }

    function startGeneration() {
        var selected = [];
        document.querySelectorAll(".br-proposal-check:checked").forEach(function(cb) {
            var card = cb.closest(".br-proposal-card");
            if (card) selected.push(card.dataset.id);
        });
        if (selected.length === 0) { showToast("Selecciona al menos una propuesta", "error"); return; }
        if (!broll) return;

        _resolveBrollOutputDir(function() {
        broll.checkServer(function(ok) {
            if (!ok) { showToast("Inicia el servidor Motion-Pro primero", "error"); return; }

            var btn = _el("btn-br-generate"); if (btn) { btn.disabled = true; btn.style.display = "none"; }
            var stopBtn = _el("btn-br-stop"); if (stopBtn) stopBtn.style.display = "";
            broll.generating = true;
            broll.generateCancelRequested = false;

            var step1Body = _el("br-step-body-1"); if (step1Body) step1Body.classList.add("hidden");
            var step3 = _el("br-clips-section"); if (step3) step3.style.display = "";

            _genProgress.current = 0;
            _genProgress.total = selected.length;
            _genProgress.startMs = Date.now();
            _setInlineProgress(0, selected.length, "", 0);

            if (broll.hasScenes()) {
                _generateByScenes(selected, function() { _onGenerationComplete(btn, stopBtn); });
            } else {
                _generateNext(selected, 0, function() { _onGenerationComplete(btn, stopBtn); });
            }
        });
        });
    }

    function _onGenerationComplete(btn, stopBtn) {
        broll.generating = false;
        if (btn) { btn.disabled = false; btn.style.display = ""; }
        if (stopBtn) stopBtn.style.display = "none";
        broll.saveState(_sessionKey);
        _hideInlineProgress();
        _clearHeaderProgress();

        // Notify clips UI to render
        if (brollUI._renderClips) brollUI._renderClips();

        if (broll.clips.length > 0) {
            var clipCount = broll.clips.length;
            showToast(clipCount + " imágenes generadas", "success");
            var h2 = _el("br-step-hint-2"); if (h2) h2.textContent = "✅ " + clipCount + " clips generados";

            var s2Body = _el("br-step-body-2"); if (s2Body) s2Body.classList.add("hidden");
            var s3 = _el("br-clips-section"); if (s3) s3.style.display = "";
            var s3Body = _el("br-step-body-3"); if (s3Body) s3Body.classList.remove("hidden");
        } else {
            showToast("No se generaron imágenes — revisa la conexión", "error");
        }
    }

    // ── Scene-aware generation ─────────────────────────────────────────────────

    function _generateByScenes(selectedIds, done) {
        var sceneOrder = [];
        var sceneMap = {};

        for (var i = 0; i < selectedIds.length; i++) {
            var proposal = broll._findProposal(selectedIds[i]);
            if (!proposal) continue;
            var sid = proposal.sceneId || "__noscene__";
            if (!sceneMap[sid]) { sceneMap[sid] = []; sceneOrder.push(sid); }
            sceneMap[sid].push(selectedIds[i]);
        }

        var totalShots = selectedIds.length;
        var completedShots = 0;

        function nextScene(si) {
            if (broll.generateCancelRequested || si >= sceneOrder.length) return done();
            var sid = sceneOrder[si];
            var shotIds = sceneMap[sid];

            if (sid === "__noscene__") { _generateNext(shotIds, 0, function() { nextScene(si + 1); }); return; }

            shotIds.sort(function(a, b) {
                var pa = broll._findProposal(a); var pb = broll._findProposal(b);
                return ((pa && pa.shotOrder) || 0) - ((pb && pb.shotOrder) || 0);
            });

            var heroShotId = null; var heroProposal = null;
            for (var hi = 0; hi < shotIds.length; hi++) {
                var hp = broll._findProposal(shotIds[hi]);
                if (hp && hp.isHero) { heroShotId = shotIds[hi]; heroProposal = hp; break; }
            }
            if (!heroShotId) { heroShotId = shotIds[0]; heroProposal = broll._findProposal(heroShotId); }
            var remainingIds = shotIds.filter(function(id) { return id !== heroShotId; });

            _setInlineProgress(completedShots, totalShots, "", Math.round((Date.now() - _genProgress.startMs) / 1000));
            if (brollUI._renderClips) brollUI._renderClips();

            broll.generateImage(heroShotId,
                function(pId, status, elapsed) { _refreshClipCard(pId, status, elapsed); },
                function(err) {
                    if (err) showToast("Error Hero Shot: " + err.message, "error");
                    else { if (brollUI._renderClips) brollUI._renderClips(); broll.saveState(_sessionKey); }
                    completedShots++;
                    _setInlineProgress(completedShots, totalShots, "", Math.round((Date.now() - _genProgress.startMs) / 1000));

                    var heroClip = broll._findClip(heroShotId);
                    var refPath = null;
                    if (heroClip && heroClip.versions.length > 0) {
                        var hv = heroClip.versions[heroClip.activeVersion];
                        if (hv && hv.imagePath) refPath = hv.imagePath;
                        _placeClip(heroClip.id, function() {
                            setTimeout(function() {
                                _generateSceneShots(remainingIds, 0, refPath, heroProposal, function() {
                                    completedShots += remainingIds.length;
                                    _retryFailedSceneShots(sid, shotIds, refPath, heroProposal, function() { nextScene(si + 1); });
                                });
                            }, 2000);
                        });
                    } else {
                        setTimeout(function() {
                            _generateSceneShots(remainingIds, 0, null, heroProposal, function() {
                                completedShots += remainingIds.length;
                                _retryFailedSceneShots(sid, shotIds, null, heroProposal, function() { nextScene(si + 1); });
                            });
                        }, 2000);
                    }
                }
            );
        }
        nextScene(0);
    }

    function _retryFailedSceneShots(sceneId, allShotIds, refPath, heroProposal, done) {
        if (broll.generateCancelRequested) return done();
        var failedIds = [];
        for (var i = 0; i < allShotIds.length; i++) {
            var clip = broll._findClip(allShotIds[i]);
            if (!clip || clip.status === "error") failedIds.push(allShotIds[i]);
        }
        if (failedIds.length === 0) return done();
        showToast("Reintentando " + failedIds.length + " shots fallidos...", "info");
        setTimeout(function() { _generateSceneShots(failedIds, 0, refPath, heroProposal, done); }, 5000);
    }

    function _generateSceneShots(shotIds, startIdx, refPath, heroProposal, done) {
        if (broll.generateCancelRequested || startIdx >= shotIds.length) return done();
        var shotId = shotIds[startIdx];
        if (brollUI._renderClips) brollUI._renderClips();

        var genOptions = null;
        if (refPath) {
            var tgtProp = broll._findProposal(shotId);
            var heroType = heroProposal ? heroProposal.shotType : null;
            var tgtType = tgtProp ? tgtProp.shotType : null;
            var denoise = (heroType && tgtType && heroType === tgtType) ? 0.65 : 0.9;
            genOptions = { referenceImagePath: refPath, denoise: denoise };
            if (heroProposal && heroProposal.description) genOptions.heroDescription = heroProposal.description;
        }

        broll.generateImage(shotId,
            function(pId, status, elapsed) { _refreshClipCard(pId, status, elapsed); },
            function(err) {
                if (err) showToast("Error plano " + (startIdx + 1) + ": " + err.message, "error");
                else { if (brollUI._renderClips) brollUI._renderClips(); broll.saveState(_sessionKey); }
                var clip = broll._findClip(shotId);
                if (clip) { _placeClip(clip.id, function() { setTimeout(function() { _generateSceneShots(shotIds, startIdx + 1, refPath, heroProposal, done); }, 2000); }); }
                else { setTimeout(function() { _generateSceneShots(shotIds, startIdx + 1, refPath, heroProposal, done); }, 2000); }
            },
            genOptions
        );
    }

    function _generateNext(ids, idx, done) {
        if (broll.generateCancelRequested || idx >= ids.length) return done();
        var proposalId = ids[idx];
        if (brollUI._renderClips) brollUI._renderClips();

        _setInlineProgress(idx + 1, ids.length, "", Math.round((Date.now() - _genProgress.startMs) / 1000));

        broll.generateImage(proposalId,
            function(pId, status, elapsed) { _refreshClipCard(pId, status, elapsed); },
            function(err) {
                if (err) { showToast("Error " + (idx + 1) + ": " + err.message, "error"); setTimeout(function() { _generateNext(ids, idx + 1, done); }, 2000); }
                else {
                    if (brollUI._renderClips) brollUI._renderClips();
                    broll.saveState(_sessionKey);
                    var clip = broll._findClip(proposalId);
                    if (clip) { _placeClip(clip.id, function() { setTimeout(function() { _generateNext(ids, idx + 1, done); }, 2000); }); }
                    else { setTimeout(function() { _generateNext(ids, idx + 1, done); }, 2000); }
                }
            }
        );
    }

    function cancelGeneration() { if (broll) broll.generateCancelRequested = true; }

    // ── Place clip helper (delegates to clips UI) ──────────────────────────────

    function _placeClip(clipId, callback) {
        if (brollUI._placeClipInternal) brollUI._placeClipInternal(clipId, callback);
        else if (callback) callback();
    }

    function _refreshClipCard(proposalId, status, elapsedSecs) {
        if (brollUI._refreshClipCard) brollUI._refreshClipCard(proposalId, status, elapsedSecs);
    }

    // ── Accordion helper ─────────────────────────────────────────────────────

    function _collapseAllSteps() {
        ["1","2","3","4"].forEach(function(n) {
            var body = _el("br-step-body-" + n); if (body) body.classList.add("hidden");
            var section = document.querySelector("[data-br-step='" + n + "'].rec-step-header");
            if (section) { var arrow = section.querySelector(".rec-step-arrow"); if (arrow) arrow.textContent = "▸"; }
        });
    }

    // ── Progress helpers ─────────────────────────────────────────────────────

    function _setHeaderProgress(pct, text) {
        var wrap = _el("br-progress-header"); var fill = _el("br-progress-header-fill"); var label = _el("br-progress-header-text");
        if (wrap) wrap.classList.remove("hidden");
        if (fill) fill.style.width = Math.round(pct) + "%";
        if (label) label.textContent = text || "";
        if (refreshAllHeaderProgress) refreshAllHeaderProgress();
    }

    function _clearHeaderProgress() {
        var wrap = _el("br-progress-header"); if (wrap) wrap.classList.add("hidden");
        if (refreshAllHeaderProgress) refreshAllHeaderProgress();
    }

    function _setInlineProgress(current, total, sceneName, elapsedSecs) {
        var wrap = _el("br-gen-progress"); var fill = _el("br-gen-progress-fill"); var text = _el("br-gen-progress-text");
        if (!wrap) return;
        wrap.style.display = "";
        var pct = total > 0 ? Math.round(current / total * 100) : 0;
        if (fill) fill.style.width = pct + "%";
        var line = "Generando plano " + current + "/" + total;
        if (sceneName) line += " — Escena: " + sceneName;
        if (elapsedSecs > 0) line += " — ⏳ " + elapsedSecs + "s";
        if (text) text.textContent = line;
        var hint = _el("br-step-hint-2"); if (hint) hint.textContent = "⏳ Generando " + current + "/" + total + "…";
    }

    function _hideInlineProgress() {
        var wrap = _el("br-gen-progress"); if (wrap) wrap.style.display = "none";
    }

    // ── Expose ─────────────────────────────────────────────────────────────────

    brollUI._initProposalRefs = _initProposalRefs;
    brollUI._setSessionKey = _setSessionKey;
    brollUI._getSessionKey = _getSessionKey;
    brollUI.startAnalysis = startAnalysis;
    brollUI.startGeneration = startGeneration;
    brollUI.cancelGeneration = cancelGeneration;
    brollUI.toggleSelectAll = toggleSelectAll;
    brollUI.renderNoTranscript = renderNoTranscript;
    brollUI.renderProposals = renderProposals;
    brollUI._shotTypeBadge = _shotTypeBadge;
    brollUI._navigateToTime = _navigateToTime;
    brollUI._collapseAllSteps = _collapseAllSteps;

})(window);
