/**
 * transcript-repeats.js — Módulo PURO (testeable en Node) para detectar
 * "ideas repetidas" en un transcript y calcular el corte que las elimina.
 *
 * Caso de uso: al cortar clases, muchas tomas re-entran retomando algo que el
 * profesor ya dijo antes (pickup). Aunque las palabras no sean idénticas, la
 * idea sí se repite. Detectarlo desde el transcript permite validar los cortes
 * rápido y ofrecer "Cortar repetición": se quita la primera versión (la toma
 * abortada) y se conserva la retoma, corrigiendo transcript y secuencia a la vez.
 *
 * Estrategia:
 *  - Se agrupa words[] en frases (por fin de oración o pausa larga).
 *  - Se compara cada frase con la(s) siguiente(s): si comparten gran parte de
 *    sus tokens de contenido (containment sobre conjuntos, ignorando stopwords),
 *    es una repetición de idea.
 *  - El corte propuesto va de INICIO de la 1ª frase a INICIO de la 2ª (retoma),
 *    de modo que la idea repetida y el silencio muerto se eliminan y la retoma
 *    queda intacta.
 *  - applyCut() quita esas palabras y DESPLAZA las posteriores por la duración
 *    eliminada, para que los timestamps sigan cuadrando con la secuencia cortada.
 *
 * Doble export: window.EPTranscriptRepeats + module.exports (Node).
 */
