/**
 * ui-marker-reviewer.js — UI y orquestación de "Revisar Marcadores"
 *
 * Flujo por secuencia (activa o todas las abiertas):
 *   1. Leer marcadores y parsear pares IN/OUT (EPMarkerReviewer.parsePairs)
 *   2. Conseguir words[]: transcript cacheado en Transcribe/ o exportar
 *      audio + STT (pipeline existente). El resultado se guarda como
 *      <Transcribe>/<seq>.json para no re-transcribir.
 *   3. Pre-pase determinístico (retomas + conteos) como pistas para el LLM
 *   4. Una consulta al LLM por borde (IN y OUT de cada bloque): elige entre
 *      los puntos de corte reales que arma EPMarkerPrecision
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

    // Versión del pipeline de transcripción. Se guarda en cada transcript y se
    // usa para invalidar cachés viejos (p.ej. hechos antes de los flags
    // anti-alucinación de MLX y del filtro de loops de frase). Un .review.json
    // sin esta versión (o menor) se ignora y se re-transcribe.
    var STT_PIPELINE_VERSION = 3;

    function cleanWords(words) {
        try {
            if (global.SpeechToText && global.SpeechToText.cleanHallucinatedRepeats) {
                return global.SpeechToText.cleanHallucinatedRepeats(words);
            }
        } catch(e) {}
        return words;
    }

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
        timerId: null,
        fps: 0,             // frame rate de la secuencia, para el colchón en frames
        duration: 0,        // duración de la secuencia, para validar el transcript
        preMarkerBackups: {} // secuencias que ya tienen copia "Pre-Marker" en esta sesión
    };

    // Movimiento mínimo que vale la pena aplicar (por debajo es ruido).
    var MIN_CHANGE_SEC = 0.12;

    // ─── Colchón de los cortes ───────────────────────────────

    // Frames de aire que se dejan antes del IN y después del OUT. Cortar pegado a
    // la palabra suena abrupto y se come el ataque de la primera sílaba.
    var PAD_FRAMES_KEY = "editorpro_cut_pad_frames";
    var PAD_FRAMES_DEFAULT = 10;

    function getPadFrames() {
        try {
            var raw = localStorage.getItem(PAD_FRAMES_KEY);
            if (raw === null || raw === "") return PAD_FRAMES_DEFAULT;
            var n = parseInt(raw, 10);
            if (isNaN(n) || n < 0) return PAD_FRAMES_DEFAULT;
            return Math.min(60, n);
        } catch(e) { return PAD_FRAMES_DEFAULT; }
    }

    function setPadFrames(n) {
        var v = parseInt(n, 10);
        if (isNaN(v) || v < 0) v = PAD_FRAMES_DEFAULT;
        v = Math.min(60, v);
        try { localStorage.setItem(PAD_FRAMES_KEY, String(v)); } catch(e) {}
        return v;
    }

    /** Opciones de precisión: colchón del usuario + frame rate real de la secuencia. */
    function precisionOpts() {
        return { padFrames: getPadFrames(), fps: mrState.fps || 0 };
    }

    // Cuánto puede el sonido caer fuera de la palabra del transcript. Whisper
    // ADELANTA el principio de la primera palabra de cada toma (hasta 1.8s medidos
    // en una clase), nunca lo retrasa apenas, así que un borde MUY anterior a la
    // palabra no es su ataque: es un ruido de sala. Un colchón de margen deja sitio
    // al aire sin dejar pasar el ruido.
    var AUDIO_GRACE_SEC = 0.4;

    /**
     * Opciones para medir un borde en el audio: las de precisión más los límites
     * que el sonido no puede cruzar. El audio ajusta el frame DENTRO del contenido
     * que el transcript le da al bloque, y son dos límites distintos:
     *
     *   · el de la palabra VECINA (`outerBound`): el corte no lo cruza, ni buscando el
     *     borde ni al poner el colchón. Sin él, un "pausa" dicho al editor pegado a la
     *     última frase se cuenta como parte del mismo tramo de voz y el OUT se abre
     *     hasta el final del cue;
     *   · el de la palabra PROPIA (± `AUDIO_GRACE_SEC`, solo para BUSCAR el borde):
     *     el ataque de esta palabra no puede estar a segundos de donde el transcript
     *     la pone. Caso real (clase 14, bloque 3): un golpe de 0.15s a 274.0s se midió
     *     como el arranque de una frase que no suena hasta 276.2s, y el IN se fue 2s
     *     antes de que hablara nadie. Este límite no recorta el colchón: el aire sale
     *     del silencio que haya, no de dónde Whisper crea que empieza la palabra.
     *
     * La palabra propia es la que el corte parte, si parte alguna, y si no la de la
     * frontera. Esa distinción es lo que hace que **medir dé lo mismo antes y después
     * de mover el marcador**: cuando el audio deja el cierre dentro de una palabra que
     * el transcript alarga sobre el silencio, mirar la frontera devolvería la palabra
     * ANTERIOR y su ventana ya no contiene el sonido, así que el mismo borde que se
     * acababa de medir pasaba a ser inmedible. Sin medida, los chequeos de
     * milisegundos del transcript vuelven a hablar y el paso 5 denuncia para siempre
     * un corte que él mismo puso bien (clase 15, bloque 3: "conecte.").
     */
    function audioOpts(words, time, kind) {
        var o = precisionOpts();
        var AN = global.EPMarkerAnchor;
        if (!AN) return o;
        var bound = AN.outerBound ? AN.outerBound(words, time, kind) : null;
        var own = AN.holdingWord ? AN.holdingWord(words, time) : null;
        var front = AN.frontierAt ? AN.frontierAt(words, time, kind) : null;
        var edge = own ? (kind === "IN" ? +own.start : +own.end)
                       : (front ? front.time : null);
        if (kind === "IN") {
            if (bound != null) o.minTime = bound;
            if (edge != null) o.edgeMinTime = edge - AUDIO_GRACE_SEC;
        } else {
            if (bound != null) o.maxTime = bound;
            if (edge != null) o.edgeMaxTime = edge + AUDIO_GRACE_SEC;
        }
        return o;
    }

    /**
     * El frame rate se lee una vez por run. Un proyecto con secuencias a distinto
     * fps es raro; si pasa, el colchón sale de la primera y sigue siendo aire.
     */
    function ensureFps(cb) {
        if (mrState.fps) return cb();
        evalScript("getActiveSequenceInfo()", function(info) {
            mrState.fps = (info && info.frameRate) || 0;
            mrState.duration = (info && info.durationSeconds) || 0;
            cb();
        });
    }

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
        // En headless (The Cutter) el progreso lo pinta la card que orquesta:
        // no tiene sentido encender también la barra de esta card.
        if (mrState.externalProgress) {
            try { mrState.externalProgress(mrState.lastPct, mrState.lastBaseText); } catch(e) {}
            return;
        }
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

    /** Carpetas donde viven los transcripts y los WAV exportados. */
    function transcribeFolders() {
        var folders = [];
        if (state && state.transcribeFolder) folders.push(state.transcribeFolder);
        try {
            var saved = localStorage.getItem("editorpro_transcript_folder");
            if (saved && folders.indexOf(saved) === -1) folders.push(saved);
        } catch(_e) {}
        return folders;
    }

    /**
     * Intenta cargar words[] desde los archivos de Transcribe/ sin tocar
     * la UI de Notas de Grabación. Si el transcript guardado es parcial
     * (ventanas), solo se reutiliza si cubre las fronteras de `pairs`.
     */
    function loadWordsFromDisk(seqName, pairs) {
        if (!fs || !path) return null;
        var folders = transcribeFolders();

        var candidates = [];
        if (state && state.transcriptCache && state.transcriptCache[seqName]) {
            candidates.push(state.transcriptCache[seqName]);
        }
        var base = sanitizeBaseName(seqName);
        for (var f = 0; f < folders.length; f++) {
            // Preferir un transcript completo (.json/.srt); si no, reutilizar el
            // parcial propio del Revisar Marcadores (.review.json) — solo si sus
            // ventanas cubren los cortes actuales (windowsCoverPairs).
            candidates.push(path.join(folders[f], base + ".json"));
            candidates.push(path.join(folders[f], base + ".srt"));
            candidates.push(path.join(folders[f], base + ".review.json"));
        }

        for (var c = 0; c < candidates.length; c++) {
            var r = readTranscriptFile(candidates[c]);
            if (!r) continue;
            // Transcript parcial: reutilizar solo si cubre los cortes actuales
            if (r.partial && r.windows && pairs) {
                if (!MR.windowsCoverPairs(r.windows, pairs)) continue;
            }
            // Completo: tiene que corresponder a ESTA versión de la secuencia. Un
            // transcript de la secuencia ya cortada tiene las mismas palabras con
            // otros tiempos y mueve los marcadores a minutos de donde se habla.
            if (!r.partial && !coverageOk(r, pairs, candidates[c])) continue;
            return r;
        }
        return null;
    }

    /**
     * WAV de la secuencia, para medir los bordes contra el sonido en vez de contra
     * los tiempos del transcript. Se busca en las mismas carpetas que el transcript
     * y se exige que la duración cuadre con la secuencia: el WAV de la versión ya
     * cortada comparte el nombre base y mediría los cortes contra otro audio.
     * @returns {{file, info}|null}
     */
    function loadWavFromDisk(seqName) {
        var AO = global.EPAudioOnset;
        if (!AO || !AO.available() || !seqName) return null;
        var base = sanitizeBaseName(seqName);
        var folders = transcribeFolders();
        for (var i = 0; i < folders.length; i++) {
            var wav = AO.findWav(folders[i], base, mrState.duration || 0);
            if (wav) return wav;
        }
        return null;
    }

    /** ¿El transcript cubre los marcadores y la duración actual de la secuencia? */
    function coverageOk(transcript, pairs, filePath) {
        var MV = global.EPMarkerVerify;
        if (!MV || !MV.checkCoverage) return true;

        var times = [];
        for (var i = 0; i < (pairs || []).length; i++) {
            times.push(pairs[i].inMarker.startSeconds);
            times.push(pairs[i].outMarker.startSeconds);
        }
        var cov = MV.checkCoverage(transcript.words, {
            sequenceDuration: mrState.duration || 0,
            savedDuration: transcript.durationSeconds || 0,
            markerTimes: times
        });
        if (!cov.ok) {
            log(null, "Transcript descartado (" + cov.code + "): " + cov.message +
                (filePath ? " [" + filePath + "]" : ""));
        }
        return cov.ok;
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
                        // Invalidar cachés propios del Revisar Marcadores hechos con
                        // un pipeline viejo (sin flags anti-alucinación / filtro de
                        // loops) → forzar re-transcripción.
                        if (raw.savedBy === "marker-reviewer" && (raw.pipelineVersion || 0) < STT_PIPELINE_VERSION) {
                            return null;
                        }
                        return { words: cleanWords(raw.words), text: raw.text || "", language: raw.language || "es",
                            partial: !!raw.partial, windows: raw.windows || null,
                            durationSeconds: raw.durationSeconds || 0,
                            alignedToAudio: !!raw.alignedToAudio,
                            savedBy: raw.savedBy || "", pipelineVersion: raw.pipelineVersion || 0 };
                    }
                } catch(_re) {}
                var parsed = global._epParseTranscriptJson ? global._epParseTranscriptJson(filePath) : null;
                if (parsed && parsed.words && parsed.words.length > 5) {
                    parsed.words = cleanWords(parsed.words);
                    return parsed;
                }
            } else if (/\.srt$/i.test(filePath)) {
                var content = fs.readFileSync(filePath, "utf8");
                var segments = global._epParseSRT ? global._epParseSRT(content) : null;
                if (segments && segments.length > 3 && global._epSrtSegmentsToSttResult) {
                    var sttResult = global._epSrtSegmentsToSttResult(segments);
                    if (sttResult && sttResult.words && sttResult.words.length > 5) {
                        sttResult.words = cleanWords(sttResult.words);
                        return sttResult;
                    }
                }
            }
        } catch(_e) {}
        return null;
    }

    /**
     * Tiempos del STT medidos contra el WAV antes de guardarlos. El STT adelanta el
     * arranque de la primera palabra de cada toma (8.5 frames de mediana, hasta 43 en
     * una clase medida), así que sin esto los bordes se corrigen uno a uno más tarde y
     * el transcript guardado se queda con los tiempos malos para todo lo demás.
     *
     * @param {boolean} alreadyClean transcript que ya pasó por aquí: se realinea pero
     *        no se vuelve a filtrar (el filtro de palabras que no suenan es para lo
     *        que acaba de salir del STT)
     * @returns {Object|null} las stats de la alineación, o null si no se pudo medir
     */
    function alignToAudio(session, result, alreadyClean) {
        var AO = global.EPAudioOnset;
        if (!AO || !AO.available() || !result.words || !result.words.length) return null;
        var wav = loadWavFromDisk(session && session.seqName);
        if (!wav) {
            log(session, "Sin WAV que cuadre con la secuencia: los tiempos quedan como los dio el STT");
            return null;
        }
        try {
            var opts = precisionOpts();
            var words = result.words, dropped = 0;
            // En un transcript por ventanas casi toda palabra queda "aislada" (el
            // silencio de fuera de la ventana no es silencio de la clase), así que ahí
            // no se descarta nada: solo se alinea lo que hay.
            if (!result.partial && !alreadyClean) {
                var clean = AO.dropSilentWords(wav, words, opts);
                words = clean.words;
                dropped = clean.dropped.length;
            }
            var res = AO.alignWords(wav, words, opts);
            result.words = res.words;
            result.alignedToAudio = true;
            log(session, "Tiempos alineados al audio: " + res.stats.movedStarts +
                " arranque(s) y " + res.stats.movedEnds + " final(es) de " +
                res.stats.runs + " tramo(s)" +
                (res.stats.medianStartShift ? ", el STT se adelantaba " +
                    (res.stats.medianStartShift * 1000).toFixed(0) + " ms de mediana" : "") +
                (dropped ? " · " + dropped + " palabra(s) descartadas por no sonar" : ""));
            return res.stats;
        } catch (e) {
            log(session, "No se pudieron alinear los tiempos al audio: " + e.message);
        }
        return null;
    }

    /**
     * Un transcript que ya está en Transcribe/ se vuelve a medir contra el WAV antes
     * de usarlo. Cuesta lo que una alineación (menos de un segundo si ya está bien,
     * porque la primera pasada no mueve nada y se corta) y arregla los que se
     * guardaron con una alineación de una sola pasada, que dejaba finales de palabra
     * estirados sobre el silencio.
     *
     * Importa más de lo que parece: con un final inflado, un cierre bien puesto se lee
     * como corte a mitad de palabra y como "no cierra en la frase de la nota", y la
     * revisión denuncia un corte correcto sin poder arreglarlo. Y de estos tiempos
     * viven también el editor de transcript, el buscador de repeticiones y los SRT.
     */
    function realignCached(session, cached) {
        var stats = alignToAudio(session, cached, true);
        if (!stats || (!stats.movedStarts && !stats.movedEnds)) return;
        saveWordsToDisk(session.seqName, cached);
    }

    function saveWordsToDisk(seqName, result) {
        if (!fs || !path) return;
        var folder = state && state.transcribeFolder;
        if (!folder) return;
        try {
            // Un transcript PARCIAL (ventanas alrededor de los cortes) SIEMPRE
            // se guarda como <seq>.review.json, nunca como <seq>.json: ese último
            // es el que la card de Transcripción (transcript-cache) auto-carga,
            // y un transcript incompleto no debe aparecer ahí. El .review.json
            // solo lo reutiliza el propio Revisar Marcadores (loadWordsFromDisk).
            var base = sanitizeBaseName(seqName);
            var fullPath = path.join(folder, base + ".json");
            var dest = result.partial ? path.join(folder, base + ".review.json") : fullPath;
            fs.writeFileSync(dest, JSON.stringify({
                words: result.words,
                text: result.text || "",
                language: result.language || "es",
                partial: !!result.partial,
                windows: result.windows || null,
                alignedToAudio: !!result.alignedToAudio,
                // Reescribir un transcript ajeno (solo para realinearlo) no lo
                // convierte en uno nuestro: quién lo hizo y con qué pipeline decide
                // si algún día hay que rehacerlo, y eso no cambia por medirle los
                // tiempos otra vez.
                savedBy: result.savedBy || "marker-reviewer",
                pipelineVersion: result.pipelineVersion || STT_PIPELINE_VERSION,
                // Sella con qué duración de secuencia se hizo: así se sabe después
                // si el timeline cambió (corte, restore) y el transcript ya no vale.
                durationSeconds: result.durationSeconds || mrState.duration || 0,
                sequenceName: seqName
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
            realignCached(session, cached);
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
                            if (result.regionFallbackReason) {
                                log(session, "Modo rápido por ventanas falló → se transcribió TODO el audio. Motivo por ventana: " + result.regionFallbackReason);
                                showToast("El modo rápido por ventanas no dio resultado; se transcribió la secuencia completa. Revisá el Log para el detalle.", "info");
                            } else {
                                log(session, "FFmpeg no disponible → se transcribió TODO el audio (instala ffmpeg para recortar por ventanas)");
                                showToast("Sin ffmpeg: se transcribió toda la secuencia. Instala ffmpeg (brew install ffmpeg) para acelerar.", "info");
                            }
                        }
                        log(session, "Transcripción: " + result.words.length + " palabras" + (result.partial ? " (ventanas alrededor de los cortes)" : " (completa)"));
                        if (result.regionDiagnostics && result.regionDiagnostics.length) {
                            log(session, "Ventanas con aviso: " + result.regionDiagnostics.join(" | "));
                        }
                        alignToAudio(session, result);
                        saveWordsToDisk(session.seqName, result);
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

    // mrState.override lo fija runHeadless (The Cutter) para no depender de los
    // checkboxes de la card cuando el pipeline corre sin UI.
    function isWindowedMode() {
        if (mrState.override) return !!mrState.override.windowed;
        var cb = $("mrv-windowed");
        return cb ? cb.checked : true;
    }

    // Nota: el Revisar Marcadores NO publica su transcript en la card de
    // "Transcripción" ni en Notas de Grabación a propósito. Transcribe solo las
    // ventanas alrededor de los cortes (parcial) y ese transcript incompleto no
    // debe contaminar la herramienta de Transcripción. Se usa solo internamente
    // (análisis + cache en disco para no re-transcribir).

    // ─── Análisis por elección de punto de corte (preciso) ───

    /**
     * Pistas para el LLM: lo que los detectores determinísticos ya saben del
     * borde (retoma repetida al inicio del bloque siguiente, conteo "3,2,1").
     * Aquí NO se proponen movimientos: solo se le cuenta al LLM lo que se
     * detectó para que elija mejor el punto de corte.
     * Claves: "IN:<pairIdx>" / "OUT:<pairIdx>".
     */
    function buildPreciseHints(pairs, words) {
        var hints = {};
        var segs = pairs.map(function(p) {
            return { inTime: p.inMarker.startSeconds, outTime: p.outMarker.startSeconds };
        });
        try {
            if (global.EPCutValidator) {
                var pickups = global.EPCutValidator.detectPickups(words, segs);
                for (var i = 0; i < pickups.length; i++) {
                    var pk = pickups[i];
                    if (pk.type !== "pickup") continue;
                    hints["OUT:" + pk.prevSegPos] = "el bloque siguiente vuelve a decir \"" + (pk.matchText || "") +
                        "\", así que el final de este bloque debería quedar ANTES de esa frase repetida";
                }
            }
        } catch(e) {}
        try {
            var leadIns = MR.detectLeadIns(words, pairs);
            for (var d = 0; d < leadIns.length; d++) {
                hints["IN:" + leadIns[d].pairIdx] = "parece haber un conteo o cue de producción al inicio; " +
                    "el bloque debería empezar en la primera frase real";
            }
        } catch(e2) {}
        return hints;
    }

    // Una aparición de la frase más lejos que esto no se ofrece como opción: el
    // transcript del prompt se dibuja entre el primer y el último candidato, y
    // meter un punto a minutos de distancia acabaría mandando media clase.
    var CUE_FORCE_SEC = 45;

    /**
     * Opciones de precisión con las apariciones de la frase del CD como candidatas.
     *
     * Cuando la frase se grabó VARIAS veces (`ambiguous`), esas apariciones son las
     * **únicas** opciones: la pregunta ya no es dónde cortar, es cuál de las tomas.
     * Con la ventana entera el LLM se va a otro sitio — caso real del bloque 1: la
     * frase estaba en 81.3s y 98.1s, y eligió 101.3s, justo después de ella, dejando
     * el bloque abriendo con la frase siguiente y el arranque perdido.
     */
    function cueOpts(anchor, markerTime) {
        var base = precisionOpts();
        if (!anchor || !anchor.matches || anchor.matches.length === 0) return base;

        var times = [];
        for (var i = 0; i < anchor.matches.length; i++) {
            var m = anchor.matches[i];
            if (Math.abs(m.time - markerTime) <= CUE_FORCE_SEC) times.push(m.time);
        }
        if (times.length === 0) return base;

        var out = {};
        for (var k in base) { if (base.hasOwnProperty(k)) out[k] = base[k]; }
        out.forceTimes = times;
        out.cueTimes = times;
        out.onlyForced = !!anchor.ambiguous && times.length > 1;
        return out;
    }

    /**
     * ¿La frase del CD es solo un trozo? El CD recorta los comentarios a ~50
     * caracteres y a veces del texto del bloque sobrevive "Y ah": no se puede buscar
     * en el transcript, pero es lo único que dice con qué abre el bloque.
     */
    function cuePartial(cue, kind) {
        var AN = global.EPMarkerAnchor;
        if (!cue || !AN || !AN.cueSearchable) return false;
        return !AN.cueSearchable(cue, kind, precisionOpts());
    }

    /**
     * Qué frase del CD ve el LLM. Si se pudo buscar y no aparece en el transcript,
     * no es texto hablado (será un recado del CD) y no se le pasa. Una frase
     * demasiado corta para buscarla sí: sin ella el LLM descarta el arranque real
     * por parecerle una transición — caso real, tiró "Y ahora sí," y abrió el bloque
     * 0.6s más tarde, donde además no cabía el colchón de aire.
     */
    function cueForPrompt(byNote, kind) {
        if (!byNote.cue) return "";
        if (byNote.anchor && byNote.anchor.ok) return byNote.cue;
        return cuePartial(byNote.cue, kind) ? byNote.cue : "";
    }

    /** Qué contarle al LLM sobre la frase del CD cuando no alcanzó para decidir. */
    function anchorHint(anchor) {
        if (!anchor || !anchor.ok) return "";
        if (anchor.ambiguous) {
            return "la frase de la nota se dice " + (anchor.rivals.length + 1) +
                " veces por aquí: hay que quedarse con la toma buena";
        }
        if (anchor.tooFar) {
            return "la frase de la nota aparece en t=" + anchor.time.toFixed(1) + "s, a " +
                Math.round(Math.abs(anchor.shiftSec)) + "s del marcador: puede ser otra toma";
        }
        return "la frase de la nota coincide al " + Math.round(anchor.score * 100) +
            "% en t=" + anchor.time.toFixed(1) + "s";
    }

    /**
     * Por qué la nota del CD no bastó para ubicar el corte. Va al log: sin esto
     * un borde que acaba en manos del LLM no dice si es que no había nota, si la
     * frase se grabó varias veces o si cayó lejos.
     */
    function noteMissReason(byNote, kind) {
        if (!byNote.cue) return "el marcador no trae escrita la frase del bloque";
        var a = byNote.anchor;
        if (!a || !a.ok) {
            if (cuePartial(byNote.cue, kind)) {
                return "la frase escrita (\"" + byNote.cue + "\") es demasiado corta para buscarla, " +
                    "se le pasa al LLM como pista";
            }
            return "la frase \"" + byNote.cue + "\" no aparece en el transcript";
        }
        if (a.ambiguous) return "la frase se grabó " + (a.rivals.length + 1) + " veces por aquí";
        if (a.tooFar) {
            return "la frase aparece a " + Math.round(Math.abs(a.shiftSec)) +
                "s del marcador (probablemente otra toma)";
        }
        if (a.confident) return "la frase se ubica pero no cae en una frontera de palabra";
        return "la frase coincide solo al " + Math.round(a.score * 100) + "%";
    }

    /**
     * Estrategia de precisión, en dos tiempos:
     *   1. La NOTA DEL CD. El marcador ya trae escrita la frase con la que el
     *      bloque abre ("PV -  Del lado cualitativo podemos tener, qué") o cierra
     *      ("OUT: ...la que vamos a considerar."). Si esa frase se ubica en el
     *      transcript sin ambigüedad, el corte va ahí. Sin LLM.
     *   2. Solo si la nota no alcanza (no hay nota, la frase se grabó varias veces
     *      o queda lejos) se le pregunta al LLM, y se le pregunta bien: ve la
     *      frase de la nota y sus apariciones marcadas entre las opciones.
     *
     * En ambos casos el corte cae en una frontera de palabra con su colchón de
     * aire: el LLM elige un número, nunca un tiempo.
     */
    /** Las palabras habladas que caben enteras en [from, to]. */
    function spanOf(words, from, to) {
        var out = [];
        for (var i = 0; i < (words || []).length; i++) {
            var w = words[i];
            if (w.type && w.type !== "word") continue;
            if (w.start < from - 0.001 || w.end > to + 0.001) continue;
            out.push(w);
        }
        return out;
    }

    /** Solo las palabras habladas (el STT mete marcas de espaciado entre medias). */
    function spokenOf(words) {
        var out = [];
        for (var i = 0; i < (words || []).length; i++) {
            if (!words[i].type || words[i].type === "word") out.push(words[i]);
        }
        return out;
    }

    function analyzeSessionPrecise(session, onProgress, callback) {
        var MP = global.EPMarkerPrecision;
        var AN = global.EPMarkerAnchor;
        if (!MP) return callback("Falta marker-precision.js", []);
        if (!aiAnalyzer) return callback("El proveedor de IA no está inicializado.", []);

        var pairs = session.pairs;
        var words = session.words;
        var hints = buildPreciseHints(pairs, words);
        // Contexto que trae quien pide la revisión: lo que el revisor de coherencia dijo
        // de este borde al leer la clase entera.
        if (session.extraHints) {
            for (var h in session.extraHints) {
                if (session.extraHints.hasOwnProperty(h)) hints[h] = session.extraHints[h];
            }
        }
        var proposals = [];
        var errors = [];
        var anchored = 0;
        var MIN_CHANGE = MIN_CHANGE_SEC;

        // Bordes que el revisor de coherencia señaló al leer la clase entera. Su palabra
        // vale lo mismo que el recado del CD: obliga a volver a preguntar si el bloque se
        // lleva algo que sobra, incluso cuando la repetición no se puede medir palabra
        // por palabra (que es el caso que él ve y los detectores no).
        var recheck = session.recheck || {};

        // `session.only` acota la revisión a unos bordes concretos: es lo que usa la
        // relectura de la clase para volver solo sobre los bloques que salieron mal.
        var boundaries = [];
        if (session.only && session.only.length) {
            for (var o = 0; o < session.only.length; o++) {
                boundaries.push({ kind: session.only[o].kind, pairIdx: session.only[o].pairIdx });
            }
        } else {
            for (var b = 0; b < pairs.length; b++) {
                boundaries.push({ kind: "IN", pairIdx: b });
                boundaries.push({ kind: "OUT", pairIdx: b });
            }
        }
        var idx = 0;

        function markerFor(bnd) {
            return bnd.kind === "IN" ? pairs[bnd.pairIdx].inMarker : pairs[bnd.pairIdx].outMarker;
        }

        /** Dónde está ese borde ahora mismo: lo ya decidido, o el marcador del CD. */
        function effTime(kind, pairIdx) {
            for (var i = 0; i < proposals.length; i++) {
                if (proposals[i].kind === kind && proposals[i].pairIdx === pairIdx) {
                    return proposals[i].newTime;
                }
            }
            var m = kind === "IN" ? pairs[pairIdx].inMarker : pairs[pairIdx].outMarker;
            return m.startSeconds;
        }

        /**
         * El territorio del borde: el bloque de al lado. Un OUT que cae después del IN
         * siguiente no es un corte tardío, es un bloque que deja de existir — y el
         * recorte de emergencia lo deja pegado al IN, que es lo que se ve en la
         * timeline (clase 15, bloque 4: el OUT se fue a la retoma de su propia frase,
         * ya dentro del bloque 5). Con el límite puesto **antes** de decidir, la toma
         * que sí es de este bloque suele quedarse sola y no hay nada que recortar.
         * @returns {{minTime, maxTime}}
         */
        function limitsFor(bnd) {
            if (bnd.kind === "IN") {
                // La banda del IN (los ~10s que el CD le da al marcador) es un TECHO:
                // el bloque no abre más adelante de donde el CD marcó la apertura.
                var band = MR.markerBand ? MR.markerBand(pairs[bnd.pairIdx].inMarker) : null;
                var ceiling = effTime("OUT", bnd.pairIdx);
                if (band && band.end < ceiling) ceiling = band.end;
                return {
                    minTime: bnd.pairIdx > 0 ? effTime("OUT", bnd.pairIdx - 1) : null,
                    maxTime: ceiling
                };
            }
            return {
                minTime: effTime("IN", bnd.pairIdx),
                maxTime: bnd.pairIdx + 1 < pairs.length ? effTime("IN", bnd.pairIdx + 1) : null
            };
        }

        /** Copia de las opciones con el territorio del bloque puesto. */
        function withLimits(base, limits) {
            var o = {};
            for (var k in base) if (base.hasOwnProperty(k)) o[k] = base[k];
            if (limits.minTime != null) o.minTime = limits.minTime;
            if (limits.maxTime != null) o.maxTime = limits.maxTime;
            return o;
        }

        function insideLimits(time, limits) {
            if (limits.minTime != null && time <= limits.minTime) return false;
            if (limits.maxTime != null && time >= limits.maxTime) return false;
            return true;
        }

        function finish() {
            dropOverlaps();
            proposals.sort(function(a, b2) { return a.originalTime - b2.originalTime; });

            var err = null;
            if (errors.length > 0) {
                err = "El LLM falló en " + errors.length + " de " + boundaries.length +
                    " consultas: " + errors[0];
            }
            session.anchoredCount = anchored;
            log(session, "Precisión: " + proposals.length + " ajuste(s) de " + boundaries.length + " bordes" +
                (anchored ? " · " + anchored + " por la nota del CD" : "") +
                (errors.length ? " · " + errors.length + " error(es) del LLM" : ""));
            callback(err, proposals);
        }

        /**
         * Repaso final por si un ajuste se pisa con su vecino. Cada borde ya se decide
         * dentro de su bloque, así que aquí no debería quedar nada; lo que quede se
         * **descarta** en vez de recortarse al tiempo del vecino, que es lo que dejaba
         * el OUT exactamente encima del IN siguiente: dos marcadores en el mismo frame
         * no son un bloque de duración cero, son un bloque que al releer los
         * marcadores ya no se puede emparejar.
         */
        function dropOverlaps() {
            for (var p = 0; p < pairs.length; p++) {
                if (blockOk(p)) continue;
                drop("OUT", p, effTime("OUT", p) <= effTime("IN", p)
                    ? "el OUT quedaba antes del IN de su bloque"
                    : "el OUT quedaba sobre el IN del bloque " + (p + 2));
                if (blockOk(p)) continue;
                // Si el bloque sigue roto, lo rompió el otro borde: se deshace también.
                // Los marcadores del CD vienen bien ordenados, así que quitando los
                // movimientos siempre se vuelve a un estado válido.
                drop("IN", p, "el bloque seguía sin existir");
                if (!blockOk(p) && p + 1 < pairs.length) {
                    drop("IN", p + 1, "se metía en el bloque " + (p + 1));
                }
            }
        }

        function blockOk(p) {
            var outT = effTime("OUT", p);
            var nextIn = p + 1 < pairs.length ? effTime("IN", p + 1) : Infinity;
            return outT > effTime("IN", p) && outT < nextIn;
        }

        function drop(kind, pairIdx, why) {
            for (var i = 0; i < proposals.length; i++) {
                if (proposals[i].kind !== kind || proposals[i].pairIdx !== pairIdx) continue;
                log(session, kind + " del bloque " + (pairIdx + 1) + ": ajuste descartado, " +
                    why + " (se queda en " + proposals[i].originalTime.toFixed(2) + "s)");
                proposals.splice(i, 1);
                return;
            }
        }

        /**
         * Único sitio por el que entran los ajustes: el punto elegido en el
         * transcript se mide contra el audio antes de guardarlo.
         * @returns {number|null} el tiempo final, o null si no valía la pena mover
         */
        function addProposal(bnd, marker, time, reason) {
            var placed = audioSnap(time, bnd.kind);
            placed = clampToBlock(bnd, placed);
            if (placed == null) return null;
            if (Math.abs(placed - marker.startSeconds) < MIN_CHANGE) return null;
            logBand(bnd, marker, placed);
            proposals.push({
                kind: bnd.kind,
                pairIdx: bnd.pairIdx,
                marker: marker,
                originalTime: marker.startSeconds,
                newTime: placed,
                reason: reason,
                repeatedPhrase: "",
                selected: true,
                snippet: MR.snippetAround(words, placed, 6)
            });
            return placed;
        }

        /**
         * Deja en el log cuándo un IN acaba fuera de la banda que el CD le dio. No
         * corrige nada: es la medida de si la convención de los ~10s se cumple, y sin
         * ella no hay forma de saber si esa banda se puede usar para algo más.
         */
        function logBand(bnd, marker, placed) {
            if (bnd.kind !== "IN" || !MR.markerBand || !MR.bandVerdict) return;
            var band = MR.markerBand(marker);
            if (!band) return;
            var verdict = MR.bandVerdict(band, placed);
            if (!verdict) return;
            log(session, "  el IN queda " + (verdict === "late" ? "después del final" : "antes del inicio") +
                " de la banda del marcador (" + band.start.toFixed(1) + "s–" +
                band.end.toFixed(1) + "s): " + placed.toFixed(1) + "s");
        }

        /**
         * Último filtro antes de guardar un ajuste: el corte tiene que caer dentro del
         * bloque. Aquí no debería llegar casi nada —los candidatos ya vienen acotados—
         * salvo el colchón, que puede empujar unos frames sobre el borde vecino; se
         * retrocede a la última frontera de palabra que sí cabe. Si ni esa cabe, no hay
         * ajuste: el marcador se queda donde el CD lo puso, que es peor sitio pero
         * sigue siendo un bloque.
         * @returns {number|null}
         */
        function clampToBlock(bnd, time) {
            var limits = limitsFor(bnd);
            if (insideLimits(time, limits)) return time;

            var spoken = spokenOf(words);
            var point = null;
            if (bnd.kind === "OUT" && limits.maxTime != null && time >= limits.maxTime) {
                for (var i = spoken.length - 1; i >= 0; i--) {
                    if (spoken[i].end >= limits.maxTime) continue;
                    point = MP.boundaryAt(words, spoken[i].end, "OUT", precisionOpts());
                    break;
                }
            } else if (bnd.kind === "IN" && limits.minTime != null && time <= limits.minTime) {
                for (var j = 0; j < spoken.length; j++) {
                    if (spoken[j].start <= limits.minTime) continue;
                    point = MP.boundaryAt(words, spoken[j].start, "IN", precisionOpts());
                    break;
                }
            } else if (bnd.kind === "IN" && limits.maxTime != null && time >= limits.maxTime) {
                // El IN se fue más adelante de lo que el bloque (o la banda del CD)
                // permite: se retrocede al último arranque de palabra que sí cabe.
                for (var k = spoken.length - 1; k >= 0; k--) {
                    if (spoken[k].start >= limits.maxTime) continue;
                    point = MP.boundaryAt(words, spoken[k].start, "IN", precisionOpts());
                    break;
                }
            }

            var label = bnd.kind + " del bloque " + (bnd.pairIdx + 1);
            if (point && insideLimits(point.time, limits)) {
                log(session, label + ": el corte caía en el bloque de al lado (" +
                    time.toFixed(2) + "s) → se recorta a " + point.time.toFixed(2) + "s");
                return point.time;
            }
            log(session, label + ": el corte caía en el bloque de al lado (" +
                time.toFixed(2) + "s) y no hay dónde recortarlo → se deja como estaba");
            return null;
        }

        // El WAV se abre una vez por sesión (solo la cabecera).
        var wav = null, wavTried = false;

        /**
         * El punto que salió del transcript, corregido contra el sonido. Whisper
         * estira la primera palabra de cada toma hacia el silencio (0.47s de mediana
         * en una clase real, hasta 1.4s), así que el colchón de frames calculado
         * sobre sus tiempos deja silencio muerto o se mete en el ataque de la
         * palabra. Aquí se mide el WAV y el corte se pega al sonido de verdad.
         *
         * Sin WAV, sin borde claro o con el aire ya correcto, manda el transcript.
         */
        function audioSnap(time, kind) {
            var AO = global.EPAudioOnset;
            if (!AO || !AO.available()) return time;
            if (!wavTried) {
                wavTried = true;
                wav = loadWavFromDisk(session.seqName);
                if (!wav) log(session, "Sin WAV de la secuencia: los cortes se miden solo con el transcript.");
            }
            if (!wav) return time;
            var m = AO.measure(wav, time, kind, audioOpts(words, time, kind));
            if (!m || !m.code) return time;
            log(session, "  medido en el audio: " + time.toFixed(2) + "s → " +
                m.applyTime.toFixed(2) + "s · " + m.message);
            return m.applyTime;
        }

        /** El comentario del CD tal como está escrito en el marcador. */
        function rawNote(marker) {
            if (!marker) return "";
            var c = marker.comments != null ? String(marker.comments) : "";
            var raw = c.replace(/^\s+|\s+$/g, "") ? c : String(marker.name || "");
            return raw.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
        }

        /**
         * Lo que el CD escribió en los marcadores que tocan este borde, LITERAL. El del
         * bloque de al lado entra a propósito: ahí es donde el CD apunta qué se rehace
         * ("revisar out -  Entonces, ya que está esa cadena, lo que"), y el cierre de
         * este bloque depende de eso.
         *
         * Extraerle la frase y tirar el resto —como hacía la regla que aplicaba
         * `out antes de "…"` al pie de la letra— deja fuera justamente la intención: el
         * CD cita la frase por la que arranca la retoma, no el punto exacto del corte.
         */
        function notesFor(bnd) {
            var pair = pairs[bnd.pairIdx];
            var out = [
                { label: "en el IN de este bloque", text: rawNote(pair.inMarker) },
                { label: "en el OUT de este bloque", text: rawNote(pair.outMarker) }
            ];
            if (bnd.kind === "OUT" && bnd.pairIdx + 1 < pairs.length) {
                out.push({ label: "en el IN del bloque " + (bnd.pairIdx + 2) + ", el que sigue",
                    text: rawNote(pairs[bnd.pairIdx + 1].inMarker) });
            } else if (bnd.kind === "IN" && bnd.pairIdx > 0) {
                out.push({ label: "en el OUT del bloque " + bnd.pairIdx + ", el anterior",
                    text: rawNote(pairs[bnd.pairIdx - 1].outMarker) });
            }
            return out;
        }

        /** Lo que dice el bloque de al lado: con qué se queda la clase tras el corte. */
        function neighbourFor(bnd) {
            if (bnd.kind === "OUT") {
                if (bnd.pairIdx + 1 >= pairs.length) return null;
                return {
                    label: "ASÍ ARRANCA EL BLOQUE " + (bnd.pairIdx + 2) +
                        " (lo que se queda después del corte)",
                    text: MP.headText(words, effTime("IN", bnd.pairIdx + 1),
                        effTime("OUT", bnd.pairIdx + 1), 45)
                };
            }
            if (bnd.pairIdx === 0) return null;
            return {
                label: "ASÍ TERMINA EL BLOQUE " + bnd.pairIdx +
                    " (lo que se queda antes del corte)",
                text: MP.tailText(words, effTime("IN", bnd.pairIdx - 1),
                    effTime("OUT", bnd.pairIdx - 1), 45)
            };
        }

        /**
         * Una instrucción explícita del CD sobre este borde (`out antes de "ya que está
         * esa cadena,"`). Puede estar escrita en cualquiera de los dos marcadores del
         * bloque —normalmente en el IN, delante de la frase de apertura—, así que se
         * buscan los dos.
         *
         * Da una propuesta, no la última palabra: la frase citada es por dónde la retoma
         * arranca, y el intento que sobra puede empezar varias frases antes (clase 15:
         * cortar justo antes de la frase citada dejaba dentro las dos frases con las que
         * el profesor había empezado el mismo intento).
         * @returns {object|null} {time, frontier, why, detail}
         */
        function fromDirective(bnd, marker, label, limits) {
            if (!AN || !AN.directivesFor) return null;
            var found = blockDirective(AN, pairs, bnd.pairIdx, bnd.kind);
            if (!found) return null;

            var res = AN.directiveAnchor(words, found, bnd.kind, marker.startSeconds,
                withLimits(precisionOpts(), limits));
            if (!res.ok || res.ambiguous) {
                log(session, label + ": la instrucción del CD (\"" + found.text + "\") no se pudo ubicar — " +
                    (res.ambiguous ? "la frase aparece varias veces en el bloque" : res.reason));
                return null;
            }
            var point = MP.boundaryAt(words, res.time, bnd.kind, precisionOpts());
            if (!point) return null;
            return {
                time: point.time,
                frontier: point.frontier,
                why: "El CD pide \"" + found.text + "\": el corte va " +
                    (found.side === "before" ? "antes" : "después") + " de esa frase, en \"" +
                    res.snippet + "\"",
                detail: "la instrucción del CD (\"" + found.text + "\") lo pone en t=" +
                    point.time.toFixed(1) + "s · \"" + res.snippet + "\""
            };
        }

        /** La frase del bloque, sin aplicarla: {cue, anchor}. */
        function readNote(bnd, marker, limits) {
            if (!AN) return { cue: "", anchor: null };
            var cue = AN.cueTextFor(marker, bnd.kind);
            if (!cue) return { cue: "", anchor: null };
            return {
                cue: cue,
                anchor: AN.anchorFor(words, cue, bnd.kind, marker.startSeconds,
                    withLimits(precisionOpts(), limits))
            };
        }

        /**
         * El marcador trae escrita la frase con la que el bloque abre o cierra
         * (convención del CD). Si esa frase se ubica en el transcript sin ambigüedad, ahí
         * va el corte salvo que la consulta encuentre una razón mejor.
         * @returns {object|null} {time, frontier, why, detail}
         */
        function fromAnchor(bnd, byNote) {
            var anchor = byNote.anchor;
            if (!anchor || !anchor.ok || !anchor.confident) return null;
            var point = MP.boundaryAt(words, anchor.time, bnd.kind, precisionOpts());
            if (!point) return null;
            return {
                time: point.time,
                frontier: point.frontier,
                why: "La nota del CD dice \"" + byNote.cue + "\": el bloque " +
                    (bnd.kind === "IN" ? "abre" : "cierra") + " en \"" + anchor.snippet + "\"",
                detail: "la frase del CD lo pone en t=" + point.time.toFixed(1) +
                    "s · \"" + anchor.snippet + "\""
            };
        }

        /**
         * ¿El IN abre a mitad de una toma que empieza tras un silencio largo? Solo
         * opina cuando la nota del CD no ubicó nada: si la nota abre el bloque a
         * mitad de toma a propósito, manda la nota. Con la frase grabada varias veces
         * también se calla — ahí el LLM está eligiendo entre tomas, y el arranque de
         * la toma buena depende de cuál elija.
         * @returns {object|null} {time, gapSec} el punto de corte del arranque
         */
        function takeStartPoint(bnd, marker, byNote) {
            var MV = global.EPMarkerVerify;
            if (bnd.kind !== "IN" || !MV || !MV.takeStartAt) return null;
            if (byNote.anchor && byNote.anchor.ambiguous) return null;
            var floor = bnd.pairIdx > 0 ? pairs[bnd.pairIdx - 1].outMarker.startSeconds : 0;
            var word = MV.takeStartAt(words, marker.startSeconds, floor, precisionOpts());
            if (!word) return null;
            var point = MP.boundaryAt(words, word.start, "IN", precisionOpts());
            if (!point) return null;
            var gap = gapBefore(word);
            return {
                time: point.time,
                frontier: point.frontier,
                why: "El bloque abría a mitad de la toma; la toma arranca tras " +
                    gap.toFixed(1) + "s de silencio",
                detail: "la toma arranca en t=" + point.time.toFixed(1) + "s, tras " +
                    gap.toFixed(1) + "s de silencio"
            };
        }

        /**
         * El punto elegido por el LLM, corregido si cae a mitad de una frase. El LLM
         * ve la lista de puntos de corte y a veces elige uno que parte la frase por
         * dentro: en el bloque 4 de una clase real abrió en "…una | cadena de
         * evidencia muestra…" diciendo que era "donde arranca la frase completa",
         * 1.3s después del "Por lo tanto" con el que la toma empezaba.
         *
         * Dónde empieza y acaba una frase no es una opinión, así que se arregla aquí
         * mismo en vez de dejarlo para la revisión del paso 5.
         */
        function snapToPhrase(bnd, time) {
            var MV = global.EPMarkerVerify;
            if (!MV || !MV.phraseStartWord) return time;
            var word;
            if (bnd.kind === "IN") {
                var floor = bnd.pairIdx > 0 ? pairs[bnd.pairIdx - 1].outMarker.startSeconds : 0;
                word = MV.phraseStartWord(words, time, floor, precisionOpts());
            } else {
                var ceil = bnd.pairIdx + 1 < pairs.length
                    ? pairs[bnd.pairIdx + 1].inMarker.startSeconds : 0;
                word = MV.phraseEndWord(words, time, ceil, precisionOpts());
            }
            if (!word) return time;
            var point = MP.boundaryAt(words, bnd.kind === "IN" ? word.start : word.end,
                bnd.kind, precisionOpts());
            if (!point) return time;
            log(session, "  el punto elegido caía a mitad de la frase: " + time.toFixed(2) +
                "s → " + point.time.toFixed(2) + "s (la frase " +
                (bnd.kind === "IN" ? "empieza" : "termina") + " en \"" +
                (word.text || word.word || "") + "\")");
            return point.time;
        }

        function gapBefore(word) {
            var prev = null;
            for (var i = 0; i < words.length; i++) {
                if (words[i] === word) break;
                if (words[i].type && words[i].type !== "word") continue;
                prev = words[i];
            }
            return prev ? Math.max(0, word.start - prev.end) : 0;
        }

        function next() {
            if (mrState.cancelled) return callback("Revisión cancelada.", proposals);
            if (idx >= boundaries.length) return finish();

            var bnd = boundaries[idx];
            var marker = markerFor(bnd);
            var label = bnd.kind + " del bloque " + (bnd.pairIdx + 1);
            var limits = limitsFor(bnd);
            onProgress(Math.round((idx / boundaries.length) * 100),
                "Validando " + label + " (" + (idx + 1) + "/" + boundaries.length + " bordes)...");
            decide(bnd, marker, label, limits);
        }

        /**
         * Cada borde se decide UNA vez y con todo delante: los comentarios del CD tal
         * como están escritos, lo que dice el bloque de al lado y los puntos de corte
         * posibles del bloque —incluidos los arranques de frase, que es donde empieza un
         * intento que se rehace.
         *
         * Lo determinístico (la orden del CD, la frase del bloque, el arranque de la
         * toma) entra como PROPUESTA marcada en la lista, y es lo que se aplica si la
         * consulta falla. Antes cada una de esas reglas cortaba el paso y decidía sola,
         * viendo media película: la orden `out antes de "…"` cerraba el bloque justo
         * antes de la frase citada y dejaba dentro el arranque del intento que el bloque
         * siguiente rehace, que es lo que el editor veía como "dejó la repetición".
         */
        function decide(bnd, marker, label, limits) {
            var byNote = readNote(bnd, marker, limits);
            // Toma nueva tras un silencio largo: dónde arranca es mecánico. Va detrás de
            // la orden y de la frase del CD, que sí son intención escrita.
            var proposal = fromDirective(bnd, marker, label, limits) ||
                fromAnchor(bnd, byNote) ||
                takeStartPoint(bnd, marker, byNote);

            // Con el borde ya ubicado, lo que queda por decidir es si el bloque se
            // lleva un intento que el vecino rehace. Eso no se mide: se pregunta, y con
            // todo delante. Se pregunta también cuando no hubo propuesta —el CD no
            // escribió nada de este borde— porque la repetición está ahí igual.
            var at = proposal ? proposal.time : marker.startSeconds;
            var retake = retakeCheck(bnd, marker, at, recheck[bnd.kind + ":" + bnd.pairIdx]);
            if (retake) return askRetake(bnd, marker, label, limits, proposal, retake, at);
            if (proposal) return apply(bnd, marker, label, proposal);

            var opts = withLimits(cueOpts(byNote.anchor, marker.startSeconds), limits);
            var built = MP.buildCandidates(words, marker.startSeconds, bnd.kind, opts);
            // Con una sola toma a la vista no hay nada que elegir: se le devuelve la
            // ventana entera para que al menos pueda ajustar el punto.
            if (opts.onlyForced && built.candidates.length < 2) {
                opts.onlyForced = false;
                built = MP.buildCandidates(words, marker.startSeconds, bnd.kind, opts);
            }
            log(session, label + ": " + noteMissReason(byNote, bnd.kind) +
                " → decide la IA con el contexto del bloque" +
                (opts.onlyForced ? " (solo entre las " + built.candidates.length +
                    " tomas de la frase)" : ""));

            if (built.candidates.length < 2) {
                log(session, label + ": sin puntos de corte alternativos en el transcript");
                return apply(bnd, marker, label, null);
            }

            var unit = {
                kind: bnd.kind,
                pairIdx: bnd.pairIdx,
                blockNum: bnd.pairIdx + 1,
                blockCount: pairs.length,
                markerTime: marker.startSeconds,
                candidates: built.candidates,
                current: built.current,
                cue: cueForPrompt(byNote, bnd.kind),
                cuePartial: cuePartial(byNote.cue, bnd.kind),
                notes: notesFor(bnd),
                neighbour: neighbourFor(bnd),
                hint: anchorHint(byNote.anchor) || hints[bnd.kind + ":" + bnd.pairIdx] || ""
            };

            var prompt = MP.buildChoicePrompt(unit, words, opts);
            var callStart = Date.now();
            aiAnalyzer._send(prompt.systemMsg, prompt.prompt, function(response) {
                if (mrState.cancelled) return;
                var secs = ((Date.now() - callStart) / 1000).toFixed(1);

                if (response && response.error) {
                    errors.push(response.error);
                    log(session, label + " (" + secs + "s): error del LLM — " + response.error);
                    return apply(bnd, marker, label, null);
                }
                var r = MP.resolveChoice(response, unit);
                if (r.ok && r.move) {
                    // Un punto confirmado que igual se mueve es el colchón: el marcador
                    // estaba pegado a la palabra.
                    var why = r.confirmed
                        ? ("Mismo punto, con el colchón de " + getPadFrames() + " frames de aire" +
                           (r.reason ? " · " + r.reason : ""))
                        : (r.reason || ("Punto de corte elegido por la IA (" + r.detail + ")"));
                    addProposal(bnd, marker, snapToPhrase(bnd, r.time), why);
                }
                log(session, label + " (" + secs + "s): " + r.detail +
                    (r.reason ? " · " + r.reason : ""));
                idx++;
                next();
            }, null, { numPredict: 300, think: false });
        }

        // Repetición a partir de la cual no hace falta que el CD haya escrito nada: con
        // esta cantidad de palabras seguidas dichas a los dos lados del corte, que sea
        // una retoma deja de ser una interpretación. Por debajo puede ser la clase
        // volviendo sobre un término, y ahí manda el recado del CD o el aviso.
        //
        // Medido sobre dos clases reales: la retoma de la clase 15 repite 5 palabras
        // (pero la señaló el CD, así que entra por la otra puerta) y el caso benigno de
        // la clase 14 repite 3. Bajar a 5 se probó y el modelo movió un IN 5.2s
        // explicando que "la frase no repite nada": el margen no da para menos.
        var STRONG_RETAKE_TOKENS = 6;

        // Cuánta clase se puede quitar cuando el CD NO pidió revisar el borde. Con
        // recado del CD no hay tope (lo pidió una persona, y el intento que sobra puede
        // ser largo); sin él —evidencia sola, o lo que apuntó la lectura de la clase— el
        // arreglo se queda cerca de lo que se pudo medir.
        var NO_NOTE_MAX_CUT_SEC = 4;

        /**
         * ¿Merece preguntar si este borde se lleva un intento entero? Siempre hace falta
         * **repetición medible** entre lo que este bloque dice y lo que el vecino vuelve
         * a decir; lo que la convierte en pregunta es una de estas dos:
         *
         *   · **El CD señaló el borde.** Con sus palabras, no con una fórmula: "revisar
         *     out", `out antes de "…"`, "sobra el cierre".
         *   · **La repetición es larga por sí sola** (`STRONG_RETAKE_TOKENS`). Sin esto,
         *     una retoma que el CD no alcanzó a anotar quedaba en aviso y la resolvía el
         *     editor a mano, que es justo el trabajo que hay que quitarle.
         *
         * Lo que NO se decide aquí es dónde cortar: el intento arranca varias frases
         * antes de donde se repiten las palabras y eso solo se ve leyendo (clase 15: la
         * repetición literal está en 1057.4s y el intento empieza en 1050.2s).
         * La excepción es `told`: cuando el revisor de coherencia leyó la clase cortada y
         * señaló este borde, se pregunta sin exigir repetición medible. Lo que él ve es
         * la idea repetida con otras palabras, que por definición no da match de tokens.
         *
         * @param {number} at el punto de corte de partida (la propuesta o donde está hoy)
         * @param {object} [told] lo que apuntó el revisor de la clase, si habló de este borde
         * @returns {object|null} la repetición medida, o null si no hay que preguntar
         */
        function retakeCheck(bnd, marker, at, told) {
            var MV = global.EPMarkerVerify;
            if (!MV || !MV.pickupOverlap || !AN || !AN.flagsBoundary) return null;
            var other = bnd.kind === "OUT" ? bnd.pairIdx + 1 : bnd.pairIdx - 1;
            if (other < 0 || other >= pairs.length) return null;

            // La repetición se mide sobre lo GRABADO, no sobre lo ya recortado: la
            // propuesta puede haber dejado la frase repetida fuera del bloque y aun así
            // el intento sigue dentro (clase 15).
            var lo = Math.min(effTime("IN", bnd.pairIdx), at, marker.startSeconds);
            var hi = Math.max(effTime("OUT", bnd.pairIdx), at, marker.startSeconds);
            var mine = wordsBetween(lo, hi);
            var near = wordsBetween(effTime("IN", other), effTime("OUT", other));
            var found = bnd.kind === "OUT" ? MV.pickupOverlap(mine, near, precisionOpts())
                                           : MV.pickupOverlap(near, mine, precisionOpts());
            if (told) return { note: told.detail || "lo apuntó la lectura de la clase",
                overlap: found, told: told };
            if (!found) return null;

            var notes = notesFor(bnd), flagged = "";
            for (var i = 0; i < notes.length && !flagged; i++) {
                var note = AN.noteFromText(notes[i].text, bnd.kind);
                if (AN.flagsBoundary(note, bnd.kind)) flagged = note;
            }
            if (!flagged && found.tokens < STRONG_RETAKE_TOKENS) return null;
            return { note: flagged, overlap: found };
        }

        function wordsBetween(from, to) {
            return spanOf(words, from, to);
        }

        /**
         * La consulta con el contexto completo: los comentarios del CD literales, lo que
         * dice el bloque de al lado, lo que este bloque deja dentro con el corte de ahora
         * y sus frases como opciones. El "está bien" es la opción [0] y la respuesta
         * normal: preguntar en abierto ("elige el mejor de estos 14 puntos") se midió
         * contra el modelo local y movía bordes que la nota del CD ya tenía bien.
         */
        function askRetake(bnd, marker, label, limits, proposal, retake, at) {
            var isIn = bnd.kind === "IN";
            var inT = effTime("IN", bnd.pairIdx), outT = effTime("OUT", bnd.pairIdx);
            var starts = MP.sentenceStarts(words, inT, outT, isIn ? "head" : "tail", precisionOpts());
            if (starts.length === 0) return apply(bnd, marker, label, proposal);

            var notes = notesFor(bnd);
            if (retake.told) {
                notes = notes.concat([{ label: "al leer la clase ya cortada",
                    text: retake.told.detail || "" }]);
            }
            var unit = {
                kind: bnd.kind, blockNum: bnd.pairIdx + 1, at: at,
                notes: notes, neighbour: neighbourFor(bnd), candidates: starts,
                mine: isIn
                    ? { label: "ASÍ ARRANCA ESTE BLOQUE CON EL CORTE DE AHORA",
                        text: MP.headText(words, at, outT, 30) }
                    : { label: "ASÍ TERMINA ESTE BLOQUE CON EL CORTE DE AHORA",
                        text: MP.tailText(words, inT, at, 30) }
            };
            var prompt = MP.buildRetakePrompt(unit, precisionOpts());
            var callStart = Date.now();
            log(session, label + ": " + retakeWhy(bnd, retake, isIn) +
                " → la IA revisa si sobra el intento (" + starts.length + " frases)");

            aiAnalyzer._send(prompt.systemMsg, prompt.prompt, function(response) {
                if (mrState.cancelled) return;
                var secs = ((Date.now() - callStart) / 1000).toFixed(1);
                var r = MP.resolveRetake(response, unit);
                if (!r.ok || !r.move) {
                    log(session, label + " (" + secs + "s): " + r.detail +
                        (r.reason ? " · " + r.reason : ""));
                    return apply(bnd, marker, label, proposal);
                }
                var point = MP.boundaryAt(words, r.time, bnd.kind, precisionOpts());
                var bad = retakeReject(bnd, point, at, limits, retake);
                if (bad) {
                    log(session, label + " (" + secs + "s): " + bad + " → se queda " +
                        (proposal ? "con lo que dijo el CD" : "donde está"));
                    return apply(bnd, marker, label, proposal);
                }
                var placed = addProposal(bnd, marker, point.time,
                    (isIn ? "El bloque " + bnd.pairIdx + " ya dice esto: el bloque abre en \""
                          : "El bloque " + (bnd.pairIdx + 2) + " rehace esto: el bloque cierra en \"") +
                    r.snippet + "\"" + (r.reason ? " · " + r.reason : ""));
                log(session, label + " (" + secs + "s): " + r.detail +
                    (placed == null ? " (ya estaba ahí)"
                                    : " (se mueve " + (placed - marker.startSeconds).toFixed(2) + "s)") +
                    (r.reason ? " · " + r.reason : ""));
                idx++;
                next();
            }, null, { numPredict: 300, think: false });
        }

        /** Por qué se está preguntando por este borde, para el log. */
        function retakeWhy(bnd, retake, isIn) {
            var neighbour = bnd.pairIdx + (isIn ? 0 : 2);
            var repeats = retake.overlap
                ? "el bloque " + neighbour + " repite " + retake.overlap.tokens + " palabras de este"
                : "";
            if (retake.told) {
                return "la lectura de la clase apuntó \"" + retake.note + "\"" +
                    (repeats ? " y " + repeats : "");
            }
            if (retake.note) return "el CD dejó dicho \"" + retake.note + "\" y " + repeats;
            return repeats;
        }

        /**
         * Las condiciones que el punto de la IA tiene que cumplir para quitar material:
         * caber en el bloque, ir en la dirección que quita el intento, no llevarse más
         * clase de la que dura la toma que lo sustituye y, si el CD no pidió revisar
         * este borde, quedarse en un arreglo corto.
         * @returns {string} el motivo del rechazo, o "" si el punto vale
         */
        function retakeReject(bnd, point, at, limits, retake) {
            if (!point) return "el punto de la IA no cae en una frontera de palabra";
            if (!insideLimits(point.time, limits)) return "el punto de la IA no cabe en el bloque";
            var isIn = bnd.kind === "IN";
            if (isIn ? point.time <= at : point.time >= at) {
                return "el punto de la IA no quita nada (" + point.time.toFixed(1) + "s)";
            }
            var other = isIn ? bnd.pairIdx - 1 : bnd.pairIdx + 1;
            var cut = Math.abs(point.time - at);
            var replaces = effTime("OUT", other) - effTime("IN", other);
            if (cut > replaces) {
                return "quitaría " + cut.toFixed(1) + "s, más de lo que dura la toma que lo " +
                    "sustituye (" + replaces.toFixed(1) + "s)";
            }
            // Quitar una toma entera necesita permiso. Lo da el CD por escrito, o lo da la
            // lectura de la clase CUANDO las palabras repetidas además se pueden medir.
            //
            // Los dos casos reales de la clase 15, leída con la repetición dentro: el
            // revisor señaló dos cierres y quiso quitar 10.5s en uno y 10.6s en el otro.
            // El bueno tiene 5 palabras repetidas con el bloque de al lado; el falso, cero.
            // Sin esa segunda prueba, un tope que dejara pasar el bueno dejaría pasar el
            // otro, y son 10s de clase que no sobraban.
            var allowed = retake && retake.note && (!retake.told || !!retake.overlap);
            if (!allowed && cut > NO_NOTE_MAX_CUT_SEC) {
                return "quitaría " + cut.toFixed(1) + "s sin prueba de que sobre (el tope " +
                    "en ese caso son " + NO_NOTE_MAX_CUT_SEC + "s)";
            }
            return "";
        }

        /** Aplica el punto que salió de lo que escribió el CD. */
        function apply(bnd, marker, label, proposal) {
            if (!proposal) {
                log(session, label + ": se queda donde está");
                idx++;
                return next();
            }
            var placed = addProposal(bnd, marker, proposal.time, proposal.why);
            if (placed !== null) anchored++;
            log(session, label + ": " + proposal.detail +
                (placed === null ? " (ya estaba ahí)"
                                 : " (se mueve " + (placed - marker.startSeconds).toFixed(2) + "s)"));
            idx++;
            next();
        }

        next();
    }

    // ─── Revisión del resultado (verificar y reajustar) ──────

    // Fallas que se arreglan volviendo a elegir el punto del borde. Las demás
    // (inverted, empty, too-short) hablan de cómo están puestos los marcadores,
    // no de dónde cae el corte: mover el borde no las resuelve.
    var FIXABLE_CODES = {
        "mid-word": 1, "mid-phrase": 1, "no-air": 1, "tight-air": 1,
        "lead-in": 1, "take-start": 1, "editor-cue": 1, "pickup": 1, "overlap": 1,
        "sense-in": 1, "sense-out": 1,
        "audio-clip": 1, "audio-air": 1
    };

    // Chequeos del transcript que hablan de milisegundos, no de contenido. Donde el
    // audio sí pudo medir el borde, estos se caen: se calculan sobre la rejilla de
    // palabras de Whisper, que en el arranque de cada toma está corrida medio
    // segundo, y pelearse con la medida del WAV mandaría el marcador de ida y vuelta
    // en cada ronda.
    var ACOUSTIC_CODES = { "mid-word": 1, "no-air": 1, "tight-air": 1 };

    /** Nombre en claro del código de falla: el log lo lee el editor. */
    function codeLabel(code) {
        var MV = global.EPMarkerVerify;
        var labels = (MV && MV.CODE_LABELS) || {};
        return labels[code] || code;
    }

    function blocksFromPairs(pairs) {
        var AN = global.EPMarkerAnchor;
        var blocks = [];
        for (var i = 0; i < pairs.length; i++) {
            blocks.push({
                inTime: pairs[i].inMarker.startSeconds,
                outTime: pairs[i].outMarker.startSeconds,
                inCue: AN ? AN.cueTextFor(pairs[i].inMarker, "IN") : "",
                outCue: AN ? AN.cueTextFor(pairs[i].outMarker, "OUT") : "",
                inDirective: AN ? blockDirective(AN, pairs, i, "IN") : null,
                outDirective: AN ? blockDirective(AN, pairs, i, "OUT") : null
            });
        }
        return blocks;
    }

    /**
     * La instrucción del CD sobre un borde. Se busca en los dos marcadores del bloque
     * y, para un cierre, también en el IN del bloque siguiente: ahí es donde el CD
     * apunta desde dónde se retomó (`out antes de "…"` o "retomamos desde …"), y eso
     * habla de ESTE cierre, no del suyo.
     *
     * Que la frase citada exista de verdad en el territorio de este bloque lo comprueba
     * `directiveAnchor`; si no, la instrucción no se aplica y queda en el log.
     */
    function blockDirective(AN, pairs, idx, kind) {
        if (!AN.directivesFor) return null;
        var pair = pairs[idx];
        var lists = [AN.directivesFor(pair.inMarker), AN.directivesFor(pair.outMarker)];
        if (kind === "OUT" && idx + 1 < pairs.length) {
            var nextIn = pairs[idx + 1].inMarker;
            lists.push(AN.directivesFor(nextIn));
            if (AN.retakeDirectiveFor) {
                var retake = AN.retakeDirectiveFor(nextIn, "IN");
                if (retake) lists.push([retake]);
            }
        }
        for (var l = 0; l < lists.length; l++) {
            for (var d = 0; d < lists[l].length; d++) {
                if (lists[l][d].kind === kind) return lists[l][d];
            }
        }
        return null;
    }

    /**
     * Relee los marcadores REALES de la secuencia, los verifica contra el
     * transcript y manda a la IA a re-elegir el punto de los bordes que no pasan.
     * Repite hasta maxRounds veces; lo que siga fallando se reporta sin tocar.
     *
     * @param {object} opts {seqId, words, onProgress, maxRounds}
     * @param {function} cb cb(err, {rounds, checked, fixed, remaining, result})
     */
    function verifyAndFix(opts, cb) {
        opts = opts || {};
        cb = cb || function() {};
        var MV = global.EPMarkerVerify;
        var MP = global.EPMarkerPrecision;
        if (!MV || !MP) return cb("Faltan los módulos de verificación de marcadores.");
        if (!MR) return cb("El módulo de marcadores no está disponible.");
        if (!aiAnalyzer) return cb("El proveedor de IA no está inicializado.");

        var words = opts.words || [];
        if (!words.length) return cb("No hay transcript con el que revisar los cortes.");

        // Cada ronda arregla un defecto por borde, así que un borde con dos cosas
        // que corregir necesita dos. Ahora que un arreglo no puede devolver el
        // marcador a un sitio ya visitado, las rondas se agotan solas y se puede dar
        // margen para acabar el trabajo en vez de terminar a medias.
        var maxRounds = opts.maxRounds || 4;
        var onProgress = opts.onProgress || function() {};
        var seqId = opts.seqId || "";
        var seqName = opts.seqName || (state && state.sequenceName) || "";
        var markersCall = seqId
            ? "getMarkersForSequence('" + escExtendStr(seqId) + "')"
            : "getSequenceMarkers()";

        var fixedTotal = 0;
        var round = 0;
        var history = [];
        // Por qué una guarda se negó a aplicar un arreglo. Hasta la v2.24.0 eso
        // terminaba en una línea de log y el punto al que iba el corte se perdía:
        // el reporte decía que el borde está mal y el sitio exacto donde debería
        // estar no se lo ofrecía a nadie.
        var refused = {};
        // Por dónde ha pasado ya cada borde. Dos chequeos pueden querer sitios
        // distintos para el mismo corte, y sin memoria el marcador va y vuelve
        // gastando rondas para acabar donde empezó (el log del 10-ago: un OUT a
        // 135.1s → 129.9s → 135.1s). Volver a un sitio ya visitado no es un arreglo.
        var visited = {};

        // Salida única: marca el revisor como ocupado mientras corre el lazo para
        // que no se lance una revisión manual encima, y lo libera siempre.
        var wasRunning = mrState.running;
        mrState.running = true;
        mrState.cancelled = false;
        function finish(err, res) {
            mrState.running = wasRunning;
            cb(err, res);
        }

        // "Detener" de quien orquesta (The Cutter) tiene que frenar el lazo: si no,
        // una llamada abortada cae al arreglo mecánico y se siguen moviendo
        // marcadores después de que el usuario pidió parar.
        function cancelled() {
            if (mrState.cancelled) return true;
            try { return !!(opts.isCancelled && opts.isCancelled()); } catch (e) { return false; }
        }

        function report(pairs, result) {
            // `blocking` es lo que de verdad impide cortar (la estructura del bloque
            // está mal). El resto de lo que quede es un borde discutible: se reporta
            // con el detalle a la vista, pero quien orquesta puede seguir.
            var blocking = [];
            for (var i = 0; i < result.failures.length; i++) {
                if (MV.isStructural(result.failures[i])) blocking.push(result.failures[i]);
            }
            var left = pendingAdjustments(pairs, result);
            finish(null, {
                rounds: round,
                checked: result.checked,
                fixed: fixedTotal,
                remaining: result.failures,
                blocking: blocking,
                warnings: result.warnings || [],
                adjustments: left.adjustments,
                observations: left.observations,
                seqId: seqId || null,
                seqName: seqName,
                words: words,
                result: result,
                notes: history
            });
        }

        /**
         * Lo que queda sin resolver, separado por si hay algo que hacer con ello.
         *
         * Un borde que sigue fallando y **tiene un sitio al que ir** es un empate,
         * no un misterio: el chequeo de sentido quiere un punto, la medida del WAV
         * quiere otro, y la memoria de posiciones frena el vaivén dejando el
         * marcador donde estaba. Eso lo rompe una persona mirando la onda dos
         * segundos, así que sale como propuesta con el punto y el motivo delante en
         * vez de morir en el log. Lo que no tiene punto al que ir es una
         * observación: se enseña, pero no hay botón que apretar.
         *
         * @returns {object} {adjustments, observations}
         */
        function pendingAdjustments(pairs, result) {
            var byBoundary = {}, order = [];
            var all = (result.failures || []).concat(result.warnings || []);

            for (var i = 0; i < all.length; i++) {
                var v = all[i];
                var marker = markerOf(v, pairs);
                if (!marker) continue;

                var anchor = FIXABLE_CODES[v.code] ? anchorFor(v) : null;
                var to = (anchor && Math.abs(anchor.time - marker.startSeconds) >= MIN_CHANGE_SEC)
                    ? anchor.time : null;
                var key = v.pairIdx + ":" + v.kind;
                var item = {
                    pairIdx: v.pairIdx, kind: v.kind, code: v.code,
                    label: codeLabel(v.code), message: v.message,
                    marker: marker, from: marker.startSeconds, to: to,
                    why: to != null ? (refused[key] || "se acabaron las rondas de revisión") : "",
                    snippet: to != null ? MR.snippetAround(words, to, 6) : "",
                    source: "revisión"
                };

                // Un borde puede acumular dos verdictos; manda el que sí sabe a
                // dónde ir, porque es el único con el que se puede hacer algo.
                if (!byBoundary[key]) { byBoundary[key] = item; order.push(key); }
                else if (to != null && byBoundary[key].to == null) byBoundary[key] = item;
            }

            var adjustments = [], observations = [];
            for (var k = 0; k < order.length; k++) {
                var entry = byBoundary[order[k]];
                if (entry.to != null) adjustments.push(entry);
                else observations.push(entry);
            }
            return { adjustments: adjustments, observations: observations };
        }

        function readAndVerify(done) {
            evalScript(markersCall, function(data) {
                if (data.error) return done(data.error);
                var parsed = MR.parsePairs(data.markers, { skipClapperboard: true });
                if (parsed.error) return done(parsed.error);
                var pairs = parsed.pairs;
                var blocks = blocksFromPairs(pairs);
                var audio = measureBlocks(blocks);
                var result = MV.verifyBlocks(words, blocks, precisionOpts());
                addSenseFailures(result, blocks);
                addAudioVerdicts(result, audio.measured);
                addUnmeasuredWarnings(result, audio.unmeasured);
                done(null, pairs, result);
            });
        }

        // El WAV se abre una vez por revisión (solo la cabecera; de cada borde se
        // leen unos cientos de KB).
        var wav = null, wavTried = false;
        function audioSource() {
            if (wavTried) return wav;
            wavTried = true;
            wav = loadWavFromDisk(seqName);
            if (!wav) {
                log(null, "Sin WAV de la secuencia: los bordes se revisan solo contra el transcript.");
            }
            return wav;
        }

        /**
         * Mide en el WAV los dos bordes de cada bloque: dónde arranca y dónde termina
         * el sonido de verdad, y con cuánto aire queda el corte.
         *
         * No toca los tiempos del bloque. Qué palabras entran lo decide el transcript
         * (por los finales de palabra, ver `marker-anchor`) y el audio decide el
         * frame; mezclar las dos cosas —sustituir el tiempo del bloque por el borde
         * del sonido— hacía que un OUT puesto justo después del cue del editor
         * pareciera cerrar limpio.
         *
         * @returns {object} medidas por borde ("3:IN"), solo las que el audio afirma
         */
        function measureBlocks(blocks) {
            var AO = global.EPAudioOnset;
            var audio = { measured: {}, unmeasured: [] };
            if (!AO || !AO.available()) return audio;
            var source = audioSource();
            if (!source) return audio;

            var fields = [["IN", "inTime"], ["OUT", "outTime"]];
            for (var i = 0; i < blocks.length; i++) {
                for (var k = 0; k < fields.length; k++) {
                    var kind = fields[k][0], field = fields[k][1];
                    var at = blocks[i][field];
                    var m = AO.measure(source, at, kind, audioOpts(words, at, kind));
                    if (!m) {
                        // Sin borde limpio manda el transcript, pero si además en el
                        // corte suena algo el borde queda señalado: es lo que en la
                        // timeline se ve como un marcador pegado a la onda, y no hay
                        // silencio al que moverlo — lo repasa una persona.
                        var lvl = AO.levelAt(source, at, precisionOpts());
                        if (lvl && lvl.onSound) {
                            audio.unmeasured.push({ pairIdx: i, kind: kind, time: at });
                        }
                        continue;
                    }
                    m.pairIdx = i;
                    m.kind = kind;
                    m.markerTime = at;
                    audio.measured[i + ":" + kind] = m;
                }
            }
            return audio;
        }

        /**
         * Bordes que el audio no pudo medir y que caen sobre sonido. Solo se avisan:
         * no hay a dónde moverlos (no hay silencio cerca) y las reglas de contenido
         * ya opinaron sobre ellos con el transcript.
         */
        function addUnmeasuredWarnings(result, list) {
            for (var i = 0; i < list.length; i++) {
                var u = list[i];
                result.warnings = result.warnings || [];
                result.warnings.push({
                    pairIdx: u.pairIdx,
                    kind: u.kind,
                    time: u.time,
                    ok: false,
                    code: "audio-unmeasured",
                    severity: "warn",
                    message: "Sin silencio limpio alrededor para medir el borde, y en el " +
                        "corte todavía suena algo: repasar a mano."
                });
            }
        }

        /**
         * Los veredictos del audio (el corte se mete en el sonido, o sobra silencio)
         * y la caída de los chequeos de milisegundos del transcript donde el audio ya
         * decidió. Van al final de `failures`, detrás de los de sentido: mover
         * contenido pesa más que ganar aire.
         */
        function addAudioVerdicts(result, measured) {
            var keys = [], key;
            for (key in measured) { if (measured.hasOwnProperty(key)) keys.push(key); }
            if (keys.length === 0) return;

            // Un mismo veredicto está en `boundaries` y en `failures`/`warnings`, así
            // que el aviso de descarte se escribe una sola vez por borde.
            var announced = {};
            function keep(list) {
                var out = [];
                for (var k = 0; k < list.length; k++) {
                    var v = list[k];
                    var key = v.pairIdx + ":" + v.kind;
                    if (ACOUSTIC_CODES[v.code] && measured[key]) {
                        if (!announced[key]) {
                            announced[key] = true;
                            log(null, v.kind + " del bloque " + (v.pairIdx + 1) + ": " +
                                codeLabel(v.code) + " lo decide el audio, no el transcript");
                        }
                        continue;
                    }
                    out.push(v);
                }
                return out;
            }

            result.failures = keep(result.failures);
            result.warnings = keep(result.warnings || []);
            result.boundaries = keep(result.boundaries || []);

            // Un punto donde el colchón no cabe es un corte metido en habla seguida:
            // el editor lo ve como "el marcador pisa el waveform" y no hay nada que
            // arreglar en el marcador — el silencio no existe. Se cuenta en el log
            // para que se pueda auditar, sin frenar el paso.
            var padSec = getPadFrames() / (mrState.fps || 25);
            for (var q = 0; q < keys.length; q++) {
                var tight = measured[keys[q]];
                if (tight.code || tight.edge.quietSec == null) continue;
                if (tight.edge.quietSec + 0.02 >= padSec) continue;
                log(null, tight.kind + " del bloque " + (tight.pairIdx + 1) + ": solo hay " +
                    tight.edge.quietSec.toFixed(2) + "s de silencio " +
                    (tight.kind === "IN" ? "antes de la frase" : "después de la frase") +
                    ", el corte queda con " + tight.airFrames.toFixed(1) + " frames de aire");
            }

            for (var j = 0; j < keys.length; j++) {
                var m = measured[keys[j]];
                if (!m.code) continue;
                var v = {
                    pairIdx: m.pairIdx,
                    kind: m.kind,
                    time: m.markerTime,
                    ok: false,
                    code: m.code,
                    severity: m.code === "audio-clip" ? "block" : "warn",
                    message: m.message,
                    targetTime: null,
                    applyTime: m.applyTime
                };
                result.boundaries.push(v);
                if (v.severity === "warn") result.warnings.push(v);
                else result.failures.push(v);
            }
            result.ok = result.failures.length === 0;
        }

        /**
         * La revisión mecánica (aire, palabras partidas, cues) no sabe de qué habla
         * la clase. Lo que dice si el corte tiene SENTIDO es la nota del CD: el
         * bloque tiene que abrir y cerrar con las frases que el marcador declara.
         * Esa revisión se añade aquí y pesa más que las demás.
         */
        function addSenseFailures(result, blocks) {
            var AN = global.EPMarkerAnchor;
            if (!AN) return;
            dropAgainstNote(result, blocks, AN);
            var sense = AN.senseVerdicts(words, blocks, precisionOpts());
            if (sense.length === 0) return;
            result.boundaries = sense.concat(result.boundaries);
            result.failures = sense.concat(result.failures);
            result.ok = result.failures.length === 0;
        }

        // Las dos reglas que mueven el borde a OTRO SITIO por lo que oyen alrededor:
        // "abre a mitad de la toma" (un silencio largo antes) y "el bloque siguiente
        // repite el final" (palabras que se repiten). Las dos son deducciones, y la
        // nota del CD no lo es: la escribió quien vio la clase.
        var NOTE_BEATS = { "take-start": 1, "pickup": 1, "mid-phrase": 1 };

        /**
         * Si la nota del CD dice que el bloque abre o cierra justo donde está el
         * marcador, ahí se queda: el CD habrá descartado a mano el arranque de la
         * toma o la frase que se repite (la clase repite frases porque de eso habla).
         *
         * Sin esta salvedad los dos chequeos se peleaban y el marcador iba y volvía
         * en cada ronda hasta agotarlas: el caso real que rompió el pipeline fue un
         * OUT que la repetición mandaba a 129.9s y la nota devolvía a 135.1s.
         *
         * La falla no se tira, se convierte en aviso: el borde queda a la vista con
         * las dos versiones para poder repasarlo, pero no frena el corte.
         */
        function dropAgainstNote(result, blocks, AN) {
            var kept = [];
            for (var i = 0; i < result.failures.length; i++) {
                var f = result.failures[i];
                if (!NOTE_BEATS[f.code] || !confirmedByNote(f, blocks, AN)) {
                    kept.push(f);
                    continue;
                }
                var label = f.kind + " del bloque " + (f.pairIdx + 1);
                history.push(label + ": " + codeLabel(f.code) +
                    ", pero es donde la nota del CD dice");
                result.warnings = (result.warnings || []).concat([{
                    pairIdx: f.pairIdx,
                    kind: f.kind,
                    time: f.time,
                    ok: false,
                    code: "note-conflict",
                    severity: "warn",
                    message: "La nota del CD manda aquí, pero la revisión ve " +
                        codeLabel(f.code) + ": " + f.message
                }]);
                f.ok = true;
                f.code = "";
            }
            result.failures = kept;
            result.ok = kept.length === 0;
        }

        /** ¿La nota del CD cae justo donde está este borde? */
        function confirmedByNote(f, blocks, AN) {
            var blk = blocks[f.pairIdx];
            if (!blk) return false;
            var opts = precisionOpts();

            // Una instrucción explícita ("out antes de …") manda sobre cualquier regla:
            // el CD ya dijo dónde va el corte y no hay nada que mejorar.
            var directive = f.kind === "IN" ? blk.inDirective : blk.outDirective;
            if (directive && AN.directiveAnchor) {
                var byDir = AN.directiveAnchor(words, directive, f.kind, f.time,
                    AN.withLimits(opts, AN.blockLimits(blocks, f.pairIdx, f.kind)));
                if (byDir.ok && !byDir.ambiguous && Math.abs(byDir.time - f.time) < 0.6) return true;
            }

            var cue = f.kind === "IN" ? blk.inCue : blk.outCue;
            if (!cue) return false;
            var anchor = AN.anchorFor(words, cue, f.kind, f.time, opts);
            if (!anchor.ok || !anchor.confident) return false;
            var frontier = AN.frontierAt(words, f.time, f.kind);
            return !!frontier && Math.abs(frontier.time - anchor.time) < 0.5;
        }

        /**
         * Memoria por borde, a media frame de tolerancia: un arreglo que devuelve el
         * marcador a un sitio del que ya salió es un empate entre dos chequeos, no
         * una mejora.
         */
        function visitKey(v) { return v.pairIdx + ":" + v.kind; }

        function refuse(v, why) { refused[visitKey(v)] = why; }

        function remember(v, time) {
            var key = visitKey(v);
            if (!visited[key]) visited[key] = [];
            visited[key].push(time);
        }

        function wasVisited(v, time) {
            var seenTimes = visited[visitKey(v)] || [];
            var tol = 0.5 / (mrState.fps || 25);
            for (var i = 0; i < seenTimes.length; i++) {
                if (Math.abs(seenTimes[i] - time) <= tol) return true;
            }
            return false;
        }

        /** Marcador de un borde, o null si el par ya no existe. */
        function markerOf(v, pairs) {
            var pair = pairs[v.pairIdx];
            if (!pair) return null;
            return v.kind === "IN" ? pair.inMarker : pair.outMarker;
        }

        /**
         * El punto que el detector señala, ya con su colchón y su snap a frame.
         * `targetTime` siempre es una frontera de palabra del tipo correcto (hay un
         * test que lo vigila), así que esto no depende de que la frontera esté
         * entre los candidatos que se le ofrecerían al LLM.
         */
        function anchorFor(v) {
            // Lo que midió el audio ya viene con colchón y alineado a frame: pasarlo
            // por la rejilla de palabras del transcript desharía justo la corrección.
            if (v.applyTime != null) return { time: v.applyTime };
            if (v.targetTime == null) return null;
            var b = MP.boundaryAt(words, v.targetTime, v.kind, precisionOpts());
            if (!b) return null;
            // El arreglo cae en la rejilla de Whisper, que en los arranques de toma
            // está corrida medio segundo: el frame final lo decide el audio, igual que
            // al proponer en el paso 4. Sin esto la ronda siguiente volvía a mover el
            // mismo marcador para ganar o quitar aire.
            return { time: snapToAudio(b.time, v.kind), frontier: b.frontier };
        }

        /** El frame que el WAV dice, si puede decirlo. */
        function snapToAudio(time, kind) {
            var AO = global.EPAudioOnset;
            if (!AO || !AO.available()) return time;
            var source = audioSource();
            if (!source) return time;
            var m = AO.measure(source, time, kind, audioOpts(words, time, kind));
            return (m && m.code && m.applyTime != null) ? m.applyTime : time;
        }

        /** ¿La reparación de este veredicto cae en el frame donde el marcador ya está? */
        function settledHere(anchor, marker) {
            return !!anchor && !!marker &&
                Math.abs(anchor.time - marker.startSeconds) < MIN_CHANGE_SEC;
        }

        /**
         * Un veredicto cuyo arreglo apunta a donde el marcador YA está se refuta solo:
         * la queja se calculó sobre la rejilla del transcript y la reparación —con su
         * colchón y el frame que dice el audio— vuelve al mismo sitio. Se retira.
         *
         * Antes esto se saltaba en silencio: el corte se quedaba bien puesto y el
         * informe seguía denunciándolo ronda tras ronda, sin nada que ofrecer ni que
         * aplicar. Es lo que el editor lee como "encontró algo y no hizo nada" (clase
         * 15, bloque 3: el cierre estaba exactamente en la frase que la nota pide, y
         * la queja era que no cerraba en ella).
         *
         * Se retiran de una vez todos los veredictos del mismo borde que reparen ahí:
         * a cada borde se le atiende uno por ronda, y dejar los otros repetiría el
         * informe con la misma queja disfrazada de otro código.
         */
        function settle(result, v, marker, label) {
            var key = visitKey(v);
            var names = [];
            function keep(list) {
                var out = [];
                for (var i = 0; i < (list || []).length; i++) {
                    var x = list[i];
                    if (x.code && visitKey(x) === key && settledHere(anchorFor(x), marker)) {
                        var name = codeLabel(x.code);
                        if (names.indexOf(name) < 0) names.push(name);
                        continue;
                    }
                    out.push(x);
                }
                return out;
            }
            result.failures = keep(result.failures);
            result.warnings = keep(result.warnings || []);
            result.boundaries = keep(result.boundaries || []);
            result.ok = result.failures.length === 0;
            if (!names.length) return;
            history.push(label + ": " + names.join(" y ") + " apunta al frame donde el " +
                "marcador ya está (" + fmtTime(marker.startSeconds) + "): nada que mover");
        }

        function fixRound(pairs, result, done) {
            // Un borde puede acumular dos avisos (p.ej. OUT con poco aire y además
            // solapado). Se arregla uno por ronda: dos movimientos del mismo
            // marcador en el mismo lote se pisarían entre sí. Las fallas van primero
            // porque pesan más que un aviso de aire.
            var targets = [];
            var seen = {};
            var proposals = [];

            function claim(v) {
                var key = v.pairIdx + ":" + v.kind;
                if (seen[key]) return false;
                seen[key] = true;
                return true;
            }

            // Este paso REPARA, no vuelve a decidir. Cada verdicto trae el punto
            // exacto donde debe caer el corte — `targetTime` (una frontera de palabra
            // del tipo correcto) o `applyTime` (el borde medido en el WAV) —, así que
            // el arreglo es mecánico y no gasta LLM. Volver a abrir la decisión aquí
            // era el defecto de la v2.13.1: al
            // LLM se le daba una ventana de candidatos para arreglar una palabra
            // partida y podía relocalizar el corte segundos adentro de la toma,
            // tirando el arranque que el paso 4 había elegido bien (caso real: un IN
            // que se movió de "¿Qué es la respuesta?" a "juntas te ayudan...", 5.4s
            // más tarde, comiéndose la entrada de la toma).
            //
            // Solo se le pregunta al LLM cuando no hay punto al que reparar: una
            // retoma que repite el bloque entero o un sentido que no se pudo ubicar.
            var mechanical = [];
            var i, f;
            function hasPoint(v) { return v.applyTime != null || v.targetTime != null; }

            for (i = 0; i < result.failures.length; i++) {
                f = result.failures[i];
                if (!FIXABLE_CODES[f.code] || !claim(f)) continue;
                if (hasPoint(f)) mechanical.push(f);
                else targets.push(f);
            }
            var warns = result.warnings || [];
            for (var w = 0; w < warns.length; w++) {
                f = warns[w];
                if (!FIXABLE_CODES[f.code] || !claim(f)) continue;
                if (hasPoint(f)) mechanical.push(f);
            }

            for (var m = 0; m < mechanical.length; m++) {
                var v = mechanical[m];
                var label = v.kind + " del bloque " + (v.pairIdx + 1);
                var marker = markerOf(v, pairs);
                var anchor = anchorFor(v);
                if (!marker || !anchor) {
                    if (marker) {
                        history.push(label + ": el punto del arreglo (" +
                            v.targetTime.toFixed(1) + "s) ya no es una frontera de palabra");
                    }
                    continue;
                }
                if (settledHere(anchor, marker)) { settle(result, v, marker, label); continue; }
                if (wasVisited(v, anchor.time)) {
                    history.push(label + ": " + codeLabel(v.code) + " lo manda a " +
                        anchor.time.toFixed(1) + "s, donde ya estuvo: se queda en " +
                        marker.startSeconds.toFixed(1) + "s");
                    refuse(v, "otro chequeo lo devuelve a " + fmtTime(marker.startSeconds) +
                        ": el marcador entraría en bucle y hay que decidir el empate");
                    continue;
                }
                remember(v, marker.startSeconds);
                remember(v, anchor.time);
                history.push(label + ": " + marker.startSeconds.toFixed(1) + "s → " +
                    anchor.time.toFixed(1) + "s por " + codeLabel(v.code));
                proposals.push({
                    kind: v.kind,
                    pairIdx: v.pairIdx,
                    marker: marker,
                    originalTime: marker.startSeconds,
                    newTime: anchor.time,
                    reason: codeLabel(v.code) + ": " + v.message,
                    repeatedPhrase: "",
                    selected: true,
                    verifyCode: v.code,
                    snippet: MR.snippetAround(words, anchor.time, 6)
                });
            }

            if (targets.length === 0) {
                if (proposals.length === 0) return done(null, 0);
                return applyRound();
            }

            var idx = 0;

            function nextTarget() {
                if (cancelled()) return done("Revisión cancelada.", 0);
                if (idx >= targets.length) return applyRound();

                var v = targets[idx];
                var marker = markerOf(v, pairs);
                if (!marker) { idx++; return nextTarget(); }
                var label = v.kind + " del bloque " + (v.pairIdx + 1);
                onProgress(
                    Math.round((idx / targets.length) * 100),
                    "Reajustando " + label + " (" + (idx + 1) + "/" + targets.length + ")..."
                );

                // Aquí solo llegan las fallas sin punto al que reparar, así que el
                // centro de la ventana es el borde tal como está.
                var built = MP.buildCandidates(words, v.time, v.kind, precisionOpts());
                if (built.candidates.length === 0) {
                    history.push(label + ": sin puntos de corte alternativos, se deja igual");
                    idx++;
                    return nextTarget();
                }

                var unit = {
                    kind: v.kind,
                    pairIdx: v.pairIdx,
                    blockNum: v.pairIdx + 1,
                    blockCount: pairs.length,
                    markerTime: marker.startSeconds,
                    candidates: built.candidates,
                    current: built.current,
                    hint: "La revisión del resultado falló: " + v.message
                };

                var prompt = MP.buildChoicePrompt(unit, words, precisionOpts());
                aiAnalyzer._send(prompt.systemMsg, prompt.prompt, function(response) {
                    if (cancelled()) return done("Revisión cancelada.", 0);
                    var chosen = null, why = "";

                    if (!response || response.error) {
                        history.push(label + ": el LLM falló (" +
                            ((response && response.error) || "sin respuesta") + ")");
                    } else {
                        var r = MP.resolveChoice(response, unit);
                        if (r.ok && MV.resolvesIssue(v, r.time, precisionOpts())) {
                            chosen = r.time;
                            why = r.reason || "Reajustado tras la revisión del resultado";
                        } else if (r.ok) {
                            history.push(label + ": la elección de la IA no resolvía " +
                                codeLabel(v.code) + ", se deja igual");
                            refuse(v, "lo que eligió la IA no resolvía el problema");
                        }
                    }

                    if (chosen !== null && wasVisited(v, chosen)) {
                        history.push(label + ": la IA lo manda a " + chosen.toFixed(1) +
                            "s, donde ya estuvo: se queda en " +
                            marker.startSeconds.toFixed(1) + "s");
                        refuse(v, "la IA lo manda a " + fmtTime(chosen) +
                            ", donde ya estuvo: el marcador entraría en bucle");
                        chosen = null;
                    }

                    // Sin punto del detector no hay red: si la IA no resuelve, el
                    // borde se queda como está y la falla se reporta.
                    if (chosen !== null && Math.abs(chosen - marker.startSeconds) >= MIN_CHANGE_SEC) {
                        remember(v, marker.startSeconds);
                        remember(v, chosen);
                        history.push(label + ": " + marker.startSeconds.toFixed(1) + "s → " +
                            chosen.toFixed(1) + "s por " + codeLabel(v.code) + " (lo decidió la IA)");
                        proposals.push({
                            kind: v.kind,
                            pairIdx: v.pairIdx,
                            marker: marker,
                            originalTime: marker.startSeconds,
                            newTime: chosen,
                            reason: why,
                            repeatedPhrase: "",
                            selected: true,
                            verifyCode: v.code,
                            snippet: MR.snippetAround(words, chosen, 6)
                        });
                    } else if (chosen === null) {
                        history.push(label + ": no se pudo reajustar (" + v.code + ")");
                    }

                    idx++;
                    nextTarget();
                }, null, { numPredict: 300, think: false });
            }

            function applyRound() {
                if (proposals.length === 0) return done(null, 0);
                // Sesión mínima: applyMoves solo necesita las propuestas y la
                // secuencia sobre la que mover.
                var session = {
                    seqId: seqId || null,
                    seqName: seqName,
                    pairs: pairs,
                    words: words,
                    proposals: proposals,
                    log: []
                };
                applyMoves(session, true, function(err, res) {
                    if (err) return done(err, 0);
                    done(null, (res && res.moved) || 0);
                });
            }

            nextTarget();
        }

        function nextRound() {
            readAndVerify(function(err, pairs, result) {
                if (err) return finish(err);
                // Los avisos también entran a la ronda: aunque no frenen el corte, el
                // aire que se puede ganar se gana (y sale gratis, sin LLM).
                var pending = result.failures.length + (result.warnings || []).length;
                if (pending === 0 || round >= maxRounds) return report(pairs, result);

                round++;
                onProgress(0, "Revisión " + round + ": " + MV.summarize(result));
                fixRound(pairs, result, function(fixErr, moved) {
                    if (fixErr) return finish(fixErr);
                    fixedTotal += moved;
                    // Si nada se movió, otra ronda daría el mismo resultado.
                    if (moved === 0) return report(pairs, result);
                    nextRound();
                });
            });
        }

        ensureFps(nextRound);
    }

    /**
     * Mueve los marcadores de los ajustes que el editor aceptó.
     *
     * Son los empates que el lazo de revisión no rompe solo: el punto ya está
     * calculado, clampado al bloque y medido contra el WAV — lo único que faltaba
     * era que alguien dijera que sí. Por eso aquí no se vuelve a decidir nada, solo
     * se mueve (con su copia `_Pre-marker`, como cualquier otro movimiento).
     *
     * @param {Array}  items  los `adjustments` que devolvió `verifyAndFix`
     * @param {object} opts   {seqId, seqName, words}
     */
    function applyAdjustments(items, opts, cb) {
        opts = opts || {};
        cb = cb || function() {};

        var chosen = [];
        for (var i = 0; i < (items || []).length; i++) {
            var it = items[i];
            if (!it || it.to == null || !it.marker) continue;
            chosen.push({
                kind: it.kind, pairIdx: it.pairIdx, marker: it.marker,
                originalTime: it.from, newTime: it.to,
                reason: it.label + ": " + it.message,
                repeatedPhrase: "", selected: true,
                verifyCode: it.code, snippet: it.snippet || ""
            });
        }
        if (chosen.length === 0) return cb(null, { moved: 0 });

        var session = {
            seqId: opts.seqId || null,
            seqName: opts.seqName || (state && state.sequenceName) || "",
            pairs: opts.pairs || [],
            words: opts.words || [],
            proposals: chosen,
            log: []
        };
        applyMoves(session, true, function(err, res) {
            if (err) return cb(err);
            cb(null, { moved: (res && res.moved) || 0 });
        });
    }

    // ─── Leer la clase como quedaría cortada ─────────────────
    //
    // Los chequeos del paso 5 miran un borde a la vez: si el corte parte una palabra, si
    // hay aire, si la frase del CD cae donde debe. Ninguno lee la clase. Y hay defectos
    // que solo se ven leyéndola: un bloque que empieza a media idea porque el de antes ya
    // la contó, un salto de tema donde faltó material, una explicación dicha dos veces
    // con otras palabras (que no es un pickup y por eso nadie la mide).
    //
    // Esto se puede leer SIN cortar: el transcript proyectado se arma con las palabras
    // que caen dentro de los marcadores actuales. Lo que el revisor señale vuelve a la
    // misma decisión del paso 4, acotada a esos bordes y con su detalle como contexto.

    /** Cuántas veces se relee la clase antes de dejarlo apuntado y seguir. */
    var MAX_READ_ROUNDS = 2;

    /**
     * Lee la clase como quedaría cortada, y arregla los bloques que el revisor señale.
     *
     * No frena nada: si el proveedor falla o no hay nada que arreglar, se sigue y queda
     * en el log. Un chequeo de calidad caído no debe dejar la clase sin cortar.
     *
     * @param {object} opts {seqId, seqName, words, onProgress, isCancelled}
     * @param {function} cb cb(err, {rounds, fixed, issues, text, summary, score, pending})
     */
    function readClassAndFix(opts, cb) {
        opts = opts || {};
        cb = cb || function() {};
        if (!MR || !MR.buildFinalTranscript || !MR.coherenceTargets) {
            return cb("El módulo de marcadores no está disponible.");
        }
        if (!aiAnalyzer) return cb("El proveedor de IA no está inicializado.");

        var words = opts.words || [];
        if (!words.length) return cb("No hay transcript con el que leer la clase.");

        var seqId = opts.seqId || "";
        var seqName = opts.seqName || (state && state.sequenceName) || "";
        var onProgress = opts.onProgress || function() {};
        var markersCall = seqId
            ? "getMarkersForSequence('" + escExtendStr(seqId) + "')"
            : "getSequenceMarkers()";

        var round = 0, fixedTotal = 0;
        var notes = [];
        var last = { text: "", summary: "", score: null, issues: [], pending: [],
            observations: [] };

        var wasRunning = mrState.running;
        mrState.running = true;
        mrState.cancelled = false;
        function finish(err, res) {
            mrState.running = wasRunning;
            cb(err, res);
        }
        function cancelled() {
            if (mrState.cancelled) return true;
            try { return !!(opts.isCancelled && opts.isCancelled()); } catch (e) { return false; }
        }
        function done() {
            finish(null, {
                rounds: round, fixed: fixedTotal, notes: notes,
                text: last.text, summary: last.summary, score: last.score,
                issues: last.issues, pending: last.pending,
                observations: last.observations
            });
        }

        /**
         * Lo que dijo el revisor y no se convirtió en un movimiento.
         *
         * O el transcript no confirma lo que vio (`transcriptProof`), o habla de algo
         * que no se arregla moviendo un corte: un salto de tema es el orden en que el
         * CD grabó la clase, no un borde mal puesto. Se enseña igual, porque es el ojo
         * que ve lo que las reglas no ven; simplemente no trae botón, porque no hay
         * punto al que mover nada.
         */
        function coherenceObservations(issues, targets, blockCount) {
            var taken = {};
            for (var t = 0; t < (targets || []).length; t++) taken[targets[t].pairIdx] = true;

            var out = [];
            for (var i = 0; i < (issues || []).length; i++) {
                var issue = issues[i] || {};
                var num = Number(issue.block);
                var idx = num >= 1 && num <= blockCount ? num - 1 : -1;
                if (idx >= 0 && taken[idx]) continue;
                out.push({
                    pairIdx: idx, kind: "", code: "read-" + (issue.type || "otro"),
                    label: "al leer la clase", to: null, why: "", source: "lectura",
                    message: (idx >= 0 ? "bloque " + num + ": " : "") + (issue.detail || "")
                });
            }
            return out;
        }

        function readRound() {
            if (cancelled()) return done();
            evalScript(markersCall, function(data) {
                if (data.error) return finish(data.error);
                var parsed = MR.parsePairs(data.markers, { skipClapperboard: true });
                if (parsed.error) return finish(parsed.error);
                var pairs = parsed.pairs;
                if (pairs.length === 0) return finish("No hay bloques IN/OUT que leer.");

                var blocks = [];
                for (var i = 0; i < pairs.length; i++) {
                    blocks.push({ inTime: pairs[i].inMarker.startSeconds,
                        outTime: pairs[i].outMarker.startSeconds });
                }
                var built = MR.buildFinalTranscript(words, blocks);
                last.text = built.text;
                if (built.wordCount === 0) return finish("Los bloques no contienen palabras del transcript.");

                round++;
                onProgress(20, "Lectura " + round + ": " + built.wordCount + " palabras en " +
                    pairs.length + " bloques");
                ask(pairs, built, transcriptProof(words, blocks));
            });
        }

        /**
         * Qué sostiene el transcript de lo que el revisor puede llegar a decir: qué bordes
         * parten una frase y en qué cierres se repiten palabras con el bloque de al lado.
         *
         * Hace falta porque el revisor cita mal el bloque. Leído cinco veces sobre la
         * clase 15 con la repetición dentro, apuntó al cierre bueno una vez y al de al
         * lado tres. Sus dos afirmaciones se pueden medir, así que se miden antes de mover
         * un marcador.
         *
         * @returns {object} {cut: {"IN:3": true}, repeat: {"OUT:3": true}}
         */
        function transcriptProof(words, blocks) {
            var MV = global.EPMarkerVerify;
            var proof = { cut: {}, repeat: {} };
            if (!MV || !MV.verifyBlocks) return proof;

            var result = MV.verifyBlocks(words, blocks, precisionOpts());
            var lists = [result.failures || [], result.warnings || []];
            for (var l = 0; l < lists.length; l++) {
                for (var i = 0; i < lists[l].length; i++) {
                    var v = lists[l][i];
                    if (v.code === "mid-phrase" || v.code === "mid-word") {
                        proof.cut[v.kind + ":" + v.pairIdx] = true;
                    }
                }
            }
            if (!MV.pickupOverlap) return proof;
            for (var b = 0; b + 1 < blocks.length; b++) {
                var mine = spanOf(words, blocks[b].inTime, blocks[b].outTime);
                var near = spanOf(words, blocks[b + 1].inTime, blocks[b + 1].outTime);
                if (MV.pickupOverlap(mine, near, precisionOpts())) proof.repeat["OUT:" + b] = true;
            }
            return proof;
        }

        function ask(pairs, built, proof) {
            var prompt = MR.buildCoherencePrompt(built.text);
            var started = Date.now();
            aiAnalyzer._send(prompt.systemMsg, prompt.prompt, function(response) {
                if (cancelled()) return done();
                var secs = ((Date.now() - started) / 1000).toFixed(1);
                var read = parseCoherence(response);
                if (!read) {
                    // El chequeo no opinó: la clase sale cortada igual.
                    notes.push("la lectura de la clase no devolvió un resultado legible (" +
                        ((response && response.error) || "sin respuesta") + ")");
                    return done();
                }
                last.summary = read.summary;
                last.score = read.score;
                last.issues = read.issues;

                var targets = MR.coherenceTargets(read.issues, pairs.length, proof);
                last.observations = coherenceObservations(read.issues, targets, pairs.length);
                log(null, "Lectura de la clase (" + secs + "s): " +
                    (read.score != null ? "nota " + read.score + "/10, " : "") +
                    read.issues.length + " observación(es), " + targets.length + " borde(s) que revisar");
                for (var i = 0; i < read.issues.length; i++) {
                    var issue = read.issues[i];
                    log(null, "  bloque " + (issue.block || "—") + " · " + (issue.type || "otro") +
                        ": " + (issue.detail || ""));
                }

                if (targets.length === 0) return done();
                if (round >= MAX_READ_ROUNDS) {
                    last.pending = targets;
                    notes.push(targets.length + " borde(s) señalados en la última lectura, sin más rondas");
                    return done();
                }
                fixTargets(pairs, targets);
            }, null, { numPredict: 700, think: false });
        }

        /** Los bordes señalados vuelven a la decisión del paso 4, con el detalle delante. */
        function fixTargets(pairs, targets) {
            var extraHints = {};
            for (var i = 0; i < targets.length; i++) {
                extraHints[targets[i].kind + ":" + targets[i].pairIdx] =
                    "al leer la clase cortada, el revisor apuntó: " + targets[i].detail;
            }
            var recheck = {};
            for (var t = 0; t < targets.length; t++) {
                recheck[targets[t].kind + ":" + targets[t].pairIdx] = targets[t];
            }
            var session = {
                seqId: seqId || null, seqName: seqName, pairs: pairs, words: words,
                only: targets, extraHints: extraHints, recheck: recheck,
                proposals: [], log: []
            };
            onProgress(60, "Reajustando " + targets.length + " borde(s) de la lectura...");
            analyzeSessionPrecise(session, function(pct, txt) {
                onProgress(60 + Math.round(pct * 0.3), txt);
            }, function(err, proposals) {
                if (cancelled()) return done();
                if (err) {
                    notes.push("el reajuste de la lectura falló: " + err);
                    last.pending = targets;
                    return done();
                }
                if (!proposals || proposals.length === 0) {
                    notes.push("la lectura señaló " + targets.length +
                        " borde(s) pero ninguno se pudo reajustar");
                    last.pending = targets;
                    return done();
                }
                session.proposals = proposals;
                applyMoves(session, true, function(moveErr, res) {
                    if (moveErr) {
                        notes.push("no se pudieron mover los marcadores de la lectura: " + moveErr);
                        return done();
                    }
                    var moved = (res && res.moved) || 0;
                    fixedTotal += moved;
                    notes.push("lectura " + round + ": " + moved + " borde(s) reajustados");
                    if (moved === 0) return done();
                    readRound();
                });
            });
        }

        ensureFps(readRound);
    }

    /**
     * La respuesta del revisor de coherencia.
     * @returns {object|null} {coherent, score, issues, summary} o null si no se entiende
     */
    function parseCoherence(response) {
        var text = "";
        if (typeof response === "string") text = response;
        else if (response && typeof response.content === "string") text = response.content;
        else if (response && typeof response.text === "string") text = response.text;
        if (!text) return null;

        var start = text.indexOf("{"), end = text.lastIndexOf("}");
        if (start === -1 || end <= start) return null;
        var data;
        try { data = JSON.parse(text.substring(start, end + 1)); } catch (e) { return null; }
        if (!data || typeof data !== "object") return null;

        var issues = [];
        if (data.issues && data.issues.length) {
            for (var i = 0; i < data.issues.length; i++) {
                var raw = data.issues[i] || {};
                issues.push({ block: Number(raw.block) || 0,
                    type: String(raw.type || "otro"), detail: String(raw.detail || "") });
            }
        }
        return {
            coherent: data.coherent !== false,
            score: (typeof data.score === "number") ? data.score : null,
            issues: issues,
            summary: String(data.summary || "")
        };
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
            mrState.fps = info.frameRate || 0;
            mrState.duration = info.durationSeconds || 0;
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
                    ensureFps(function() {
                        runSession(session, function(err) {
                            if (err) session.error = err;
                            idx++;
                            nextSeq();
                        });
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

                analyzeSessionPrecise(session, function(pct, txt) {
                    setProgress(40 + Math.round(pct * 0.55), prefix + txt);
                }, function(analysisErr, proposals) {
                    if (analysisErr && proposals.length === 0) return done(analysisErr);
                    // Un fallo parcial del LLM no rompe la card (el usuario revisa
                    // lo que salió, con el aviso a la vista), pero sí tiene que
                    // frenar a quien automatiza: cortar con marcadores a medio
                    // validar es peor que no cortar.
                    session.analysisError = analysisErr || null;
                    if (analysisErr && !mrState.override) showToast(analysisErr, "error");
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
        applyMoves(session, false, null);
    }

    /**
     * Copia de la secuencia **antes** de tocar los marcadores, etiquetada
     * "Pre-Marker" para distinguirla de la "Pre-Cut" que se hace antes de cortar.
     * Mover un marcador es borrarlo y recrearlo, así que sin copia no hay forma de
     * volver a los marcadores que puso el CD.
     *
     * Una por secuencia y sesión del panel: el paso 5 vuelve a mover marcadores y su
     * copia ya no sería "como estaba antes". Si la copia falla se sigue adelante (es
     * lo que hace el Cutter) pero queda dicho en el log.
     */
    function backupBeforeMoves(session, cb) {
        var key = session.seqId || session.seqName || "activa";
        if (mrState.preMarkerBackups[key]) return cb();

        var call = session.seqId
            ? "backupSequence('Pre-Marker', '" + escExtendStr(session.seqId) + "')"
            : "backupSequence('Pre-Marker')";
        evalScript(call, function(res) {
            if (res && res.error) {
                log(session, "Backup Pre-Marker fallido (se sigue igual): " + res.error);
            } else {
                mrState.preMarkerBackups[key] = true;
                log(session, "Backup antes de mover marcadores: " + ((res && res.backupName) || "creado"));
            }
            cb();
        });
    }

    /**
     * Mueve los marcadores de las propuestas seleccionadas.
     * @param {boolean} silent sin toasts ni render (modo headless / The Cutter)
     * @param {function} cb    cb(err, result) opcional
     */
    function applyMoves(session, silent, cb) {
        function fail(msg) {
            if (!silent) showToast(msg, "error");
            if (cb) cb(msg);
        }

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
        if (moves.length === 0) {
            if (!silent) showToast("No hay ajustes seleccionados", "info");
            if (cb) cb(null, { moved: 0, requested: 0, notFound: [] });
            return;
        }
        if (!fs || !os) return fail("Node.js no disponible");

        // La copia de seguridad va primero: mover es borrar y recrear.
        backupBeforeMoves(session, move);

        function move() {
            var tmpFile = path.join(os.tmpdir(), "editorpro_mrv_moves.json");
            try {
                fs.writeFileSync(tmpFile, JSON.stringify(moves), "utf8");
            } catch(e) {
                return fail("Error al escribir archivo temporal: " + e.message);
            }

            var call = session.seqId
                ? "mrMoveMarkers('" + escExtend(tmpFile) + "', '" + escExtendStr(session.seqId) + "')"
                : "mrMoveMarkers('" + escExtend(tmpFile) + "')";

            evalScript(call, function(result) {
                try { fs.unlinkSync(tmpFile); } catch(_e) {}
                if (result.error) return fail(result.error);

                // Actualizar los tiempos locales de los marcadores movidos
                for (var a = 0; a < toApply.length; a++) {
                    toApply[a].applied = true;
                    toApply[a].marker.startSeconds = toApply[a].newTime;
                }
                session.applied = true;
                session.moveResult = result;
                computeFinalTranscript(session);

                var msg = result.moved + " marcador(es) movido(s)";
                if (result.notFound && result.notFound.length > 0) {
                    msg += " — " + result.notFound.length + " no encontrado(s)";
                }
                log(session, msg);

                if (!silent) {
                    renderResults();
                    showToast(msg, result.notFound && result.notFound.length > 0 ? "info" : "success");
                }
                if (cb) cb(null, result);
            });
        }
    }

    // ─── Modo headless (The Cutter) ──────────────────────────

    /**
     * Corre el pipeline completo sobre la secuencia activa y AUTO-APLICA todas
     * las propuestas, sin UI de revisión.
     * @param {object} opts {useAi, windowed, seqId, onProgress}
     * @param {function} cb cb(err, {moved, proposals, pairs, words, session})
     */
    function runHeadless(opts, cb) {
        opts = opts || {};
        cb = cb || function() {};
        if (!fs) return cb("Node.js no disponible en el panel");
        if (mrState.running) return cb("Ya hay una revisión de marcadores en curso");

        if (!aiAnalyzer) return cb("El proveedor de IA no está inicializado.");
        mrState.override = { windowed: !!opts.windowed };
        mrState.externalProgress = opts.onProgress || null;
        mrState.running = true;
        mrState.cancelled = false;
        mrState.lastBaseText = "";
        mrState.lastPct = 0;

        function finish(err, result) {
            mrState.running = false;
            mrState.override = null;
            mrState.externalProgress = null;
            hideProgress();
            cb(err, result);
        }

        evalScript("getActiveSequenceInfo()", function(info) {
            if (info.error) return finish(info.error);
            mrState.fps = info.frameRate || 0;
            mrState.duration = info.durationSeconds || 0;
            var session = newSession(opts.seqId || null, info.name);
            mrState.sessions = [session];
            mrState.currentIdx = 0;

            runSession(session, function(err) {
                if (err) { session.error = err; return finish(err); }
                // Sin validación completa no se sigue: cortar con marcadores a
                // medio validar deja los cortes donde estaban y arruina la clase.
                if (session.analysisError) { session.error = session.analysisError; return finish(session.analysisError); }
                for (var i = 0; i < session.proposals.length; i++) session.proposals[i].selected = true;

                function done(moved) {
                    finish(null, {
                        moved: moved,
                        proposals: session.proposals.length,
                        anchored: session.anchoredCount || 0,
                        pairs: session.pairs,
                        words: session.words,
                        session: session
                    });
                }

                if (session.proposals.length === 0) return done(0);
                applyMoves(session, true, function(applyErr, result) {
                    if (applyErr) return finish(applyErr);
                    done((result && result.moved) || 0);
                });
            });
        });
    }

    function isRunning() { return !!mrState.running; }

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
        refreshHeaderProgress: refreshHeaderProgress,
        runHeadless: runHeadless,
        isRunning: isRunning,
        verifyAndFix: verifyAndFix,
        applyAdjustments: applyAdjustments,
        readClassAndFix: readClassAndFix,
        getPadFrames: getPadFrames,
        setPadFrames: setPadFrames
    };

})(window);
