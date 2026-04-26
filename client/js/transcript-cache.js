/**
 * transcript-cache.js — Transcript file discovery, auto-loading, and cache management
 * Depends on: state.js (window._epState), sequence-controller.js (window._epSeqCache)
 * All cross-module calls resolve at call time via window.X() to avoid load-order issues.
 * Exposes: window._buildTranscriptCache, window.autoLoadTranscriptForSequence,
 *          window._saveLastTranscriptFolder, window.copyTranscriptToFolder,
 *          window.handleJsonTranscriptSelect
 */
(function(global) {
    "use strict";

    var state = global._epState;

    function _getFs() { return global._epFs || (typeof require !== "undefined" ? require("fs") : null); }
    function _getPath() { return global._epPath || (typeof require !== "undefined" ? require("path") : null); }

    function _saveLastTranscriptFolder(filePath) {
        var path = _getPath();
        if (!filePath || !path) return;
        try {
            var dir = path.dirname(filePath);
            if (dir && dir !== ".") {
                localStorage.setItem("editorpro_transcript_folder", dir);
                if (!state.transcribeFolder) state.transcribeFolder = dir;
            }
        } catch (_e) {}
    }

    function _getTranscriptFolders() {
        var folders = [];
        if (state.transcribeFolder) folders.push(state.transcribeFolder);
        try {
            var saved = localStorage.getItem("editorpro_transcript_folder");
            if (saved && folders.indexOf(saved) === -1) folders.push(saved);
        } catch (_e) {}
        return folders;
    }

    function _tryLoadTranscriptFromFolder(folder, seqName) {
        var fs = _getFs();
        var path = _getPath();
        if (!folder || !seqName || !fs || !path) return false;

        var baseName = seqName.replace(/[\/\\:*?"<>|]/g, "_");

        // Try JSON (exact match)
        var jsonPath = path.join(folder, baseName + ".json");
        try {
            if (fs.existsSync(jsonPath)) {
                var parsed = global.parseTranscriptJson(jsonPath);
                if (parsed && parsed.words && parsed.words.length > 5) {
                    state.sttResult = parsed;
                    state.lastWhisperResult = parsed;
                    try { state.transcriptJson = JSON.parse(fs.readFileSync(jsonPath, "utf8")); } catch (_re) {}
                    global.refreshTraerTranscriptButtons();
                    global.applySttResultToRecordingNotes(parsed, true);
                    global.hideElement("recording-empty");
                    var srt = global.sttResultToSRT(parsed);
                    global.loadTranscriptText(srt, baseName + ".json");
                    global.showToast("Transcript auto-cargado: " + baseName, "success");
                    return true;
                }
            }
        } catch (_e) {}

        // Try SRT (exact match)
        var srtPath = path.join(folder, baseName + ".srt");
        try {
            if (fs.existsSync(srtPath)) {
                var content = fs.readFileSync(srtPath, "utf8");
                var segments = global.parseSRT(content);
                if (segments && segments.length > 3) {
                    var sttResult = global.srtSegmentsToSttResult(segments);
                    state.sttResult = sttResult;
                    state.lastWhisperResult = sttResult;
                    global.refreshTraerTranscriptButtons();
                    global.applySttResultToRecordingNotes(sttResult, true);
                    global.hideElement("recording-empty");
                    var srt2 = global.sttResultToSRT(sttResult);
                    global.loadTranscriptText(srt2, baseName + ".srt");
                    global.showToast("Transcript auto-cargado: " + baseName, "success");
                    return true;
                }
            }
        } catch (_e) {}

        // Partial match in folder (file name contains seq name)
        try {
            var files = fs.readdirSync(folder);
            var seqLower = baseName.toLowerCase();
            for (var fi = 0; fi < files.length; fi++) {
                var fname = files[fi];
                var fnameLower = fname.toLowerCase();
                if ((fnameLower.endsWith(".json") || fnameLower.endsWith(".srt")) &&
                    fnameLower.indexOf(seqLower) !== -1) {
                    var fullPath = path.join(folder, fname);
                    if (fnameLower.endsWith(".json")) {
                        var p2 = global.parseTranscriptJson(fullPath);
                        if (p2 && p2.words && p2.words.length > 5) {
                            state.sttResult = p2;
                            state.lastWhisperResult = p2;
                            try { state.transcriptJson = JSON.parse(fs.readFileSync(fullPath, "utf8")); } catch (_re) {}
                            global.refreshTraerTranscriptButtons();
                            global.applySttResultToRecordingNotes(p2, true);
                            global.hideElement("recording-empty");
                            global.loadTranscriptText(global.sttResultToSRT(p2), seqName);
                            return true;
                        }
                    } else {
                        var c2 = fs.readFileSync(fullPath, "utf8");
                        var s2 = global.parseSRT(c2);
                        if (s2 && s2.length > 3) {
                            var st2 = global.srtSegmentsToSttResult(s2);
                            state.sttResult = st2;
                            state.lastWhisperResult = st2;
                            global.refreshTraerTranscriptButtons();
                            global.applySttResultToRecordingNotes(st2, true);
                            global.hideElement("recording-empty");
                            global.loadTranscriptText(global.sttResultToSRT(st2), seqName);
                            return true;
                        }
                    }
                }
            }
        } catch (_e) {}

        return false;
    }

    function autoLoadTranscriptForSequence(seqName) {
        var fs = _getFs();
        var path = _getPath();
        if (!seqName || !fs || !path) return;
        if (state.transcriptCache && state.transcriptCache[seqName]) {
            var cachedPath = state.transcriptCache[seqName];
            try {
                if (fs.existsSync(cachedPath)) {
                    _loadTranscriptFromPath(cachedPath, seqName);
                    return;
                }
            } catch (_e) {}
            delete state.transcriptCache[seqName];
        }
        var folders = _getTranscriptFolders();
        for (var fi = 0; fi < folders.length; fi++) {
            if (_tryLoadTranscriptFromFolder(folders[fi], seqName)) return;
        }
    }

    function _loadTranscriptFromPath(filePath, seqName) {
        var fs = _getFs();
        var path = _getPath();
        if (!filePath || !fs || !path) return false;
        try {
            var ext = filePath.indexOf(".json") !== -1 ? "json" : (filePath.indexOf(".srt") !== -1 ? "srt" : "");
            var label = seqName || path.basename(filePath).replace(/\.(json|srt)$/i, "");
            if (ext === "json") {
                var parsed = global.parseTranscriptJson(filePath);
                if (parsed && parsed.words && parsed.words.length > 5) {
                    state.sttResult = parsed;
                    state.lastWhisperResult = parsed;
                    try { state.transcriptJson = JSON.parse(fs.readFileSync(filePath, "utf8")); } catch (_re) {}
                    global.refreshTraerTranscriptButtons();
                    global.applySttResultToRecordingNotes(parsed, true);
                    global.hideElement("recording-empty");
                    global.loadTranscriptText(global.sttResultToSRT(parsed), label);
                    return true;
                }
            } else if (ext === "srt") {
                var content = fs.readFileSync(filePath, "utf8");
                var segments = global.parseSRT(content);
                if (segments && segments.length > 3) {
                    var sttResult = global.srtSegmentsToSttResult(segments);
                    state.sttResult = sttResult;
                    state.lastWhisperResult = sttResult;
                    global.refreshTraerTranscriptButtons();
                    global.applySttResultToRecordingNotes(sttResult, true);
                    global.hideElement("recording-empty");
                    global.loadTranscriptText(global.sttResultToSRT(sttResult), label);
                    return true;
                }
            }
        } catch (_e) {}
        return false;
    }

    function _buildTranscriptCache(callback) {
        var fs = _getFs();
        var path = _getPath();
        var csInterface = global._epCSInterface;
        var _seqCache = global._epSeqCache;

        if (!fs || !path) {
            state.transcriptCache = {};
            if (callback) callback([], {});
            return;
        }

        csInterface.evalScript("getTranscribeFolder()", function(tfRes) {
            var transcribeFolder = null;
            try {
                var tfData = JSON.parse(tfRes);
                if (tfData.success && tfData.path) transcribeFolder = tfData.path;
            } catch (_e) {}

            var sourceFolders = _getTranscriptFolders();
            if (transcribeFolder && sourceFolders.indexOf(transcribeFolder) === -1) {
                sourceFolders.unshift(transcribeFolder);
            }

            if (!sourceFolders.length) {
                state.transcriptCache = {};
                if (callback) callback([], {});
                return;
            }

            var folderFiles = {};
            for (var ff = 0; ff < sourceFolders.length; ff++) {
                try { folderFiles[sourceFolders[ff]] = fs.readdirSync(sourceFolders[ff]); } catch (_e) { folderFiles[sourceFolders[ff]] = []; }
            }

            csInterface.evalScript("listProjectSequences()", function(res) {
                try {
                    var data = JSON.parse(res);
                    var seqs = data.sequences || [];
                    var cache = {};

                    for (var si = 0; si < seqs.length; si++) {
                        var sname = seqs[si].name;
                        if (cache[sname]) continue;
                        var baseName = sname.replace(/[\/\\:*?"<>|]/g, "_");

                        // Exact match in Transcribe folder (canonical)
                        if (transcribeFolder) {
                            var tjp = path.join(transcribeFolder, baseName + ".json");
                            if (fs.existsSync(tjp)) { cache[sname] = tjp; continue; }
                            var tsp = path.join(transcribeFolder, baseName + ".srt");
                            if (fs.existsSync(tsp)) { cache[sname] = tsp; continue; }
                        }

                        // Exact match in other source folders (copy to Transcribe/)
                        var found = false;
                        for (var fi = 0; fi < sourceFolders.length && !found; fi++) {
                            if (sourceFolders[fi] === transcribeFolder) continue;
                            var jp = path.join(sourceFolders[fi], baseName + ".json");
                            if (fs.existsSync(jp)) {
                                if (transcribeFolder) {
                                    var dest = path.join(transcribeFolder, baseName + ".json");
                                    try { fs.copyFileSync(jp, dest); cache[sname] = dest; } catch (_ce) { cache[sname] = jp; }
                                } else { cache[sname] = jp; }
                                found = true; break;
                            }
                            var sp = path.join(sourceFolders[fi], baseName + ".srt");
                            if (fs.existsSync(sp)) {
                                if (transcribeFolder) {
                                    var destS = path.join(transcribeFolder, baseName + ".srt");
                                    try { fs.copyFileSync(sp, destS); cache[sname] = destS; } catch (_ce) { cache[sname] = sp; }
                                } else { cache[sname] = sp; }
                                found = true; break;
                            }
                        }

                        // Partial match (file name starts with seq name)
                        if (!found && baseName.length >= 3) {
                            var seqLower = baseName.toLowerCase();
                            var bestMatch = null;
                            var bestLen = Infinity;
                            for (var fi2 = 0; fi2 < sourceFolders.length; fi2++) {
                                if (sourceFolders[fi2] === transcribeFolder) continue;
                                var files = folderFiles[sourceFolders[fi2]] || [];
                                for (var fj = 0; fj < files.length; fj++) {
                                    var fname = files[fj];
                                    var fnameLower = fname.toLowerCase();
                                    if (!(fnameLower.endsWith(".json") || fnameLower.endsWith(".srt"))) continue;
                                    var fnameBase = fnameLower.replace(/\.(json|srt)$/, "");
                                    if (fnameBase.indexOf(seqLower) === 0 && fnameBase.length < bestLen) {
                                        bestMatch = path.join(sourceFolders[fi2], fname);
                                        bestLen = fnameBase.length;
                                    }
                                }
                            }
                            if (bestMatch) {
                                var matchExt = bestMatch.toLowerCase().endsWith(".srt") ? ".srt" : ".json";
                                if (transcribeFolder) {
                                    var destP = path.join(transcribeFolder, baseName + matchExt);
                                    try { fs.copyFileSync(bestMatch, destP); cache[sname] = destP; } catch (_ce) { cache[sname] = bestMatch; }
                                } else { cache[sname] = bestMatch; }
                            }
                        }
                    }

                    state.transcriptCache = cache;

                    if (transcribeFolder) {
                        state.transcribeFolder = transcribeFolder;
                    }

                    // Mark sequences with transcript files in the seq dropdown cache
                    if (_seqCache) {
                        for (var cacheKey in cache) {
                            if (cache.hasOwnProperty(cacheKey) && !_seqCache[cacheKey]) {
                                _seqCache[cacheKey] = { _hasTranscriptFile: true };
                            }
                        }
                    }

                    if (callback) callback(seqs, cache);
                } catch (_e) {
                    state.transcriptCache = {};
                    if (callback) callback([], {});
                }
            });
        });
    }

    function copyTranscriptToFolder(sourcePath, seqName) {
        var fs = _getFs();
        var path = _getPath();
        if (!fs || !path || !state.transcribeFolder || !seqName) return;
        try {
            var destPath = path.join(state.transcribeFolder, seqName + ".json");
            if (sourcePath !== destPath) {
                fs.copyFileSync(sourcePath, destPath);
            }
        } catch (_e) {}
    }

    function handleJsonTranscriptSelect(evt) {
        var fs = _getFs();
        var path = _getPath();
        var file = evt.target.files[0];
        if (!file) return;

        try {
            var content = fs.readFileSync(file.path, "utf8");
            var data = JSON.parse(content);
            var parsed = null;

            if (data.segments && Array.isArray(data.segments) && data.segments.length > 0 &&
                data.segments[0].words && typeof data.segments[0].start === "number") {
                parsed = global.parsePremiereTextPanelJson(data);
            } else {
                parsed = global.parseTranscriptJson(file.path);
            }

            if (!parsed || !parsed.words || parsed.words.length < 3) {
                global.showToast("No se encontraron palabras válidas en el JSON", "error");
                evt.target.value = "";
                return;
            }

            var _jsonFolder = path.dirname(file.path);
            if (!state.transcribeFolder) {
                state.transcribeFolder = _jsonFolder;
            }
            localStorage.setItem("editorpro_transcript_folder", _jsonFolder);

            _buildTranscriptCache();

            state.sttResult = parsed;
            state.lastWhisperResult = parsed;
            state.transcriptJson = data;
            global.refreshTraerTranscriptButtons();
            global.applySttResultToRecordingNotes(parsed, true);
            global.hideElement("recording-empty");
            var srt = global.sttResultToSRT(parsed);
            global.loadTranscriptText(srt, path.basename(file.path));
            _saveLastTranscriptFolder(file.path);
            global.showToast("Transcript JSON cargado (" + parsed.words.length + " palabras)", "success");
        } catch (e) {
            global.showToast("Error al leer JSON: " + e.message, "error");
        }
        evt.target.value = "";
    }

    global._saveLastTranscriptFolder = _saveLastTranscriptFolder;
    global._getTranscriptFolders = _getTranscriptFolders;
    global._tryLoadTranscriptFromFolder = _tryLoadTranscriptFromFolder;
    global.autoLoadTranscriptForSequence = autoLoadTranscriptForSequence;
    global._loadTranscriptFromPath = _loadTranscriptFromPath;
    global._buildTranscriptCache = _buildTranscriptCache;
    global.copyTranscriptToFolder = copyTranscriptToFolder;
    global.handleJsonTranscriptSelect = handleJsonTranscriptSelect;

    // Internal alias used within this module (must match global after init)
    global._epBuildTranscriptCache = _buildTranscriptCache;

})(window);
