/**
 * Tests de la detección de Whisper MLX (speech-to-text.js).
 *
 * El caso que los originó: un editor tenía `mlx_whisper` instalado por otra
 * herramienta —un `pip3 install mlx-whisper` con el Python de python.org, que
 * deja el CLI en /Library/Frameworks/Python.framework/Versions/<ver>/bin— y el
 * panel decía que no había Whisper local. Se buscaba solo en nuestro venv, en
 * ~/.local/bin y con `which`, y `which` no sirve de nada aquí: Premiere lanza el
 * panel con un PATH mínimo (/usr/bin:/bin), así que no ve ni Homebrew.
 *
 * Todo el entorno es de mentira (fs, child_process, PATH) para que el resultado
 * no dependa de lo que tenga instalada la máquina donde corren los tests.
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

const SRC = fs.readFileSync(path.join(__dirname, "../client/js/speech-to-text.js"), "utf8");
const HOME = "/Users/editor";

/**
 * Carga speech-to-text.js con un disco y un shell simulados.
 *
 * @param {Object} opts
 *   files      rutas que "existen" en el disco imaginario
 *   dirs       {ruta: [entradas]} para las carpetas que se enumeran
 *   shellFinds lo que responde `command -v mlx_whisper` en el shell de login
 *   pathFinds  lo que responde `which` (con el PATH enriquecido del panel)
 *   stored     contenido inicial de localStorage
 */
function loadSTT(opts) {
    opts = opts || {};
    const files = opts.files || [];
    const dirs = opts.dirs || {};
    const store = Object.assign({}, opts.stored || {});
    const calls = { which: 0, shell: 0, mdfind: 0, sysctl: 0, execFile: [] };

    const fakeFs = {
        existsSync: function(p) { return files.indexOf(p) !== -1; },
        readdirSync: function(p) {
            if (dirs[p]) return dirs[p].slice();
            const err = new Error("ENOENT: " + p);
            err.code = "ENOENT";
            throw err;
        },
        statSync: function(p) {
            if (files.indexOf(p) === -1) throw new Error("ENOENT: " + p);
            return { isFile: function() { return true; }, size: 1024 };
        },
        readFileSync: fs.readFileSync,
        writeFileSync: function() {},
        copyFileSync: function() {}
    };

    const fakeCp = {
        // `which` corre con el PATH del panel: solo encuentra lo que esté ahí.
        execSync: function(cmd) {
            if (cmd.indexOf("which mlx_whisper") !== -1) {
                calls.which++;
                if (opts.pathFinds) return opts.pathFinds + "\n";
                throw new Error("exit 1");
            }
            if (cmd.indexOf("hw.optional.arm64") !== -1) {
                calls.sysctl++;
                if (opts.appleSilicon === false) throw new Error("exit 1");
                return "1\n";
            }
            throw new Error("comando inesperado: " + cmd);
        },
        execFile: function(bin, args, o, cb) {
            calls.execFile.push({ bin: bin, args: args });
            cb(opts.osascriptFails ? new Error("osascript falló") : null, "", "");
        },
        // El shell de login, donde vive el PATH real del usuario.
        execFileSync: function(bin, args) {
            const cmd = (args || []).join(" ");
            if (cmd.indexOf("command -v mlx_whisper") !== -1) {
                calls.shell++;
                if (opts.shellFinds) return opts.shellFinds + "\n";
                throw new Error("exit 1");
            }
            throw new Error("comando inesperado: " + cmd);
        },
        exec: function(cmd, o, cb) {
            if (cmd.indexOf("mdfind -name mlx_whisper") !== -1) {
                calls.mdfind++;
                cb(null, (opts.mdfind || []).join("\n"));
                return;
            }
            cb(new Error("comando inesperado: " + cmd), "");
        },
        spawn: function() { return { on: function() {}, kill: function() {} }; }
    };

    const fakeRequire = function(name) {
        if (name === "fs") return fakeFs;
        if (name === "child_process") return fakeCp;
        return require(name);
    };

    const fakeProcess = {
        platform: "darwin",
        env: { HOME: HOME, PATH: "/usr/bin:/bin", SHELL: "/bin/zsh" }
    };
    const localStorage = {
        getItem: function(k) { return (k in store) ? store[k] : null; },
        setItem: function(k, v) { store[k] = String(v); },
        removeItem: function(k) { delete store[k]; }
    };

    // Los sondeos se ejecutan al momento: así el sondeo de la instalación se
    // puede probar sin esperas reales.
    const now = function(fn) { fn(); };

    const window = {};
    const factory = new Function("window", "localStorage", "require", "process", "Buffer", "console", "setTimeout",
        SRC + "\nreturn window;");
    const w = factory(window, localStorage, fakeRequire, fakeProcess, Buffer, console, now);
    const stt = new w.SpeechToText();
    if (opts.pluginDir) stt.setPluginDir(opts.pluginDir);
    return { STT: w.SpeechToText, stt: stt, calls: calls, store: store };
}

