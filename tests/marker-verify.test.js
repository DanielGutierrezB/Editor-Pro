/**
 * Tests del módulo puro marker-verify.js: revisión del resultado de los
 * marcadores contra el transcript (aire, cortes a mitad de palabra, conteos,
 * comandos al editor, pickups, solapes).
 *
 * Ejecutar con: node tests/run-node-tests.js
 */
"use strict";

const MV = require("../client/js/marker-verify.js");
const MP = require("../client/js/marker-precision.js");

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (cond) { passed++; } else { failed++; console.error("  ✗ FALLO: " + msg); }
}
function assertEq(actual, expected, msg) {
    assert(actual === expected, msg + " (esperado: " + expected + ", obtenido: " + actual + ")");
}
function section(name) { console.log("\n── " + name); }

const FPS = 25;
const OPTS = { padFrames: 10, fps: FPS };   // colchón 0.4s, mínimo aceptado 0.2s

/** Construye words[] a partir de [texto, duración, silencio después]. */
function build(spec, startAt) {
    let t = startAt || 0;
    const out = [];
    for (const [text, dur, gap] of spec) {
        out.push({ text, start: +t.toFixed(3), end: +(t + dur).toFixed(3), type: "word" });
        t += dur + gap;
    }
    return out;
}

/** Busca el verdict de un borde concreto. */
function find(res, pairIdx, kind) {
    return res.boundaries.filter(b => b.pairIdx === pairIdx && b.kind === kind)[0];
}
function codesOf(res) {
    return res.failures.map(f => f.code).sort().join(",");
}
/** El texto de una palabra devuelta por los detectores (null incluido). */
function wordOf(w) {
    return w ? w.text : null;
}

