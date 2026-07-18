/**
 * cut-validator.js — Validador de cortes para Notas de Grabación
 *
 * Módulo puro, agnóstico del NLE: opera solo sobre words[] (timestamps por
 * palabra del STT) y segmentos {inTime, outTime}. No toca Premiere ni el DOM.
 *
 * Expone: window.EPCutValidator / module.exports
 *
 *   - detectPickups(words, segments, opts)
 *       Detecta "pickups": cuando una toma empieza repitiendo la frase final
 *       de la toma anterior. Propone retroceder el OUT de la toma previa al
 *       inicio de esa frase repetida, para que la frase completa quede en la
 *       toma nueva (sin duplicados en el corte final).
 *
 *   - snapBoundaries(words, segments, opts)
 *       Propone ajustar IN/OUT a los gaps reales de silencio entre palabras,
 *       en vez de márgenes fijos.
 *
 *   - validateBoundaries(words, segments, opts)
 *       Reporte por frontera: contexto de frases, margen de silencio y flag
 *       OK / revisar (p.ej. marcador cayendo a mitad de palabra).
 *
 * Los proposals NO mutan los segmentos; la UI decide aplicar cada uno.
 */
(function(global) {
    "use strict";

    var DEFAULTS = {
        tailWords: 20,        // palabras de la cola de la toma previa a comparar
        headWords: 20,        // palabras de la cabeza de la toma siguiente
        minMatchWords: 3,     // mínimo de palabras coincidentes contiguas
        minMatchChars: 12,    // mínimo de caracteres significativos del match
        maxHeadOffset: 6,     // el match debe empezar en las primeras N palabras de la cabeza
        minRemainderSec: 1.0, // no proponer si la toma previa quedaría más corta que esto
        snapMinPre: 0.15,     // margen mínimo antes de la primera palabra
        snapMaxPre: 0.5,      // margen máximo antes de la primera palabra
        snapMinPost: 0.12,    // margen mínimo después de la última palabra
        snapMaxPost: 0.4,     // margen máximo después de la última palabra
        snapThreshold: 0.08,  // diferencia mínima para proponer un ajuste
        lowMarginSec: 0.1     // margen de silencio bajo → flag "revisar"
    };

    function mergeOpts(opts) {
        var o = {};
        for (var k in DEFAULTS) {
            if (DEFAULTS.hasOwnProperty(k)) o[k] = DEFAULTS[k];
        }
        if (opts) {
            for (var k2 in opts) {
                if (opts.hasOwnProperty(k2)) o[k2] = opts[k2];
            }
        }
        return o;
    }

    // ─── Normalización de tokens ─────────────────────────────

    function normToken(text) {
        var t = String(text || "").toLowerCase();
        // Quitar diacríticos (el STT es inconsistente con acentos)
        try {
            t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        } catch(e) {}
        // Quitar puntuación
        t = t.replace(/[.,!?;:…"“”'’¿¡()\[\]—–\-]/g, "").replace(/\s+/g, "");
        return t;
    }

    /**
     * Palabras habladas (type "word") dentro de [start, end], con índice original.
     * Una palabra que cruza el borde cuenta como "dentro" si su punto medio
     * cae en el rango — así el snap/pickup no trata como externa una palabra
     * que el corte actual parte por la mitad.
     */
    function wordsInRange(words, start, end) {
        var out = [];
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            if (w.type && w.type !== "word") continue;
            var mid = (w.start + w.end) / 2;
            if (mid >= start - 0.01 && mid <= end + 0.01) {
                out.push({ word: w, index: i });
            }
        }
        return out;
    }

    function joinText(entries, from, count) {
        var parts = [];
        for (var i = from; i < from + count && i < entries.length; i++) {
            parts.push(entries[i].word.text);
        }
        return parts.join(" ").trim();
    }

    /**
     * Frase (hasta n palabras) que termina justo antes de `time`.
     */
    function phraseBefore(words, time, n) {
        var collected = [];
        for (var i = words.length - 1; i >= 0 && collected.length < n; i--) {
            var w = words[i];
            if (w.type && w.type !== "word") continue;
            if (w.end <= time + 0.01) collected.unshift(w.text);
        }
        return collected.join(" ").trim();
    }

    /**
     * Frase (hasta n palabras) que empieza justo después de `time`.
     */
    function phraseAfter(words, time, n) {
        var collected = [];
        for (var i = 0; i < words.length && collected.length < n; i++) {
            var w = words[i];
            if (w.type && w.type !== "word") continue;
            if (w.start >= time - 0.01) collected.push(w.text);
        }
        return collected.join(" ").trim();
    }

    // ─── Detector de pickups ─────────────────────────────────

    /**
     * Busca el match contiguo más largo entre la cola de tailTokens y la
     * cabeza de headTokens, exigiendo que:
     *   - el match empiece dentro de las primeras maxHeadOffset palabras de
     *     la cabeza, y
     *   - el match termine en las últimas 2 palabras de la cola (anclado al
     *     final de la toma previa). Sin este anclaje, una muletilla repetida
     *     a mitad de la cola generaría un pickup que borra contenido único.
     * Devuelve { tailStart, headStart, length } o null.
     * Ante empates de longitud prefiere el match más tardío en la cola
     * (corta lo mínimo necesario de la toma previa).
     */
    function findOverlap(tailTokens, headTokens, opts) {
        var best = null;
        for (var i = 0; i < tailTokens.length; i++) {
            for (var j = 0; j < headTokens.length && j < opts.maxHeadOffset; j++) {
                var len = 0;
                while (i + len < tailTokens.length &&
                       j + len < headTokens.length &&
                       tailTokens[i + len] === headTokens[j + len]) {
                    len++;
                }
                if (len === 0) continue;
                if (i + len < tailTokens.length - 2) continue; // no anclado al final de la cola
                if (!best || len > best.length || (len === best.length && i > best.tailStart)) {
                    best = { tailStart: i, headStart: j, length: len };
                }
            }
        }
        return best;
    }

    function detectPickups(words, segments, opts) {
        opts = mergeOpts(opts);
        var proposals = [];
        if (!words || words.length === 0 || !segments || segments.length < 2) return proposals;

        for (var s = 0; s < segments.length - 1; s++) {
            var prev = segments[s];
            var next = segments[s + 1];

            var prevWords = wordsInRange(words, prev.inTime, prev.outTime);
            var nextWords = wordsInRange(words, next.inTime, next.outTime);
            if (prevWords.length === 0 || nextWords.length === 0) continue;

            // Tokens de puntuación pura (p.ej. "—", "...") se descartan antes
            // del match para no romper la contigüidad de frases legítimas.
            var tail = [];
            var head = [];
            var tailTokens = [];
            var headTokens = [];
            var i, tk;
            var tailRaw = prevWords.slice(-opts.tailWords);
            var headRaw = nextWords.slice(0, opts.headWords);
            for (i = 0; i < tailRaw.length; i++) {
                tk = normToken(tailRaw[i].word.text);
                if (tk !== "") { tail.push(tailRaw[i]); tailTokens.push(tk); }
            }
            for (i = 0; i < headRaw.length; i++) {
                tk = normToken(headRaw[i].word.text);
                if (tk !== "") { head.push(headRaw[i]); headTokens.push(tk); }
            }
            if (tail.length === 0 || head.length === 0) continue;

            var match = findOverlap(tailTokens, headTokens, opts);
            if (!match || match.length < opts.minMatchWords) continue;

            var matchedChars = 0;
            for (i = 0; i < match.length; i++) {
                matchedChars += tailTokens[match.tailStart + i].length;
            }
            if (matchedChars < opts.minMatchChars) continue;

            var matchFirstWord = tail[match.tailStart].word;
            var matchLastTailWord = tail[match.tailStart + match.length - 1].word;

            // Palabra previa al inicio del match dentro de la toma previa
            var boundWordEnd = prev.inTime;
            var tailStartGlobalIdx = tail[match.tailStart].index;
            for (var b = tailStartGlobalIdx - 1; b >= 0; b--) {
                var bw = words[b];
                if (bw.type && bw.type !== "word") continue;
                if (bw.end <= matchFirstWord.start + 0.01) {
                    boundWordEnd = Math.max(prev.inTime, bw.end);
                    break;
                }
            }

            // OUT propuesto: dentro del gap de silencio previo a la frase
            // repetida, nunca por encima del inicio de su primera palabra
            // (cortaría dentro de la palabra) ni por debajo del final de la
            // palabra anterior.
            var gapLen = Math.max(0, matchFirstWord.start - boundWordEnd);
            var proposedOutTime = matchFirstWord.start - Math.min(0.15, gapLen / 2);
            if (proposedOutTime >= prev.outTime) continue; // no gana nada

            // No dejar la toma previa prácticamente vacía
            if (proposedOutTime - prev.inTime < opts.minRemainderSec) {
                proposals.push({
                    type: "pickup-warning",
                    prevSegPos: s,
                    nextSegPos: s + 1,
                    matchText: joinText(tail, match.tailStart, match.length),
                    matchWordCount: match.length,
                    message: "La repetición cubre casi toda la toma previa — considera desactivarla como re-toma."
                });
                continue;
            }

            // El match siempre viene anclado al final de la cola (findOverlap);
            // confianza alta si además arranca al inicio de la cabeza y es largo
            var headStartsAtBoundary = match.headStart <= 2;
            var confidence = (headStartsAtBoundary && match.length >= 4) ? "alta" : "media";

            proposals.push({
                type: "pickup",
                prevSegPos: s,
                nextSegPos: s + 1,
                matchText: joinText(tail, match.tailStart, match.length),
                matchWordCount: match.length,
                matchStartTime: matchFirstWord.start,
                matchEndTime: matchLastTailWord.end,
                originalOutTime: prev.outTime,
                proposedOutTime: proposedOutTime,
                removedSeconds: prev.outTime - proposedOutTime,
                nextInTime: next.inTime,
                confidence: confidence
            });
        }

        return proposals;
    }

    // ─── Snapping de bordes ──────────────────────────────────

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function snapBoundaries(words, segments, opts) {
        opts = mergeOpts(opts);
        var proposals = [];
        if (!words || words.length === 0 || !segments) return proposals;

        for (var s = 0; s < segments.length; s++) {
            var seg = segments[s];
            var segWords = wordsInRange(words, seg.inTime, seg.outTime);
            if (segWords.length === 0) continue;

            var firstWord = segWords[0].word;
            var lastWord = segWords[segWords.length - 1].word;

            // IN: colocar en el gap de silencio antes de la primera palabra
            var prevWord = null;
            for (var p = segWords[0].index - 1; p >= 0; p--) {
                var pw = words[p];
                if (pw.type && pw.type !== "word") continue;
                prevWord = pw;
                break;
            }
            var gapBefore = prevWord ? (firstWord.start - prevWord.end) : firstWord.start;
            if (gapBefore > 0) {
                var pre = clamp(gapBefore / 2, opts.snapMinPre, opts.snapMaxPre);
                var proposedIn = firstWord.start - pre;
                if (prevWord) proposedIn = Math.max(proposedIn, prevWord.end + 0.03);
                proposedIn = Math.max(0, proposedIn);
                if (Math.abs(proposedIn - seg.inTime) > opts.snapThreshold) {
                    proposals.push({
                        type: "snap",
                        segPos: s,
                        field: "inTime",
                        original: seg.inTime,
                        proposed: proposedIn,
                        gap: gapBefore,
                        reason: "IN al gap de silencio antes de \"" + firstWord.text + "\""
                    });
                }
            }

            // OUT: después de la última palabra, sin dejar entrar la siguiente (trigger)
            var nextWord = null;
            for (var n = segWords[segWords.length - 1].index + 1; n < words.length; n++) {
                var nw = words[n];
                if (nw.type && nw.type !== "word") continue;
                nextWord = nw;
                break;
            }
            var gapAfter = nextWord ? (nextWord.start - lastWord.end) : Infinity;
            if (gapAfter > 0) {
                var post = gapAfter === Infinity
                    ? opts.snapMaxPost
                    : clamp(gapAfter / 2, opts.snapMinPost, opts.snapMaxPost);
                var proposedOut = lastWord.end + post;
                if (nextWord) proposedOut = Math.min(proposedOut, nextWord.start - 0.03);
                if (proposedOut > lastWord.end && Math.abs(proposedOut - seg.outTime) > opts.snapThreshold) {
                    proposals.push({
                        type: "snap",
                        segPos: s,
                        field: "outTime",
                        original: seg.outTime,
                        proposed: proposedOut,
                        gap: gapAfter === Infinity ? -1 : gapAfter,
                        reason: "OUT al gap de silencio después de \"" + lastWord.text + "\""
                    });
                }
            }
        }

        return proposals;
    }

    // ─── Reporte de validación por frontera ──────────────────

    function wordAt(words, time) {
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            if (w.type && w.type !== "word") continue;
            if (w.start < time && w.end > time) return w;
        }
        return null;
    }

    function validateBoundaries(words, segments, opts) {
        opts = mergeOpts(opts);
        var report = [];
        if (!words || words.length === 0 || !segments) return report;

        for (var s = 0; s < segments.length; s++) {
            var seg = segments[s];
            var issues = [];

            var inMidWord = wordAt(words, seg.inTime);
            if (inMidWord) {
                issues.push("El IN corta la palabra \"" + inMidWord.text + "\"");
            }
            var outMidWord = wordAt(words, seg.outTime);
            if (outMidWord) {
                issues.push("El OUT corta la palabra \"" + outMidWord.text + "\"");
            }

            var segWords = wordsInRange(words, seg.inTime, seg.outTime);
            if (segWords.length === 0) {
                issues.push("La toma no contiene palabras");
            } else {
                var inMargin = segWords[0].word.start - seg.inTime;
                var outMargin = seg.outTime - segWords[segWords.length - 1].word.end;
                if (!inMidWord && inMargin < opts.lowMarginSec) {
                    issues.push("Margen de entrada muy justo (" + inMargin.toFixed(2) + "s)");
                }
                if (!outMidWord && outMargin < opts.lowMarginSec) {
                    issues.push("Margen de salida muy justo (" + outMargin.toFixed(2) + "s)");
                }
            }

            report.push({
                segPos: s,
                inTime: seg.inTime,
                outTime: seg.outTime,
                status: issues.length === 0 ? "ok" : "revisar",
                issues: issues,
                contextBeforeIn: phraseBefore(words, seg.inTime, 3),
                contextAfterIn: phraseAfter(words, seg.inTime, 5),
                contextBeforeOut: phraseBefore(words, seg.outTime, 5),
                contextAfterOut: phraseAfter(words, seg.outTime, 3)
            });
        }

        return report;
    }

    var EPCutValidator = {
        detectPickups: detectPickups,
        snapBoundaries: snapBoundaries,
        validateBoundaries: validateBoundaries,
        phraseBefore: phraseBefore,
        phraseAfter: phraseAfter,
        _normToken: normToken
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = EPCutValidator;
    }
    if (global) {
        global.EPCutValidator = EPCutValidator;
    }

})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : null));
