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

function lastEnd(words) {
    return words[words.length - 1].end;
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

    section("detectLeadIns() — conteo '3,2,1' al inicio del bloque mueve el IN");
    {
        // Bloque arranca con conteo "tres dos uno" y luego contenido real
        const w = mkWords("tres dos uno hola a todos bienvenidos a la clase de hoy sobre integrales", 100, 0.3, 0.2);
        const pairs = [
            { inMarker: mkMarker(99.8, "1", ""), outMarker: mkMarker(lastEnd(w) + 0.5, "", "OUT: x") }
        ];
        const props = MR.detectLeadIns(w, pairs);
        assertEq(props.length, 1, "detecta el conteo");
        assertEq(props[0].kind, "IN", "es un IN");
        assertEq(props[0].pairIdx, 0, "del bloque 0");
        assert(props[0].deterministic === true, "marcado como determinístico");
        // El IN debe avanzar hasta "hola" (índice 3)
        assert(props[0].newTime <= w[3].start, "IN clampado antes de 'hola'");
        assert(props[0].newTime > w[2].end, "IN después del final de 'uno'");
    }

    section("detectLeadIns() — sin conteo → sin propuesta");
    {
        const w = mkWords("bienvenidos a la clase de hoy vamos a ver un tema importante", 50);
        const pairs = [
            { inMarker: mkMarker(49.8, "1", ""), outMarker: mkMarker(lastEnd(w) + 0.5, "", "OUT: x") }
        ];
        const props = MR.detectLeadIns(w, pairs);
        assertEq(props.length, 0, "no propone sin conteo");
    }

    section("detectLeadIns() — un número suelto es contenido");
    {
        // "Una pregunta de negocio..." abre con artículo: leerlo como conteo movía
        // el IN a la segunda palabra y frenaba el pipeline.
        const w = mkWords("una pregunta de negocio sonaria mas o menos asi debemos priorizar belleza o mascotas", 50);
        const pairs = [
            { inMarker: mkMarker(49.8, "1", ""), outMarker: mkMarker(lastEnd(w) + 0.5, "", "OUT: x") }
        ];
        assertEq(MR.detectLeadIns(w, pairs).length, 0, "un solo número no es conteo");
    }

    section("detectLeadIns() — cue sin número no dispara solo");
    {
        // "vamos" es contenido, no debe tratarse como conteo sin un número
        const w = mkWords("vamos a empezar con la primera parte del tema de hoy sobre derivadas", 50);
        const pairs = [
            { inMarker: mkMarker(49.8, "1", ""), outMarker: mkMarker(lastEnd(w) + 0.5, "", "OUT: x") }
        ];
        const props = MR.detectLeadIns(w, pairs);
        assertEq(props.length, 0, "sin número no se considera conteo");
    }

    section("detectLeadIns() — el anuncio de retoma también es preámbulo");
    {
        // "Retomamos." y después de la pausa arranca la frase de verdad.
        const w = mkWords("retomamos", 50, 0.5, 0)
            .concat(mkWords("hoy vamos a ver el margen bruto de la tienda y su conversion", 51.4));
        const pairs = [
            { inMarker: mkMarker(49.9, "1", ""), outMarker: mkMarker(lastEnd(w) + 0.5, "", "OUT: x") }
        ];
        const props = MR.detectLeadIns(w, pairs);
        assertEq(props.length, 1, "el anuncio de retoma dispara sin conteo");
        assert(props[0].newTime <= w[1].start, "el IN abre en \"hoy\"");
        // Pero si la frase sigue pegada al anuncio, es clase: no hay preámbulo.
        const glued = mkWords("retomamos lo que vimos la clase pasada sobre el margen bruto y la conversion", 50);
        const gluedPairs = [
            { inMarker: mkMarker(49.9, "1", ""), outMarker: mkMarker(lastEnd(glued) + 0.5, "", "OUT: x") }
        ];
        assertEq(MR.detectLeadIns(glued, gluedPairs).length, 0,
            "\"Retomamos lo que vimos...\" es contenido");
    }

    section("markerBand() — los ~10s que el CD le da al IN");
    {
        const band = MR.markerBand({ startSeconds: 100, endSeconds: 110 });
        assertEq(band.span, 10, "la banda dura lo que el marcador");
        assertEq(band.start, 100, "empieza donde el marcador");
        assertEq(band.end, 110, "y acaba donde acaba");
        assertEq(MR.markerBand({ startSeconds: 100, endSeconds: 100.04 }), null,
            "un marcador de un frame es un punto, no una banda");
        assertEq(MR.markerBand({ startSeconds: 100 }), null, "sin endSeconds no hay banda");
        assertEq(MR.markerBand({ startSeconds: 100, endSeconds: 400 }), null,
            "una banda larguísima no habla de dónde abre el bloque");

        assertEq(MR.bandVerdict(band, 104), "", "dentro de la banda no hay nada que decir");
        assertEq(MR.bandVerdict(band, 112), "late", "más adelante del final: late");
        assertEq(MR.bandVerdict(band, 98), "early", "antes del inicio: early");
        assertEq(MR.bandVerdict(null, 98), "", "sin banda no se opina");
    }

    section("contextForTime() — palabras alrededor de un tiempo");
    {
        const words = mkWords("uno dos tres cuatro cinco seis siete ocho", 10);
        const ctx = MR.contextForTime(words, words[3].start + 0.05, 2);
        assertEq(ctx.before.length, 2, "2 palabras antes");
        assertEq(ctx.before[1].text, "tres", "última palabra antes");
        assertEq(ctx.after[0].text, "cuatro", "primera palabra después");
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

    section("coherenceTargets() — de lo que dice el revisor a qué borde arreglar");
    {
        const key = t => t.map(x => x.kind + ":" + x.pairIdx).join(" ");

        const repeats = { repeat: { "OUT:3": true } };
        assertEq(key(MR.coherenceTargets(
            [{ block: 4, type: "repeticion", detail: "el bloque 5 repite esto" }], 10, repeats)),
            "OUT:3", "una repetición se arregla en el cierre del bloque citado");

        // Caso real (clase 15 con la repetición dentro): el revisor señaló el bloque 5
        // diciendo que repetía lo del anterior. El cierre a arreglar es el del 4.
        assertEq(key(MR.coherenceTargets(
            [{ block: 5, type: "repeticion",
               detail: "Repite información ya dada en el bloque anterior sobre el dashboard." }], 10, repeats)),
            "OUT:3", "si el bloque citado es la segunda vez, se cierra antes el de antes");
        assertEq(MR.coherenceTargets(
            [{ block: 1, type: "repeticion", detail: "repite lo anterior" }], 10, repeats).length, 0,
            "no hay bloque antes del primero");
        // El revisor apunta al bloque de al lado 3 veces de 5: sin palabras repetidas
        // medibles en ESE cierre, no se mueve nada.
        assertEq(MR.coherenceTargets(
            [{ block: 3, type: "repeticion", detail: "el bloque 4 repite esto" }], 10, repeats).length, 0,
            "una repetición que el transcript no ve no manda a ningún borde");
        assertEq(MR.coherenceTargets(
            [{ block: 4, type: "repeticion", detail: "repite" }], 10).length, 0,
            "sin pruebas del transcript no se toca nada");

        // Los saltos de tema no se arreglan moviendo marcadores: falta material que
        // nunca se grabó, y mover un borde bueno solo lo estropea.
        assertEq(MR.coherenceTargets(
            [{ block: 4, type: "salto-tema", detail: "se pasa de golpe a otro tema" }], 10).length, 0,
            "un salto de tema no manda a ningún borde");

        // Que un corte parta una frase se mide: sin confirmación del transcript, el
        // revisor se equivocó de bloque (lo hace, medido en las clases 14 y 15).
        const cut = { cut: { "IN:1": true, "OUT:1": true } };
        assertEq(key(MR.coherenceTargets(
            [{ block: 2, type: "corte-frase", detail: "el bloque empieza a media frase" }], 10, cut)),
            "IN:1", "\"empieza\" señala la apertura");
        assertEq(key(MR.coherenceTargets(
            [{ block: 2, type: "corte-frase", detail: "la frase del final queda cortada" }], 10, cut)),
            "OUT:1", "\"final\" señala el cierre");
        assertEq(key(MR.coherenceTargets(
            [{ block: 2, type: "corte-frase", detail: "frase incompleta" }], 10, cut)),
            "IN:1 OUT:1", "sin pista, se revisan los dos bordes del bloque");
        assertEq(MR.coherenceTargets(
            [{ block: 2, type: "corte-frase", detail: "frase incompleta" }], 10).length, 0,
            "si el transcript no ve la frase partida, no se toca nada");
        assertEq(MR.coherenceTargets(
            [{ block: 5, type: "corte-frase", detail: "frase incompleta" }], 10, cut).length, 0,
            "y la confirmación es de ESE borde, no de cualquiera");

        // Lo que no dice dónde no se toca, y nada se sale de la clase.
        assertEq(MR.coherenceTargets([{ block: 0, type: "otro", detail: "va bien" }], 10).length, 0,
            "un comentario general no manda a ningún borde");
        assertEq(MR.coherenceTargets([{ block: 3, type: "otro", detail: "suena raro" }], 10).length, 0,
            "\"otro\" tampoco: no dice qué borde");
        assertEq(MR.coherenceTargets([{ block: 99, type: "repeticion", detail: "x" }], 10).length, 0,
            "un bloque que no existe se ignora");
        assertEq(MR.coherenceTargets(null, 10).length, 0, "sin observaciones no hay nada que hacer");

        // El mismo borde señalado dos veces se arregla una.
        assertEq(key(MR.coherenceTargets([
            { block: 4, type: "repeticion", detail: "repite" },
            { block: 4, type: "corte-frase", detail: "el final queda cortado" }
        ], 10, { cut: { "OUT:3": true }, repeat: { "OUT:3": true } })),
            "OUT:3", "el mismo borde no entra dos veces");
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
