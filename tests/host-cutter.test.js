/**
 * Tests de host/cutter.jsx (executeCuts) con un Premiere de mentira.
 *
 * Premiere edita por frames: lo único que executeCuts le dice a la secuencia son
 * los puntos de entrada y salida de cada zona, y esos puntos tienen que caer en
 * la rejilla de frames. Si caen a mitad de frame, el extract ripplea una cantidad
 * no entera de frames y la unión queda con un hueco de un frame.
 *
 * El caso real es la clase 14 (ver CLAUDE.md, "El corte va al frame"): el hueco
 * salió en la unión del bloque 2 con el 3, la única brecha de esa clase cuyo IN
 * cae en un frame que redondeado al milisegundo queda ANTES del frame.
 *
 * Ejecutar con: node tests/run-node-tests.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const TC = require("../client/js/thecutter-core.js");

const TICKS_PER_SECOND = 254016000000;
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

// ─── Premiere de mentira ─────────────────────────────────────
//
// Solo lo que executeCuts toca: puntos de entrada/salida, QE con extract(), y
// un File en memoria para el JSON de zonas y el log.

function makeHost(ticksPerFrame, numFrames) {
    const files = {};
    const marks = [];      // [{inTicks, outTicks}] tal como los recibió Premiere
    const seqIn = { inPoint: null, outPoint: null };

    const videoTracks = { numTracks: 5 };
    for (let v = 0; v < videoTracks.numTracks; v++) {
        videoTracks[v] = { clips: { numItems: 1 }, setMute: function() {} };
    }
    const audioTracks = { numTracks: 2 };
    for (let a = 0; a < audioTracks.numTracks; a++) {
        audioTracks[a] = { clips: { numItems: 1 }, setMute: function() {} };
    }

    const seq = {
        name: "14_2607_bi-deep-research-ai",
        timebase: String(ticksPerFrame),
        end: String(numFrames * ticksPerFrame),
        zeroPoint: "0",
        videoTracks: videoTracks,
        audioTracks: audioTracks,
        setInPoint: function(t) { seqIn.inPoint = String(t); },
        setOutPoint: function(t) { seqIn.outPoint = String(t); },
        getSettings: function() {
            return { videoFrameRate: { seconds: ticksPerFrame / TICKS_PER_SECOND } };
        }
    };

    const qeTrack = { setLock: function() {} };
    const qeSeq = {
        name: seq.name,
        numVideoTracks: videoTracks.numTracks,
        numAudioTracks: audioTracks.numTracks,
        getVideoTrackAt: function() { return qeTrack; },
        getAudioTrackAt: function() { return qeTrack; },
        extract: function() {
            marks.push({ inTicks: seqIn.inPoint, outTicks: seqIn.outPoint });
        }
    };

    function File(p) {
        this.path = String(p);
        this.exists = Object.prototype.hasOwnProperty.call(files, this.path);
        this.encoding = "";
        this._buf = "";
        this._mode = "";
    }
    File.prototype.open = function(mode) { this._mode = mode; this._buf = ""; return true; };
    File.prototype.read = function() { return files[this.path]; };
    File.prototype.write = function(s) { this._buf += s; return true; };
    File.prototype.close = function() {
        if (this._mode === "w") files[this.path] = this._buf;
        return true;
    };

    const sandbox = {
        JSON: JSON,
        Math: Math,
        String: String,
        Array: Array,
        parseFloat: parseFloat,
        parseInt: parseInt,
        isNaN: isNaN,
        File: File,
        app: { enableQE: function() {}, project: { activeSequence: seq } },
        qe: { project: { getActiveSequence: function() { return qeSeq; } } },
        $: { sleep: function() {} }
    };
    vm.createContext(sandbox);
    for (const f of ["common.jsx", "cutter.jsx"]) {
        vm.runInContext(fs.readFileSync(path.join(HOST_DIR, f), "utf8"), sandbox, { filename: f });
    }

    return { sandbox: sandbox, files: files, marks: marks, seq: seq };
}

/** Corre executeCuts con esas zonas y devuelve los puntos que recibió Premiere. */
function runCuts(host, zones) {
    const jsonPath = "/tmp/test_cuts.json";
    host.files[jsonPath] = JSON.stringify({ removeZones: zones, seqName: host.seq.name });
    const result = JSON.parse(host.sandbox.executeCuts(jsonPath));
    return result;
}

// ─── La clase 14, en frames ──────────────────────────────────
//
// Los marcadores de una secuencia siempre caen clavados en un frame; estos son
// los de la corrida real (30 fps), tal como salieron en el log del corte.

const FPS = 30;
const TPF = TICKS_PER_SECOND / FPS;
const SEQ_FRAMES = 47583;
const CLASE_14 = [
    [2951, 4054], [6764, 7962], [8275, 10220], [12062, 12499], [15802, 17821],
    [18347, 21411], [26388, 27885], [39892, 42756], [44360, 44817], [45124, 47087]
];

function secondsOfFrame(frame) { return frame / FPS; }

/** Los bloques como los arma el panel: marcadores → pares → bloques → zonas. */
function zonesForClase14() {
    const pairs = CLASE_14.map(function(b, i) {
        return {
            inMarker: { startSeconds: secondsOfFrame(b[0]), comments: "PV -  bloque " + (i + 1), name: "" },
            outMarker: { startSeconds: secondsOfFrame(b[1]), comments: "OUT: fin", name: "" }
        };
    });
    return TC.buildRemoveZones(TC.blocksFromPairs(pairs), secondsOfFrame(SEQ_FRAMES));
}