(function(global) {
    "use strict";

    var STOPWORDS = {
        "que": 1, "de": 1, "la": 1, "el": 1, "los": 1, "las": 1, "un": 1, "una": 1,
        "unos": 1, "unas": 1, "y": 1, "o": 1, "u": 1, "a": 1, "en": 1, "con": 1,
        "por": 1, "para": 1, "del": 1, "al": 1, "lo": 1, "le": 1, "les": 1, "se": 1,
        "su": 1, "sus": 1, "mi": 1, "mis": 1, "tu": 1, "tus": 1, "es": 1, "son": 1,
        "este": 1, "esta": 1, "esto": 1, "eso": 1, "esa": 1, "ese": 1, "esas": 1,
        "esos": 1, "estos": 1, "estas": 1, "como": 1, "mas": 1, "pero": 1, "si": 1,
        "no": 1, "ya": 1, "muy": 1, "hay": 1, "he": 1, "ha": 1, "han": 1, "nos": 1,
        "me": 1, "te": 1, "yo": 1, "vas": 1, "va": 1, "van": 1, "e": 1, "the": 1
    };

    function stripAccents(s) {
        return String(s == null ? "" : s)
            .replace(/[áàäâãÁÀÄÂÃ]/g, "a")
            .replace(/[éèëêÉÈËÊ]/g, "e")
            .replace(/[íìïîÍÌÏÎ]/g, "i")
            .replace(/[óòöôõÓÒÖÔÕ]/g, "o")
            .replace(/[úùüûÚÙÜÛ]/g, "u")
            .replace(/[ñÑ]/g, "n");
    }

    function normalizeToken(t) {
        return stripAccents(String(t == null ? "" : t).toLowerCase()).replace(/[^a-z0-9]/g, "");
    }

    function wordText(w) {
        if (!w) return "";
        var t = (w.text != null) ? w.text : w.word;
        return t == null ? "" : String(t);
    }

    function numOr(v, def) {
        var n = (typeof v === "number") ? v : parseFloat(v);
        return isNaN(n) ? def : n;
    }

    function round(x) { return Math.round(x * 1000) / 1000; }

    function isContent(tok) {
        return tok.length >= 2 && !STOPWORDS[tok];
    }

    /** Agrupa índices de words[] en frases por fin de oración o pausa larga. */
    function groupPhrases(words, opts) {
        var GAP = opts.gap, MIN = opts.minWordsPerPhrase, MAX = opts.maxWordsPerPhrase;
        var phrases = [], cur = null, prevEnd = null, prevTxt = "";
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            var txt = wordText(w).trim();
            if (!txt) continue;
            if (w.type && w.type !== "word") continue;
            var start = numOr(w.start, null);
            if (cur && cur.idxs.length >= MIN) {
                var endsSentence = /[.?!:…]["'”’)\]]?$/.test(prevTxt);
                var gap = (start != null && prevEnd != null) ? (start - prevEnd) : 0;
                if (endsSentence || gap >= GAP || cur.idxs.length >= MAX) {
                    phrases.push(cur);
                    cur = null;
                }
            }
            if (!cur) cur = { idxs: [], tokens: [], start: numOr(start, 0), end: 0, text: [] };
            cur.idxs.push(i);
            cur.text.push(txt);
            var norm = normalizeToken(txt);
            if (norm) cur.tokens.push(norm);
            cur.end = numOr(w.end, cur.end);
            prevEnd = numOr(w.end, prevEnd);
            prevTxt = txt;
        }
        if (cur && cur.idxs.length) phrases.push(cur);
        return phrases;
    }

    function contentSet(tokens) {
        var set = {}, n = 0;
        for (var i = 0; i < tokens.length; i++) {
            if (isContent(tokens[i]) && !set[tokens[i]]) { set[tokens[i]] = 1; n++; }
        }
        return { set: set, size: n };
    }

    /** Containment: |A ∩ B| / min(|A|, |B|) sobre tokens de contenido. */
    function similarity(a, b) {
        var A = contentSet(a), B = contentSet(b);
        if (A.size === 0 || B.size === 0) return { score: 0, minSize: Math.min(A.size, B.size) };
        var inter = 0;
        for (var k in A.set) if (A.set.hasOwnProperty(k) && B.set[k]) inter++;
        var minSize = Math.min(A.size, B.size);
        return { score: inter / minSize, minSize: minSize };
    }

    /**
     * Detecta repeticiones de idea entre frases adyacentes.
     * @returns {Array} [{ id, similarity, cutStart, cutEnd, cutDuration,
     *   firstText, secondText, firstIdx:[a,b], secondIdx:[a,b] }]
     */
    function detectRepeats(words, opts) {
        opts = opts || {};
        var o = {
            gap: numOr(opts.gap, 0.7),
            minWordsPerPhrase: numOr(opts.minWordsPerPhrase, 6),
            maxWordsPerPhrase: numOr(opts.maxWordsPerPhrase, 45),
            threshold: numOr(opts.threshold, 0.6),
            minContent: numOr(opts.minContent, 4),
            lookahead: numOr(opts.lookahead, 1)
        };
        var ws = words || [];
        var phrases = groupPhrases(ws, o);
        var out = [];
        var used = {};
        for (var i = 0; i < phrases.length - 1; i++) {
            if (used[i]) continue;
            var best = null;
            for (var j = i + 1; j <= i + o.lookahead && j < phrases.length; j++) {
                if (used[j]) continue;
                var sim = similarity(phrases[i].tokens, phrases[j].tokens);
                if (sim.minSize < o.minContent) continue;
                if (sim.score >= o.threshold && (!best || sim.score > best.score)) {
                    best = { j: j, score: sim.score };
                }
            }
            if (!best) continue;
            var A = phrases[i], B = phrases[best.j];
            var cutStart = round(A.start);
            var cutEnd = round(B.start);
            if (!(cutEnd > cutStart)) continue;
            out.push({
                id: "rep-" + i + "-" + best.j,
                similarity: Math.round(best.score * 100) / 100,
                cutStart: cutStart,
                cutEnd: cutEnd,
                cutDuration: round(cutEnd - cutStart),
                firstText: A.text.join(" "),
                secondText: B.text.join(" "),
                firstIdx: [A.idxs[0], A.idxs[A.idxs.length - 1]],
                secondIdx: [B.idxs[0], B.idxs[B.idxs.length - 1]]
            });
            // Marca las frases entre i y j como consumidas para no solapar cortes.
            for (var u = i; u <= best.j; u++) used[u] = 1;
        }
        return out;
    }

    /**
     * Quita las palabras dentro de [cutStart, cutEnd) y desplaza las posteriores
     * por la duración eliminada, para mantener sincronía con la secuencia cortada.
     * @returns {{ words: Array, removed: number, shifted: number, duration: number }}
     */
    function applyCut(words, cutStart, cutEnd) {
        var cs = numOr(cutStart, null), ce = numOr(cutEnd, null);
        if (cs == null || ce == null || !(ce > cs)) {
            return { words: (words || []).slice(), removed: 0, shifted: 0, duration: 0 };
        }
        var dur = ce - cs;
        var out = [], removed = 0, shifted = 0;
        var EPS = 1e-4;
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            var s = numOr(w.start, null), e = numOr(w.end, null);
            if (s == null || e == null) { out.push(w); continue; }
            if (e <= cs + EPS) {
                out.push(w);
            } else if (s >= ce - EPS) {
                var nw = {};
                for (var k in w) if (w.hasOwnProperty(k)) nw[k] = w[k];
                nw.start = round(s - dur);
                nw.end = round(e - dur);
                out.push(nw);
                shifted++;
            } else {
                removed++;
            }
        }
        return { words: out, removed: removed, shifted: shifted, duration: round(dur) };
    }

    var EPTranscriptRepeats = {
        detectRepeats: detectRepeats,
        applyCut: applyCut,
        normalizeToken: normalizeToken,
        similarity: similarity
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = EPTranscriptRepeats;
    }
    if (global) {
        global.EPTranscriptRepeats = EPTranscriptRepeats;
    }

})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : null));
