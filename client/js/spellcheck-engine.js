/**
 * SpellCheck Engine - Motor de verificación ortográfica, mayúsculas y puntuación
 * Soporta Español e Inglés con diccionarios Hunspell via typo-js
 */

(function(global) {
    "use strict";

    var Typo;
    try {
        Typo = require("typo-js");
    } catch (e) {
        Typo = null;
    }

    var fs, path;
    try {
        fs = require("fs");
        path = require("path");
    } catch (e) {
        fs = null;
        path = null;
    }

    // ─── Issue types ─────────────────────────────────────────────
    var IssueType = {
        SPELLING: "spelling",
        CAPITALIZATION: "capitalization",
        PUNCTUATION: "punctuation",
        SPACING: "spacing"
    };

    var Severity = {
        ERROR: "error",
        WARNING: "warning",
        INFO: "info"
    };

    // ─── Capitalization modes ────────────────────────────────────
    var CapStyle = {
        SENTENCE: "sentence",
        TITLE: "title",
        UPPER: "upper",
        LOWER: "lower",
        MIXED: "mixed"
    };

    // ─── Spanish lowercase words for title case ──────────────────
    var ES_TITLE_LOWERCASE = new Set([
        "a", "al", "ante", "bajo", "con", "contra", "de", "del", "desde",
        "durante", "en", "entre", "hacia", "hasta", "mediante", "para",
        "por", "según", "sin", "sobre", "tras", "versus", "vía",
        "el", "la", "lo", "los", "las", "un", "una", "unos", "unas",
        "y", "e", "o", "u", "ni", "que", "pero", "mas", "sino",
        "como", "se", "su", "sus", "mi", "mis", "tu", "tus"
    ]);

    // ─── English lowercase words for title case ──────────────────
    var EN_TITLE_LOWERCASE = new Set([
        "a", "an", "the", "and", "but", "or", "nor", "for", "yet", "so",
        "at", "by", "in", "of", "on", "to", "up", "as", "it", "is",
        "if", "be", "do", "no", "vs", "via", "per"
    ]);

    // ─── Common Spanish words (fallback when no dictionary) ──────
    var ES_COMMON = new Set([
        "hola", "adiós", "gracias", "por", "favor", "buenos", "días", "tardes",
        "noches", "sí", "no", "bien", "mal", "mucho", "poco", "todo", "nada",
        "más", "menos", "grande", "pequeño", "nuevo", "viejo", "bueno", "malo",
        "mejor", "peor", "primero", "último", "siguiente", "anterior",
        "el", "la", "los", "las", "un", "una", "unos", "unas", "del", "al",
        "yo", "tú", "él", "ella", "nosotros", "ustedes", "ellos", "ellas",
        "mi", "tu", "su", "nuestro", "vuestro", "mis", "tus", "sus",
        "este", "esta", "estos", "estas", "ese", "esa", "esos", "esas",
        "aquel", "aquella", "aquellos", "aquellas", "esto", "eso", "aquello",
        "que", "quien", "cual", "cuyo", "donde", "cuando", "como", "cuanto",
        "qué", "quién", "cuál", "dónde", "cuándo", "cómo", "cuánto",
        "ser", "estar", "haber", "tener", "hacer", "poder", "decir", "ir",
        "ver", "dar", "saber", "querer", "llegar", "pasar", "deber", "poner",
        "parecer", "quedar", "creer", "hablar", "llevar", "dejar", "seguir",
        "encontrar", "llamar", "venir", "pensar", "salir", "volver", "tomar",
        "conocer", "vivir", "sentir", "tratar", "mirar", "contar", "empezar",
        "esperar", "buscar", "existir", "entrar", "trabajar", "escribir",
        "perder", "producir", "ocurrir", "entender", "pedir", "recibir",
        "recordar", "terminar", "permitir", "aparecer", "conseguir", "comenzar",
        "servir", "sacar", "necesitar", "mantener", "resultar", "leer",
        "caer", "cambiar", "presentar", "crear", "abrir", "considerar",
        "oír", "acabar", "convertir", "ganar", "formar", "traer", "partir",
        "morir", "aceptar", "realizar", "suponer", "comprender", "lograr",
        "explicar", "preguntar", "tocar", "reconocer", "estudiar", "alcanzar",
        "nacer", "dirigir", "correr", "utilizar", "pagar", "dormir",
        "tiempo", "año", "día", "vez", "parte", "mundo", "casa", "país",
        "lugar", "caso", "cosa", "hombre", "mujer", "momento", "nombre",
        "vida", "forma", "agua", "ciudad", "familia", "cuerpo", "trabajo",
        "punto", "mano", "gobierno", "pueblo", "manera", "hijo", "hija",
        "grupo", "problema", "medio", "cuenta", "tipo", "ejemplo", "idea",
        "historia", "hora", "palabra", "noche", "verdad", "persona", "padre",
        "madre", "razón", "proceso", "muerte", "guerra", "cambio", "niño",
        "fuerza", "clase", "sistema", "tierra", "paso", "relación", "nivel",
        "juego", "sentido", "situación", "centro", "camino", "derecho",
        "proyecto", "programa", "empresa", "acción", "actividad", "arte",
        "información", "desarrollo", "sociedad", "importancia", "experiencia",
        "también", "ya", "aún", "así", "después", "antes", "aquí", "ahora",
        "entonces", "siempre", "nunca", "muy", "tan", "casi", "otra",
        "entre", "sobre", "según", "contra", "desde", "hasta", "hacia",
        "durante", "mediante", "sin", "con", "para",
        "y", "o", "pero", "porque", "aunque", "sino", "ni", "pues",
        "a", "ante", "bajo", "de", "en", "por", "tras", "se",
        "me", "te", "le", "nos", "les", "lo", "la", "les"
    ]);

    // ─── Common English words (fallback when no dictionary) ──────
    var EN_COMMON = new Set([
        "the", "be", "to", "of", "and", "a", "in", "that", "have", "i",
        "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
        "this", "but", "his", "by", "from", "they", "we", "say", "her",
        "she", "or", "an", "will", "my", "one", "all", "would", "there",
        "their", "what", "so", "up", "out", "if", "about", "who", "get",
        "which", "go", "me", "when", "make", "can", "like", "time", "no",
        "just", "him", "know", "take", "people", "into", "year", "your",
        "good", "some", "could", "them", "see", "other", "than", "then",
        "now", "look", "only", "come", "its", "over", "think", "also",
        "back", "after", "use", "two", "how", "our", "work", "first",
        "well", "way", "even", "new", "want", "because", "any", "these",
        "give", "day", "most", "us", "great", "big", "small", "old",
        "young", "long", "little", "own", "such", "much", "many", "more",
        "before", "right", "too", "still", "last", "each", "both", "few",
        "here", "thing", "tell", "through", "very", "while", "never",
        "where", "world", "life", "should", "every", "number", "part",
        "place", "find", "same", "home", "hand", "high", "keep", "large",
        "end", "point", "turn", "move", "try", "down", "show", "head",
        "help", "let", "play", "run", "city", "own", "off", "name",
        "away", "again", "change", "school", "may", "need", "line", "house",
        "study", "follow", "start", "kind", "read", "write", "close",
        "call", "open", "state", "next", "begin", "seem", "might",
        "learn", "real", "leave", "hard", "group", "carry", "side", "early",
        "hold", "story", "word", "sure", "become", "clear", "full",
        "must", "set", "children", "program", "interest", "order", "water",
        "family", "music", "enough", "without", "along", "question", "answer",
        "beautiful", "design", "creative", "motion", "graphics", "animation",
        "video", "project", "style", "color", "font", "text", "title",
        "subtitle", "intro", "outro", "effect", "visual", "render",
        "composition", "layer", "frame", "scene", "clip", "edit",
        "production", "director", "camera", "light", "sound", "audio",
        "media", "content", "brand", "logo", "company", "business",
        "professional", "quality", "modern", "clean", "simple", "bold",
        "elegant", "minimal", "dynamic", "premium", "exclusive", "limited",
        "special", "amazing", "awesome", "perfect", "incredible", "fantastic"
    ]);

    // ─── Common abbreviations and proper nouns to skip ───────────
    var SKIP_WORDS = new Set([
        "ok", "vs", "etc", "app", "web", "www", "http", "https", "url",
        "api", "html", "css", "js", "pdf", "jpg", "png", "gif", "svg",
        "mp4", "mov", "avi", "mp3", "wav", "ai", "ae", "ps", "pr",
        "hd", "uhd", "fps", "rgb", "cmyk", "ui", "ux", "dpi",
        "iphone", "ipad", "mac", "ios", "android", "google", "facebook",
        "instagram", "youtube", "twitter", "linkedin", "tiktok", "adobe",
        "netflix", "spotify", "amazon", "microsoft", "apple"
    ]);

    // ─── Punctuation rules ───────────────────────────────────────
    var PUNCTUATION_RULES = {
        doubleSpaces: {
            pattern: /  +/g,
            message: { es: "Espacio doble detectado", en: "Double space detected" },
            severity: Severity.WARNING
        },
        spaceBefore: {
            pattern: / +[,;.:)}\]]/g,
            message: { es: "Espacio antes de signo de puntuación", en: "Space before punctuation mark" },
            severity: Severity.WARNING
        },
        noSpaceAfter: {
            pattern: /[,;][^ \n\r"')\]]/g,
            message: { es: "Falta espacio después de puntuación", en: "Missing space after punctuation" },
            severity: Severity.WARNING
        },
        noSpaceAfterPeriod: {
            pattern: /\.[A-ZÁÉÍÓÚÑa-záéíóúñ]/g,
            message: { es: "Falta espacio después del punto", en: "Missing space after period" },
            severity: Severity.ERROR
        },
        unmatchedParens: {
            check: function(text) {
                var open = (text.match(/\(/g) || []).length;
                var close = (text.match(/\)/g) || []).length;
                return open !== close;
            },
            message: { es: "Paréntesis sin cerrar/abrir", en: "Unmatched parentheses" },
            severity: Severity.ERROR
        },
        unmatchedQuotes: {
            check: function(text) {
                var dq = (text.match(/"/g) || []).length;
                return dq % 2 !== 0;
            },
            message: { es: "Comillas sin cerrar", en: "Unmatched quotation marks" },
            severity: Severity.WARNING
        },
        spanishQuestionMark: {
            pattern: /\?(?![\s\n\r.,;:!?)\]"']|$)/g,
            checkLang: "es",
            message: { es: "En español, usa signos de apertura ¿...?", en: "Spanish requires opening ¿" },
            severity: Severity.INFO
        },
        spanishExclamation: {
            pattern: /!(?![\s\n\r.,;:!?)\]"']|$)/g,
            checkLang: "es",
            message: { es: "En español, usa signos de apertura ¡...!", en: "Spanish requires opening ¡" },
            severity: Severity.INFO
        },
        missingOpenQuestion: {
            check: function(text) {
                var closing = (text.match(/\?/g) || []).length;
                var opening = (text.match(/¿/g) || []).length;
                return closing > opening;
            },
            checkLang: "es",
            message: { es: "Falta signo de apertura ¿", en: "Missing opening question mark ¿" },
            severity: Severity.WARNING
        },
        missingOpenExclamation: {
            check: function(text) {
                var closing = (text.match(/!/g) || []).length;
                var opening = (text.match(/¡/g) || []).length;
                return closing > opening;
            },
            checkLang: "es",
            message: { es: "Falta signo de apertura ¡", en: "Missing opening exclamation ¡" },
            severity: Severity.WARNING
        },
        trailingSpace: {
            pattern: / +$/gm,
            message: { es: "Espacio al final de la línea", en: "Trailing whitespace" },
            severity: Severity.INFO
        },
        multipleExclamation: {
            pattern: /!{2,}/g,
            message: { es: "Múltiples signos de exclamación", en: "Multiple exclamation marks" },
            severity: Severity.INFO
        },
        multipleQuestion: {
            pattern: /\?{2,}/g,
            message: { es: "Múltiples signos de interrogación", en: "Multiple question marks" },
            severity: Severity.INFO
        },
        ellipsisDots: {
            pattern: /\.{4,}/g,
            message: { es: "Puntos suspensivos deben ser exactamente 3 (...)", en: "Ellipsis should be exactly 3 dots (...)" },
            severity: Severity.WARNING
        }
    };

    // ─── SpellCheckEngine class ──────────────────────────────────
    function SpellCheckEngine(options) {
        options = options || {};
        this.dictionaries = {};
        this.dictionariesLoaded = { en: false, es: false };
        this.extensionPath = options.extensionPath || "";
        this.uiLanguage = options.uiLanguage || "es";
        this._initDictionaries();
    }

    SpellCheckEngine.IssueType = IssueType;
    SpellCheckEngine.Severity = Severity;
    SpellCheckEngine.CapStyle = CapStyle;

    SpellCheckEngine.prototype._initDictionaries = function() {
        if (!Typo || !fs) {
            console.log("SpellCheck: typo-js or fs not available, using fallback dictionaries.");
            return;
        }

        var dictPath = path.join(this.extensionPath, "dictionaries");

        var langs = [
            { code: "en", files: { aff: "en_US.aff", dic: "en_US.dic" }, name: "en_US" },
            { code: "es", files: { aff: "es_ES.aff", dic: "es_ES.dic" }, name: "es_ES" }
        ];

        for (var i = 0; i < langs.length; i++) {
            var lang = langs[i];
            var affPath = path.join(dictPath, lang.files.aff);
            var dicPath = path.join(dictPath, lang.files.dic);

            try {
                if (fs.existsSync(affPath) && fs.existsSync(dicPath)) {
                    var affData = fs.readFileSync(affPath, "utf8");
                    var dicData = fs.readFileSync(dicPath, "utf8");
                    this.dictionaries[lang.code] = new Typo(lang.name, affData, dicData);
                    this.dictionariesLoaded[lang.code] = true;
                    console.log("SpellCheck: Loaded " + lang.code + " dictionary.");
                } else {
                    console.log("SpellCheck: Dictionary files not found for " + lang.code + " at " + dictPath);
                }
            } catch (e) {
                console.log("SpellCheck: Error loading " + lang.code + " dictionary: " + e.message);
            }
        }
    };

    SpellCheckEngine.prototype.getDictionaryStatus = function() {
        return {
            en: this.dictionariesLoaded.en,
            es: this.dictionariesLoaded.es,
            usingFallback: !this.dictionariesLoaded.en && !this.dictionariesLoaded.es
        };
    };

    // ─── Language detection ──────────────────────────────────────
    SpellCheckEngine.prototype.detectLanguage = function(text) {
        if (!text || text.trim().length === 0) return "en";

        var words = text.toLowerCase().replace(/[^a-záéíóúüñ\s]/g, "").split(/\s+/).filter(Boolean);
        if (words.length === 0) return "en";

        var esScore = 0;
        var enScore = 0;

        var esIndicators = ["á", "é", "í", "ó", "ú", "ñ", "ü", "¿", "¡"];
        for (var c = 0; c < esIndicators.length; c++) {
            if (text.indexOf(esIndicators[c]) !== -1) esScore += 3;
        }

        var esOnlyWords = new Set([
            "el", "los", "las", "del", "una", "unos", "unas", "está", "son",
            "pero", "porque", "también", "más", "muy", "como", "para", "con",
            "sin", "sobre", "entre", "después", "antes", "siempre", "nunca",
            "aquí", "ahora", "hoy", "mañana", "ayer", "esto", "eso", "aquello"
        ]);
        var enOnlyWords = new Set([
            "the", "is", "are", "was", "were", "been", "being", "have", "has",
            "had", "does", "did", "will", "would", "could", "should", "might",
            "shall", "can", "must", "need", "there", "their", "they", "these",
            "those", "which", "what", "where", "when", "while", "because",
            "through", "before", "after", "during", "without", "between"
        ]);

        for (var i = 0; i < words.length; i++) {
            if (esOnlyWords.has(words[i])) esScore += 2;
            if (enOnlyWords.has(words[i])) enScore += 2;
        }

        return esScore > enScore ? "es" : "en";
    };

    // ─── Spell checking ──────────────────────────────────────────
    SpellCheckEngine.prototype.checkSpelling = function(word, lang) {
        if (!word || word.length <= 1) return true;
        if (/^\d+$/.test(word)) return true;
        if (/^[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑàèìòùâêîôûäëïöü]+$/.test(word)) return true;
        if (SKIP_WORDS.has(word.toLowerCase())) return true;

        var lower = word.toLowerCase();

        if (this.dictionariesLoaded[lang] && this.dictionaries[lang]) {
            return this.dictionaries[lang].check(word);
        }

        var fallback = lang === "es" ? ES_COMMON : EN_COMMON;
        if (fallback.has(lower)) return true;

        var otherLang = lang === "es" ? "en" : "es";
        if (this.dictionariesLoaded[otherLang] && this.dictionaries[otherLang]) {
            if (this.dictionaries[otherLang].check(word)) return true;
        } else {
            var otherFallback = lang === "es" ? EN_COMMON : ES_COMMON;
            if (otherFallback.has(lower)) return true;
        }

        return false;
    };

    SpellCheckEngine.prototype.getSuggestions = function(word, lang, maxSuggestions) {
        maxSuggestions = maxSuggestions || 5;

        if (this.dictionariesLoaded[lang] && this.dictionaries[lang]) {
            return this.dictionaries[lang].suggest(word, maxSuggestions);
        }

        var fallback = lang === "es" ? ES_COMMON : EN_COMMON;
        return this._fuzzyMatch(word.toLowerCase(), fallback, maxSuggestions);
    };

    SpellCheckEngine.prototype._fuzzyMatch = function(word, wordSet, maxResults) {
        var results = [];
        var maxDist = Math.max(2, Math.floor(word.length / 3));

        wordSet.forEach(function(dictWord) {
            if (Math.abs(dictWord.length - word.length) > maxDist) return;
            var dist = levenshtein(word, dictWord);
            if (dist <= maxDist && dist > 0) {
                results.push({ word: dictWord, distance: dist });
            }
        });

        results.sort(function(a, b) { return a.distance - b.distance; });
        return results.slice(0, maxResults).map(function(r) { return r.word; });
    };

    // ─── Capitalization analysis ─────────────────────────────────
    SpellCheckEngine.prototype.detectCapStyle = function(text) {
        if (!text || text.trim().length === 0) return CapStyle.MIXED;

        var cleaned = text.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\s]/g, "").trim();
        if (!cleaned) return CapStyle.MIXED;

        if (cleaned === cleaned.toUpperCase() && cleaned !== cleaned.toLowerCase()) {
            return CapStyle.UPPER;
        }
        if (cleaned === cleaned.toLowerCase()) {
            return CapStyle.LOWER;
        }

        var words = cleaned.split(/\s+/);
        if (words.length <= 1) return CapStyle.MIXED;

        var isTitleCase = true;
        var isSentenceCase = true;
        var lang = this.detectLanguage(text);
        var titleLower = lang === "es" ? ES_TITLE_LOWERCASE : EN_TITLE_LOWERCASE;

        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            if (!w) continue;
            var isCapitalized = w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase();
            var isLower = w === w.toLowerCase();

            if (i === 0) {
                if (!isCapitalized) {
                    isTitleCase = false;
                    isSentenceCase = false;
                }
            } else {
                if (titleLower.has(w.toLowerCase())) {
                    if (isCapitalized) isTitleCase = false;
                } else {
                    if (!isCapitalized) isTitleCase = false;
                }
                if (isCapitalized && !titleLower.has(w.toLowerCase())) {
                    isSentenceCase = false;
                }
            }
        }

        if (isTitleCase) return CapStyle.TITLE;
        if (isSentenceCase) return CapStyle.SENTENCE;
        return CapStyle.MIXED;
    };

    SpellCheckEngine.prototype.checkCapitalization = function(text, expectedStyle) {
        var issues = [];
        if (!text || !expectedStyle) return issues;

        var lines = text.split(/\n/);
        var lang = this.detectLanguage(text);
        var titleLower = lang === "es" ? ES_TITLE_LOWERCASE : EN_TITLE_LOWERCASE;

        for (var li = 0; li < lines.length; li++) {
            var line = lines[li].trim();
            if (!line) continue;
            var words = line.split(/\s+/);

            for (var wi = 0; wi < words.length; wi++) {
                var w = words[wi];
                var clean = w.replace(/^[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]+|[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]+$/g, "");
                if (!clean || /^\d+$/.test(clean)) continue;

                var isFirst = (wi === 0);
                var isCapitalized = clean[0] === clean[0].toUpperCase() && clean[0] !== clean[0].toLowerCase();
                var isTitleMinor = titleLower.has(clean.toLowerCase());
                var suggestion = null;

                switch (expectedStyle) {
                    case CapStyle.SENTENCE:
                        if (isFirst && !isCapitalized) {
                            suggestion = clean[0].toUpperCase() + clean.slice(1).toLowerCase();
                            issues.push({
                                type: IssueType.CAPITALIZATION,
                                severity: Severity.WARNING,
                                word: clean,
                                suggestion: suggestion,
                                line: li,
                                message: lang === "es"
                                    ? "La primera palabra debe iniciar en mayúscula"
                                    : "First word should be capitalized"
                            });
                        } else if (!isFirst && isCapitalized && clean !== clean.toUpperCase()) {
                            suggestion = clean.toLowerCase();
                            issues.push({
                                type: IssueType.CAPITALIZATION,
                                severity: Severity.INFO,
                                word: clean,
                                suggestion: suggestion,
                                line: li,
                                message: lang === "es"
                                    ? "En tipo oración, solo la primera palabra va en mayúscula"
                                    : "In sentence case, only the first word is capitalized"
                            });
                        }
                        break;

                    case CapStyle.TITLE:
                        if (isFirst && !isCapitalized) {
                            suggestion = clean[0].toUpperCase() + clean.slice(1).toLowerCase();
                            issues.push({
                                type: IssueType.CAPITALIZATION,
                                severity: Severity.WARNING,
                                word: clean,
                                suggestion: suggestion,
                                line: li,
                                message: lang === "es"
                                    ? "La primera palabra del título debe ir en mayúscula"
                                    : "First word of title should be capitalized"
                            });
                        } else if (!isFirst && !isTitleMinor && !isCapitalized) {
                            suggestion = clean[0].toUpperCase() + clean.slice(1);
                            issues.push({
                                type: IssueType.CAPITALIZATION,
                                severity: Severity.WARNING,
                                word: clean,
                                suggestion: suggestion,
                                line: li,
                                message: lang === "es"
                                    ? "En estilo título, esta palabra debe ir en mayúscula"
                                    : "In title case, this word should be capitalized"
                            });
                        } else if (!isFirst && isTitleMinor && isCapitalized) {
                            suggestion = clean.toLowerCase();
                            issues.push({
                                type: IssueType.CAPITALIZATION,
                                severity: Severity.INFO,
                                word: clean,
                                suggestion: suggestion,
                                line: li,
                                message: lang === "es"
                                    ? "Artículos y preposiciones van en minúscula en títulos"
                                    : "Minor words should be lowercase in titles"
                            });
                        }
                        break;

                    case CapStyle.UPPER:
                        if (clean !== clean.toUpperCase()) {
                            issues.push({
                                type: IssueType.CAPITALIZATION,
                                severity: Severity.WARNING,
                                word: clean,
                                suggestion: clean.toUpperCase(),
                                line: li,
                                message: lang === "es"
                                    ? "Todo el texto debe estar en mayúsculas"
                                    : "All text should be uppercase"
                            });
                        }
                        break;

                    case CapStyle.LOWER:
                        if (clean !== clean.toLowerCase()) {
                            issues.push({
                                type: IssueType.CAPITALIZATION,
                                severity: Severity.INFO,
                                word: clean,
                                suggestion: clean.toLowerCase(),
                                line: li,
                                message: lang === "es"
                                    ? "Todo el texto debe estar en minúsculas"
                                    : "All text should be lowercase"
                            });
                        }
                        break;
                }
            }
        }

        return issues;
    };

    // ─── Punctuation analysis ────────────────────────────────────
    SpellCheckEngine.prototype.checkPunctuation = function(text, lang) {
        var issues = [];
        if (!text) return issues;

        lang = lang || this.detectLanguage(text);

        for (var ruleName in PUNCTUATION_RULES) {
            var rule = PUNCTUATION_RULES[ruleName];

            if (rule.checkLang && rule.checkLang !== lang) continue;

            if (rule.pattern) {
                var match;
                var regex = new RegExp(rule.pattern.source, rule.pattern.flags);
                while ((match = regex.exec(text)) !== null) {
                    var lineNum = text.substring(0, match.index).split("\n").length - 1;
                    var context = text.substring(
                        Math.max(0, match.index - 10),
                        Math.min(text.length, match.index + match[0].length + 10)
                    );

                    var suggestion = null;
                    if (ruleName === "doubleSpaces") {
                        suggestion = " ";
                    } else if (ruleName === "spaceBefore") {
                        suggestion = match[0].replace(/^ +/, "");
                    } else if (ruleName === "ellipsisDots") {
                        suggestion = "...";
                    }

                    issues.push({
                        type: IssueType.PUNCTUATION,
                        severity: rule.severity,
                        word: match[0],
                        suggestion: suggestion,
                        line: lineNum,
                        position: match.index,
                        context: context.trim(),
                        message: rule.message[lang] || rule.message.en,
                        rule: ruleName
                    });
                }
            } else if (rule.check) {
                if (rule.check(text)) {
                    issues.push({
                        type: IssueType.PUNCTUATION,
                        severity: rule.severity,
                        word: "",
                        suggestion: null,
                        line: 0,
                        message: rule.message[lang] || rule.message.en,
                        rule: ruleName
                    });
                }
            }
        }

        return issues;
    };

    // ─── Full text analysis ──────────────────────────────────────
    SpellCheckEngine.prototype.analyzeText = function(text, options) {
        options = options || {};
        if (!text || text.trim().length === 0) {
            return { issues: [], stats: { total: 0, errors: 0, warnings: 0, info: 0 }, lang: "en", capStyle: CapStyle.MIXED };
        }

        var lang = options.lang || this.detectLanguage(text);
        var capStyle = options.capStyle || this.detectCapStyle(text);
        var checkSpelling = options.checkSpelling !== false;
        var checkCaps = options.checkCaps !== false;
        var checkPunct = options.checkPunct !== false;

        var issues = [];

        if (checkSpelling) {
            var lines = text.split("\n");
            for (var li = 0; li < lines.length; li++) {
                var words = lines[li].match(/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑàèìòùâêîôûäëïöü]+/g) || [];
                for (var wi = 0; wi < words.length; wi++) {
                    var word = words[wi];
                    if (word.length <= 1) continue;
                    if (/^[A-ZÁÉÍÓÚÜÑ]+$/.test(word) && word.length <= 4) continue;

                    if (!this.checkSpelling(word, lang)) {
                        var suggestions = this.getSuggestions(word, lang);
                        var pos = lines[li].indexOf(word);
                        issues.push({
                            type: IssueType.SPELLING,
                            severity: Severity.ERROR,
                            word: word,
                            suggestions: suggestions,
                            suggestion: suggestions.length > 0 ? suggestions[0] : null,
                            line: li,
                            position: pos,
                            message: lang === "es"
                                ? '"' + word + '" no se encontró en el diccionario'
                                : '"' + word + '" not found in dictionary'
                        });
                    }
                }
            }
        }

        if (checkCaps) {
            var capIssues = this.checkCapitalization(text, capStyle);
            issues = issues.concat(capIssues);
        }

        if (checkPunct) {
            var punctIssues = this.checkPunctuation(text, lang);
            issues = issues.concat(punctIssues);
        }

        var stats = { total: issues.length, errors: 0, warnings: 0, info: 0 };
        for (var i = 0; i < issues.length; i++) {
            if (issues[i].severity === Severity.ERROR) stats.errors++;
            else if (issues[i].severity === Severity.WARNING) stats.warnings++;
            else stats.info++;
        }

        return {
            issues: issues,
            stats: stats,
            lang: lang,
            capStyle: capStyle
        };
    };

    // ─── Apply correction to text ────────────────────────────────
    SpellCheckEngine.prototype.applyCorrection = function(text, issue, replacement) {
        if (!issue || !replacement) return text;

        if (issue.position !== undefined && issue.position >= 0) {
            var before = text.substring(0, issue.position);
            var after = text.substring(issue.position + issue.word.length);
            return before + replacement + after;
        }

        return text.split(issue.word).join(replacement);
    };

    SpellCheckEngine.prototype.convertCase = function(text, targetStyle, lang) {
        lang = lang || this.detectLanguage(text);
        var titleLower = lang === "es" ? ES_TITLE_LOWERCASE : EN_TITLE_LOWERCASE;

        switch (targetStyle) {
            case CapStyle.UPPER:
                return text.toUpperCase();
            case CapStyle.LOWER:
                return text.toLowerCase();
            case CapStyle.SENTENCE:
                return text.replace(/(^|\.\s+|!\s+|\?\s+)([a-záéíóúüñ])/g, function(m, prefix, letter) {
                    return prefix + letter.toUpperCase();
                }).replace(/^[a-záéíóúüñ]/, function(c) { return c.toUpperCase(); });
            case CapStyle.TITLE:
                var words = text.toLowerCase().split(/(\s+)/);
                for (var i = 0; i < words.length; i++) {
                    if (/^\s+$/.test(words[i])) continue;
                    if (i === 0 || !titleLower.has(words[i])) {
                        words[i] = words[i].charAt(0).toUpperCase() + words[i].slice(1);
                    }
                }
                return words.join("");
            default:
                return text;
        }
    };

    // ─── Levenshtein distance ────────────────────────────────────
    function levenshtein(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;

        var matrix = [];
        for (var i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        for (var j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }
        for (var i = 1; i <= b.length; i++) {
            for (var j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    }

    // ─── Export ──────────────────────────────────────────────────
    global.SpellCheckEngine = SpellCheckEngine;

})(window);
