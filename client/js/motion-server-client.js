/**
 * Motion-Server HTTP Client — shared transport for talking to the local
 * motion-server (Express, default port 3847).
 *
 * Motion-Pro and B-Roll each used to carry their own byte-for-byte-identical
 * copies of `_post`/`_get`/`checkServer` (safeCallback dedup, JSON parsing,
 * timeouts). This factory is the single implementation both modules delegate
 * to now; only the timeout values differ per caller.
 */
(function(global) {
    "use strict";

    var http;
    try { http = require("http"); } catch(e) { http = null; }

    var DEFAULT_PORT = 3847;
    var DEFAULT_POST_TIMEOUT_MS = 180000;
    var DEFAULT_GET_TIMEOUT_MS = 15000;
    var DEFAULT_STATUS_TIMEOUT_MS = 3000;

    function createMotionServerClient(options) {
        options = options || {};
        var port = options.port || DEFAULT_PORT;
        var baseUrl = "http://127.0.0.1:" + port;
        var postTimeoutMs = options.postTimeoutMs || DEFAULT_POST_TIMEOUT_MS;
        var getTimeoutMs = options.getTimeoutMs || DEFAULT_GET_TIMEOUT_MS;
        var statusTimeoutMs = options.statusTimeoutMs || DEFAULT_STATUS_TIMEOUT_MS;

        function post(urlPath, body, callback) {
            if (!http) { callback(new Error("HTTP not available")); return; }
            var called = false;
            function cb(err, data) { if (called) return; called = true; callback(err, data); }
            var data = JSON.stringify(body);
            var req = http.request({
                hostname: "127.0.0.1",
                port: port,
                path: urlPath,
                method: "POST",
                headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
            }, function(res) {
                var chunks = "";
                res.on("data", function(c) { chunks += c; });
                res.on("end", function() {
                    try { cb(null, JSON.parse(chunks)); }
                    catch(e) { cb(new Error("Parse error: " + chunks.substring(0, 200))); }
                });
            });
            req.on("error", function(e) { cb(e); });
            req.setTimeout(postTimeoutMs, function() {
                req.destroy();
                cb(new Error("Request timeout (" + Math.round(postTimeoutMs / 1000) + "s)"));
            });
            req.write(data);
            req.end();
        }

        function get(urlPath, callback) {
            if (!http) { callback(new Error("HTTP not available")); return; }
            var called = false;
            function cb(err, data) { if (called) return; called = true; callback(err, data); }
            var req = http.get(baseUrl + urlPath, function(res) {
                var data = "";
                res.on("data", function(c) { data += c; });
                res.on("end", function() {
                    try { cb(null, JSON.parse(data)); }
                    catch(e) { cb(new Error("Parse error")); }
                });
            });
            req.on("error", function(e) { cb(e); });
            req.setTimeout(getTimeoutMs, function() { req.destroy(); cb(new Error("GET timeout")); });
        }

        function checkServer(callback) {
            if (!http) { if (callback) callback(false); return; }
            var req = http.get(baseUrl + "/api/status", function(res) {
                var data = "";
                res.on("data", function(c) { data += c; });
                res.on("end", function() {
                    var running = false;
                    try { running = JSON.parse(data).running === true; } catch(e) { running = false; }
                    if (callback) callback(running);
                });
            });
            req.on("error", function() { if (callback) callback(false); });
            req.setTimeout(statusTimeoutMs, function() {
                req.destroy();
                if (callback) callback(false);
            });
        }

        return {
            port: port,
            baseUrl: baseUrl,
            post: post,
            get: get,
            checkServer: checkServer
        };
    }

    global.createMotionServerClient = createMotionServerClient;
})(window);
