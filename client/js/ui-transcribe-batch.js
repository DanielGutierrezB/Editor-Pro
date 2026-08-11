/**
 * ui-transcribe-batch.js — Transcribir secuencias (clase actual o batch) desde
 * la card de Transcripción, guardar cada transcript listo, y abrir/editar los
 * guardados para corregir palabras.
 *
 * DOM IDs prefijados tb-*. Expone window.EditorProUI.transcribeBatch.
 *
 * - Usa el mismo pipeline STT que el resto (el modelo/proveedor configurado en
 *   Ajustes). Siempre transcribe el audio COMPLETO (no por ventanas), porque el
 *   objetivo es dejar un transcript de la clase entero.
 * - Guarda <seq>.json (normalizado {words,text,language} + metadatos) y
 *   <seq>.srt en la carpeta Transcribe/ del proyecto, con los mismos nombres
 *   que auto-carga la card de Transcripción (transcript-cache).
 * - La edición vuelca el texto corregido sobre words[] preservando timings
 *   (EPTranscriptEdit.alignEditedWords), que es de lo que dependen Cutter,
 *   Revisar Marcadores y Notas de Grabación.
 */
(function(global) {
    "use strict";

    var EP = global.EditorProUI = global.EditorProUI || {};

    var csInterface, state, stt;
    var fs, path;
    try { fs = require("fs"); path = require("path"); } catch (e) {}

    // Misma versión de pipeline que Revisar Marcadores: marca los transcripts
    // guardados para poder invalidar cachés viejos si cambia el STT.
    var STT_PIPELINE_VERSION = 3;

    var tb = {
        busy: false,
        cancelled: false,
        batch: [],        // filas del preview [{seqId, seqName, isOpen, hasTranscript, checked, status, error}]
        results: [],
        editing: null     // {filePath, seqName, seqId, words, language, meta}
    };

    function $(id) { return document.getElementById(id); }

    function _initRefs() {
        csInterface = global._epCSInterface;
        state = global._epState;
        stt = global._epStt;
        bindEvents();
        // Poblar la biblioteca cuando el panel ya tiene carpeta conocida.
        setTimeout(refreshLibrary, 800);
    }

    // ─── Helpers ─────────────────────────────────────────────

    function showToast(msg, type) {
        if (global.EPUtils && global.EPUtils.showToast) return global.EPUtils.showToast(msg, type);
        var toast = $("toast");
        if (!toast) return;
        toast.textContent = msg;
        toast.className = "toast toast-" + (type || "info") + " show";
        setTimeout(function() { toast.className = "toast"; }, 3500);
    }

    function log(evt, msg) {
        if (global.EPLogger) EPLogger.log("transcribe-batch", evt, msg);
    }

    function escHtml(s) {
        if (global.EPUtils && global.EPUtils.escapeHtml) return global.EPUtils.escapeHtml(s);
        return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // ─── Íconos SVG (sin emojis) ─────────────────────────────
    function ICON_X() {
        return "<svg width='11' height='11' viewBox='0 0 12 12' fill='none' aria-hidden='true'>" +
            "<path d='M2 2l8 8M10 2l-8 8' stroke='currentColor' stroke-width='1.6' stroke-linecap='round'/></svg>";
    }
    function ICON_REFRESH() {
        return "<svg width='12' height='12' viewBox='0 0 12 12' fill='none' aria-hidden='true'>" +
            "<path d='M1.5 6A4.5 4.5 0 1 1 3 9.5' stroke='currentColor' stroke-width='1.2' stroke-linecap='round'/>" +
            "<path d='M1 4.5V7.5H4' stroke='currentColor' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/></svg>";
    }
    function ICON_CHECK() {
        return "<svg width='9' height='9' viewBox='0 0 12 12' fill='none' aria-hidden='true' style='vertical-align:-1px'>" +
            "<path d='M2 6.5L4.5 9L10 3' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/></svg>";
    }
    function ICON_CROSS() {
        return "<svg width='9' height='9' viewBox='0 0 12 12' fill='none' aria-hidden='true' style='vertical-align:-1px'>" +
            "<path d='M2.5 2.5l7 7M9.5 2.5l-7 7' stroke='currentColor' stroke-width='1.8' stroke-linecap='round'/></svg>";
    }

    function escExtend(p) { return String(p).replace(/\\/g, "/").replace(/'/g, "\\'"); }
    function escExtendStr(s) { return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }

    function evalScript(script, callback) {
        csInterface.evalScript(script, function(result) {
            var data;
            try { data = JSON.parse(result); } catch (e) {
                data = { error: "Respuesta inválida del host: " + String(result).slice(0, 120) };
            }
            if (callback) callback(data);
        });
    }

    function sanitizeBaseName(seqName) {
        return String(seqName).replace(/[\/\\:*?"<>|]/g, "_");
    }

    function folders() {
        if (global._epGetTranscriptFolders) {
            try { return global._epGetTranscriptFolders() || []; } catch (e) {}
        }
        var out = [];
        if (state && state.transcribeFolder) out.push(state.transcribeFolder);
        try {
            var saved = localStorage.getItem("editorpro_transcript_folder");
            if (saved && out.indexOf(saved) === -1) out.push(saved);
        } catch (e) {}
        return out;
    }

    function isCollapsed() {
        var body = $("transcript-body");
        return body && body.classList.contains("hidden");
    }

    function setProgress(pct, text) {
        var bar = $("tb-progress");
        if (bar) bar.classList.remove("hidden");
        var fill = $("tb-progress-fill");
        if (fill) fill.style.width = pct + "%";
        var txt = $("tb-progress-text");
        if (txt) txt.textContent = text;
        // Header progress (cuando la card está colapsada).
        var hdr = $("stt-progress-header-transcript");
        if (hdr) hdr.classList.toggle("hidden", !(tb.busy && isCollapsed()));
        var hf = $("stt-progress-header-fill-transcript");
        if (hf) hf.style.width = pct + "%";
        var ht = $("stt-progress-header-text-transcript");
        if (ht) ht.textContent = text;
    }

    function hideProgress() {
        var bar = $("tb-progress");
        if (bar) bar.classList.add("hidden");
        var hdr = $("stt-progress-header-transcript");
        if (hdr) hdr.classList.add("hidden");
    }

    function setButtonsEnabled(enabled) {
        ["btn-tb-current", "btn-tb-batch", "btn-tb-batch-run"].forEach(function(id) {
            var b = $(id);
            if (!b) return;
            b.disabled = !enabled;
            b.classList.toggle("btn-disabled", !enabled);
        });
    }

    function checkConfigured() {
        if (!stt) { showToast("STT no inicializado", "error"); return false; }
        if (!stt.isConfigured()) {
            var prov = state.settings.sttProvider;
            if (prov === "whisper_local") {
                showToast("Whisper local no configurado. Ejecuta whisper/setup-mlx.sh", "error");
            } else {
                var name = (global.SpeechToText && SpeechToText.PROVIDERS[prov]) ? SpeechToText.PROVIDERS[prov].name : prov;
                showToast("Configura tu API Key de " + name + " en Ajustes", "error");
            }
            return false;
        }
        return true;
    }

    // ─── Pipeline: exportar audio + transcribir (completo) ───

    /** @param {object} opts {stage} — ver saveTranscript. */
    function transcribeActiveSequence(seqName, seqId, onProgress, done, opts) {
        onProgress(5, "Buscando preset de audio...");
        evalScript("findOrCreateAudioPreset()", function(preset) {
            if (tb.cancelled) return done("cancelled");
            if (preset.error) return done(preset.error);
            var delay = preset.cached ? 100 : 2000;
            setTimeout(function() {
                if (tb.cancelled) return done("cancelled");
                onProgress(12, "Exportando audio de \"" + seqName + "\"...");
                var presetPath = String(preset.path).replace(/\\/g, "/");
                evalScript('exportSequenceAudio("' + escExtend(presetPath) + '")', function(exp) {
                    if (tb.cancelled) return done("cancelled");
                    if (exp.error) return done(exp.error);
                    if (state && exp.transcribeFolder) state.transcribeFolder = exp.transcribeFolder;

                    var effName = exp.sequenceName || seqName;
                    onProgress(20, "Transcribiendo \"" + effName + "\" (" + (stt.provider || "STT") + ")...");
                    stt.transcribe(exp.path, function(pct) {
                        onProgress(20 + Math.round(pct * 0.7), "Transcribiendo \"" + effName + "\"... " + pct + "%");
                    }, function(result) {
                        if (tb.cancelled) return done("cancelled");
                        if (result.error) return done("Error al transcribir: " + result.error);
                        if (!result.words || result.words.length === 0) return done("La transcripción no devolvió palabras.");
                        onProgress(95, "Guardando transcript...");
                        var saved = saveTranscript(effName, seqId || exp.sequenceID || "", exp, result, opts);
                        if (saved.error) return done("No se pudo guardar: " + saved.error);
                        done(null, {
                            seqName: effName,
                            filePath: saved.filePath,
                            words: result.words,
                            durationSeconds: exp.durationSeconds || 0
                        });
                    });
                });
            }, delay);
        });
    }

    /**
     * @param {object} opts {stage} — stage "cut" es el transcript de la secuencia YA
     *        cortada. Va a `<base>.cut.json`: si sobrescribiera el canónico, el
     *        transcript de la secuencia completa se perdería y la siguiente
     *        validación de marcadores los movería con los tiempos del corte, o sea a
     *        minutos de donde se habla.
     */
    function saveTranscript(seqName, seqId, exportInfo, result, opts) {
        if (!fs || !path) return { error: "Node.js (fs) no disponible" };
        var folder = (state && state.transcribeFolder) || (exportInfo && exportInfo.transcribeFolder);
        if (!folder) return { error: "Sin carpeta Transcribe/" };
        try {
            var stage = (opts && opts.stage) || "";
            var isCut = stage === "cut";
            var base = sanitizeBaseName(seqName);
            var suffix = isCut ? ".cut" : "";
            var jsonPath = path.join(folder, base + suffix + ".json");
            var srtPath = path.join(folder, base + suffix + ".srt");
            var now = new Date().toISOString();

            var words = result.words;
            try {
                if (global.SpeechToText && SpeechToText.cleanHallucinatedRepeats) {
                    words = SpeechToText.cleanHallucinatedRepeats(words);
                }
            } catch (e) {}

            var aligned = alignToAudio(words, {
                folder: folder,
                base: base,
                wavPath: (exportInfo && exportInfo.path) || "",
                durationSeconds: (exportInfo && exportInfo.durationSeconds) || 0,
                seqName: seqName
            });
            words = aligned.words;

            var text = result.text || wordsToPlainText(words);
            var payload = {
                words: words,
                alignedToAudio: aligned.ok,
                text: text,
                language: result.language || "es",
                partial: false,
                windows: null,
                savedBy: "transcribe-batch",
                pipelineVersion: STT_PIPELINE_VERSION,
                stage: stage || "full",
                sequenceName: seqName,
                sequenceID: seqId || "",
                durationSeconds: (exportInfo && exportInfo.durationSeconds) || 0,
                provider: (stt && stt.provider) || "",
                model: (stt && stt.model) || "",
                createdAt: now,
                updatedAt: now
            };

            fs.writeFileSync(jsonPath, JSON.stringify(payload), "utf8");
            try {
                var srt = stt.generateSRT({ words: words }, 8);
                fs.writeFileSync(srtPath, srt, "utf8");
            } catch (e) {}

            // El caché apunta al transcript de la secuencia completa: el del corte no
            // debe quedar ahí, porque de ahí lo saca la validación de marcadores.
            if (!isCut && state && state.transcriptCache) state.transcriptCache[seqName] = jsonPath;
            return { filePath: jsonPath };
        } catch (e) {
            return { error: e.message };
        }
    }

    /**
     * Los tiempos del STT, medidos contra el WAV en cada frontera de silencio.
     *
     * Por qué aquí y no solo al validar marcadores: medido sobre cuatro clases de un
     * mismo proyecto, el STT clava los FINALES de palabra (error mediano 2 frames) y
     * **adelanta los ARRANQUES tras un silencio** 8.5 frames de mediana, hasta 43 —
     * le da a la primera palabra el silencio que la precede, y estira más cuanto más
     * largo es ese silencio. Con eso, un IN colocado desde el transcript deja aire
     * muerto o arranca dos segundos antes de que hable nadie. Corregirlo una vez, al
     * guardar, deja los tiempos buenos para todo lo que viene después: cortes,
     * repeticiones, el editor al saltar a una palabra y los SRT.
     *
     * Si no hay WAV o el módulo no está, se guarda tal cual: nunca bloquea el guardado.
     * @returns {{words, ok, note}}
     */
    function alignToAudio(words, info) {
        var AO = global.EPAudioOnset;
        if (!AO || !AO.available()) return { words: words, ok: false, note: "" };

        var wav = null;
        try {
            if (info.wavPath && fs && fs.existsSync(info.wavPath)) {
                var meta = AO.wavInfo(info.wavPath);
                if (meta) wav = { file: info.wavPath, info: meta };
            }
            if (!wav) wav = AO.findWav(info.folder, info.base, info.durationSeconds);
        } catch (e) {}
        if (!wav) {
            log("align-skip", (info.seqName || "") + ": sin WAV, los tiempos quedan como los dio el STT");
            return { words: words, ok: false, note: "" };
        }

        try {
            var opts = {};
            var clean = AO.dropSilentWords(wav, words, opts);
            var res = AO.alignWords(wav, clean.words, opts);
            var st = res.stats;
            var note = st.movedStarts + " arranque(s) y " + st.movedEnds + " final(es) " +
                "movidos al sonido de " + st.runs + " tramo(s)" +
                (st.medianStartShift ? " · el STT se adelantaba " +
                    (st.medianStartShift * 1000).toFixed(0) + " ms de mediana" : "") +
                (clean.dropped.length ? " · " + clean.dropped.length +
                    " palabra(s) descartadas por no sonar" : "");
            log("align", (info.seqName || "") + ": " + note);
            return { words: res.words, ok: true, note: note };
        } catch (e) {
            log("align-error", e.message);
            return { words: words, ok: false, note: "" };
        }
    }

    function wordsToPlainText(words) {
        if (global.EPTranscriptEdit) return global.EPTranscriptEdit.wordsToText(words);
        return (words || []).map(function(w) { return w.text || w.word || ""; }).join(" ");
    }

    // ─── Transcribir clase actual ────────────────────────────

    function doCurrent() {
        if (tb.busy) { showToast("Ya hay una transcripción en curso", "info"); return; }
        if (!fs) { showToast("Node.js no disponible en el panel", "error"); return; }
        if (!checkConfigured()) return;

        evalScript("getActiveSequenceInfo()", function(info) {
            if (info.error) { showToast(info.error, "error"); return; }
            var seqName = info.name || "secuencia";
            var seqId = info.sequenceID || "";

            tb.busy = true; tb.cancelled = false;
            setButtonsEnabled(false);
            setStopVisible(true);
            setProgress(3, "Preparando \"" + seqName + "\"...");
            if (global.EPLogger) EPLogger.log("transcribe-batch", "current-start", seqName);

            transcribeActiveSequence(seqName, seqId, setProgress, function(err, res) {
                tb.busy = false;
                setButtonsEnabled(true);
                setStopVisible(false);
                hideProgress();
                if (err) {
                    if (err === "cancelled") { showToast("Transcripción detenida", "info"); return; }
                    if (global.EPLogger) EPLogger.error("transcribe-batch", "current", err);
                    showToast(err, "error");
                    return;
                }
                showToast("Transcript listo: " + res.seqName, "success");
                if (typeof playCompletionSound === "function") { try { playCompletionSound(); } catch (e) {} }
                refreshLibrary();
                openForEdit(res.filePath);
            });
        });
    }

    // ─── Batch: todas las secuencias abiertas ────────────────

    function doBatchList() {
        if (tb.busy) { showToast("Ya hay una transcripción en curso", "info"); return; }
        if (!fs) { showToast("Node.js no disponible en el panel", "error"); return; }
        if (!checkConfigured()) return;

        setButtonsEnabled(false);
        setProgress(5, "Buscando secuencias abiertas...");
        evalScript("getAllProjectSequences()", function(data) {
            setButtonsEnabled(true);
            hideProgress();
            if (data.error) { showToast(data.error, "error"); return; }
            var seqs = data.sequences || [];
            var rows = [];
            for (var i = 0; i < seqs.length; i++) {
                var s = seqs[i];
                if (data.probeReliable && !s.isOpen) continue;
                rows.push({
                    seqId: s.sequenceID,
                    seqName: s.name,
                    isOpen: !!s.isOpen,
                    hasTranscript: hasSavedTranscript(s.name),
                    checked: true,
                    status: "pending",
                    error: null
                });
            }
            if (rows.length === 0) {
                showToast(data.probeReliable
                    ? "No se encontraron secuencias abiertas en el timeline."
                    : "No hay secuencias en el proyecto.", "error");
                return;
            }
            rows.sort(function(a, b) { return a.seqName.localeCompare(b.seqName); });
            tb.batch = rows;
            renderBatchPreview();
        });
    }

    /**
     * Busca el transcript COMPLETO guardado de una secuencia (ignora los
     * parciales por ventanas de Revisar Marcadores).
     * @returns {{filePath, raw}|null}
     */
    function findSavedTranscript(seqName, opts) {
        if (!fs || !path) return null;
        var base = sanitizeBaseName(seqName);
        // stage "cut" busca el transcript de la secuencia ya cortada, que se guarda
        // aparte para no pisar el de la secuencia completa.
        if (opts && opts.stage === "cut") base += ".cut";
        var fs2 = folders();
        for (var i = 0; i < fs2.length; i++) {
            try {
                var p = path.join(fs2[i], base + ".json");
                if (fs.existsSync(p)) {
                    var raw = JSON.parse(fs.readFileSync(p, "utf8"));
                    if (raw && raw.words && raw.words.length > 5 && !raw.partial) {
                        return { filePath: p, raw: raw };
                    }
                }
            } catch (e) {}
        }
        return null;
    }

    function hasSavedTranscript(seqName) {
        return !!findSavedTranscript(seqName);
    }

    function renderBatchPreview() {
        var section = $("tb-batch-section");
        if (section) section.classList.remove("hidden");
        var list = $("tb-batch-list");
        if (!list) return;
        while (list.firstChild) list.removeChild(list.firstChild);
        for (var i = 0; i < tb.batch.length; i++) {
            list.appendChild(buildRow(tb.batch[i]));
        }
        updateBatchCount();
    }

    function buildRow(row) {
        var item = document.createElement("div");
        item.className = "batch-seq-item";
        if (row.status === "running") item.className += " tb-row-running";

        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "batch-seq-checkbox";
        cb.checked = row.checked;
        cb.disabled = tb.busy;
        cb.addEventListener("change", function() {
            row.checked = cb.checked;
            updateBatchCount();
        });

        var infoWrap = document.createElement("div");
        infoWrap.className = "batch-seq-info";
        var nameEl = document.createElement("div");
        nameEl.className = "batch-seq-name";
        nameEl.textContent = row.seqName;
        var metaEl = document.createElement("div");
        metaEl.className = "batch-seq-meta";
        infoWrap.appendChild(nameEl);
        infoWrap.appendChild(metaEl);
        row._metaEl = metaEl;

        var actions = document.createElement("div");
        actions.className = "tb-row-actions";
        if (row.status === "done" || row.status === "error") {
            var retry = document.createElement("button");
            retry.className = "btn btn-sm btn-ghost";
            retry.innerHTML = ICON_REFRESH();
            retry.title = "Reintentar esta secuencia";
            retry.disabled = tb.busy;
            retry.addEventListener("click", function() { retryRow(row.seqId); });
            actions.appendChild(retry);
        }
        var rm = document.createElement("button");
        rm.className = "btn btn-sm btn-ghost";
        rm.innerHTML = ICON_X();
        rm.title = "Quitar de la cola";
        rm.disabled = tb.busy;
        rm.addEventListener("click", function() { removeRow(row.seqId); });
        actions.appendChild(rm);

        item.appendChild(cb);
        item.appendChild(infoWrap);
        item.appendChild(actions);
        renderRowMeta(row);
        return item;
    }

    function renderRowMeta(row) {
        if (row._metaEl) row._metaEl.innerHTML = rowStatusHtml(row);
    }

    function rowStatusHtml(row) {
        if (row.status === "running") {
            var pct = row.progressPct || 0;
            var txt = row.progressText || "transcribiendo…";
            return "<div class='tb-row-prog'><div class='tb-row-prog-track'>" +
                "<div class='tb-row-prog-fill' style='width:" + pct + "%'></div></div>" +
                "<span class='tb-status tb-status-running'>" + escHtml(txt) + "</span></div>";
        }
        if (row.status === "done") return "<span class='tb-status tb-status-done'>" + ICON_CHECK() + " transcrita</span>";
        if (row.status === "error") return "<span class='tb-status tb-status-error'>" + ICON_CROSS() + " " + escHtml(row.error || "error") + "</span>";
        if (row.status === "skipped") return "<span class='tb-status'>omitida (ya tiene)</span>";
        if (row.hasTranscript) return "<span class='tb-status tb-status-has'>ya tiene transcript</span>";
        return "<span class='tb-status'>pendiente</span>";
    }

    function setRowProgress(row, pct, text) {
        row.status = "running";
        row.progressPct = pct;
        row.progressText = text;
        renderRowMeta(row);
    }

    function rowBySeqId(seqId) {
        for (var i = 0; i < tb.batch.length; i++) if (tb.batch[i].seqId === seqId) return tb.batch[i];
        return null;
    }

    function updateBatchCount() {
        var n = 0;
        for (var i = 0; i < tb.batch.length; i++) if (tb.batch[i].checked) n++;
        var el = $("tb-batch-count");
        if (el) el.textContent = String(n);
    }

    // Procesa UNA secuencia (compartido por la cola y por "reintentar").
    function runOne(row, prefix, cb) {
        row.status = "running"; row.error = null;
        row.progressPct = 0; row.progressText = "abriendo secuencia…";
        renderBatchPreview();
        // El export de audio requiere que la secuencia sea la activa.
        evalScript("openSequenceById('" + escExtendStr(row.seqId) + "')", function(openRes) {
            if (tb.cancelled) return cb("cancelled");
            if (openRes.error || !openRes.verified) {
                row.status = "error";
                row.error = openRes.error || "No se pudo abrir la secuencia";
                renderBatchPreview();
                return cb(row.error);
            }
            transcribeActiveSequence(row.seqName, row.seqId, function(pct, txt) {
                setRowProgress(row, pct, txt);
                setProgress(pct, prefix + row.seqName);
            }, function(err, res) {
                if (err === "cancelled") return cb("cancelled");
                if (err) { row.status = "error"; row.error = err; }
                else { row.status = "done"; row.hasTranscript = true; }
                renderBatchPreview();
                cb(err || null, res);
            });
        });
    }

    function doBatchRun() {
        if (tb.busy) return;
        var reTranscribe = $("tb-retranscribe") && $("tb-retranscribe").checked;
        var queue = [];
        for (var i = 0; i < tb.batch.length; i++) {
            var row = tb.batch[i];
            if (!row.checked) continue;
            if (row.hasTranscript && !reTranscribe) { row.status = "skipped"; continue; }
            row.status = "pending"; row.error = null; row.progressPct = 0;
            queue.push(row);
        }
        renderBatchPreview();
        if (queue.length === 0) {
            showToast("Nada seleccionado para transcribir (marca 'volver a transcribir' si ya tienen).", "info");
            return;
        }

        tb.busy = true; tb.cancelled = false;
        tb.results = [];
        setButtonsEnabled(false);
        setStopVisible(true);
        renderBatchPreview();
        if (global.EPLogger) EPLogger.log("transcribe-batch", "batch-start", queue.length + " secuencias");

        var qi = 0;
        function nextInQueue() {
            if (tb.cancelled) return finishBatch(true);
            if (qi >= queue.length) return finishBatch(false);
            var row = queue[qi];
            var prefix = "[" + (qi + 1) + "/" + queue.length + "] ";
            setProgress(2, prefix + row.seqName + "…");
            runOne(row, prefix, function(err, res) {
                if (err === "cancelled") return finishBatch(true);
                tb.results.push(err
                    ? { seqName: row.seqName, success: false, error: err }
                    : { seqName: (res && res.seqName) || row.seqName, success: true });
                qi++; nextInQueue();
            });
        }
        nextInQueue();
    }

    function retryRow(seqId) {
        if (tb.busy) { showToast("Espera a que termine la cola actual", "info"); return; }
        var row = rowBySeqId(seqId);
        if (!row) return;
        tb.busy = true; tb.cancelled = false;
        setButtonsEnabled(false);
        setStopVisible(true);
        renderBatchPreview();
        runOne(row, "", function(err) {
            tb.busy = false;
            setButtonsEnabled(true);
            setStopVisible(false);
            hideProgress();
            renderBatchPreview();
            refreshLibrary();
            if (err && err !== "cancelled") showToast("Error en " + row.seqName + ": " + err, "error");
            else if (!err) showToast("Transcript listo: " + row.seqName, "success");
        });
    }

    function removeRow(seqId) {
        if (tb.busy) return;
        for (var i = 0; i < tb.batch.length; i++) {
            if (tb.batch[i].seqId === seqId) { tb.batch.splice(i, 1); break; }
        }
        if (tb.batch.length === 0) {
            var section = $("tb-batch-section");
            if (section) section.classList.add("hidden");
        } else {
            renderBatchPreview();
        }
    }

    function finishBatch(cancelled) {
        tb.busy = false;
        tb.cancelled = false;
        setButtonsEnabled(true);
        setStopVisible(false);
        hideProgress();
        renderBatchPreview();
        refreshLibrary();
        var ok = 0, fail = 0;
        for (var i = 0; i < tb.results.length; i++) { if (tb.results[i].success) ok++; else fail++; }
        if (cancelled) {
            showToast("Batch detenido. " + ok + " transcritas, " + fail + " con error.", "info");
        } else {
            showToast("Batch listo: " + ok + " transcritas" + (fail ? ", " + fail + " con error" : "") + ".",
                fail ? "info" : "success");
            if (typeof playCompletionSound === "function") { try { playCompletionSound(); } catch (e) {} }
        }
        if (global.EPLogger) EPLogger.log("transcribe-batch", "batch-done", ok + " ok, " + fail + " error");
    }

    function stopAll() {
        if (!tb.busy) return;
        tb.cancelled = true;
        try { if (stt && stt.abort) stt.abort(); } catch (e) {}
        setProgress(100, "Deteniendo…");
    }

    function setStopVisible(visible) {
        var btn = $("btn-tb-stop");
        if (btn) btn.classList.toggle("hidden", !visible);
    }

    // ─── Biblioteca de transcripciones guardadas ─────────────

    function refreshLibrary() {
        var list = $("tb-library-list");
        if (!list) return;
        var items = scanLibrary();
        while (list.firstChild) list.removeChild(list.firstChild);

        if (items.length === 0) {
            var empty = document.createElement("div");
            empty.className = "tb-lib-empty";
            empty.textContent = "Sin transcripciones guardadas todavía.";
            list.appendChild(empty);
            return;
        }

        items.sort(function(a, b) { return (b.updatedAt || "").localeCompare(a.updatedAt || ""); });
        for (var i = 0; i < items.length; i++) {
            list.appendChild(renderLibItem(items[i]));
        }
    }

    function scanLibrary() {
        var out = [];
        if (!fs || !path) return out;
        var seen = {};
        var fs2 = folders();
        for (var f = 0; f < fs2.length; f++) {
            var folder = fs2[f];
            var names;
            try { names = fs.readdirSync(folder); } catch (e) { continue; }
            for (var i = 0; i < names.length; i++) {
                var name = names[i];
                if (!/\.json$/i.test(name)) continue;
                if (/\.review\.json$/i.test(name)) continue;
                var full = path.join(folder, name);
                if (seen[full]) continue;
                seen[full] = true;
                try {
                    var raw = JSON.parse(fs.readFileSync(full, "utf8"));
                    if (!raw || !raw.words || raw.words.length < 3) continue;
                    if (raw.partial) continue;
                    out.push({
                        filePath: full,
                        seqName: raw.sequenceName || name.replace(/\.json$/i, ""),
                        wordCount: raw.words.length,
                        language: raw.language || "",
                        durationSeconds: raw.durationSeconds || 0,
                        updatedAt: raw.updatedAt || raw.createdAt || "",
                        savedBy: raw.savedBy || "",
                        alignedToAudio: !!raw.alignedToAudio
                    });
                } catch (e) {}
            }
        }
        return out;
    }

    function renderLibItem(item) {
        var el = document.createElement("div");
        el.className = "tb-lib-item";
        if (tb.editing && tb.editing.filePath === item.filePath) el.className += " tb-lib-editing";

        var info = document.createElement("div");
        info.className = "tb-lib-info";
        var nameEl = document.createElement("div");
        nameEl.className = "tb-lib-name";
        nameEl.textContent = item.seqName;
        var metaEl = document.createElement("div");
        metaEl.className = "tb-lib-meta";
        metaEl.textContent = metaLine(item);
        info.appendChild(nameEl);
        info.appendChild(metaEl);

        var actions = document.createElement("div");
        actions.className = "tb-lib-actions";
        var openBtn = document.createElement("button");
        openBtn.className = "btn btn-sm btn-ghost";
        openBtn.textContent = "Abrir";
        openBtn.title = "Abrir para editar y corregir palabras";
        openBtn.addEventListener("click", function() { openForEdit(item.filePath); });
        var delBtn = document.createElement("button");
        delBtn.className = "btn btn-sm btn-ghost tb-btn-delete";
        delBtn.innerHTML = ICON_X();
        delBtn.title = "Borrar transcript";
        delBtn.addEventListener("click", function() { deleteTranscript(item); });
        actions.appendChild(openBtn);
        // Los transcripts hechos antes de la v2.17.0 llevan los tiempos crudos del STT:
        // el botón los mide contra el WAV sin volver a transcribir. Se ofrece también
        // en los ya alineados —medir dos veces no los mueve— para poder aprovechar las
        // mejoras de la medida sin rehacer la transcripción.
        var alignBtn = document.createElement("button");
        alignBtn.className = "btn btn-sm btn-ghost";
        alignBtn.textContent = item.alignedToAudio ? "Volver a alinear" : "Alinear al audio";
        alignBtn.title = "Corregir los tiempos midiendo el WAV (no vuelve a transcribir)";
        alignBtn.addEventListener("click", function() { realignTranscript(item, alignBtn); });
        actions.appendChild(alignBtn);
        actions.appendChild(delBtn);

        el.appendChild(info);
        el.appendChild(actions);
        return el;
    }

    function metaLine(item) {
        var parts = [];
        parts.push(item.wordCount + " palabras");
        if (item.durationSeconds) {
            var m = Math.floor(item.durationSeconds / 60);
            var s = Math.round(item.durationSeconds % 60);
            parts.push(m + ":" + (s < 10 ? "0" : "") + s);
        }
        if (item.language) parts.push(item.language);
        if (item.updatedAt) {
            var d = new Date(item.updatedAt);
            if (!isNaN(d.getTime())) parts.push(d.toLocaleDateString() + " " + d.toLocaleTimeString().slice(0, 5));
        }
        return parts.join(" · ");
    }

    /**
     * Alinea al audio un transcript ya guardado, sin volver a transcribir. El WAV se
     * busca por nombre base **exigiendo que la duración cuadre**, que es lo que evita
     * medir contra el audio de la secuencia ya cortada.
     */
    function realignTranscript(item, btn) {
        if (!fs || !path) return;
        var raw;
        try { raw = JSON.parse(fs.readFileSync(item.filePath, "utf8")); } catch (e) {
            showToast("No se pudo leer el transcript: " + e.message, "error");
            return;
        }
        var label = btn ? btn.textContent : "";
        if (btn) { btn.disabled = true; btn.textContent = "Alineando..."; }

        var base = path.basename(item.filePath).replace(/\.json$/i, "");
        var res = alignToAudio(raw.words, {
            folder: path.dirname(item.filePath),
            base: base.replace(/\.cut$/i, ""),
            wavPath: "",
            durationSeconds: raw.durationSeconds || item.durationSeconds || 0,
            seqName: item.seqName
        });
        if (!res.ok) {
            if (btn) { btn.disabled = false; btn.textContent = label; }
            showToast("Sin WAV que cuadre con esta secuencia: no se puede medir", "error");
            return;
        }

        raw.words = res.words;
        raw.alignedToAudio = true;
        raw.text = wordsToPlainText(res.words);
        raw.updatedAt = new Date().toISOString();
        try {
            fs.writeFileSync(item.filePath, JSON.stringify(raw), "utf8");
            try {
                fs.writeFileSync(item.filePath.replace(/\.json$/i, ".srt"),
                    stt.generateSRT({ words: res.words }, 8), "utf8");
            } catch (e2) {}
        } catch (e3) {
            if (btn) { btn.disabled = false; btn.textContent = label; }
            showToast("No se pudo guardar: " + e3.message, "error");
            return;
        }

        showToast("Tiempos alineados al audio: " + res.note, "success");
        if (tb.editing && tb.editing.filePath === item.filePath) openForEdit(item.filePath);
        refreshLibrary();
    }

    function deleteTranscript(item) {
        if (!fs) return;
        if (!confirm("¿Borrar el transcript de \"" + item.seqName + "\"? (elimina .json y .srt)")) return;
        try {
            if (fs.existsSync(item.filePath)) fs.unlinkSync(item.filePath);
            var srt = item.filePath.replace(/\.json$/i, ".srt");
            if (fs.existsSync(srt)) fs.unlinkSync(srt);
            if (state && state.transcriptCache && state.transcriptCache[item.seqName]) delete state.transcriptCache[item.seqName];
            if (tb.editing && tb.editing.filePath === item.filePath) exitEditMode();
            showToast("Transcript borrado", "success");
        } catch (e) {
            showToast("No se pudo borrar: " + e.message, "error");
        }
        refreshLibrary();
    }

    // ─── Abrir / editar / guardar correcciones ───────────────

    function openForEdit(filePath) {
        if (!fs) return;
        var raw;
        try { raw = JSON.parse(fs.readFileSync(filePath, "utf8")); } catch (e) {
            showToast("No se pudo abrir el transcript: " + e.message, "error");
            return;
        }
        if (!raw || !raw.words) { showToast("El archivo no tiene palabras válidas", "error"); return; }

        var seqName = raw.sequenceName || filePath.replace(/^.*[\/\\]/, "").replace(/\.json$/i, "");
        tb.editing = {
            filePath: filePath,
            seqName: seqName,
            seqId: raw.sequenceID || "",
            words: raw.words,
            language: raw.language || "es",
            meta: raw
        };

        renderEditor(raw.words);
        setEditorVisible(true);
        showEditBar(seqName);
        updateEditorInfo();
        refreshLibrary();

        var ed = $("tb-editor");
        if (ed && ed.scrollIntoView) { try { ed.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {} }
        showToast("Transcript abierto para editar: " + seqName, "success");
    }

    // ─── Editor tipo Descript (palabras clicables ligadas a tiempo) ───

    function numOr(v) {
        var n = (typeof v === "number") ? v : parseFloat(v);
        return isNaN(n) ? null : n;
    }

    function fmtTime(seconds) {
        var s = Math.max(0, Math.floor(seconds || 0));
        var m = Math.floor(s / 60);
        var ss = s % 60;
        return m + ":" + (ss < 10 ? "0" : "") + ss;
    }

    // Agrupa words[] en bloques legibles (párrafos), cortando por fin de
    // oración o por pausas largas — cada bloque ~ una idea / "clip".
    function groupWordsIntoBlocks(words) {
        var blocks = [], cur = null, prevEnd = null, prevTxt = "";
        var GAP = 0.7, MIN_WORDS = 8, MAX_WORDS = 45;
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            var txt = (w.text != null ? w.text : (w.word || ""));
            if (txt === "") continue;
            var start = numOr(w.start);
            if (cur && cur.words.length >= MIN_WORDS) {
                var endsSentence = /[.?!:…]["'”’)\]]?$/.test(prevTxt);
                var gap = (start != null && prevEnd != null) ? (start - prevEnd) : 0;
                if (endsSentence || gap >= GAP || cur.words.length >= MAX_WORDS) {
                    blocks.push(cur);
                    cur = null;
                }
            }
            if (!cur) cur = { start: (start != null ? start : 0), words: [] };
            cur.words.push({ i: i, text: txt, start: start });
            prevEnd = numOr(w.end);
            prevTxt = txt;
        }
        if (cur && cur.words.length) blocks.push(cur);
        return blocks;
    }

    function renderEditor(words) {
        var ed = $("tb-editor");
        if (!ed) return;
        while (ed.firstChild) ed.removeChild(ed.firstChild);
        tb._activeWordEl = null;

        var blocks = groupWordsIntoBlocks(words);
        for (var b = 0; b < blocks.length; b++) {
            var block = blocks[b];
            var row = document.createElement("div");
            row.className = "tb-block";

            var chip = document.createElement("span");
            chip.className = "tb-tc";
            chip.setAttribute("contenteditable", "false");
            chip.setAttribute("data-t", String(block.start));
            chip.textContent = fmtTime(block.start);
            chip.title = "Ir a este momento en la secuencia";
            row.appendChild(chip);

            var body = document.createElement("div");
            body.className = "tb-block-body";
            for (var k = 0; k < block.words.length; k++) {
                var wd = block.words[k];
                var span = document.createElement("span");
                span.className = "tb-w";
                span.setAttribute("data-i", String(wd.i));
                if (wd.start != null) span.setAttribute("data-t", String(wd.start));
                span.textContent = wd.text;
                body.appendChild(span);
                body.appendChild(document.createTextNode(" "));
            }
            row.appendChild(body);
            ed.appendChild(row);
        }
    }

    // Texto editado sin los chips de timecode (que no son parte del transcript).
    function readEditorText() {
        var ed = $("tb-editor");
        if (!ed) return "";
        var clone = ed.cloneNode(true);
        var chips = clone.querySelectorAll(".tb-tc");
        for (var i = 0; i < chips.length; i++) {
            if (chips[i].parentNode) chips[i].parentNode.removeChild(chips[i]);
        }
        return clone.textContent || "";
    }

    function onEditorClick(e) {
        var el = e.target;
        while (el && el !== this && !(el.getAttribute && el.getAttribute("data-t") != null)) el = el.parentNode;
        if (!el || el === this || !el.getAttribute) return;
        var t = el.getAttribute("data-t");
        if (t == null || t === "") return;
        if (el.classList && el.classList.contains("tb-w")) setActiveWord(el);
        seekTo(parseFloat(t));
    }

    function setActiveWord(el) {
        if (tb._activeWordEl && tb._activeWordEl !== el) {
            tb._activeWordEl.classList.remove("tb-w-active");
        }
        el.classList.add("tb-w-active");
        tb._activeWordEl = el;
    }

    function seekTo(seconds) {
        if (isNaN(seconds)) return;
        var seqId = (tb.editing && tb.editing.seqId) || "";
        var arg = seqId ? ("'" + escExtendStr(seqId) + "'") : "''";
        evalScript("seekSequenceToSeconds(" + seconds + ", " + arg + ")", function(r) {
            if (r && r.error && global.EPLogger) EPLogger.log("transcribe-batch", "seek-warn", r.error);
        });
    }

    function setEditorVisible(on) {
        var ed = $("tb-editor");
        var hint = $("tb-editor-hint");
        var findBar = $("tb-find-bar");
        var ta = $("transcript-input");
        var rendered = $("transcript-rendered");
        if (ed) ed.classList.toggle("hidden", !on);
        if (hint) hint.classList.toggle("hidden", !on);
        if (findBar) findBar.classList.toggle("hidden", !on);
        if (ta) ta.classList.toggle("hidden", on);
        if (on && rendered) rendered.classList.add("hidden");
        if (!on) {
            var f = $("tb-find"), r = $("tb-replace"), c = $("tb-find-count");
            if (f) f.value = "";
            if (r) r.value = "";
            if (c) c.textContent = "";
            clearRepeats();
        }
    }

    function updateEditorInfo() {
        if (!tb.editing) return;
        var n = 0;
        for (var i = 0; i < tb.editing.words.length; i++) {
            var t = tb.editing.words[i];
            if ((t.text != null ? t.text : (t.word || "")) !== "") n++;
        }
        var info = $("transcript-info");
        if (info) info.textContent = "Editando: " + tb.editing.seqName + " — " + n + " palabras";
    }

    function showEditBar(seqName) {
        var bar = $("tb-editing-bar");
        if (bar) bar.classList.remove("hidden");
        var label = $("tb-editing-label");
        if (label) label.textContent = "Editando: " + seqName;
    }

    function exitEditMode() {
        tb.editing = null;
        var bar = $("tb-editing-bar");
        if (bar) bar.classList.add("hidden");
        setEditorVisible(false);
        var ed = $("tb-editor");
        if (ed) { while (ed.firstChild) ed.removeChild(ed.firstChild); }
        if (global._epOnTranscriptChange) { try { global._epOnTranscriptChange(); } catch (e) {} }
        refreshLibrary();
    }

    // Escribe words[] a disco (.json + .srt) y actualiza estado. Devuelve bool.
    function persistWords(newWords, rawTextForFallback) {
        if (!tb.editing || !fs) return false;
        if (!newWords || newWords.length === 0) {
            showToast("El transcript quedó vacío; no se guardó.", "error");
            return false;
        }
        try {
            var meta = tb.editing.meta || {};
            var plain = global.EPTranscriptEdit
                ? global.EPTranscriptEdit.wordsToText(newWords)
                : (rawTextForFallback || "");
            meta.words = newWords;
            meta.text = plain;
            meta.language = tb.editing.language || meta.language || "es";
            meta.partial = false;
            meta.savedBy = "transcribe-batch";
            meta.pipelineVersion = STT_PIPELINE_VERSION;
            meta.editedAt = new Date().toISOString();
            meta.updatedAt = meta.editedAt;
            fs.writeFileSync(tb.editing.filePath, JSON.stringify(meta), "utf8");

            var srtPath = tb.editing.filePath.replace(/\.json$/i, ".srt");
            try {
                if (stt) fs.writeFileSync(srtPath, stt.generateSRT({ words: newWords }, 8), "utf8");
            } catch (e) {}

            tb.editing.words = newWords;
            tb.editing.meta = meta;
            if (state && state.transcriptCache) {
                state.transcriptCache[tb.editing.seqName] = tb.editing.filePath;
            }
            renderEditor(newWords);
            updateEditorInfo();
            refreshLibrary();
            return true;
        } catch (e) {
            showToast("No se pudo guardar: " + e.message, "error");
            return false;
        }
    }

    function saveEdit() {
        if (!tb.editing) { showToast("No hay transcript en edición", "info"); return; }
        if (!fs) return;
        var newText = readEditorText();
        var newWords;
        try {
            newWords = global.EPTranscriptEdit
                ? global.EPTranscriptEdit.alignEditedWords(tb.editing.words, newText)
                : null;
        } catch (e) { newWords = null; }
        if (!newWords) { showToast("No se pudo procesar la edición", "error"); return; }
        if (persistWords(newWords, newText)) {
            showToast("Correcciones guardadas (" + newWords.length + " palabras)", "success");
            if (global.EPLogger) EPLogger.log("transcribe-batch", "edit-save", tb.editing.seqName + " → " + newWords.length + " palabras");
            updateFindCount();
        }
    }

    // ─── Buscar y reemplazar todas las apariciones ───────────

    // Incorpora ediciones inline pendientes en el editor y devuelve words[].
    function currentEditorWords() {
        if (!tb.editing) return [];
        if (!global.EPTranscriptEdit) return tb.editing.words;
        try {
            return global.EPTranscriptEdit.alignEditedWords(tb.editing.words, readEditorText());
        } catch (e) { return tb.editing.words; }
    }

    function coreOf(token) {
        var s = String(token == null ? "" : token);
        var pre = (s.match(/^[^0-9A-Za-zÀ-ÿ]+/) || [""])[0];
        var post = (s.match(/[^0-9A-Za-zÀ-ÿ]+$/) || [""])[0];
        if (pre.length + post.length >= s.length) return s;
        return s.slice(pre.length, s.length - post.length);
    }

    function tokKey(token, caseSensitive) {
        if (caseSensitive) return coreOf(token);
        return global.EPTranscriptEdit ? global.EPTranscriptEdit.normalizeToken(token) : String(token).toLowerCase();
    }

    // Resalta las coincidencias en el editor y devuelve cuántas hay.
    function highlightMatches() {
        var ed = $("tb-editor");
        if (!ed) return 0;
        var spans = ed.querySelectorAll(".tb-w");
        for (var i = 0; i < spans.length; i++) spans[i].classList.remove("tb-find-hit");
        var searchEl = $("tb-find");
        var search = searchEl ? searchEl.value.trim() : "";
        if (!search) return 0;
        var caseSensitive = $("tb-find-case") && $("tb-find-case").checked;
        var sTok = global.EPTranscriptEdit ? global.EPTranscriptEdit.tokenizeText(search) : search.split(/\s+/);
        if (!sTok.length) return 0;
        var sKeys = [];
        for (var s = 0; s < sTok.length; s++) {
            var key = tokKey(sTok[s], caseSensitive);
            if (key === "") return 0;
            sKeys.push(key);
        }
        var arr = Array.prototype.slice.call(spans);
        var N = sKeys.length;
        var count = 0;
        for (var a = 0; a + N <= arr.length; a++) {
            var ok = true;
            for (var k = 0; k < N; k++) {
                if (tokKey(arr[a + k].textContent, caseSensitive) !== sKeys[k]) { ok = false; break; }
            }
            if (ok) {
                for (var k2 = 0; k2 < N; k2++) arr[a + k2].classList.add("tb-find-hit");
                count++;
                a += N - 1;
            }
        }
        return count;
    }

    function updateFindCount() {
        var el = $("tb-find-count");
        if (!el) return;
        var searchEl = $("tb-find");
        var search = searchEl ? searchEl.value.trim() : "";
        if (!search) { el.textContent = ""; return; }
        var n = highlightMatches();
        el.textContent = n === 0 ? "sin coincidencias" : (n + (n === 1 ? " coincidencia" : " coincidencias"));
        el.classList.toggle("tb-find-count-none", n === 0);
    }

    function applyReplaceAll() {
        if (!tb.editing) { showToast("Abre un transcript para editar primero", "info"); return; }
        if (!global.EPTranscriptEdit || !global.EPTranscriptEdit.replaceAllWords) {
            showToast("Módulo de edición no disponible", "error"); return;
        }
        var search = ($("tb-find") && $("tb-find").value.trim()) || "";
        if (!search) { showToast("Escribe qué palabra buscar", "info"); return; }
        var replacement = ($("tb-replace") && $("tb-replace").value) || "";
        var caseSensitive = $("tb-find-case") && $("tb-find-case").checked;

        var base = currentEditorWords();
        var res = global.EPTranscriptEdit.replaceAllWords(base, search, replacement, { caseSensitive: caseSensitive });
        if (res.count === 0) { showToast("Sin coincidencias de \"" + search + "\"", "info"); return; }

        if (persistWords(res.words, "")) {
            showToast("Reemplazadas " + res.count + " aparición(es): \"" + search + "\" → \"" + replacement + "\"", "success");
            if (global.EPLogger) EPLogger.log("transcribe-batch", "replace-all", search + " → " + replacement + " (" + res.count + ")");
            updateFindCount();
        }
    }

    // ─── Detección de ideas repetidas (pickups) ──────────────

    function clearRepeatHighlight() {
        var ed = $("tb-editor");
        if (!ed) return;
        var spans = ed.querySelectorAll(".tb-rep-first, .tb-rep-second");
        for (var i = 0; i < spans.length; i++) {
            spans[i].classList.remove("tb-rep-first");
            spans[i].classList.remove("tb-rep-second");
        }
    }

    function clearRepeats() {
        tb._repeats = null;
        clearRepeatHighlight();
        var box = $("tb-repeats");
        if (box) {
            while (box.firstChild) box.removeChild(box.firstChild);
            box.classList.add("hidden");
        }
    }

    function markRange(cls, fromI, toI) {
        var ed = $("tb-editor");
        if (!ed) return;
        var spans = ed.querySelectorAll(".tb-w");
        for (var i = 0; i < spans.length; i++) {
            var di = parseInt(spans[i].getAttribute("data-i"), 10);
            if (!isNaN(di) && di >= fromI && di <= toI) spans[i].classList.add(cls);
        }
    }

    function findRepeats() {
        if (!tb.editing) { showToast("Abre un transcript para editar primero", "info"); return; }
        if (!global.EPTranscriptRepeats) { showToast("Módulo de repeticiones no disponible", "error"); return; }
        // Incorpora ediciones inline pendientes para que los índices cuadren.
        var base = currentEditorWords();
        tb.editing.words = base;
        renderEditor(base);
        refreshRepeats();
        var n = tb._repeats ? tb._repeats.length : 0;
        if (n === 0) showToast("No se encontraron ideas repetidas entre cortes", "success");
        else showToast(n + (n === 1 ? " repetición encontrada" : " repeticiones encontradas"), "info");
    }

    function refreshRepeats() {
        if (!tb.editing || !global.EPTranscriptRepeats) return;
        var reps = global.EPTranscriptRepeats.detectRepeats(tb.editing.words, {});
        tb._repeats = reps;
        renderRepeatCards(reps);
    }

    function truncate(s, n) {
        s = String(s || "");
        return s.length > n ? s.slice(0, n - 1) + "…" : s;
    }

    function renderRepeatCards(reps) {
        var box = $("tb-repeats");
        if (!box) return;
        while (box.firstChild) box.removeChild(box.firstChild);
        clearRepeatHighlight();
        if (!reps || reps.length === 0) { box.classList.add("hidden"); return; }
        box.classList.remove("hidden");

        for (var r = 0; r < reps.length; r++) {
            (function(rep) {
                markRange("tb-rep-first", rep.firstIdx[0], rep.firstIdx[1]);
                markRange("tb-rep-second", rep.secondIdx[0], rep.secondIdx[1]);

                var card = document.createElement("div");
                card.className = "tb-rep-card";

                var head = document.createElement("div");
                head.className = "tb-rep-head";
                var title = document.createElement("span");
                title.className = "tb-rep-title";
                title.textContent = "Idea repetida (posible pickup) — se corta " + rep.cutDuration.toFixed(1) + "s";
                var sim = document.createElement("span");
                sim.className = "tb-rep-sim";
                sim.textContent = Math.round(rep.similarity * 100) + "% similar";
                head.appendChild(title);
                head.appendChild(sim);

                var snips = document.createElement("div");
                snips.className = "tb-rep-snippets";
                var s1 = document.createElement("span");
                s1.className = "tb-rep-snippet tb-rep-cut";
                s1.innerHTML = "<span class='tb-rep-tag'>Se corta</span>";
                s1.appendChild(document.createTextNode(truncate(rep.firstText, 160)));
                var s2 = document.createElement("span");
                s2.className = "tb-rep-snippet tb-rep-keep";
                s2.innerHTML = "<span class='tb-rep-tag'>Se conserva</span>";
                s2.appendChild(document.createTextNode(truncate(rep.secondText, 160)));
                snips.appendChild(s1);
                snips.appendChild(s2);

                var actions = document.createElement("div");
                actions.className = "tb-rep-actions";
                var cutBtn = document.createElement("button");
                cutBtn.className = "btn btn-sm tb-rep-cut-btn";
                cutBtn.textContent = "Cortar repetición";
                cutBtn.title = "Corta la repetición en el transcript y en la secuencia";
                cutBtn.addEventListener("click", function() { cutRepeat(rep, cutBtn); });
                var seeBtn = document.createElement("button");
                seeBtn.className = "btn btn-sm btn-ghost";
                seeBtn.textContent = "Ver";
                seeBtn.title = "Ir a la repetición en el editor";
                seeBtn.addEventListener("click", function() { scrollToRepeat(rep); });
                var dismiss = document.createElement("button");
                dismiss.className = "btn btn-sm btn-ghost tb-rep-dismiss";
                dismiss.textContent = "Descartar";
                dismiss.addEventListener("click", function() { dismissRepeat(rep); });
                actions.appendChild(cutBtn);
                actions.appendChild(seeBtn);
                actions.appendChild(dismiss);

                card.appendChild(head);
                card.appendChild(snips);
                card.appendChild(actions);
                box.appendChild(card);
            })(reps[r]);
        }
    }

    function scrollToRepeat(rep) {
        var ed = $("tb-editor");
        if (!ed) return;
        var spans = ed.querySelectorAll(".tb-w");
        for (var i = 0; i < spans.length; i++) {
            var di = parseInt(spans[i].getAttribute("data-i"), 10);
            if (di === rep.firstIdx[0]) {
                try { spans[i].scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
                return;
            }
        }
    }

    function dismissRepeat(rep) {
        if (!tb._repeats) return;
        var next = [];
        for (var i = 0; i < tb._repeats.length; i++) {
            if (tb._repeats[i].id !== rep.id) next.push(tb._repeats[i]);
        }
        tb._repeats = next;
        renderRepeatCards(next);
    }

    function writeCutZone(rep) {
        if (!fs || !path || !tb.editing) return null;
        try {
            var folder = tb.editing.filePath.replace(/[\/\\][^\/\\]*$/, "");
            var zonePath = path.join(folder, "_repeat_cut.json");
            var payload = { removeZones: [{ start: rep.cutStart, end: rep.cutEnd, label: "Repetición (pickup)" }] };
            fs.writeFileSync(zonePath, JSON.stringify(payload), "utf8");
            return zonePath;
        } catch (e) { return null; }
    }

    function cutRepeat(rep, btn) {
        if (!tb.editing || !global.EPTranscriptRepeats) return;
        var seqId = tb.editing.seqId || "";
        var msg = "¿Cortar esta repetición?\n\nSe eliminarán " + rep.cutDuration.toFixed(1) + "s"
            + (seqId ? " del transcript y de la secuencia." : " solo del transcript (no está ligado a una secuencia).")
            + "\n\nSe hace backup de la secuencia antes de cortar.";
        if (!confirm(msg)) return;

        if (!seqId) { applyTranscriptCut(rep, false); return; }

        var zonePath = writeCutZone(rep);
        if (!zonePath) { showToast("No se pudo preparar el corte", "error"); return; }

        if (btn) { btn.disabled = true; btn.textContent = "Cortando…"; }
        showToast("Cortando repetición en la secuencia…", "info");
        evalScript("openBackupAndCut('" + escExtendStr(seqId) + "', '" + escExtend(zonePath) + "')", function(res) {
            if (btn) { btn.disabled = false; btn.textContent = "Cortar repetición"; }
            if (res.error) {
                if (global.EPLogger) EPLogger.error("transcribe-batch", "cut-repeat", res.error);
                showToast("Error al cortar la secuencia: " + res.error, "error");
                return;
            }
            applyTranscriptCut(rep, true);
        });
    }

    function applyTranscriptCut(rep, didSequence) {
        var r = global.EPTranscriptRepeats.applyCut(tb.editing.words, rep.cutStart, rep.cutEnd);
        if (persistWords(r.words, "")) {
            var extra = didSequence ? " (transcript + secuencia)" : " (solo transcript)";
            showToast("Repetición cortada" + extra + ": −" + r.duration.toFixed(1) + "s, " + r.removed + " palabras", "success");
            if (global.EPLogger) EPLogger.log("transcribe-batch", "cut-repeat-done",
                rep.id + " −" + r.duration.toFixed(1) + "s seq=" + didSequence);
            refreshRepeats();
            updateFindCount();
        }
    }

    // ─── Bindings ────────────────────────────────────────────

    function on(id, ev, fn) {
        var el = $(id);
        if (el) el.addEventListener(ev, fn);
    }

    function bindEvents() {
        on("btn-tb-current", "click", doCurrent);
        on("btn-tb-batch", "click", doBatchList);
        on("btn-tb-batch-run", "click", doBatchRun);
        on("btn-tb-stop", "click", stopAll);
        on("btn-tb-refresh-lib", "click", refreshLibrary);
        on("btn-tb-save-edit", "click", saveEdit);
        on("btn-tb-cancel-edit", "click", exitEditMode);
        on("tb-editor", "click", onEditorClick);
        on("btn-tb-find-apply", "click", applyReplaceAll);
        on("btn-tb-find-repeats", "click", findRepeats);
        on("tb-editor", "input", function() { if (tb._repeats) clearRepeats(); });
        on("tb-find", "input", updateFindCount);
        on("tb-find-case", "change", updateFindCount);
        on("tb-find", "keydown", function(e) { if (e.key === "Enter") { e.preventDefault(); applyReplaceAll(); } });
        on("tb-replace", "keydown", function(e) { if (e.key === "Enter") { e.preventDefault(); applyReplaceAll(); } });
        on("tb-select-all", "change", function() {
            var checked = this.checked;
            for (var i = 0; i < tb.batch.length; i++) tb.batch[i].checked = checked;
            renderBatchPreview();
        });
        // Salir del modo edición si el usuario carga otra cosa en el textarea.
        ["btn-clear-transcript", "btn-paste-transcript", "btn-load-srt",
         "btn-load-json-transcript", "btn-fetch-captions", "btn-bring-whisper-transcript"].forEach(function(id) {
            on(id, "click", function() { if (tb.editing) exitEditMode(); });
        });
    }

    EP.transcribeBatch = {
        init: _initRefs,
        refreshLibrary: refreshLibrary,
        // Usados por The Cutter: exporta audio de la secuencia activa, transcribe
        // con el proveedor configurado y guarda <seq>.json + .srt.
        transcribeActiveSequence: transcribeActiveSequence,
        findSavedTranscript: findSavedTranscript,
        setBusy: function(on) { tb.busy = !!on; if (on) tb.cancelled = false; },
        cancel: function() {
            tb.cancelled = true;
            try { if (stt && stt.abort) stt.abort(); } catch (e) {}
        },
        isBusy: function() { return !!tb.busy; }
    };

})(window);
