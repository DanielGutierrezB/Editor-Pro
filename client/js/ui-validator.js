/**
 * ui-validator.js — UI del Validador de cortes (Notas de Grabación, paso 5)
 *
 * Corre EPCutValidator sobre las tomas activas antes de colocar marcadores:
 *   - Pickups: tomas que empiezan repitiendo la frase final de la anterior →
 *     propone retroceder el OUT previo al inicio de la frase repetida.
 *   - Snapping: ajusta IN/OUT a los gaps reales de silencio.
 *   - Reporte por toma: fronteras que caen a mitad de palabra o con margen justo.
 *
 * Los ajustes aceptados modifican seg.inTime/outTime ANTES de generateSimpleMarkers(),
 * así los marcadores (y cualquier cutter) usan las posiciones corregidas.
 */
(function(global) {
    "use strict";

    var EP = global.EditorProUI = global.EditorProUI || {};

    var state, recorder;

    var _session = null; // { segments, pickups, snaps, report }

    function _initRefs() {
        state = global._epState;
        recorder = global._epRecorder;
    }

    function escHtml(s) {
        if (global.EPUtils && global.EPUtils.escapeHtml) return global.EPUtils.escapeHtml(s);
        return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function showToast(msg, type) {
        var toast = document.getElementById("toast");
        if (!toast) return;
        toast.textContent = msg;
        toast.className = "toast toast-" + (type || "info") + " show";
        setTimeout(function() { toast.className = "toast"; }, 3000);
    }

    function fmt(t) {
        var s = Math.max(0, t);
        var m = Math.floor(s / 60);
        var sec = (s % 60).toFixed(1);
        return m + ":" + (parseFloat(sec) < 10 ? "0" : "") + sec;
    }

    // ─── Run ─────────────────────────────────────────────────

    function runValidation() {
        if (!recorder) _initRefs();
        if (!recorder || !recorder.words || recorder.words.length === 0) {
            showToast("Primero transcribe el audio (paso 2)", "info");
            return;
        }
        if (!recorder.segments || recorder.segments.length === 0) {
            showToast("Primero detecta las tomas (paso 3)", "info");
            return;
        }

        var segments = recorder.getRecommendedSegments();
        if (segments.length === 0) {
            showToast("No hay tomas activas para validar", "info");
            return;
        }

        var pickups = global.EPCutValidator.detectPickups(recorder.words, segments);
        var snaps = global.EPCutValidator.snapBoundaries(recorder.words, segments);
        var report = global.EPCutValidator.validateBoundaries(recorder.words, segments);

        _session = { segments: segments, pickups: pickups, snaps: snaps, report: report };

        if (global.EPLogger) {
            try {
                EPLogger.log("validator", "run", "tomas=" + segments.length +
                    " pickups=" + pickups.length + " snaps=" + snaps.length);
            } catch(e) {}
        }

        render();
    }

    // ─── Aplicar ajustes ─────────────────────────────────────

    function _refreshAfterApply() {
        // Regenerar marcadores y refrescar la lista de tomas con los tiempos nuevos
        try { recorder.generateSimpleMarkers(); } catch(e) {}
        try {
            if (EP.recording && EP.recording.renderSegmentList) {
                EP.recording.renderSegmentList(recorder.segments, recorder.takeGroups || []);
            }
        } catch(e2) {}

        if (state && state.markersPlaced) {
            showToast("Ajuste aplicado — vuelve a colocar los marcadores para actualizarlos", "info");
        }
    }

    function applyPickup(idx) {
        if (!_session) return;
        var p = _session.pickups[idx];
        if (!p || p.type !== "pickup" || p._applied) return;

        var seg = _session.segments[p.prevSegPos];
        seg.outTime = p.proposedOutTime;
        seg.duration = seg.outTime - seg.inTime;
        try {
            seg.lastPhrase = global.EPCutValidator.phraseBefore(recorder.words, seg.outTime, 10);
        } catch(e) {}

        p._applied = true;
        _refreshAfterApply();
        render();
    }

    function applySnap(idx) {
        if (!_session) return;
        var sn = _session.snaps[idx];
        if (!sn || sn._applied) return;

        var seg = _session.segments[sn.segPos];
        seg[sn.field] = sn.proposed;
        seg.duration = seg.outTime - seg.inTime;
        if (sn.field === "outTime") {
            try {
                seg.lastPhrase = global.EPCutValidator.phraseBefore(recorder.words, seg.outTime, 10);
            } catch(e) {}
        }

        sn._applied = true;
        _refreshAfterApply();
        render();
    }

    function applyAll() {
        if (!_session) return;
        var count = 0;
        var i;
        for (i = 0; i < _session.pickups.length; i++) {
            var p = _session.pickups[i];
            if (p.type === "pickup" && !p._applied) {
                var seg = _session.segments[p.prevSegPos];
                seg.outTime = p.proposedOutTime;
                seg.duration = seg.outTime - seg.inTime;
                try { seg.lastPhrase = global.EPCutValidator.phraseBefore(recorder.words, seg.outTime, 10); } catch(e) {}
                p._applied = true;
                count++;
            }
        }
        for (i = 0; i < _session.snaps.length; i++) {
            var sn = _session.snaps[i];
            if (!sn._applied) {
                var seg2 = _session.segments[sn.segPos];
                seg2[sn.field] = sn.proposed;
                seg2.duration = seg2.outTime - seg2.inTime;
                if (sn.field === "outTime") {
                    try { seg2.lastPhrase = global.EPCutValidator.phraseBefore(recorder.words, seg2.outTime, 10); } catch(e) {}
                }
                sn._applied = true;
                count++;
            }
        }
        _refreshAfterApply();
        render();
        showToast(count + " ajustes aplicados", "success");
    }

    // ─── Render ──────────────────────────────────────────────

    function segLabel(pos) {
        var seg = _session.segments[pos];
        return "Toma " + (seg && seg.index ? seg.index : (pos + 1));
    }

    function render() {
        var container = document.getElementById("validator-results");
        if (!container || !_session) return;

        var html = [];
        var pendingCount = 0;
        var i;

        // ── Pickups
        var pickups = _session.pickups;
        if (pickups.length > 0) {
            html.push("<div class='validator-group-title'>Frases repetidas entre tomas</div>");
            for (i = 0; i < pickups.length; i++) {
                var p = pickups[i];
                if (p.type === "pickup-warning") {
                    html.push(
                        "<div class='validator-item warning'>" +
                            "<div class='validator-item-text'>⚠ " + escHtml(segLabel(p.nextSegPos)) + " repite casi toda " +
                            escHtml(segLabel(p.prevSegPos)) + ": <em>\"" + escHtml(p.matchText) + "\"</em><br>" +
                            escHtml(p.message) + "</div>" +
                        "</div>"
                    );
                    continue;
                }
                if (!p._applied) pendingCount++;
                html.push(
                    "<div class='validator-item" + (p._applied ? " applied" : "") + "'>" +
                        "<div class='validator-item-text'>" +
                            "<strong>" + escHtml(segLabel(p.nextSegPos)) + "</strong> re-entra repitiendo el final de " +
                            "<strong>" + escHtml(segLabel(p.prevSegPos)) + "</strong> " +
                            "<span class='validator-confidence'>(" + p.matchWordCount + " palabras, confianza " + p.confidence + ")</span><br>" +
                            "<em>\"" + escHtml(p.matchText) + "\"</em><br>" +
                            "OUT de " + escHtml(segLabel(p.prevSegPos)) + ": " + fmt(p.originalOutTime) + " → <strong>" + fmt(p.proposedOutTime) + "</strong> " +
                            "(-" + p.removedSeconds.toFixed(1) + "s, la frase completa queda en la toma nueva)" +
                        "</div>" +
                        (p._applied
                            ? "<span class='validator-applied-badge'>✓ aplicado</span>"
                            : "<button class='btn btn-sm btn-ghost validator-apply-btn' data-kind='pickup' data-idx='" + i + "'>Aplicar</button>") +
                    "</div>"
                );
            }
        }

        // ── Snaps
        var snaps = _session.snaps;
        if (snaps.length > 0) {
            html.push("<div class='validator-group-title'>Ajustes de borde a silencio</div>");
            for (i = 0; i < snaps.length; i++) {
                var sn = snaps[i];
                if (!sn._applied) pendingCount++;
                html.push(
                    "<div class='validator-item" + (sn._applied ? " applied" : "") + "'>" +
                        "<div class='validator-item-text'>" +
                            "<strong>" + escHtml(segLabel(sn.segPos)) + "</strong> — " + escHtml(sn.reason) + "<br>" +
                            (sn.field === "inTime" ? "IN" : "OUT") + ": " + fmt(sn.original) + " → <strong>" + fmt(sn.proposed) + "</strong>" +
                        "</div>" +
                        (sn._applied
                            ? "<span class='validator-applied-badge'>✓ aplicado</span>"
                            : "<button class='btn btn-sm btn-ghost validator-apply-btn' data-kind='snap' data-idx='" + i + "'>Aplicar</button>") +
                    "</div>"
                );
            }
        }

        // ── Reporte por toma
        var toReview = [];
        for (i = 0; i < _session.report.length; i++) {
            if (_session.report[i].status !== "ok") toReview.push(_session.report[i]);
        }
        if (toReview.length > 0) {
            html.push("<div class='validator-group-title'>Fronteras a revisar</div>");
            for (i = 0; i < toReview.length; i++) {
                var r = toReview[i];
                html.push(
                    "<div class='validator-item warning'>" +
                        "<div class='validator-item-text'>" +
                            "<strong>" + escHtml(segLabel(r.segPos)) + "</strong> [" + fmt(r.inTime) + " → " + fmt(r.outTime) + "]<br>" +
                            escHtml(r.issues.join(" · ")) + "<br>" +
                            "<span class='validator-context'>IN: ..." + escHtml(r.contextBeforeIn) + " | <strong>" + escHtml(r.contextAfterIn) + "</strong>...</span><br>" +
                            "<span class='validator-context'>OUT: ...<strong>" + escHtml(r.contextBeforeOut) + "</strong> | " + escHtml(r.contextAfterOut) + "...</span>" +
                        "</div>" +
                    "</div>"
                );
            }
        }

        var summary = document.getElementById("validator-summary");
        if (summary) {
            var pickupCount = 0;
            for (i = 0; i < pickups.length; i++) if (pickups[i].type === "pickup") pickupCount++;
            summary.textContent = pickupCount + " repeticiones · " + snaps.length + " ajustes de borde · " +
                toReview.length + " fronteras a revisar";
            summary.classList.remove("hidden");
        }

        var applyAllBtn = document.getElementById("btn-validator-apply-all");
        if (applyAllBtn) {
            if (pendingCount > 0) {
                applyAllBtn.classList.remove("hidden");
                applyAllBtn.textContent = "Aplicar todos (" + pendingCount + ")";
            } else {
                applyAllBtn.classList.add("hidden");
            }
        }

        if (html.length === 0) {
            html.push("<div class='validator-item ok'><div class='validator-item-text'>✓ Sin repeticiones ni ajustes pendientes. Los cortes se ven limpios.</div></div>");
        }

        container.innerHTML = html.join("");

        // Bind de botones Aplicar (delegación simple por re-render)
        var btns = container.querySelectorAll(".validator-apply-btn");
        for (var b = 0; b < btns.length; b++) {
            (function(btn) {
                btn.addEventListener("click", function() {
                    var kind = btn.getAttribute("data-kind");
                    var idx = parseInt(btn.getAttribute("data-idx"), 10);
                    if (kind === "pickup") applyPickup(idx);
                    else applySnap(idx);
                });
            })(btns[b]);
        }
    }

    // ─── Expose ──────────────────────────────────────────────

    EP.validator = {
        init: _initRefs,
        run: runValidation,
        applyAll: applyAll
    };

})(window);
