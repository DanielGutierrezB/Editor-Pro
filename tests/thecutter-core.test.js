/**
 * Tests del módulo puro thecutter-core.js: bloques IN/OUT, zonas a eliminar,
 * duraciones de marcadores con comentario, payload de vistas y transcript timed.
 *
 * Ejecutar con: node tests/run-node-tests.js
 */
"use strict";

const TC = require("../client/js/thecutter-core.js");

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (cond) { passed++; } else { failed++; console.error("  ✗ FALLO: " + msg); }
}
function assertEq(actual, expected, msg) {
    assert(actual === expected, msg + " (esperado: " + expected + ", obtenido: " + actual + ")");
}
function assertClose(actual, expected, msg) {
    assert(Math.abs(actual - expected) < 1e-3, msg + " (esperado: " + expected + ", obtenido: " + actual + ")");
}
function section(name) { console.log("\n── " + name); }

function mk(startSeconds, comments, name) {
    return { startSeconds: startSeconds, comments: comments || "", name: name || "" };
}
function pair(inM, outM) { return { inMarker: inM, outMarker: outM }; }

function run() {
    passed = 0; failed = 0;

    section("parseInComment() — distingue comentario del CD vs solo transcript");
    var c1 = TC.parseInComment("Nota editor - hola clase");
    assertEq(c1.hasComment, true, "con ' - ' tiene comentario");
    assertEq(c1.note, "Nota editor", "extrae la nota");
    assertEq(c1.transcript, "hola clase", "extrae el transcript");
    assertEq(TC.parseInComment("- hola clase").hasComment, false, "'- texto' no tiene comentario");
    assertEq(TC.parseInComment("hola clase").hasComment, false, "texto suelto no tiene comentario");
    assertEq(TC.parseInComment("- hola clase").transcript, "hola clase", "quita el guion inicial");

    section("blocksFromPairs() — normaliza pares a bloques");
    var pairs = [
        pair(mk(10, "Intro fuerte - bienvenidos a la clase", "CAM"), mk(40, "OUT: fin")),
        pair(mk(60, "- solo transcript aqui"), mk(95, "OUT: fin"))
    ];
    var blocks = TC.blocksFromPairs(pairs);
    assertEq(blocks.length, 2, "2 bloques");
    assertClose(blocks[0].inTime, 10, "inTime del 1er bloque");
    assertClose(blocks[0].outTime, 40, "outTime del 1er bloque");
    assertClose(blocks[0].duration, 30, "duración del 1er bloque");
    assertEq(blocks[0].hasComment, true, "1er bloque con comentario del CD");
    assertEq(blocks[0].editorNote, "Intro fuerte", "nota del CD");
    assertEq(blocks[1].hasComment, false, "2do bloque sin comentario");

    section("blocksFromPairs() — descarta pares inválidos");
    var bad = TC.blocksFromPairs([pair(mk(50, "x"), mk(20, "OUT: y"))]);
    assertEq(bad.length, 0, "OUT antes del IN se descarta");

    section("buildRemoveZones() — pre-inicio, brechas y post-final");
    var zones = TC.buildRemoveZones(blocks, 120);
    assertEq(zones.length, 3, "3 zonas");
    assertClose(zones[0].start, 0, "pre-inicio arranca en 0");
    assertClose(zones[0].end, 10, "pre-inicio termina en el 1er IN");
    assertClose(zones[1].start, 40, "brecha arranca en el OUT anterior");
    assertClose(zones[1].end, 60, "brecha termina en el IN siguiente");
    assertClose(zones[2].start, 95, "post-final arranca en el último OUT");
    assertClose(zones[2].end, 120, "post-final termina al final de la secuencia");
    assertClose(TC.totalRemoved(zones), 10 + 20 + 25, "total eliminado");

    section("buildRemoveZones() — sin duración no agrega post-final");
    var z2 = TC.buildRemoveZones(blocks, 0);
    assertEq(z2.length, 2, "solo pre-inicio y brecha");

    section("buildRemoveZones() — bloque que arranca en 0 y es contiguo");
    var contig = TC.blocksFromPairs([
        pair(mk(0, "a - t"), mk(30, "OUT:")),
        pair(mk(30, "b - t"), mk(60, "OUT:"))
    ]);
    assertEq(TC.buildRemoveZones(contig, 60).length, 0, "sin zonas si no hay huecos");

    section("computeBlockDurations() — solo bloques con comentario del CD");
    var durs = TC.computeBlockDurations(blocks);
    assertEq(durs.length, 1, "1 bloque con comentario");
    assertClose(durs[0].duration, 30, "duración del bloque referenciado");

    section("matchPostCutMarkers() — asigna la duración del bloque original");
    var post = [
        { startSeconds: 0, comments: "Intro fuerte - bienvenidos a la clase", editorNote: "Intro fuerte", isOut: false, hasComment: true },
        { startSeconds: 30, comments: "OUT: fin", isOut: true, hasComment: false }
    ];
    var matched = TC.matchPostCutMarkers(post, durs);
    assertEq(matched.items.length, 1, "1 marcador emparejado");
    assertClose(matched.items[0].start, 0, "start del marcador post-corte");
    assertClose(matched.items[0].endTime, 30, "endTime = start + duración del bloque");
    assertEq(matched.unmatched.length, 0, "nada sin emparejar");

    section("matchPostCutMarkers() — comentarios repetidos se consumen en orden");
    var dupDurs = [
        { comment: "Nota - x", editorNote: "Nota", duration: 10 },
        { comment: "Nota - x", editorNote: "Nota", duration: 20 }
    ];
    var dupPost = [
        { startSeconds: 0, comments: "Nota - x", editorNote: "Nota", isOut: false, hasComment: true },
        { startSeconds: 50, comments: "Nota - x", editorNote: "Nota", isOut: false, hasComment: true }
    ];
    var dupMatch = TC.matchPostCutMarkers(dupPost, dupDurs);
    assertEq(dupMatch.items.length, 2, "2 emparejados");
    assertClose(dupMatch.items[0].endTime, 10, "1º toma la 1ª duración");
    assertClose(dupMatch.items[1].endTime, 70, "2º toma la 2ª duración (50+20)");

    section("matchPostCutMarkers() — reporta los que no encuentran bloque");
    var un = TC.matchPostCutMarkers(
        [{ startSeconds: 5, comments: "Otra cosa - y", editorNote: "Otra cosa", isOut: false, hasComment: true }],
        durs
    );
    assertEq(un.items.length, 0, "sin items");
    assertEq(un.unmatched.length, 1, "1 sin emparejar");

    section("viewNameOf() — filtra nombres por defecto de Premiere");
    assertEq(TC.viewNameOf({ name: "CAM" }), "CAM", "nombre real");
    assertEq(TC.viewNameOf({ name: "Marcador 1" }), "", "descarta 'Marcador 1'");
    assertEq(TC.viewNameOf({ name: "marker" }), "", "descarta 'marker'");
    assertEq(TC.viewNameOf({ name: "", editorNote: "PC" }), "PC", "cae a la nota corta");

    section("viewNameOf() — la claqueta es referencia de sincronía, no una vista");
    assertEq(TC.viewNameOf({ name: "Claqueta" }), "", "descarta 'Claqueta'");
    assertEq(TC.viewNameOf({ name: "claqueta 1" }), "", "descarta 'claqueta 1'");
    assertEq(TC.viewNameOf({ name: "Clapperboard" }), "", "descarta 'Clapperboard'");
    assertEq(TC.viewNameOf({ name: "K" }), "", "descarta la 'K' de claqueta");
    assertEq(TC.viewNameOf({ name: "", editorNote: "claqueta" }), "", "descarta la claqueta en la nota");
    assertEq(TC.viewNameOf({ name: "CAM" }), "CAM", "no se lleva vistas reales por delante");

    section("buildViewPayload() — segmentos hasta el siguiente marcador");
    var vpMarkers = [
        { startSeconds: 0, name: "CAM", isOut: false },
        { startSeconds: 30, name: "OUT: x", isOut: true },
        { startSeconds: 40, name: "PC", isOut: false }
    ];
    var vp = TC.buildViewPayload({ CAM: ["V1"], PC: ["V2"] }, vpMarkers, 100);
    assertEq(vp.segments.length, 2, "2 segmentos (los OUT no cuentan)");
    assertClose(vp.segments[0].end, 40, "1er segmento termina donde arranca el siguiente");
    assertClose(vp.segments[1].end, 100, "último segmento termina al final de la secuencia");
    assertEq(vp.mapping.CAM[0], "V1", "conserva el mapping");
    assertEq(TC.viewNamesOf(vpMarkers).join(","), "CAM,PC", "nombres de vista únicos");

    // activateViews apaga TODO clip dentro de un segmento cuyo nombre no mapea a
    // su pista: un marcador de nota sin pistas dejaría la zona en negro.
    section("buildViewPayload() — un nombre sin pistas asignadas no genera segmento");
    var noteMarkers = [
        { startSeconds: 0, name: "CAM", isOut: false },
        { startSeconds: 20, name: "⚠ Sin WAV", isOut: false },
        { startSeconds: 40, name: "PC", isOut: false }
    ];
    var vpNote = TC.buildViewPayload({ CAM: ["V1"], PC: ["V2"] }, noteMarkers, 100);
    assertEq(vpNote.segments.length, 2, "la nota no cuenta como vista");
    assertEq(vpNote.segments[0].name, "CAM", "1er segmento sigue siendo CAM");
    assertClose(vpNote.segments[0].end, 40, "CAM llega hasta PC, no se corta en la nota");
    assertEq(vpNote.segments[1].name, "PC", "2º segmento es PC");

    var vpEmpty = TC.buildViewPayload({ CAM: [] }, [{ startSeconds: 0, name: "CAM", isOut: false }], 100);
    assertEq(vpEmpty.segments.length, 0, "vista con lista de pistas vacía tampoco genera segmento");

    section("buildTimedFromWords() — líneas con rango de tiempo");
    var words = [
        { text: "Hola", start: 0, end: 0.4, type: "word" },
        { text: "clase.", start: 0.5, end: 1.0, type: "word" },
        { text: "Hoy", start: 3.0, end: 3.3, type: "word" },
        { text: "vemos", start: 3.4, end: 3.9, type: "word" }
    ];
    var timed = TC.buildTimedFromWords(words);
    var timedLines = timed.split("\n");
    assertEq(timedLines.length, 2, "2 líneas (corta en el punto)");
    assert(timedLines[0].indexOf("[0.0s - 1.0s]") === 0, "formato del rango: " + timedLines[0]);
    assert(timedLines[0].indexOf("Hola clase.") !== -1, "texto de la 1ª línea");
    assert(timedLines[1].indexOf("Hoy vemos") !== -1, "texto de la 2ª línea");
    assertEq(TC.buildTimedFromWords([]), "", "sin palabras → vacío");

    section("buildCdNotesContext() — usa tiempos post-corte cuando existen");
    var ctx = TC.buildCdNotesContext(blocks, post);
    assert(ctx.indexOf("Intro fuerte") !== -1, "incluye la nota del CD");
    assert(ctx.indexOf("[0.0s]") !== -1, "usa el tiempo post-corte");
    var ctxFallback = TC.buildCdNotesContext(blocks, []);
    assert(ctxFallback.indexOf("[10.0s]") !== -1, "sin post-corte usa el tiempo del bloque");
    assertEq(TC.buildCdNotesContext([], []), "", "sin notas → string vacío");

    return { passed, failed };
}

module.exports = { run };
