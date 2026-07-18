/**
 * Tests Node del validador de cortes (cut-validator.js).
 * Ejecutar con: node tests/run-node-tests.js
 */
"use strict";

const validator = require("../client/js/cut-validator.js");

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

/**
 * Genera words[] a partir de un texto: cada palabra dura `wordDur` segundos
 * con `gap` segundos de silencio entre palabras, empezando en `startTime`.
 */
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

function lastEnd(words) {
    return words[words.length - 1].end;
}

function run() {

    section("detectPickups() — pickup literal");
    {
        // Toma 1: termina con "el resultado de la ecuación es importante"
        // Toma 2: re-entra repitiendo "el resultado de la ecuación" y sigue con contenido nuevo
        const w1 = mkWords("bienvenidos a la clase de hoy vamos a ver algebra lineal el resultado de la ecuacion es importante", 10);
        const gapWords = mkWords("retomemos tres dos uno", lastEnd(w1) + 2, 0.3, 0.2);
        const w2 = mkWords("el resultado de la ecuacion es importante porque define la solucion del sistema completo", lastEnd(gapWords) + 1);
        const words = w1.concat(gapWords, w2);

        const segments = [
            { inTime: w1[0].start - 0.3, outTime: lastEnd(w1) + 0.3 },
            { inTime: w2[0].start - 0.3, outTime: lastEnd(w2) + 0.3 }
        ];

        const proposals = validator.detectPickups(words, segments);
        assertEq(proposals.length, 1, "detecta 1 pickup");
        const p = proposals[0];
        assertEq(p.type, "pickup", "tipo pickup");
        assertEq(p.prevSegPos, 0, "afecta a la toma previa");
        assert(p.matchWordCount >= 6, "match de al menos 6 palabras (obtenido: " + p.matchWordCount + ")");
        assert(p.matchText.toLowerCase().indexOf("resultado") !== -1, "el texto duplicado incluye la frase");

        // El OUT propuesto debe retroceder al inicio de "el" (índice 11 de w1),
        // dentro del gap de silencio previo, sin pasar del inicio de la palabra
        const matchStart = w1[11].start;
        const bound = w1[10].end;
        const gapLen = Math.max(0, matchStart - bound);
        const expectedOut = matchStart - Math.min(0.15, gapLen / 2);
        assert(p.proposedOutTime < p.originalOutTime, "el OUT retrocede");
        assert(p.proposedOutTime <= matchStart + 1e-9, "el OUT no invade la primera palabra repetida");
        assertClose(p.proposedOutTime, expectedOut, 0.01, "OUT propuesto al inicio de la frase repetida");
        assertEq(p.confidence, "alta", "confianza alta (match anclado a ambos bordes)");
    }

    section("detectPickups() — sin repetición → sin propuestas");
    {
        const w1 = mkWords("hoy vamos a hablar de derivadas parciales y sus aplicaciones", 5);
        const w2 = mkWords("ahora pasemos a un tema completamente distinto las integrales dobles", lastEnd(w1) + 4);
        const words = w1.concat(w2);
        const segments = [
            { inTime: w1[0].start - 0.3, outTime: lastEnd(w1) + 0.3 },
            { inTime: w2[0].start - 0.3, outTime: lastEnd(w2) + 0.3 }
        ];
        const proposals = validator.detectPickups(words, segments);
        assertEq(proposals.length, 0, "no propone nada sin repetición");
    }

    section("detectPickups() — repetición corta bajo el umbral → ignorada");
    {
        // Solo 2 palabras repetidas ("la ecuacion") — bajo minMatchWords=3
        const w1 = mkWords("veamos ahora como se resuelve la ecuacion", 5);
        const w2 = mkWords("la ecuacion nueva que veremos es diferente de la anterior", lastEnd(w1) + 4);
        const words = w1.concat(w2);
        const segments = [
            { inTime: w1[0].start - 0.3, outTime: lastEnd(w1) + 0.3 },
            { inTime: w2[0].start - 0.3, outTime: lastEnd(w2) + 0.3 }
        ];
        const proposals = validator.detectPickups(words, segments);
        assertEq(proposals.length, 0, "match de 2 palabras no dispara propuesta");
    }

    section("detectPickups() — normalización de acentos y puntuación");
    {
        const w1 = mkWords("y asi terminamos la explicación de la fórmula cuadrática, perfecta", 5);
        const w2 = mkWords("la explicacion de la formula cuadratica perfecta continúa con el discriminante y sus raices", lastEnd(w1) + 4);
        const words = w1.concat(w2);
        const segments = [
            { inTime: w1[0].start - 0.3, outTime: lastEnd(w1) + 0.3 },
            { inTime: w2[0].start - 0.3, outTime: lastEnd(w2) + 0.3 }
        ];
        const proposals = validator.detectPickups(words, segments);
        assertEq(proposals.length, 1, "match a pesar de acentos/puntuación distintos");
        assert(proposals[0].matchWordCount >= 5, "match completo de la frase");
    }

    section("detectPickups() — repetición que cubre casi toda la toma previa → warning");
    {
        const w1 = mkWords("la integral definida mide el area bajo la curva", 5);
        const w2 = mkWords("la integral definida mide el area bajo la curva y tambien el volumen en revolucion", lastEnd(w1) + 4);
        const words = w1.concat(w2);
        const segments = [
            { inTime: w1[0].start - 0.2, outTime: lastEnd(w1) + 0.3 },
            { inTime: w2[0].start - 0.3, outTime: lastEnd(w2) + 0.3 }
        ];
        const proposals = validator.detectPickups(words, segments);
        assertEq(proposals.length, 1, "genera una propuesta");
        assertEq(proposals[0].type, "pickup-warning", "es warning de re-toma, no ajuste de OUT");
    }

    section("detectPickups() — frase común a mitad de la cola → NO propone (match no anclado)");
    {
        // "vamos a ver el tema" aparece a mitad de la toma 1 y al inicio de la
        // toma 2, pero la toma 1 sigue con contenido único después. Un pickup
        // aquí borraría ese contenido único.
        const w1 = mkWords("empecemos entonces vamos a ver el tema de hoy con este contenido unico muy importante que no se repite", 5);
        const w2 = mkWords("vamos a ver el tema de derivadas que es distinto", lastEnd(w1) + 4);
        const words = w1.concat(w2);
        const segments = [
            { inTime: w1[0].start - 0.3, outTime: lastEnd(w1) + 0.3 },
            { inTime: w2[0].start - 0.3, outTime: lastEnd(w2) + 0.3 }
        ];
        const proposals = validator.detectPickups(words, segments);
        assertEq(proposals.length, 0, "sin propuesta cuando el match no llega al final de la toma previa");
    }

    section("detectPickups() — habla continua: el OUT no invade la palabra repetida");
    {
        // Sin gap entre palabras (gap=0): el OUT propuesto debe quedar <= inicio
        // de la primera palabra repetida (no cortar dentro de ella)
        const w1 = mkWords("introduccion al tema principal la formula general de segundo grado", 5, 0.3, 0);
        const w2 = mkWords("la formula general de segundo grado se aplica directamente aqui", lastEnd(w1) + 4);
        const words = w1.concat(w2);
        const segments = [
            { inTime: w1[0].start - 0.3, outTime: lastEnd(w1) + 0.3 },
            { inTime: w2[0].start - 0.3, outTime: lastEnd(w2) + 0.3 }
        ];
        const proposals = validator.detectPickups(words, segments);
        assertEq(proposals.length, 1, "detecta el pickup");
        const matchStart = w1[4].start; // "la"
        assert(proposals[0].proposedOutTime <= matchStart + 1e-9,
            "OUT propuesto (" + proposals[0].proposedOutTime + ") no pasa del inicio de la palabra (" + matchStart + ")");
    }

    section("detectPickups() — tokens de puntuación pura no rompen el match");
    {
        // El STT emite "—" como palabra entre frases: no debe fragmentar el match
        const w1 = mkWords("cerramos con la conclusion del ejercicio completo", 5);
        w1.splice(2, 0, { text: "—", start: w1[1].end, end: w1[1].end + 0.05, type: "word" });
        const w2 = mkWords("la conclusion del ejercicio completo nos lleva al siguiente paso", lastEnd(w1) + 4);
        const words = w1.concat(w2);
        const segments = [
            { inTime: w1[0].start - 0.3, outTime: lastEnd(w1) + 0.3 },
            { inTime: w2[0].start - 0.3, outTime: lastEnd(w2) + 0.3 }
        ];
        const proposals = validator.detectPickups(words, segments);
        assertEq(proposals.length, 1, "match a pesar del token de puntuación");
        assert(proposals[0].matchWordCount >= 5, "match completo de la frase");
    }

    section("snapBoundaries() — palabra cortada por el OUT cuenta como interna");
    {
        // La última palabra cruza el OUT (empieza dentro, termina fuera):
        // el snap debe proponer OUT DESPUÉS de esa palabra, no antes
        const content = mkWords("esta toma termina con una palabra cortada", 10);
        const lastW = content[content.length - 1];
        const seg = { inTime: content[0].start - 0.3, outTime: (lastW.start + lastW.end) / 2 + 0.05 };
        const proposals = validator.snapBoundaries(content, [seg]);
        const outProp = proposals.find(p => p.field === "outTime");
        assert(!!outProp, "propone ajuste de OUT");
        assert(outProp.proposed > lastW.end, "el OUT propuesto queda después de la palabra cortada");
    }

    section("snapBoundaries() — ajusta bordes con gap grande");
    {
        // Palabras con gap de 2s antes de la primera palabra del segmento
        const before = mkWords("tres dos uno", 5, 0.3, 0.2);
        const content = mkWords("hola bienvenidos a la clase", lastEnd(before) + 2.0);
        const words = before.concat(content);

        // Segmento con PRE_ROLL fijo de 0.4 (comportamiento actual de recording-notes)
        const seg = { inTime: content[0].start - 0.4, outTime: lastEnd(content) + 0.3 };
        const proposals = validator.snapBoundaries(words, [seg]);

        const inProp = proposals.find(p => p.field === "inTime");
        assert(!!inProp, "propone ajuste de IN");
        // gap = 2.0 → pre = clamp(1.0, 0.15, 0.5) = 0.5 → IN = firstWord.start - 0.5
        assertClose(inProp.proposed, content[0].start - 0.5, 0.01, "IN al gap de silencio");

        const outProp = proposals.find(p => p.field === "outTime");
        assert(!!outProp, "propone ajuste de OUT (última palabra del transcript)");
        assertClose(outProp.proposed, lastEnd(content) + 0.4, 0.01, "OUT con margen máximo al final");
    }

    section("snapBoundaries() — OUT limitado por la palabra trigger");
    {
        const content = mkWords("esta es la conclusion del tema", 10);
        // trigger "pausa" 0.3s después de la última palabra
        const trigger = mkWords("pausa", lastEnd(content) + 0.3);
        const words = content.concat(trigger);

        const seg = { inTime: content[0].start - 0.3, outTime: lastEnd(content) + 0.3 };
        const proposals = validator.snapBoundaries(words, [seg]);
        const outProp = proposals.find(p => p.field === "outTime");
        if (outProp) {
            assert(outProp.proposed < trigger[0].start, "el OUT no invade el trigger");
        } else {
            assert(true, "sin propuesta = el OUT actual ya es correcto");
        }
    }

    section("snapBoundaries() — sin cambios cuando el borde ya está bien");
    {
        const before = mkWords("uno", 5);
        const content = mkWords("contenido de la toma completa aqui", lastEnd(before) + 0.6);
        const words = before.concat(content);
        // IN ya colocado a mitad del gap (0.3 de margen con gap 0.6 → propuesta = mismo punto)
        const seg = { inTime: content[0].start - 0.3, outTime: lastEnd(content) + 0.4 };
        const proposals = validator.snapBoundaries(words, [seg]);
        const inProp = proposals.find(p => p.field === "inTime");
        assert(!inProp, "no propone IN si la diferencia es menor al umbral");
    }

    section("validateBoundaries() — detecta cortes a mitad de palabra");
    {
        const content = mkWords("palabra uno dos tres cuatro cinco seis", 10);
        // IN cae en medio de la primera palabra; OUT en medio de la última
        const seg = {
            inTime: content[0].start + 0.1,
            outTime: content[content.length - 1].start + 0.1
        };
        const report = validator.validateBoundaries(content, [seg]);
        assertEq(report.length, 1, "un reporte por segmento");
        assertEq(report[0].status, "revisar", "flag revisar");
        assert(report[0].issues.length >= 2, "reporta IN y OUT a mitad de palabra");
        assert(report[0].issues[0].indexOf("palabra") !== -1, "menciona la palabra cortada");
    }

    section("validateBoundaries() — segmento limpio → ok");
    {
        const content = mkWords("una toma perfectamente delimitada sin problemas", 10);
        const seg = { inTime: content[0].start - 0.3, outTime: lastEnd(content) + 0.3 };
        const report = validator.validateBoundaries(content, [seg]);
        assertEq(report[0].status, "ok", "status ok");
        assertEq(report[0].issues.length, 0, "sin issues");
        assert(report[0].contextAfterIn.indexOf("una toma") === 0, "contexto después del IN");
        assert(report[0].contextBeforeOut.indexOf("problemas") !== -1, "contexto antes del OUT");
    }

    return { passed, failed };
}

module.exports = { run };
