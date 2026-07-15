/**
 * modal.js — Info modal and transcript export instructions
 * Exposes: window.showInfoModal, window.hideInfoModal, window.showTranscriptExportInstructions
 */
(function(global) {
    "use strict";

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

    function showTranscriptExportInstructions() {
        var state = global._epState;
        // esc may not be set yet if modal.js loads before init.js — inline fallback
        var escFn = global._epEsc || function(s) {
            if (!s) return "";
            return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        };
        var seqName = state ? (state.sequenceName || "tu secuencia") : "tu secuencia";
        showInfoModal("Cómo exportar el transcript de Premiere", [
            '<p>Para importar el transcript de la secuencia activa, primero debes exportarlo desde Premiere:</p>',
            '<ol>',
            '<li>Abre el panel <span class="info-step-highlight">Text</span> en Premiere Pro</li>',
            '<li>Ve a la pestaña <span class="info-step-highlight">Transcript</span></li>',
            '<li>Verifica que esté seleccionada la secuencia correcta: <span class="info-path">' + escFn(seqName) + '</span></li>',
            '<li>Haz clic en el menú <span class="info-step-highlight">...</span> (tres puntos)</li>',
            '<li>Selecciona <span class="info-step-highlight">Export transcript (JSON)...</span></li>',
            '<li>Guárdalo con el nombre de la secuencia</li>',
            '</ol>',
            '<div class="info-note">',
            '<strong>Tip:</strong> Una vez exportado, haz clic en <strong>Cargar transcript JSON</strong> para seleccionar el archivo, o guárdalo en la carpeta <span class="info-path">Transcribe/</span> junto al proyecto y se cargará automáticamente al cambiar de secuencia.',
            '</div>'
        ].join(""));
    }

    global.showInfoModal = showInfoModal;
    global.hideInfoModal = hideInfoModal;
    global.showTranscriptExportInstructions = showTranscriptExportInstructions;
    global._epShowInfoModal = showInfoModal;
    global._epHideInfoModal = hideInfoModal;
    global._epShowTranscriptExportInstructions = showTranscriptExportInstructions;

})(window);
