/**
 * Tests del módulo puro transcript-repeats.js: detección de ideas repetidas
 * (pickups) y corte que las elimina preservando sincronía de timestamps.
 *
 * Ejecutar con: node tests/run-node-tests.js
 */
"use strict";

const TR = require("../client/js/transcript-repeats.js");

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

// Construye words[] a partir de una lista de frases (cada frase = string).
// Deja una pausa de `gap` entre frases para forzar la separación.
function build(phrases, gap) {
    gap = gap == null ? 1.0 : gap;
    var words = [];
    var t = 0;
    for (var p = 0; p < phrases.length; p++) {
        var toks = phrases[p].split(/\s+/).filter(Boolean);
        for (var i = 0; i < toks.length; i++) {
            words.push({ text: toks[i], start: Math.round(t * 1000) / 1000, end: Math.round((t + 0.3) * 1000) / 1000, type: "word" });
            t += 0.4;
        }
        t += gap; // pausa entre frases
    }
    return words;
}
function texts(words) { return words.map(function(w){ return w.text; }).join(" "); }

function run() {
    passed = 0; failed = 0;

    section("detectRepeats() — pickup con idea repetida (palabras distintas)");
    // Frase 1 (toma abortada) y frase 2 (retoma) comparten la idea/tokens clave.
    var w1 = build([
        "para este reto vas a crear un audio overview",
        "para este reto ustedes van a crear un audio overview basado en negocio",
        "esa infografia dejala en los comentarios finales por favor"
    ]);
    var reps = TR.detectRepeats(w1, { threshold: 0.6, minContent: 3, lookahead: 1 });
    assertEq(reps.length, 1, "detecta 1 repetición");
    assert(reps[0].similarity >= 0.6, "similitud alta (" + reps[0].similarity + ")");
    assertClose(reps[0].cutStart, w1[0].start, "cutStart = inicio de la 1ª frase");

    section("detectRepeats() — frases distintas no se marcan");
    var w2 = build([
        "hoy vamos a hablar de inteligencia artificial",
        "manana revisaremos ejercicios de estadistica descriptiva",
        "el proximo modulo trata sobre bases de datos"
    ]);
    var reps2 = TR.detectRepeats(w2, { threshold: 0.6, minContent: 3 });
    assertEq(reps2.length, 0, "sin repeticiones");

    section("detectRepeats() — el corte va de inicio de 1ª a inicio de 2ª frase");
    var rep = reps[0];
    // La 2ª frase empieza justo donde arranca su primer token.
    var firstTok2ndPhrase = w1[rep.secondIdx[0]];
    assertClose(rep.cutEnd, firstTok2ndPhrase.start, "cutEnd = inicio de la retoma");
    assert(rep.cutDuration > 0, "duración de corte positiva");

    section("applyCut() — quita el rango y desplaza lo posterior");
    var before = w1.slice();
    var res = TR.applyCut(before, rep.cutStart, rep.cutEnd);
    assert(res.removed > 0, "removió palabras (" + res.removed + ")");
    assert(res.shifted > 0, "desplazó palabras posteriores (" + res.shifted + ")");
    assertClose(res.duration, rep.cutEnd - rep.cutStart, "duración correcta");
    // El primer token conservado tras el corte debe empezar en cutStart (la retoma
    // se corre para ocupar el hueco del material eliminado).
    assertClose(res.words[rep.firstIdx[0]].start, rep.cutStart, "la retoma arranca en cutStart tras el corte");

    section("applyCut() — no toca nada antes del corte");
    var w3 = build(["hola mundo esto es una prueba", "otra frase totalmente distinta aqui"]);
    var r3 = TR.applyCut(w3, w3[8].start, w3[10].start); // corta 2 palabras dentro de la 2ª frase
    // Las primeras 6 palabras (frase 1) quedan idénticas.
    for (var i = 0; i < 6; i++) {
        assertClose(r3.words[i].start, w3[i].start, "palabra " + i + " intacta antes del corte");
    }

    section("applyCut() — rango inválido no cambia nada");
    var r4 = TR.applyCut(w3, 5, 5);
    assertEq(r4.removed, 0, "sin removidos");
    assertEq(texts(r4.words), texts(w3), "texto intacto");

    return { passed, failed };
}

module.exports = { run };
