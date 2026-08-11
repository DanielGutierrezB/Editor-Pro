/**
 * claude-code.js — Sesión de Claude vía el CLI de Claude Code instalado en la Mac.
 *
 * Permite usar el plan de Claude del usuario (login con la cuenta, no API key):
 * el CLI guarda la sesión y aquí solo lo invocamos en modo no interactivo
 * (`claude -p --output-format json`).
 *
 * Expone window.EPClaudeCode:
 *   findBinary(force)      → ruta del CLI o "" si no está instalado
 *   status(cb)             → cb(err, {loggedIn, email, orgName, ...})
 *   login(cb)              → abre Terminal con `claude auth login` (OAuth en el navegador)
 *   logout(cb)
 *   prompt(opts, cb)       → cb(err, stdoutJson); devuelve {abort} para cancelar
 *   models()               → alias de modelos (siempre apuntan al último de cada familia)
 */
(function(global) {
    "use strict";

    var cp, fs, pathMod, os;
    try { cp = require("child_process"); } catch (e) { cp = null; }
    try { fs = require("fs"); } catch (e) { fs = null; }
    try { pathMod = require("path"); } catch (e) { pathMod = null; }
    try { os = require("os"); } catch (e) { os = null; }

    var BIN_OVERRIDE_KEY = "editorpro_claude_binary";
    var STATUS_TIMEOUT_MS = 20000;
    var MAX_PROMPT_TIMEOUT_MS = 8 * 60 * 1000;

    /**
     * Alias del CLI: "sonnet"/"opus"/"haiku" resuelven siempre al último modelo
     * de esa familia, así que la lista no se queda desactualizada al salir un
     * modelo nuevo.
     */
    var MODEL_ALIASES = [
        { id: "default", label: "Predeterminado de tu plan" },
        { id: "sonnet", label: "Sonnet (último, recomendado)" },
        { id: "opus", label: "Opus (último, máxima calidad)" },
        { id: "haiku", label: "Haiku (último, rápido)" }
    ];

    /** Herramientas de agente: en el panel solo queremos texto de vuelta. */
    var DISALLOWED_TOOLS = [
        "Bash", "Edit", "Write", "Read", "NotebookEdit",
        "Glob", "Grep", "WebFetch", "WebSearch", "Task", "TodoWrite"
    ];

    var _binCache = null;

    function log(action, msg) {
        if (global.EPLogger) global.EPLogger.log("claude-code", action, msg);
    }

    function isExecutable(p) {
        if (!p || !fs) return false;
        try { return fs.statSync(p).isFile(); } catch (e) { return false; }
    }

    /** El entorno del proceso: en CEP vive en window.process, en Node es global. */
    function procEnv() {
        try { if (typeof process !== "undefined" && process.env) return process.env; } catch (e) {}
        try { if (global.process && global.process.env) return global.process.env; } catch (e) {}
        return {};
    }

    function homeDir() {
        if (os && os.homedir) { try { return os.homedir(); } catch (e) {} }
        return procEnv().HOME || "";
    }

    function candidatePaths() {
        var home = homeDir();
        var list = [];
        var override = null;
        try { override = localStorage.getItem(BIN_OVERRIDE_KEY); } catch (e) {}
        if (override) list.push(override);
        if (home) {
            list.push(home + "/.local/bin/claude");
            list.push(home + "/.claude/local/claude");
            list.push(home + "/.bun/bin/claude");
            list.push(home + "/.npm-global/bin/claude");
        }
        list.push("/opt/homebrew/bin/claude");
        list.push("/usr/local/bin/claude");
        list.push("/usr/bin/claude");
        return list;
    }

    /**
     * CEP hereda un PATH mínimo, así que además de las rutas típicas se consulta
     * el shell de login del usuario (donde vive el PATH real).
     */
    function findViaShell() {
        if (!cp) return "";
        var shell = procEnv().SHELL || "/bin/zsh";
        try {
            var out = cp.execFileSync(shell, ["-lc", "command -v claude"], {
                encoding: "utf8", timeout: 8000
            });
            var p = String(out || "").split("\n")[0].trim();
            if (isExecutable(p)) return p;
        } catch (e) {}
        return "";
    }

    function findBinary(force) {
        if (_binCache !== null && !force) return _binCache;
        _binCache = "";
        var list = candidatePaths();
        for (var i = 0; i < list.length; i++) {
            if (isExecutable(list[i])) { _binCache = list[i]; break; }
        }
        if (!_binCache) _binCache = findViaShell();
        log("find-binary", _binCache || "no encontrado");
        return _binCache;
    }

    function setBinary(p) {
        try {
            if (p) localStorage.setItem(BIN_OVERRIDE_KEY, p);
            else localStorage.removeItem(BIN_OVERRIDE_KEY);
        } catch (e) {}
        _binCache = null;
        return findBinary(true);
    }

    function isInstalled() {
        return !!findBinary();
    }

    /**
     * Entorno para el CLI. Se quitan ANTHROPIC_API_KEY/AUTH_TOKEN: si están
     * puestas (y vencidas) el CLI las prefiere sobre la sesión del login y
     * devuelve 401 aunque el usuario esté conectado.
     */
    function childEnv() {
        var env = {};
        var src = procEnv();
        for (var k in src) { if (src.hasOwnProperty(k)) env[k] = src[k]; }
        delete env.ANTHROPIC_API_KEY;
        delete env.ANTHROPIC_AUTH_TOKEN;
        // El panel corre dentro de un runtime tipo Electron; estas variables
        // heredadas cambian cómo arranca el `node` del CLI.
        delete env.ELECTRON_RUN_AS_NODE;
        delete env.NODE_OPTIONS;
        delete env.NODE_PATH;
        env.CLAUDE_CODE_ENTRYPOINT = "editor-pro";
        // El PATH que hereda CEP es mínimo y el `claude` real es un script con
        // shebang `env node`: sin PATH ni HOME el hijo no arranca ni encuentra la
        // sesión, así que se garantizan ambos.
        var home = homeDir();
        if (home) env.HOME = env.HOME || home;
        var extraPath = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
        if (home) extraPath = home + "/.local/bin:" + home + "/.bun/bin:" + extraPath;
        env.PATH = env.PATH ? (env.PATH + ":" + extraPath) : extraPath;
        return env;
    }

    /** Directorio neutro: evita cargar el CLAUDE.md o .mcp.json de un proyecto. */
    function neutralCwd() {
        if (os && os.tmpdir) { try { return os.tmpdir(); } catch (e) {} }
        return "/tmp";
    }

    function runCli(args, timeoutMs, cb) {
        var bin = findBinary();
        if (!bin) {
            cb("Claude Code no está instalado. Instálalo con: npm install -g @anthropic-ai/claude-code");
            return null;
        }
        if (!cp) { cb("child_process no disponible"); return null; }
        try {
            return cp.execFile(bin, args, {
                encoding: "utf8",
                timeout: timeoutMs || STATUS_TIMEOUT_MS,
                maxBuffer: 8 * 1024 * 1024,
                cwd: neutralCwd(),
                env: childEnv()
            }, function(err, stdout, stderr) {
                if (err && !stdout) {
                    cb(String((stderr || err.message || "").trim() || "Error al ejecutar el CLI de Claude"));
                    return;
                }
                cb(null, String(stdout || ""), String(stderr || ""));
            });
        } catch (e) {
            cb(e.message);
            return null;
        }
    }

    // ─── Sesión ──────────────────────────────────────────────────

    /** cb(err, {loggedIn, email, orgName, authMethod, apiKeySource, subscriptionType}) */
    function status(cb) {
        runCli(["auth", "status", "--json"], STATUS_TIMEOUT_MS, function(err, stdout) {
            if (err) { cb(err); return; }
            var data = null;
            try {
                var raw = String(stdout || "");
                var first = raw.indexOf("{");
                var last = raw.lastIndexOf("}");
                if (first !== -1 && last > first) data = JSON.parse(raw.slice(first, last + 1));
            } catch (e) {}
            if (!data) { cb("No se pudo leer el estado de sesión de Claude Code"); return; }
            cb(null, {
                loggedIn: !!data.loggedIn,
                email: data.email || "",
                orgName: data.orgName || "",
                authMethod: data.authMethod || "",
                apiKeySource: data.apiKeySource || "",
                subscriptionType: data.subscriptionType || ""
            });
        });
    }

    /**
     * El login es OAuth en el navegador y necesita una terminal interactiva, así
     * que se abre Terminal.app con el comando. El panel puede quedar sondeando
     * status() para enterarse solo cuando termine.
     */
    function login(cb) {
        var bin = findBinary();
        if (!bin) {
            cb("Claude Code no está instalado. Instálalo con: npm install -g @anthropic-ai/claude-code");
            return;
        }
        if (!cp) { cb("child_process no disponible"); return; }
        var cmd = "clear; '" + bin.replace(/'/g, "'\\''") + "' auth login";
        var script = 'tell application "Terminal"\nactivate\ndo script "' +
            cmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"\nend tell';
        try {
            cp.execFile("osascript", ["-e", script], { timeout: 15000 }, function(err, stdout, stderr) {
                if (err) { cb(String(stderr || err.message)); return; }
                log("login", "Terminal abierta para el login");
                cb(null);
            });
        } catch (e) {
            cb(e.message);
        }
    }

    function logout(cb) {
        runCli(["auth", "logout"], STATUS_TIMEOUT_MS, function(err) {
            cb(err || null);
        });
    }

    /**
     * Sondea el estado hasta que el usuario termine el login en el navegador.
     * onUpdate(status) se llama en cada intento con éxito.
     */
    function waitForLogin(opts, onDone) {
        opts = opts || {};
        var everyMs = opts.everyMs || 3000;
        var timeoutMs = opts.timeoutMs || 180000;
        var started = Date.now();
        var cancelled = false;

        function tick() {
            if (cancelled) return;
            status(function(err, st) {
                if (cancelled) return;
                if (!err && st && st.loggedIn) { onDone(null, st); return; }
                if (Date.now() - started >= timeoutMs) {
                    onDone("Se agotó la espera del login (3 min).");
                    return;
                }
                setTimeout(tick, everyMs);
            });
        }
        setTimeout(tick, everyMs);
        return { cancel: function() { cancelled = true; } };
    }

    // ─── Prompt no interactivo ───────────────────────────────────

    /**
     * opts: {system, prompt, model, timeoutMs, onWait(segundos)}
     * cb(err, stdoutJson) — stdoutJson es la salida `--output-format json` del CLI.
     * `onWait` se llama cada segundo mientras se espera: sin eso una llamada lenta
     * no se distingue de un cuelgue.
     * Devuelve {abort} para cancelar.
     */
    function shq(s) {
        return "'" + String(s).replace(/'/g, "'\\''") + "'";
    }

    function tempFile(tag, content) {
        if (!fs) return null;
        var p = neutralCwd() + "/editorpro_cc_" + tag + "_" + Date.now() + "_" +
            Math.floor(Math.random() * 100000) + ".txt";
        try {
            fs.writeFileSync(p, String(content == null ? "" : content), "utf8");
            return p;
        } catch (e) { return null; }
    }

    function removeTemp(p) {
        if (!p || !fs) return;
        try { fs.unlinkSync(p); } catch (e) {}
    }

    function promptCli(opts, cb) {
        opts = opts || {};
        var bin = findBinary();
        if (!bin) {
            cb("Claude Code no está instalado o no se encontró el binario `claude`.");
            return { abort: function() {} };
        }
        if (!cp) { cb("child_process no disponible"); return { abort: function() {} }; }
        if (!fs) { cb("El módulo fs no está disponible en el panel"); return { abort: function() {} }; }

        // Prompt y system van por ARCHIVO, no por stdin ni por argumento: una
        // transcripción no cabe en un argumento y escribirle al stdin del hijo
        // desde CEP no es de fiar. La redirección la hace el shell de exec, que
        // es el mismo patrón que ya usan whisper y ffmpeg en este panel.
        var promptPath = tempFile("prompt", opts.prompt || "");
        var sysPath = opts.system ? tempFile("sys", opts.system) : null;
        if (!promptPath || (opts.system && !sysPath)) {
            removeTemp(promptPath);
            removeTemp(sysPath);
            cb("No se pudo escribir el prompt en un archivo temporal");
            return { abort: function() {} };
        }

        var model = opts.model && opts.model !== "default" ? opts.model : "";
        var cmd = shq(bin) + " -p --output-format json --strict-mcp-config --no-session-persistence";
        if (model) cmd += " --model " + shq(model);
        if (sysPath) cmd += " --system-prompt-file " + shq(sysPath);
        cmd += " --disallowed-tools " + DISALLOWED_TOOLS.map(shq).join(" ");
        cmd += " < " + shq(promptPath);

        var done = false, timer = null, ticker = null, child = null;
        var t0 = Date.now();
        log("prompt", "exec model=" + (model || "default") + " promptLen=" + String(opts.prompt || "").length);

        function finish(err, data) {
            if (done) return;
            done = true;
            if (timer) { try { clearTimeout(timer); } catch (e) {} timer = null; }
            if (ticker) { try { clearInterval(ticker); } catch (e) {} ticker = null; }
            removeTemp(promptPath);
            removeTemp(sysPath);
            var secs = ((Date.now() - t0) / 1000).toFixed(1);
            log("prompt", (err ? "error tras " + secs + "s: " + err : "ok en " + secs + "s"));
            cb(err, data);
        }

        if (opts.onWait) {
            ticker = setInterval(function() {
                try { opts.onWait(Math.round((Date.now() - t0) / 1000)); } catch (e) {}
            }, 1000);
        }

        // Ante una sesión caída el CLI reintenta ~3 min antes de rendirse; con un
        // tope propio el panel no se queda esperando tanto. Siempre hay tope, para
        // que ninguna llamada pueda dejar la UI esperando para siempre.
        var tmo = opts.timeoutMs || MAX_PROMPT_TIMEOUT_MS;
        timer = setTimeout(function() {
            try { if (child) child.kill("SIGTERM"); } catch (e) {}
            finish("Claude no contestó en " + Math.round(tmo / 1000) +
                "s. Casi siempre es la sesión caducada (el CLI reintenta en silencio " +
                "ante un 401): pulsa \"Iniciar sesión\" y vuelve a probar.");
        }, tmo);

        try {
            child = cp.exec(cmd, {
                encoding: "utf8",
                maxBuffer: 16 * 1024 * 1024,
                cwd: neutralCwd(),
                env: childEnv()
            }, function(err, stdout, stderr) {
                var out = String(stdout || "");
                if (out.indexOf("{") !== -1) { finish(null, out); return; }
                var msg = String(stderr || "").trim() || (err ? err.message : "");
                finish(msg || "Claude Code no devolvió respuesta.");
            });
        } catch (e) {
            finish("No se pudo ejecutar Claude Code: " + e.message);
        }

        return {
            abort: function() {
                try { if (child) child.kill("SIGTERM"); } catch (e) {}
            }
        };
    }

    function models() {
        return MODEL_ALIASES.slice(0);
    }

    global.EPClaudeCode = {
        findBinary: findBinary,
        setBinary: setBinary,
        isInstalled: isInstalled,
        status: status,
        login: login,
        logout: logout,
        waitForLogin: waitForLogin,
        prompt: promptCli,
        models: models,
        MODEL_ALIASES: MODEL_ALIASES
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = global.EPClaudeCode;
    }

})(typeof window !== "undefined" ? window : this);
