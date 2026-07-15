/**
 * BatchSeqRunner — shared helpers for the "batch mode" sequence pickers used by
 * Smart Supertexts (st2) and Edit Suggestions (es2).
 *
 * Both features analyze N open sequences one-by-one/in-parallel and let the user
 * navigate between the analyzed results. The two UIs used to carry byte-for-byte
 * identical copies of these helpers (transcript lookup/loading, progress bar,
 * cancel-button label, and batch-nav bookkeeping) under `_st2Batch*`/`_es2Batch*`
 * names. This module is the single implementation; each caller passes its own
 * DOM-id prefix ("st2"/"es2") and result bookkeeping.
 */
(function(global) {
    "use strict";

    var fs, path;

    function _refs() {
        fs = global._epFs;
        path = global._epPath;
    }

    /**
     * Finds a transcript file (.json or .srt) for a sequence name inside any of the
     * given folders, matching by sanitized sequence name.
     */
    function findSequenceTranscript(folders, seqName) {
        _refs();
        if (!seqName || !fs || !path) return null;
        var baseName = seqName.replace(/[\/\\:*?"<>|]/g, "_");
        for (var fi = 0; fi < folders.length; fi++) {
            var folder = folders[fi];
            var jsonPath = path.join(folder, baseName + ".json");
            if (fs.existsSync(jsonPath)) return jsonPath;
            var srtPath = path.join(folder, baseName + ".srt");
            if (fs.existsSync(srtPath)) return srtPath;
        }
        return null;
    }

    /**
     * Loads a transcript file (.json or .srt) and returns it in the
     * "[X.Xs - Y.Ys] texto" timed-line format used for AI analysis prompts —
     * the same format buildTimedTranscript() produces for single-sequence analysis.
     */
    function loadTimedTranscript(filePath) {
        _refs();
        if (!filePath || !fs) return null;
        var parseTranscriptJson = global._epParseTranscriptJson;
        var sttResultToSRT = global._epSttResultToSRT;
        var parseSRT = global._epParseSRT;
        try {
            var segments = null;

            if (filePath.toLowerCase().endsWith(".json")) {
                var parsed = parseTranscriptJson(filePath);
                if (parsed && parsed.words && parsed.words.length > 5) {
                    var srt = sttResultToSRT(parsed);
                    segments = parseSRT(srt);
                }
                if (!segments || segments.length < 3) {
                    var raw = fs.readFileSync(filePath, "utf8");
                    var data = JSON.parse(raw);
                    if (data.segments && data.segments.length > 0 && data.segments[0].words) {
                        segments = [];
                        for (var si = 0; si < data.segments.length; si++) {
                            var seg = data.segments[si];
                            var words = seg.words || [];
                            var text = words.map(function(w) { return w.text || ""; }).join(" ").trim();
                            if (text) {
                                segments.push({
                                    startTime: seg.start || 0,
                                    endTime: (seg.start || 0) + (seg.duration || 5),
                                    text: text
                                });
                            }
                        }
                    }
                }
            } else {
                var content = fs.readFileSync(filePath, "utf8");
                segments = parseSRT(content);
            }

            if (segments && segments.length > 3) {
                return segments.map(function(s) {
                    return "[" + s.startTime.toFixed(1) + "s - " + s.endTime.toFixed(1) + "s] " + s.text;
                }).join("\n");
            }
            return null;
        } catch(_e) { return null; }
    }

    function setBatchProgress(prefix, pct, text) {
        var fill = document.getElementById(prefix + "-batch-progress-fill");
        var label = document.getElementById(prefix + "-batch-progress-text");
        if (fill) fill.style.width = Math.min(pct, 100) + "%";
        if (label) label.textContent = text || "";
    }

    function setBatchCancelBtn(prefix, running) {
        var btn = document.getElementById("btn-" + prefix + "-batch-cancel");
        if (!btn) return;
        if (running) {
            btn.textContent = "Detener";
            btn.style.borderColor = "rgba(248,113,113,0.4)";
            btn.style.color = "#f87171";
        } else {
            btn.textContent = "Cerrar Batch";
            btn.style.borderColor = "";
            btn.style.color = "";
        }
    }

    /** Names (in queue order) of items in `results` whose `doneKey` field is truthy. */
    function getBatchAnalyzedNames(queue, results, doneKey) {
        var names = [];
        for (var qi = 0; qi < queue.length; qi++) {
            var n = queue[qi].name;
            if (results[n] && results[n][doneKey]) names.push(n);
        }
        return names;
    }

    function updateBatchNavButtons(prefix, currentNav, analyzedCount) {
        var prevBtn = document.getElementById("btn-" + prefix + "-bnav-prev");
        var nextBtn = document.getElementById("btn-" + prefix + "-bnav-next");
        if (prevBtn) prevBtn.className = "btn-batch-nav" + (currentNav <= 0 ? " disabled" : "");
        if (nextBtn) nextBtn.className = "btn-batch-nav" + (currentNav >= analyzedCount - 1 ? " disabled" : "");
    }

    global.BatchSeqRunner = {
        findSequenceTranscript: findSequenceTranscript,
        loadTimedTranscript: loadTimedTranscript,
        setBatchProgress: setBatchProgress,
        setBatchCancelBtn: setBatchCancelBtn,
        getBatchAnalyzedNames: getBatchAnalyzedNames,
        updateBatchNavButtons: updateBatchNavButtons
    };
})(window);
