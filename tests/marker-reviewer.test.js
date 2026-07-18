/**
 * Tests Node del revisor de marcadores (marker-reviewer.js).
 * Ejecutar con: node tests/run-node-tests.js
 */
"use strict";

const MR = require("../client/js/marker-reviewer.js");

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (cond) {
        passed++;
    } else {
        failed++;
        console.error("  ✗ FALLO: " + msg);
    }
}

function assertEq(actual, expected, msg) {
    assert(actual === expected, msg + " (esperado: " + expected + ", obtenido: " + actual + ")");
}

function assertClose(actual, expected, tol, msg) {
    assert(Math.abs(actual - expected) <= tol, msg + " (esperado: ~" + expected + ", obtenido: " + actual + ")");
}

function section(name) {
    console.log("\n── " + name);
}

function mkWords(text, startTime, wordDur, gap) {
    wordDur = wordDur || 0.3;
    gap = gap || 0.1;
    const words = [];
    let t = startTime;
    for (const token of text.split(/\s+/).filter(Boolean)) {
        words.push({ text: token, start: t, end: t + wordDur, type: "word" });
        t += wordDur + gap;
    }
    return words;
}

function mkMarker(startSeconds, name, comments) {
    return { name: name || "", comments: comments || "", startSeconds: startSeconds, colorIndex: -1 };
}