function run() {
    passed = 0; failed = 0;

    // Bloque limpio: "hola a todos" (1.0-2.5) con silencio amplio a los lados.
    const clean = build([
        ["hola", 0.4, 0.1], ["a", 0.15, 0.1], ["todos", 0.5, 2.0],
        ["siguiente", 0.5, 0.1], ["cosa", 0.4, 1.0]
    ], 1.0);

    section("verifyBlocks() — un bloque con aire suficiente pasa");
    const okBlock = [{ inTime: 0.5, outTime: 3.0 }];   // 0.5s antes de "hola"(1.0), 0.75s tras "todos"(2.25)
    const okRes = MV.verifyBlocks(clean, okBlock, OPTS);
    assertEq(okRes.ok, true, "sin fallas: " + codesOf(okRes));
    assertEq(okRes.checked, 2, "revisa los dos bordes del bloque");
    assert(find(okRes, 0, "IN").airFrames > 10, "reporta el aire real del IN en frames");
    assert(MV.summarize(okRes).indexOf("todos pasan") !== -1, "el resumen dice que pasan");

    section("verifyBlocks() — corte a mitad de palabra");
    const midRes = MV.verifyBlocks(clean, [{ inTime: 1.2, outTime: 3.0 }], OPTS);
    const midIn = find(midRes, 0, "IN");
    assertEq(midIn.ok, false, "el IN a mitad de palabra no pasa");
    assertEq(midIn.code, "mid-word", "lo clasifica como mid-word");
    assertEq(midIn.word, "hola", "dice qué palabra está partiendo");
    assertEq(midIn.targetTime, 1.0, "apunta al inicio de la palabra partida");

    section("verifyBlocks() — sin aire habiendo silencio disponible");
    // IN a 0.04s de "hola": 1 frame de aire, con 1s de silencio disponible antes.
    const tightRes = MV.verifyBlocks(clean, [{ inTime: 0.96, outTime: 3.0 }], OPTS);
    const tightIn = find(tightRes, 0, "IN");
    assertEq(tightIn.code, "no-air", "detecta la falta de colchón");
    assert(tightIn.airFrames < 2, "reporta el aire ínfimo");
    assertEq(tightIn.targetTime, 1.0, "apunta a la palabra que hay que respetar");

    section("verifyBlocks() — sin silencio disponible no es falla");
    // Palabras pegadas entre sí: el IN cae en la frontera exacta porque no hay
    // silencio de dónde sacar aire, y aun así el borde pasa.
    const glued = build([
        ["hola.", 0.4, 0], ["mundo", 0.4, 0], ["esto", 0.4, 0], ["sigue", 0.4, 2.0]
    ], 5.0);
    const gluedRes = MV.verifyBlocks(glued, [{ inTime: glued[1].start, outTime: 8.5 }], OPTS);
    assertEq(find(gluedRes, 0, "IN").code, "", "sin silencio, el IN pegado a la palabra pasa");

    section("verifyBlocks() — poco aire es AVISO, no frena el corte");
    // El caso real: el IN abre 3.6 frames antes de "qué" cuando solo hay 7.2 frames
    // de silencio. El colchón pide 10, pero no existen: frenar el pipeline por 3.6
    // frames de estética es peor que el defecto.
    const tightWords = [
        { text: "responder", start: 8.0, end: 8.6, type: "word" },
        { text: "esa", start: 8.8, end: 9.1, type: "word" },
        { text: "pregunta.", start: 9.3, end: 10.0, type: "word" },
        { text: "qué", start: 10.288, end: 10.6, type: "word" },
        { text: "es", start: 10.8, end: 11.0, type: "word" },
        { text: "una", start: 11.2, end: 11.5, type: "word" },
        { text: "pregunta", start: 11.7, end: 12.4, type: "word" },
        { text: "de", start: 12.6, end: 12.8, type: "word" },
        { text: "negocio", start: 13.0, end: 13.8, type: "word" }
    ];
    const tightRes2 = MV.verifyBlocks(tightWords, [{ inTime: 10.144, outTime: 14.2 }], OPTS);
    const tightIn2 = find(tightRes2, 0, "IN");
    assertEq(tightIn2.code, "tight-air", "poco aire con poco silencio disponible es tight-air");
    assertEq(tightIn2.severity, "warn", "y su severidad es aviso");
    assertEq(tightRes2.ok, true, "la revisión PASA: no hay nada que frene el corte");
    assertEq(tightRes2.warnings.length, 1, "el aviso queda reportado aparte");
    assertEq(tightRes2.failures.length, 0, "y no cuenta como falla");
    assert(tightIn2.message.indexOf("3.6") !== -1 && tightIn2.message.indexOf("7.2") !== -1,
        "el mensaje dice el aire que hay y el disponible: " + tightIn2.message);

    section("verifyBlocks() — aire tan corto que se oye sí frena");
    // 0.8 frames de aire con 7.2 disponibles: eso se come el ataque de la palabra.
    const clipRes = MV.verifyBlocks(tightWords, [{ inTime: 10.256, outTime: 14.2 }], OPTS);
    const clipIn = find(clipRes, 0, "IN");
    assertEq(clipIn.code, "no-air", "por debajo del piso duro es no-air");
    assertEq(clipIn.severity, "block", "y sí frena el corte");
    assertEq(clipRes.ok, false, "la revisión no pasa");

    section("airVerdict() — las tres reglas del aire");
    assertEq(MV.airVerdict({ frames: 10, available: 25 }, OPTS), "",
        "con el colchón completo no hay nada que decir");
    assertEq(MV.airVerdict({ frames: 6, available: 7 }, OPTS), "",
        "si el silencio disponible ya está casi todo tomado, pasa");
    assertEq(MV.airVerdict({ frames: 0, available: 0 }, OPTS), "",
        "sin silencio no se puede exigir aire");
    assertEq(MV.airVerdict({ frames: 3.6, available: 7.2 }, OPTS), "warn",
        "aire corto pero audible: aviso");
    assertEq(MV.airVerdict({ frames: 1, available: 25 }, OPTS), "block",
        "aire por debajo del piso habiendo silencio: bloquea");

    section("verifyBlocks() — bloque que arranca con conteo");
    const withCount = build([
        ["tres", 0.3, 0.2], ["dos", 0.3, 0.2], ["uno", 0.3, 0.9],
        ["hola", 0.4, 0.1], ["a", 0.15, 0.1], ["todos", 0.5, 0.1],
        ["hoy", 0.3, 0.1], ["vemos", 0.4, 2.0]
    ], 1.0);
    const countRes = MV.verifyBlocks(withCount, [{ inTime: 0.5, outTime: 5.5 }], OPTS);
    const countIn = find(countRes, 0, "IN");
    assertEq(countIn.code, "lead-in", "detecta el conteo al inicio del bloque");
    assertEq(countIn.word, "hola", "señala dónde empieza el contenido");

    section("verifyBlocks() — un número suelto es contenido, no un conteo");
    // Caso real: el bloque abre con la frase que pide la nota del CD y el
    // detector la leía como conteo porque "una" estaba en la lista de números.
    const article = build([
        ["Una", 0.3, 0.1], ["pregunta", 0.4, 0.1], ["de", 0.2, 0.1], ["negocio", 0.4, 0.1],
        ["sonaría", 0.4, 0.1], ["más", 0.3, 0.1], ["o", 0.2, 0.1], ["menos", 0.4, 2.0]
    ], 1.0);
    const artRes = MV.verifyBlocks(article, [{ inTime: 0.5, outTime: 4.5 }], OPTS);
    assertEq(find(artRes, 0, "IN").code, "", "\"Una pregunta de negocio...\" no es un conteo");
    assertEq(MV.leadInWord(article), null, "leadInWord() se calla con un solo número");
    // Un número con un cue de producción al lado sí es un arranque de grabación.
    const cueCount = build([
        ["listo", 0.3, 0.1], ["tres", 0.3, 0.5],
        ["hola", 0.4, 0.1], ["a", 0.15, 0.1], ["todos", 0.5, 0.1], ["hoy", 0.3, 2.0]
    ], 1.0);
    assert(MV.leadInWord(cueCount) !== null, "\"listo, tres\" sí es arranque de producción");

    section("leadInWord() — el anuncio de retoma vale sin conteo");
    // El profesor avisa que vuelve a grabar y arranca la frase después.
    const saysRetake = build([
        ["Retomamos.", 0.5, 0.9],
        ["Hoy", 0.3, 0.1], ["vamos", 0.4, 0.1], ["a", 0.15, 0.1], ["ver", 0.3, 0.1],
        ["el", 0.15, 0.1], ["margen", 0.5, 2.0]
    ], 1.0);
    assertEq(wordOf(MV.leadInWord(saysRetake, OPTS)), "Hoy",
        "\"Retomamos.\" es preámbulo: el bloque empieza en la frase siguiente");
    assertEq(find(MV.verifyBlocks(saysRetake, [{ inTime: 0.5, outTime: 5.5 }], OPTS), 0, "IN").code,
        "lead-in", "y sale como lead-in en el reporte");

    // Pero "Retomemos" seguido de la propia frase es clase, no preámbulo: cortar
    // ahí abriría el bloque en "lo".
    const retakeContent = build([
        ["Retomemos", 0.5, 0.08], ["lo", 0.2, 0.08], ["que", 0.2, 0.08],
        ["vimos", 0.4, 0.08], ["la", 0.15, 0.08], ["clase", 0.4, 0.08],
        ["pasada", 0.5, 2.0]
    ], 1.0);
    assertEq(MV.leadInWord(retakeContent, OPTS), null,
        "\"Retomemos lo que vimos...\" es contenido, no un anuncio");

    section("trailingCueWord() — lo que sobra al final del bloque");
    const abort = build([
        ["esto", 0.3, 0.1], ["es", 0.2, 0.1], ["el", 0.15, 0.1], ["margen.", 0.5, 0.6],
        ["Me", 0.2, 0.05], ["equivoqué.", 0.6, 0.5], ["Pausa.", 0.5, 2.0]
    ], 1.0);
    assertEq(wordOf(MV.trailingCueWord(abort)), "margen.",
        "quita el intento abandonado y el cue al editor en capas");
    const cueOnly = build([
        ["esto", 0.3, 0.1], ["es", 0.2, 0.1], ["el", 0.15, 0.1], ["margen.", 0.5, 0.6],
        ["Pausa.", 0.5, 2.0]
    ], 1.0);
    assertEq(wordOf(MV.trailingCueWord(cueOnly)), "margen.", "el cue al editor solo, igual");
    // Casos reales de la clase 15: las sobras vienen en racimo con muletillas.
    const cluster = build([
        ["que", 0.2, 0.1], ["yo", 0.2, 0.1], ["ya", 0.2, 0.1], ["dije.", 0.4, 0.5],
        ["Bueno,", 0.3, 0.1], ["no,", 0.2, 0.1], ["espera.", 0.5, 2.0]
    ], 1.0);
    assertEq(wordOf(MV.trailingCueWord(cluster)), "dije.",
        "\"Bueno, no, espera.\" se pela entero");
    const cueThenGo = build([
        ["esa", 0.3, 0.1], ["cadena", 0.4, 0.1], ["completa.", 0.5, 0.5],
        ["Pausa.", 0.4, 0.3], ["Va.", 0.3, 2.0]
    ], 1.0);
    assertEq(wordOf(MV.trailingCueWord(cueThenGo)), "completa.",
        "\"Pausa. Va.\" también, aunque el cue de producción vaya al final");
    const noJunk = build([
        ["esto", 0.3, 0.1], ["es", 0.2, 0.1], ["el", 0.15, 0.1], ["margen", 0.5, 0.1],
        ["bruto", 0.5, 2.0]
    ], 1.0);
    assertEq(MV.trailingCueWord(noJunk), null, "un bloque que cierra bien no tiene sobras");
    // "me" y "no" sueltos son clase: solo cuentan dentro de su frase de aborto.
    const loose = build([
        ["eso", 0.3, 0.1], ["a", 0.15, 0.1], ["mí", 0.2, 0.1], ["me", 0.2, 0.1],
        ["sirve", 0.4, 0.1], ["y", 0.15, 0.1], ["esto", 0.3, 0.1], ["no", 0.3, 2.0]
    ], 1.0);
    assertEq(MV.trailingCueWord(loose), null,
        "\"me\" y \"no\" sueltos no son un intento abandonado");
    const goes = build([
        ["y", 0.15, 0.1], ["por", 0.2, 0.1], ["ahí", 0.3, 0.1], ["va", 0.3, 2.0]
    ], 1.0);
    assertEq(MV.trailingCueWord(goes), null,
        "un cue de producción sin cue al editor detrás no prueba nada");

    section("verifyBlocks() — el bloque abre a mitad de la toma");
    // Caso real: la grabación se paró 24s, la toma nueva abre con "¿Qué es la
    // respuesta?" y el IN entraba 5s después, en "juntas", tirando ese arranque.
    const midTake = build([
        ["hola", 0.4, 0.2], ["a", 0.2, 0.2], ["todos", 0.4, 24.0],
        ["¿Qué", 0.3, 1.4], ["es", 0.2, 1.4], ["la", 0.2, 0.02], ["respuesta?", 0.5, 2.6],
        ["juntas", 0.4, 0.1], ["te", 0.2, 0.1], ["ayudan", 0.4, 0.1], ["a", 0.1, 0.1],
        ["ver", 0.3, 2.0]
    ], 1.0);
    const takeStart = midTake[3].start;      // "¿Qué"
    const insideIn = midTake[7].start - 0.4; // colchón antes de "juntas"
    const takeRes = MV.verifyBlocks(midTake, [{ inTime: insideIn, outTime: midTake[11].end + 0.4 }], OPTS);
    const takeIn = find(takeRes, 0, "IN");
    assertEq(takeIn.code, "take-start", "detecta que el IN entra a mitad de la toma");
    assertEq(takeIn.word, "¿Qué", "señala con qué palabra abre la toma");
    assertEq(takeIn.targetTime, takeStart, "el objetivo es el arranque de la toma");
    assertEq(MV.resolvesIssue(takeIn, takeStart - 0.4, OPTS), true,
        "abrir en el arranque de la toma (con colchón) resuelve");
    assertEq(MV.resolvesIssue(takeIn, insideIn, OPTS), false, "dejarlo adentro NO resuelve");

    // Un IN que ya abre la toma no tiene nada que arreglar.
    const atTakeRes = MV.verifyBlocks(midTake, [{ inTime: takeStart - 0.4, outTime: midTake[11].end + 0.4 }], OPTS);
    assertEq(find(atTakeRes, 0, "IN").code, "", "el IN que abre la toma pasa");

    // Una pausa entre intentos (5s) no es una toma nueva: lo que viene después
    // suele ser un flub o un cue al equipo, y el IN hace bien en dejarlo fuera.
    const pause = build([
        ["hola", 0.4, 0.2], ["a", 0.2, 0.2], ["todos", 0.4, 5.0],
        ["ay", 0.3, 0.2], ["perdón", 0.4, 0.6],
        ["en", 0.2, 0.1], ["la", 0.2, 0.1], ["clase", 0.4, 0.1], ["pasada", 0.4, 0.1],
        ["vimos", 0.4, 2.0]
    ], 1.0);
    assertEq(MV.takeStartWord(pause, pause[5].start - 0.4, 0, OPTS), null,
        "una pausa corta no cuenta como toma nueva");

    // Con la grabación parada de verdad, una toma que abre disculpándose tampoco
    // arrastra la disculpa: el arranque real es la primera palabra de contenido.
    const sorry = build([
        ["hola", 0.4, 0.2], ["todos", 0.4, 20.0],
        ["ay", 0.3, 0.2], ["perdón", 0.4, 0.6],
        ["en", 0.2, 0.1], ["la", 0.2, 0.1], ["clase", 0.4, 0.1], ["pasada", 0.4, 0.1],
        ["vimos", 0.4, 2.0]
    ], 1.0);
    assertEq(MV.takeStartWord(sorry, sorry[4].start - 0.4, 0, OPTS), null,
        "la disculpa del arranque no es contenido que reclamar");

    // El paso 4 usa la misma regla antes de preguntarle al LLM, y llega con las
    // palabras crudas del STT (con sus "spacing" entre medias).
    const rawTake = midTake.slice(0, 3)
        .concat([{ text: " ", start: midTake[2].end, end: midTake[3].start, type: "spacing" }])
        .concat(midTake.slice(3));
    assertEq(MV.takeStartAt(rawTake, insideIn, 0, OPTS).text, "¿Qué",
        "takeStartAt() encuentra el arranque con words[] crudas");
    assertEq(MV.takeStartAt(rawTake, takeStart - 0.4, 0, OPTS), null,
        "y se calla cuando el IN ya abre la toma");

    section("verifyBlocks() — el IN abre a mitad de la frase");
    // Caso real (clase del 10-ago, bloque 4): la toma arrancaba en "Por lo tanto,
    // una cadena de evidencia muestra…" y el IN entró dentro de "una", 1.3s después.
    // El silencio previo (6.4s) no llegaba al umbral de toma nueva, así que ninguna
    // regla lo veía; `mid-word` solo lo empujaba al principio de la palabra
    // siguiente, que sigue estando a mitad de la frase.
    const midPhrase = build([
        ["nivel", 0.3, 0.1], ["de", 0.15, 0.1], ["certeza.", 0.5, 6.4],
        ["Por", 0.3, 0.1], ["lo", 0.15, 0.1], ["tanto,", 0.35, 0.1],
        ["una", 0.2, 0.05], ["cadena", 0.4, 0.1], ["de", 0.15, 0.1],
        ["evidencia", 0.5, 0.1], ["muestra", 0.4, 0.1], ["el", 0.15, 0.1],
        ["camino.", 0.5, 2.0]
    ], 1.0);
    const phraseStart = midPhrase[3].start;                 // "Por"
    const insidePhrase = midPhrase[6].start + 0.1;          // dentro de "una"
    const phraseRes = MV.verifyBlocks(midPhrase,
        [{ inTime: insidePhrase, outTime: midPhrase[12].end + 0.4 }], OPTS);
    const phraseIn = find(phraseRes, 0, "IN");
    assertEq(phraseIn.code, "mid-phrase", "detecta que el IN entra con la frase empezada");
    assertEq(phraseIn.word, "Por", "señala con qué palabra empieza la frase");
    assertEq(phraseIn.targetTime, phraseStart, "el objetivo es el arranque de la frase");
    assertEq(MV.resolvesIssue(phraseIn, phraseStart - 0.4, OPTS), true,
        "abrir en la frase (con colchón) resuelve");
    assertEq(MV.resolvesIssue(phraseIn, insidePhrase, OPTS), false, "quedarse adentro NO resuelve");

    const atPhraseRes = MV.verifyBlocks(midPhrase,
        [{ inTime: phraseStart - 0.4, outTime: midPhrase[12].end + 0.4 }], OPTS);
    assertEq(find(atPhraseRes, 0, "IN").code, "", "el IN que abre la frase pasa");

    // La regla se apoya en la puntuación de Whisper y en las pausas: sin ninguna de
    // las dos cosas cerca, no opina en vez de arrastrar el corte a ciegas.
    assertEq(MV.phraseStartWord(midPhrase, insidePhrase, phraseStart + 1, OPTS), null,
        "no cruza el OUT del bloque anterior");
    const cued = build([
        ["todos.", 0.4, 2.0], ["listo", 0.3, 0.2], ["tres", 0.3, 0.2],
        ["esto", 0.3, 0.1], ["ya", 0.2, 0.1], ["empieza", 0.4, 2.0]
    ], 1.0);
    assertEq(MV.phraseStartWord(cued, cued[4].start, 0, OPTS), null,
        "con un conteo por medio se calla: de eso hablan lead-in y take-start");

    section("verifyBlocks() — el OUT corta la frase a medias (aviso)");
    const cutPhrase = build([
        ["esto", 0.3, 0.1], ["se", 0.15, 0.1], ["puede", 0.3, 0.1],
        ["comprobar", 0.5, 0.15], ["en", 0.2, 0.1], ["la", 0.15, 0.1],
        ["fuente.", 0.5, 2.0]
    ], 1.0);
    const cutOutRes = MV.verifyBlocks(cutPhrase,
        [{ inTime: 0.5, outTime: cutPhrase[3].end + 0.4 }], OPTS);
    const cutOut = find(cutOutRes, 0, "OUT");
    assertEq(cutOut.code, "mid-phrase", "detecta que la frase seguía");
    assertEq(cutOut.severity, "warn", "alargar el bloque solo se avisa, no frena");
    assertEq(cutOut.targetTime, cutPhrase[6].end, "el objetivo es el final de la frase");
    assertEq(MV.resolvesIssue(cutOut, cutPhrase[6].end + 0.4, OPTS), true,
        "cerrar tras el punto resuelve");

    section("verifyBlocks() — bloque que cierra con comando al editor");
    const withCue = build([
        ["hola", 0.4, 0.1], ["a", 0.15, 0.1], ["todos", 0.5, 0.1],
        ["listo", 0.3, 0.1], ["pausa", 0.4, 2.0]
    ], 1.0);
    const cueRes = MV.verifyBlocks(withCue, [{ inTime: 0.5, outTime: 3.3 }], OPTS);
    const cueOut = find(cueRes, 0, "OUT");
    assertEq(cueOut.code, "editor-cue", "detecta el 'pausa' final");
    assertEq(cueOut.word, "todos", "el contenido termina antes del racimo \"listo, pausa\"");
    assert(cueOut.targetTime < 3.3, "propone cerrar antes del comando");

    section("verifyBlocks() — pickup: el bloque siguiente repite el final del anterior");
    // Bloque 1 termina con "vamos a ver la clase"; el bloque 2 arranca repitiéndolo.
    const pick = build([
        ["bueno", 0.3, 0.1], ["vamos", 0.35, 0.1], ["a", 0.15, 0.1], ["ver", 0.3, 0.1],
        ["la", 0.15, 0.1], ["clase", 0.45, 1.5],
        ["vamos", 0.35, 0.1], ["a", 0.15, 0.1], ["ver", 0.3, 0.1], ["la", 0.15, 0.1],
        ["clase", 0.45, 0.1], ["de", 0.15, 0.1], ["hoy", 0.3, 1.5]
    ], 1.0);
    const b1End = pick[5].end, b2Start = pick[6].start;
    const pickRes = MV.verifyBlocks(pick, [
        { inTime: 0.5, outTime: b1End + 0.5 },
        { inTime: b2Start - 0.5, outTime: pick[12].end + 0.5 }
    ], OPTS);
    const pickOut = find(pickRes, 0, "OUT");
    assertEq(pickOut.code, "pickup", "detecta la repetición entre bloques");
    assert(pickOut.repeatedTokens >= 3, "cuenta las palabras repetidas");
    assert(pickOut.targetTime < b1End, "propone retroceder el OUT al inicio de lo repetido");

    section("verifyBlocks() — una frase repetida a mitad del bloque no es pickup");
    // El caso que rompió el pipeline el 10-ago: el bloque cerraba con "…un brief de
    // mercado selecciona la evidencia relevante y formula implicaciones concretas." y
    // el siguiente abría con "Un brief de mercado sólido sigue…". Cuatro palabras
    // iguales, pero la clase habla de eso: no es una toma cortada, y recortar ahí se
    // llevaba la frase de cierre que la nota del CD pedía.
    const midRepeat = build([
        ["un", 0.2, 0.05], ["brief", 0.3, 0.05], ["de", 0.15, 0.05], ["mercado", 0.4, 0.05],
        ["selecciona", 0.5, 0.05], ["la", 0.15, 0.05], ["evidencia", 0.5, 0.05],
        ["relevante", 0.5, 0.05], ["y", 0.1, 0.05], ["formula", 0.4, 0.05],
        ["implicaciones", 0.6, 0.05], ["concretas.", 0.6, 2.0],
        ["un", 0.2, 0.05], ["brief", 0.3, 0.05], ["de", 0.15, 0.05], ["mercado", 0.4, 0.05],
        ["sólido", 0.4, 0.05], ["sigue", 0.3, 0.05], ["esta", 0.25, 0.05], ["secuencia.", 0.6, 1.5]
    ], 1.0);
    const midRepeatRes = MV.verifyBlocks(midRepeat, [
        { inTime: 0.5, outTime: midRepeat[11].end + 0.4 },
        { inTime: midRepeat[12].start - 0.4, outTime: midRepeat[19].end + 0.4 }
    ], OPTS);
    assertEq(find(midRepeatRes, 0, "OUT").code, "",
        "la repetición no está al final del bloque: no hay pickup");
    // Recortar no, pero callarse tampoco: queda el aviso para que se vea en el reporte.
    const midHint = (midRepeatRes.warnings || []).filter(function(v) { return v.code === "repeat-hint"; });
    assertEq(midHint.length, 1, "avisa de que algo se dice a los dos lados del corte");
    assertEq(midHint[0].severity, "warn", "el aviso no frena el corte");
    assertEq(midHint[0].targetTime == null, true, "y no propone mover el marcador");

    section("verifyBlocks() — la re-toma que arranca con \"Entonces\" también se ve");
    // Clase 15: el bloque cerraba con "Ya que está esa cadena, va a ser un wave frame."
    // y el siguiente abría con "Entonces, ya que está esa cadena, lo que va a hacer es…".
    // El conector de la re-toma dejaba la repetición invisible.
    const retake = build([
        ["te", 0.2, 0.05], ["explica", 0.4, 0.05], ["cómo", 0.3, 0.05], ["va.", 0.3, 1.0],
        ["ya", 0.2, 0.05], ["que", 0.2, 0.05], ["está", 0.3, 0.05], ["esa", 0.2, 0.05],
        ["cadena,", 0.4, 0.05], ["va", 0.2, 0.05], ["a", 0.1, 0.05], ["ser", 0.3, 0.05],
        ["un", 0.15, 0.05], ["frame.", 0.4, 8.0],
        ["entonces,", 0.5, 0.05], ["ya", 0.2, 0.05], ["que", 0.2, 0.05], ["está", 0.3, 0.05],
        ["esa", 0.2, 0.05], ["cadena,", 0.4, 0.05], ["lo", 0.15, 0.05], ["que", 0.2, 0.05],
        ["hará", 0.4, 1.5]
    ], 1.0);
    const retakeRes = MV.verifyBlocks(retake, [
        { inTime: 0.5, outTime: retake[13].end + 0.4 },
        { inTime: retake[14].start - 0.4, outTime: retake[22].end + 0.4 }
    ], OPTS);
    const retakeHint = (retakeRes.warnings || []).filter(function(v) { return v.code === "repeat-hint"; });
    assertEq(retakeHint.length, 1, "ve la repetición aunque la re-toma empiece por \"entonces\"");
    assert(retakeHint[0].repeatedTokens >= 4, "cuenta las palabras repetidas");
    assert(Math.abs(retakeHint[0].repeatedFrom - retake[4].start) < 0.01,
        "y dice desde dónde sobra (el \"ya\" de la primera vez)");

    section("pickupOverlap() — el conector de la re-toma no esconde un pickup de verdad");
    // Lo mismo, pero con la toma cortada justo después de lo repetido: ahí sí se recorta.
    const cutRetake = build([
        ["ya", 0.2, 0.05], ["que", 0.2, 0.05], ["está", 0.3, 0.05], ["esa", 0.2, 0.05],
        ["cadena,", 0.4, 0.05], ["pausa", 0.3, 8.0],
        ["entonces,", 0.5, 0.05], ["ya", 0.2, 0.05], ["que", 0.2, 0.05], ["está", 0.3, 0.05],
        ["esa", 0.2, 0.05], ["cadena,", 0.4, 0.05], ["hará", 0.4, 1.5]
    ], 1.0);
    const cutRes = MV.pickupOverlap(cutRetake.slice(0, 6), cutRetake.slice(6), OPTS);
    assert(cutRes != null, "encuentra el pickup");
    assertEq(cutRes.spent, true, "la cola detrás de lo repetido es solo el cue al editor");
    assertEq(cutRes.cutAt, null, "lo repetido es todo el bloque: no hay dónde recortar");

    section("pickupOverlap() — cuántas palabras se repiten (el disparo por evidencia fuerte)");
    // Sin recado del CD, la consulta de retoma dispara con 6 tokens contiguos
    // (STRONG_RETAKE_TOKENS en ui-marker-reviewer.js). Lo que aquí se fija es de
    // dónde sale ese número: `tokens` cuenta solo la coincidencia contigua, así
    // que una re-toma de verdad lo pasa y un parecido corto se queda debajo.
    const STRONG = 6;
    const longRetake = build([
        ["el", 0.2, 0.05], ["brief", 0.4, 0.05], ["de", 0.15, 0.05], ["mercado", 0.5, 0.05],
        ["ordena", 0.4, 0.05], ["la", 0.15, 0.05], ["evidencia", 0.5, 0.05], ["pausa", 0.3, 8.0],
        ["el", 0.2, 0.05], ["brief", 0.4, 0.05], ["de", 0.15, 0.05], ["mercado", 0.5, 0.05],
        ["ordena", 0.4, 0.05], ["la", 0.15, 0.05], ["evidencia", 0.5, 0.05], ["y", 0.15, 0.05],
        ["cierra.", 0.5, 1.5]
    ], 1.0);
    const longRes = MV.pickupOverlap(longRetake.slice(0, 8), longRetake.slice(8), OPTS);
    assert(longRes != null, "ve la re-toma larga");
    assert(longRes.tokens >= STRONG,
        "siete palabras seguidas pasan el listón de " + STRONG + ": " + longRes.tokens);

    const shortEcho = build([
        ["y", 0.15, 0.05], ["eso", 0.3, 0.05], ["cierra", 0.4, 0.05], ["el", 0.15, 0.05],
        ["brief", 0.4, 0.05], ["de", 0.15, 0.05], ["mercado.", 0.5, 8.0],
        ["el", 0.2, 0.05], ["brief", 0.4, 0.05], ["de", 0.15, 0.05], ["mercado", 0.5, 0.05],
        ["sólido", 0.4, 0.05], ["sigue", 0.4, 0.05], ["tres", 0.3, 0.05], ["pasos.", 0.5, 1.5]
    ], 1.0);
    const echoRes = MV.pickupOverlap(shortEcho.slice(0, 7), shortEcho.slice(7), OPTS);
    assert(echoRes != null, "también ve el parecido corto (sale como aviso)");
    assert(echoRes.tokens < STRONG,
        "pero cuatro palabras no bastan para tirar clase sin que nadie lo pida: " + echoRes.tokens);

    section("verifyBlocks() — sin repetición no canta pickup");
    const noPick = build([
        ["hola", 0.4, 0.1], ["a", 0.15, 0.1], ["todos", 0.5, 1.5],
        ["ahora", 0.4, 0.1], ["otra", 0.3, 0.1], ["cosa", 0.4, 0.1], ["distinta", 0.5, 1.5]
    ], 1.0);
    const noPickRes = MV.verifyBlocks(noPick, [
        { inTime: 0.5, outTime: noPick[2].end + 0.5 },
        { inTime: noPick[3].start - 0.5, outTime: noPick[6].end + 0.5 }
    ], OPTS);
    assertEq(noPickRes.ok, true, "dos bloques distintos pasan: " + codesOf(noPickRes));

    section("verifyBlocks() — bloques inválidos");
    const inv = MV.verifyBlocks(clean, [{ inTime: 3.0, outTime: 1.0 }], OPTS);
    assertEq(inv.failures[0].code, "inverted", "OUT antes del IN");
    const shortRes = MV.verifyBlocks(clean, [{ inTime: 1.0, outTime: 1.4 }], OPTS);
    assertEq(shortRes.failures[0].code, "too-short", "bloque demasiado corto");
    const emptyRes = MV.verifyBlocks(clean, [{ inTime: 40, outTime: 60 }], OPTS);
    assertEq(emptyRes.failures[0].code, "empty", "bloque sin palabras");

    section("verifyBlocks() — solape entre bloques consecutivos");
    const over = MV.verifyBlocks(noPick, [
        { inTime: 0.5, outTime: noPick[4].start },     // el OUT se pasa al bloque 2
        { inTime: noPick[3].start - 0.4, outTime: noPick[6].end + 0.5 }
    ], OPTS);
    assert(codesOf(over).indexOf("overlap") !== -1, "detecta que el OUT pisa el IN siguiente");

    section("verifyBlocks() — sin transcript no inventa fallas");
    const noWords = MV.verifyBlocks([], [{ inTime: 1, outTime: 5 }], OPTS);
    assertEq(noWords.ok, true, "sin palabras no hay nada que revisar");

    section("minAirFrames() — el piso duro no depende del colchón");
    // El colchón es estética y se negocia con el silencio que haya; el piso duro es
    // "no te comas el ataque de la palabra" y es el mismo siempre.
    assertEq(MV.minAirFrames({ padFrames: 10, fps: 25 }), 2, "el piso son 2 frames");
    assertEq(MV.minAirFrames({ padFrames: 30, fps: 25 }), 2, "y no cambia si se pide más colchón");
    assertEq(MV.minAirFrames({ hardAirFrames: 4 }), 4, "es configurable");

    section("resolvesIssue() — un arreglo tiene que mover el borde en la dirección de la falla");
    // Conteo al inicio: el contenido empieza en t=10, el IN estaba en 5.
    const lead = { code: "lead-in", kind: "IN", time: 5, targetTime: 10 };
    assertEq(MV.resolvesIssue(lead, 9.6, OPTS), true, "el IN en el contenido (con colchón) resuelve");
    assertEq(MV.resolvesIssue(lead, 5.0, OPTS), false, "dejarlo donde estaba NO resuelve");
    assertEq(MV.resolvesIssue(lead, 7.0, OPTS), false, "acercarse sin llegar al contenido NO resuelve");

    // "pausa" al final: el contenido termina en t=20, el OUT estaba en 22.
    const cue = { code: "editor-cue", kind: "OUT", time: 22, targetTime: 20 };
    assertEq(MV.resolvesIssue(cue, 20.4, OPTS), true, "el OUT tras el contenido (con colchón) resuelve");
    assertEq(MV.resolvesIssue(cue, 22, OPTS), false, "dejar el comando dentro NO resuelve");

    const pickV = { code: "pickup", kind: "OUT", time: 30, targetTime: 27 };
    assertEq(MV.resolvesIssue(pickV, 27.2, OPTS), true, "retroceder el OUT resuelve el pickup");
    assertEq(MV.resolvesIssue(pickV, 29, OPTS), false, "quedarse dentro de lo repetido NO resuelve");

    // Falta de aire: la palabra empieza en 15, hacen falta 5 frames (0.2s).
    const air = { code: "no-air", kind: "IN", time: 14.98, targetTime: 15 };
    assertEq(MV.resolvesIssue(air, 14.6, OPTS), true, "abrir 10 frames antes resuelve");
    assertEq(MV.resolvesIssue(air, 14.95, OPTS), false, "2 frames de aire siguen sin resolver");

    const midw = { code: "mid-word", kind: "OUT", time: 40.2, targetTime: 40.5 };
    assertEq(MV.resolvesIssue(midw, 40.9, OPTS), true, "salir de la palabra resuelve");
    assertEq(MV.resolvesIssue(midw, 40.52, OPTS), false, "pegado al borde de la palabra no basta");

    assertEq(MV.resolvesIssue({ code: "empty", kind: "IN", time: 1 }, 2, OPTS), true,
        "sin targetTime no hay dirección que exigir");

    section("checkCoverage() — un transcript que no es de esta secuencia se rechaza");
    // Caso real: transcript de la secuencia ya cortada (6m17s) usado contra la
    // secuencia entera (66 min) con marcadores repartidos por toda la hora.
    const cutWords = build([["hola", 0.4, 0.2], ["a", 0.15, 0.2], ["todos", 0.5, 0.2]], 0);
    const cutSpan = cutWords[2].end;
    const realCase = MV.checkCoverage(cutWords, {
        sequenceDuration: 3965,
        savedDuration: 0,                       // los transcripts viejos no lo traen
        markerTimes: [44, 300, 1200, 3800]
    });
    assertEq(realCase.ok, false, "rechaza el transcript de la secuencia cortada");
    assertEq(realCase.code, "markers-outside", "la señal es que hay marcadores fuera del transcript");
    assert(realCase.message.indexOf("66m") !== -1 || realCase.message.indexOf("3800") !== -1 ||
        realCase.message.indexOf("63m") !== -1, "el mensaje ubica el marcador más lejano");

    assertEq(MV.checkCoverage(cutWords, {
        sequenceDuration: 3965, markerTimes: [1, 2]
    }).code, "span-short", "sin marcadores delatores, el span corto también lo delata");

    assertEq(MV.checkCoverage(clean, {
        sequenceDuration: 100, savedDuration: 3965, markerTimes: []
    }).code, "duration-changed", "si la secuencia cambió de largo, el transcript no vale");

    assertEq(MV.checkCoverage([], { sequenceDuration: 10 }).code, "no-words",
        "un transcript sin palabras con tiempos no sirve");

    section("checkCoverage() — un transcript válido pasa");
    // Clase de 6m17s con sus marcadores dentro: es su propia secuencia.
    assertEq(MV.checkCoverage(cutWords, {
        sequenceDuration: cutSpan + 1,
        savedDuration: cutSpan + 1,
        markerTimes: [0.5, cutSpan]
    }).ok, true, "el transcript de su propia secuencia pasa");

    // Clase de ~400s: el OUT final cae unos segundos después de la última palabra,
    // que es lo normal cuando la clase cierra en silencio.
    const classWords = [];
    for (let i = 0; i < 200; i++) {
        classWords.push({ text: "palabra", start: i * 2, end: i * 2 + 0.5, type: "word" });
    }
    const classSpan = classWords[classWords.length - 1].end;   // 398.5
    assertEq(MV.checkCoverage(classWords, {
        sequenceDuration: classSpan + 8, markerTimes: [1, classSpan + 6]
    }).ok, true, "un OUT unos segundos después de la última palabra es normal");

    assertEq(MV.checkCoverage(cutWords, { markerTimes: [0.5] }).ok, true,
        "sin duración conocida no se inventa una falla");

    section("integración con marker-precision: el arreglo cae en el punto del detector");
    // Invariante del lazo de reajuste: el arreglo es MECÁNICO — el borde va a la
    // frontera que el detector señala, con su colchón — y es CONSERVADOR: nunca
    // queda más adentro del bloque que esa frontera, así que un defecto de forma
    // (palabra partida, poco aire) no puede tirar palabras que nadie pidió tirar.
    // Sin este contrato, reabrir la decisión movía un IN 5.4s adentro de la toma.
    const cases = [
        { name: "conteo al inicio", words: withCount, blocks: [{ inTime: 0.5, outTime: 5.5 }] },
        { name: "comando al final", words: withCue, blocks: [{ inTime: 0.5, outTime: 3.3 }] },
        { name: "corte a mitad de palabra", words: clean, blocks: [{ inTime: 1.2, outTime: 3.0 }] },
        {
            name: "abre a mitad de la toma", words: midTake,
            blocks: [{ inTime: insideIn, outTime: midTake[11].end + 0.4 }]
        },
        { name: "sin aire", words: clean, blocks: [{ inTime: 0.96, outTime: 3.0 }] },
        {
            name: "pickup entre bloques", words: pick, blocks: [
                { inTime: 0.5, outTime: b1End + 0.5 },
                { inTime: b2Start - 0.5, outTime: pick[12].end + 0.5 }
            ]
        }
    ];
    for (const c of cases) {
        const res = MV.verifyBlocks(c.words, c.blocks, OPTS);
        const fail = res.failures.filter(f => f.targetTime != null)[0];
        assert(!!fail, c.name + ": produce una falla con punto objetivo");
        if (!fail) continue;
        const point = MP.boundaryAt(c.words, fail.targetTime, fail.kind, OPTS);
        assert(!!point, c.name + ": el punto del detector es aplicable (" +
            fail.code + " " + fail.kind + " target=" + fail.targetTime + ")");
        if (!point) continue;
        assert(Math.abs(point.frontier - fail.targetTime) < 0.002,
            c.name + ": el arreglo cae en la frontera que señala el detector");
        assertEq(MV.resolvesIssue(fail, point.time, OPTS), true,
            c.name + ": el punto del detector resuelve la falla");
        assert(fail.kind === "IN" ? point.time <= fail.targetTime + 0.001
                                  : point.time >= fail.targetTime - 0.001,
            c.name + ": el arreglo no se mete más adentro del bloque que la frontera");
    }

    section("summarize() — resumen con el conteo por tipo de falla");
    const sum = MV.summarize(midRes);
    assert(sum.indexOf(MV.CODE_LABELS["mid-word"]) !== -1,
        "nombra el tipo de falla en claro, no el código: " + sum);
    assert(sum.indexOf("de 2") !== -1, "dice cuántos bordes se revisaron");

    section("isStructural() — qué impide cortar de verdad");
    // Lo que separa "no se puede cortar" de "este borde es discutible": con la
    // estructura del bloque mal, las zonas de corte salen mal y no hay reajuste que
    // lo arregle. Un borde discutible se apunta y la clase se corta igual.
    assertEq(MV.isStructural({ code: "inverted" }), true, "un OUT antes del IN frena");
    assertEq(MV.isStructural({ code: "empty" }), true, "un bloque sin palabras frena");
    assertEq(MV.isStructural({ code: "overlap" }), true, "dos bloques que se pisan frenan");
    assertEq(MV.isStructural({ code: "mid-phrase" }), false, "un corte a mitad de frase no frena");
    assertEq(MV.isStructural({ code: "pickup" }), false, "una repetición no frena");
    assertEq(MV.isStructural(null), false, "sin verdicto no hay nada que frenar");

    section("lo que queda sin resolver trae con qué ofrecérselo al editor");
    // De esto vive la lista de ajustes pendientes de The Cutter: un verdicto con
    // punto al que ir se puede ofrecer con un botón, y para pintarlo hace falta
    // saber de qué bloque y qué borde habla. Si un verdicto perdiera cualquiera de
    // los tres datos, la lista se quedaría muda justo donde hay algo que hacer.
    const offerable = midRes.failures.filter(f => f.targetTime != null || f.applyTime != null);
    assert(offerable.length > 0, "un corte a mitad de palabra se puede ofrecer con su punto");
    assertEq(offerable[0].kind, "IN", "y dice de qué borde habla");
    assertEq(offerable[0].pairIdx, 0, "y de qué bloque");
    assert(String(offerable[0].message || "").length > 0, "y con qué explicárselo");

    return { passed, failed };
}

module.exports = { run };
