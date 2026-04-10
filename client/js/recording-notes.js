/**
 * Recording Notes Module — Core Logic
 *
 * Detects IN/OUT keywords from transcription,
 * builds segments, and generates Premiere markers
 * compatible with the Cortes Automáticos tool.
 */

(function(global) {
    "use strict";

    // ─── Keyword Patterns ────────────────────────────────────────
    // Literal patterns: the professor is instructed to say specific words.
    //   IN  → "retomemos", "retoma", or a countdown "3, 2, 1"
    //   OUT → "pausa"
    // We keep it strict to avoid false positives from normal speech.

    var IN_PATTERNS = [
        /\bretomemos\b/i,
        /\bretoma\b/i,
        /\bretomamos\b/i
    ];

    var OUT_PATTERNS = [
        /\bpausa\b/i,
        /\bcorte\b/i,
        /\bcorta\b/i,
        /\balto\b/i,
        /\bpara\b/i
    ];

    // Countdown number map — digits and Spanish words
    var COUNTDOWN_MAP = {
        "1": 1, "uno": 1,
        "2": 2, "dos": 2,
        "3": 3, "tres": 3,
        "4": 4, "cuatro": 4,
        "5": 5, "cinco": 5
    };

    // Words to exclude from the "first phrase" / "last phrase" to keep content clean
    var FILLER_WORDS = /^(bueno|ok|okay|entonces|este|eh|ah|em|mmm|ajá|sí|dale|listo|bien|a ver|pues|mira|oye)\s*/i;

    var MIN_SEGMENT_DURATION = 5;

    // Phrases that indicate the professor abandoned or corrected the take
    var SELF_CORRECTION_PATTERNS = [
        /\bme equivoqu[eé]\b/i,
        /\bno,?\s*no\s*es cierto\b/i,
        /\b¿?sabes qu[eé]\??\s*$/i,
        /\bperdón\b/i,
        /\bvoy a repetir\b/i
    ];

    // Words ending in "--" or "..." indicate incomplete/stuttered speech
    var INCOMPLETE_WORD = /[-–—]{1,2}$|\.{2,}$/;

    // ─── RecordingNotes Constructor ──────────────────────────────

    function RecordingNotes() {
        this.words = [];
        this.fullText = "";
        this.segments = [];
        this.takeGroups = [];
        this.markers = [];
    }

    /**
     * Load transcription data from STT result
     */
    RecordingNotes.prototype.loadTranscription = function(sttResult) {
        this.words = sttResult.words || [];
        this.fullText = sttResult.text || "";
        this.segments = [];
        this.takeGroups = [];
        this.markers = [];
    };

    /**
     * Detect IN/OUT keywords and build segments.
     * Returns { inPoints, outPoints, segments, highlightedText }
     */
    RecordingNotes.prototype.detectSegments = function() {
        if (!this.words || this.words.length === 0) {
            return { inPoints: [], outPoints: [], segments: [], error: "No hay transcripción cargada." };
        }

        var inPoints = [];
        var outPoints = [];

        // Track which word indices are part of a countdown (to avoid double-detecting)
        var countdownIndices = {};

        // ── Pass 1: Detect countdowns (e.g. "3, 2, 1" or "3, 2...") ──
        // Scan forward: find a number >= 2 and follow the descending sequence.
        // Supports both complete ("3,2,1") and partial ("3,2...") countdowns.
        var usedInCountdown = {};
        for (var ci = 0; ci < this.words.length; ci++) {
            if (usedInCountdown[ci]) continue;
            var cw = this.words[ci];
            if (cw.type !== "word") continue;
            var cwText = cw.text.toLowerCase().replace(/[.,!?;:…"""'']/g, "").trim();
            var startNum = COUNTDOWN_MAP[cwText];
            if (!startNum || startNum < 2) continue;

            // Found a number >= 2, scan forward for descending sequence
            var seq = [ci];
            var expectedNext = startNum - 1;
            for (var cf = ci + 1; cf < this.words.length && expectedNext >= 1; cf++) {
                var fw = this.words[cf];
                if (fw.type !== "word") continue;
                var fwText = fw.text.toLowerCase().replace(/[.,!?;:…"""'']/g, "").trim();
                var fwNum = COUNTDOWN_MAP[fwText];
                if (fwNum === expectedNext) {
                    seq.push(cf);
                    expectedNext--;
                } else {
                    break;
                }
            }

            // Need at least 2 descending numbers and max 5 seconds span
            if (seq.length >= 2) {
                var firstWord = this.words[seq[0]];
                var lastWord = this.words[seq[seq.length - 1]];
                if (lastWord.end - firstWord.start <= 5) {
                    for (var si = 0; si < seq.length; si++) {
                        countdownIndices[seq[si]] = true;
                        usedInCountdown[seq[si]] = true;
                    }
                    inPoints.push({
                        time: lastWord.end,
                        endTime: lastWord.end,
                        wordIndex: seq[seq.length - 1],
                        triggerWord: seq.map(function(idx) { return this.words[idx].text; }.bind(this)).join(", ")
                    });
                }
            }
        }

        // ── Pass 2: Scan individual words for literal keyword triggers ──
        for (var i = 0; i < this.words.length; i++) {
            if (countdownIndices[i]) continue;

            var w = this.words[i];
            if (w.type !== "word") continue;

            // Strip punctuation so "Pausa." / "retomemos," still match
            var wordClean = w.text.toLowerCase().replace(/[.,!?;:…"""'']/g, "").trim();
            if (!wordClean) continue;

            // Check IN patterns
            var isIn = false;
            for (var ip = 0; ip < IN_PATTERNS.length; ip++) {
                if (IN_PATTERNS[ip].test(wordClean)) {
                    isIn = true;
                    break;
                }
            }

            if (isIn) {
                inPoints.push({
                    time: w.start,
                    endTime: w.end,
                    wordIndex: i,
                    triggerWord: wordClean
                });
                continue;
            }

            // Check OUT patterns
            var isOut = false;
            for (var op = 0; op < OUT_PATTERNS.length; op++) {
                if (OUT_PATTERNS[op].test(wordClean)) {
                    isOut = true;
                    break;
                }
            }

            if (isOut) {
                outPoints.push({
                    time: w.start,
                    endTime: w.end,
                    wordIndex: i,
                    triggerWord: wordClean
                });
            }
        }

        // Sort IN points by time (countdowns may be out of order with keyword triggers)
        inPoints.sort(function(a, b) { return a.time - b.time; });

        // Remove duplicate triggers that are too close together (< 2 seconds)
        inPoints = deduplicatePoints(inPoints, 2);
        outPoints = deduplicatePoints(outPoints, 2);

        // Build segments: pair IN → next OUT
        var segments = this._buildSegments(inPoints, outPoints);

        // Post-process: filter bad segments and group re-takes
        this._postProcessSegments(segments);
        this.segments = segments;

        var takeGroups = this._groupRetakes(segments);
        this.takeGroups = takeGroups;

        // Build highlighted text for preview (include countdown words as IN highlights)
        var highlightedText = this._buildHighlightedText(inPoints, outPoints, countdownIndices);

        var filteredCount = 0;
        var retakeGroupCount = 0;
        for (var fc = 0; fc < segments.length; fc++) { if (segments[fc].filtered) filteredCount++; }
        for (var gc = 0; gc < takeGroups.length; gc++) { if (takeGroups[gc].takes.length > 1) retakeGroupCount++; }

        return {
            inPoints: inPoints,
            outPoints: outPoints,
            segments: segments,
            takeGroups: takeGroups,
            filteredCount: filteredCount,
            retakeGroupCount: retakeGroupCount,
            highlightedText: highlightedText
        };
    };

    /**
     * Build segments from IN/OUT pairs.
     * Nested-IN rule: if multiple INs appear before the next OUT,
     * only the innermost (last) IN is kept for that OUT.
     */
    RecordingNotes.prototype._buildSegments = function(inPoints, outPoints) {
        var segments = [];
        var self = this;
        var usedOuts = {};

        // Pre-process: resolve nested INs.
        // Walk through sorted inPoints; for each IN, find the next OUT after it.
        // If another IN appears before that OUT, skip the current IN (use the inner one).
        var resolvedPairs = [];
        var outCopy = outPoints.slice();

        for (var i = 0; i < inPoints.length; i++) {
            var inPt = inPoints[i];
            var nextIn = (i + 1 < inPoints.length) ? inPoints[i + 1] : null;

            // Find the first unused OUT after this IN
            var outPt = null;
            for (var o = 0; o < outCopy.length; o++) {
                if (outCopy[o].time > inPt.time + 0.5) {
                    outPt = outCopy[o];
                    break;
                }
            }

            // If there's a next IN before this OUT, skip this IN (use the inner one)
            if (nextIn && outPt && nextIn.time < outPt.time) {
                continue;
            }

            if (!outPt) {
                var endTime = (this.words.length > 0) ? this.words[this.words.length - 1].end : 0;
                outPt = { time: endTime, wordIndex: this.words.length - 1, triggerWord: "(fin)" };
            }

            resolvedPairs.push({ inPt: inPt, outPt: outPt });

            // Remove used OUT so it's not reused
            var usedIdx = outCopy.indexOf(outPt);
            if (usedIdx !== -1) outCopy.splice(usedIdx, 1);
        }

        for (var p = 0; p < resolvedPairs.length; p++) {
            var pair = resolvedPairs[p];
            var inPt = pair.inPt;
            var outPt = pair.outPt;

            var contentStartIdx = inPt.wordIndex + 1;
            while (contentStartIdx < this.words.length && contentStartIdx < outPt.wordIndex) {
                var nextWord = this.words[contentStartIdx];
                if (nextWord.type !== "word") { contentStartIdx++; continue; }
                if (FILLER_WORDS.test(nextWord.text.trim())) { contentStartIdx++; continue; }
                break;
            }

            var contentEndIdx = outPt.wordIndex - 1;
            var contentWords = [];
            for (var w = contentStartIdx; w <= contentEndIdx && w < this.words.length; w++) {
                if (this.words[w].type === "word") {
                    contentWords.push(this.words[w]);
                }
            }

            var fullText = contentWords.map(function(cw) { return cw.text; }).join(" ").trim();
            var firstPhrase = extractPhrase(contentWords, "first", 10);
            var lastPhrase = extractPhrase(contentWords, "last", 10);

            var PRE_ROLL = 0.4;
            var POST_ROLL = 0.3;
            var rawInTime = contentWords.length > 0 ? contentWords[0].start : inPt.endTime;
            var rawOutTime = contentWords.length > 0 ? contentWords[contentWords.length - 1].end : outPt.time;
            var earliestIn = inPt.time || 0;
            var inTime = Math.max(earliestIn, rawInTime - PRE_ROLL);
            var outTime = Math.min(rawOutTime + POST_ROLL, outPt.time);

            segments.push({
                index: segments.length + 1,
                inTime: inTime,
                outTime: outTime,
                inTrigger: inPt.triggerWord,
                outTrigger: outPt.triggerWord,
                fullText: fullText,
                firstPhrase: firstPhrase,
                lastPhrase: lastPhrase,
                wordCount: contentWords.length,
                duration: outTime - inTime
            });
        }

        return segments;
    };

    // ─── Post-Processing ──────────────────────────────────────────

    RecordingNotes.prototype._postProcessSegments = function(segments) {
        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            seg.filtered = false;
            seg.filterReason = "";
            seg.retakeGroup = -1;
            seg.recommended = true;

            // Empty content
            if (seg.wordCount === 0 || !seg.fullText.trim()) {
                seg.filtered = true;
                seg.filterReason = "vacía";
                continue;
            }

            // Too short
            if (seg.duration < MIN_SEGMENT_DURATION) {
                seg.filtered = true;
                seg.filterReason = "< " + MIN_SEGMENT_DURATION + "s";
                continue;
            }

            // Incomplete ending (stuttered word like "skil--", "confidera--")
            var lastWords = seg.fullText.trim().split(/\s+/);
            if (lastWords.length > 0 && INCOMPLETE_WORD.test(lastWords[lastWords.length - 1])) {
                seg.filtered = true;
                seg.filterReason = "incompleta";
                continue;
            }

            // Self-correction phrase at the end of the segment
            var tailText = lastWords.slice(-8).join(" ");
            for (var sc = 0; sc < SELF_CORRECTION_PATTERNS.length; sc++) {
                if (SELF_CORRECTION_PATTERNS[sc].test(tailText)) {
                    seg.filtered = true;
                    seg.filterReason = "autocorrección";
                    break;
                }
            }
        }
    };

    RecordingNotes.prototype._groupRetakes = function(segments) {
        var validSegs = [];
        for (var i = 0; i < segments.length; i++) {
            if (!segments[i].filtered) validSegs.push(segments[i]);
        }

        // Build word sets for first-phrase comparison (first 6 meaningful words)
        var phraseSets = [];
        for (var v = 0; v < validSegs.length; v++) {
            var words = (validSegs[v].firstPhrase || "").toLowerCase()
                .replace(/[.,!?;:…"""''¿¡]/g, "").split(/\s+/)
                .filter(function(w) { return w.length > 2; })
                .slice(0, 6);
            phraseSets.push({ seg: validSegs[v], words: words });
        }

        // Group by similarity using Jaccard index
        var assigned = {};
        var groups = [];

        for (var a = 0; a < phraseSets.length; a++) {
            if (assigned[phraseSets[a].seg.index]) continue;

            var group = [phraseSets[a].seg];
            assigned[phraseSets[a].seg.index] = true;

            for (var b = a + 1; b < phraseSets.length; b++) {
                if (assigned[phraseSets[b].seg.index]) continue;
                if (jaccardSimilarity(phraseSets[a].words, phraseSets[b].words) >= 0.4) {
                    group.push(phraseSets[b].seg);
                    assigned[phraseSets[b].seg.index] = true;
                }
            }

            groups.push(group);
        }

        // Mark segments: last take in each group is recommended
        var takeGroups = [];
        for (var g = 0; g < groups.length; g++) {
            var grp = groups[g];
            var lastIdx = grp.length - 1;
            var takes = [];

            for (var t = 0; t < grp.length; t++) {
                grp[t].retakeGroup = g;
                grp[t].retakeNum = t + 1;
                grp[t].retakeTotal = grp.length;
                grp[t].recommended = (t === lastIdx);
                takes.push({
                    segIndex: grp[t].index,
                    inTime: grp[t].inTime,
                    outTime: grp[t].outTime,
                    duration: grp[t].duration,
                    firstPhrase: grp[t].firstPhrase,
                    recommended: grp[t].recommended
                });
            }

            takeGroups.push({
                groupIndex: g,
                topic: grp[lastIdx].firstPhrase || "",
                takes: takes
            });
        }

        return takeGroups;
    };

    /**
     * Build HTML text with keywords highlighted
     */
    RecordingNotes.prototype._buildHighlightedText = function(inPoints, outPoints, countdownIndices) {
        if (!this.words || this.words.length === 0) return "";

        var inSet = {};
        var outSet = {};
        inPoints.forEach(function(p) { inSet[p.wordIndex] = true; });
        outPoints.forEach(function(p) { outSet[p.wordIndex] = true; });
        if (countdownIndices) {
            for (var ci in countdownIndices) { inSet[ci] = true; }
        }

        var parts = [];
        for (var i = 0; i < this.words.length; i++) {
            var w = this.words[i];
            var text = w.text || "";

            if (w.type !== "word") {
                parts.push(text);
                continue;
            }

            if (inSet[i]) {
                parts.push('<span class="keyword-in">' + escHtml(text) + '</span>');
            } else if (outSet[i]) {
                parts.push('<span class="keyword-out">' + escHtml(text) + '</span>');
            } else {
                parts.push(escHtml(text));
            }

            if (i < this.words.length - 1) parts.push(" ");
        }

        return parts.join("");
    };

    /**
     * Apply AI take analysis results to generate final markers.
     * Only 2 markers per take: IN + OUT. No separate [TOMA] marker.
     * Takes are numbered per group (Toma 1, Toma 2...).
     * @param {object} aiResult - Result from AIAnalyzer.analyzeTakes()
     * @returns {object} { markers, takeGroups }
     */
    RecordingNotes.prototype.applyTakeAnalysis = function(aiResult) {
        if (!aiResult || aiResult.error) {
            return { error: aiResult ? aiResult.error : "Sin resultado de IA" };
        }

        var groups = aiResult.groups || [];
        var markers = [];
        var takeGroups = [];

        for (var g = 0; g < groups.length; g++) {
            var group = groups[g];
            var takes = group.takes || [];

            var takeGroupInfo = {
                topic: group.topic || "Toma " + (g + 1),
                description: group.description || "",
                continuityNote: group.continuityNote || "",
                takes: []
            };

            for (var t = 0; t < takes.length; t++) {
                var take = takes[t];
                var segIdx = (take.segmentIndex || 1) - 1;
                var seg = this.segments[segIdx];

                if (!seg) continue;

                // Skip filtered segments when coming from AI analysis too
                if (seg.filtered) continue;

                var takeNum = take.takeNumber || (t + 1);
                var comment = take.comment || group.topic;
                var hasManyTakes = takes.length > 1;
                var durText = "(" + seg.duration.toFixed(1) + "s)";
                var firstPhrase = seg.firstPhrase || seg.fullText.substring(0, 60);

                var inName = hasManyTakes
                    ? "Toma " + takeNum + " - " + comment
                    : comment;
                var inComment = (hasManyTakes ? "Toma " + takeNum + " " : "") + durText + " - " + firstPhrase;

                markers.push({
                    time: seg.inTime,
                    endTime: seg.inTime + 10,
                    name: inName,
                    comment: inComment,
                    color: 0
                });

                markers.push({
                    time: seg.outTime,
                    name: "OUT",
                    comment: "OUT: " + (seg.lastPhrase || ""),
                    color: 1
                });

                takeGroupInfo.takes.push({
                    label: "Toma " + takeNum,
                    segmentIndex: segIdx + 1,
                    inTime: seg.inTime,
                    outTime: seg.outTime,
                    duration: seg.duration,
                    comment: comment,
                    variation: take.variation || "",
                    firstPhrase: seg.firstPhrase,
                    lastPhrase: seg.lastPhrase
                });
            }

            if (takeGroupInfo.takes.length > 0) {
                takeGroups.push(takeGroupInfo);
            }
        }

        this.takeGroups = takeGroups;
        this.markers = markers;

        return { markers: markers, takeGroups: takeGroups };
    };

    /**
     * Generate markers only for active segments.
     * A segment is active if: _userOverride === true, OR (not filtered AND recommended AND no _userOverride === false).
     */
    RecordingNotes.prototype.generateSimpleMarkers = function() {
        var markers = [];
        var markerNum = 0;

        for (var i = 0; i < this.segments.length; i++) {
            var seg = this.segments[i];
            if (!this._isActive(seg)) continue;

            markerNum++;
            var durText = "(" + seg.duration.toFixed(1) + "s)";
            var firstPhrase = seg.firstPhrase || seg.fullText.substring(0, 60);

            var takeLabel = "Toma " + markerNum;
            if (seg.retakeTotal > 1) {
                takeLabel += " [mejor de " + seg.retakeTotal + "]";
            }

            var viewTag = seg._viewTag ? " [" + seg._viewTag + "]" : "";
            var inName = "[RN]" + viewTag + " " + takeLabel + " - " + firstPhrase;
            var inComment = takeLabel + " " + durText + " - " + firstPhrase;
            markers.push({
                time: seg.inTime,
                endTime: seg.inTime + 10,
                name: inName,
                comment: inComment,
                color: 0
            });

            markers.push({
                time: seg.outTime,
                name: "[RN] OUT",
                comment: "OUT: " + (seg.lastPhrase || ""),
                color: 1
            });
        }

        markers.sort(function(a, b) { return a.time - b.time; });

        var cleaned = [];
        for (var ci = 0; ci < markers.length; ci++) {
            var m = markers[ci];
            var isIn = m.name.indexOf("OUT") === -1;
            var prevIsIn = cleaned.length > 0 && cleaned[cleaned.length - 1].name.indexOf("OUT") === -1;

            if (cleaned.length > 0 && isIn && prevIsIn) {
                cleaned.pop();
            }
            cleaned.push(m);
        }
        markers = cleaned;

        this.markers = markers;
        return markers;
    };

    RecordingNotes.prototype._isActive = function(seg) {
        if (seg._userOverride !== undefined) return seg._userOverride;
        return !seg.filtered && seg.recommended;
    };

    /**
     * Get only the active segments (for cutting and markers).
     */
    RecordingNotes.prototype.getRecommendedSegments = function() {
        var result = [];
        for (var i = 0; i < this.segments.length; i++) {
            if (this._isActive(this.segments[i])) result.push(this.segments[i]);
        }
        return result;
    };

    /**
     * Export markers as text for clipboard
     */
    RecordingNotes.prototype.exportAsText = function() {
        var lines = [];

        if (this.takeGroups.length > 0) {
            this.takeGroups.forEach(function(group) {
                lines.push("=== " + group.topic + " ===");
                if (group.description) lines.push("  " + group.description);
                if (group.continuityNote) lines.push("  Continuidad: " + group.continuityNote);
                group.takes.forEach(function(take) {
                    lines.push("  " + take.label + " [" + formatTimeTC(take.inTime) + " → " + formatTimeTC(take.outTime) + "] " +
                        "(" + take.duration.toFixed(1) + "s)");
                    lines.push("    IN: " + take.comment + " - " + take.firstPhrase);
                    lines.push("    OUT: " + take.lastPhrase);
                    if (take.variation) lines.push("    Variación: " + take.variation);
                });
                lines.push("");
            });
        } else {
            this.segments.forEach(function(seg) {
                lines.push("Toma " + seg.index + " [" + formatTimeTC(seg.inTime) + " → " + formatTimeTC(seg.outTime) + "] " +
                    "(" + seg.duration.toFixed(1) + "s)");
                lines.push("  IN: " + seg.firstPhrase);
                lines.push("  OUT: " + seg.lastPhrase);
                lines.push("");
            });
        }

        return lines.join("\n");
    };

    // ─── Helpers ──────────────────────────────────────────────────

    function deduplicatePoints(points, minGapSeconds) {
        if (points.length <= 1) return points;
        var result = [points[0]];
        for (var i = 1; i < points.length; i++) {
            if (points[i].time - result[result.length - 1].time >= minGapSeconds) {
                result.push(points[i]);
            }
        }
        return result;
    }

    function extractPhrase(words, direction, maxWords) {
        if (!words || words.length === 0) return "";

        var selected = [];
        if (direction === "first") {
            for (var i = 0; i < Math.min(maxWords, words.length); i++) {
                selected.push(words[i].text);
            }
        } else {
            var start = Math.max(0, words.length - maxWords);
            for (var j = start; j < words.length; j++) {
                selected.push(words[j].text);
            }
        }

        var phrase = selected.join(" ").trim();

        // Clean up filler at the start of first phrases
        if (direction === "first") {
            phrase = phrase.replace(FILLER_WORDS, "").trim();
        }

        return phrase;
    }

    function formatTimeTC(seconds) {
        var s = Math.max(0, seconds);
        var h = Math.floor(s / 3600);
        var m = Math.floor((s % 3600) / 60);
        var sec = Math.floor(s % 60);
        if (h > 0) return h + ":" + pad(m) + ":" + pad(sec);
        return m + ":" + pad(sec);
    }

    function pad(n) { return n < 10 ? "0" + n : "" + n; }

    function escHtml(str) {
        if (!str) return "";
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function jaccardSimilarity(setA, setB) {
        if (!setA.length || !setB.length) return 0;
        var union = {};
        var intersection = 0;
        var i;
        for (i = 0; i < setA.length; i++) union[setA[i]] = 1;
        var unionSize = Object.keys(union).length;
        for (i = 0; i < setB.length; i++) {
            if (union[setB[i]]) { intersection++; union[setB[i]] = 0; }
            else { unionSize++; }
        }
        return intersection / unionSize;
    }

    global.RecordingNotes = RecordingNotes;

})(window);
