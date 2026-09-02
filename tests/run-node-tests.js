/**
 * Runner de tests Node para los módulos puros de Editor-Pro
 * (validador de cortes y revisor de marcadores).
 *
 * Uso: node tests/run-node-tests.js
 */
"use strict";

const suites = [
    { name: "cut-validator", mod: require("./cut-validator.test.js") },
    { name: "marker-reviewer", mod: require("./marker-reviewer.test.js") },
    { name: "mlx-parser", mod: require("./mlx-parser.test.js") },
    { name: "transcript-edit", mod: require("./transcript-edit.test.js") },
    { name: "transcript-repeats", mod: require("./transcript-repeats.test.js") },
    { name: "thecutter-core", mod: require("./thecutter-core.test.js") },
    { name: "host-cutter", mod: require("./host-cutter.test.js") },
    { name: "host-markers", mod: require("./host-markers.test.js") },
    { name: "backup-name", mod: require("./backup-name.test.js") },
    { name: "updater-version", mod: require("./updater-version.test.js") },
    { name: "marker-precision", mod: require("./marker-precision.test.js") },
    { name: "marker-anchor", mod: require("./marker-anchor.test.js") },
    { name: "audio-onset", mod: require("./audio-onset.test.js") },
    { name: "marker-verify", mod: require("./marker-verify.test.js") }
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
