/**
 * Editor-Pro — Cortes Automáticos 2 (CA2)
 *
 * Ejecuta los cortes por reconstrucción FCPXML en vez de QE extract:
 *   1. Lee marcadores IN/OUT de la secuencia activa (misma convención que el Cutter).
 *   2. Exporta la secuencia a xmeml (solo lectura, la original no se toca).
 *   3. Edita el XML con EPXmlCutEngine (elimina zonas con ripple en todas las pistas).
 *   4. Reimporta el XML como secuencia nueva "<nombre> - CA2" en un bin dedicado.
 *
 * Todo el proceso toma segundos, sin sleeps por zona ni QE.
 * Las anidaciones se detectan y se avisa antes de ejecutar: se reimportan
 * como copias en el bin CA2 (las originales quedan intactas).
 */

(function() {
    "use strict";

    var csInterface = new CSInterface();
    var fs, os;
    try { fs = require("fs"); os = require("os"); } catch(e) {}

    var SKIP_CLAPPERBOARD_KEY = "editorpro_skip_clapperboard";

    // ─── State ───────────────────────────────────────────────

    var state = {
        seqName: "",
        seqDuration: 0,
        keepBlocks: [],
        removeZones: [],
        warnings: [],
        analyzed: false,
        inspection: null,   // resultado de EPXmlCutEngine.inspect() del XML exportado
        executing: false,
        lastLog: []
    };

    // ─── DOM References ──────────────────────────────────────

    var dom = {
        skipClapperboard:  document.getElementById("cutter2-skip-clapperboard"),
        btnAnalyze:        document.getElementById("btn-cutter2-analyze"),
        progress:          document.getElementById("cutter2-progress"),
        progressFill:      document.getElementById("cutter2-progress-fill"),
        progressText:      document.getElementById("cutter2-progress-text"),
        emptyState:        document.getElementById("cutter2-empty"),
        results:           document.getElementById("cutter2-results"),
        keepDuration:      document.getElementById("cutter2-keep-duration"),
        keepBlocks:        document.getElementById("cutter2-keep-blocks"),
        removeDuration:    document.getElementById("cutter2-remove-duration"),
        removeBlocks:      document.getElementById("cutter2-remove-blocks"),
        nestCount:         document.getElementById("cutter2-nest-count"),
        nestDetail:        document.getElementById("cutter2-nest-detail"),
        nestWarning:       document.getElementById("cutter2-nest-warning"),
        blockList:         document.getElementById("cutter2-block-list"),
        warningsBox:       document.getElementById("cutter2-warnings"),
        btnExecute:        document.getElementById("btn-cutter2-execute"),
        resultDone:        document.getElementById("cutter2-result-done"),
        resultMsg:         document.getElementById("cutter2-result-msg"),
        resultDetail:      document.getElementById("cutter2-result-detail"),
        btnCopyLog:        document.getElementById("btn-cutter2-copy-log"),
        btnBack:           document.getElementById("btn-cutter2-back"),
        confirmOverlay:    document.getElementById("cutter2-confirm-overlay"),
        confirmMsg:        document.getElementById("cutter2-confirm-msg"),
        btnCancel:         document.getElementById("btn-cutter2-cancel"),
        btnConfirm:        document.getElementById("btn-cutter2-confirm"),
        toast:             document.getElementById("toast")
    };

    // ─── Helpers ─────────────────────────────────────────────

    function log(msg) {
        state.lastLog.push(msg);
        if (window.EPLogger) {
            try { EPLogger.log("cutter2", "log", msg); } catch(e) {}
        }
    }

    function showToast(msg, type) {
        type = type || "info";
        dom.toast.textContent = msg;
        dom.toast.className = "toast toast-" + type + " show";
        setTimeout(function() { dom.toast.className = "toast"; }, 3000);
    }

    function formatTime(seconds) {
        var s = Math.max(0, Math.round(seconds));
        var h = Math.floor(s / 3600);
        var m = Math.floor((s % 3600) / 60);
        var sec = s % 60;
        function pad(n) { return n < 10 ? "0" + n : "" + n; }
        if (h > 0) return h + ":" + pad(m) + ":" + pad(sec);
        return m + ":" + pad(sec);
    }

    function escExtend(p) {
        return String(p).replace(/\\/g, "/").replace(/'/g, "\\'");
    }

    function escHtml(s) {
        if (window.EPUtils && EPUtils.escapeHtml) return EPUtils.escapeHtml(s);
        return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function evalScript(script, callback) {
        csInterface.evalScript(script, function(result) {
            var data;
            try {
                data = JSON.parse(result);
            } catch(e) {
                data = { error: "Error parsing response: " + result };
            }
            if (callback) callback(data);
        });
    }

    function setProgress(pct, text) {
        dom.progress.classList.remove("hidden");
        dom.progressFill.style.width = pct + "%";
        dom.progressText.textContent = text;
    }

    function hideProgress() {
        dom.progress.classList.add("hidden");
    }

    function show(el) { if (el) el.classList.remove("hidden"); }
    function hide(el) { if (el) el.classList.add("hidden"); }

    // ─── Marker Parsing (misma convención que el Cutter clásico) ──

    function isOutMarker(marker) {
        var c = (marker.comments || "").trim();
        return c.indexOf("OUT:") === 0;
    }

    function parseMarkers(markers, seqDuration) {
        if (!markers || markers.length === 0) {
            return { keepBlocks: [], removeZones: [], warnings: [], error: "No se encontraron marcadores." };
        }

        markers.sort(function(a, b) { return a.startSeconds - b.startSeconds; });

        var skipClapperboard = true;
        try {
            var stored = localStorage.getItem(SKIP_CLAPPERBOARD_KEY);
            if (stored !== null) skipClapperboard = stored !== "false";
        } catch(_e) {}
        var working = skipClapperboard ? markers.slice(1) : markers.slice(0);

        if (working.length === 0) {
            return { keepBlocks: [], removeZones: [], warnings: [], error: "Solo se encontró el marcador de claqueta." };
        }

        var keepBlocks = [];
        var warnings = [];
        var currentIn = null;

        for (var i = 0; i < working.length; i++) {
            var m = working[i];
            if (isOutMarker(m)) {
                if (currentIn !== null) {
                    keepBlocks.push({
                        inTime: currentIn.startSeconds,
                        outTime: m.startSeconds,
                        inName: currentIn.name || "",
                        inComment: currentIn.comments || ""
                    });
                    currentIn = null;
                } else {
                    warnings.push("OUT huérfano en " + formatTime(m.startSeconds) + " (sin IN previo)");
                }
            } else {
                if (currentIn !== null) {
                    warnings.push("IN huérfano en " + formatTime(currentIn.startSeconds) + " (seguido de otro IN)");
                }
                currentIn = m;
            }
        }
        if (currentIn !== null) {
            warnings.push("IN huérfano en " + formatTime(currentIn.startSeconds) + " (sin OUT de cierre)");
        }

        if (keepBlocks.length === 0) {
            return { keepBlocks: [], removeZones: [], warnings: warnings, error: "No se encontraron pares IN/OUT válidos." };
        }

        var removeZones = [];
        if (keepBlocks[0].inTime > 0.1) {
            removeZones.push({ start: 0, end: keepBlocks[0].inTime, label: "Pre-inicio" });
        }
        for (var k = 0; k < keepBlocks.length - 1; k++) {
            var gapStart = keepBlocks[k].outTime;
            var gapEnd = keepBlocks[k + 1].inTime;
            if (gapEnd - gapStart > 0.05) {
                removeZones.push({ start: gapStart, end: gapEnd, label: "Brecha " + (k + 1) });
            }
        }
        var lastOut = keepBlocks[keepBlocks.length - 1].outTime;
        if (seqDuration > 0 && seqDuration - lastOut > 0.1) {
            removeZones.push({ start: lastOut, end: seqDuration, label: "Post-final" });
        }

        return { keepBlocks: keepBlocks, removeZones: removeZones, warnings: warnings, error: null };
    }

    // ─── Analyze ─────────────────────────────────────────────

    function tempXmlPath(suffix) {
        var dir = os ? os.tmpdir() : "/tmp";
        return dir.replace(/\\/g, "/") + "/editorpro_ca2_" + Date.now() + (suffix || "") + ".xml";
    }

    function analyze() {
        if (!fs) {
            showToast("Node.js no disponible en el panel — CA2 requiere acceso a archivos", "error");
            return;
        }
        state.lastLog = [];
        state.analyzed = false;
        state.inspection = null;
        hide(dom.results);
        hide(dom.resultDone);
        hide(dom.emptyState);
        setProgress(10, "Leyendo secuencia activa...");

        evalScript("getActiveSequenceInfo()", function(info) {
            if (info.error) {
                hideProgress();
                show(dom.emptyState);
                showToast(info.error, "error");
                return;
            }
            state.seqName = info.name;
            state.seqDuration = info.durationSeconds || 0;
            log("Secuencia: " + info.name + " (" + state.seqDuration.toFixed(2) + "s)");

            setProgress(30, "Leyendo marcadores...");
            evalScript("getSequenceMarkers()", function(data) {
                if (data.error) {
                    hideProgress();
                    show(dom.emptyState);
                    showToast(data.error, "error");
                    return;
                }

                var result = parseMarkers(data.markers, state.seqDuration);
                if (result.error) {
                    hideProgress();
                    show(dom.emptyState);
                    showToast(result.error, "error");
                    return;
                }

                state.keepBlocks = result.keepBlocks;
                state.removeZones = result.removeZones;
                state.warnings = result.warnings;
                log("Bloques keep: " + result.keepBlocks.length + " | Zonas remove: " + result.removeZones.length);

                // Exportar XML para inspección previa (nests, remaps, fps)
                setProgress(60, "Exportando XML para inspección...");
                var xmlPath = tempXmlPath("_inspect");
                evalScript("ca2ExportSequenceXML('" + escExtend(xmlPath) + "')", function(exp) {
                    if (exp.error) {
                        hideProgress();
                        show(dom.emptyState);
                        showToast("Error al exportar XML: " + exp.error, "error");
                        log("Export ERROR: " + exp.error);
                        return;
                    }
                    log("XML exportado: " + exp.path + " (" + exp.fileSize + " bytes)");

                    var inspection = null;
                    try {
                        var xmlContent = fs.readFileSync(xmlPath, "utf8");
                        inspection = EPXmlCutEngine.inspect(xmlContent);
                    } catch(e) {
                        log("Inspección ERROR: " + e.message);
                    }
                    try { fs.unlinkSync(xmlPath); } catch(_e) {}

                    if (!inspection || !inspection.ok) {
                        hideProgress();
                        show(dom.emptyState);
                        showToast("No se pudo inspeccionar el XML: " + (inspection ? inspection.error : "error de lectura"), "error");
                        return;
                    }

                    state.inspection = inspection;
                    log("Inspección: fps=" + inspection.fps.toFixed(3) + " clips=" + inspection.clipCount +
                        " nests=" + inspection.nestedClips.length + " remaps=" + inspection.remappedClips.length);

                    state.analyzed = true;
                    hideProgress();
                    renderResults();
                });
            });
        });
    }

    // ─── Render ──────────────────────────────────────────────

    function renderResults() {
        var totalKeep = 0;
        var totalRemove = 0;
        var i;
        for (i = 0; i < state.keepBlocks.length; i++) {
            totalKeep += state.keepBlocks[i].outTime - state.keepBlocks[i].inTime;
        }
        for (i = 0; i < state.removeZones.length; i++) {
            totalRemove += state.removeZones[i].end - state.removeZones[i].start;
        }

        dom.keepDuration.textContent = formatTime(totalKeep);
        dom.keepBlocks.textContent = state.keepBlocks.length + " bloques";
        dom.removeDuration.textContent = formatTime(totalRemove);
        dom.removeBlocks.textContent = state.removeZones.length + " zonas";

        var nests = state.inspection ? state.inspection.nestedClips.length : 0;
        dom.nestCount.textContent = String(nests);
        dom.nestDetail.textContent = nests === 1 ? "anidación" : "anidaciones";

        if (nests > 0) {
            dom.nestWarning.innerHTML =
                "<strong>" + nests + " anidación(es) detectada(s).</strong> " +
                "Al reimportar, Premiere crea <em>copias</em> de las secuencias anidadas en el bin CA2. " +
                "Las originales no se tocan, pero la secuencia cortada referenciará las copias.";
            show(dom.nestWarning);
        } else {
            hide(dom.nestWarning);
        }

        // Warnings de marcadores + remaps
        var warnHtml = [];
        for (i = 0; i < state.warnings.length; i++) {
            warnHtml.push("<div class='cutter2-warning-item'>⚠ " + escHtml(state.warnings[i]) + "</div>");
        }
        if (state.inspection && state.inspection.remappedClips.length > 0) {
            var names = [];
            for (i = 0; i < state.inspection.remappedClips.length; i++) {
                names.push(state.inspection.remappedClips[i].name);
            }
            warnHtml.push("<div class='cutter2-warning-item'>⚠ Clips con velocidad modificada: " + escHtml(names.join(", ")) +
                ". Si un corte cae sobre uno de ellos, la ejecución se detendrá.</div>");
        }
        dom.warningsBox.innerHTML = warnHtml.join("");
        if (warnHtml.length > 0) show(dom.warningsBox); else hide(dom.warningsBox);

        // Lista de bloques (keep + remove intercalados por tiempo)
        var entries = [];
        for (i = 0; i < state.keepBlocks.length; i++) {
            var kb = state.keepBlocks[i];
            entries.push({ start: kb.inTime, end: kb.outTime, keep: true, label: kb.inName || ("Bloque " + (i + 1)) });
        }
        for (i = 0; i < state.removeZones.length; i++) {
            var rz = state.removeZones[i];
            entries.push({ start: rz.start, end: rz.end, keep: false, label: rz.label });
        }
        entries.sort(function(a, b) { return a.start - b.start; });

        var html = [];
        for (i = 0; i < entries.length; i++) {
            var e = entries[i];
            html.push(
                "<div class='block-item " + (e.keep ? "keep" : "remove") + "'>" +
                    "<span class='block-badge'>" + (e.keep ? "KEEP" : "CUT") + "</span>" +
                    "<div class='block-info'>" +
                        "<div class='block-comment'>" + escHtml(e.label) + "</div>" +
                        "<div class='block-time'>" + formatTime(e.start) + " → " + formatTime(e.end) +
                        " <span class='block-duration'>(" + formatTime(e.end - e.start) + ")</span></div>" +
                    "</div>" +
                "</div>"
            );
        }
        dom.blockList.innerHTML = html.join("");

        show(dom.results);
    }

    // ─── Execute ─────────────────────────────────────────────

    function requestExecute() {
        if (!state.analyzed || state.removeZones.length === 0) {
            showToast("Primero analiza los marcadores", "info");
            return;
        }
        if (state.executing) return;

        var totalRemove = 0;
        for (var i = 0; i < state.removeZones.length; i++) {
            totalRemove += state.removeZones[i].end - state.removeZones[i].start;
        }
        var pct = state.seqDuration > 0 ? Math.round((totalRemove / state.seqDuration) * 100) : 0;
        var nests = state.inspection ? state.inspection.nestedClips.length : 0;

        var msg = "Se creará una secuencia nueva \"" + state.seqName + " - CA2\" con " +
            state.removeZones.length + " zonas eliminadas (" + formatTime(totalRemove) + ", " + pct + "% del total). " +
            "La secuencia original NO se modifica.";
        if (nests > 0) {
            msg += " Atención: " + nests + " anidación(es) se reimportarán como copias en el bin CA2.";
        }
        dom.confirmMsg.textContent = msg;
        show(dom.confirmOverlay);
    }

    function execute() {
        hide(dom.confirmOverlay);
        if (state.executing) return;
        state.executing = true;
        var startedAt = Date.now();

        hide(dom.results);
        hide(dom.resultDone);

        var timeTag = (function() {
            var d = new Date();
            function pad(n) { return n < 10 ? "0" + n : "" + n; }
            return pad(d.getHours()) + "-" + pad(d.getMinutes()) + "-" + pad(d.getSeconds());
        })();
        var newName = state.seqName + " - CA2 " + timeTag;
        var binName = "CA2 - " + new Date().toISOString().slice(0, 10);

        setProgress(10, "Verificando secuencia activa...");

        // Re-verificar que la secuencia activa siga siendo la analizada y su duración no cambió
        evalScript("getActiveSequenceInfo()", function(info) {
            if (info.error) return failExecute(info.error);
            if (info.name !== state.seqName) {
                return failExecute("La secuencia activa cambió (\"" + info.name + "\"). Vuelve a analizar.");
            }
            if (Math.abs((info.durationSeconds || 0) - state.seqDuration) > 0.5) {
                return failExecute("La duración de la secuencia cambió desde el análisis. Vuelve a analizar.");
            }

            setProgress(25, "Exportando secuencia a XML...");
            var srcPath = tempXmlPath("_src");
            evalScript("ca2ExportSequenceXML('" + escExtend(srcPath) + "')", function(exp) {
                if (exp.error) return failExecute("Error al exportar: " + exp.error);
                log("Export OK: " + exp.path);

                setProgress(50, "Aplicando cortes al XML...");
                var xmlContent;
                try {
                    xmlContent = fs.readFileSync(srcPath, "utf8");
                } catch(e) {
                    return failExecute("No se pudo leer el XML exportado: " + e.message);
                }

                var res = EPXmlCutEngine.applyCuts(xmlContent, state.removeZones, {
                    newName: newName,
                    allowLargeRemoval: true // ya confirmado por el usuario en el diálogo
                });

                if (!res.ok) {
                    try { fs.unlinkSync(srcPath); } catch(_e) {}
                    return failExecute(res.error);
                }

                var rep = res.report;
                log("Motor XML: " + rep.deletedClips + " eliminados, " + rep.trimmedClips + " recortados, " +
                    rep.splitClips + " divididos, " + rep.shiftedClips + " desplazados, " +
                    rep.deletedTransitions + " transiciones fuera, " +
                    rep.deletedMarkers + " marcadores fuera. Nueva duración: " + rep.newDurationSeconds.toFixed(2) + "s");
                for (var w = 0; w < rep.warnings.length; w++) log("WARN: " + rep.warnings[w]);

                var cutPath = tempXmlPath("_cut");
                try {
                    fs.writeFileSync(cutPath, res.xml, "utf8");
                } catch(e2) {
                    return failExecute("No se pudo escribir el XML editado: " + e2.message);
                }
                try { fs.unlinkSync(srcPath); } catch(_e2) {}

                setProgress(75, "Importando secuencia cortada...");
                evalScript("ca2ImportSequenceXML('" + escExtend(cutPath) + "', '" + escExtend(binName) + "', '" + escExtend(newName) + "')", function(imp) {
                    try { fs.unlinkSync(cutPath); } catch(_e3) {}
                    if (imp.error) return failExecute("Error al importar: " + imp.error);

                    var elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
                    var expected = rep.newDurationSeconds;
                    var obtained = imp.durationSeconds || 0;
                    var durMatch = Math.abs(expected - obtained) < 1.0;

                    log("Import OK: \"" + imp.name + "\" en bin \"" + imp.binName + "\" (" + elapsed + "s)");
                    if (imp.nestedCopies && imp.nestedCopies.length > 0) {
                        log("Copias de anidaciones: " + imp.nestedCopies.join(", "));
                    }

                    state.executing = false;
                    hideProgress();
                    dom.resultMsg.textContent = "Secuencia \"" + imp.name + "\" creada en " + elapsed + "s";
                    var detail = [];
                    detail.push("Bin: " + imp.binName);
                    detail.push("Duración: " + formatTime(obtained) + (durMatch ? " ✓ coincide con lo esperado" : " ⚠ esperado " + formatTime(expected)));
                    detail.push("Clips: " + rep.deletedClips + " eliminados, " + rep.trimmedClips + " recortados, " + rep.splitClips + " divididos");
                    if (rep.deletedTransitions > 0) detail.push("Transiciones eliminadas en cortes: " + rep.deletedTransitions);
                    if (imp.nestedCopies && imp.nestedCopies.length > 0) {
                        detail.push("Anidaciones copiadas al bin CA2: " + imp.nestedCopies.join(", "));
                    }
                    detail.push("La secuencia original \"" + state.seqName + "\" quedó intacta.");
                    dom.resultDetail.innerHTML = detail.map(function(d) { return "<div>" + escHtml(d) + "</div>"; }).join("");
                    show(dom.resultDone);
                    showToast("Cortes ejecutados en " + elapsed + "s", "success");
                });
            });
        });
    }

    function failExecute(msg) {
        state.executing = false;
        hideProgress();
        show(dom.results);
        showToast(msg, "error");
        log("ERROR: " + msg);
    }

    // ─── Copy Log ────────────────────────────────────────────

    function copyLog() {
        var text = state.lastLog.join("\n");
        if (!text) {
            showToast("No hay log para copiar", "info");
            return;
        }
        try {
            var ta = document.createElement("textarea");
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            showToast("Log copiado", "success");
        } catch(e) {
            showToast("No se pudo copiar el log", "error");
        }
    }

    function goBack() {
        hide(dom.resultDone);
        if (state.analyzed) show(dom.results);
        else show(dom.emptyState);
    }

    // ─── Bindings ────────────────────────────────────────────

    function bindEvents() {
        if (dom.btnAnalyze) dom.btnAnalyze.addEventListener("click", analyze);
        if (dom.btnExecute) dom.btnExecute.addEventListener("click", requestExecute);
        if (dom.btnConfirm) dom.btnConfirm.addEventListener("click", execute);
        if (dom.btnCancel) dom.btnCancel.addEventListener("click", function() { hide(dom.confirmOverlay); });
        if (dom.btnCopyLog) dom.btnCopyLog.addEventListener("click", copyLog);
        if (dom.btnBack) dom.btnBack.addEventListener("click", goBack);

        if (dom.skipClapperboard) {
            try {
                var stored = localStorage.getItem(SKIP_CLAPPERBOARD_KEY);
                dom.skipClapperboard.checked = stored === null ? true : stored !== "false";
            } catch(_e) {}
            dom.skipClapperboard.addEventListener("change", function() {
                try { localStorage.setItem(SKIP_CLAPPERBOARD_KEY, dom.skipClapperboard.checked ? "true" : "false"); } catch(_e) {}
            });
        }
    }

    // ─── Init ────────────────────────────────────────────────

    bindEvents();

})();
