/**
 * Tests del módulo puro marker-precision.js: puntos de corte candidatos,
 * transcript numerado, prompt de elección y validación de la respuesta del LLM.
 *
 * Ejecutar con: node tests/run-node-tests.js
 */
"use strict";

const MP = require("../client/js/marker-precision.js");

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (cond) { passed++; } else { failed++; console.error("  ✗ FALLO: " + msg); }
}
function assertEq(actual, expected, msg) {
    assert(actual === expected, msg + " (esperado: " + expected + ", obtenido: " + actual + ")");
}
function assertClose(actual, expected, msg) {
    assert(Math.abs(actual - expected) < 0.06, msg + " (esperado: ~" + expected + ", obtenido: " + actual + ")");
}
function section(name) { console.log("\n── " + name); }

/** Palabras consecutivas de 0.4s con `gap` de silencio entre cada una. */
function makeWords(texts, startAt, gap) {
    var t = startAt || 0;
    return texts.map(function(txt) {
        var w = { text: txt, start: Math.round(t * 100) / 100, end: Math.round((t + 0.4) * 100) / 100, type: "word" };
        t = t + 0.4 + (gap == null ? 0.1 : gap);
        return w;
    });
}

function run() {
    passed = 0; failed = 0;

    // Conteo + frase real, con una pausa marcada antes de la frase real.
    // "tres dos uno" 0..1.9  ·  pausa de 1s  ·  "hola a todos" desde 2.9
    var leadIn = makeWords(["tres", "dos", "uno"], 0, 0.35);
    var real = makeWords(["hola", "a", "todos", "bienvenidos", "a", "la", "clase"], 3.5, 0.1);
    var words = leadIn.concat(real);

    section("buildCandidates() — los puntos caen en silencio, nunca dentro de una palabra");
    var res = MP.buildCandidates(words, 0.0, "IN");
    assert(res.candidates.length > 0, "hay candidatos");
    var insideWord = false;
    for (var i = 0; i < res.candidates.length; i++) {
        var t = res.candidates[i].time;
        for (var w = 0; w < words.length; w++) {
            if (t > words[w].start + 0.001 && t < words[w].end - 0.001) insideWord = true;
        }
    }
    assertEq(insideWord, false, "ningún punto cae a mitad de palabra");

    section("buildCandidates() — numeración 1-based y orden temporal");
    assertEq(res.candidates[0].index, 1, "el primer candidato es [1]");
    var ordered = true;
    for (var o = 1; o < res.candidates.length; o++) {
        if (res.candidates[o].time < res.candidates[o - 1].time) ordered = false;
        if (res.candidates[o].index !== o + 1) ordered = false;
    }
    assertEq(ordered, true, "candidatos ordenados por tiempo y numerados en secuencia");

    section("buildCandidates() — marca el punto donde está hoy el marcador");
    var atReal = MP.buildCandidates(words, 3.4, "IN");
    assert(atReal.current > 0, "reconoce el punto actual");
    assertEq(atReal.candidates[atReal.current - 1].isCurrent, true, "el candidato actual va marcado");

    section("buildCandidates() — un marcador lejos de todo no tiene punto actual");
    var far = MP.buildCandidates(words, 3.4, "IN", { currentTolerance: 0.001 });
    assertEq(far.current, 0, "sin punto actual si nada queda dentro de la tolerancia");

    section("buildCandidates() — respeta la ventana");
    var narrow = MP.buildCandidates(words, 0.0, "IN", { windowSec: 1.0 });
    var allInWindow = true;
    for (var n = 0; n < narrow.candidates.length; n++) {
        if (Math.abs(narrow.candidates[n].time) > 1.0) allInWindow = false;
    }
    assertEq(allInWindow, true, "ningún candidato fuera de la ventana");
    assert(narrow.candidates.length < res.candidates.length, "una ventana más chica da menos candidatos");

    section("buildCandidates() — limita la cantidad e incluye la pausa larga");
    var many = makeWords("uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce".split(" "), 0, 0.05);
    // pausa de 2s antes de la última frase
    var tail = makeWords(["y", "ahora", "si"], 10, 0.05);
    var lim = MP.buildCandidates(many.concat(tail), 5, "IN", { maxCandidates: 5 });
    assertEq(lim.candidates.length, 5, "no ofrece más de maxCandidates");
    var hasBigGap = false;
    for (var g = 0; g < lim.candidates.length; g++) {
        if (lim.candidates[g].gapSec > 1) hasBigGap = true;
    }
    assertEq(hasBigGap, true, "incluye la pausa larga aunque esté lejos de la marca");

    section("buildCandidates() — con la frase grabada dos veces, solo se elige entre tomas");
    // Clase 14, bloque 1: la frase de la nota se dijo dos veces y el LLM, con la
    // ventana entera delante, eligió un punto POSTERIOR a las dos; el bloque abrió
    // con la frase siguiente. Cuando lo único que hay que decidir es qué toma, las
    // apariciones de la frase son las únicas opciones.
    var twice = makeWords("en la clase pasada vimos data".split(" "), 20, 0.05)
        .concat(makeWords("en la clase pasada vimos data ahora vamos a otra cosa".split(" "), 30, 0.05));
    var takes = { forceTimes: [20, 30], onlyForced: true };
    var only = MP.buildCandidates(twice, 33, "IN", takes);
    assertEq(only.candidates.length, 2, "tantas opciones como tomas de la frase");
    assertClose(only.candidates[0].time, 19.6, "la primera toma entra, con su colchón");
    assertClose(only.candidates[1].time, 29.6, "la segunda toma entra, con su colchón");
    var free = MP.buildCandidates(twice, 33, "IN", { forceTimes: [20, 30] });
    assert(free.candidates.length > 2, "sin la restricción, la ventana entera sigue disponible");

    section("buildCandidates() — ninguna opción cae en el bloque de al lado");
    // Clase 15, bloque 4: la toma repetida está DENTRO del bloque siguiente, así que
    // no es una opción ni siendo la que pide la nota del CD.
    var capped = MP.buildCandidates(twice, 33, "OUT",
        { forceTimes: [22.65, 32.65], onlyForced: true, maxTime: 29 });
    assertEq(capped.candidates.length, 1, "queda solo la toma de este bloque");
    assert(capped.candidates[0].time <= 29, "y cae antes del borde vecino");
    var all = MP.buildCandidates(twice, 33, "OUT", { minTime: 25, maxTime: 31 });
    for (var ci = 0; ci < all.candidates.length; ci++) {
        assert(all.candidates[ci].time >= 25 && all.candidates[ci].time <= 31,
            "ningún candidato de la ventana se sale del bloque");
    }

    section("buildCandidates() — IN abre antes de la palabra, OUT cierra después");
    var inRes = MP.buildCandidates(real, 3.4, "IN", { windowSec: 0.5 });
    var firstWord = real[0];
    assert(inRes.candidates[0].time <= firstWord.start, "el punto IN queda en o antes del inicio de la palabra");
    var outRes = MP.buildCandidates(real, real[0].end, "OUT", { windowSec: 0.5 });
    assert(outRes.candidates[0].time >= firstWord.end, "el punto OUT queda en o después del fin de la palabra");

    section("buildCandidates() — sin palabras no propone nada");
    assertEq(MP.buildCandidates([], 10, "IN").candidates.length, 0, "words vacío → sin candidatos");
    assertEq(MP.buildCandidates(words, 9999, "IN").candidates.length, 0, "marcador fuera del transcript → sin candidatos");

    section("boundaryTime() — el corte respeta el silencio entre dos palabras");
    var prev = { start: 1.0, end: 2.0 };
    var nextW = { start: 4.0, end: 5.0 };
    var tIn = MP.boundaryTime(prev, nextW, "IN");
    assert(tIn > prev.end && tIn <= nextW.start, "IN dentro del gap y pegado a la palabra siguiente");
    var tOut = MP.boundaryTime(prev, nextW, "OUT");
    assert(tOut >= prev.end && tOut < nextW.start, "OUT dentro del gap y pegado a la palabra anterior");

    section("boundaryTime() — colchón de 10 frames de aire a cada lado");
    var padOpts = { padFrames: 10, fps: 25 };   // 10 frames a 25 fps = 0.4s
    var wide = { start: 10.0, end: 11.0 };
    var wideNext = { start: 14.0, end: 15.0 };
    assertClose(MP.boundaryTime(wide, wideNext, "IN", padOpts), 13.6,
        "el IN abre 10 frames antes de la palabra");
    assertClose(MP.boundaryTime(wide, wideNext, "OUT", padOpts), 11.4,
        "el OUT cierra 10 frames después de la palabra");
    assertClose(MP.padSec(padOpts), 0.4, "padSec traduce frames a segundos con el fps dado");
    assertClose(MP.padSec({ padFrames: 10, fps: 50 }), 0.2, "a más fps, el mismo colchón dura menos");

    section("boundaryTime() — el colchón nunca invade la palabra vecina");
    // Silencio de 0.2s: más corto que los 0.4s del colchón, así que se toma todo.
    var tight = { start: 20.0, end: 21.0 };
    var tightNext = { start: 21.2, end: 22.0 };
    var tightIn = MP.boundaryTime(tight, tightNext, "IN", padOpts);
    assert(tightIn >= tight.end, "el IN no se mete en la palabra anterior aunque falte colchón");
    assert(tightIn <= tightNext.start, "el IN no se come el arranque de la palabra siguiente");
    var tightOut = MP.boundaryTime(tight, tightNext, "OUT", padOpts);
    assert(tightOut >= tight.end, "el OUT no recorta el final de su palabra");
    assert(tightOut <= tightNext.start, "el OUT no alcanza la palabra siguiente");

    section("boundaryTime() — palabras pegadas: el corte cae justo en la frontera");
    var glued = { start: 30.0, end: 31.0 };
    var gluedNext = { start: 31.0, end: 32.0 };
    assertEq(MP.boundaryTime(glued, gluedNext, "IN", padOpts), 31.0,
        "sin silencio, el IN queda en la frontera exacta");
    assertEq(MP.boundaryTime(glued, gluedNext, "OUT", padOpts), 31.0,
        "sin silencio, el OUT queda en la frontera exacta");

    section("boundaryTime() — los puntos caen en frame entero");
    var onFrame = true;
    var probes = [
        MP.boundaryTime(wide, wideNext, "IN", padOpts),
        MP.boundaryTime(wide, wideNext, "OUT", padOpts),
        MP.boundaryTime({ start: 1.11, end: 2.37 }, { start: 5.83, end: 6.4 }, "IN", padOpts),
        MP.boundaryTime({ start: 1.11, end: 2.37 }, { start: 5.83, end: 6.4 }, "OUT", padOpts)
    ];
    for (var f = 0; f < probes.length; f++) {
        var frames = probes[f] * 25;
        if (Math.abs(frames - Math.round(frames)) > 0.02) onFrame = false;
    }
    assertEq(onFrame, true, "todo punto de corte cae en un frame entero de la secuencia");

    section("buildCandidates() — con colchón sigue sin partir palabras");
    var padded = MP.buildCandidates(words, 3.4, "IN", padOpts);
    var splits = false;
    for (var p2 = 0; p2 < padded.candidates.length; p2++) {
        var tp = padded.candidates[p2].time;
        for (var w2 = 0; w2 < words.length; w2++) {
            if (tp > words[w2].start + 0.001 && tp < words[w2].end - 0.001) splits = true;
        }
    }
    assertEq(splits, false, "ningún candidato con colchón cae dentro de una palabra");
    var inFront = MP.buildCandidates(real, real[0].start, "IN", padOpts);
    assert(inFront.candidates[0].time < real[0].start, "el IN con colchón abre antes de la primera palabra");

    section("buildMarkedText() — intercala los puntos numerados en el transcript");
    var marked = MP.buildMarkedText(words, atReal.candidates);
    assert(marked.indexOf("[1]") !== -1, "incluye [1]");
    assert(marked.indexOf("hola") !== -1, "incluye el texto del transcript");
    var pos1 = marked.indexOf("[1]");
    var pos2 = marked.indexOf("[2]");
    assert(pos2 === -1 || pos2 > pos1, "los puntos aparecen en orden");
    assertEq(MP.buildMarkedText(words, []), "", "sin candidatos no hay texto marcado");

    section("buildChoicePrompt() — contexto, lista de puntos y formato de respuesta");
    var unit = {
        kind: "IN", blockNum: 2, blockCount: 7, markerTime: 3.4,
        candidates: atReal.candidates, current: atReal.current, hint: ""
    };
    var built = MP.buildChoicePrompt(unit, words);
    assert(built.systemMsg.length > 0, "trae systemMsg");
    assert(built.prompt.indexOf("BLOQUE 2 de 7") !== -1, "identifica el bloque");
    assert(built.prompt.indexOf("marcador IN") !== -1, "identifica el borde");
    assert(built.prompt.indexOf('"choice"') !== -1, "pide el JSON con choice");
    assert(built.prompt.indexOf("[" + atReal.current + "]") !== -1, "menciona el punto actual");
    assert(built.prompt.indexOf("se ELIMINA") !== -1, "explica qué se elimina");

    var outUnit = { kind: "OUT", blockNum: 1, blockCount: 3, markerTime: real[0].end, candidates: outRes.candidates, current: outRes.current };
    var outBuilt = MP.buildChoicePrompt(outUnit, real);
    assert(outBuilt.prompt.indexOf("FINAL del bloque") !== -1, "el prompt de OUT habla del final del bloque");

    section("buildChoicePrompt() — incluye la pista del detector automático");
    unit.hint = "la frase se repite en el bloque siguiente";
    assert(MP.buildChoicePrompt(unit, words).prompt.indexOf("se repite en el bloque siguiente") !== -1, "incluye la pista");
    unit.hint = "";

    section("resolveChoice() — elección válida mueve el marcador");
    var target = unit.current === 1 ? 2 : 1;
    var r1 = MP.resolveChoice({ choice: target, reason: "arranca la frase real" }, unit);
    assertEq(r1.ok, true, "respuesta válida");
    assertEq(r1.move, true, "propone mover");
    assertClose(r1.time, unit.candidates[target - 1].time, "usa el tiempo exacto del candidato");
    assertEq(r1.reason, "arranca la frase real", "conserva el motivo");

    section("resolveChoice() — confirmar el punto actual igual aplica el colchón");
    var r2 = MP.resolveChoice({ choice: unit.current, reason: "ya está bien" }, unit);
    assertEq(r2.ok, true, "respuesta válida");
    assertEq(r2.confirmed, true, "queda marcado como punto confirmado");
    assertClose(r2.time, unit.candidates[unit.current - 1].time,
        "devuelve el tiempo con colchón del punto confirmado, no el del marcador");

    section("resolveChoice() — rechaza lo que no puede usar");
    assertEq(MP.resolveChoice({ choice: 99 }, unit).ok, false, "número fuera de la lista");
    assertEq(MP.resolveChoice({ choice: 0 }, unit).ok, false, "el 0 no es un punto válido");
    assertEq(MP.resolveChoice({ reason: "no sé" }, unit).ok, false, "respuesta sin número");
    assertEq(MP.resolveChoice({ error: "invalid x-api-key" }, unit).ok, false, "error del proveedor");
    assertEq(MP.resolveChoice(null, unit).ok, false, "respuesta nula");

    section("resolveChoice() — tolera el número como texto");
    var r3 = MP.resolveChoice({ choice: "  " + target + " " }, unit);
    assertEq(r3.ok, true, "acepta '3' como string");
    assertEq(r3.candidateIndex, target, "extrae el número");
    assertEq(MP.parseChoice({ choice: "punto 2" }), 2, "extrae el número de un texto");
    assertEq(MP.parseChoice({ index: 4 }), 4, "acepta la clave index");

    // ─── Los arranques de frase como puntos de corte ──────────

    section("sentenceStarts() — cada opción es un arranque de frase y cierra en la anterior");
    // Cola de la clase 15, bloque 4: tres frases seguidas, la última repite palabras del
    // bloque siguiente pero el intento abandonado empieza en la primera.
    var tail = makeWords(["están", "en", "el", "CSV."], 40, 0.1)
        .concat(makeWords(["Entonces,", "el", "paso", "uno", "es", "esta", "cadena."], 43, 0.1))
        .concat(makeWords(["Entonces,", "te", "explica", "cómo", "lo", "construye."], 47.5, 0.1))
        .concat(makeWords(["Ya", "que", "está", "esa", "cadena,", "va", "un", "frame."], 51.5, 0.1));
    var starts = MP.sentenceStarts(tail, 30, 56, "tail", { fps: 25, padFrames: 10 });
    assertEq(starts.length, 3, "una opción por frase (la primera del bloque no cuenta)");
    assertEq(starts[0].index, 1, "numeradas desde 1");
    assertClose(starts[0].startTime, 43, "la primera opción empieza en \"Entonces, el paso uno…\"");
    assertClose(starts[0].time, tail[3].end, "y cerraría al final de \"CSV.\", la frase anterior");
    assert(starts[0].snippet.indexOf("Entonces, el paso uno") === 0, "el snippet es la frase entera");
    assert(starts[0].snippet.indexOf("cadena.") > 0, "el snippet acaba en el punto");

    section("sentenceStarts() — el bloque conserva un mínimo y se miran las frases del corte");
    assertEq(MP.sentenceStarts(tail, 43, 56, "tail", { sentenceKeepSec: 5 }).length, 1,
        "guardando 5s de bloque solo cabe la última frase");
    assertEq(MP.sentenceStarts(tail, 30, 56, "tail", { sentenceReachSec: 6 }).length, 1,
        "con 6s de cola solo entra la última frase");
    assertEq(MP.sentenceStarts(tail, 30, 56, "tail", { sentenceMax: 2 })[0].startTime,
        starts[1].startTime, "con tope de 2 se quedan las DOS ÚLTIMAS, no las primeras");

    section("sentenceStarts() — en la cabeza del bloque el corte es la palabra que abre");
    var head = MP.sentenceStarts(tail, 40, 60, "head", { sentenceKeepSec: 1 });
    assertClose(head[0].time, head[0].startTime, "el IN abre en la palabra, no en la anterior");
    assertEq(MP.sentenceStarts(tail, 40, 60, "head", { sentenceMax: 2 })[0].startTime,
        head[0].startTime, "con tope se quedan las DOS PRIMERAS");

    section("buildChoicePrompt() — el contexto completo del borde");
    var ctxOpts = { fps: 25, padFrames: 0, windowSec: 6 };
    var ctxCands = MP.buildCandidates(tail, 53, "OUT", ctxOpts);
    var ctxUnit = {
        kind: "OUT", blockNum: 4, blockCount: 10, markerTime: 53,
        candidates: ctxCands.candidates, current: ctxCands.current,
        notes: [
            { label: "en el IN de este bloque", text: "out antes de \"ya que está esa cadena,\" - Ahora lo que vamos" },
            { label: "en el IN del bloque 5, el que sigue", text: "revisar out - Entonces, ya que está esa cadena, lo que" }
        ],
        neighbour: { label: "ASÍ ARRANCA EL BLOQUE 5", text: "Entonces, ya que está esa cadena, lo que va a hacer es dividir en pasos." }
    };
    var ctx = MP.buildChoicePrompt(ctxUnit, tail, ctxOpts).prompt;
    assert(ctx.indexOf("out antes de \"ya que está esa cadena,\"") > 0,
        "el comentario del CD va literal, con la instrucción incluida");
    assert(ctx.indexOf("revisar out") > 0, "también el comentario del bloque de al lado");
    assert(ctx.indexOf("ASÍ ARRANCA EL BLOQUE 5") > 0, "y lo que dice el bloque siguiente");
    assert(ctx.indexOf("dos veces lo mismo") > 0, "pide que la clase no repita a los dos lados");

    section("buildChoicePrompt() — sin bloque vecino no inventa contexto");
    var lone = MP.buildChoicePrompt({
        kind: "OUT", blockNum: 1, blockCount: 1, markerTime: 53,
        candidates: ctxCands.candidates, current: ctxCands.current
    }, tail, ctxOpts).prompt;
    assertEq(lone.indexOf("dos veces lo mismo"), -1, "sin vecino no habla de repeticiones");
    assertEq(lone.indexOf("LO QUE EL CD ESCRIBIÓ"), -1, "sin comentarios no pone la sección");

    section("buildRetakePrompt() — la revisión del borde ya colocado");
    var retakeUnit = {
        kind: "OUT", blockNum: 4, at: 55.5, candidates: starts,
        notes: ctxUnit.notes, neighbour: ctxUnit.neighbour,
        mine: { label: "ASÍ TERMINA ESTE BLOQUE CON EL CORTE DE AHORA", text: "…te va a explicar cómo lo está construyendo." }
    };
    var rp = MP.buildRetakePrompt(retakeUnit, {}).prompt;
    assert(rp.indexOf("[0]") === rp.indexOf("[0]") && rp.indexOf("[0]") > 0, "el \"está bien\" es la opción [0]");
    assert(rp.indexOf("respuesta normal") > 0, "y se dice que es la respuesta normal");
    assert(rp.indexOf("out antes de \"ya que está esa cadena,\"") > 0, "trae el comentario del CD literal");
    assert(rp.indexOf("ASÍ ARRANCA EL BLOQUE 5") > 0, "trae lo que dice el bloque siguiente");
    assert(rp.indexOf("CORTE DE AHORA") > 0, "y lo que este bloque deja dentro");
    assert(rp.indexOf("VARIAS FRASES ANTES") > 0,
        "avisa de que el intento empieza antes de la repetición literal");
    assert(rp.indexOf("[3]") > 0, "numera las frases del final del bloque");

    section("resolveRetake() — la respuesta se traduce a un punto de corte");
    var rt = MP.resolveRetake({ choice: 1, reason: "el bloque 5 rehace la enumeración" }, retakeUnit);
    assertEq(rt.ok, true, "acepta la elección");
    assertEq(rt.move, true, "y manda mover");
    assertClose(rt.time, starts[0].time, "el corte es el final de la frase anterior");
    var rt0 = MP.resolveRetake({ choice: 0, reason: "no repite" }, retakeUnit);
    assertEq(rt0.ok, true, "el 0 es una respuesta válida");
    assertEq(rt0.move, false, "y deja el borde donde lo puso el CD");
    assertEq(MP.resolveRetake({ choice: 99 }, retakeUnit).ok, false, "frase fuera de la lista");
    assertEq(MP.resolveRetake({ error: "sin modelo" }, retakeUnit).ok, false, "error del proveedor");
    assertEq(MP.resolveRetake(null, retakeUnit).ok, false, "respuesta nula");

    section("tailText() / headText() — el texto de los bloques de al lado");
    assert(MP.headText(tail, 43, 56, 4).indexOf("Entonces, el paso") === 0, "headText arranca en el corte");
    var tt = MP.tailText(tail, 40, tail[3].end, 3);
    assert(/el CSV\.$/.test(tt), "tailText acaba en el corte");
    assertEq(tt.split(" ").length, 3, "y devuelve solo las últimas palabras pedidas");

    return { passed, failed };
}

module.exports = { run };
