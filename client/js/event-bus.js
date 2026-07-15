/**
 * EventBus — Simple pub/sub for decoupling modules.
 * Modules subscribe to events at init time; sequence-controller
 * (or any other module) emits events without knowing who listens.
 *
 * Usage:
 *   EventBus.on("sequence-changed", function(data) { ... });
 *   EventBus.emit("sequence-changed", { name: "23-2604" });
 *
 * Events:
 *   - "sequence-changed"    → { name }       — active sequence changed
 *   - "sequence-first-load" → { name }       — first sequence detected after panel open
 *   - "transcript-changed"  → {}             — transcript text updated (textarea, cache, file)
 *   - "state-restored"      → { sequenceName } — full state restored from cache
 */
(function(global) {
    "use strict";

    var _listeners = {};

    var EventBus = {
        on: function(event, fn) {
            if (!_listeners[event]) _listeners[event] = [];
            _listeners[event].push(fn);
        },

        off: function(event, fn) {
            if (!_listeners[event]) return;
            _listeners[event] = _listeners[event].filter(function(f) { return f !== fn; });
        },

        emit: function(event, data) {
            if (!_listeners[event]) return;
            var fns = _listeners[event].slice(); // copy to avoid mutation during iteration
            for (var i = 0; i < fns.length; i++) {
                try { fns[i](data); }
                catch(e) { console.error("[EventBus] Error in " + event + " handler:", e); }
            }
        }
    };

    global.EventBus = EventBus;

})(window);
