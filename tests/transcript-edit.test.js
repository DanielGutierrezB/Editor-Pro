/**
 * Tests del módulo puro transcript-edit.js: alineación de texto editado sobre
 * words[] preservando timestamps.
 *
 * Ejecutar con: node tests/run-node-tests.js
 */
"use strict";

const TE = require("../client/js/transcript-edit.js");

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (cond) { passed++; } else { failed++; console.error("  ✗ FALLO: " + msg); }
}
function assertEq(actual, expected, msg) {
    assert(actual === expected, msg + " (esperado: " + expected + ", obtenido: " + actual + ")");
}
function assertClose(actual, expected, msg) {
    assert(Math.abs(actual - expected) < 1e-6, msg + " (esperado: " + expected + ", obtenido: " + actual + ")");
}
function section(name) { console.log("\n── " + name); }

function mkWords(tokens, t0) {
    var t = t0 || 0;
    return tokens.map(function(tok) {
        var w = { text: tok, start: Math.round(t * 1000) / 1000, end: Math.round((t + 0.3) * 1000) / 1000, type: "word" };
        t += 0.4;
        return w;
    });
}
function texts(words) { return words.map(function(w){ return w.text; }).join(" "); }

function run() {
    passed = 0; failed = 0;

    section("tokenizeText() — separa por espacios y saltos, ignora vacíos");
    assertEq(TE.tokenizeText("hola   mundo\n\nadiós").length, 3, "3 tokens");
    assertEq(TE.tokenizeText("").length, 0, "vacío → 0");
    assertEq(TE.tokenizeText("   ").length, 0, "solo espacios → 0");

    section("normalizeToken() — quita acentos y puntuación, minúsculas");
    assertEq(TE.normalizeToken("¡Adiós!"), "adios", "acentos y signos fuera");
    assertEq(TE.normalizeToken("Niño,"), "nino", "ñ→n y coma fuera");

    section("wordsToText() — round-trip por tokens");
    var w0 = mkWords(["Hola", "clase", "de", "hoy"]);
    var txt0 = TE.wordsToText(w0);
    assertEq(TE.tokenizeText(txt0).length, 4, "4 tokens al re-separar");

    section("alignEditedWords() — corrección 1:1 preserva TODOS los timings");
    var orig = mkWords(["aver", "vamos", "a", "empezar"]);
    var edited = TE.alignEditedWords(orig, "a ver vamos a empezar");
    // "aver" → "a ver" (1 palabra se vuelve 2): el resto conserva timing exacto
    assertEq(texts(edited), "a ver vamos a empezar", "texto corregido aplicado");
    // Las 3 palabras finales (vamos a empezar) mantienen su timing original
    assertClose(edited[edited.length - 1].start, orig[3].start, "empezar conserva start");
    assertClose(edited[edited.length - 1].end, orig[3].end, "empezar conserva end");
    assertClose(edited[edited.length - 2].start, orig[2].start, "'a' conserva start");
    assertClose(edited[edited.length - 3].start, orig[1].start, "'vamos' conserva start");

    section("alignEditedWords() — reemplazo de una palabra conserva su tiempo");
    var o2 = mkWords(["el", "perro", "corre", "rapido"]);
    var e2 = TE.alignEditedWords(o2, "el gato corre rápido");
    assertEq(texts(e2), "el gato corre rápido", "aplica cambios");
    assertEq(e2.length, 4, "mismo número de palabras");
    assertClose(e2[0].start, o2[0].start, "'el' intacto");
    assertClose(e2[1].start, o2[1].start, "'gato' hereda el tiempo de 'perro'");
    assertClose(e2[1].end, o2[1].end, "'gato' hereda el end de 'perro'");
    assertClose(e2[2].start, o2[2].start, "'corre' intacto");
    assertClose(e2[3].start, o2[3].start, "'rápido' hereda tiempo de 'rapido'");

    section("alignEditedWords() — sin cambios devuelve mismos timings");
    var o3 = mkWords(["uno", "dos", "tres"]);
    var e3 = TE.alignEditedWords(o3, "uno dos tres");
    assertEq(texts(e3), "uno dos tres", "texto igual");
    for (var i = 0; i < 3; i++) {
        assertClose(e3[i].start, o3[i].start, "palabra " + i + " start intacto");
        assertClose(e3[i].end, o3[i].end, "palabra " + i + " end intacto");
    }

    section("alignEditedWords() — inserción de palabra se reparte en la ventana");
    var o4 = mkWords(["hola", "mundo"]);        // hola: 0..0.3, mundo: 0.4..0.7
    var e4 = TE.alignEditedWords(o4, "hola gran mundo");
    assertEq(texts(e4), "hola gran mundo", "inserta 'gran'");
    assertEq(e4.length, 3, "3 palabras");
    assertClose(e4[0].start, o4[0].start, "'hola' intacto");
    assertClose(e4[2].start, o4[1].start, "'mundo' intacto");
    assert(e4[1].start >= e4[0].end - 1e-6 && e4[1].end <= e4[2].start + 1e-6, "'gran' cae entre 'hola' y 'mundo'");

    section("alignEditedWords() — borrar una palabra conserva el resto");
    var o5 = mkWords(["esto", "es", "muy", "importante"]);
    var e5 = TE.alignEditedWords(o5, "esto es importante");
    assertEq(texts(e5), "esto es importante", "quita 'muy'");
    assertEq(e5.length, 3, "3 palabras");
    assertClose(e5[2].start, o5[3].start, "'importante' conserva su tiempo");

    section("alignEditedWords() — casos límite");
    assertEq(TE.alignEditedWords(mkWords(["a", "b"]), "").length, 0, "texto vacío → sin palabras");
    var e6 = TE.alignEditedWords([], "hola mundo");
    assertEq(e6.length, 2, "sin timings previos → reparte");
    assert(typeof e6[0].start === "number" && e6[1].end > e6[0].start, "genera timings crecientes");

    section("alignEditedWords() — solo cambia mayúsculas/acentos (match normalizado)");
    var o7 = mkWords(["adios", "clase"]);
    var e7 = TE.alignEditedWords(o7, "Adiós clase");
    assertEq(e7[0].text, "Adiós", "aplica el texto con mayúscula/acento");
    assertClose(e7[0].start, o7[0].start, "pero conserva el timing original");

    section("replaceAllWords() — corrige todas las apariciones conservando timings");
    var r1 = mkWords(["en", "Plasi", "aprendes", "y", "Plasi", "enseña"]);
    var out1 = TE.replaceAllWords(r1, "Plasi", "Platzi");
    assertEq(out1.count, 2, "cuenta 2 coincidencias");
    assertEq(texts(out1.words), "en Platzi aprendes y Platzi enseña", "reemplaza ambas");
    assertClose(out1.words[1].start, r1[1].start, "1ª Platzi conserva start");
    assertClose(out1.words[1].end, r1[1].end, "1ª Platzi conserva end");
    assertClose(out1.words[4].start, r1[4].start, "2ª Platzi conserva start");

    section("replaceAllWords() — ignora puntuación externa y respeta mayúsculas");
    var r2 = mkWords(["Plasi,", "hola", "plasi"]);
    var out2 = TE.replaceAllWords(r2, "plasi", "platzi");
    assertEq(out2.count, 2, "match con y sin coma, sin importar mayúsculas");
    assertEq(out2.words[0].text, "Platzi,", "conserva la coma y la mayúscula inicial");
    assertEq(out2.words[2].text, "platzi", "minúscula se mantiene minúscula");

    section("replaceAllWords() — caseSensitive distingue mayúsculas");
    var r3 = mkWords(["Plasi", "plasi"]);
    var out3 = TE.replaceAllWords(r3, "Plasi", "Platzi", { caseSensitive: true });
    assertEq(out3.count, 1, "solo la que coincide exactamente en mayúsculas");
    assertEq(texts(out3.words), "Platzi plasi", "no toca la minúscula");

    section("replaceAllWords() — secuencia multi-palabra");
    var r4 = mkWords(["usa", "note", "book", "hoy"]);
    var out4 = TE.replaceAllWords(r4, "note book", "notebook");
    assertEq(out4.count, 1, "1 coincidencia de 2 palabras");
    assertEq(texts(out4.words), "usa notebook hoy", "colapsa a una palabra");
    assertClose(out4.words[1].start, r4[1].start, "notebook empieza donde 'note'");
    assertClose(out4.words[1].end, r4[2].end, "notebook termina donde 'book'");

    section("replaceAllWords() — sin coincidencias no cambia nada");
    var r5 = mkWords(["hola", "mundo"]);
    var out5 = TE.replaceAllWords(r5, "xyz", "abc");
    assertEq(out5.count, 0, "0 coincidencias");
    assertEq(texts(out5.words), "hola mundo", "texto intacto");

    return { passed, failed };
}

module.exports = { run };