const OURS = HOME + "/.editorpro/mlx-whisper-venv/bin/mlx_whisper";
const PYORG = "/Library/Frameworks/Python.framework/Versions/3.13/bin/mlx_whisper";
const PYORG_DIRS = { "/Library/Frameworks/Python.framework/Versions": ["3.11", "3.13", "Current"] };

function run() {
    passed = 0; failed = 0;

    section("Nuestro propio venv (setup-mlx.sh)");
    let env = loadSTT({ files: [OURS] });
    assertEq(env.stt._findMlxWhisper().binary, OURS, "el venv del plugin se detecta");
    assertEq(env.calls.shell, 0, "y no hace falta molestar al shell de login");

    section("El caso real: instalado por otra herramienta con el Python de python.org");
    env = loadSTT({ files: [PYORG], dirs: PYORG_DIRS });
    assertEq(env.stt._findMlxWhisper().binary, PYORG, "se detecta en /Library/Frameworks/.../bin");
    let st = env.stt.getWhisperLocalStatus();
    assertEq(st.engine, "mlx", "el motor elegido es MLX");
    assertEq(st.ready, true, "y queda listo para transcribir");

    section("Otras formas de instalarlo que el PATH del panel no ve");
    env = loadSTT({ files: ["/opt/homebrew/bin/mlx_whisper"] });
    assertEq(env.stt._findMlxWhisper().binary, "/opt/homebrew/bin/mlx_whisper", "Homebrew");

    env = loadSTT({
        files: [HOME + "/Library/Python/3.11/bin/mlx_whisper"],
        dirs: { [HOME + "/Library/Python"]: ["3.9", "3.11"] }
    });
    assertEq(env.stt._findMlxWhisper().binary, HOME + "/Library/Python/3.11/bin/mlx_whisper",
        "pip3 install --user");

    env = loadSTT({ files: [HOME + "/.local/pipx/venvs/mlx-whisper/bin/mlx_whisper"] });
    assertEq(env.stt._findMlxWhisper().binary, HOME + "/.local/pipx/venvs/mlx-whisper/bin/mlx_whisper",
        "pipx");

    env = loadSTT({
        files: [HOME + "/miniforge3/envs/ml/bin/mlx_whisper"],
        dirs: { [HOME + "/miniforge3/envs"]: ["ml"] }
    });
    assertEq(env.stt._findMlxWhisper().binary, HOME + "/miniforge3/envs/ml/bin/mlx_whisper",
        "un entorno de conda/miniforge");

    section("Fuera de toda carpeta conocida: lo dice el shell de login");
    const ODD = "/opt/otra-herramienta/venv/bin/mlx_whisper";
    env = loadSTT({ files: [ODD], shellFinds: ODD });
    assertEq(env.stt._findMlxWhisper().binary, ODD, "el PATH real del usuario resuelve el resto");
    assertEq(env.calls.shell, 1, "se le pregunta una sola vez");

    section("El shell no puede inventarse una ruta");
    env = loadSTT({ files: [], shellFinds: "/ruta/que/ya/no/existe/mlx_whisper" });
    assertEq(env.stt._findMlxWhisper().binary, null,
        "si lo que responde el shell ya no está, no se usa");

    section("Sin MLX instalado");
    env = loadSTT({ files: [] });
    assertEq(env.stt._findMlxWhisper().binary, null, "no se inventa un binario");
    st = env.stt.getWhisperLocalStatus();
    assertEq(st.engine, null, "sin ningún motor, no se elige ninguno");
    assertEq(st.ready, false, "y el panel lo sabe");

    section("Lo averiguado se recuerda (el shell cuesta arrancar)");
    env = loadSTT({ files: [ODD], shellFinds: ODD });
    env.stt._findMlxWhisper();
    env.stt._findMlxWhisper();
    env.stt._findMlxWhisper();
    assertEq(env.calls.shell, 1, "tres lecturas, una sola consulta al shell");
    assertEq(env.store.editorpro_mlx_binary_auto, ODD, "y queda anotado para la próxima sesión");

    section("Una ruta recordada que ya no existe no bloquea la detección");
    env = loadSTT({
        files: [OURS],
        stored: { editorpro_mlx_binary_auto: "/se/desinstalo/mlx_whisper" }
    });
    assertEq(env.stt._findMlxWhisper().binary, OURS, "se ignora lo recordado y se vuelve a buscar");

    section("El override manual manda");
    env = loadSTT({
        files: [OURS, "/elegido/a/mano/mlx_whisper"],
        stored: { editorpro_mlx_binary: "/elegido/a/mano/mlx_whisper" }
    });
    assertEq(env.stt._findMlxWhisper().binary, "/elegido/a/mano/mlx_whisper",
        "lo que el editor eligió en Ajustes va primero");

    section("refreshMlxDetection() vuelve a mirar");
    env = loadSTT({ files: [] });
    assertEq(env.stt._findMlxWhisper().binary, null, "de entrada no hay nada");
    env.store.editorpro_mlx_binary = OURS;
    env.files = null;
    assertEq(env.stt._findMlxWhisper().binary, null, "sin refrescar, sigue la respuesta cacheada");

    section("Búsqueda profunda con Spotlight");
    const SITE = "/Library/Frameworks/Python.framework/Versions/3.13/lib/python3.13/site-packages/mlx_whisper";
    env = loadSTT({ files: [PYORG, SITE], dirs: PYORG_DIRS, mdfind: [SITE, PYORG] });
    let deepResult = "pendiente";
    env.stt.deepSearchMlxWhisper(function(found) { deepResult = found; });
    assertEq(deepResult, PYORG, "se queda con el CLI, no con la carpeta del paquete en site-packages");
    assertEq(env.store.editorpro_mlx_binary_auto, PYORG, "y lo recuerda");

    env = loadSTT({ files: [], mdfind: [] });
    deepResult = "pendiente";
    env.stt.deepSearchMlxWhisper(function(found) { deepResult = found; });
    assertEq(deepResult, null, "sin resultados devuelve null en vez de colgarse");

    // ─── Instalarlo cuando no aparece por ningún lado ───────────
    const PLUGIN = "/Applications/plugin/Editor-Pro";
    const SETUP = PLUGIN + "/whisper/setup-mlx.sh";

    section("isAppleSilicon() — no se le pregunta a process.arch");
    env = loadSTT({ files: [] });
    assertEq(env.stt.isAppleSilicon(), true, "lo dice sysctl, que no miente bajo Rosetta");
    env.stt.isAppleSilicon();
    assertEq(env.calls.sysctl, 1, "y se pregunta una sola vez");

    env = loadSTT({ files: [], appleSilicon: false });
    assertEq(env.stt.isAppleSilicon(), false, "en un Intel responde que no");

    section("El botón de instalar solo existe si tenemos con qué");
    env = loadSTT({ files: [], pluginDir: PLUGIN });
    assertEq(env.stt.mlxSetupScript(), null, "sin el script en el plugin, no hay instalador");
    env = loadSTT({ files: [SETUP], pluginDir: PLUGIN });
    assertEq(env.stt.mlxSetupScript(), SETUP, "con el script, se ofrece");

    section("installMlx() — abre Terminal con nuestro instalador");
    env = loadSTT({ files: [SETUP], pluginDir: PLUGIN });
    let installErr = "pendiente";
    env.stt.installMlx(function(err) { installErr = err; });
    assertEq(installErr, null, "sin error");
    assertEq(env.calls.execFile.length, 1, "se lanza osascript");
    assertEq(env.calls.execFile[0].bin, "osascript", "con osascript, no con un shell suelto");
    assert(env.calls.execFile[0].args.join(" ").indexOf(SETUP) !== -1,
        "y el comando corre nuestro setup-mlx.sh");

    env = loadSTT({ files: [SETUP], pluginDir: PLUGIN, appleSilicon: false });
    installErr = "pendiente";
    env.stt.installMlx(function(err) { installErr = err; });
    assert(installErr && installErr.indexOf("Apple Silicon") !== -1,
        "en un Intel se explica en vez de abrir una Terminal que va a fallar");
    assertEq(env.calls.execFile.length, 0, "y no se abre nada");

    env = loadSTT({ files: [], pluginDir: PLUGIN });
    installErr = "pendiente";
    env.stt.installMlx(function(err) { installErr = err; });
    assert(installErr && installErr.indexOf("setup-mlx.sh") !== -1, "sin el script se dice cuál falta");

    section("waitForMlx() — el panel se entera solo cuando termina");
    env = loadSTT({ files: [OURS] });
    let waitRes = "pendiente";
    env.stt.waitForMlx({}, function(err, found) { waitRes = err || found; });
    assertEq(waitRes, OURS, "en cuanto el binario está, se avisa con su ruta");

    env = loadSTT({ files: [] });
    waitRes = "pendiente";
    env.stt.waitForMlx({ timeoutMs: -1 }, function(err) { waitRes = err; });
    assert(typeof waitRes === "string" && waitRes.indexOf("Terminal") !== -1,
        "si se agota la espera, se manda a mirar la Terminal");

    return { passed: passed, failed: failed };
}

module.exports = { run: run };