function run() {

    section("parsePairs() — pares básicos con claqueta por nombre");
    {
        const markers = [
            mkMarker(16, "K", "- Clapperboard"),
            mkMarker(30, "1", ""),
            mkMarker(90, "", "OUT: fin bloque 1"),
            mkMarker(120, "2", ""),
            mkMarker(200, "", "OUT: fin bloque 2")
        ];
        const r = MR.parsePairs(markers);
        assertEq(r.error, null, "sin error");
        assertEq(r.pairs.length, 2, "2 pares");
        assertEq(r.skipped.length, 1, "claqueta ignorada");
        assertEq(r.skipped[0].startSeconds, 16, "la claqueta es la de 16s");
        assertEq(r.pairs[0].inMarker.startSeconds, 30, "IN del par 1");
        assertEq(r.pairs[1].outMarker.startSeconds, 200, "OUT del par 2");
        assertEq(r.warnings.length, 0, "sin warnings");
    }

    section("parsePairs() — claqueta sin nombre reconocible → primer marcador");
    {
        const markers = [
            mkMarker(5, "M1", ""),
            mkMarker(30, "1", ""),
            mkMarker(90, "", "OUT: fin")
        ];
        const r = MR.parsePairs(markers);
        assertEq(r.pairs.length, 1, "1 par");
        assertEq(r.skipped[0].startSeconds, 5, "primer marcador descartado como claqueta");
    }

    section("parsePairs() — huérfanos generan warnings");
    {
        const markers = [
            mkMarker(10, "K", "clapperboard"),
            mkMarker(30, "1", ""),
            mkMarker(90, "", "OUT: fin"),
            mkMarker(100, "", "OUT: doble"),
            mkMarker(120, "2", "")
        ];
        const r = MR.parsePairs(markers);
        assertEq(r.pairs.length, 1, "1 par válido");
        assertEq(r.warnings.length, 2, "OUT huérfano + IN final sin cierre");
    }

    section("buildBoundaryUnits() — unidades = pares + 1");
    {
        const pairs = [{}, {}, {}];
        const units = MR.buildBoundaryUnits(pairs);
        assertEq(units.length, 4, "3 pares → 4 unidades");
        assertEq(units[0].type, "first-in", "primera unidad");
        assertEq(units[1].type, "transition", "transición 1");
        assertEq(units[1].outPairIdx, 0, "OUT del par 0");
        assertEq(units[1].inPairIdx, 1, "IN del par 1");
        assertEq(units[3].type, "last-out", "última unidad");
        assertEq(MR.buildBoundaryUnits([{}]).length, 2, "1 par → first-in + last-out");
    }

    section("computeAudioWindows() — ventanas alrededor de los cortes con merge");
    {
        const pairs = [
            { inMarker: mkMarker(100, "1", ""), outMarker: mkMarker(200, "", "OUT: a") },
            { inMarker: mkMarker(210, "2", ""), outMarker: mkMarker(300, "", "OUT: b") },
            { inMarker: mkMarker(1000, "3", ""), outMarker: mkMarker(1100, "", "OUT: c") }
        ];
        // margin 120: [ -20→0,320 ] merge de los dos primeros; [880,1220] aparte
        const wins = MR.computeAudioWindows(pairs, { windowMarginSec: 120 });
        assertEq(wins.length, 2, "dos ventanas (las dos primeras se fusionan)");
        assertEq(wins[0].start, 0, "primera ventana clampa a 0");
        assertEq(wins[0].end, 300 + 120, "primera ventana hasta OUT del par 2 + margen");
        assertEq(wins[1].start, 1000 - 120, "segunda ventana desde IN del par 3 - margen");
        assertEq(wins[1].end, 1100 + 120, "segunda ventana hasta OUT del par 3 + margen");
    }

    section("windowsCoverPairs() — cobertura de fronteras");
    {
        const pairs = [
            { inMarker: mkMarker(100, "1", ""), outMarker: mkMarker(200, "", "OUT: a") }
        ];
        assert(MR.windowsCoverPairs([{ start: 0, end: 400 }], pairs), "ventana amplia cubre");
        assert(!MR.windowsCoverPairs([{ start: 0, end: 150 }], pairs), "ventana que no llega al OUT no cubre");
        assert(!MR.windowsCoverPairs([], pairs), "sin ventanas no cubre");
    }

    section("contextForTime() y formatContext()");
    {
        const words = mkWords("uno dos tres cuatro cinco seis siete ocho", 10);
        const ctx = MR.contextForTime(words, words[3].start + 0.05, 2);
        assertEq(ctx.before.length, 2, "2 palabras antes");
        assertEq(ctx.before[1].text, "tres", "última palabra antes");
        assertEq(ctx.after[0].text, "cuatro", "primera palabra después");
        const fmt = MR.formatContext(ctx.after.slice(0, 1));
        assert(/^\(\d+\.\d\)cuatro$/.test(fmt), "formato (t)palabra: " + fmt);
    }

    section("clampToWordGap() — IN nunca corta palabra");
    {
        const words = mkWords("hola bienvenidos a la clase", 20, 0.3, 0.4);
        // Tiempo propuesto a mitad de "bienvenidos" (empieza en 20.7)
        const midWord = words[1].start + 0.15;
        const clamped = MR.clampToWordGap(words, midWord, "in");
        assert(clamped <= words[1].start, "IN clampado antes del inicio de la palabra (obtenido " + clamped + ")");
        assert(clamped > words[0].end, "IN después del final de la palabra previa");
    }

    section("clampToWordGap() — OUT queda después de la última palabra");
    {
        const words = mkWords("esta es la frase final", 30, 0.3, 0.4);
        const lastW = words[words.length - 1];
        const midLast = lastW.start + 0.1;
        const clamped = MR.clampToWordGap(words, midLast, "out");
        assert(clamped >= lastW.end, "OUT clampado después del final de la palabra (obtenido " + clamped + ")");
    }

    section("resolveUnitResponse() — move válido con clamp");
    {
        const words = mkWords("tres dos uno hola bienvenidos a la clase de hoy", 10, 0.3, 0.4);
        // IN original en 10 (antes del conteo); el LLM propone empezar en "hola" (words[3])
        const pairs = [{ inMarker: mkMarker(10, "1", ""), outMarker: mkMarker(60, "", "OUT: x") }];
        const unit = { type: "first-in", pairIdx: 0 };
        const proposals = MR.resolveUnitResponse(unit, {
            "in": { action: "move", time: words[3].start, reason: "El conteo 3,2,1 debe quedar fuera" }
        }, pairs, words);
        assertEq(proposals.length, 1, "1 propuesta");
        assertEq(proposals[0].kind, "IN", "es IN");
        assert(proposals[0].newTime <= words[3].start, "clampado antes de 'hola'");
        assert(proposals[0].newTime > words[2].end, "después del final de 'uno'");
        assert(proposals[0].reason.indexOf("conteo") !== -1, "conserva la razón");
    }

    section("resolveUnitResponse() — keep y deltas insignificantes no proponen");
    {
        const words = mkWords("contenido de la clase aqui", 10);
        const pairs = [{ inMarker: mkMarker(9.8, "1", ""), outMarker: mkMarker(30, "", "OUT: x") }];
        const unit = { type: "first-in", pairIdx: 0 };

        let proposals = MR.resolveUnitResponse(unit, { "in": { action: "keep" } }, pairs, words);
        assertEq(proposals.length, 0, "keep → sin propuestas");

        // move con tiempo ≈ original (el clamp lo devuelve al mismo sitio)
        proposals = MR.resolveUnitResponse(unit, { "in": { action: "move", time: 9.85 } }, pairs, words);
        assertEq(proposals.length, 0, "delta insignificante → sin propuestas");
    }

    section("resolveUnitResponse() — movimientos absurdos se descartan");
    {
        const words = mkWords("palabras de relleno para el test de seguridad", 10);
        const pairs = [{ inMarker: mkMarker(12, "1", ""), outMarker: mkMarker(40, "", "OUT: x") }];
        const unit = { type: "first-in", pairIdx: 0 };

        let proposals = MR.resolveUnitResponse(unit, { "in": { action: "move", time: 500 } }, pairs, words);
        assertEq(proposals.length, 0, "move de 488s descartado (maxMoveSeconds)");

        proposals = MR.resolveUnitResponse(unit, { "in": { action: "move", time: "no-numero" } }, pairs, words);
        assertEq(proposals.length, 0, "tiempo no numérico descartado");

        proposals = MR.resolveUnitResponse(unit, null, pairs, words);
        assertEq(proposals.length, 0, "respuesta nula → sin propuestas");
    }

    section("resolveUnitResponse() — transición con OUT e IN + frase repetida");
    {
        // Bloque 1: 10-30, bloque 2: 50-80. El LLM retrocede el OUT a 25 y mueve el IN a 52.
        const w1 = mkWords("la primera parte del tema con una frase que se repite al final", 10, 0.3, 0.4);
        const w2 = mkWords("una frase que se repite al final y ahora el contenido nuevo", 50, 0.3, 0.4);
        const words = w1.concat(w2);
        const pairs = [
            { inMarker: mkMarker(9.5, "1", ""), outMarker: mkMarker(30, "", "OUT: a") },
            { inMarker: mkMarker(49.5, "2", ""), outMarker: mkMarker(80, "", "OUT: b") }
        ];
        const unit = { type: "transition", outPairIdx: 0, inPairIdx: 1 };
        const repeatStart = w1[7].start; // "una"
        const proposals = MR.resolveUnitResponse(unit, {
            out: { action: "move", time: repeatStart, reason: "El bloque siguiente repite esta frase" },
            "in": { action: "keep" },
            repeatedPhrase: "una frase que se repite al final"
        }, pairs, words);
        assertEq(proposals.length, 1, "solo el OUT se mueve");
        assertEq(proposals[0].kind, "OUT", "es OUT");
        assertEq(proposals[0].pairIdx, 0, "del par 0");
        assert(proposals[0].newTime < 30, "el OUT retrocede");
        assert(proposals[0].repeatedPhrase.indexOf("repite") !== -1, "lleva la frase repetida");
    }

    section("buildUnitPrompt() — estructura de los prompts");
    {
        const words = mkWords("tres dos uno hola bienvenidos a la clase", 10);
        const pairs = [
            { inMarker: mkMarker(10, "1", ""), outMarker: mkMarker(30, "", "OUT: a") },
            { inMarker: mkMarker(40, "2", ""), outMarker: mkMarker(60, "", "OUT: b") }
        ];
        const p1 = MR.buildUnitPrompt({ type: "first-in", pairIdx: 0 }, pairs, words);
        assert(p1.systemMsg.indexOf("JSON") !== -1, "system pide JSON");
        assert(p1.prompt.indexOf("PRIMER MARCADOR IN") !== -1, "prompt de primer IN");
        assert(p1.prompt.indexOf("(1") !== -1, "incluye timestamps de contexto");

        const p2 = MR.buildUnitPrompt({ type: "transition", outPairIdx: 0, inPairIdx: 1, hints: "pista X" }, pairs, words);
        assert(p2.prompt.indexOf("TRANSICIÓN") !== -1, "prompt de transición");
        assert(p2.prompt.indexOf("REPITE") !== -1, "incluye la instrucción de repetición");
        assert(p2.prompt.indexOf("pista X") !== -1, "incluye los hints determinísticos");

        const p3 = MR.buildUnitPrompt({ type: "last-out", pairIdx: 1 }, pairs, words);
        assert(p3.prompt.indexOf("ÚLTIMO MARCADOR OUT") !== -1, "prompt de último OUT");
    }

    section("buildFinalTranscript() — transcript de los bloques");
    {
        const w1 = mkWords("bloque uno con contenido", 10);
        const gap = mkWords("esto se corta", 20);
        const w2 = mkWords("bloque dos con mas contenido", 30);
        const words = w1.concat(gap, w2);
        const blocks = [
            { inTime: 9.5, outTime: w1[w1.length - 1].end + 0.3 },
            { inTime: 29.5, outTime: w2[w2.length - 1].end + 0.3 }
        ];
        const ft = MR.buildFinalTranscript(words, blocks);
        assertEq(ft.blockTexts.length, 2, "2 bloques");
        assertEq(ft.blockTexts[0].text, "bloque uno con contenido", "texto del bloque 1");
        assertEq(ft.blockTexts[1].text, "bloque dos con mas contenido", "texto del bloque 2");
        assert(ft.text.indexOf("esto se corta") === -1, "el contenido eliminado no aparece");
        assertEq(ft.wordCount, 9, "conteo de palabras");
        assert(ft.text.indexOf("[Bloque 1") !== -1, "encabezados de bloque");
    }

    section("buildCoherencePrompt() — incluye el transcript y pide JSON");
    {
        const p = MR.buildCoherencePrompt("[Bloque 1]\ntexto de prueba\n");
        assert(p.prompt.indexOf("texto de prueba") !== -1, "incluye el transcript");
        assert(p.prompt.indexOf("coherent") !== -1, "pide el campo coherent");
        assert(p.systemMsg.indexOf("JSON") !== -1, "system pide JSON");
    }

    section("isClapperboardMarker() / isOutMarker()");
    {
        assert(MR.isClapperboardMarker(mkMarker(1, "K", "- Clapperboard")), "clapperboard en comment");
        assert(MR.isClapperboardMarker(mkMarker(1, "CLAQUETA", "")), "claqueta en nombre");
        assert(!MR.isClapperboardMarker(mkMarker(1, "1", "inicio")), "marcador normal no es claqueta");
        assert(MR.isOutMarker(mkMarker(1, "", "OUT: fin")), "OUT: al inicio del comment");
        assert(!MR.isOutMarker(mkMarker(1, "", "el OUT: no cuenta")), "OUT: en medio no cuenta");
    }

    return { passed, failed };
}

module.exports = { run };
