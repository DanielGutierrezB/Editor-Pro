/**
 * Editor-Pro — B-Roll UI Module
 * Handles all DOM interactions for the B-Roll tab.
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

    function _setServerStatus(online) {
        var dot = _el("br-server-dot");
        var text = _el("br-server-text");
        if (!dot || !text) return;
        dot.className = "br-server-dot " + (online ? "br-dot-on" : "br-dot-off");
        text.textContent = online ? "Servidor activo" : "Servidor detenido";
    }

    function _refreshServerStatus() {
        if (!broll) return;
        broll.checkServer(function(ok) { _setServerStatus(ok); });
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
        _doAnalysis(transcript);
    }

    function _doAnalysis(transcript) {
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
            broll.saveState(_sessionKey);
            _renderProposals(proposals);
            // Reveal and expand step 2
            var step2 = _el("br-proposals-section");
            if (step2) step2.style.display = "";
            var step2Body = _el("br-step-body-2");
            if (step2Body) step2Body.classList.remove("hidden");
            var step2Arrow = step2 ? step2.querySelector(".rec-step-arrow") : null;
            if (step2Arrow) step2Arrow.textContent = "▾";
            _el("br-step-hint-1") && (_el("br-step-hint-1").textContent = proposals.length + " momentos");
            showToast("Se encontraron " + proposals.length + " momentos de B-roll", "success");
        });
    }

    function _renderProposals(proposals) {
        var list = _el("br-proposal-list");
        if (!list) return;
        list.innerHTML = "";

        var count = _el("br-proposal-count");
        if (count) count.textContent = proposals.length;

        for (var i = 0; i < proposals.length; i++) {
            (function(proposal, idx) {
                var card = document.createElement("div");
                card.className = "br-proposal-card";
                card.dataset.id = proposal.id;

                var checkId = "br-prop-check-" + proposal.id;
                card.innerHTML =
                    '<input type="checkbox" id="' + checkId + '" class="br-proposal-check" checked>' +
                    '<div class="br-proposal-body">' +
                        '<div class="br-proposal-timecode">' + esc(proposal.startTime) + ' → ' + esc(proposal.endTime) + '</div>' +
                        '<div class="br-proposal-desc">' + esc(proposal.description) + '</div>' +
                        '<div class="br-proposal-rationale">' + esc(proposal.rationale) + '</div>' +
                    '</div>';

                card.addEventListener("click", function(e) {
                    if (e.target.type === "checkbox") return;
                    var cb = document.getElementById(checkId);
                    if (cb) cb.checked = !cb.checked;
                    card.classList.toggle("selected", cb ? cb.checked : false);
                    _updateSelectedCount();
                });
                var cb = document.getElementById(checkId);
                if (cb) {
                    cb.addEventListener("change", function() {
                        card.classList.toggle("selected", cb.checked);
                        _updateSelectedCount();
                    });
                    card.classList.add("selected");
                }

                list.appendChild(card);
            })(proposals[i], i);
        }
        _updateSelectedCount();

        // Show summary bar
        var summary = _el("br-proposals-summary");
        if (summary) summary.classList.remove("hidden");
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

        broll.checkServer(function(ok) {
            if (!ok) {
                if (window.EPLogger) EPLogger.error("broll", "generate-error", "server not running");
                showToast("Inicia el servidor Motion-Pro primero", "error");
                return;
            }

            var btn = _el("btn-br-generate");
            if (btn) btn.disabled = true;
            broll.generating = true;
            broll.generateCancelRequested = false;

            var step3 = _el("br-clips-section");
            if (step3) step3.style.display = "";
            var step3Body = _el("br-step-body-3");
            if (step3Body) step3Body.classList.remove("hidden");
            var step3Arrow = step3 ? step3.querySelector(".rec-step-arrow") : null;
            if (step3Arrow) step3Arrow.textContent = "▾";

            _generateNext(selected, 0, function() {
                broll.generating = false;
                if (btn) btn.disabled = false;
                broll.saveState(_sessionKey);
                showToast("Imágenes generadas. Revisa y anima los clips.", "success");
                _el("br-step-hint-2") && (_el("br-step-hint-2").textContent = broll.clips.length + " clips");
                _renderClips();
            });
        });
    }

    function _generateNext(ids, idx, done) {
        if (broll.generateCancelRequested || idx >= ids.length) return done();
        var proposalId = ids[idx];
        _renderClips(); // show current state

        _setHeaderProgress(idx / ids.length * 100, (idx + 1) + "/" + ids.length);

        broll.generateImage(proposalId,
            function(pId, status) {
                _refreshClipCard(pId, status);
            },
            function(err) {
                if (err) {
                    if (window.EPLogger) EPLogger.error("broll", "generate-image-error", "clip " + (idx + 1) + ": " + err.message);
                    showToast("Error generando " + (idx + 1) + ": " + err.message, "error");
                } else {
                    if (window.EPLogger) EPLogger.log("broll", "generate-image-ok", "clip " + (idx + 1) + "/" + ids.length);
                }
                _generateNext(ids, idx + 1, done);
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

        var hasVideo = false;
        for (var i = 0; i < clips.length; i++) {
            (function(clip, idx) {
                if (clip.status === "video" || clip.status === "placed") hasVideo = true;
                list.appendChild(_buildClipCard(clip, idx + 1));
            })(clips[i], i);
        }

        var countEl = _el("br-clips-count");
        if (countEl) countEl.textContent = clips.length;

        // Show "animate all" only if there are image-stage clips
        var hasImages = clips.some(function(c) { return c.status === "image"; });
        var batchRow = _el("br-batch-animate-row");
        if (batchRow) batchRow.style.display = hasImages ? "" : "none";
    }

    function _buildClipCard(clip, num) {
        var div = document.createElement("div");
        div.className = "br-clip-card" + (clip.status === "placed" ? " placed" : clip.status === "error" ? " error" : "");
        div.id = "br-clip-card-" + clip.id;

        var version = clip.versions[clip.activeVersion] || null;
        var hasImage = version && version.imagePath;
        var hasVideo = version && version.videoPath;

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
                '<img class="br-clip-thumb" src="' + escAttr(version.imageBase64) + '" alt="preview">' +
                '<div class="br-clip-thumb-overlay">' +
                    (hasVideo ? "🎬 Video listo" : "📸 Imagen") +
                    ' · ' + esc(clip.startTime) + ' → ' + esc(clip.endTime) +
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

        div.innerHTML =
            '<div class="br-clip-header">' +
                '<span class="br-clip-num">' + num + '</span>' +
                '<span class="br-clip-timecode">' + esc(clip.startTime) + ' → ' + esc(clip.endTime) + '</span>' +
                '<span class="br-clip-title">' + esc(clip.description.substring(0, 60)) + '</span>' +
                '<span class="br-status-badge" data-status="' + escAttr(clip.status) + '">' + _statusLabel(clip.status) + '</span>' +
            '</div>' +
            thumbHtml +
            '<div class="br-clip-body">' +
                (clip.versions.length > 1
                    ? '<div class="br-version-row"><span class="br-version-label">Versión:</span>' +
                        '<select class="br-version-select" onchange="EditorProUI.broll._switchVersion(\'' + clip.id + '\', this.value)">' + versionOpts + '</select></div>'
                    : '') +
                '<div class="br-clip-desc">' + esc(clip.description) + '</div>' +
                '<textarea class="br-feedback-input" id="br-feedback-' + clip.id + '" placeholder="Feedback para regenerar: ej. \'más colorido\', \'sin personas\'..." rows="2"></textarea>' +
                '<div class="br-clip-actions">' + btnPlace + btnAnimate + btnRegen + '</div>' +
            '</div>';

        return div;
    }

    function _statusLabel(status) {
        var labels = {
            pending: "Pendiente", generating: "Generando…", image: "📸 Imagen",
            animating: "Animando…", video: "🎬 Video", placed: "✓ Colocado", error: "⚠ Error"
        };
        return labels[status] || status;
    }

    function _refreshClipCard(proposalId, status) {
        var clip = broll._findClip(proposalId);
        if (!clip) return;
        var existing = _el("br-clip-card-" + clip.id);
        if (existing) {
            var badge = existing.querySelector(".br-status-badge");
            if (badge) { badge.dataset.status = status; badge.textContent = _statusLabel(status); }
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

    function _placeClip(clipId) {
        if (!broll || !csInterface) return;
        var clip = broll._findClipById(clipId);
        if (!clip) return;
        broll.placeInTimeline(clipId, csInterface, function(err) {
            if (err) { if (window.EPLogger) EPLogger.error("broll", "place-error", err.message); showToast("Error al colocar: " + err.message, "error"); return; }
            broll.saveState(_sessionKey);
            showToast("B-roll colocado en timeline", "success");
            _renderClips();
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
            function(cId, status) { _refreshClipCard(cId, status); },
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
                function(pId, status) { _refreshClipCard(pId, status); },
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
        broll.checkServer(function(ok) {
            if (!ok) { showToast("Inicia el servidor Motion-Pro primero", "error"); return; }
            var btn = _el("btn-br-animate-all");
            if (btn) btn.disabled = true;
            broll.animateAll(
                function(cId, status) { _refreshClipCard(cId, status); },
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
        _setSelectVal("br-img-provider", s.imageProvider);
        _setInputVal("br-img-endpoint", s.imageEndpointUrl);
        _setInputVal("br-img-fal-model", s.imageFalModel);
        _setInputVal("br-img-fal-key", s.imageFalApiKey);
        _setSelectVal("br-vid-provider", s.videoProvider);
        _setInputVal("br-vid-endpoint", s.videoEndpointUrl);
        _setInputVal("br-vid-kling-key", s.videoKlingApiKey);
        _setSelectVal("br-track-select", s.trackIndex);
        _refreshSettingsVisibility();
    }

    function _refreshSettingsVisibility() {
        var imgProv = _getSelectVal("br-img-provider");
        _toggleEl("br-img-endpoint-row",  imgProv === "comfyui");
    }

    function saveSettings() {
        if (!broll) return;
        broll.saveSettings({
            imageProvider:    _getSelectVal("br-img-provider"),
            imageEndpointUrl: _getInputVal("br-img-endpoint"),
            imageFalModel:    _getInputVal("br-img-fal-model"),
            imageFalApiKey:   _getInputVal("br-img-fal-key"),
            videoProvider:    _getSelectVal("br-vid-provider"),
            videoEndpointUrl: _getInputVal("br-vid-endpoint"),
            videoKlingApiKey: _getInputVal("br-vid-kling-key"),
            trackIndex:       _getSelectVal("br-track-select")
        });
        showToast("Configuración B-Roll guardada", "success");
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

        on("btn-br-analyze",        "click", startAnalysis);
        on("btn-br-select-all",     "click", toggleSelectAll);
        on("btn-br-generate",       "click", startGeneration);
        on("btn-br-stop",           "click", cancelGeneration);
        on("btn-br-animate-all",    "click", startBatchAnimate);
        on("btn-br-save-settings",  "click", saveSettings);

        var imgProv = _el("br-img-provider");
        if (imgProv) imgProv.addEventListener("change", _refreshSettingsVisibility);
        var vidProv = _el("br-vid-provider");
        if (vidProv) vidProv.addEventListener("change", _refreshSettingsVisibility);

        // Step headers: expand/collapse
        var stepHeaders = document.querySelectorAll("[data-br-step]");
        stepHeaders.forEach(function(hdr) {
            if (!hdr.classList.contains("rec-step-header")) return;
            hdr.addEventListener("click", function() {
                var stepNum = hdr.getAttribute("data-br-step");
                var body = _el("br-step-body-" + stepNum);
                if (!body) return;
                var arrow = hdr.querySelector(".rec-step-arrow");
                if (body.classList.contains("hidden")) {
                    body.classList.remove("hidden");
                    if (arrow) arrow.textContent = "▾";
                } else {
                    body.classList.add("hidden");
                    if (arrow) arrow.textContent = "▸";
                }
            });
        });

        // Settings toggle
        on("br-settings-toggle", "click", function() {
            var body = _el("br-settings-body");
            if (body) body.classList.toggle("hidden");
        });

        // Subscribe to EventBus — self-contained, no need to wire in sequence-controller
        if (window.EventBus) {
            window.EventBus.on("sequence-changed", function(data) { switchToSequence(data.name); });
            window.EventBus.on("sequence-first-load", function(data) { switchToSequence(data.name); });
            window.EventBus.on("state-restored", function() { _renderNoTranscript(); _refreshServerStatus(); });
            window.EventBus.on("transcript-changed", function() { _renderNoTranscript(); });
        }
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
        // Exposed for inline onclick in card HTML
        _placeClip: _placeClip,
        _animateClip: _animateClip,
        _regenClip: _regenClip,
        _switchVersion: _switchVersion,
    };

})(window);
