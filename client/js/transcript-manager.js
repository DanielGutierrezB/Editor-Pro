/**
 * transcript-manager.js — Transcript loading, caching, and UI orchestration
 * Handles auto-loading from disk, format conversion, and textarea updates.
 * Depends on: utils.js, state.js, transcript-parser.js (loaded before this)
 * Exposes: window.TranscriptManager = { ... } and backward-compat window._ep* bindings
 */
(function(global) {
    "use strict";

    var fs, path;
    try { fs = require("fs"); path = require("path"); } catch(e) {}

    function _state() { return global._epState; }
    function _cs() { return global._epCSInterface; }
    function _parser() { return global.TranscriptParser; }

    // ─── Transcript folder tracking ───────────────────────────────

    function _saveLastTranscriptFolder(filePath) {
        if (!filePath || !path) return;
        try {
            var dir = path.dirname(filePath);
            if (dir && dir !== ".") {
                localStorage.setItem("editorpro_transcript_folder", dir);
                var st = _state();
                if (st && !st.transcribeFolder) st.transcribeFolder = dir;
            }
        } catch(_e) {}
    }

    function _getTranscriptFolders() {
        var folders = [];
        var st = _state();
        if (st && st.transcribeFolder) folders.push(st.transcribeFolder);
        try {
            var saved = localStorage.getItem("editorpro_transcript_folder");
            if (saved && folders.indexOf(saved) === -1) folders.push(saved);
        } catch(_e) {}
        return folders;
    }

    // ─── Folder-based transcript matching ─────────────────────────

    function _tryLoadTranscriptFromFolder(folder, seqName) {
        if (!folder || !seqName || !fs || !path) return false;
        var parser = _parser();
        if (!parser) return false;

        var baseName = seqName.replace(/[\/\\:*?"<>|]/g, "_");

        // Try JSON exact match
        var jsonPath = path.join(folder, baseName + ".json");
        try {
            if (fs.existsSync(jsonPath)) {
                var parsed = parser.parseTranscriptJson(jsonPath);
                if (parsed && parsed.words && parsed.words.length > 5) {
                    var st = _state();
                    st.sttResult = parsed;
                    st.lastWhisperResult = parsed;
                    try { st.transcriptJson = JSON.parse(fs.readFileSync(jsonPath, "utf8")); } catch(_re) {}
                    _onTranscriptLoaded(parsed, baseName + ".json");
                    return true;
                }
            }
        } catch(_e) {}

        // Try SRT exact match
        var srtPath = path.join(folder, baseName + ".srt");
        try {
            if (fs.existsSync(srtPath)) {
                var content = fs.readFileSync(srtPath, "utf8");
                var segments = parser.parseSRT(content);
                if (segments && segments.length > 3) {
                    var sttResult = parser.srtSegmentsToSttResult(segments);
                    var st2 = _state();
                    st2.sttResult = sttResult;
                    st2.lastWhisperResult = sttResult;
                    _onTranscriptLoaded(sttResult, baseName + ".srt");
                    return true;
                }
            }
        } catch(_e) {}

        // Partial match in folder
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
                        var p2 = parser.parseTranscriptJson(fullPath);
                        if (p2 && p2.words && p2.words.length > 5) {
                            var st3 = _state();
                            st3.sttResult = p2;
                            st3.lastWhisperResult = p2;
                            try { st3.transcriptJson = JSON.parse(fs.readFileSync(fullPath, "utf8")); } catch(_re) {}
                            _onTranscriptLoaded(p2, seqName);
                            return true;
                        }
                    } else {
                        var c2 = fs.readFileSync(fullPath, "utf8");
                        var s2 = parser.parseSRT(c2);
                        if (s2 && s2.length > 3) {
                            var st4 = parser.srtSegmentsToSttResult(s2);
                            var stRef = _state();
                            stRef.sttResult = st4;
                            stRef.lastWhisperResult = st4;
                            _onTranscriptLoaded(st4, seqName);
                            return true;
                        }
                    }
                }
            }
        } catch(_e) {}

        return false;
    }

    // Helper called after successfully loading a transcript from disk
    function _onTranscriptLoaded(sttResult, label) {
        if (global.EPUtils) {
            global.EPUtils.showToast("Transcript auto-cargado: " + label, "success");
            global.EPUtils.hideElement("recording-empty");
        }
        if (global._epRefreshTraerTranscriptButtons) global._epRefreshTraerTranscriptButtons();
        else if (global.EditorProUI && global.EditorProUI.recording) global.EditorProUI.recording.refreshTraerTranscriptButtons();

        if (global._epApplySttResultToRecordingNotes) global._epApplySttResultToRecordingNotes(sttResult, true);
        else if (global.EditorProUI && global.EditorProUI.recording) global.EditorProUI.recording.applySttResultToRecordingNotes(sttResult, true);

        var parser = _parser();
        if (parser) loadTranscriptText(parser.sttResultToSRT(sttResult), label);
    }

    function _loadTranscriptFromPath(filePath, seqName) {
        if (!filePath || !fs || !path) return false;
        var parser = _parser();
        if (!parser) return false;
        try {
            var ext = filePath.indexOf(".json") !== -1 ? "json" : (filePath.indexOf(".srt") !== -1 ? "srt" : "");
            var label = seqName || path.basename(filePath).replace(/\.(json|srt)$/i, "");
            if (ext === "json") {
                var parsed = parser.parseTranscriptJson(filePath);
                if (parsed && parsed.words && parsed.words.length > 5) {
                    var st = _state();
                    st.sttResult = parsed;
                    st.lastWhisperResult = parsed;
                    try { st.transcriptJson = JSON.parse(fs.readFileSync(filePath, "utf8")); } catch(_re) {}
                    _onTranscriptLoaded(parsed, label);
                    return true;
                }
            } else if (ext === "srt") {
                var content = fs.readFileSync(filePath, "utf8");
                var segments = parser.parseSRT(content);
                if (segments && segments.length > 3) {
                    var sttResult = parser.srtSegmentsToSttResult(segments);
                    var st2 = _state();
                    st2.sttResult = sttResult;
                    st2.lastWhisperResult = sttResult;
                    _onTranscriptLoaded(sttResult, label);
                    return true;
                }
            }
        } catch(_e) {}
        return false;
    }

    function autoLoadTranscriptForSequence(seqName) {
        if (!seqName || !fs || !path) return;
        var st = _state();
        if (!st) return;

        if (st.transcriptCache && st.transcriptCache[seqName]) {
            var cachedPath = st.transcriptCache[seqName];
            try {
                if (fs.existsSync(cachedPath)) { _loadTranscriptFromPath(cachedPath, seqName); return; }
            } catch(_e) {}
            delete st.transcriptCache[seqName];
        }

        var folders = _getTranscriptFolders();
        for (var fi = 0; fi < folders.length; fi++) {
            if (_tryLoadTranscriptFromFolder(folders[fi], seqName)) return;
        }
    }

    // ─── Transcript cache builder ─────────────────────────────────

    function _buildTranscriptCache(callback) {
        var cs = _cs();
        if (!fs || !path || !cs) {
            var st = _state();
            if (st) st.transcriptCache = {};
            if (callback) callback([], {});
            return;
        }

        cs.evalScript("getTranscribeFolder()", function(tfRes) {
            var transcribeFolder = null;
            try {
                var tfData = JSON.parse(tfRes);
                if (tfData.success && tfData.path) transcribeFolder = tfData.path;
            } catch(_e) {}

            var sourceFolders = _getTranscriptFolders();
            if (transcribeFolder && sourceFolders.indexOf(transcribeFolder) === -1) {
                sourceFolders.unshift(transcribeFolder);
            }

            if (!sourceFolders.length) {
                var st = _state();
                if (st) st.transcriptCache = {};
                if (callback) callback([], {});
                return;
            }

            var folderFiles = {};
            for (var ff = 0; ff < sourceFolders.length; ff++) {
                try { folderFiles[sourceFolders[ff]] = fs.readdirSync(sourceFolders[ff]); } catch(_e) { folderFiles[sourceFolders[ff]] = []; }
            }

            cs.evalScript("listProjectSequences()", function(res) {
                try {
                    var data = JSON.parse(res);
                    var seqs = data.sequences || [];
                    var cache = {};

                    for (var si = 0; si < seqs.length; si++) {
                        var sname = seqs[si].name;
                        if (cache[sname]) continue;
                        var baseName = sname.replace(/[\/\\:*?"<>|]/g, "_");

                        // Check Transcribe folder first (canonical)
                        if (transcribeFolder) {
                            var tjp = path.join(transcribeFolder, baseName + ".json");
                            if (fs.existsSync(tjp)) { cache[sname] = tjp; continue; }
                            var tsp = path.join(transcribeFolder, baseName + ".srt");
                            if (fs.existsSync(tsp)) { cache[sname] = tsp; continue; }
                        }

                        // Check source folders (exact match)
                        var found = false;
                        for (var fi = 0; fi < sourceFolders.length && !found; fi++) {
                            if (sourceFolders[fi] === transcribeFolder) continue;
                            var jp = path.join(sourceFolders[fi], baseName + ".json");
                            if (fs.existsSync(jp)) {
                                if (transcribeFolder) {
                                    var dest = path.join(transcribeFolder, baseName + ".json");
                                    try { fs.copyFileSync(jp, dest); cache[sname] = dest; } catch(_ce) { cache[sname] = jp; }
                                } else { cache[sname] = jp; }
                                found = true; break;
                            }
                            var sp = path.join(sourceFolders[fi], baseName + ".srt");
                            if (fs.existsSync(sp)) {
                                if (transcribeFolder) {
                                    var destS = path.join(transcribeFolder, baseName + ".srt");
                                    try { fs.copyFileSync(sp, destS); cache[sname] = destS; } catch(_ce) { cache[sname] = sp; }
                                } else { cache[sname] = sp; }
                                found = true; break;
                            }
                        }

                        // Partial match in source folders
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
                                var ext = bestMatch.toLowerCase().endsWith(".srt") ? ".srt" : ".json";
                                if (transcribeFolder) {
                                    var destP = path.join(transcribeFolder, baseName + ext);
                                    try { fs.copyFileSync(bestMatch, destP); cache[sname] = destP; } catch(_ce) { cache[sname] = bestMatch; }
                                } else { cache[sname] = bestMatch; }
                            }
                        }
                    }

                    var st = _state();
                    if (st) {
                        st.transcriptCache = cache;
                        if (transcribeFolder) st.transcribeFolder = transcribeFolder;

                        // Register transcript-available sequences in seq dropdown cache
                        var seqCache = global._epSeqCache;
                        if (seqCache) {
                            for (var cacheKey in cache) {
                                if (cache.hasOwnProperty(cacheKey) && !seqCache[cacheKey]) {
                                    seqCache[cacheKey] = { _hasTranscriptFile: true };
                                }
                            }
                        }
                    }

                    if (callback) callback(seqs, cache);
                } catch(e) {
                    var st2 = _state();
                    if (st2) st2.transcriptCache = {};
                    if (callback) callback([], {});
                }
            });
        });
    }

    // ─── Core transcript UI operations ───────────────────────────

    function loadTranscriptText(text, source) {
        var textarea = document.getElementById("transcript-input");
        if (textarea) textarea.value = text;
        var st = _state();
        if (st) st._transcriptSource = source || "";
        onTranscriptChange();
        renderTranscriptFromSegments();
        if (global.EPUtils) global.EPUtils.showToast("Transcripción cargada desde " + source, "success");
    }

    function clearTranscript() {
        var st = _state();
        if (st) { st.transcript = ""; st.segments = []; st.transcriptJson = null; }
        var textarea = document.getElementById("transcript-input");
        if (textarea) textarea.value = "";
        var infoEl = document.getElementById("transcript-info");
        if (infoEl) infoEl.textContent = "Sin transcripción cargada";
        if (global.EPUtils) global.EPUtils.hideElement("transcript-stats");
        clearRenderedTranscript();
        if (global.EditorProUI && global.EditorProUI.motionPro && global.EditorProUI.motionPro.updateAnalyzeButton) {
            global.EditorProUI.motionPro.updateAnalyzeButton();
        }
    }

    function onTranscriptChange() {
        var textarea = document.getElementById("transcript-input");
        if (!textarea) return;

        var text = textarea.value.trim();
        var st = _state();
        if (st) st.transcript = text;

        var parser = _parser();
        var formatTimeFull = (global.EPUtils && global.EPUtils.formatTimeFull) || function(s) { return s + "s"; };

        var titleEl = document.querySelector('[data-tool="transcript"] .tool-card-title');
        if (titleEl) {
            var src = (st && st._transcriptSource) || "";
            titleEl.innerHTML = text
                ? "✅ Transcripción" + (src ? " <span style='font-size:11px;color:#888;font-weight:400;margin-left:6px'>" + src + "</span>" : "")
                : "📝 Transcripción";
            titleEl.style.color = text ? "#0ae98d" : "";
        }

        if (!text) {
            if (st) st.segments = [];
            var infoEl2 = document.getElementById("transcript-info");
            if (infoEl2) infoEl2.textContent = "Sin transcripción cargada";
            if (global.EPUtils) global.EPUtils.hideElement("transcript-stats");
            return;
        }

        var segments = parser ? parser.parseSRT(text) : [];
        if (st) st.segments = segments;
        var wordCount = text.split(/\s+/).filter(function(w) { return w.length > 0; }).length;

        var infoEl3 = document.getElementById("transcript-info");
        if (infoEl3) infoEl3.textContent = "Transcripción cargada — " + segments.length + " segmentos";
        if (global.EPUtils) global.EPUtils.showElement("transcript-stats");
        var wcEl = document.getElementById("transcript-word-count");
        if (wcEl) wcEl.textContent = wordCount + " palabras";
        var scEl = document.getElementById("transcript-segment-count");
        if (scEl) scEl.textContent = segments.length + " segmentos";

        if (segments.length > 0) {
            var last = segments[segments.length - 1];
            var dur = last.endTime || last.startTime || 0;
            var durEl = document.getElementById("transcript-duration");
            if (durEl) durEl.textContent = formatTimeFull(dur);
        }

        if (global.EditorProUI && global.EditorProUI.motionPro && global.EditorProUI.motionPro.updateAnalyzeButton) {
            global.EditorProUI.motionPro.updateAnalyzeButton();
        }
    }

    function renderTranscriptFromSegments() {
        var st = _state();
        if (!st || !st.segments || st.segments.length === 0) { clearRenderedTranscript(); return; }
        var words = [];
        st.segments.forEach(function(seg) {
            var segWords = seg.text.split(/\s+/).filter(function(w) { return w.length > 0; });
            var dur = seg.endTime - seg.startTime;
            var wordDur = segWords.length > 0 ? dur / segWords.length : dur;
            for (var i = 0; i < segWords.length; i++) {
                words.push({ type: "word", text: segWords[i], start: seg.startTime + (i * wordDur), end: seg.startTime + ((i + 1) * wordDur) });
            }
        });
        if (words.length > 0 && global.EditorProUI && global.EditorProUI.recording && global.EditorProUI.recording.renderClickableTranscript) {
            global.EditorProUI.recording.renderClickableTranscript(words);
        }
    }

    function clearRenderedTranscript() {
        var container = document.getElementById("transcript-rendered");
        var textarea = document.getElementById("transcript-input");
        if (container) { container.innerHTML = ""; container.classList.add("hidden"); }
        if (textarea) textarea.classList.remove("hidden");
    }

    // ─── File-based loading ───────────────────────────────────────

    function handleFileSelect(evt) {
        var file = evt.target.files[0];
        if (!file) return;
        if (fs && path) {
            try {
                var content = fs.readFileSync(file.path, "utf8");
                loadTranscriptText(content, file.name);
                _saveLastTranscriptFolder(file.path);
            } catch(e) {
                if (global.EPUtils) global.EPUtils.showToast("Error al leer archivo: " + e.message, "error");
            }
        } else {
            var reader = new FileReader();
            reader.onload = function(e) { loadTranscriptText(e.target.result, file.name); };
            reader.readAsText(file);
        }
        evt.target.value = "";
    }

    function pasteFromClipboard() {
        if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText().then(function(text) {
                if (text && text.trim()) loadTranscriptText(text, "clipboard");
                else if (global.EPUtils) global.EPUtils.showToast("Portapapeles vacío", "info");
            }).catch(function() {
                if (global.EPUtils) global.EPUtils.showToast("No se pudo acceder al portapapeles", "error");
            });
        } else {
            if (global.EPUtils) global.EPUtils.showToast("Pega el texto directamente en el área de texto", "info");
        }
    }

    function handleJsonTranscriptSelect(evt) {
        var file = evt.target.files[0];
        if (!file) return;
        var parser = _parser();

        try {
            var content = fs.readFileSync(file.path, "utf8");
            var data = JSON.parse(content);
            var parsed = null;

            if (data.segments && Array.isArray(data.segments) && data.segments.length > 0 &&
                data.segments[0].words && typeof data.segments[0].start === "number") {
                parsed = parser.parsePremiereTextPanelJson(data);
            } else {
                parsed = parser.parseTranscriptJson(file.path);
            }

            if (!parsed || !parsed.words || parsed.words.length < 3) {
                if (global.EPUtils) global.EPUtils.showToast("No se encontraron palabras válidas en el JSON", "error");
                evt.target.value = "";
                return;
            }

            var _jsonFolder = path.dirname(file.path);
            var st = _state();
            if (st && !st.transcribeFolder) st.transcribeFolder = _jsonFolder;
            localStorage.setItem("editorpro_transcript_folder", _jsonFolder);

            _buildTranscriptCache();

            if (st) {
                st.sttResult = parsed;
                st.lastWhisperResult = parsed;
                st.transcriptJson = data;
            }

            if (global.EditorProUI && global.EditorProUI.recording) {
                global.EditorProUI.recording.refreshTraerTranscriptButtons();
                global.EditorProUI.recording.applySttResultToRecordingNotes(parsed, true);
            }
            if (global.EPUtils) global.EPUtils.hideElement("recording-empty");

            loadTranscriptText(parser.sttResultToSRT(parsed), path.basename(file.path));
            _saveLastTranscriptFolder(file.path);
            if (global.EPUtils) global.EPUtils.showToast("Transcript JSON cargado (" + parsed.words.length + " palabras)", "success");
        } catch(e) {
            if (global.EPUtils) global.EPUtils.showToast("Error al leer JSON: " + e.message, "error");
        }
        evt.target.value = "";
    }

    function copyTranscriptToFolder(sourcePath, seqName) {
        var st = _state();
        if (!fs || !path || !st || !st.transcribeFolder || !seqName) return;
        try {
            var destPath = path.join(st.transcribeFolder, seqName + ".json");
            if (sourcePath !== destPath) fs.copyFileSync(sourcePath, destPath);
        } catch(e) {}
    }

    // ─── Sequence-based caption fetch ────────────────────────────

    function fetchCaptionsFromSequence() {
        var cs = _cs();
        if (!cs) return;
        var parser = _parser();
        var btn = document.getElementById("btn-fetch-captions");
        if (btn) { btn.textContent = "Buscando..."; btn.classList.add("btn-disabled"); }
        var resetBtn = function() {
            if (btn) { btn.textContent = "🎬 Traer de secuencia"; btn.classList.remove("btn-disabled"); }
        };

        cs.evalScript("getSequenceTranscriptInfo()", function(result) {
            try {
                var info = JSON.parse(result);
                if (info.error) {
                    if (global.EPUtils) global.EPUtils.showToast(info.error, "error");
                    resetBtn(); return;
                }

                // Priority 1: Known transcript folders
                var knownFolders = _getTranscriptFolders();
                for (var kf = 0; kf < knownFolders.length; kf++) {
                    if (_tryLoadTranscriptFromFolder(knownFolders[kf], info.sequenceName)) { resetBtn(); return; }
                }

                // Priority 2: Search near project/media files
                var found = parser.findTranscriptFiles(info.projectPath, info.mediaPaths, info.sequenceName);
                if (found) {
                    loadTranscriptText(parser.sttResultToSRT(found.result), path.basename(found.file));
                    _saveLastTranscriptFolder(found.file);
                    resetBtn(); return;
                }

                var embedded = parser.readTranscriptFromProjectFile(info.projectPath);
                if (embedded && embedded.words.length > 5) {
                    loadTranscriptText(parser.sttResultToSRT(embedded), "transcript de Premiere (" + info.sequenceName + ")");
                    resetBtn(); return;
                }

                var captions = parser.readCaptionsFromProjectFile(info.projectPath, info.sequenceId);
                if (captions && captions.length > 0) {
                    var secsToSRT = (global.EPUtils && global.EPUtils.secsToSRTTime) || function(s) { return s + ""; };
                    var capSrt = "";
                    for (var i = 0; i < captions.length; i++) {
                        var cap = captions[i];
                        capSrt += (i + 1) + "\n";
                        capSrt += secsToSRT(cap.startTime) + " --> " + secsToSRT(cap.endTime) + "\n";
                        capSrt += cap.text + "\n\n";
                    }
                    loadTranscriptText(capSrt.trim(), "secuencia (" + captions.length + " captions)");
                    resetBtn(); return;
                }

                resetBtn();
                _showTranscriptExportInstructions();
            } catch(e) {
                resetBtn();
                if (global.EPUtils) global.EPUtils.showToast("Error al buscar transcript: " + e.message, "error");
            }
        });
    }

    function _showTranscriptExportInstructions() {
        var st = _state();
        var seqName = (st && st.sequenceName) || "tu secuencia";
        var esc = (global.EPUtils && global.EPUtils.esc) || function(s) { return s; };
        if (global.EPUtils) {
            global.EPUtils.showInfoModal("Cómo exportar el transcript de Premiere", [
                '<p>Para importar el transcript de la secuencia activa, primero debes exportarlo desde Premiere:</p>',
                '<ol>',
                '<li>Abre el panel <span class="info-step-highlight">Text</span> en Premiere Pro</li>',
                '<li>Ve a la pestaña <span class="info-step-highlight">Transcript</span></li>',
                '<li>Verifica que esté seleccionada la secuencia correcta: <span class="info-path">' + esc(seqName) + '</span></li>',
                '<li>Haz clic en el menú <span class="info-step-highlight">...</span> (tres puntos)</li>',
                '<li>Selecciona <span class="info-step-highlight">Export transcript (JSON)...</span></li>',
                '<li>Guárdalo con el nombre de la secuencia</li>',
                '</ol>',
                '<div class="info-note">',
                '<strong>Tip:</strong> Una vez exportado, haz clic en <strong>Cargar transcript JSON</strong> para seleccionar el archivo, o guárdalo en la carpeta <span class="info-path">Transcribe/</span> junto al proyecto y se cargará automáticamente al cambiar de secuencia.',
                '</div>'
            ].join(""));
        }
    }

    // ─── Expose API ───────────────────────────────────────────────

    global.TranscriptManager = {
        saveLastTranscriptFolder: _saveLastTranscriptFolder,
        getTranscriptFolders: _getTranscriptFolders,
        tryLoadTranscriptFromFolder: _tryLoadTranscriptFromFolder,
        autoLoadTranscriptForSequence: autoLoadTranscriptForSequence,
        loadTranscriptFromPath: _loadTranscriptFromPath,
        buildTranscriptCache: _buildTranscriptCache,
        fetchCaptionsFromSequence: fetchCaptionsFromSequence,
        loadTranscriptText: loadTranscriptText,
        clearTranscript: clearTranscript,
        onTranscriptChange: onTranscriptChange,
        renderTranscriptFromSegments: renderTranscriptFromSegments,
        clearRenderedTranscript: clearRenderedTranscript,
        handleFileSelect: handleFileSelect,
        pasteFromClipboard: pasteFromClipboard,
        handleJsonTranscriptSelect: handleJsonTranscriptSelect,
        copyTranscriptToFolder: copyTranscriptToFolder
    };

    // Backward-compat window._ep* bindings
    global._epLoadTranscriptText = loadTranscriptText;
    global._epOnTranscriptChange = onTranscriptChange;
    global._epRenderTranscriptFromSegments = renderTranscriptFromSegments;
    global._epGetTranscriptFolders = _getTranscriptFolders;
    global._epBuildTranscriptCache = _buildTranscriptCache;
    global._epShowTranscriptExportInstructions = _showTranscriptExportInstructions;
    global._epSaveLastTranscriptFolder = _saveLastTranscriptFolder;
    global._epTryLoadTranscriptFromFolder = _tryLoadTranscriptFromFolder;

    // Bare-global bindings consumed directly by main.js / sequence-controller.js
    // (this used to be provided by the now-removed transcript-cache.js)
    global.autoLoadTranscriptForSequence = autoLoadTranscriptForSequence;
    global.handleJsonTranscriptSelect = handleJsonTranscriptSelect;
    global.copyTranscriptToFolder = copyTranscriptToFolder;

})(window);
