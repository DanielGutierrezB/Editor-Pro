/**
 * Tests del parser de JSON de Whisper y del limpiador de alucinaciones
 * (compartidos por los motores MLX/Python en speech-to-text.js).
 *
 * speech-to-text.js es "browser-only" (usa `window` y termina en `})(window);`),
 * así que lo cargamos con un shim mínimo de entorno y probamos los métodos
 * estáticos expuestos en SpeechToText.
 *
 * Ejecutar con: node tests/run-node-tests.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (cond) { passed++; } else { failed++; console.error("  ✗ FALLO: " + msg); }
}
function assertEq(actual, expected, msg) {
    assert(actual === expected, msg + " (esperado: " + expected + ", obtenido: " + actual + ")");
}
function section(name) { console.log("\n── " + name); }

// ─── Cargar speech-to-text.js con un shim de browser ─────────
function loadSTT() {
    const src = fs.readFileSync(path.join(__dirname, "../client/js/speech-to-text.js"), "utf8");
    const window = {};
    const localStorage = { getItem: function() { return null; }, setItem: function() {} };
    const factory = new Function("window", "localStorage", "require", "process", "Buffer", "console",
        src + "\nreturn window;");
    const w = factory(window, localStorage, require, process, Buffer, console);
    return w.SpeechToText;
}

function mkWords(tokens, t0) {
    var t = t0 || 0;
    return tokens.map(function(tok) {
        var w = { text: tok, start: t, end: t + 0.3, type: "word" };
        t += 0.4;
        return w;
    });
}

function run() {
    passed = 0; failed = 0;
    const STT = loadSTT();
    const parse = STT.parseWhisperSegmentsToWords;
    const clean = STT.cleanHallucinatedRepeats;

    section("parseWhisperSegmentsToWords() — esquema Whisper/MLX estándar");
    const data = {
        text: "hola mundo", language: "es",
        segments: [ { words: [
            { word: " hola", start: 0.10, end: 0.45 },
            { word: " mundo", start: 0.50, end: 0.98 }
        ] } ]
    };
    const words = parse(data);
    assertEq(words.length, 2, "devuelve 2 palabras");
    assertEq(words[0].text, "hola", "trim del espacio inicial de MLX");
    assertEq(words[1].start, 0.50, "conserva el start real");

    section("descarta palabras vacías o sin timestamps");
    const dirty = { segments: [ { words: [
        { word: "  ", start: 0, end: 0.1 },
        { word: "ok", start: 1.0, end: 1.2 },
        { word: "x" },
        { word: "y", start: "z", end: 2 }
    ] } ] };
    const cleaned = parse(dirty);
    assertEq(cleaned.length, 1, "solo la palabra válida sobrevive");
    assertEq(cleaned[0].text, "ok", "conserva la válida");

    section("cleanHallucinatedRepeats() — elimina rachas de palabra repetida");
    const hallu = mkWords(["Hola", "clase", "nuevo", "nuevo", "nuevo", "nuevo", "nuevo", "nuevo", "nuevo", "adiós"]);
    const r1 = clean(hallu);
    assertEq(r1.length, 3, "quita la racha de 7x 'nuevo', deja 'Hola clase adiós'");
    assertEq(r1.map(function(w){return w.text;}).join(" "), "Hola clase adiós", "conserva el orden y las reales");

    section("cleanHallucinatedRepeats() — elimina LOOP de frase repetida (multi-palabra)");
    const phraseLoop = mkWords(["Hola", "clase",
        "vamos", "a", "ver", "vamos", "a", "ver", "vamos", "a", "ver", "vamos", "a", "ver",
        "adiós"]);
    const rp = clean(phraseLoop).map(function(w){return w.text;}).join(" ");
    assertEq(rp, "Hola clase adiós", "colapsa el loop 'vamos a ver' x4, deja el contenido real");

    section("cleanHallucinatedRepeats() — no toca una frase dicha una sola vez");
    const once = mkWords(["vamos", "a", "ver", "el", "tema", "de", "hoy"]);
    assertEq(clean(once).length, 7, "una frase legítima sin repetir se conserva");

    section("cleanHallucinatedRepeats() — no toca repeticiones cortas legítimas");
    const legit = mkWords(["no", "no", "no", "para", "nada"]); // 3x 'no' < umbral 6
    assertEq(clean(legit).length, 5, "3x 'no' seguidas se conservan");

    section("cleanHallucinatedRepeats() — ignora acentos/puntuación al comparar");
    const acc = mkWords(["eh,", "eh", "eh.", "eh", "eh", "eh", "listo"]); // 6x 'eh' variantes
    const rAcc = clean(acc);
    assertEq(rAcc.map(function(w){return w.text;}).join(" "), "listo", "colapsa 6x 'eh' con puntuación variada");

    section("cleanHallucinatedRepeats() — robusto ante vacío/corto");
    assertEq(clean([]).length, 0, "lista vacía");
    assertEq(clean(mkWords(["a", "a"])).length, 2, "2 iguales < umbral se conservan");

    return { passed, failed };
}

module.exports = { run };
