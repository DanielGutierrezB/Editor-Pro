/**
 * Editor-Pro — Debug Logger
 * Captures all important events for diagnostics.
 * Load BEFORE other modules in index.html.
 */
(function(global) {
    "use strict";

    var _logs = [];
    var MAX_LOGS = 2000;

    var Logger = {
        log: function(module, action, detail) {
            var entry = {
                t: new Date().toISOString(),
                m: module,
                a: action,
                d: detail || ""
            };
            _logs.push(entry);
            if (_logs.length > MAX_LOGS) _logs.shift();
            console.log("[" + module + "] " + action + ": " + (detail || ""));
        },

        error: function(module, action, err) {
            var msg = err && err.message ? err.message : String(err || "unknown");
            this.log(module, "ERROR:" + action, msg);
        },

        getLogs: function() { return _logs; },

        exportText: function() {
            var lines = ["=== Editor-Pro Debug Log ==="];
            lines.push("Exported: " + new Date().toISOString());
            lines.push("Entries: " + _logs.length);
            lines.push("");
            _logs.forEach(function(e) {
                lines.push(e.t + " [" + e.m + "] " + e.a + (e.d ? " — " + e.d : ""));
            });
            return lines.join("\n");
        },

        saveToFile: function(folder) {
            try {
                var fs = require("fs");
                var path = require("path");
                var filename = "editorpro-log-" + new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19) + ".txt";
                var filePath = path.join(folder, filename);
                fs.writeFileSync(filePath, this.exportText(), "utf8");
                return filePath;
            } catch(e) {
                return null;
            }
        },

        copyToClipboard: function() {
            var text = this.exportText();
            var ta = document.createElement("textarea");
            ta.value = text;
            ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            return text.length;
        }
    };

    global.EPLogger = Logger;
})(window);
