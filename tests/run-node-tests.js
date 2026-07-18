/**
 * Runner de tests Node para los módulos puros de Editor-Pro
 * (validador de cortes y revisor de marcadores).
 *
 * Uso: node tests/run-node-tests.js
 */
"use strict";

const suites = [
    { name: "cut-validator", mod: require("./cut-validator.test.js") },
    { name: "marker-reviewer", mod: require("./marker-reviewer.test.js") }
];

let totalPassed = 0;
let totalFailed = 0;

for (const suite of suites) {
    console.log("\n════ Suite: " + suite.name + " ════");
    const { passed, failed } = suite.mod.run();
    totalPassed += passed;
    totalFailed += failed;
}

console.log("\n══════════════════════════════");
console.log("Total: " + totalPassed + " OK, " + totalFailed + " fallos");
if (totalFailed > 0) {
    process.exit(1);
}
console.log("Todos los tests pasaron.");
