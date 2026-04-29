/**
 * ui-broll-clips.js — B-Roll UI: Step 3 (Clip cards, animate, place, regen)
 * Thumbnails, version switching, batch operations.
 * Extends EditorProUI.broll namespace.
 */
(function(global) {
    "use strict";

    var EP = global.EditorProUI = global.EditorProUI || {};
    var brollUI = EP.broll = EP.broll || {};

    // ── Shared references (set by ui-broll.js init) ────────────────────────────
    var state, csInterface, broll;
    var showToast, esc, escAttr;
    var refreshAllHeaderProgress;

    function _el(id) { return document.getElementById(id); }

    function _initClipRefs(refs) {
        state       = refs.state;
        csInterface = refs.csInterface;
        broll       = refs.broll;
        showToast   = refs.showToast;
        esc         = refs.esc;
        escAttr     = refs.escAttr;
        refreshAllHeaderProgress = refs.refreshAllHeaderProgress;
    }

    // ── Status label helper ────────────────────────────────────────────────────

    function _statusLabel(status) {
        var labels = {
            pending: "Pendiente", generating: "Generando…", image: "📸 Imagen",
            animating: "Animando…", video: "🎬 Video", placed: "✓ Colocado", error: "⚠ Error"
        };
        return labels[status] || status;
    }

    // ── Clip selection helpers ──────────────────────────────────────────────────

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
        var total = broll.clips.filter(function(c) { return c.status === "image" || c.status === "video" || c.status === "placed"; }).length;
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

    // ── Render clips ───────────────────────────────────────────────────────────

    function renderClips() {
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
            var sceneGroups = broll.getClipsByScene();
            var clipNum = 0;
            for (var gi = 0; gi < sceneGroups.length; gi++) {
                var group = sceneGroups[gi];
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

        // NOTE: Click delegation for timecode links is set up ONCE in ui-broll.js init()
        // to avoid the event listener leak (Bug 3 fix).

        var countEl = _el("br-clips-count");
        if (countEl) countEl.textContent = clips.length;

        var hasActionable = clips.some(function(c) { return c.status === "image" || c.status === "video" || c.status === "placed"; });
        var batchRow = _el("br-batch-animate-row");
        if (batchRow) batchRow.style.display = hasActionable ? "" : "none";

        setTimeout(_updateClipSelectedCount, 0);
    }

    function _buildClipCard(clip, num) {
        var div = document.createElement("div");
        div.className = "br-clip-card" + (clip.status === "placed" ? " placed" : clip.status === "error" ? " error" : "");
        div.id = "br-clip-card-" + clip.id;

        var version = clip.versions[clip.activeVersion] || null;
        var hasImage = version && version.imagePath;
        var hasVideo = version && version.videoPath;
        var checkId = "br-clip-check-" + clip.id;
        var isCheckable = clip.status === "image" || clip.status === "video" || clip.status === "placed";

        var versionOpts = "";
        for (var i = 0; i < clip.versions.length; i++) {
            var v = clip.versions[i];
            var sel = i === clip.activeVersion ? " selected" : "";
            versionOpts += '<option value="' + i + '"' + sel + '>v' + v.version + ' — ' + v.status + '</option>';
        }

        var shotBadge = clip.shotType ? brollUI._shotTypeBadge(clip.shotType) : "";
        var heroBadge = clip.isHero ? '<span class="br-hero-badge">⭐</span>' : '';

        // Action buttons
        var btnVideo = hasImage ? '<button class="btn btn-xs btn-accent" onclick="EditorProUI.broll._animateClip(\'' + clip.id + '\')">' + (hasVideo ? '🔄 Re-video' : '🎥 Video') + '</button>' : '';
        var btnRegen = hasImage ? '<button class="btn btn-xs btn-ghost" onclick="EditorProUI.broll._regenClip(\'' + clip.id + '\')">🔄 Regenerar</button>' : '';
        var btnRegenChildren = (clip.isHero && hasImage) ? '<button class="btn btn-xs btn-ghost" onclick="EditorProUI.broll._regenChildren(\'' + clip.id + '\')">🔄 Hijos</button>' : '';

        // Description
        var descText = clip.description || "";

        // Thumbnail src
        var thumbSrc = (version && version.imageBase64) ? version.imageBase64 :
                       (version && version.imagePath) ? ('file://' + version.imagePath) : '';

        // Build card with separate innerHTML blocks to avoid base64 truncation
        // 1) Header
        var headerDiv = document.createElement("div");
        headerDiv.className = "br-clip-header-row";
        headerDiv.innerHTML =
            '<input type="checkbox" id="' + checkId + '" class="br-clip-check"' + (isCheckable ? ' checked' : '') + '>' +
            '<span class="br-clip-num">' + num + '</span>' +
            '<span class="br-clip-timecode br-timecode-link" data-time="' + escAttr(clip.startTime) + '">' + esc(clip.startTime) + '</span>' +
            (shotBadge || '') + (heroBadge || '') +
            '<span class="br-status-badge" data-status="' + escAttr(clip.status) + '">' + _statusLabel(clip.status) + '</span>';
        div.appendChild(headerDiv);

        // 2) Thumbnail
        if (thumbSrc) {
            var thumbWrap = document.createElement("div");
            thumbWrap.className = "br-clip-thumb-row";
            var thumbImg = document.createElement("img");
            thumbImg.className = "br-clip-thumb-mid";
            thumbImg.alt = "";
            thumbImg.onclick = function() { brollUI._expandImage(this.src); };
            thumbImg.src = thumbSrc; // set src LAST
            thumbWrap.appendChild(thumbImg);
            div.appendChild(thumbWrap);
        }

        // 3) Body: desc + actions + feedback — all in one innerHTML (no base64 here)
        var bodyDiv = document.createElement("div");
        bodyDiv.style.cssText = "padding:6px 8px;background:rgba(30,41,59,0.5);border-top:1px solid rgba(51,65,85,0.5)";
        var bodyHtml =
            '<div style="font-size:10px;color:#94a3b8;line-height:1.35;margin-bottom:4px">' + esc(descText) + '</div>';
        if (clip.versions.length > 1) {
            bodyHtml += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:9px;color:#64748b">Versión:</span><select class="br-version-select-sm" onchange="EditorProUI.broll._switchVersion(\'' + clip.id + '\', this.value)">' + versionOpts + '</select></div>';
        }
        bodyHtml += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px">' + btnVideo + btnRegen + btnRegenChildren + '</div>' +
            '<div style="display:flex;gap:4px;align-items:center">' +
                '<input type="text" id="br-feedback-' + clip.id + '" placeholder="Cambios: ej. más colorido, sin personas…" style="flex:1;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:3px;padding:4px 6px;font-size:9px;font-family:inherit">' +
                '<button class="btn btn-xs" onclick="EditorProUI.broll._sendFeedback(\'' + clip.id + '\')" style="background:#10b981;color:#fff;border:none;font-weight:700;font-size:9px;padding:4px 8px;border-radius:3px;cursor:pointer">Enviar</button>' +
            '</div>';
        bodyDiv.innerHTML = bodyHtml;
        div.appendChild(bodyDiv);
        console.log("[BRoll] Card " + num + " built, bodyDiv children:", bodyDiv.childNodes.length, "hasImage:", !!hasImage);

        setTimeout(function() {
            var cb = document.getElementById(checkId);
            if (cb) {
                if (isCheckable && cb.checked) div.classList.add("selected");
                cb.addEventListener("change", function() {
                    div.classList.toggle("selected", cb.checked);
                    _updateClipSelectedCount();
                });
            }
        }, 0);

        // Click on header row toggles checkbox
        div.addEventListener("click", function(e) {
            var hdr = e.target.closest ? e.target.closest(".br-clip-header-row") : null;
            if (!hdr) return;
            if (e.target.type === "checkbox") return;
            if (e.target.classList.contains("br-timecode-link")) return;
            var cb = document.getElementById(checkId);
            if (cb) { cb.checked = !cb.checked; div.classList.toggle("selected", cb.checked); _updateClipSelectedCount(); }
        });

        return div;
    }

    // ── Refresh a single clip card's badge ──────────────────────────────────────

    function refreshClipCard(proposalId, status, elapsedSecs) {
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

    // ── Clip actions ────────────────────────────────────────────────────────────

    function _switchVersion(clipId, versionIdx) {
        if (!broll) return;
        var clip = broll._findClipById(clipId);
        if (!clip) return;
        clip.activeVersion = parseInt(versionIdx, 10);
        broll.saveState(brollUI._getSessionKey());
        renderClips();
    }

    function placeClipInternal(clipId, callback) {
        if (!broll || !csInterface) {
            if (callback) callback();
            return;
        }
        var clip = broll._findClipById(clipId);
        if (!clip) { if (callback) callback(); return; }

        broll.placeInTimeline(clipId, csInterface, function(err) {
            if (err) {
                if (window.EPLogger) EPLogger.error("broll", "place-error", err.message);
                showToast("Error al colocar: " + err.message, "error");
            } else {
                showToast("Clip colocado en timeline", "success");
                broll.saveState(brollUI._getSessionKey());
                renderClips();
            }
            if (callback) callback();
        });
    }

    function _placeClip(clipId) { placeClipInternal(clipId); }

    function _animateClip(clipId) {
        if (!broll) return;
        broll.checkServer(function(ok) {
            if (!ok) { showToast("Inicia el servidor Motion-Pro primero", "error"); return; }
            var card = _el("br-clip-card-" + clipId);
            if (card) {
                var badge = card.querySelector(".br-status-badge");
                if (badge) { badge.dataset.status = "animating"; badge.textContent = _statusLabel("animating"); }
            }
            broll.animateClip(clipId,
                function(cId, status, elapsed) { refreshClipCard(cId, status, elapsed); },
                function(err) {
                    if (err) showToast("Error al animar: " + err.message, "error");
                    else showToast("Video generado", "success");
                    broll.saveState(brollUI._getSessionKey());
                    renderClips();
                }
            );
        });
    }

    function _regenClip(clipId) {
        if (!broll) return;
        // Regenerar = nueva propuesta desde cero (sin feedback)
        broll.checkServer(function(ok) {
            if (!ok) { showToast("Inicia el servidor Motion-Pro primero", "error"); return; }
            broll.regenerateImage(clipId, "",
                function(pId, status, elapsed) { refreshClipCard(pId, status, elapsed); },
                function(err) {
                    if (err) { showToast("Error al regenerar: " + err.message, "error"); return; }
                    broll.saveState(brollUI._getSessionKey());
                    showToast("Imagen regenerada", "success");
                    renderClips();
                }
            );
        });
    }

    function _sendFeedback(clipId) {
        if (!broll) return;
        var feedbackEl = _el("br-feedback-" + clipId);
        var feedback = feedbackEl ? feedbackEl.value.trim() : "";
        if (!feedback) { showToast("Escribe tu feedback primero", "warning"); return; }

        broll.checkServer(function(ok) {
            if (!ok) { showToast("Inicia el servidor Motion-Pro primero", "error"); return; }
            // Enviar feedback con contexto de la imagen actual (img2img refinement)
            broll.regenerateImage(clipId, feedback,
                function(pId, status, elapsed) { refreshClipCard(pId, status, elapsed); },
                function(err) {
                    if (err) { showToast("Error al aplicar feedback: " + err.message, "error"); return; }
                    broll.saveState(brollUI._getSessionKey());
                    showToast("Imagen actualizada con feedback", "success");
                    if (feedbackEl) feedbackEl.value = "";
                    renderClips();
                }
            );
        });
    }

    function _regenChildren(heroClipId) {
        if (!broll) return;
        var heroClip = broll._findClipById(heroClipId);
        if (!heroClip || !heroClip.sceneId) { showToast("No se encontró el clip hero", "error"); return; }
        var heroVersion = heroClip.versions[heroClip.activeVersion];
        if (!heroVersion || !heroVersion.imagePath) { showToast("El Hero Shot no tiene imagen", "error"); return; }

        var children = broll.clips.filter(function(c) {
            return c.sceneId === heroClip.sceneId && c.id !== heroClipId && !c.isHero;
        });
        if (children.length === 0) { showToast("No hay clips hijos", "warning"); return; }

        broll.checkServer(function(ok) {
            if (!ok) { showToast("Inicia el servidor primero", "error"); return; }
            var heroProposal = broll._findProposal(heroClip.proposalId);
            var heroStyle = heroProposal && heroProposal.visualStyle ? heroProposal.visualStyle : "photorealistic";
            var heroContext = "Maintain style: " + heroStyle.replace(/_/g, " ") + ". Visual world: " + (heroClip.visualWorld || "");
            var total = children.length; var done = 0;

            function regenNext(idx) {
                if (idx >= children.length) { renderClips(); showToast("✅ " + done + "/" + total + " hijos regenerados", "success"); return; }
                showToast("Regenerando hijo " + (idx + 1) + "/" + total + "...", "info");
                broll.regenerateImage(children[idx].id, "",
                    function(pId, status, elapsed) { refreshClipCard(pId, status, elapsed); },
                    function(err) {
                        if (!err) { done++; broll.saveState(brollUI._getSessionKey()); }
                        else showToast("Error hijo " + (idx + 1) + ": " + err.message, "error");
                        setTimeout(function() { regenNext(idx + 1); }, 2000);
                    },
                    heroContext
                );
            }
            regenNext(0);
        });
    }

    function startBatchAnimate() {
        if (!broll) return;
        var selectedIds = _getSelectedClipIds();
        if (selectedIds.length === 0) { showToast("Selecciona al menos un clip", "error"); return; }
        broll.checkServer(function(ok) {
            if (!ok) { showToast("Inicia el servidor primero", "error"); return; }
            var btn = _el("btn-br-animate-selected"); if (btn) btn.disabled = true;
            broll.animateSelected(selectedIds,
                function(cId, status, elapsed) { refreshClipCard(cId, status, elapsed); },
                function(idx, total) {
                    var wrap = _el("br-progress-header"); if (wrap) wrap.classList.remove("hidden");
                    var fill = _el("br-progress-header-fill"); if (fill) fill.style.width = Math.round(idx / total * 100) + "%";
                },
                function(err, done, errors) {
                    if (btn) btn.disabled = false;
                    var wrap = _el("br-progress-header"); if (wrap) wrap.classList.add("hidden");
                    broll.saveState(brollUI._getSessionKey());
                    if (errors && errors.length > 0) showToast(errors.length + " errores al animar", "warning");
                    else showToast(done + " videos generados", "success");
                    renderClips();
                }
            );
        });
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

    // ── Expose ─────────────────────────────────────────────────────────────────

    brollUI._initClipRefs = _initClipRefs;
    brollUI._renderClips = renderClips;
    brollUI._refreshClipCard = refreshClipCard;
    brollUI._placeClipInternal = placeClipInternal;
    brollUI._placeClip = _placeClip;
    brollUI._animateClip = _animateClip;
    brollUI._regenClip = _regenClip;
    brollUI._sendFeedback = _sendFeedback;
    brollUI._regenChildren = _regenChildren;
    brollUI._switchVersion = _switchVersion;
    brollUI._expandImage = _expandImage;
    brollUI.startBatchAnimate = startBatchAnimate;
    brollUI.toggleSelectAllClips = toggleSelectAllClips;

})(window);
