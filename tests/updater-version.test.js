/**
 * Tests de la comparación de versiones del auto-updater (client/js/updater.js).
 *
 * El caso que la originó: con la 2.25.2 instalada, el canal ofrecía "actualizar"
 * a la 2.5.3. Comparadas como texto, "2.5.3" va después de "2.25.2" —en el
 * segundo tramo, "5" es mayor que "2"—, así que una versión vieja se ofrecía
 * como nueva y el pull fallaba.
 *
 * Ejecutar con: node tests/run-node-tests.js
 */
"use strict";

const U = require("../client/js/updater.js");

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (cond) { passed++; } else { failed++; console.error("  ✗ FALLO: " + msg); }
}
function assertEq(actual, expected, msg) {
    assert(actual === expected, msg + " (esperado: " + expected + ", obtenido: " + actual + ")");
}
function section(name) { console.log("\n── " + name); }

function run() {
    passed = 0; failed = 0;
    const cmp = U.compareVersions;

    section("El caso real: la 2.5.3 no es posterior a la 2.25.2");
    assertEq(cmp("2.5.3", "2.25.2"), -1, "el canal en 2.5.3 está por detrás de la 2.25.2 instalada");
    assertEq(cmp("2.25.2", "2.5.3"), 1, "y la 2.25.2 está por delante");

    section("Tramos comparados como números, no como texto");
    assertEq(cmp("2.10.0", "2.9.0"), 1, "10 es posterior a 9");
    assertEq(cmp("1.0.0", "10.0.0"), -1, "10 mayor en el primer tramo");
    assertEq(cmp("2.25.10", "2.25.9"), 1, "el último tramo también es número");

    section("Iguales");
    assertEq(cmp("2.25.2", "2.25.2"), 0, "la misma versión");
    assertEq(cmp("v2.25.2", "2.25.2"), 0, "la 'v' de adelante no cuenta");
    assertEq(cmp(" 2.25.2\n", "2.25.2"), 0, "los espacios y el salto de línea del archivo VERSION tampoco");

    section("Tramos que faltan valen cero");
    assertEq(cmp("2.25", "2.25.0"), 0, "2.25 es 2.25.0");
    assertEq(cmp("2.25.1", "2.25"), 1, "2.25.1 es posterior a 2.25");
    assertEq(cmp("3", "2.25.2"), 1, "una versión de un solo tramo se compara igual");

    section("Lo que no se puede leer devuelve null, no una respuesta inventada");
    // Sin poder comparar, quien llama ofrece la actualización: es preferible
    // ofrecer de más que dejar a alguien clavado en una versión vieja.
    assertEq(cmp("2.25.2", null), null, "sin versión remota");
    assertEq(cmp(null, "2.25.2"), null, "sin versión local");
    assertEq(cmp("", "2.25.2"), null, "archivo VERSION vacío");
    assertEq(cmp("2.25.2-beta", "2.25.2"), null, "un sufijo que no es número");
    assertEq(cmp("nightly", "2.25.2"), null, "un nombre de canal en vez de una versión");

    console.log("\n" + passed + " OK, " + failed + " fallos");
    return { passed, failed };
}

module.exports = { run };
