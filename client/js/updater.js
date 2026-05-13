// Editor-Pro — GitHub API-based auto-updater (no git required)
(function(global) {
    "use strict";

    var GITHUB_OWNER  = "DanielGutierrezB";
    var GITHUB_REPO   = "Editor-Pro";
    var LOG_PREFIX    = "[Editor-Pro Updater]";

    // Read update channel from .update-channel file, default to "main"
    var GITHUB_BRANCH = (function() {
        try {
            var _fs = require("fs");
            var _path = require("path");
            var _cs = new CSInterface();
            var _ext = _cs.getSystemPath("extension");
            var _chFile = _path.join(_ext, ".update-channel");
            if (_fs.existsSync(_chFile)) {
                var ch = _fs.readFileSync(_chFile, "utf8").trim();
                if (ch) return ch;
            }
        } catch(_) {}
        return "main";
    })();

    // Directories (relative to extension root) that must never be overwritten
    var PRESERVED_PREFIXES = [
        "motion-server/node_modules",
        "motion-render/node_modules",
        "motion-render/src/compositions",
        "motion-render/out",
        "node_modules",
        "mogrts",
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
        var raw = null;
        try {
            // Try global csInterface first
            if (global.csInterface) {
                raw = global.csInterface.getSystemPath(SystemPath.EXTENSION) ||
                      global.csInterface.getSystemPath("extension");
            }
            // Fallback: create a fresh instance
            if (!raw) {
                var csi = new CSInterface();
                raw = csi.getSystemPath(SystemPath.EXTENSION) ||
                      csi.getSystemPath("extension");
            }
        } catch(e) {
            _log("CSInterface path error: " + e.message);
        }
        if (raw) {
            // Strip file:/// prefix (Windows CSInterface quirk)
            raw = raw.replace(/^file:\/{0,3}/, "");
            try { raw = decodeURIComponent(raw); } catch(_) {}
            return raw;
        }
        // Last resort: derive from script location
        try {
            var path = require("path");
            return path.resolve(__dirname, "..", "..");
        } catch(e2) {
            _log("Fallback path also failed: " + e2.message);
        }
        return null;
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
            if (!ext) { _log("Write .update-sha: no extension path"); return false; }
            var shaFile = path.join(ext, ".update-sha");
            fs.writeFileSync(shaFile, sha, "utf8");
            // Verify the write actually persisted (Windows permission issues)
            var verify = fs.readFileSync(shaFile, "utf8").trim();
            if (verify !== sha) {
                _log("Write .update-sha: verify mismatch! wrote=" + sha.substr(0,7) + " read=" + verify.substr(0,7));
                return false;
            }
            return true;
        } catch(e) {
            _log("Write .update-sha error: " + e.message);
            return false;
        }
    }

    function _readLocalVersion() {
        try {
            var fs   = require("fs");
            var path = require("path");
            var ext  = _getExtensionPath();
            if (!ext) return null;
            var f = path.join(ext, "VERSION");
            if (fs.existsSync(f)) return fs.readFileSync(f, "utf8").trim();
        } catch(e) {
            _log("Read VERSION error: " + e.message);
        }
        return null;
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
    // Includes a 120s timeout to prevent hanging.
    function _downloadToFile(url, destPath, redirectsLeft, callback) {
        if (redirectsLeft === undefined) redirectsLeft = 5;
        var _called = false;
        function _cb(err, result) {
            if (_called) return;
            _called = true;
            callback(err, result);
        }
        try {
            var https = require("https");
            var http  = require("http");
            var fs    = require("fs");
            var urlMod = require("url");
            var parsed = urlMod.parse(url);
            var httpMod = (parsed.protocol === "http:") ? http : https;
            var opts = {
                hostname: parsed.hostname,
                port: parsed.port || (parsed.protocol === "http:" ? 80 : 443),
                path: parsed.path,
                method: "GET",
                headers: { "User-Agent": "Editor-Pro-Updater/1.0" },
                timeout: 120000
            };
            _log("Download: " + parsed.hostname + parsed.path);
            var req = httpMod.request(opts, function(res) {
                _log("Download response: HTTP " + res.statusCode);
                if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && redirectsLeft > 0) {
                    return _downloadToFile(res.headers.location, destPath, redirectsLeft - 1, _cb);
                }
                if (res.statusCode !== 200) {
                    return _cb(new Error("HTTP " + res.statusCode));
                }
                var totalSize = parseInt(res.headers["content-length"]) || 0;
                var downloaded = 0;
                var out = fs.createWriteStream(destPath);
                res.on("data", function(chunk) {
                    downloaded += chunk.length;
                    if (totalSize > 0) {
                        var pct = Math.round(downloaded / totalSize * 100);
                        _setBtn("⬇ " + pct + "%", "Descargando: " + pct + "%");
                    }
                });
                res.pipe(out);
                out.on("finish", function() {
                    out.close(function() {
                        _log("Download complete: " + downloaded + " bytes");
                        _cb(null);
                    });
                });
                out.on("error", function(e) {
                    fs.unlink(destPath, function() {});
                    _cb(e);
                });
                res.on("error", function(e) {
                    fs.unlink(destPath, function() {});
                    _cb(e);
                });
            });
            req.on("timeout", function() {
                req.destroy();
                fs.unlink(destPath, function() {});
                _cb(new Error("Download timeout (120s)"));
            });
            req.on("error", _cb);
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

    // ─── Git repo detection ───────────────────────────────────────────────────

    var _isGitRepo = false;

    function _detectGitRepo() {
        try {
            var fs   = require("fs");
            var path = require("path");
            var ext  = _getExtensionPath();
            if (!ext) return false;
            // Check if .git exists (direct repo) or if the symlink target has .git
            var gitDir = path.join(ext, ".git");
            return fs.existsSync(gitDir);
        } catch(e) {
            return false;
        }
    }

    function _getLocalGitSha(callback) {
        try {
            var cp  = require("child_process");
            var ext = _getExtensionPath();
            cp.execFile("git", ["rev-parse", "HEAD"], { cwd: ext, timeout: 10000 }, function(err, stdout) {
                if (err) return callback(err, null);
                callback(null, stdout.trim());
            });
        } catch(e) {
            callback(e, null);
        }
    }

    function _gitPull(callback) {
        try {
            var cp  = require("child_process");
            var ext = _getExtensionPath();
            _setBtn("⬇️", "Git pull...", "", true);
            _log("Running git pull in " + ext);
            cp.execFile("git", ["pull", "--ff-only", "origin", GITHUB_BRANCH], 
                { cwd: ext, timeout: 120000 },
                function(err, stdout, stderr) {
                    if (err) {
                        _log("git pull failed: " + (stderr || err.message));
                        return callback(err);
                    }
                    _log("git pull: " + stdout.trim());
                    callback(null);
                }
            );
        } catch(e) {
            callback(e);
        }
    }

    // ─── Public: checkForUpdates ────────────────────────────────────────────────

    function checkForUpdates(callback) {
        _isGitRepo = _detectGitRepo();

        try {
            var apiUrl = "https://api.github.com/repos/" + GITHUB_OWNER + "/" + GITHUB_REPO + "/commits/" + GITHUB_BRANCH;

            // For git repos, get local SHA from git instead of .update-sha file
            var _afterLocalSha = function(localSha) {
                _httpsGetText(apiUrl, 5, function(err, body) {
                    if (err) {
                        _log("Check failed: " + err.message);
                        if (callback) callback(false);
                        return;
                    }
                    try {
                        var data = JSON.parse(body);
                        var remoteSha = data.sha;
                        if (!remoteSha) {
                            _log("No SHA in response");
                            if (callback) callback(false);
                            return;
                        }

                        _latestSha = remoteSha;

                        if (localSha && localSha === remoteSha) {
                            _log("Up to date: " + remoteSha.substr(0, 7) + (_isGitRepo ? " [git]" : " [zip]"));
                            if (callback) callback(false);
                            return;
                        }

                        // No local SHA (fresh install or write failed) — check VERSION to avoid false positives
                        if (!localSha && !_isGitRepo) {
                            _log("No local SHA found, checking VERSION file...");
                            var localVer = _readLocalVersion();
                            // Fetch remote VERSION to compare
                            var versionUrl = "https://raw.githubusercontent.com/" + GITHUB_OWNER + "/" + GITHUB_REPO + "/" + GITHUB_BRANCH + "/VERSION";
                            _httpsGetText(versionUrl, 5, function(vErr, vBody) {
                                var remoteVer = vErr ? null : (vBody || "").trim();
                                _log("VERSION check: local=" + localVer + " remote=" + remoteVer);
                                if (localVer && remoteVer && localVer === remoteVer) {
                                    // Same version — seed the SHA file so we don't check again
                                    _log("Same VERSION, seeding .update-sha with " + remoteSha.substr(0, 7));
                                    _writeLocalSha(remoteSha);
                                    if (callback) callback(false);
                                    return;
                                }
                                // Different version or couldn't compare — show update
                                _log("Update available: " + remoteSha.substr(0, 7) + " (no local SHA, version mismatch)");
                                _showUpdateBtn(remoteSha);
                                if (callback) callback(true);
                            });
                            return;
                        }

                        // SHA mismatch — update available
                        _log("Update available: " + remoteSha.substr(0, 7) + (localSha ? " (local: " + localSha.substr(0, 7) + ")" : "") + (_isGitRepo ? " [git]" : " [zip]"));
                        _showUpdateBtn(remoteSha);
                        if (callback) callback(true);
                    } catch(e) {
                        _log("Parse error: " + e.message);
                        if (callback) callback(false);
                    }
                });
            };

            if (_isGitRepo) {
                _getLocalGitSha(function(err, sha) {
                    _afterLocalSha(err ? null : sha);
                });
            } else {
                _afterLocalSha(_readLocalSha());
            }
        } catch(e) {
            _log("Unexpected error: " + e.message);
            if (callback) callback(false);
        }
    }

    // ─── Show update button ─────────────────────────────────────────────────────

    function _showUpdateBtn(remoteSha) {
        _updateAvailable = true;
        var btn = document.getElementById("btn-reload");
        if (btn) {
            _originalBtnHTML = btn.innerHTML;
            btn.style.cssText = "background:#0ae98d;color:#1a1d23;border-radius:6px;padding:3px 8px;font-size:10px;font-weight:700;animation:pulse-update 1.5s infinite;white-space:nowrap;";
            btn.innerHTML = "⬇";
            btn.title = "Hay una actualización disponible — click para actualizar" + (_isGitRepo ? " (git pull)" : "");
        }
    }

    // ─── Public: doUpdate ───────────────────────────────────────────────────────
    // Returns true if update download started, false if no update (caller should do plain reload).

    function doUpdate() {
        if (!_latestSha || !_updateAvailable) return false;

        // ─── Git mode: just git pull ────────────────────────────────────────
        if (_isGitRepo) {
            _gitPull(function(err) {
                if (err) {
                    _setBtn("❌", "git pull falló: " + err.message, "", false);
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
            return true;
        }

        // ─── ZIP mode (non-git installs) ────────────────────────────────────
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