/** Las brechas que el corte tiene que cerrar, en frames: OUT de un bloque → IN del siguiente. */
function expectedZoneFrames() {
    const out = [[0, CLASE_14[0][0]]];
    for (let i = 0; i < CLASE_14.length - 1; i++) out.push([CLASE_14[i][1], CLASE_14[i + 1][0]]);
    out.push([CLASE_14[CLASE_14.length - 1][1], SEQ_FRAMES]);
    return out;
}

function run() {
    passed = 0; failed = 0;

    section("executeCuts() — los puntos de corte caen en la rejilla de frames");
    const host = makeHost(TPF, SEQ_FRAMES);
    const zones = zonesForClase14();
    assertEq(zones.length, 11, "11 zonas (pre-inicio, 9 brechas y post-final)");

    const result = runCuts(host, zones);
    assert(!result.error, "executeCuts no falla: " + (result.error || ""));
    assertEq(host.marks.length, 11, "una extracción por zona");

    // executeCuts va de la última zona a la primera para que las anteriores no se
    // corran; para comparar hay que leerlas en el orden en que se calcularon.
    const marks = host.marks.slice().reverse();
    const expected = expectedZoneFrames();

    let offGrid = 0;
    for (let i = 0; i < marks.length; i++) {
        const inFrames = Number(marks[i].inTicks) / TPF;
        const outFrames = Number(marks[i].outTicks) / TPF;
        if (inFrames !== Math.round(inFrames) || outFrames !== Math.round(outFrames)) offGrid++;
    }
    assertEq(offGrid, 0, "ningún punto de entrada/salida cae a mitad de frame");

    let wrongSpan = [];
    for (let i = 0; i < marks.length; i++) {
        const span = (Number(marks[i].outTicks) - Number(marks[i].inTicks)) / TPF;
        const want = expected[i][1] - expected[i][0];
        if (span !== want) wrongSpan.push("zona " + i + ": " + span + " en vez de " + want);
    }
    assertEq(wrongSpan.length, 0, "cada zona quita exactamente los frames de su brecha — " + wrongSpan.join("; "));

    // El caso que reportó el editor: la brecha entre el bloque 2 y el 3. Su IN
    // (frame 8275) redondeado al milisegundo cae 0.01 frames ANTES del frame, y
    // sin volver a la rejilla Premiere cerraba un frame de menos: el hueco quedó
    // en 00:01:16:21 de la secuencia cortada.
    section("executeCuts() — la brecha del bloque 2 al 3 de la clase 14 no deja hueco");
    const brecha2 = marks[2];
    assertEq(Number(brecha2.inTicks), 7962 * TPF, "el IN de la brecha 2 es el frame del OUT del bloque 2");
    assertEq(Number(brecha2.outTicks), 8275 * TPF, "el OUT de la brecha 2 es el frame del IN del bloque 3");
    assertEq((Number(brecha2.outTicks) - Number(brecha2.inTicks)) / TPF, 313,
        "quita los 313 frames de la brecha, no 312");

    section("executeCuts() — 29.97 fps: el frame no dura un número redondo de ms");
    // A 29.97 ningún frame cae en un milisegundo exacto, así que el redondeo del
    // panel corre TODOS los puntos: si el snap dependiera del fps, se vería acá.
    const TPF2997 = TICKS_PER_SECOND * 1001 / 30000;
    const host2 = makeHost(TPF2997, 20000);
    const framesIn = [300, 301, 302, 1000, 1001, 4517, 9999];
    const zones2997 = framesIn.map(function(f, i) {
        const start = f * TPF2997 / TICKS_PER_SECOND;
        const end = (f + 50) * TPF2997 / TICKS_PER_SECOND;
        return {
            start: Math.round(start * 1000) / 1000,   // el redondeo que hace el panel
            end: Math.round(end * 1000) / 1000,
            label: "Brecha " + i
        };
    });
    runCuts(host2, zones2997);
    let bad2997 = 0;
    for (let i = 0; i < host2.marks.length; i++) {
        const m = host2.marks[i];
        const inF = Number(m.inTicks) / TPF2997;
        const span = (Number(m.outTicks) - Number(m.inTicks)) / TPF2997;
        if (inF !== Math.round(inF) || span !== 50) bad2997++;
    }
    assertEq(bad2997, 0, "los 7 puntos vuelven a su frame y quitan 50 frames cada uno");

    section("executeCuts() — sin timebase se corta igual (secuencia sin frame conocido)");
    const host3 = makeHost(TPF, SEQ_FRAMES);
    host3.seq.timebase = "";
    host3.seq.getSettings = function() { return null; };
    const r3 = runCuts(host3, [{ start: 10, end: 20, label: "Brecha 0" }]);
    assert(!r3.error, "no falla sin timebase: " + (r3.error || ""));
    assertEq(host3.marks.length, 1, "la zona se extrae igual");
    assertEq(Number(host3.marks[0].inTicks), Math.round(10 * TICKS_PER_SECOND), "cae al tick crudo");

    return { passed, failed };
}

module.exports = { run };
