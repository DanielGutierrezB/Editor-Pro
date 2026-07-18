/**
 * Runner de tests Node para los módulos puros de Editor-Pro
 * (motor de cortes XML y validador de cortes).
 *
 * Uso: node tests/run-node-tests.js
 */
"use strict";

const suites = [
    { name: "xml-cut-engine", mod: require("./xml-engine.test.js") },
    { name: "cut-validator", mod: require("./cut-validator.test.js") }
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
