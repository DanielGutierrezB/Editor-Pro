/**
 * host/common.jsx — JSON polyfill + globally-shared constants
 * Loaded via #include from host/index.jsx, first among the host modules.
 *
 * The sequence/backup/marker utilities that used to live in this file were
 * split into focused sibling modules (also #include'd from index.jsx):
 *   - host/backup.jsx           — backup/restore + on-disk persistence
 *   - host/bin-utils.jsx        — project-panel bin lookup/creation
 *   - host/sequence-info.jsx    — active-sequence read helpers + misc utils
 *   - host/marker-ops.jsx       — post-cut marker cleanup/colorization
 *   - host/sequence-discovery.jsx — multi-sequence listing/navigation
 * ExtendScript's #include is a textual concatenation and function
 * declarations are hoisted across the whole script, so these files can call
 * each other freely regardless of #include order.
 */

/**
 * Editor-Pro — ExtendScript Host for Premiere Pro
 *
 * Combines Cutter (marker-based cuts), SpellCheck/Supertexts/EditSuggestions,
 * and Recording Notes (STT + take analysis) into a unified host script.
 */

// ─── JSON Polyfill (ES3) ────────────────────────────────────
if (typeof JSON === "undefined") { JSON = {}; }
if (typeof JSON.parse !== "function") {
    JSON.parse = function(s) { return eval("(" + s + ")"); };
}
if (typeof JSON.stringify !== "function") {
    JSON.stringify = function(obj) {
        if (obj === null) return "null";
        if (obj === undefined) return undefined;
        var t = typeof obj;
        if (t === "number" || t === "boolean") return String(obj);
        if (t === "string") return '"' + obj.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r") + '"';
        if (obj instanceof Array) {
            var a = [];
            for (var i = 0; i < obj.length; i++) a.push(JSON.stringify(obj[i]));
            return "[" + a.join(",") + "]";
        }
        if (t === "object") {
            var parts = [];
            for (var k in obj) {
                if (obj.hasOwnProperty(k)) {
                    var v = JSON.stringify(obj[k]);
                    if (v !== undefined) parts.push('"' + k + '":' + v);
                }
            }
            return "{" + parts.join(",") + "}";
        }
        return undefined;
    };
}

var TICKS_PER_SECOND = 254016000000;
