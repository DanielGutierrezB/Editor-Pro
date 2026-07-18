/**
 * transcript-parser.js — All transcript parsing and format conversion logic
 * Handles SRT, .prtranscript, Premiere JSON, caption extraction from .prproj.
 * Exposes: window.TranscriptParser = { parseSRT, sttResultToSRT, ... }
 * Also sets backward-compat window._ep* bindings consumed by UI modules.
 */
(function(global) {
    "use strict";

    var fs, path;
    try { fs = require("fs"); path = require("path"); } catch(e) {}

    var TICKS_PER_SEC = 254016000000;

    // ─── SRT / timestamp text parsing ────────────────────────────

    function parseSRT(text) {
        var segments = [];
        var srtPattern = /(\d+)\r?\n(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})\r?\n([\s\S]*?)(?=\r?\n\r?\n|\r?\n\d+\r?\n|$)/g;
        var match;

        while ((match = srtPattern.exec(text)) !== null) {
            segments.push({
                index: parseInt(match[1]),
                startTime: srtTimeToSeconds(match[2]),
                endTime: srtTimeToSeconds(match[3]),
                text: match[4].replace(/\r?\n/g, " ").trim()
            });
        }
        if (segments.length > 0) return segments;

        var tsPattern = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(.*)/g;
        while ((match = tsPattern.exec(text)) !== null) {
            var h = 0, m = parseInt(match[1]), s = parseInt(match[2]);
            if (match[3]) { h = m; m = s; s = parseInt(match[3]); }
            segments.push({
                index: segments.length + 1,
                startTime: h * 3600 + m * 60 + s,
                endTime: h * 3600 + m * 60 + s + 5,
                text: match[4].trim()
            });
        }
        if (segments.length > 0) return segments;

        var lines = text.split(/\r?\n/).filter(function(l) { return l.trim().length > 0; });
        for (var i = 0; i < lines.length; i++) {
            segments.push({
                index: i + 1,
                startTime: i * 5,
                endTime: (i + 1) * 5,
                text: lines[i].trim()
            });
        }
        return segments;
    }

    function srtTimeToSeconds(timeStr) {
        var parts = timeStr.replace(",", ".").split(":");
        return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    }

    function srtSegmentsToSttResult(segments) {
        var words = [];
        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            var segWords = seg.text.split(/\s+/).filter(function(w) { return w.length > 0; });
            var segDuration = seg.endTime - seg.startTime;
            var wordDur = segWords.length > 0 ? segDuration / segWords.length : segDuration;
            for (var w = 0; w < segWords.length; w++) {
                words.push({
                    type: "word",
                    text: segWords[w],
                    start: seg.startTime + (w * wordDur),
                    end: seg.startTime + ((w + 1) * wordDur)
                });
            }
        }
        var fullText = segments.map(function(s) { return s.text; }).join(" ");
        return { words: words, text: fullText, language: "es" };
    }

    function sttResultToSRT(sttResult) {
        if (!sttResult || !sttResult.words || sttResult.words.length === 0) return "";
        var secsToSRT = (global.EPUtils && global.EPUtils.secsToSRTTime) || _secsToSRTTime;
        var lines = [];
        var chunkSize = 8;
        var words = sttResult.words;
        var idx = 1;
        for (var i = 0; i < words.length; i += chunkSize) {
            var chunk = words.slice(i, Math.min(i + chunkSize, words.length));
            var startTime = chunk[0].start;
            var endTime = chunk[chunk.length - 1].end;
            var text = chunk.map(function(w) { return w.text; }).join(" ");
            lines.push(idx + "\n" + secsToSRT(startTime) + " --> " + secsToSRT(endTime) + "\n" + text + "\n");
            idx++;
        }
        return lines.join("\n");
    }

    // Local fallback in case EPUtils isn't loaded yet (shouldn't happen given load order)
    function _secsToSRTTime(secs) {
        var h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = Math.floor(secs % 60);
        var ms = Math.floor((secs % 1) * 1000);
        function p2(n) { return (n < 10 ? "0" : "") + n; }
        function p3(n) { return (n < 10 ? "00" : n < 100 ? "0" : "") + n; }
        return p2(h) + ":" + p2(m) + ":" + p2(s) + "," + p3(ms);
    }

    function buildTimedTranscript() {
        var state = global._epState;
        if (!state || !state.segments || state.segments.length === 0) return (state && state.transcript) || "";
        return state.segments.map(function(seg) {
            return "[" + seg.startTime.toFixed(1) + "s - " + seg.endTime.toFixed(1) + "s] " + seg.text;
        }).join("\n");
    }

    // ─── Premiere transcript JSON parsers ─────────────────────────

    function parsePrTranscriptData(data) {
        var words = [];
        var textParts = [];
        var segments = data.segmentList || data.segments || [];
        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            var segText = seg.transcript || seg.text || "";
            if (!segText) continue;
            textParts.push(segText);
            var items = seg.items || seg.words || [];
            if (items.length > 0) {
                for (var w = 0; w < items.length; w++) {
                    var item = items[w];
                    if (item.type === "punctuation" && !item.content) continue;
                    var wordText = item.content || item.text || "";
                    if (!wordText.trim()) continue;
                    var wStart = typeof item.startTimeInTicks === "number" ?
                        item.startTimeInTicks / TICKS_PER_SEC : (item.start || 0);
                    var wEnd = typeof item.endTimeInTicks === "number" ?
                        item.endTimeInTicks / TICKS_PER_SEC : (item.end || wStart + 0.1);
                    words.push({ text: wordText, start: wStart, end: wEnd, type: "word" });
                }
            } else {
                var segStart = typeof seg.startTimeInTicks === "number" ?
                    seg.startTimeInTicks / TICKS_PER_SEC : (seg.startTime || seg.start || 0);
                var segEnd = typeof seg.endTimeInTicks === "number" ?
                    seg.endTimeInTicks / TICKS_PER_SEC : (seg.endTime || seg.end || segStart + 1);
                var segWords = segText.split(/\s+/).filter(function(w) { return w.length > 0; });
                var segDur = segEnd - segStart;
                var wordDur = segWords.length > 0 ? segDur / segWords.length : segDur;
                for (var sw = 0; sw < segWords.length; sw++) {
                    words.push({
                        text: segWords[sw],
                        start: segStart + (sw * wordDur),
                        end: segStart + ((sw + 1) * wordDur),
                        type: "word"
                    });
                }
            }
        }
        if (words.length === 0) return null;
        return { words: words, text: textParts.join(" "), language: data.language || "es" };
    }

    function parsePrTranscript(filePath) {
        try {
            var content = fs.readFileSync(filePath, "utf8");
            var data = JSON.parse(content);
            return parsePrTranscriptData(data);
        } catch(e) {
            return null;
        }
    }

    function parsePremiereTextPanelJson(data) {
        var words = [];
        var textParts = [];
        var segs = data.segments || [];
        for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];
            var segWords = seg.words || [];
            var segTextParts = [];
            for (var w = 0; w < segWords.length; w++) {
                var word = segWords[w];
                var txt = (word.text || "").trim();
                if (!txt || word.type === "punctuation") continue;
                var wStart = typeof word.start === "number" ? word.start : 0;
                var wEnd = typeof word.duration === "number" ? wStart + word.duration : wStart + 0.1;
                words.push({ text: txt, start: wStart, end: wEnd, type: "word" });
                segTextParts.push(txt);
            }
            if (segTextParts.length > 0) textParts.push(segTextParts.join(" "));
        }
        if (words.length === 0) return null;
        return { words: words, text: textParts.join(" "), language: data.language || "es" };
    }

    function parsePremiereExportJson(data) {
        var words = [];
        var textParts = [];

        function addItems(items, fallbackStart, fallbackEnd) {
            if (!items || !items.length) return;
            for (var i = 0; i < items.length; i++) {
                var w = items[i];
                var txt = w.value || w.text || w.content || w.word || "";
                if (!txt.trim()) continue;
                if (w.type === "punctuation") continue;
                var s = 0, e = 0;
                if (typeof w.startTime === "number") { s = w.startTime; e = w.endTime || s + 0.1; }
                else if (typeof w.startTimeInTicks === "number") { s = w.startTimeInTicks / TICKS_PER_SEC; e = (w.endTimeInTicks || w.startTimeInTicks) / TICKS_PER_SEC; }
                else if (typeof w.start === "number") { s = w.start; e = w.end || s + 0.1; }
                else { s = fallbackStart; e = fallbackEnd; }
                words.push({ text: txt.trim(), start: s, end: e || s + 0.1, type: "word" });
            }
        }

        var segs = data.transcript || data.segments || (data.results && data.results.items) || [];
        if (!Array.isArray(segs)) segs = [segs];

        for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];
            var segText = seg.transcript || seg.text || seg.value || "";
            if (segText) textParts.push(segText);

            var segItems = seg.words || seg.items || (seg.alternatives && seg.alternatives[0] && seg.alternatives[0].items) || [];
            var sStart = typeof seg.startTime === "number" ? seg.startTime :
                         typeof seg.startTimeInTicks === "number" ? seg.startTimeInTicks / TICKS_PER_SEC :
                         (seg.start || 0);
            var sEnd = typeof seg.endTime === "number" ? seg.endTime :
                       typeof seg.endTimeInTicks === "number" ? seg.endTimeInTicks / TICKS_PER_SEC :
                       (seg.end || sStart + 1);

            if (segItems.length > 0) {
                addItems(segItems, sStart, sEnd);
                if (!segText) {
                    var partText = segItems.map(function(it) { return it.value || it.text || it.content || ""; }).join(" ");
                    if (partText.trim()) textParts.push(partText.trim());
                }
            } else if (segText) {
                var ws = segText.split(/\s+/).filter(function(w) { return w.length > 0; });
                var dur = sEnd - sStart;
                var wd = ws.length > 0 ? dur / ws.length : dur;
                for (var wi = 0; wi < ws.length; wi++) {
                    words.push({ text: ws[wi], start: sStart + wi * wd, end: sStart + (wi + 1) * wd, type: "word" });
                }
            }
        }

        if (words.length === 0) return null;
        return { words: words, text: textParts.join(" "), language: data.language || "es" };
    }

    function parseTranscriptJson(filePath) {
        try {
            var raw = fs.readFileSync(filePath, "utf8");
            var data = JSON.parse(raw);

            if (data.segmentList) return parsePrTranscript(filePath);

            // Formato normalizado propio: {words: [{text,start,end,type}], text, language}
            // (lo guardan Notas de Grabación y Revisar Marcadores tras transcribir)
            if (data.words && Array.isArray(data.words) && data.words.length > 0 &&
                data.words[0] && typeof data.words[0].start === "number" && data.words[0].text !== undefined) {
                return { words: data.words, text: data.text || "", language: data.language || "es" };
            }

            if (data.segments && Array.isArray(data.segments) && data.segments.length > 0 &&
                data.segments[0].words && typeof data.segments[0].start === "number") {
                return parsePremiereTextPanelJson(data);
            }

            if (data.segments && Array.isArray(data.segments)) return parsePrTranscript(filePath);

            if (data.transcript && Array.isArray(data.transcript)) return parsePremiereExportJson(data);
            if (data.results && data.results.items) return parsePremiereExportJson(data);
            if (Array.isArray(data) && data.length > 0 && data[0].words) return parsePremiereExportJson({ segments: data });

            return null;
        } catch(e) {
            return null;
        }
    }

    // ─── Project file extraction ──────────────────────────────────

    function readTranscriptFromProjectFile(projectPath) {
        if (!fs) return null;
        var zlib;
        try { zlib = require("zlib"); } catch(e) { return null; }

        var buf = fs.readFileSync(projectPath);
        var xml;
        try { xml = zlib.gunzipSync(buf).toString("utf8"); } catch(e) { xml = buf.toString("utf8"); }

        // Look for embedded .prtranscript JSON data (segmentList)
        var segListIdx = xml.indexOf('"segmentList"');
        if (segListIdx === -1) segListIdx = xml.indexOf("segmentList");
        if (segListIdx !== -1) {
            var searchStart = Math.max(0, segListIdx - 500);
            var searchEnd = Math.min(xml.length, segListIdx + 100000);
            var xmlWindow = xml.substring(searchStart, searchEnd);
            var jsonMatch = xmlWindow.match(/\{[^{}]*"segmentList"\s*:\s*\[[\s\S]*?\]\s*\}/);
            if (jsonMatch) {
                try {
                    var data = JSON.parse(jsonMatch[0]);
                    if (data.segmentList && data.segmentList.length > 0) {
                        var result = parsePrTranscriptData(data);
                        if (result && result.words.length > 5) return result;
                    }
                } catch(e) {}
            }
        }

        // Look for base64-encoded transcript data blocks
        var b64Pattern = /[A-Za-z0-9+\/=]{200,}/g;
        var b64Match;
        var tried = 0;
        while ((b64Match = b64Pattern.exec(xml)) !== null && tried < 20) {
            tried++;
            try {
                var decoded = Buffer.from(b64Match[0], "base64").toString("utf8");
                if (decoded.indexOf("segmentList") !== -1) {
                    var jsonStart = decoded.indexOf("{");
                    var jsonEnd = decoded.lastIndexOf("}");
                    if (jsonStart !== -1 && jsonEnd > jsonStart) {
                        var jsonStr = decoded.substring(jsonStart, jsonEnd + 1);
                        var data2 = JSON.parse(jsonStr);
                        if (data2.segmentList && data2.segmentList.length > 0) {
                            var result2 = parsePrTranscriptData(data2);
                            if (result2 && result2.words.length > 5) return result2;
                        }
                    }
                }
            } catch(e) {}
        }

        return null;
    }

    function decodeSyntheticCaption(b64) {
        try {
            var buffer = Buffer.from(b64, "base64");
            if (buffer.length < 8) return null;

            var end = buffer.length;
            while (end > 0 && buffer[end - 1] === 0) end--;
            if (end < 8) return null;

            for (var tryLen = 1; tryLen < Math.min(end, 1000); tryLen++) {
                var lenOffset = end - tryLen - 4;
                if (lenOffset < 0) break;
                var readLen = buffer.readUInt32LE(lenOffset);
                if (readLen === tryLen) {
                    var text = buffer.slice(lenOffset + 4, lenOffset + 4 + readLen).toString("utf8");
                    var printable = 0;
                    for (var c = 0; c < text.length; c++) {
                        var code = text.charCodeAt(c);
                        if (code >= 0x20 && code < 0xFFFE) printable++;
                    }
                    if (printable > text.length * 0.7 && text.trim().length > 0) return text.trim();
                }
            }

            var lastChunk = buffer.slice(Math.max(0, end - 500), end).toString("utf8");
            var readable = lastChunk.match(/[\x20-\x7E -￿]{2,}/g);
            if (readable && readable.length > 0) return readable[readable.length - 1].trim();

            return null;
        } catch(e) {
            return null;
        }
    }

    function readCaptionsFromProjectFile(projectPath, sequenceId) {
        if (!fs) return null;
        var zlib;
        try { zlib = require("zlib"); } catch(e) { return null; }

        var buf = fs.readFileSync(projectPath);
        var xml;
        try { xml = zlib.gunzipSync(buf).toString("utf8"); } catch(e) { xml = buf.toString("utf8"); }

        var captions = [];

        // Phase 1: Collect SyntheticCaption base64 blocks
        var captionDataList = [];
        var SC_MARKER = "SyntheticCaption";
        var searchPos = 0;
        while (true) {
            var scIdx = xml.indexOf(SC_MARKER, searchPos);
            if (scIdx === -1) break;
            var after = scIdx + SC_MARKER.length;
            while (after < xml.length && " \t\r\n".indexOf(xml[after]) !== -1) after++;
            if (after < xml.length && xml[after] === "0") {
                after++;
                while (after < xml.length && " \t\r\n".indexOf(xml[after]) !== -1) after++;
                var b64Start = after;
                while (after < xml.length && "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(xml[after]) !== -1) after++;
                var b64 = xml.substring(b64Start, after);
                if (b64.length > 50) captionDataList.push({ b64: b64, pos: scIdx });
            }
            searchPos = scIdx + 1;
        }

        // Phase 1b: XML tag-based fallback
        if (captionDataList.length === 0) {
            var tagMarkers = ["<CaptionText>", "<SubType>SyntheticCaption</SubType>"];
            for (var m = 0; m < tagMarkers.length && captionDataList.length === 0; m++) {
                var tIdx = 0;
                while (true) {
                    tIdx = xml.indexOf(tagMarkers[m], tIdx);
                    if (tIdx === -1) break;
                    var xmlChunk = xml.substring(Math.max(0, tIdx - 500), Math.min(xml.length, tIdx + 5000));
                    var b64Match = xmlChunk.match(/[A-Za-z0-9+\/=]{100,}/g);
                    if (b64Match) {
                        for (var bm = 0; bm < b64Match.length; bm++) captionDataList.push({ b64: b64Match[bm], pos: tIdx });
                    }
                    tIdx++;
                }
            }
        }

        if (captionDataList.length === 0) return captions;

        // Phase 2: Collect timing data
        var timings = [];
        var TM_MARKER = "BE.Prefs.LabelColors.7";
        searchPos = 0;
        while (true) {
            var tmIdx = xml.indexOf(TM_MARKER, searchPos);
            if (tmIdx === -1) break;
            var tmAfter = tmIdx + TM_MARKER.length;
            var tmWindow = xml.substring(tmAfter, Math.min(xml.length, tmAfter + 200));
            var tmMatch = tmWindow.match(/^\s+(\d{12,})\s+(\d{12,})\s+[0-9a-f-]{36}/);
            if (tmMatch) timings.push({ start: parseInt(tmMatch[1], 10), end: parseInt(tmMatch[2], 10), pos: tmIdx });
            searchPos = tmIdx + 1;
        }

        if (timings.length === 0) {
            var tickPattern = /(\d{12,})\s+(\d{12,})\s+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
            var tkm;
            while ((tkm = tickPattern.exec(xml)) !== null) {
                var s = parseInt(tkm[1], 10), e = parseInt(tkm[2], 10);
                if (s < e && s >= 0 && e < 100 * 60 * 60 * TICKS_PER_SEC) timings.push({ start: s, end: e, pos: tkm.index });
            }
        }

        // Phase 3: Match captions to timings (position-based)
        var usedTimings = {};
        for (var i = 0; i < captionDataList.length; i++) {
            var cd = captionDataList[i];
            var text = decodeSyntheticCaption(cd.b64);
            if (!text || text.length === 0) continue;

            var bestTiming = null;
            var bestDist = Infinity;
            for (var t = 0; t < timings.length; t++) {
                if (usedTimings[t]) continue;
                var dist = cd.pos - timings[t].pos;
                if (dist > 0 && dist < bestDist && dist < 5000) { bestDist = dist; bestTiming = t; }
            }
            if (bestTiming !== null) {
                captions.push({ text: text, startTime: timings[bestTiming].start / TICKS_PER_SEC, endTime: timings[bestTiming].end / TICKS_PER_SEC });
                usedTimings[bestTiming] = true;
            }
        }

        // Strategy B: Sequential matching fallback
        if (captions.length === 0 && captionDataList.length > 0 && timings.length > 0) {
            timings.sort(function(a, b) { return a.pos - b.pos; });
            captionDataList.sort(function(a, b) { return a.pos - b.pos; });
            var tIdx2 = 0;
            for (var j = 0; j < captionDataList.length; j++) {
                var txt = decodeSyntheticCaption(captionDataList[j].b64);
                if (!txt) continue;
                if (tIdx2 < timings.length) {
                    captions.push({ text: txt, startTime: timings[tIdx2].start / TICKS_PER_SEC, endTime: timings[tIdx2].end / TICKS_PER_SEC });
                    tIdx2++;
                } else {
                    captions.push({ text: txt, startTime: 0, endTime: 0 });
                }
            }
        }

        // Strategy C: Dummy times if no timings
        if (captions.length === 0 && captionDataList.length > 0) {
            for (var k = 0; k < captionDataList.length; k++) {
                var txt2 = decodeSyntheticCaption(captionDataList[k].b64);
                if (txt2) captions.push({ text: txt2, startTime: k, endTime: k + 1 });
            }
        }

        captions.sort(function(a, b) { return a.startTime - b.startTime; });
        return captions;
    }

    function findTranscriptFiles(projectPath, mediaPaths, sequenceName) {
        if (!fs || !path) return null;

        var projectDir = path.dirname(projectPath);
        var seqLower = (sequenceName || "").toLowerCase();

        function fileMatchesSequence(filePath) {
            if (!seqLower) return true;
            var baseName = path.basename(filePath).replace(/\.[^.]+$/, "").toLowerCase();
            return baseName.indexOf(seqLower) === 0 || seqLower.indexOf(baseName) === 0;
        }

        // Phase 1: .prtranscript next to media files
        for (var mp = 0; mp < (mediaPaths || []).length; mp++) {
            var prt = mediaPaths[mp] + ".prtranscript";
            try {
                if (fs.existsSync(prt)) {
                    var parsed = parsePrTranscript(prt);
                    if (parsed && parsed.words.length > 5) return { type: "prtranscript", result: parsed, file: prt };
                }
            } catch(e) {}
            var noExtBase = mediaPaths[mp].replace(/\.[^.]+$/, "");
            var prt2 = noExtBase + ".prtranscript";
            try {
                if (prt2 !== prt && fs.existsSync(prt2)) {
                    var parsed2 = parsePrTranscript(prt2);
                    if (parsed2 && parsed2.words.length > 5) return { type: "prtranscript", result: parsed2, file: prt2 };
                }
            } catch(e) {}
        }

        // Phase 2: Scan project dir and media dirs
        var candidates = [];
        var SKIP = { "node_modules": 1, ".git": 1, "Adobe Premiere Pro Auto-Save": 1 };
        var VALID_EXTS = { ".srt": 1, ".prtranscript": 1, ".json": 1 };

        function scanDir(dir, depth) {
            if (depth > 2) return;
            try {
                var entries = fs.readdirSync(dir);
                for (var i = 0; i < entries.length; i++) {
                    var fullPath = path.join(dir, entries[i]);
                    var ext = path.extname(entries[i]).toLowerCase();
                    try {
                        var stat = fs.statSync(fullPath);
                        if (stat.isFile() && VALID_EXTS[ext]) {
                            candidates.push({ path: fullPath, ext: ext, mtime: stat.mtimeMs || 0 });
                        } else if (stat.isDirectory() && depth < 2 && !SKIP[entries[i]]) {
                            scanDir(fullPath, depth + 1);
                        }
                    } catch(e) {}
                }
            } catch(e) {}
        }

        scanDir(projectDir, 0);
        var mediaDirs = {};
        for (var m = 0; m < (mediaPaths || []).length; m++) {
            var mDir = path.dirname(mediaPaths[m]);
            if (!mediaDirs[mDir] && mDir !== projectDir) { mediaDirs[mDir] = true; scanDir(mDir, 1); }
        }

        function tryFiles(ext, maxTries, parseFn) {
            var files = candidates.filter(function(c) { return c.ext === ext; });
            if (files.length === 0) return null;
            var matching = seqLower ? files.filter(function(f) { return fileMatchesSequence(f.path); }) : files;
            if (matching.length === 0) return null;
            matching.sort(function(a, b) { return b.mtime - a.mtime; });
            for (var i = 0; i < Math.min(matching.length, maxTries); i++) {
                var result = parseFn(matching[i]);
                if (result) return result;
            }
            return null;
        }

        var prtResult = tryFiles(".prtranscript", 3, function(f) {
            var p = parsePrTranscript(f.path);
            return (p && p.words.length > 5) ? { type: "prtranscript", result: p, file: f.path } : null;
        });
        if (prtResult) return prtResult;

        var jsonResult = tryFiles(".json", 5, function(f) {
            var p = parseTranscriptJson(f.path);
            return (p && p.words.length > 5) ? { type: "json", result: p, file: f.path } : null;
        });
        if (jsonResult) return jsonResult;

        var srtResult = tryFiles(".srt", 5, function(f) {
            try {
                var content = fs.readFileSync(f.path, "utf8");
                var segments = parseSRT(content);
                if (segments && segments.length > 3) return { type: "srt", result: srtSegmentsToSttResult(segments), file: f.path };
            } catch(e) {}
            return null;
        });
        if (srtResult) return srtResult;

        return null;
    }

    // ─── FCP XML text clip parser ─────────────────────────────────

    function parseTextClipsFromXML(xmlPath) {
        if (!fs) return [];
        try {
            var xml = fs.readFileSync(xmlPath, "utf8");
            var clips = [];

            var tbMatch = xml.match(/<sequence[^>]*>[\s\S]*?<rate>\s*<timebase>(\d+)<\/timebase>\s*<ntsc>(TRUE|FALSE)<\/ntsc>/);
            var timebase = tbMatch ? parseInt(tbMatch[1]) : 24;
            var isNtsc = tbMatch ? tbMatch[2] === "TRUE" : false;
            var fps = isNtsc ? timebase * 1000 / 1001 : timebase;

            var trackRegex = /<track[^>]*>[\s\S]*?<\/track>/g;
            var trackMatch;
            var trackIdx = 0;

            while ((trackMatch = trackRegex.exec(xml)) !== null) {
                var trackXml = trackMatch[0];
                if (trackXml.indexOf("<clipitem") === -1) continue;

                var clipRegex = /<clipitem[^>]*>([\s\S]*?)<\/clipitem>/g;
                var clipMatch;

                while ((clipMatch = clipRegex.exec(trackXml)) !== null) {
                    var clipXml = clipMatch[1];
                    if (clipXml.indexOf("GraphicAndType") === -1) continue;

                    var nameMatch = clipXml.match(/<filter>\s*<effect>\s*<name>([^<]+)<\/name>\s*<effectid>GraphicAndType<\/effectid>/);
                    if (!nameMatch) continue;

                    var text = nameMatch[1].trim();
                    if (!text || text.length === 0) continue;

                    var startMatch = clipXml.match(/<start>(\d+)<\/start>/);
                    var endMatch = clipXml.match(/<end>(\d+)<\/end>/);

                    var startFrame = startMatch ? parseInt(startMatch[1]) : 0;
                    var endFrame = endMatch ? parseInt(endMatch[1]) : startFrame + 120;

                    clips.push({
                        clipName: text,
                        text: text,
                        startTime: startFrame / fps,
                        endTime: endFrame / fps,
                        trackIndex: trackIdx
                    });
                }
                trackIdx++;
            }

            return clips;
        } catch(e) {
            console.log("Error parsing XML:", e.message);
            return [];
        }
    }

    // ─── Expose API ───────────────────────────────────────────────

    global.TranscriptParser = {
        parseSRT: parseSRT,
        srtTimeToSeconds: srtTimeToSeconds,
        srtSegmentsToSttResult: srtSegmentsToSttResult,
        sttResultToSRT: sttResultToSRT,
        buildTimedTranscript: buildTimedTranscript,
        parsePrTranscript: parsePrTranscript,
        parsePrTranscriptData: parsePrTranscriptData,
        parseTranscriptJson: parseTranscriptJson,
        parsePremiereTextPanelJson: parsePremiereTextPanelJson,
        parsePremiereExportJson: parsePremiereExportJson,
        readTranscriptFromProjectFile: readTranscriptFromProjectFile,
        readCaptionsFromProjectFile: readCaptionsFromProjectFile,
        decodeSyntheticCaption: decodeSyntheticCaption,
        findTranscriptFiles: findTranscriptFiles,
        parseTextClipsFromXML: parseTextClipsFromXML
    };

    // Backward-compat window._ep* bindings
    global._epParseSRT = parseSRT;
    global._epSrtTimeToSeconds = srtTimeToSeconds;
    global._epSrtSegmentsToSttResult = srtSegmentsToSttResult;
    global._epSttResultToSRT = sttResultToSRT;
    global._epBuildTimedTranscript = buildTimedTranscript;
    global._epParseTranscriptJson = parseTranscriptJson;
    global._epFindTranscriptFiles = findTranscriptFiles;
    global._epReadTranscriptFromProjectFile = readTranscriptFromProjectFile;
    global._epReadCaptionsFromProjectFile = readCaptionsFromProjectFile;
    global._epParseTextClipsFromXML = parseTextClipsFromXML;

})(window);
