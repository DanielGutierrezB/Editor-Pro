/**
 * Tests de la lectura de marcadores del host (host/common.jsx), en un motor que
 * se parece al de Premiere.
 *
 * ExtendScript es ES3 y **no tiene `String.prototype.trim`** (es de ES5). El
 * contexto de estos tests lo borra a propósito: sin eso, Node lo tiene y el
 * fallo real —`(marker.comments || "").trim()` reventando con "marker.comments
 * ||.trim is not a function"— pasaría desapercibido aquí.
 *
 * Ese fallo dejaba la lista de marcadores en cero después de cortar (21 antes,
 * ninguno después) y con ella la Vista de Cámaras, que sale de esos nombres.
 *
 * Ejecutar con: node tests/run-node-tests.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const HOST_DIR = path.join(__dirname, "..", "host");

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (cond) { passed++; } else { failed++; console.error("  ✗ FALLO: " + msg); }
}
function assertEq(actual, expected, msg) {
    assert(actual === expected, msg + " (esperado: " + expected + ", obtenido: " + actual + ")");
}
function section(name) { console.log("\n── " + name); }

/** Un marcador de Premiere: lo justo que el host le pide. */
function marker(name, comments, secs) {
    return {
        name: name,
        comments: comments,
        start: { seconds: secs },
        end: { seconds: secs },
        getColorByIndex: function() { return 4; },
        setColorByIndex: function(c) { this._color = c; }
    };
}

/** La colección de marcadores, que se recorre con getFirst/getNext. */
function markerCollection(list) {
    return {
        numMarkers: list.length,
        getFirstMarker: function() { return list[0] || null; },
        getNextMarker: function(cur) {
            const i = list.indexOf(cur);
            return (i >= 0 && i + 1 < list.length) ? list[i + 1] : null;
        },
        deleteMarker: function(mk) {
            const i = list.indexOf(mk);
            if (i >= 0) list.splice(i, 1);
        }
    };
}

/** common.jsx cargado en un motor sin String.trim, como el de Premiere. */
function loadHost(list) {
    const seq = { name: "clase 14", markers: markerCollection(list), videoTracks: { numTracks: 0 } };
    const sandbox = {
        JSON: JSON, Math: Math, parseFloat: parseFloat, parseInt: parseInt, isNaN: isNaN,
        File: function() {}, $: { sleep: function() {} },
        app: { enableQE: function() {}, project: { activeSequence: seq, sequences: { numSequences: 0 } } },
        qe: { project: { getActiveSequence: function() { return null; } } }
    };
    vm.createContext(sandbox);
    vm.runInContext("delete String.prototype.trim;", sandbox);
    vm.runInContext(fs.readFileSync(path.join(HOST_DIR, "common.jsx"), "utf8"), sandbox, { filename: "common.jsx" });
    return sandbox;
}

function run() {
    passed = 0; failed = 0;

    section("El motor de estos tests no tiene String.trim, como el de Premiere");
    const probe = loadHost([]);
    assertEq(vm.runInContext("typeof ''.trim", probe), "undefined", "String.prototype.trim no existe aquí");

    section("getPostCutMarkers() — los marcadores de siempre");
    const host = loadHost([
        marker("CAM", "  PV - hoy vamos a ver la cadena  ", 10),
        marker("", "OUT: ...y con eso cerramos", 20),
        marker("PC", "Sin WAV - la pantalla del editor", 30)
    ]);
    const res = JSON.parse(host.getPostCutMarkers());
    assert(!res.error, "no devuelve error" + (res.error ? ": " + res.error : ""));
    assertEq(res.count, 3, "los tres marcadores");
    assertEq(res.markers[0].comments, "PV - hoy vamos a ver la cadena", "los espacios de los lados se recortan");
    assertEq(res.markers[0].editorNote, "PV", "la nota del CD, antes del guión");
    assertEq(res.markers[0].transcript, "hoy vamos a ver la cadena", "y el texto, después");
    assertEq(res.markers[0].hasComment, true, "el bloque con nota del CD");
    assertEq(res.markers[1].isOut, true, "el OUT se reconoce por el prefijo");
    assertEq(res.markers[1].hasComment, false, "un OUT no cuenta como comentario del CD");
    assertEq(res.markers[2].name, "PC", "el nombre del marcador, que es de donde salen las vistas");

    section("getPostCutMarkers() — un marcador ilegible no se lleva puestos a los demás");
    // El caso real: `comments` no siempre llega como texto. Antes, el primero
    // así reventaba la lectura entera y el panel decía "0 marcadores".
    const raro = marker("CAM", { toString: function() { throw new Error("ilegible"); } }, 15);
    const host2 = loadHost([
        marker("CAM", "PV - primera parte", 10),
        raro,
        marker("PC", "PV - tercera parte", 30)
    ]);
    const res2 = JSON.parse(host2.getPostCutMarkers());
    assert(!res2.error, "sigue sin devolver error" + (res2.error ? ": " + res2.error : ""));
    assertEq(res2.count, 2, "los dos que sí se pueden leer llegan igual");
    assertEq(res2.unreadable, 1, "y el que no, queda contado");
    assertEq(res2.markers[1].transcript, "tercera parte", "el de después del ilegible se lee bien");

    section("getPostCutMarkers() — comments que no es texto pero se deja convertir");
    const host3 = loadHost([marker("CAM", { toString: function() { return "PV - convertido"; } }, 10)]);
    const res3 = JSON.parse(host3.getPostCutMarkers());
    assertEq(res3.count, 1, "se lee");
    assertEq(res3.markers[0].editorNote, "PV", "convirtiendo a texto antes de partir la nota");

    section("getPostCutMarkers() — sin marcadores no es un error");
    const vacio = JSON.parse(loadHost([]).getPostCutMarkers());
    assert(!vacio.error, "una secuencia sin marcadores devuelve éxito");
    assertEq(vacio.count, 0, "cero marcadores");
    assertEq(vacio.unreadable, 0, "y ninguno ilegible: el panel puede decir cuál de las dos cosas pasó");

    section("deleteMarkersWithoutComments() — en el mismo motor");
    const host4 = loadHost([
        marker("CAM", "PV - bloque con nota", 10),
        marker("", "OUT: cierre", 20),
        marker("", "", 30)
    ]);
    const del = JSON.parse(host4.deleteMarkersWithoutComments());
    assert(!del.error, "no revienta sin String.trim" + (del.error ? ": " + del.error : ""));
    assertEq(del.deleted, 2, "borra el OUT y el vacío, deja el que tiene nota del CD");

    section("colorizeCommentMarkers() — en el mismo motor");
    const host5 = loadHost([
        marker("CAM", "PV - bloque con nota", 10),
        marker("", "OUT: cierre", 20)
    ]);
    const col = JSON.parse(host5.colorizeCommentMarkers());
    assert(!col.error, "no revienta sin String.trim" + (col.error ? ": " + col.error : ""));
    assertEq(col.colored, 1, "colorea solo el que tiene nota del CD");

    console.log("\n" + passed + " OK, " + failed + " fallos");
    return { passed, failed };
}

module.exports = { run };
