/**
 * marker-reviewer.js — Lógica del Revisor de Marcadores
 *
 * Módulo puro (testeable en Node, sin DOM/CEP): opera sobre marcadores de
 * secuencia ({name, comments, startSeconds, colorIndex}) y words[] del STT
 * ({text, start, end, type}).
 *
 * Responsabilidades:
 *   - parsePairs(markers, opts)        → pares IN/OUT (skip claqueta por nombre)
 *   - buildBoundaryUnits(pairs)        → unidades de revisión (primer IN,
 *                                        transiciones OUT→IN, último OUT)
 *   - contextForTime(words, t, n)      → palabras alrededor de un tiempo
 *   - formatContext(entries)           → texto "(t)palabra" para el prompt LLM
 *   - buildUnitPrompt(unit, words)     → systemMsg + prompt JSON para el LLM
 *   - resolveUnitResponse(...)         → valida la respuesta del LLM, clampa
 *                                        los tiempos a gaps de palabra y
 *                                        produce proposals accionables
 *   - clampToWordGap(words, t, mode)   → nunca cortar a mitad de palabra
 *   - buildFinalTranscript(words, blocks) → transcript de la clase resultante
 *   - buildCoherencePrompt(text)       → prompt del chequeo final de sentido
 *
 * La orquestación (evalScript, aiAnalyzer, UI) vive en ui-marker-reviewer.js.
 * Expone: window.EPMarkerReviewer / module.exports
 */
