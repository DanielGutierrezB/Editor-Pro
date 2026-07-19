/**
 * ui-marker-reviewer.js — UI y orquestación de "Revisar Marcadores"
 *
 * Flujo por secuencia (activa o todas las abiertas):
 *   1. Leer marcadores y parsear pares IN/OUT (EPMarkerReviewer.parsePairs)
 *   2. Conseguir words[]: transcript cacheado en Transcribe/ o exportar
 *      audio + STT (pipeline existente). El resultado se guarda como
 *      <Transcribe>/<seq>.json para no re-transcribir.
 *   3. Pre-pase determinístico (EPCutValidator) como hints para el LLM
 *   4. Una llamada al LLM por unidad (primer IN, cada transición OUT→IN
 *      con detección de repetición, último OUT) con contexto local
 *   5. UI de revisión: propuestas con checkbox → "Aplicar seleccionados"
 *      mueve los marcadores vía mrMoveMarkers() (borrar + recrear)
 *   6. Transcript final de los bloques + chequeo de coherencia con el LLM
 *
 * DOM IDs prefijados mrv-*. Expone window.EditorProUI.markerReviewer.
 */
(function(global) {
    "use strict";

    var EP = global.EditorProUI = global.EditorProUI || {};

    var csInterface, state, stt, aiAnalyzer;
    var fs, os, path;
    try { fs = require("fs"); os = require("os"); path = require("path"); } catch(e) {}

    function _initRefs() {
        csInterface = global._epCSInterface;
        state = global._epState;
        stt = global._epStt;
        aiAnalyzer = global._epAiAnalyzer;
        bindEvents();
    }

    var MR = global.EPMarkerReviewer;

    // ─── Estado local ────────────────────────────────────────

    var mrState = {
        running: false,
        cancelled: false,
        sessions: [],       // [{seqId|null, seqName, words, pairs, warnings, skipped, proposals, applied, finalTranscript, coherence, log}]
        currentIdx: -1,
        startTime: 0,       // inicio del run (ms) — timer total
        stepStartTime: 0,   // inicio del paso actual (ms) — timer por paso
        lastBaseText: "",   // texto de progreso sin el timer
        lastPct: 0,
        timerId: null
    };

    // ─── Helpers UI ──────────────────────────────────────────

    function $(id) { return document.getElementById(id); }

    function escHtml(s) {
        if (global.EPUtils && global.EPUtils.escapeHtml) return global.EPUtils.escapeHtml(s);
        return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function showToast(msg, type) {
        var toast = $("toast");
        if (!toast) return;
        toast.textContent = msg;
        toast.className = "toast toast-" + (type || "info") + " show";
        setTimeout(function() { toast.className = "toast"; }, 3500);
    }

    function fmtTime(t) {
        var s = Math.max(0, t);
        var m = Math.floor(s / 60);
        var sec = Math.round((s - m * 60) * 10) / 10;
        if (sec >= 60) { m++; sec = 0; }
        return m + ":" + (sec < 10 ? "0" : "") + sec.toFixed(1);
    }

    function escExtend(p) {
        return String(p).replace(/\\/g, "/").replace(/'/g, "\\'");
    }

    function escExtendStr(s) {
        return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    }

    function evalScript(script, callback) {
        csInterface.evalScript(script, function(result) {
            var data;
            try { data = JSON.parse(result); } catch(e) {
                data = { error: "Respuesta inválida del host: " + String(result).slice(0, 120) };
            }
            if (callback) callback(data);
        });
    }

    function fmtClock(ms) {
        var s = Math.max(0, Math.floor(ms / 1000));
        var m = Math.floor(s / 60);
        var sec = s % 60;
        return m + ":" + (sec < 10 ? "0" : "") + sec;
    }

    function setProgress(pct, text) {
        if (text !== undefined && text !== mrState.lastBaseText) {
            mrState.lastBaseText = text;
            mrState.stepStartTime = Date.now(); // nuevo paso → reiniciar timer de paso
        }
        if (typeof pct === "number") mrState.lastPct = pct;
        renderProgressLine();
    }

    function renderProgressLine() {
        var pct = mrState.lastPct;
        var base = mrState.lastBaseText;
        var line = base;
        if (mrState.running && mrState.startTime) {
            var total = fmtClock(Date.now() - mrState.startTime);
            var step = fmtClock(Date.now() - mrState.stepStartTime);
            line = base + "  ·  ⏱ " + total + " (paso " + step + ")";
        }
        var bar = $("mrv-progress");
        if (bar) bar.classList.remove("hidden");
        var fill = $("mrv-progress-fill");
        if (fill) fill.style.width = pct + "%";
        var txt = $("mrv-progress-text");
        if (txt) txt.textContent = line;

        var hdr = $("mrv-progress-header");
        var body = $("mrv-body");
        if (hdr) {
            var collapsed = body && body.classList.contains("hidden");
            hdr.classList.toggle("hidden", !collapsed);
            var hFill = $("mrv-progress-header-fill");
            if (hFill) hFill.style.width = pct + "%";
            var hTxt = $("mrv-progress-header-text");
            if (hTxt) hTxt.textContent = line;
        }
    }

    function startTimer() {
        mrState.startTime = Date.now();
        mrState.stepStartTime = Date.now();
        if (mrState.timerId) clearInterval(mrState.timerId);
        mrState.timerId = setInterval(renderProgressLine, 1000);
    }

    function stopTimer() {
        if (mrState.timerId) { clearInterval(mrState.timerId); mrState.timerId = null; }
    }

    function hideProgress() {
        stopTimer();
        var bar = $("mrv-progress");
        if (bar) bar.classList.add("hidden");
        var hdr = $("mrv-progress-header");
        if (hdr) hdr.classList.add("hidden");
    }

    /**
     * Muestra/oculta la barra de progreso del header según si la card está
     * colapsada y hay una revisión en curso (llamado desde bindCollapsibles).
     */
    function refreshHeaderProgress() {
        var hdr = $("mrv-progress-header");
        if (!hdr) return;
        var body = $("mrv-body");
        var collapsed = body && body.classList.contains("hidden");
        hdr.classList.toggle("hidden", !(mrState.running && collapsed));
    }

    function log(session, msg) {
        if (session) session.log.push(msg);
        if (global.EPLogger) {
            try { EPLogger.log("marker-reviewer", "log", msg); } catch(e) {}
        }
    }

    // ─── Transcript: cache o STT ─────────────────────────────

    function sanitizeBaseName(seqName) {
        return String(seqName).replace(/[\/\\:*?"<>|]/g, "_");
    }

    /**
     * Intenta cargar words[] desde los archivos de Transcribe/ sin tocar
     * la UI de Notas de Grabación. Si el transcript guardado es parcial
     * (ventanas), solo se reutiliza si cubre las fronteras de `pairs`.
     */
    function loadWordsFromDisk(seqName, pairs) {
        if (!fs || !path) return null;
        var folders = [];
        if (state && state.transcribeFolder) folders.push(state.transcribeFolder);
        try {
            var saved = localStorage.getItem("editorpro_transcript_folder");
            if (saved && folders.indexOf(saved) === -1) folders.push(saved);
        } catch(_e) {}

        var candidates = [];
        if (state && state.transcriptCache && state.transcriptCache[seqName]) {
            candidates.push(state.transcriptCache[seqName]);
        }
        var base = sanitizeBaseName(seqName);
        for (var f = 0; f < folders.length; f++) {
            candidates.push(path.join(folders[f], base + ".json"));
            candidates.push(path.join(folders[f], base + ".srt"));
        }

        for (var c = 0; c < candidates.length; c++) {
            var r = readTranscriptFile(candidates[c]);
            if (!r) continue;
            // Transcript parcial: reutilizar solo si cubre los cortes actuales
            if (r.partial && r.windows && pairs) {
                if (!MR.windowsCoverPairs(r.windows, pairs)) continue;
            }
            return r;
        }
        return null;
    }

    function readTranscriptFile(filePath) {
        if (!fs || !filePath) return null;
        try {
            if (!fs.existsSync(filePath)) return null;
            if (/\.json$/i.test(filePath)) {
                // Formato propio: conserva partial/windows para la lógica de cobertura
                try {
                    var raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
                    if (raw && raw.words && raw.words.length > 5 && typeof raw.words[0].start === "number") {
                        return { words: raw.words, text: raw.text || "", language: raw.language || "es",
                            partial: !!raw.partial, windows: raw.windows || null };
                    }
                } catch(_re) {}
                var parsed = global._epParseTranscriptJson ? global._epParseTranscriptJson(filePath) : null;
                if (parsed && parsed.words && parsed.words.length > 5) return parsed;
            } else if (/\.srt$/i.test(filePath)) {
                var content = fs.readFileSync(filePath, "utf8");
                var segments = global._epParseSRT ? global._epParseSRT(content) : null;
                if (segments && segments.length > 3 && global._epSrtSegmentsToSttResult) {
                    var sttResult = global._epSrtSegmentsToSttResult(segments);
                    if (sttResult && sttResult.words && sttResult.words.length > 5) return sttResult;
                }
            }
        } catch(_e) {}
        return null;
    }

    function saveWordsToDisk(seqName, result) {
        if (!fs || !path) return;
        var folder = state && state.transcribeFolder;
        if (!folder) return;
        try {
            // Un transcript parcial (ventanas) NO debe sobrescribir uno completo
            // ya existente — se guarda aparte para no degradar otras herramientas
            var base = sanitizeBaseName(seqName);
            var fullPath = path.join(folder, base + ".json");
            var dest;
            if (result.partial) {
                var fullExists = false;
                try {
                    if (fs.existsSync(fullPath)) {
                        var existing = JSON.parse(fs.readFileSync(fullPath, "utf8"));
                        fullExists = existing && !existing.partial && existing.words && existing.words.length > 5;
                    }
                } catch(_ee) {}
                dest = fullExists ? path.join(folder, base + ".review.json") : fullPath;
            } else {
                dest = fullPath;
            }
            fs.writeFileSync(dest, JSON.stringify({
                words: result.words,
                text: result.text || "",
                language: result.language || "es",
                partial: !!result.partial,
                windows: result.windows || null,
                savedBy: "marker-reviewer"
            }), "utf8");
            if (state.transcriptCache && !result.partial) state.transcriptCache[seqName] = dest;
        } catch(_e) {}
    }

    /**
     * Consigue words[] para la secuencia ACTIVA: cache de disco primero,
     * si no exporta el audio y transcribe con el STT configurado.
     */
    function getWordsForActiveSequence(session, onProgress, callback) {
        // Resolver la carpeta Transcribe/ del proyecto si aún no se conoce,
        // para poder encontrar transcripts ya existentes
        if (state && !state.transcribeFolder) {
            evalScript("getTranscribeFolder()", function(res) {
                if (res && res.success && res.path) state.transcribeFolder = res.path;
                _getWordsInner(session, onProgress, callback);
            });
            return;
        }
        _getWordsInner(session, onProgress, callback);
    }

    function _getWordsInner(session, onProgress, callback) {
        var cached = loadWordsFromDisk(session.seqName, session.pairs);
        if (cached) {
            log(session, "Transcript cargado de Transcribe/ (" + cached.words.length + " palabras)");
            publishTranscript(cached, session.seqName);
            callback(null, cached.words);
            return;
        }

        if (!stt) {
            callback("El módulo STT no está inicializado.");
            return;
        }

        // Si Whisper Local no encuentra su modelo, intentar la búsqueda
        // profunda en disco antes de rendirse (no pedirle la ruta al usuario)
        if (!stt.isConfigured() && stt.provider === "whisper_local" && stt.deepSearchWhisperModel) {
            onProgress(3, "Buscando el modelo Whisper en el disco...");
            stt.deepSearchWhisperModel(function() {
                if (!stt.isConfigured()) {
                    callback("Whisper Local no está listo (no se encontró el modelo ni con búsqueda en disco) y no hay transcript guardado para \"" + session.seqName + "\". Revisa Ajustes → Speech-to-Text.");
                    return;
                }
                _exportAndTranscribe(session, onProgress, callback);
            });
            return;
        }

        if (!stt.isConfigured()) {
            callback("El proveedor STT no está configurado (Ajustes → Speech-to-Text) y no hay transcript guardado para \"" + session.seqName + "\".");
            return;
        }

        _exportAndTranscribe(session, onProgress, callback);
    }

    function _exportAndTranscribe(session, onProgress, callback) {
        onProgress(5, "Exportando audio de \"" + session.seqName + "\"...");
        evalScript("findOrCreateAudioPreset()", function(preset) {
            if (mrState.cancelled) return;
            if (preset.error) return callback(preset.error);
            var delay = preset.cached ? 100 : 2000;
            setTimeout(function() {
                if (mrState.cancelled) return;
                var presetPath = String(preset.path).replace(/\\/g, "/");
                evalScript('exportSequenceAudio("' + escExtend(presetPath) + '")', function(exp) {
                    if (mrState.cancelled) return;
                    if (exp.error) return callback("Error al exportar audio: " + exp.error);
                    if (state && exp.transcribeFolder) {
                        state.transcribeFolder = exp.transcribeFolder;
                    }
                    log(session, "Audio exportado: " + exp.path);

                    var seqDur = exp.durationSeconds || 0;
                    var onTsDone = function(result) {
                        if (mrState.cancelled) return;
                        if (result.error) return callback("Error al transcribir: " + result.error);
                        if (!result.words || result.words.length === 0) return callback("La transcripción no devolvió palabras.");
                        if (result.fellBackToFull) {
                            log(session, "FFmpeg no disponible → se transcribió TODO el audio (instala ffmpeg para recortar por ventanas)");
                            showToast("Sin ffmpeg: se transcribió toda la secuencia. Instala ffmpeg (brew install ffmpeg) para acelerar.", "info");
                        }
                        log(session, "Transcripción: " + result.words.length + " palabras" + (result.partial ? " (ventanas alrededor de los cortes)" : " (completa)"));
                        saveWordsToDisk(session.seqName, result);
                        publishTranscript(result, session.seqName);
                        callback(null, result.words);
                    };

                    // Modo rápido: solo transcribir ventanas alrededor de cada IN/OUT
                    if (isWindowedMode() && stt.transcribeRegions) {
                        var windows = MR.computeAudioWindows(session.pairs);
                        session.windows = windows;
                        var winSecs = 0;
                        for (var wi = 0; wi < windows.length; wi++) winSecs += (windows[wi].end - windows[wi].start);
                        var pctOfSeq = seqDur > 0 ? Math.round((winSecs / seqDur) * 100) : 0;
                        log(session, "Modo rápido: " + windows.length + " ventana(s), ~" + Math.round(winSecs) + "s de " +
                            Math.round(seqDur) + "s" + (pctOfSeq ? " (" + pctOfSeq + "% del total)" : ""));
                        var winLabel = "Transcribiendo cortes: " + fmtClock(winSecs * 1000) +
                            (seqDur > 0 ? " de " + fmtClock(seqDur * 1000) : "") + " (" + windows.length + " ventanas)";
                        var onTsProgressWin = function(pct, info) {
                            var reg = (info && info.region) ? " · ventana " + info.region + "/" + info.total : "";
                            onProgress(15 + Math.round(pct * 0.5), winLabel + reg + "... " + pct + "%");
                        };
                        onProgress(15, winLabel + "...");
                        stt.transcribeRegions(exp.path, windows, onTsProgressWin, onTsDone);
                    } else {
                        var onTsProgressFull = function(pct) {
                            onProgress(15 + Math.round(pct * 0.5), "Transcribiendo secuencia completa... " + pct + "%");
                        };
                        onProgress(15, "Transcribiendo secuencia completa (" + (stt.provider || "STT") + ")...");
                        stt.transcribe(exp.path, onTsProgressFull, onTsDone);
                    }
                });
            }, delay);
        });
    }

    function isWindowedMode() {
        var cb = $("mrv-windowed");
        return cb ? cb.checked : true;
    }

    /**
     * Publica el transcript en el resto del panel — mismo comportamiento que
     * la auto-carga de transcript-cache: aparece en la card de Transcripción,
     * alimenta Notas de Grabación y habilita "Traer transcripción".
     */
    function publishTranscript(result, label) {
        try {
            if (state) {
                state.sttResult = result;
                state.lastWhisperResult = result;
            }
            var rec = EP.recording;
            if (rec && rec.refreshTraerTranscriptButtons) rec.refreshTraerTranscriptButtons();
            if (rec && rec.applySttResultToRecordingNotes) rec.applySttResultToRecordingNotes(result, true);
            if (global._epHideElement) global._epHideElement("recording-empty");
            if (global._epSttResultToSRT && global._epLoadTranscriptText) {
                global._epLoadTranscriptText(global._epSttResultToSRT(result), label);
            }
        } catch(e) {
            if (global.EPLogger) {
                try { EPLogger.log("marker-reviewer", "publish-error", e.message); } catch(_e) {}
            }
        }
    }

    // ─── Hints determinísticos ───────────────────────────────

    function buildHints(pairs, words) {
        var hintsByUnit = {};
        if (!global.EPCutValidator) return hintsByUnit;
        try {
            var segments = pairs.map(function(p) {
                return { inTime: p.inMarker.startSeconds, outTime: p.outMarker.startSeconds };
            });
            var pickups = global.EPCutValidator.detectPickups(words, segments);
            var snaps = global.EPCutValidator.snapBoundaries(words, segments);
            var i;
            for (i = 0; i < pickups.length; i++) {
                var p = pickups[i];
                if (p.type !== "pickup") continue;
                // pickup del par p.prevSegPos → unidad transition con outPairIdx = prevSegPos
                var key = "t" + p.prevSegPos;
                hintsByUnit[key] = (hintsByUnit[key] ? hintsByUnit[key] + " " : "") +
                    "Detector automático: la frase \"" + p.matchText + "\" parece repetida al inicio del bloque siguiente; " +
                    "el OUT anterior podría retroceder a ~" + p.proposedOutTime.toFixed(1) + "s.";
            }
            for (i = 0; i < snaps.length; i++) {
                var sn = snaps[i];
                var kind = sn.field === "inTime" ? "IN" : "OUT";
                // Indexado por bloque (unidades por bloque)
                var uKey = "t" + sn.segPos;
                hintsByUnit[uKey] = (hintsByUnit[uKey] ? hintsByUnit[uKey] + " " : "") +
                    "El gap de silencio sugiere " + kind + " en ~" + sn.proposed.toFixed(1) + "s.";
            }
        } catch(_e) {}
        return hintsByUnit;
    }

    // ─── Análisis LLM por secuencia ──────────────────────────

    function analyzeSession(session, onProgress, callback) {
        // Una unidad por bloque: el LLM evalúa IN y OUT del mismo bloque con foco
        var units = MR.buildBlockUnits(session.pairs);
        var hints = buildHints(session.pairs, session.words);
        var proposals = [];
        var errors = [];
        var idx = 0;

        function dedupePush(props, labelForLog) {
            for (var i = 0; i < props.length; i++) {
                var np = props[i];
                var dup = false;
                for (var q = 0; q < proposals.length; q++) {
                    if (proposals[q].kind === np.kind && proposals[q].pairIdx === np.pairIdx) { dup = true; break; }
                }
                if (!dup) {
                    np.selected = true;
                    if (!np.unitLabel) np.unitLabel = labelForLog || "";
                    proposals.push(np);
                }
            }
        }

        function finalizeProposals() {
            // 1) Pickups determinísticos (frase del bloque N+1 repite el final
            //    del bloque N) → retroceder el OUT de N. Fiable, ya testeado.
            try {
                if (global.EPCutValidator) {
                    var segs = session.pairs.map(function(p) {
                        return { inTime: p.inMarker.startSeconds, outTime: p.outMarker.startSeconds };
                    });
                    var pickups = global.EPCutValidator.detectPickups(session.words, segs);
                    for (var k = 0; k < pickups.length; k++) {
                        var pk = pickups[k];
                        if (pk.type !== "pickup") continue;
                        var pairIdx = pk.prevSegPos;
                        var already = false;
                        for (var z = 0; z < proposals.length; z++) {
                            if (proposals[z].kind === "OUT" && proposals[z].pairIdx === pairIdx) { already = true; break; }
                        }
                        if (already) continue;
                        proposals.push({
                            kind: "OUT", pairIdx: pairIdx,
                            marker: session.pairs[pairIdx].outMarker,
                            originalTime: session.pairs[pairIdx].outMarker.startSeconds,
                            newTime: pk.proposedOutTime,
                            reason: "El bloque siguiente repite esta frase; el OUT retrocede para no duplicarla",
                            repeatedPhrase: pk.matchText || "",
                            selected: true,
                            snippet: { before: "", after: pk.matchText || "" }
                        });
                    }
                }
            } catch(e) {}

            // 2) Conteos "3,2,1"/cues al inicio de bloque → avanzar IN
            try {
                var leadIns = MR.detectLeadIns(session.words, session.pairs);
                dedupePush(leadIns, "conteo");
                for (var d = 0; d < leadIns.length; d++) {
                    log(session, "Detector de conteo: IN bloque " + (leadIns[d].pairIdx + 1) + " " +
                        leadIns[d].originalTime.toFixed(1) + "→" + leadIns[d].newTime.toFixed(1) + "s");
                }
            } catch(e2) {}

            // 3) Evitar que un bloque se pise con el siguiente (prioriza IN)
            try { MR.resolveOverlaps(proposals, session.pairs); } catch(e3) {}

            proposals.sort(function(a, b) { return a.originalTime - b.originalTime; });
        }

        function next() {
            if (mrState.cancelled) return callback("Revisión cancelada.", proposals);
            if (idx >= units.length) {
                finalizeProposals();
                return callback(errors.length === units.length && units.length > 0 ? "El LLM no respondió a ninguna consulta: " + errors[0] : null, proposals);
            }
            var unit = units[idx];
            unit.hints = hints["t" + unit.pairIdx] || "";
            var label = "bloque IN/OUT " + (unit.pairIdx + 1);
            onProgress(Math.round((idx / units.length) * 100), "Validando " + label + " (" + (idx + 1) + "/" + units.length + " bloques)...");

            var built = MR.buildUnitPrompt(unit, session.pairs, session.words);
            var callStart = Date.now();
            aiAnalyzer._send(built.systemMsg, built.prompt, function(response) {
                if (mrState.cancelled) return; // abortado: no continuar el bucle
                var secs = ((Date.now() - callStart) / 1000).toFixed(1);
                if (response && response.error) {
                    errors.push(response.error);
                    log(session, "LLM error en " + label + " (" + secs + "s): " + response.error);
                } else {
                    var debug = [];
                    var props = MR.resolveUnitResponse(unit, response, session.pairs, session.words, { _debug: debug });
                    dedupePush(props, label);
                    log(session, label + " (" + secs + "s): " + props.length + " ajuste(s) · decisión LLM → " + debug.join(" | "));
                }
                idx++;
                next();
            }, null, { numPredict: 1500, think: false });
        }
        next();
    }

    // ─── Flujo principal ─────────────────────────────────────

    /**
     * Avisa (una vez por sesión de panel) si el modelo de IA seleccionado es
     * de visión (-vl) o muy grande: para esta tarea de texto basta uno ligero.
     */
    function warnHeavyModel() {
        if (warnHeavyModel._done) return;
        if (!aiAnalyzer || aiAnalyzer.provider !== "ollama") return;
        var model = (aiAnalyzer.model || "").toLowerCase();
        var isVision = model.indexOf("-vl") !== -1 || model.indexOf("llava") !== -1 || model.indexOf("vision") !== -1;
        var isBig = /:(\d+)b/.test(model) && parseInt(model.match(/:(\d+)b/)[1], 10) >= 20;
        if (isVision || isBig) {
            warnHeavyModel._done = true;
            showToast("Modelo pesado (" + aiAnalyzer.model + ") para una tarea de texto. Un modelo ligero (p.ej. qwen3:4b) será mucho más rápido con calidad similar.", "info");
        }
    }

    function reviewActive() {
        if (mrState.running) { showToast("Ya hay una revisión en curso", "info"); return; }
        if (!fs) { showToast("Node.js no disponible en el panel", "error"); return; }
        if (!aiAnalyzer) { showToast("El proveedor de IA no está inicializado", "error"); return; }

        warnHeavyModel();
        startRun();
        evalScript("getActiveSequenceInfo()", function(info) {
            if (info.error) return failRun(info.error);
            var session = newSession(null, info.name);
            mrState.sessions = [session];
            mrState.currentIdx = 0;
            runSession(session, function(err) {
                if (err) session.error = err;
                finishRun(err);
            });
        });
    }

    function reviewOpen() {
        if (mrState.running) { showToast("Ya hay una revisión en curso", "info"); return; }
        if (!fs) { showToast("Node.js no disponible en el panel", "error"); return; }
        if (!aiAnalyzer) { showToast("El proveedor de IA no está inicializado", "error"); return; }

        warnHeavyModel();
        startRun();
        setProgress(2, "Buscando secuencias abiertas...");
        evalScript("getAllProjectSequences()", function(data) {
            if (data.error) return failRun(data.error);
            var seqs = data.sequences || [];
            var candidates = [];
            for (var i = 0; i < seqs.length; i++) {
                var s = seqs[i];
                if (data.probeReliable && !s.isOpen) continue;
                if ((s.markerCount || 0) < 2) continue;
                candidates.push(s);
            }
            if (candidates.length === 0) {
                return failRun(data.probeReliable
                    ? "Ninguna secuencia abierta tiene 2+ marcadores."
                    : "Ninguna secuencia del proyecto tiene 2+ marcadores.");
            }

            mrState.sessions = [];
            var idx = 0;

            function nextSeq() {
                if (mrState.cancelled) return finishRun("Revisión cancelada.");
                if (idx >= candidates.length) return finishRun(null);
                var cand = candidates[idx];
                var session = newSession(cand.sequenceID, cand.name);
                mrState.sessions.push(session);
                mrState.currentIdx = mrState.sessions.length - 1;

                // Abrir la secuencia (el export de audio requiere que sea la activa)
                evalScript("openSequenceById('" + escExtendStr(cand.sequenceID) + "')", function(openRes) {
                    if (openRes.error) {
                        session.error = "No se pudo abrir: " + openRes.error;
                        idx++; nextSeq();
                        return;
                    }
                    runSession(session, function(err) {
                        if (err) session.error = err;
                        idx++;
                        nextSeq();
                    });
                });
            }
            nextSeq();
        });
    }

    function newSession(seqId, seqName) {
        return {
            seqId: seqId, seqName: seqName,
            words: null, pairs: [], warnings: [], skipped: [],
            proposals: [], applied: false, moveResult: null,
            finalTranscript: null, coherence: null,
            error: null, log: []
        };
    }

    function runSession(session, done) {
        var prefix = mrState.sessions.length > 1
            ? "[" + (mrState.sessions.indexOf(session) + 1) + "/" + mrState.sessions.length + "] "
            : "";

        setProgress(2, prefix + "Leyendo marcadores de \"" + session.seqName + "\"...");
        var markersCall = session.seqId
            ? "getMarkersForSequence('" + escExtendStr(session.seqId) + "')"
            : "getSequenceMarkers()";

        evalScript(markersCall, function(data) {
            if (mrState.cancelled) return;
            if (data.error) return done(data.error);
            session.markerCount = (data.markers || []).length;
            var parsed = MR.parsePairs(data.markers, { skipClapperboard: true });
            if (parsed.error) return done(parsed.error);
            session.pairs = parsed.pairs;
            session.warnings = parsed.warnings;
            session.skipped = parsed.skipped;
            log(session, parsed.pairs.length + " pares IN/OUT (" + parsed.skipped.length + " claqueta(s) ignorada(s))");

            getWordsForActiveSequence(session, function(pct, txt) {
                setProgress(Math.round(pct * 0.4), prefix + txt);
            }, function(err, words) {
                if (err) return done(err);
                session.words = words;

                analyzeSession(session, function(pct, txt) {
                    setProgress(40 + Math.round(pct * 0.55), prefix + txt);
                }, function(analysisErr, proposals) {
                    if (analysisErr && proposals.length === 0) return done(analysisErr);
                    session.proposals = proposals;
                    computeFinalTranscript(session);
                    done(null);
                });
            });
        });
    }

    function startRun() {
        mrState.running = true;
        mrState.cancelled = false;
        mrState.lastBaseText = "";
        mrState.lastPct = 0;
        startTimer();
        var empty = $("mrv-empty");
        if (empty) empty.classList.add("hidden");
        var results = $("mrv-results");
        if (results) results.classList.add("hidden");
        var stopBtn = $("btn-mrv-stop");
        if (stopBtn) stopBtn.classList.remove("hidden");
        setProgress(1, "Iniciando revisión...");
    }

    function failRun(msg) {
        if (mrState.cancelled) return; // stopRun ya finalizó la UI
        mrState.running = false;
        hideProgress();
        var stopBtn = $("btn-mrv-stop");
        if (stopBtn) stopBtn.classList.add("hidden");
        var empty = $("mrv-empty");
        if (empty) empty.classList.remove("hidden");
        showToast(msg, "error");
    }

    function finishRun(err) {
        if (mrState.cancelled) return; // stopRun ya finalizó la UI
        var elapsed = mrState.startTime ? fmtClock(Date.now() - mrState.startTime) : "";
        mrState.running = false;
        hideProgress();
        var stopBtn = $("btn-mrv-stop");
        if (stopBtn) stopBtn.classList.add("hidden");
        if (err && mrState.sessions.length === 0) return failRun(err);
        renderResults();
        if (err) {
            showToast(err, "error");
            return;
        }
        var total = 0;
        var failed = 0;
        for (var i = 0; i < mrState.sessions.length; i++) {
            total += mrState.sessions[i].proposals.length;
            if (mrState.sessions[i].error) failed++;
        }
        var suffix = elapsed ? " · ⏱ " + elapsed : "";
        if (failed > 0) {
            showToast(failed + " secuencia(s) con error — revisa el detalle" + suffix, "error");
        } else {
            showToast((total > 0
                ? total + " ajuste(s) propuesto(s) en " + mrState.sessions.length + " secuencia(s)"
                : "Marcadores validados — sin ajustes necesarios") + suffix, total > 0 ? "info" : "success");
        }
    }

    function stopRun() {
        if (!mrState.running) return;
        mrState.cancelled = true;
        // Abortar de inmediato la petición en vuelo (LLM y/o transcripción)
        try { if (aiAnalyzer && aiAnalyzer.abort) aiAnalyzer.abort(); } catch(e) {}
        try { if (stt && stt.abort) stt.abort(); } catch(e) {}
        // Como tras abort() el callback de _send no se dispara, finalizamos aquí
        mrState.running = false;
        hideProgress();
        var stopBtn = $("btn-mrv-stop");
        if (stopBtn) stopBtn.classList.add("hidden");
        // Mostrar lo que se haya calculado hasta el momento
        if (mrState.sessions.length > 0) renderResults();
        else { var empty = $("mrv-empty"); if (empty) empty.classList.remove("hidden"); }
        showToast("Revisión detenida", "info");
    }

    // ─── Transcript final + coherencia ───────────────────────

    function adjustedBlocks(session) {
        // Bloques con los ajustes seleccionados/aplicados encima de los originales
        var blocks = [];
        for (var i = 0; i < session.pairs.length; i++) {
            blocks.push({
                inTime: session.pairs[i].inMarker.startSeconds,
                outTime: session.pairs[i].outMarker.startSeconds
            });
        }
        for (var p = 0; p < session.proposals.length; p++) {
            var prop = session.proposals[p];
            if (!prop.selected && !prop.applied) continue;
            if (prop.kind === "IN") blocks[prop.pairIdx].inTime = prop.newTime;
            else blocks[prop.pairIdx].outTime = prop.newTime;
        }
        var valid = [];
        for (var b = 0; b < blocks.length; b++) {
            if (blocks[b].outTime > blocks[b].inTime) valid.push(blocks[b]);
        }
        return valid;
    }

    function computeFinalTranscript(session) {
        if (!session.words) return;
        session.finalTranscript = MR.buildFinalTranscript(session.words, adjustedBlocks(session));
    }

    function runCoherenceCheck(session) {
        if (!session.finalTranscript || !aiAnalyzer) return;
        var built = MR.buildCoherencePrompt(session.finalTranscript.text);
        var btn = $("btn-mrv-coherence");
        if (btn) { btn.disabled = true; btn.textContent = "Analizando coherencia..."; }
        aiAnalyzer._send(built.systemMsg, built.prompt, function(response) {
            if (mrState.cancelled) { if (btn) { btn.disabled = false; btn.textContent = "Validar coherencia con IA"; } return; }
            if (btn) { btn.disabled = false; btn.textContent = "Validar coherencia con IA"; }
            if (response && response.error) {
                showToast("Coherencia: " + response.error, "error");
                return;
            }
            session.coherence = response;
            renderResults();
        });
    }

    function saveFinalTranscript(session) {
        if (!fs || !path || !session.finalTranscript) return;
        var folder = (state && state.transcribeFolder) || (os ? os.tmpdir() : "/tmp");
        var dest = path.join(folder, sanitizeBaseName(session.seqName) + "_final.txt");
        try {
            fs.writeFileSync(dest, session.finalTranscript.text, "utf8");
            showToast("Transcript final guardado: " + dest, "success");
        } catch(e) {
            showToast("No se pudo guardar: " + e.message, "error");
        }
    }

    // ─── Aplicar ajustes ─────────────────────────────────────

    function applySelected(session) {
        var moves = [];
        var toApply = [];
        for (var i = 0; i < session.proposals.length; i++) {
            var p = session.proposals[i];
            if (!p.selected || p.applied) continue;
            moves.push({
                oldStart: p.marker.startSeconds,
                newStart: p.newTime,
                name: p.marker.name || ""
            });
            toApply.push(p);
        }
        if (moves.length === 0) { showToast("No hay ajustes seleccionados", "info"); return; }
        if (!fs || !os) { showToast("Node.js no disponible", "error"); return; }

        var tmpFile = path.join(os.tmpdir(), "editorpro_mrv_moves.json");
        try {
            fs.writeFileSync(tmpFile, JSON.stringify(moves), "utf8");
        } catch(e) {
            showToast("Error al escribir archivo temporal: " + e.message, "error");
            return;
        }

        var call = session.seqId
            ? "mrMoveMarkers('" + escExtend(tmpFile) + "', '" + escExtendStr(session.seqId) + "')"
            : "mrMoveMarkers('" + escExtend(tmpFile) + "')";

        evalScript(call, function(result) {
            try { fs.unlinkSync(tmpFile); } catch(_e) {}
            if (result.error) { showToast(result.error, "error"); return; }

            // Actualizar los tiempos locales de los marcadores movidos
            for (var a = 0; a < toApply.length; a++) {
                toApply[a].applied = true;
                toApply[a].marker.startSeconds = toApply[a].newTime;
            }
            session.applied = true;
            session.moveResult = result;
            computeFinalTranscript(session);
            renderResults();

            var msg = result.moved + " marcador(es) movido(s)";
            if (result.notFound && result.notFound.length > 0) {
                msg += " — " + result.notFound.length + " no encontrado(s)";
            }
            showToast(msg, result.notFound && result.notFound.length > 0 ? "info" : "success");
            log(session, msg);
        });
    }

    // ─── Render ──────────────────────────────────────────────

    function currentSession() {
        if (mrState.currentIdx < 0 || mrState.currentIdx >= mrState.sessions.length) return null;
        return mrState.sessions[mrState.currentIdx];
    }

    function renderResults() {
        var container = $("mrv-results");
        if (!container) return;
        container.classList.remove("hidden");

        // Selector de secuencia (solo en batch)
        var tabs = $("mrv-session-tabs");
        if (tabs) {
            if (mrState.sessions.length > 1) {
                tabs.classList.remove("hidden");
                var tabsHtml = [];
                for (var t = 0; t < mrState.sessions.length; t++) {
                    var s = mrState.sessions[t];
                    var badge = s.error ? "⚠" : (s.proposals.length > 0 ? s.proposals.length : "✓");
                    tabsHtml.push("<button class='mrv-tab" + (t === mrState.currentIdx ? " active" : "") +
                        "' data-idx='" + t + "'>" + escHtml(s.seqName) +
                        " <span class='mrv-tab-badge'>" + badge + "</span></button>");
                }
                tabs.innerHTML = tabsHtml.join("");
                var tabBtns = tabs.querySelectorAll(".mrv-tab");
                for (var tb = 0; tb < tabBtns.length; tb++) {
                    (function(btn) {
                        btn.addEventListener("click", function() {
                            mrState.currentIdx = parseInt(btn.getAttribute("data-idx"), 10);
                            renderResults();
                        });
                    })(tabBtns[tb]);
                }
            } else {
                tabs.classList.add("hidden");
            }
        }

        var session = currentSession();
        var body = $("mrv-session-body");
        if (!body) return;
        if (!session) { body.innerHTML = ""; return; }

        var html = [];

        html.push("<div class='mrv-seq-title'>" + escHtml(session.seqName) +
            " <span class='mrv-seq-meta'>" + session.pairs.length + " bloques IN/OUT" +
            (session.markerCount ? " (de " + session.markerCount + " marcadores)" : "") +
            (session.words ? " · " + session.words.length + " palabras" : "") + "</span></div>");

        if (session.error) {
            html.push("<div class='mrv-error'>✗ " + escHtml(session.error) + "</div>");
        }
        for (var w = 0; w < session.warnings.length; w++) {
            html.push("<div class='mrv-warning'>⚠ " + escHtml(session.warnings[w]) + "</div>");
        }
        if (session.skipped.length > 0) {
            var skipTimes = [];
            for (var sk = 0; sk < session.skipped.length; sk++) skipTimes.push(fmtTime(session.skipped[sk].startSeconds));
            html.push("<div class='mrv-note'>Claqueta ignorada en " + escHtml(skipTimes.join(", ")) + "</div>");
        }

        // Propuestas
        if (session.proposals.length === 0) {
            if (!session.error) {
                html.push("<div class='mrv-ok'>✓ Todos los marcadores caen donde la frase tiene sentido. No hay ajustes que hacer.</div>");
            }
        } else {
            html.push("<div class='mrv-group-title'>Ajustes propuestos</div>");
            for (var i = 0; i < session.proposals.length; i++) {
                var p = session.proposals[i];
                var dir = p.newTime < p.originalTime ? "◀" : "▶";
                var delta = Math.abs(p.newTime - p.originalTime).toFixed(1);
                html.push(
                    "<div class='mrv-item mrv-item-clickable" + (p.applied ? " applied" : "") + "' data-nav-idx='" + i + "' title='Ir a este marcador en la secuencia'>" +
                        (p.applied
                            ? "<span class='mrv-applied-badge'>✓</span>"
                            : "<input type='checkbox' class='mrv-check' data-idx='" + i + "'" + (p.selected ? " checked" : "") + ">") +
                        "<div class='mrv-item-body'>" +
                            "<div class='mrv-item-head'><strong>" + p.kind + " · Bloque " + (p.pairIdx + 1) + "</strong> " +
                                "<span class='mrv-time'>" + fmtTime(p.originalTime) + " → <strong>" + fmtTime(p.newTime) + "</strong> (" + dir + " " + delta + "s)</span></div>" +
                            (p.repeatedPhrase
                                ? "<div class='mrv-repeat'>Frase repetida: <em>\"" + escHtml(p.repeatedPhrase) + "\"</em></div>" : "") +
                            "<div class='mrv-reason'>" + escHtml(p.reason || "") + "</div>" +
                            "<div class='mrv-context'>..." + escHtml(p.snippet.before) + " <span class='mrv-cut-mark'>✂</span> <strong>" + escHtml(p.snippet.after) + "</strong>...</div>" +
                        "</div>" +
                    "</div>"
                );
            }
        }

        body.innerHTML = html.join("");

        // Bind checkboxes (el clic en el checkbox no debe navegar)
        var checks = body.querySelectorAll(".mrv-check");
        for (var c = 0; c < checks.length; c++) {
            (function(cb) {
                cb.addEventListener("click", function(ev) { ev.stopPropagation(); });
                cb.addEventListener("change", function() {
                    var idx = parseInt(cb.getAttribute("data-idx"), 10);
                    if (session.proposals[idx]) {
                        session.proposals[idx].selected = cb.checked;
                        computeFinalTranscript(session);
                        renderFinalSection(session);
                        updateApplyButton(session);
                    }
                });
            })(checks[c]);
        }

        // Clic en una fila → llevar el playhead a ese marcador en la secuencia
        var rows = body.querySelectorAll(".mrv-item-clickable");
        for (var rr = 0; rr < rows.length; rr++) {
            (function(row) {
                row.addEventListener("click", function() {
                    var idx = parseInt(row.getAttribute("data-nav-idx"), 10);
                    var prop = session.proposals[idx];
                    if (prop && global._epNavigateToTime) {
                        global._epNavigateToTime(Math.max(0, prop.marker.startSeconds));
                    }
                });
            })(rows[rr]);
        }

        updateApplyButton(session);
        renderFinalSection(session);
    }

    function updateApplyButton(session) {
        var btn = $("btn-mrv-apply");
        if (!btn) return;
        var pending = 0;
        if (session) {
            for (var i = 0; i < session.proposals.length; i++) {
                if (session.proposals[i].selected && !session.proposals[i].applied) pending++;
            }
        }
        btn.classList.toggle("hidden", pending === 0);
        btn.querySelector("span").textContent = "Aplicar seleccionados (" + pending + ")";
    }

    function renderFinalSection(session) {
        var sec = $("mrv-final-section");
        if (!sec) return;
        if (!session || !session.finalTranscript) { sec.classList.add("hidden"); return; }
        sec.classList.remove("hidden");

        var ft = session.finalTranscript;
        var summary = $("mrv-final-summary");
        if (summary) {
            summary.textContent = ft.blockTexts.length + " bloques · " + ft.wordCount + " palabras" +
                (session.applied ? " · marcadores ya movidos" : " · vista previa con los ajustes seleccionados");
        }
        var ta = $("mrv-final-text");
        if (ta) ta.value = ft.text;

        var cohBox = $("mrv-coherence-result");
        if (cohBox) {
            if (session.coherence) {
                var coh = session.coherence;
                var issuesHtml = [];
                var issues = coh.issues || [];
                for (var i = 0; i < issues.length; i++) {
                    issuesHtml.push("<div class='mrv-coh-issue'>• " +
                        (issues[i].block ? "Bloque " + escHtml(String(issues[i].block)) + ": " : "") +
                        escHtml(issues[i].detail || "") + "</div>");
                }
                cohBox.innerHTML =
                    "<div class='mrv-coh-head " + (coh.coherent ? "ok" : "warn") + "'>" +
                        (coh.coherent ? "✓ La clase se cuenta con sentido" : "⚠ Hay puntos a revisar") +
                        (coh.score ? " · " + escHtml(String(coh.score)) + "/10" : "") + "</div>" +
                    "<div class='mrv-coh-summary'>" + escHtml(coh.summary || "") + "</div>" +
                    issuesHtml.join("");
                cohBox.classList.remove("hidden");
            } else {
                cohBox.classList.add("hidden");
            }
        }
    }

    function copyFinalTranscript() {
        var session = currentSession();
        if (!session || !session.finalTranscript) return;
        try {
            var ta = document.createElement("textarea");
            ta.value = session.finalTranscript.text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            showToast("Transcript copiado", "success");
        } catch(e) {
            showToast("No se pudo copiar", "error");
        }
    }

    // ─── Bindings ────────────────────────────────────────────

    var _bound = false;

    function bindEvents() {
        if (_bound) return;
        _bound = true;
        var on = function(id, fn) {
            var el = $(id);
            if (el) el.addEventListener("click", fn);
        };
        on("btn-mrv-review-active", reviewActive);
        on("btn-mrv-review-open", reviewOpen);
        on("btn-mrv-stop", stopRun);
        on("btn-mrv-apply", function() {
            var s = currentSession();
            if (s) applySelected(s);
        });
        on("btn-mrv-coherence", function() {
            var s = currentSession();
            if (s) runCoherenceCheck(s);
        });
        on("btn-mrv-save-final", function() {
            var s = currentSession();
            if (s) saveFinalTranscript(s);
        });
        on("btn-mrv-copy-final", copyFinalTranscript);
    }

    EP.markerReviewer = {
        init: _initRefs,
        reviewActive: reviewActive,
        reviewOpen: reviewOpen,
        refreshHeaderProgress: refreshHeaderProgress
    };

})(window);
