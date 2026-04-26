/**
 * utils.js — Shared utility functions for Editor-Pro
 * No dependencies on app state — safe to load first.
 * Exposes: window.EPUtils and backward-compat window._ep* bindings
 */
(function(global) {
    "use strict";

    // ─── DOM helpers ──────────────────────────────────────────────

    function on(id, evt, fn) {
        var el = document.getElementById(id);
        if (el) el.addEventListener(evt, fn);
    }

    function clearContainer(el) {
        if (!el) return el;
        var clone = el.cloneNode(false);
        if (el.parentNode) el.parentNode.replaceChild(clone, el);
        return clone;
    }

    function safeCallback(fn) {
        return function() {
            try {
                return fn.apply(this, arguments);
            } catch(e) {
                console.error("[Editor-Pro] Callback error:", e);
                showToast("Error interno: " + (e.message || e), "error");
            }
        };
    }

    function showToast(msg, type) {
        var toast = document.getElementById("toast");
        if (!toast) return;
        toast.textContent = msg;
        toast.className = "toast toast-" + type + " show";
        clearTimeout(toast._timeout);
        toast._timeout = setTimeout(function() { toast.classList.remove("show"); }, 3500);
    }

    function showElement(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.classList.remove("hidden");
        if (el.style.display === "none") el.style.display = "";
    }

    function hideElement(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.classList.add("hidden");
        if (el.classList.contains("rec-step")) el.style.display = "none";
    }

    function disableBtn(id) {
        var el = document.getElementById(id);
        if (el) { el.disabled = true; el.classList.add("btn-disabled"); }
    }

    function enableBtn(id) {
        var el = document.getElementById(id);
        if (el) { el.disabled = false; el.classList.remove("btn-disabled"); }
    }

    function setProgress(fillId, textId, pct, text) {
        var fill = document.getElementById(fillId);
        var label = document.getElementById(textId);
        if (fill) fill.style.width = Math.min(pct, 100) + "%";
        if (label && text != null) label.textContent = text;
    }

    // ─── String escaping ──────────────────────────────────────────

    function esc(str) {
        if (!str) return "";
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function escAttr(str) {
        if (!str) return "";
        return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function escExtend(str) {
        if (!str) return "";
        return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
    }

    // ─── Supertext helpers ────────────────────────────────────────

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

    function escSupertextHtml(str) {
        if (str === undefined || str === null) return "";
        var s = normalizeSupertextNewlines(str);
        return s.split(/\r?\n/).map(function(line) { return esc(line); }).join("<br>");
    }

    // ─── Time formatting ──────────────────────────────────────────

    function pad2(n) { return (n < 10 ? "0" : "") + n; }
    function pad3(n) { return (n < 10 ? "00" : n < 100 ? "0" : "") + n; }

    function secsToSRTTime(secs) {
        var h = Math.floor(secs / 3600);
        var m = Math.floor((secs % 3600) / 60);
        var s = Math.floor(secs % 60);
        var ms = Math.floor((secs % 1) * 1000);
        return pad2(h) + ":" + pad2(m) + ":" + pad2(s) + "," + pad3(ms);
    }

    function formatTime(secs) {
        var m = Math.floor(secs / 60);
        var s = Math.floor(secs % 60);
        return m + ":" + (s < 10 ? "0" : "") + s;
    }

    /** Format elapsed seconds as human-readable duration: "45s", "2m 15s", "1h 3m" */
    function formatElapsed(secs) {
        secs = Math.round(secs);
        if (secs < 60) return secs + "s";
        var m = Math.floor(secs / 60);
        var s = secs % 60;
        if (m < 60) return s > 0 ? m + "m " + s + "s" : m + "m";
        var h = Math.floor(m / 60);
        m = m % 60;
        return m > 0 ? h + "h " + m + "m" : h + "h";
    }

    function formatTimeFull(secs) {
        var h = Math.floor(secs / 3600);
        var m = Math.floor((secs % 3600) / 60);
        var s = Math.floor(secs % 60);
        if (h > 0) return h + ":" + (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
        return m + ":" + (s < 10 ? "0" : "") + s;
    }

    // ─── String utilities ─────────────────────────────────────────

    function truncate(str, maxLen) {
        return str.length <= maxLen ? str : str.substring(0, maxLen - 3) + "...";
    }

    function formatFileSize(bytes) {
        if (!bytes) return "0 B";
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / 1048576).toFixed(1) + " MB";
    }

    // ─── Clipboard & navigation ───────────────────────────────────

    function copyToClipboard(text) {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try { document.execCommand("copy"); } catch(e) {}
        document.body.removeChild(ta);
    }

    function navigateToTime(seconds) {
        var cs = global._epCSInterface;
        if (cs) cs.evalScript("movePlayhead(" + seconds + ")", function() {});
    }

    // ─── Info modal ───────────────────────────────────────────────

    function showInfoModal(title, bodyHtml) {
        var overlay = document.getElementById("info-modal-overlay");
        var titleEl = document.getElementById("info-modal-title");
        var bodyEl = document.getElementById("info-modal-body");
        if (!overlay || !titleEl || !bodyEl) return;
        titleEl.textContent = title;
        bodyEl.innerHTML = bodyHtml;
        overlay.classList.remove("hidden");
    }

    function hideInfoModal() {
        var overlay = document.getElementById("info-modal-overlay");
        if (overlay) overlay.classList.add("hidden");
    }

    // ─── Section expand ───────────────────────────────────────────

    function expandSection(tool) {
        if (global.EditorProUI && global.EditorProUI.recording && global.EditorProUI.recording.expandSection) {
            return global.EditorProUI.recording.expandSection(tool);
        }
        var hdr = document.querySelector('[data-tool="' + tool + '"]');
        if (!hdr) return;
        var body = hdr.nextElementSibling;
        var icon = hdr.querySelector(".toggle-icon");
        if (body) body.classList.remove("hidden");
        if (icon) icon.textContent = "▾";
    }

    // ─── Expose API ───────────────────────────────────────────────

    global.EPUtils = {
        on: on,
        clearContainer: clearContainer,
        safeCallback: safeCallback,
        showToast: showToast,
        showElement: showElement,
        hideElement: hideElement,
        disableBtn: disableBtn,
        enableBtn: enableBtn,
        setProgress: setProgress,
        esc: esc,
        escAttr: escAttr,
        escExtend: escExtend,
        normalizeSupertextNewlines: normalizeSupertextNewlines,
        normalizeSt2Fields: normalizeSt2Fields,
        escSupertextHtml: escSupertextHtml,
        pad2: pad2,
        pad3: pad3,
        secsToSRTTime: secsToSRTTime,
        formatTime: formatTime,
        formatElapsed: formatElapsed,
        formatTimeFull: formatTimeFull,
        truncate: truncate,
        formatFileSize: formatFileSize,
        copyToClipboard: copyToClipboard,
        navigateToTime: navigateToTime,
        showInfoModal: showInfoModal,
        hideInfoModal: hideInfoModal,
        expandSection: expandSection
    };

    // Backward-compat window._ep* bindings (consumed by UI modules)
    global._epOn = on;
    global._epClearContainer = clearContainer;
    global._epSafeCallback = safeCallback;
    global._epShowToast = showToast;
    global._epShowElement = showElement;
    global._epHideElement = hideElement;
    global._epDisableBtn = disableBtn;
    global._epEnableBtn = enableBtn;
    global._epSetProgress = setProgress;
    global._epEsc = esc;
    global._epEscAttr = escAttr;
    global._epEscExtend = escExtend;
    global._epNormalizeSupertextNewlines = normalizeSupertextNewlines;
    global._epNormalizeSt2Fields = normalizeSt2Fields;
    global._epEscSupertextHtml = escSupertextHtml;
    global._epPad2 = pad2;
    global._epPad3 = pad3;
    global._epSecsToSRTTime = secsToSRTTime;
    global._epFormatTime = formatTime;
    global._epFormatTimeFull = formatTimeFull;
    global._epFormatElapsed = formatElapsed;
    global._epTruncate = truncate;
    global._epFormatFileSize = formatFileSize;
    global._epCopyToClipboard = copyToClipboard;
    global._epNavigateToTime = navigateToTime;
    global._epShowInfoModal = showInfoModal;
    global._epHideInfoModal = hideInfoModal;
    global._epExpandSection = expandSection;

})(window);
