/**
 * Tests del nombre de las copias de seguridad de secuencias (host/common.jsx):
 * la etiqueta del momento del pipeline ("Pre-Marker" antes de mover marcadores,
 * "Pre-Cut" antes de cortar), el sello de fecha y el desempate cuando ya existe
 * una secuencia con ese nombre.
 *
 * common.jsx es ExtendScript (se carga por #include, no exporta nada), así que
 * lo evaluamos con un shim mínimo y devolvemos solo las funciones puras — igual
 * que mlx-parser.test.js con speech-to-text.js.
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

// ─── Cargar common.jsx sin Premiere ──────────────────────────
function loadCommon() {
    const src = fs.readFileSync(path.join(__dirname, "../host/common.jsx"), "utf8");
    const factory = new Function(
        src + "\nreturn {" +
        "  buildBackupName: buildBackupName," +
        "  backupDateStamp: backupDateStamp," +
        "  BACKUP_LABEL_MARKER: BACKUP_LABEL_MARKER," +
        "  BACKUP_LABEL_CUT: BACKUP_LABEL_CUT" +
        "};"
    );
    return factory();
}

/** isTaken a partir de una lista de nombres ya usados en el proyecto. */
function taken(names) {
    return function(name) { return names.indexOf(name) !== -1; };
}

function run() {
    passed = 0; failed = 0;
    const C = loadCommon();

    section("Etiquetas — tal cual las pidió el editor");
    assertEq(C.BACKUP_LABEL_MARKER, "Pre-Marker", "la copia previa a mover marcadores es Pre-Marker");
    assertEq(C.BACKUP_LABEL_CUT, "Pre-Cut", "la copia previa a cortar es Pre-Cut");

    section("backupDateStamp() — YYYY-MM-DD_HH-MM con ceros a la izquierda");
    assertEq(C.backupDateStamp(new Date(2026, 7, 11, 13, 5)), "2026-08-11_13-05", "mes/minuto con dos dígitos");
    assertEq(C.backupDateStamp(new Date(2026, 0, 2, 9, 30)), "2026-01-02_09-30", "día y hora con dos dígitos");

    section("buildBackupName() — etiqueta antes de la fecha");
    const stamp = "2026-08-11_13-05";
    assertEq(
        C.buildBackupName("Clase 3", C.BACKUP_LABEL_MARKER, stamp),
        "Clase 3_Backup_Pre-Marker_2026-08-11_13-05",
        "copia previa a mover marcadores"
    );
    assertEq(
        C.buildBackupName("Clase 3", C.BACKUP_LABEL_CUT, stamp),
        "Clase 3_Backup_Pre-Cut_2026-08-11_13-05",
        "copia previa a cortar"
    );

    section("buildBackupName() — sin etiqueta mantiene el formato viejo");
    assertEq(
        C.buildBackupName("Clase 3", "", stamp),
        "Clase 3_Backup_2026-08-11_13-05",
        "sin etiqueta no queda un separador suelto"
    );

    section("buildBackupName() — restoreBackup() sigue encontrando la copia por prefijo");
    // restoreBackup() cae a buscar por nombre cuando no tiene el sequenceID:
    // name.indexOf(originalName + "_Backup_") === 0
    const labels = [C.BACKUP_LABEL_MARKER, C.BACKUP_LABEL_CUT, ""];
    for (let i = 0; i < labels.length; i++) {
        const name = C.buildBackupName("Clase 3", labels[i], stamp);
        assertEq(name.indexOf("Clase 3_Backup_"), 0, "empieza con '<secuencia>_Backup_' (etiqueta: " + (labels[i] || "ninguna") + ")");
    }

    section("buildBackupName() — dos pasadas en el mismo minuto se numeran");
    const first = C.buildBackupName("Clase 3", C.BACKUP_LABEL_CUT, stamp, taken([]));
    assertEq(first, "Clase 3_Backup_Pre-Cut_2026-08-11_13-05", "la primera no lleva número");
    const second = C.buildBackupName("Clase 3", C.BACKUP_LABEL_CUT, stamp, taken([first]));
    assertEq(second, "Clase 3_Backup_Pre-Cut_2026-08-11_13-05_2", "la segunda es _2");
    const third = C.buildBackupName("Clase 3", C.BACKUP_LABEL_CUT, stamp, taken([first, second]));
    assertEq(third, "Clase 3_Backup_Pre-Cut_2026-08-11_13-05_3", "la tercera es _3");

    section("buildBackupName() — las dos etiquetas no se pisan entre sí");
    const marker = C.buildBackupName("Clase 3", C.BACKUP_LABEL_MARKER, stamp, taken([]));
    const cut = C.buildBackupName("Clase 3", C.BACKUP_LABEL_CUT, stamp, taken([marker]));
    assertEq(cut, "Clase 3_Backup_Pre-Cut_2026-08-11_13-05", "cortar en el mismo minuto no numera: la etiqueta ya las distingue");

    section("buildBackupName() — nombres de secuencia con caracteres raros");
    assertEq(
        C.buildBackupName("Clase 3 — final (v2)", C.BACKUP_LABEL_CUT, stamp),
        "Clase 3 — final (v2)_Backup_Pre-Cut_2026-08-11_13-05",
        "el nombre original se respeta tal cual"
    );

    console.log("\n" + passed + " OK, " + failed + " fallos");
    return { passed, failed };
}

module.exports = { run };