(function(global) {
    "use strict";

    var DEFAULTS = {
        skipClapperboard: true,
        contextWords: 60,      // palabras de contexto a cada lado de una frontera
        maxMoveSeconds: 30,    // un ajuste mayor a esto se descarta como alucinación
        inPreMin: 0.1,         // margen mínimo antes de la primera palabra del IN
        inPreMax: 0.4,         // margen máximo
        outPostMin: 0.1,       // margen mínimo después de la última palabra del OUT
        outPostMax: 0.4,       // margen máximo
        minChangeSeconds: 0.12 // por debajo de esto se considera "keep"
    };

    function mergeOpts(opts) {
        var o = {};
        var k;
        for (k in DEFAULTS) {
            if (DEFAULTS.hasOwnProperty(k)) o[k] = DEFAULTS[k];
        }
        if (opts) {
            for (k in opts) {
                if (opts.hasOwnProperty(k)) o[k] = opts[k];
            }
        }
        return o;
    }

    // ─── Parseo de marcadores → pares IN/OUT ─────────────────

    function isOutMarker(marker) {
        var c = (marker.comments || "").trim();
        return c.indexOf("OUT:") === 0;
    }

    function isClapperboardMarker(marker) {
        var txt = ((marker.name || "") + " " + (marker.comments || "")).toLowerCase();
        return txt.indexOf("clapper") !== -1 || txt.indexOf("claqueta") !== -1;
    }

    /**
     * markers: [{name, comments, startSeconds, colorIndex}]
     * Devuelve { pairs, skipped, warnings, error }
     * pair = { inMarker, outMarker } (referencias a los marcadores originales)
     */
    function parsePairs(markers, opts) {
        opts = mergeOpts(opts);
        if (!markers || markers.length === 0) {
            return { pairs: [], skipped: [], warnings: [], error: "No se encontraron marcadores." };
        }

        var sorted = markers.slice(0).sort(function(a, b) { return a.startSeconds - b.startSeconds; });

        var working;
        var skipped = [];
        if (opts.skipClapperboard) {
            working = [];
            for (var c = 0; c < sorted.length; c++) {
                if (isClapperboardMarker(sorted[c])) skipped.push(sorted[c]);
                else working.push(sorted[c]);
            }
            if (skipped.length === 0 && sorted.length > 0) {
                skipped.push(sorted[0]);
                working = sorted.slice(1);
            }
        } else {
            working = sorted.slice(0);
        }

        if (working.length === 0) {
            return { pairs: [], skipped: skipped, warnings: [], error: "Solo se encontró el marcador de claqueta." };
        }

        var pairs = [];
        var warnings = [];
        var currentIn = null;

        for (var i = 0; i < working.length; i++) {
            var m = working[i];
            if (isOutMarker(m)) {
                if (currentIn !== null) {
                    pairs.push({ inMarker: currentIn, outMarker: m });
                    currentIn = null;
                } else {
                    warnings.push("OUT huérfano en " + m.startSeconds.toFixed(1) + "s (sin IN previo)");
                }
            } else {
                if (currentIn !== null) {
                    if (opts.skipClapperboard && pairs.length === 0) {
                        skipped.push(currentIn);
                    } else {
                        warnings.push("IN huérfano en " + currentIn.startSeconds.toFixed(1) + "s (seguido de otro IN)");
                    }
                }
                currentIn = m;
            }
        }
        if (currentIn !== null) {
            warnings.push("IN huérfano en " + currentIn.startSeconds.toFixed(1) + "s (sin OUT de cierre)");
        }

        if (pairs.length === 0) {
            return { pairs: [], skipped: skipped, warnings: warnings, error: "No se encontraron pares IN/OUT válidos." };
        }

        return { pairs: pairs, skipped: skipped, warnings: warnings, error: null };
    }

    // ─── Unidades de revisión ────────────────────────────────

    /**
     * Convierte los pares en unidades de revisión para el LLM:
     *   - { type: "first-in",   pairIdx: 0 }
     *   - { type: "transition", outPairIdx: i, inPairIdx: i+1 }  (OUT + IN + pickup)
     *   - { type: "last-out",   pairIdx: n-1 }
     * Total de llamadas al LLM: pares + 1.
     */
    function buildBoundaryUnits(pairs) {
        var units = [];
        if (!pairs || pairs.length === 0) return units;
        units.push({ type: "first-in", pairIdx: 0 });
        for (var i = 0; i < pairs.length - 1; i++) {
            units.push({ type: "transition", outPairIdx: i, inPairIdx: i + 1 });
        }
        units.push({ type: "last-out", pairIdx: pairs.length - 1 });
        return units;
    }

    // ─── Ventanas de audio a transcribir ────────────────────

    /**
     * Para ahorrar tiempo, en vez de transcribir toda la clase solo se
     * transcriben ventanas alrededor de cada bloque IN/OUT: [in - margin,
     * out + margin]. Ventanas que se solapan se fusionan. Cubre el contexto
     * del IN, del OUT y de las transiciones (el margen suele solapar bloques
     * cercanos). Devuelve [{start, end}] en segundos, ordenadas.
     */
    function computeAudioWindows(pairs, opts) {
        opts = mergeOpts(opts);
        var margin = typeof opts.windowMarginSec === "number" ? opts.windowMarginSec : 120;
        var wins = [];
        for (var i = 0; i < pairs.length; i++) {
            var s = Math.max(0, pairs[i].inMarker.startSeconds - margin);
            var e = pairs[i].outMarker.startSeconds + margin;
            if (e > s) wins.push({ start: s, end: e });
        }
        wins.sort(function(a, b) { return a.start - b.start; });
        var merged = [];
        for (var w = 0; w < wins.length; w++) {
            var last = merged[merged.length - 1];
            if (last && wins[w].start <= last.end) {
                if (wins[w].end > last.end) last.end = wins[w].end;
            } else {
                merged.push({ start: wins[w].start, end: wins[w].end });
            }
        }
        return merged;
    }

    /**
     * ¿Las ventanas cubren todas las fronteras relevantes de los pares?
     * Un transcript parcial guardado solo se reutiliza si cubre lo que se va
     * a validar ahora (con un pequeño colchón).
     */
    function windowsCoverPairs(windows, pairs, pad) {
        if (!windows || windows.length === 0) return false;
        pad = pad || 5;
        function covered(t) {
            for (var w = 0; w < windows.length; w++) {
                if (t >= windows[w].start - pad && t <= windows[w].end + pad) return true;
            }
            return false;
        }
        for (var i = 0; i < pairs.length; i++) {
            if (!covered(pairs[i].inMarker.startSeconds)) return false;
            if (!covered(pairs[i].outMarker.startSeconds)) return false;
        }
        return true;
    }

    // ─── Contexto de palabras ────────────────────────────────

    /**
     * Devuelve { before: [...], after: [...] } con hasta n palabras habladas
     * a cada lado de `time`. Cada entry: { text, start, end }.
     */
    function contextForTime(words, time, n) {
        var before = [];
        var after = [];
        if (!words) return { before: before, after: after };
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            if (w.type && w.type !== "word") continue;
            var mid = (w.start + w.end) / 2;
            if (mid < time) before.push(w);
            else after.push(w);
        }
        if (before.length > n) before = before.slice(before.length - n);
        if (after.length > n) after = after.slice(0, n);
        return { before: before, after: after };
    }

    /**
     * Formatea palabras para el prompt: "(12.3)palabra (12.8)otra ..."
     * El timestamp es el START de cada palabra, con 1 decimal.
     */
    function formatContext(entries) {
        var parts = [];
        for (var i = 0; i < entries.length; i++) {
            parts.push("(" + entries[i].start.toFixed(1) + ")" + entries[i].text);
        }
        return parts.join(" ");
    }

    /**
     * Frase legible (sin timestamps) de hasta n palabras antes/después de time.
     */
    function snippetAround(words, time, n) {
        var ctx = contextForTime(words, time, n);
        var beforeTxt = [];
        var afterTxt = [];
        var i;
        for (i = 0; i < ctx.before.length; i++) beforeTxt.push(ctx.before[i].text);
        for (i = 0; i < ctx.after.length; i++) afterTxt.push(ctx.after[i].text);
        return { before: beforeTxt.join(" "), after: afterTxt.join(" ") };
    }

    // ─── Clamp a gaps de palabra ─────────────────────────────

    /**
     * Ajusta un tiempo propuesto para que caiga en silencio, nunca a mitad
     * de palabra.
     *   mode "in":  el tiempo queda ANTES de la palabra que abre la frase
     *               (margen dentro del gap previo).
     *   mode "out": el tiempo queda DESPUÉS de la palabra que cierra la frase
     *               (margen dentro del gap siguiente).
     */
    function clampToWordGap(words, time, mode, opts) {
        opts = mergeOpts(opts);
        if (!words || words.length === 0) return time;

        var spoken = [];
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            if (w.type && w.type !== "word") continue;
            spoken.push(w);
        }
        if (spoken.length === 0) return time;

        // Palabra que contiene el tiempo propuesto (política conservadora:
        // una palabra a medias siempre se INCLUYE en el bloque — el IN salta
        // antes de ella y el OUT después de ella)
        var containing = -1;
        var ci;
        for (ci = 0; ci < spoken.length; ci++) {
            if (spoken[ci].start < time && spoken[ci].end > time) { containing = ci; break; }
        }

        if (mode === "in") {
            // Palabra objetivo: la que contiene el tiempo, o la primera cuyo
            // punto medio queda en o después de time
            var target = null;
            var prevW = null;
            if (containing !== -1) {
                target = spoken[containing];
                prevW = spoken[containing - 1] || null;
            } else {
                for (var a = 0; a < spoken.length; a++) {
                    if ((spoken[a].start + spoken[a].end) / 2 >= time) { target = spoken[a]; prevW = spoken[a - 1] || null; break; }
                }
            }
            if (!target) return time; // después de la última palabra: dejar
            var gapStart = prevW ? prevW.end : 0;
            var gap = Math.max(0, target.start - gapStart);
            var pre = Math.min(opts.inPreMax, Math.max(opts.inPreMin, gap / 2));
            var t = target.start - pre;
            if (prevW) t = Math.max(t, prevW.end + 0.02);
            return Math.max(0, Math.min(t, target.start));
        }

        // mode "out": palabra objetivo: la que contiene el tiempo, o la
        // última cuyo punto medio queda en o antes de time
        var targetO = null;
        var nextW = null;
        if (containing !== -1) {
            targetO = spoken[containing];
            nextW = spoken[containing + 1] || null;
        } else {
            for (var b = spoken.length - 1; b >= 0; b--) {
                if ((spoken[b].start + spoken[b].end) / 2 <= time) { targetO = spoken[b]; nextW = spoken[b + 1] || null; break; }
            }
        }
        if (!targetO) return time; // antes de la primera palabra: dejar
        var gapO = nextW ? Math.max(0, nextW.start - targetO.end) : Infinity;
        var post = gapO === Infinity
            ? opts.outPostMax
            : Math.min(opts.outPostMax, Math.max(opts.outPostMin, gapO / 2));
        var tO = targetO.end + post;
        if (nextW) tO = Math.min(tO, nextW.start - 0.02);
        return Math.max(tO, targetO.end);
    }

    // ─── Prompts LLM ─────────────────────────────────────────

    var SYSTEM_MSG = "Eres un asistente de edición de video para clases educativas grabadas. " +
        "El profesor graba con errores, pausas y retomas; el editor marca IN (inicio de bloque bueno) " +
        "y OUT (fin de bloque bueno) y todo lo que queda fuera de los bloques se elimina. " +
        "Tu trabajo es validar que cada marcador caiga exactamente donde la frase tiene sentido. " +
        "Recibes fragmentos del transcript donde cada palabra va precedida por su tiempo en segundos: (12.3)palabra. " +
        "Cuando propongas mover un marcador, usa el tiempo de inicio de la palabra donde debe empezar la frase (para IN) " +
        "o el tiempo de la palabra siguiente al final de la frase (para OUT). " +
        "Responde ÚNICAMENTE con JSON válido, sin texto adicional ni markdown.";

    /**
     * Construye el prompt de una unidad. Devuelve { systemMsg, prompt }.
     * hints: candidatos determinísticos opcionales (de EPCutValidator) como texto.
     */
    function buildUnitPrompt(unit, pairs, words, opts) {
        opts = mergeOpts(opts);
        var n = opts.contextWords;

        if (unit.type === "first-in") {
            var inT = pairs[unit.pairIdx].inMarker.startSeconds;
            var ctx = contextForTime(words, inT, n);
            return {
                systemMsg: SYSTEM_MSG,
                prompt: "PRIMER MARCADOR IN de la clase (después de la claqueta). Está en t=" + inT.toFixed(1) + "s.\n" +
                    "El bloque bueno debe empezar donde arranca la primera frase con sentido de la clase " +
                    "(saludo o inicio del tema), descartando conteos (3,2,1), silencios y falsos arranques.\n\n" +
                    "ANTES del IN (se descarta):\n" + formatContext(ctx.before) + "\n\n" +
                    "DESPUÉS del IN (se conserva):\n" + formatContext(ctx.after) + "\n\n" +
                    (unit.hints ? "Sugerencias automáticas: " + unit.hints + "\n\n" : "") +
                    "¿El IN está donde arranca la frase con sentido? Responde JSON:\n" +
                    '{"in": {"action": "keep"|"move", "time": <segundos donde empieza la palabra que abre la frase>, "reason": "<breve, en español>"}}'
            };
        }

        if (unit.type === "last-out") {
            var outT = pairs[unit.pairIdx].outMarker.startSeconds;
            var ctxO = contextForTime(words, outT, n);
            return {
                systemMsg: SYSTEM_MSG,
                prompt: "ÚLTIMO MARCADOR OUT de la clase. Está en t=" + outT.toFixed(1) + "s.\n" +
                    "El bloque bueno debe terminar justo al final de la última frase con sentido " +
                    "(cierre o despedida), sin cortar la frase ni incluir material sobrante (comandos al editor, pausas, errores).\n\n" +
                    "ANTES del OUT (se conserva):\n" + formatContext(ctxO.before) + "\n\n" +
                    "DESPUÉS del OUT (se descarta):\n" + formatContext(ctxO.after) + "\n\n" +
                    (unit.hints ? "Sugerencias automáticas: " + unit.hints + "\n\n" : "") +
                    "¿El OUT está justo después del final de la frase con sentido? Responde JSON:\n" +
                    '{"out": {"action": "keep"|"move", "time": <segundos donde empieza la palabra SIGUIENTE al final de la frase>, "reason": "<breve, en español>"}}'
            };
        }

        // transition: OUT del par i + IN del par i+1, con detección de repetición
        var outTime = pairs[unit.outPairIdx].outMarker.startSeconds;
        var inTime = pairs[unit.inPairIdx].inMarker.startSeconds;
        var ctxOut = contextForTime(words, outTime, n);
        var ctxIn = contextForTime(words, inTime, n);

        return {
            systemMsg: SYSTEM_MSG,
            prompt: "TRANSICIÓN entre dos bloques buenos. El OUT del bloque anterior está en t=" + outTime.toFixed(1) +
                "s y el IN del bloque siguiente en t=" + inTime.toFixed(1) + "s. Lo que queda entre ambos se elimina.\n\n" +
                "FINAL del bloque anterior (antes del OUT, se conserva):\n" + formatContext(ctxOut.before) + "\n\n" +
                "Justo después del OUT (se descarta):\n" + formatContext(ctxOut.after) + "\n\n" +
                "Justo antes del IN (se descarta):\n" + formatContext(ctxIn.before) + "\n\n" +
                "INICIO del bloque siguiente (después del IN, se conserva):\n" + formatContext(ctxIn.after) + "\n\n" +
                (unit.hints ? "Sugerencias automáticas: " + unit.hints + "\n\n" : "") +
                "Valida tres cosas:\n" +
                "1. El OUT debe caer justo después del final de la última frase con sentido del bloque anterior.\n" +
                "2. El IN debe caer justo donde arranca la primera frase con sentido del bloque siguiente " +
                "(descartando conteos, muletillas de arranque y frases a medias).\n" +
                "3. MUY IMPORTANTE: si el inicio del bloque siguiente REPITE una frase que ya está al final del bloque anterior " +
                "(el profesor retomó repitiendo lo último que dijo), el OUT debe RETROCEDER al tiempo donde empieza esa frase repetida " +
                "en el bloque anterior, para que la frase quede una sola vez (la versión nueva, después del IN).\n\n" +
                "Responde JSON:\n" +
                '{"out": {"action": "keep"|"move", "time": <segundos>, "reason": "<breve>"}, ' +
                '"in": {"action": "keep"|"move", "time": <segundos>, "reason": "<breve>"}, ' +
                '"repeatedPhrase": "<la frase repetida, o cadena vacía si no hay repetición>"}'
        };
    }

    // ─── Resolución de respuestas del LLM ────────────────────

    function _num(v) {
        var n = typeof v === "number" ? v : parseFloat(v);
        return isNaN(n) ? null : n;
    }

    /**
     * Valida y normaliza la respuesta del LLM para una unidad.
     * Devuelve una lista de proposals:
     *   { kind: "IN"|"OUT", pairIdx, marker, originalTime, newTime, reason,
     *     repeatedPhrase?, snippet: {before, after} }
     * Solo incluye ajustes reales (action move, delta significativo, dentro
     * de maxMoveSeconds, clampado a gap de palabra).
     */
    function resolveUnitResponse(unit, response, pairs, words, opts) {
        opts = mergeOpts(opts);
        var proposals = [];
        if (!response || response.error) return proposals;

        function consider(kind, pairIdx, marker, raw, repeatedPhrase) {
            if (!raw || raw.action !== "move") return;
            var t = _num(raw.time);
            if (t === null || t < 0) return;
            var original = marker.startSeconds;
            if (Math.abs(t - original) > opts.maxMoveSeconds) return; // alucinación probable
            var mode = kind === "IN" ? "in" : "out";
            var clamped = clampToWordGap(words, t, mode, opts);
            if (Math.abs(clamped - original) < opts.minChangeSeconds) return; // sin cambio real
            // Si el original normaliza al mismo gap, el "move" del LLM es un eco
            // del tiempo actual con ruido — no hay ajuste real que proponer
            var normalizedOriginal = clampToWordGap(words, original, mode, opts);
            if (Math.abs(clamped - normalizedOriginal) < opts.minChangeSeconds) return;
            proposals.push({
                kind: kind,
                pairIdx: pairIdx,
                marker: marker,
                originalTime: original,
                newTime: clamped,
                llmTime: t,
                reason: String(raw.reason || ""),
                repeatedPhrase: repeatedPhrase || "",
                snippet: snippetAround(words, clamped, 6)
            });
        }

        if (unit.type === "first-in") {
            consider("IN", unit.pairIdx, pairs[unit.pairIdx].inMarker, response["in"], "");
        } else if (unit.type === "last-out") {
            consider("OUT", unit.pairIdx, pairs[unit.pairIdx].outMarker, response.out, "");
        } else {
            var rep = String(response.repeatedPhrase || "");
            consider("OUT", unit.outPairIdx, pairs[unit.outPairIdx].outMarker, response.out, rep);
            consider("IN", unit.inPairIdx, pairs[unit.inPairIdx].inMarker, response["in"], rep);
        }
        return proposals;
    }

    // ─── Transcript final ────────────────────────────────────

    function _fmtTime(t) {
        var s = Math.max(0, Math.round(t));
        var m = Math.floor(s / 60);
        var sec = s % 60;
        return m + ":" + (sec < 10 ? "0" : "") + sec;
    }

    /**
     * blocks: [{inTime, outTime}] ya ajustados y ordenados.
     * Devuelve { text, blockTexts: [], wordCount } — el transcript de la
     * clase como quedaría después de cortar.
     */
    function buildFinalTranscript(words, blocks) {
        var blockTexts = [];
        var wordCount = 0;
        var spoken = [];
        var i;
        for (i = 0; i < (words || []).length; i++) {
            var w = words[i];
            if (w.type && w.type !== "word") continue;
            spoken.push(w);
        }
        for (var b = 0; b < blocks.length; b++) {
            var blk = blocks[b];
            var parts = [];
            for (i = 0; i < spoken.length; i++) {
                var mid = (spoken[i].start + spoken[i].end) / 2;
                if (mid >= blk.inTime && mid <= blk.outTime) {
                    parts.push(spoken[i].text);
                }
            }
            wordCount += parts.length;
            blockTexts.push({
                index: b + 1,
                inTime: blk.inTime,
                outTime: blk.outTime,
                text: parts.join(" ")
            });
        }

        var lines = [];
        for (var t = 0; t < blockTexts.length; t++) {
            lines.push("[Bloque " + blockTexts[t].index + " · " + _fmtTime(blockTexts[t].inTime) +
                " → " + _fmtTime(blockTexts[t].outTime) + "]");
            lines.push(blockTexts[t].text);
            lines.push("");
        }
        return { text: lines.join("\n").replace(/\n+$/, "\n"), blockTexts: blockTexts, wordCount: wordCount };
    }

    /**
     * Prompt para el chequeo final de coherencia del transcript resultante.
     */
    function buildCoherencePrompt(finalText) {
        return {
            systemMsg: "Eres un revisor editorial de clases educativas en video. Responde ÚNICAMENTE con JSON válido.",
            prompt: "Este es el transcript de una clase DESPUÉS de aplicar los cortes de edición " +
                "(cada bloque es un segmento que se conserva, en orden):\n\n" + finalText + "\n\n" +
                "Evalúa si la clase se cuenta con sentido:\n" +
                "1. ¿La narrativa fluye entre bloques (el final de un bloque conecta con el inicio del siguiente)?\n" +
                "2. ¿Hay frases cortadas a la mitad al inicio o final de algún bloque?\n" +
                "3. ¿Hay contenido repetido entre bloques consecutivos?\n" +
                "4. ¿Falta algo evidente (saltos bruscos de tema)?\n\n" +
                "Responde JSON:\n" +
                '{"coherent": true|false, "score": <1-10>, "issues": [{"block": <número o 0 si es general>, ' +
                '"type": "corte-frase"|"repeticion"|"salto-tema"|"otro", "detail": "<breve, en español>"}], ' +
                '"summary": "<2-3 frases en español sobre cómo queda contada la clase>"}'
        };
    }

    var EPMarkerReviewer = {
        parsePairs: parsePairs,
        buildBoundaryUnits: buildBoundaryUnits,
        computeAudioWindows: computeAudioWindows,
        windowsCoverPairs: windowsCoverPairs,
        contextForTime: contextForTime,
        formatContext: formatContext,
        snippetAround: snippetAround,
        clampToWordGap: clampToWordGap,
        buildUnitPrompt: buildUnitPrompt,
        resolveUnitResponse: resolveUnitResponse,
        buildFinalTranscript: buildFinalTranscript,
        buildCoherencePrompt: buildCoherencePrompt,
        isOutMarker: isOutMarker,
        isClapperboardMarker: isClapperboardMarker
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = EPMarkerReviewer;
    }
    if (global) {
        global.EPMarkerReviewer = EPMarkerReviewer;
    }

})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : null));
