/**
 * transcript-edit.js — Módulo PURO (testeable en Node) para editar transcripts.
 *
 * Cuando el usuario corrige palabras del texto de un transcript guardado, hay
 * que volcar esas ediciones sobre el arreglo `words[]` (que lleva timestamps
 * reales por palabra) SIN perder los tiempos, porque de esos tiempos dependen
 * el Cutter, Revisar Marcadores y Notas de Grabación.
 *
 * Estrategia (determinística):
 *  - Se tokeniza el texto editado por espacios.
 *  - Se recorta prefijo y sufijo común (comparando tokens normalizados sin
 *    acentos/puntuación): las palabras sin tocar conservan su timing exacto.
 *  - La región central divergente se alinea por LCS: los tokens que hacen match
 *    conservan el timing de la palabra original; los insertados se reparten
 *    proporcionalmente en la ventana de tiempo entre anclas. Correcciones
 *    ortográficas 1:1 (el caso común) preservan el timing palabra por palabra.
 *
 * Doble export: window.EPTranscriptEdit + module.exports (Node).
 */
(function(global) {
    "use strict";

    var DP_CAP = 1200; // si la región central supera esto, se reparte proporcional

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

    function round(x) { return Math.round(x * 1000) / 1000; }

    /** Divide un texto en tokens no vacíos por espacios/saltos de línea. */
    function tokenizeText(text) {
        if (text == null) return [];
        var raw = String(text).split(/\s+/);
        var out = [];
        for (var i = 0; i < raw.length; i++) {
            if (raw[i] && raw[i].length) out.push(raw[i]);
        }
        return out;
    }

    /**
     * Texto legible a partir de words[] para editar en el textarea.
     * Inserta un salto de línea tras signos de fin de oración (round-trips:
     * tokenizeText vuelve a separar por espacios/saltos sin perder nada).
     */
    function wordsToText(words) {
        if (!words || !words.length) return "";
        var parts = [];
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            if (!w) continue;
            if (w.type && w.type !== "word") continue;
            var txt = wordText(w).trim();
            if (!txt) continue;
            parts.push(txt);
        }
        var joined = parts.join(" ");
        return joined.replace(/([.?!…])\s+/g, "$1\n");
    }

    /** Solo palabras con timestamps válidos, normalizadas a {text,start,end,type}. */
    function onlyWords(words) {
        var out = [];
        if (!words) return out;
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            if (!w) continue;
            if (w.type && w.type !== "word") continue;
            if (typeof w.start !== "number" || typeof w.end !== "number") continue;
            var t = wordText(w).trim();
            if (!t) continue;
            out.push({ text: t, start: w.start, end: w.end, type: "word" });
        }
        return out;
    }

    /** Reparte `tokens` uniformemente en la ventana [startT, endT]. */
    function spread(tokens, startT, endT) {
        var out = [];
        var n = tokens.length;
        if (n === 0) return out;
        if (!(endT > startT)) endT = startT + n * 0.001;
        var slice = (endT - startT) / n;
        for (var i = 0; i < n; i++) {
            var s = startT + slice * i;
            out.push({ text: tokens[i], start: round(s), end: round(s + slice), type: "word" });
        }
        return out;
    }

    /** Alinea la región central por LCS conservando timings de los matches. */
    function alignMiddle(oldMid, newMid, startT, endT) {
        if (newMid.length === 0) return [];
        if (oldMid.length === 0) return spread(newMid, startT, endT);
        if (oldMid.length > DP_CAP || newMid.length > DP_CAP) return spread(newMid, startT, endT);

        var na = oldMid.length, nb = newMid.length;
        var an = [], bn = [];
        for (var i = 0; i < na; i++) an.push(normalizeToken(wordText(oldMid[i])));
        for (var k = 0; k < nb; k++) bn.push(normalizeToken(newMid[k]));

        // dp[i][j] = longitud de la LCS de an[i..] y bn[j..]
        var dp = [];
        for (var r = 0; r <= na; r++) { dp.push(new Array(nb + 1)); dp[r][nb] = 0; }
        for (var c = 0; c <= nb; c++) dp[na][c] = 0;
        for (var ii = na - 1; ii >= 0; ii--) {
            for (var jj = nb - 1; jj >= 0; jj--) {
                if (an[ii] !== "" && an[ii] === bn[jj]) dp[ii][jj] = dp[ii + 1][jj + 1] + 1;
                else dp[ii][jj] = (dp[ii + 1][jj] >= dp[ii][jj + 1]) ? dp[ii + 1][jj] : dp[ii][jj + 1];
            }
        }

        // Backtrack → pares emparejados (índice new bj → índice old ai)
        var matchByBj = {};
        var i2 = 0, j2 = 0;
        while (i2 < na && j2 < nb) {
            if (an[i2] !== "" && an[i2] === bn[j2]) {
                matchByBj[j2] = i2;
                i2++; j2++;
            } else if (dp[i2 + 1][j2] >= dp[i2][j2 + 1]) {
                i2++;
            } else {
                j2++;
            }
        }

        var res = [];
        var bj = 0;
        while (bj < nb) {
            if (matchByBj.hasOwnProperty(bj)) {
                var ai = matchByBj[bj];
                res.push({ text: newMid[bj], start: oldMid[ai].start, end: oldMid[ai].end, type: "word" });
                bj++;
            } else {
                var runStart = bj;
                while (bj < nb && !matchByBj.hasOwnProperty(bj)) bj++;
                var run = newMid.slice(runStart, bj);
                var winStart = res.length > 0 ? res[res.length - 1].end : startT;
                var winEnd = (bj < nb && matchByBj.hasOwnProperty(bj)) ? oldMid[matchByBj[bj]].start : endT;
                var sp = spread(run, winStart, winEnd);
                for (var x = 0; x < sp.length; x++) res.push(sp[x]);
            }
        }
        return res;
    }

    /**
     * Vuelca el texto editado sobre words[] preservando timings donde se pueda.
     * @param {Array} oldWordsRaw words[] original (con start/end)
     * @param {string} newText texto corregido por el usuario
     * @returns {Array} nuevo words[] {text,start,end,type:"word"}
     */
    function alignEditedWords(oldWordsRaw, newText) {
        var oldWords = onlyWords(oldWordsRaw || []);
        var newTokens = tokenizeText(newText);

        if (newTokens.length === 0) return [];
        if (oldWords.length === 0) return spread(newTokens, 0, newTokens.length * 0.4);

        // Prefijo común
        var p = 0;
        while (p < oldWords.length && p < newTokens.length &&
               normalizeToken(wordText(oldWords[p])) !== "" &&
               normalizeToken(wordText(oldWords[p])) === normalizeToken(newTokens[p])) {
            p++;
        }
        // Sufijo común (sin solaparse con el prefijo)
        var s = 0;
        while (s < (oldWords.length - p) && s < (newTokens.length - p) &&
               normalizeToken(wordText(oldWords[oldWords.length - 1 - s])) !== "" &&
               normalizeToken(wordText(oldWords[oldWords.length - 1 - s])) === normalizeToken(newTokens[newTokens.length - 1 - s])) {
            s++;
        }

        var result = [];
        for (var i = 0; i < p; i++) {
            result.push({ text: newTokens[i], start: oldWords[i].start, end: oldWords[i].end, type: "word" });
        }

        var oldMid = oldWords.slice(p, oldWords.length - s);
        var newMid = newTokens.slice(p, newTokens.length - s);

        if (newMid.length > 0) {
            var startT = oldMid.length > 0 ? oldMid[0].start
                : (p > 0 ? oldWords[p - 1].end : oldWords[0].start);
            var endT = oldMid.length > 0 ? oldMid[oldMid.length - 1].end
                : (s > 0 ? oldWords[oldWords.length - s].start : oldWords[oldWords.length - 1].end);
            var mid = alignMiddle(oldMid, newMid, startT, endT);
            for (var m = 0; m < mid.length; m++) result.push(mid[m]);
        }

        for (var j = oldWords.length - s; j < oldWords.length; j++) {
            var ni = newTokens.length - (oldWords.length - j);
            result.push({ text: newTokens[ni], start: oldWords[j].start, end: oldWords[j].end, type: "word" });
        }

        return result;
    }

    // ─── Buscar y reemplazar (whole-word) preservando timings ───

    var AFFIX_RE_PRE = /^[^0-9A-Za-zÀ-ÿ]+/;
    var AFFIX_RE_POST = /[^0-9A-Za-zÀ-ÿ]+$/;

    /** Separa un token en {pre, core, post} (puntuación externa vs. núcleo). */
    function coreParts(token) {
        var s = String(token == null ? "" : token);
        var pre = (s.match(AFFIX_RE_PRE) || [""])[0];
        var post = (s.match(AFFIX_RE_POST) || [""])[0];
        if (pre.length + post.length >= s.length) return { pre: "", core: s, post: "" };
        return { pre: pre, core: s.slice(pre.length, s.length - post.length), post: post };
    }

    /** Aplica el patrón de mayúsculas de `sample` a `repl`. */
    function applyCase(sample, repl) {
        if (!sample || !repl) return repl;
        if (sample === sample.toUpperCase() && sample !== sample.toLowerCase()) return repl.toUpperCase();
        var first = sample.charAt(0);
        if (first === first.toUpperCase() && first !== first.toLowerCase()) {
            return repl.charAt(0).toUpperCase() + repl.slice(1);
        }
        return repl;
    }

    function tokenKey(token, caseSensitive) {
        if (caseSensitive) return coreParts(token).core;
        return normalizeToken(token);
    }

    /**
     * Reemplaza todas las apariciones (por palabra completa) de `search` por
     * `replacement` en words[], conservando los timings. Soporta secuencias
     * multi-palabra. Devuelve { words, count }.
     * opts.caseSensitive: exige coincidencia exacta de mayúsculas.
     */
    function replaceAllWords(oldWordsRaw, search, replacement, opts) {
        opts = opts || {};
        var caseSensitive = !!opts.caseSensitive;
        var words = onlyWords(oldWordsRaw || []);
        var searchTokens = tokenizeText(search);
        var replTokens = tokenizeText(replacement);

        var sKeys = [];
        for (var i = 0; i < searchTokens.length; i++) sKeys.push(tokenKey(searchTokens[i], caseSensitive));
        var validSearch = sKeys.length > 0;
        for (var v = 0; v < sKeys.length; v++) if (sKeys[v] === "") validSearch = false;
        if (!validSearch) return { words: words, count: 0 };

        var N = sKeys.length;
        var out = [];
        var count = 0;
        var idx = 0;
        while (idx < words.length) {
            var matched = (idx + N <= words.length);
            if (matched) {
                for (var k = 0; k < N; k++) {
                    if (tokenKey(wordText(words[idx + k]), caseSensitive) !== sKeys[k]) { matched = false; break; }
                }
            }
            if (!matched) { out.push(words[idx]); idx++; continue; }

            count++;
            var run = words.slice(idx, idx + N);
            if (replTokens.length === 0) {
                // Borrado: no se emiten palabras para la coincidencia.
            } else if (replTokens.length === N) {
                for (var r = 0; r < N; r++) {
                    var parts = coreParts(wordText(run[r]));
                    var rp = coreParts(replTokens[r]);
                    var newCore = applyCase(parts.core, rp.core || replTokens[r]);
                    out.push({
                        text: parts.pre + newCore + parts.post,
                        start: run[r].start, end: run[r].end, type: "word"
                    });
                }
            } else {
                var sp = spread(replTokens, run[0].start, run[N - 1].end);
                var preAff = coreParts(wordText(run[0])).pre;
                var postAff = coreParts(wordText(run[N - 1])).post;
                for (var q = 0; q < sp.length; q++) {
                    var txt = sp[q].text;
                    if (q === 0) txt = preAff + txt;
                    if (q === sp.length - 1) txt = txt + postAff;
                    sp[q].text = txt;
                    out.push(sp[q]);
                }
            }
            idx += N;
        }
        return { words: out, count: count };
    }

    var EPTranscriptEdit = {
        tokenizeText: tokenizeText,
        normalizeToken: normalizeToken,
        wordsToText: wordsToText,
        alignEditedWords: alignEditedWords,
        replaceAllWords: replaceAllWords
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = EPTranscriptEdit;
    }
    if (global) {
        global.EPTranscriptEdit = EPTranscriptEdit;
    }

})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : null));
