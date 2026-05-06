// Editor-Pro — GitHub API-based auto-updater (no git required)
(function(global) {
    "use strict";

    var GITHUB_OWNER  = "DanielGutierrezB";
    var GITHUB_REPO   = "Editor-Pro";
    var GITHUB_BRANCH = "workspace-daniel";
    var LOG_PREFIX    = "[Editor-Pro Updater]";

    // Directories (relative to extension root) that must never be overwritten
    var PRESERVED_PREFIXES = [
        "motion-server/node_modules",
        "motion-render/node_modules",
        "motion-render/src/compositions",
        "motion-render/out",
        "node_modules",
        ".env"
    ];

    var _updateAvailable = false;
    var _originalBtnHTML = "";
    var _latestSha       = null;

    // ─── Logging ────────────────────────────────────────────────────────────────

    function _log(msg) {
        console.log(LOG_PREFIX + " " + msg);
    }

    // ─── Extension path ─────────────────────────────────────────────────────────

    function _getExtensionPath() {
        try {
            return global.csInterface.getSystemPath("extension");
        } catch(e) {
            _log("Cannot get extension path: " + e.message);
            return null;
        }
    }

    // ─── SHA persistence ────────────────────────────────────────────────────────

    function _readLocalSha() {
        try {
            var fs   = require("fs");
            var path = require("path");
            var ext  = _getExtensionPath();
            if (!ext) return null;
            var f = path.join(ext, ".update-sha");
            if (fs.existsSync(f)) return fs.readFileSync(f, "utf8").trim();
        } catch(e) {
            _log("Read .update-sha error: " + e.message);
        }
        return null;
    }

    function _writeLocalSha(sha) {
        try {
            var fs   = require("fs");
            var path = require("path");
            var ext  = _getExtensionPath();
            if (!ext) return;
            fs.writeFileSync(path.join(ext, ".update-sha"), sha, "utf8");
        } catch(e) {
            _log("Write .update-sha error: " + e.message);
        }
    }

    // ─── HTTPS helpers ──────────────────────────────────────────────────────────

    // GET a URL as a UTF-8 string, following up to 5 redirects.
    function _httpsGetText(url, redirectsLeft, callback) {
        if (redirectsLeft === undefined) redirectsLeft = 5;
        try {
            var https = require("https");
            var urlMod = require("url");
            var parsed = urlMod.parse(url);
            var opts = {
                hostname: parsed.hostname,
                port: parsed.port || 443,
                path: parsed.path,
                method: "GET",
                headers: {
                    "User-Agent": "Editor-Pro-Updater/1.0",
                    "Accept": "application/vnd.github.v3+json"
                }
            };
            var req = https.request(opts, function(res) {
                if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && redirectsLeft > 0) {
                    return _httpsGetText(res.headers.location, redirectsLeft - 1, callback);
                }
                var chunks = [];
                res.on("data", function(c) { chunks.push(c); });
                res.on("end", function() {
                    callback(null, Buffer.concat(chunks).toString("utf8"));
                });
                res.on("error", callback);
            });
            req.on("error", callback);
            req.end();
        } catch(e) {
            callback(e);
        }
    }

    // Download binary data to a file path, following up to 5 redirects.
    function _downloadToFile(url, destPath, redirectsLeft, callback) {
        if (redirectsLeft === undefined) redirectsLeft = 5;
        try {
            var https = require("https");
            var fs    = require("fs");
            var urlMod = require("url");
            var parsed = urlMod.parse(url);
            var opts = {
                hostname: parsed.hostname,
                port: parsed.port || 443,
                path: parsed.path,
                method: "GET",
                headers: { "User-Agent": "Editor-Pro-Updater/1.0" }
            };
            var req = https.request(opts, function(res) {
                if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && redirectsLeft > 0) {
                    return _downloadToFile(res.headers.location, destPath, redirectsLeft - 1, callback);
                }
                var out = fs.createWriteStream(destPath);
                res.pipe(out);
                out.on("finish", function() {
                    out.close(function() { callback(null); });
                });
                out.on("error", function(e) {
                    fs.unlink(destPath, function() {});
                    callback(e);
                });
                res.on("error", function(e) {
                    fs.unlink(destPath, function() {});
                    callback(e);
                });
            });
            req.on("error", callback);
            req.end();
        } catch(e) {
            callback(e);
        }
    }

    // ─── Preservation check ─────────────────────────────────────────────────────

    function _isPreserved(relPath) {
        var norm = relPath.replace(/\\/g, "/");
        for (var i = 0; i < PRESERVED_PREFIXES.length; i++) {
            var p = PRESERVED_PREFIXES[i];
            if (norm === p || norm.indexOf(p + "/") === 0) return true;
        }
        return false;
    }

    // ─── Recursive synchronous copy ─────────────────────────────────────────────

    function _copyDirSync(srcDir, destDir, relBase) {
        var fs   = require("fs");
        var path = require("path");
        var items;
        try { items = fs.readdirSync(srcDir); } catch(e) {
            _log("Cannot read dir " + srcDir + ": " + e.message);
            return;
        }
        items.forEach(function(item) {
            var rel  = relBase ? relBase + "/" + item : item;
            if (_isPreserved(rel)) {
                _log("Preserving: " + rel);
                return;
            }
            var src  = path.join(srcDir, item);
            var dest = path.join(destDir, item);
            var stat;
            // lstatSync instead of statSync: do NOT follow symlinks — skip them to
            // prevent a malicious ZIP from using symlinks to read/copy files outside
            // the extension directory.
            try { stat = fs.lstatSync(src); } catch(e) { return; }
            if (stat.isSymbolicLink()) {
                _log("Skipping symlink: " + rel);
                return;
            }
            if (stat.isDirectory()) {
                try {
                    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
                } catch(e) { _log("mkdir failed " + rel + ": " + e.message); return; }
                _copyDirSync(src, dest, rel);
            } else {
                try { fs.copyFileSync(src, dest); } catch(e) {
                    _log("Copy failed " + rel + ": " + e.message);
                }
            }
        });
    }

    // ─── Temp-dir cleanup ───────────────────────────────────────────────────────

    function _cleanupTemp(zipPath, extractDir) {
        var fs = require("fs");
        try { fs.unlinkSync(zipPath); } catch(_) {}
        try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch(_) {}
    }

    // ─── ZIP extraction ─────────────────────────────────────────────────────────

    function _extractZip(zipPath, extractDir, callback) {
        var fs  = require("fs");
        var cp  = require("child_process");
        var isWin = process.platform === "win32";

        try { fs.mkdirSync(extractDir, { recursive: true }); } catch(e) {
            return callback(new Error("mkdirSync failed: " + e.message));
        }

        if (isWin) {
            // PowerShell Expand-Archive (available on Windows 10+)
            cp.execFile("powershell", [
                "-NoProfile", "-NonInteractive", "-Command",
                "Expand-Archive -LiteralPath '" + zipPath.replace(/'/g, "''") + "' -DestinationPath '" + extractDir.replace(/'/g, "''") + "' -Force"
            ], { timeout: 120000 }, function(err, stdout, stderr) {
                if (err) return callback(new Error("Extraction failed: " + (stderr || err.message)));
                callback(null);
            });
        } else {
            cp.execFile("unzip", ["-q", zipPath, "-d", extractDir], { timeout: 120000 }, function(err, stdout, stderr) {
                if (err) return callback(new Error("Extraction failed: " + (stderr || err.message)));
                callback(null);
            });
        }
    }

    // ─── Apply extracted ZIP to extension root ──────────────────────────────────

    function _applyExtraction(extractDir, sha, callback) {
        var fs   = require("fs");
        var path = require("path");

        // GitHub ZIP contains a single root folder: Owner-Repo-<sha7>/
        var entries;
        try { entries = fs.readdirSync(extractDir); } catch(e) {
            return callback(new Error("Cannot read extract dir: " + e.message));
        }

        var extractedRoot = null;
        for (var i = 0; i < entries.length; i++) {
            var candidate = path.join(extractDir, entries[i]);
            try {
                if (fs.statSync(candidate).isDirectory()) { extractedRoot = candidate; break; }
            } catch(_) {}
        }
        if (!extractedRoot) return callback(new Error("No root folder found in ZIP"));

        _log("Extracted root: " + extractedRoot);

        var extPath = _getExtensionPath();
        if (!extPath) return callback(new Error("Cannot get extension path"));

        try {
            _copyDirSync(extractedRoot, extPath, "");
        } catch(e) {
            return callback(new Error("Copy failed: " + e.message));
        }

        _writeLocalSha(sha);
        _log("Update applied: " + sha.substr(0, 7));
        callback(null);
    }

    // ─── Update button UI ───────────────────────────────────────────────────────

    function _setBtn(html, title, cssText, disabled) {
        var btn = document.getElementById("btn-reload");
        if (!btn) return;
        if (html !== undefined)    btn.innerHTML = html;
        if (title !== undefined)   btn.title = title;
        if (cssText !== undefined) btn.style.cssText = cssText;
        if (disabled !== undefined) btn.disabled = disabled;
    }

    function _restoreBtn() {
        var btn = document.getElementById("btn-reload");
        if (!btn) return;
        btn.innerHTML = _originalBtnHTML || btn.innerHTML;
        btn.title = "Recargar panel (verifica updates)";
        btn.style.cssText = "";
        btn.disabled = false;
    }

    // ─── Public: checkForUpdates ────────────────────────────────────────────────

    function checkForUpdates() {
        try {
            var localSha = _readLocalSha();
            var apiUrl = "https://api.github.com/repos/" + GITHUB_OWNER + "/" + GITHUB_REPO + "/commits/" + GITHUB_BRANCH;

            _httpsGetText(apiUrl, 5, function(err, body) {
                if (err) { _log("Check failed: " + err.message); return; }
                try {
                    var data = JSON.parse(body);
                    var remoteSha = data.sha;
                    if (!remoteSha) { _log("No SHA in response"); return; }

                    _latestSha = remoteSha;

                    if (!localSha || localSha !== remoteSha) {
                        _log("Update available: " + remoteSha.substr(0, 7) + (localSha ? " (local: " + localSha.substr(0, 7) + ")" : " (no local SHA)"));
                        _updateAvailable = true;
                        var btn = document.getElementById("btn-reload");
                        if (btn) {
                            _originalBtnHTML = btn.innerHTML;
                            btn.style.cssText = "background:#0ae98d;color:#1a1d23;border-radius:6px;padding:3px 8px;font-size:10px;font-weight:700;animation:pulse-update 1.5s infinite;white-space:nowrap;";
                            btn.innerHTML = "⬇";
                            btn.title = "Hay una actualización disponible — click para actualizar";
                        }
                    } else {
                        _log("Up to date: " + remoteSha.substr(0, 7));
                    }
                } catch(e) {
                    _log("Parse error: " + e.message);
                }
            });
        } catch(e) {
            _log("Unexpected error: " + e.message);
        }
    }

    // ─── Public: doUpdate ───────────────────────────────────────────────────────
    // Returns true if update download started, false if no update (caller should do plain reload).

    function doUpdate() {
        if (!_latestSha || !_updateAvailable) return false;

        var sha = _latestSha;
        var os   = require("os");
        var path = require("path");
        var zipPath    = path.join(os.tmpdir(), "editor-pro-update-" + Date.now() + ".zip");
        var extractDir = path.join(os.tmpdir(), "editor-pro-extract-" + Date.now());
        var zipUrl = "https://api.github.com/repos/" + GITHUB_OWNER + "/" + GITHUB_REPO + "/zipball/" + GITHUB_BRANCH;

        _setBtn("⬇️", "Descargando update...", "", true);
        _log("Downloading ZIP from " + zipUrl);

        _downloadToFile(zipUrl, zipPath, 5, function(dlErr) {
            if (dlErr) {
                _log("Download failed: " + dlErr.message);
                _setBtn("❌", "Error descargando: " + dlErr.message, "", false);
                setTimeout(_restoreBtn, 3500);
                return;
            }

            _log("Download complete. Extracting...");
            _setBtn("📦", "Instalando update...", "", true);

            _extractZip(zipPath, extractDir, function(exErr) {
                if (exErr) {
                    _log("Extract failed: " + exErr.message);
                    _cleanupTemp(zipPath, extractDir);
                    _setBtn("❌", "Error extrayendo: " + exErr.message, "", false);
                    setTimeout(_restoreBtn, 3500);
                    return;
                }

                _applyExtraction(extractDir, sha, function(applyErr) {
                    _cleanupTemp(zipPath, extractDir);
                    if (applyErr) {
                        _log("Apply failed: " + applyErr.message);
                        _setBtn("❌", "Error aplicando: " + applyErr.message, "", false);
                        setTimeout(_restoreBtn, 3500);
                        return;
                    }

                    _setBtn("✅", "¡Actualizado! Recargando...", "", true);

                    // Stop motion-server before reload if running
                    try {
                        if (global._epMotionPro && typeof global._epMotionPro.stopServer === "function") {
                            global._epMotionPro.stopServer(function() { location.reload(); });
                            setTimeout(function() { location.reload(); }, 2000);
                            return;
                        }
                    } catch(_) {}
                    setTimeout(function() { location.reload(); }, 800);
                });
            });
        });

        return true;
    }

    // ─── Expose ─────────────────────────────────────────────────────────────────

    global.EPUpdater = {
        checkForUpdates:   checkForUpdates,
        doUpdate:          doUpdate,
        isUpdateAvailable: function() { return _updateAvailable; }
    };

})(window);
