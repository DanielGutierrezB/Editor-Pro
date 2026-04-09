/**
 * Context Rules - Reglas contextuales avanzadas para análisis offline
 * Confusión de palabras, gramática, detección de tipo de texto, coherencia
 */

(function(global) {
    "use strict";

    // ─── Spanish confusion pairs (homófonos/parónimos) ──────────
    // Each entry: [wrong_in_context, correct, context_clues, explanation]
    var ES_CONFUSIONS = [
        {
            words: ["haber", "a ver"],
            rules: [
                { find: /\ba ver\b/gi, context: /(?:puede|debe|debería|tiene que|va a|vamos a|hay que)\s+a ver/i,
                  suggestion: "haber", explanation: "Después de verbos modales se usa \"haber\" (infinitivo), no \"a ver\"" },
                { find: /\bhaber\b/gi, context: /(?:^|[.!?]\s*)haber(?:\s*[,!]|\s+si\b|\s+qué\b)/i,
                  suggestion: "a ver", explanation: "\"A ver\" se usa como interjección o para indicar expectativa. \"Haber\" es un verbo auxiliar." }
            ]
        },
        {
            words: ["hay", "ahí", "ay"],
            rules: [
                { find: /\bay\b/gi, context: /\bay\s+(?:un|una|unos|unas|mucho|muchos|mucha|muchas|varios|bastante|poco|pocos)\b/i,
                  suggestion: "hay", explanation: "\"Hay\" (verbo haber) indica existencia. \"Ay\" es una interjección de dolor o sorpresa." },
                { find: /\bhay\b/gi, context: /(?:por|de|desde|hasta|hacia|en)\s+hay\b/i,
                  suggestion: "ahí", explanation: "\"Ahí\" indica lugar. \"Hay\" es verbo haber impersonal." },
                { find: /\bahí\b/gi, context: /\bahí\s+(?:un|una|unos|unas|mucho|muchos|que)\b/i,
                  suggestion: "hay", explanation: "\"Hay\" indica existencia. \"Ahí\" indica lugar." }
            ]
        },
        {
            words: ["hecho", "echo"],
            rules: [
                { find: /\becho\b/gi, context: /(?:he|ha|has|han|hemos|habéis|había|haya)\s+echo\b/i,
                  suggestion: "hecho", explanation: "Con el auxiliar \"haber\" se usa \"hecho\" (participio de hacer), no \"echo\" (de echar)." },
                { find: /\bhecho\b/gi, context: /(?:te|me|le|lo|la|se|nos)\s+hecho\b(?!\s+(?:de|a|un|una|el|la))/i,
                  suggestion: "echo", explanation: "\"Echo\" es del verbo echar. \"Hecho\" es del verbo hacer." }
            ]
        },
        {
            words: ["vaya", "valla", "baya"],
            rules: [
                { find: /\bvalla\b/gi, context: /(?:que|ojalá|espero que|puede que)\s+valla\b/i,
                  suggestion: "vaya", explanation: "\"Vaya\" es subjuntivo de ir o interjección. \"Valla\" es una cerca/barrera." },
                { find: /\bbaya\b/gi, context: /(?:que|ojalá)\s+baya\b/i,
                  suggestion: "vaya", explanation: "\"Vaya\" es subjuntivo de ir. \"Baya\" es un fruto." }
            ]
        },
        {
            words: ["tubo", "tuvo"],
            rules: [
                { find: /\btubo\b/gi, context: /(?:no|él|ella|usted|quien|que)\s+tubo\b/i,
                  suggestion: "tuvo", explanation: "\"Tuvo\" es pretérito de tener. \"Tubo\" es un objeto cilíndrico." },
                { find: /\btuvo\b/gi, context: /\btuvo\s+(?:de|del)\s+(?:agua|gas|metal|plástico|pvc|cobre|acero)/i,
                  suggestion: "tubo", explanation: "\"Tubo\" es un objeto cilíndrico. \"Tuvo\" es pretérito de tener." }
            ]
        },
        {
            words: ["a", "ha"],
            rules: [
                { find: /\ba\s+(?:hecho|dicho|venido|ido|sido|estado|tenido|podido|sabido|puesto|vuelto|escrito|visto|abierto|roto|muerto)\b/gi,
                  suggestion: function(m) { return "ha" + m.substring(1); },
                  explanation: "Se usa \"ha\" (haber) como auxiliar antes de participios, no la preposición \"a\"." }
            ]
        },
        {
            words: ["sino", "si no"],
            rules: [
                { find: /\bsi no\b/gi, context: /(?:no es|no fue|no era|no solo|no solamente|no únicamente)\s+[^,]*si no\b/i,
                  suggestion: "sino", explanation: "\"Sino\" es conjunción adversativa (equivale a \"pero sí\"). \"Si no\" es condicional negativo." }
            ]
        },
        {
            words: ["porque", "por que", "porqué", "por qué"],
            rules: [
                { find: /\bpor que\b/gi, context: /(?:^|[¿])\s*por que\b/i,
                  suggestion: "por qué", explanation: "\"¿Por qué?\" (interrogativo) lleva tilde y se escribe separado." },
                { find: /\bporque\b/gi, context: /(?:^|[¿])\s*porque\b/i,
                  suggestion: "por qué", explanation: "\"¿Por qué?\" es interrogativo. \"Porque\" es causal (respuesta)." },
                { find: /\bpor qué\b/gi, context: /(?:[,;]\s*|\bes\s+)por qué\b(?!\s*[?¿])/i,
                  suggestion: "porque", explanation: "\"Porque\" se usa para dar razones/causas. \"Por qué\" es interrogativo." }
            ]
        },
        {
            words: ["sobretodo", "sobre todo"],
            rules: [
                { find: /\bsobretodo\b/gi, context: /(?:pero|y|,)\s*sobretodo\b/i,
                  suggestion: "sobre todo", explanation: "\"Sobre todo\" (especialmente) se escribe separado. \"Sobretodo\" es una prenda de vestir." }
            ]
        },
        {
            words: ["también", "tan bien"],
            rules: [
                { find: /\btan bien\b/gi, context: /(?:yo|él|ella|nosotros|ellos|usted)\s+tan bien\b(?!\s+(?:como|que))/i,
                  suggestion: "también", explanation: "\"También\" (adverbio, indica adición). \"Tan bien\" compara calidad." }
            ]
        },
        {
            words: ["haya", "halla", "aya"],
            rules: [
                { find: /\bhalla\b/gi, context: /(?:que|cuando|si|ojalá|espero)\s+(?:se\s+)?halla\b/i,
                  suggestion: "haya", explanation: "\"Haya\" es subjuntivo de haber. \"Halla\" es de hallar/encontrar." },
                { find: /\bhaya\b/gi, context: /(?:se|lo|la)\s+haya\b(?:\s+(?:en|entre|por))/i,
                  suggestion: "halla", explanation: "\"Halla\" es del verbo hallar (encontrar). \"Haya\" es subjuntivo de haber." }
            ]
        },
        {
            words: ["ves", "vez"],
            rules: [
                { find: /\bves\b/gi, context: /(?:una|otra|cada|esta|esa|primera|última|tal|alguna|ninguna)\s+ves\b/i,
                  suggestion: "vez", explanation: "\"Vez\" es sustantivo (ocasión). \"Ves\" es del verbo ver." },
                { find: /\bvez\b/gi, context: /(?:tú|no|ya|lo)\s+vez\b(?!\s+(?:que|de|en|más|cuando))/i,
                  suggestion: "ves", explanation: "\"Ves\" es del verbo ver. \"Vez\" es sustantivo (ocasión)." }
            ]
        },
        {
            words: ["ola", "hola"],
            rules: [
                { find: /\bola\b/gi, context: /(?:^|[.!?¡¿]\s*)ola\b(?:\s*[,!.?]|\s+(?:a todos|amigos|mundo|qué))/i,
                  suggestion: "hola", explanation: "\"Hola\" es un saludo. \"Ola\" es una onda en el agua." }
            ]
        },
        {
            words: ["as", "has", "haz"],
            rules: [
                { find: /\bas\b/gi, context: /(?:tú|no|ya)\s+as\s+(?:hecho|dicho|visto|ido|tenido|podido|sido|estado|venido)\b/i,
                  suggestion: "has", explanation: "\"Has\" es auxiliar haber (tú). \"As\" es una carta o experto en algo." },
                { find: /\bhas\b/gi, context: /(?:^|[.!?]\s*)has\s+(?:lo|la|el|eso|esto|tu|click|clic)\b/i,
                  suggestion: "haz", explanation: "\"Haz\" es imperativo de hacer. \"Has\" es auxiliar haber." }
            ]
        }
    ];

    // ─── English confusion pairs ─────────────────────────────────
    var EN_CONFUSIONS = [
        {
            words: ["there", "their", "they're"],
            rules: [
                { find: /\bthere\b/gi, context: /\bthere\s+(?:car|house|dog|cat|child|children|team|company|work|idea|opinion|problem)\b/i,
                  suggestion: "their", explanation: "\"Their\" is possessive. \"There\" indicates a place." },
                { find: /\bthere\b/gi, context: /\bthere\s+(?:going|coming|doing|making|working|running|trying|getting)\b/i,
                  suggestion: "they're", explanation: "\"They're\" = they are. \"There\" indicates a place." },
                { find: /\btheir\b/gi, context: /(?:^|[.!?]\s+)their\s+(?:is|are|was|were|will|would|could|should|has|have)\b/i,
                  suggestion: "there", explanation: "\"There\" is used with \"is/are\" to indicate existence. \"Their\" is possessive." }
            ]
        },
        {
            words: ["your", "you're"],
            rules: [
                { find: /\byour\b/gi, context: /\byour\s+(?:welcome|right|wrong|the best|amazing|incredible|beautiful|hired|fired|invited|selected)\b/i,
                  suggestion: "you're", explanation: "\"You're\" = you are. \"Your\" is possessive." },
                { find: /\byou're\b/gi, context: /\byou're\s+(?:name|house|car|dog|team|company|order|account|project|design|video|brand)\b/i,
                  suggestion: "your", explanation: "\"Your\" is possessive. \"You're\" = you are." }
            ]
        },
        {
            words: ["its", "it's"],
            rules: [
                { find: /\bits\b/gi, context: /\bits\s+(?:time|been|not|a\s|the\s|going|coming|important|easy|hard|possible|impossible|clear|over|here|ok|okay|about|all)\b/i,
                  suggestion: "it's", explanation: "\"It's\" = it is/it has. \"Its\" is possessive." },
                { find: /\bit's\b/gi, context: /\bit's\s+(?:own|color|design|style|shape|size|name|purpose|function|feature|value|quality|beauty|power)\b/i,
                  suggestion: "its", explanation: "\"Its\" is possessive. \"It's\" = it is/it has." }
            ]
        },
        {
            words: ["then", "than"],
            rules: [
                { find: /\bthen\b/gi, context: /(?:more|less|better|worse|bigger|smaller|faster|slower|greater|higher|lower|rather|other)\s+then\b/i,
                  suggestion: "than", explanation: "\"Than\" is used for comparisons. \"Then\" indicates time/sequence." },
                { find: /\bthan\b/gi, context: /(?:and|but|,)\s+than\s+(?:we|you|they|he|she|it|i)\s+(?:will|can|could|should|would|must)\b/i,
                  suggestion: "then", explanation: "\"Then\" indicates sequence/time. \"Than\" is for comparisons." }
            ]
        },
        {
            words: ["effect", "affect"],
            rules: [
                { find: /\beffect\b/gi, context: /(?:will|can|could|does|did|doesn't|didn't|may|might|to)\s+effect\b(?!\s+(?:a change|a cure|a transformation))/i,
                  suggestion: "affect", explanation: "\"Affect\" is usually a verb (to influence). \"Effect\" is usually a noun (the result)." },
                { find: /\baffect\b/gi, context: /(?:the|a|an|no|any|this|that|its|positive|negative|visual|special|side|lasting)\s+affect\b/i,
                  suggestion: "effect", explanation: "\"Effect\" is a noun (the result). \"Affect\" is a verb (to influence)." }
            ]
        },
        {
            words: ["to", "too", "two"],
            rules: [
                { find: /\bto\b/gi, context: /\b(?:me|i'm|it's|that's|we're|you're)\s+to\b(?!\s+(?:be|do|go|get|have|make|take|see|say|come|give|find|know|want|tell|use))/i,
                  suggestion: "too", explanation: "\"Too\" means also/excessively. \"To\" is a preposition or infinitive marker." }
            ]
        },
        {
            words: ["lose", "loose"],
            rules: [
                { find: /\bloose\b/gi, context: /(?:don't|didn't|won't|can't|will|might|could|to|gonna|going to)\s+loose\b/i,
                  suggestion: "lose", explanation: "\"Lose\" means to misplace or fail. \"Loose\" means not tight." },
                { find: /\blose\b/gi, context: /(?:a|the|is|are|was|were|feels?|looks?|seems?|too)\s+lose\b/i,
                  suggestion: "loose", explanation: "\"Loose\" means not tight/free. \"Lose\" means to misplace or fail." }
            ]
        },
        {
            words: ["whose", "who's"],
            rules: [
                { find: /\bwhose\b/gi, context: /\bwhose\s+(?:the|is|are|was|were|going|coming|been|that|this)\b/i,
                  suggestion: "who's", explanation: "\"Who's\" = who is/who has. \"Whose\" is possessive." },
                { find: /\bwho's\b/gi, context: /\bwho's\s+(?:name|car|house|idea|project|design|work|turn|fault|responsibility)\b/i,
                  suggestion: "whose", explanation: "\"Whose\" is possessive. \"Who's\" = who is/who has." }
            ]
        }
    ];

    // ─── Text type detection ─────────────────────────────────────
    function detectTextType(text, layerName) {
        var lower = text.toLowerCase().trim();
        var nameL = (layerName || "").toLowerCase();
        var wordCount = text.trim().split(/\s+/).length;
        var lineCount = text.split("\n").length;

        if (nameL.match(/title|título|titular|heading|header|encabezado/i) || (wordCount <= 6 && lineCount === 1)) {
            return "title";
        }
        if (nameL.match(/sub|caption|bajada|descripción/i) || (wordCount <= 15 && wordCount > 6 && lineCount <= 2)) {
            return "subtitle";
        }
        if (nameL.match(/cta|button|botón|btn|action|acción/i) ||
            lower.match(/^(click|haz clic|comprar|buy|shop|learn more|ver más|subscribe|suscribir|start|comenzar|discover|descubr|get|sign up|register|contact|download|descargar)/i) ||
            (wordCount <= 4 && /^[A-ZÁÉÍÓÚÑ]/.test(text))) {
            return "cta";
        }
        if (nameL.match(/label|tag|etiqueta|badge|chip/i) || (wordCount <= 3 && lineCount === 1)) {
            return "label";
        }
        if (nameL.match(/body|cuerpo|text|texto|paragraph|párrafo|description|descripción/i) || (wordCount > 15)) {
            return "body";
        }
        if (nameL.match(/caption|leyenda|note|nota|footnote/i) || (wordCount <= 10 && lineCount === 1)) {
            return "caption";
        }
        if (wordCount <= 8) return "title";
        return "body";
    }

    // ─── Consistency checking ────────────────────────────────────
    function checkConsistency(layers) {
        var issues = [];
        if (layers.length < 2) return issues;

        var styles = {};
        layers.forEach(function(layer) {
            var textType = detectTextType(layer.text, layer.name);
            if (!styles[textType]) styles[textType] = [];
            styles[textType].push(layer);
        });

        for (var type in styles) {
            var group = styles[type];
            if (group.length < 2) continue;

            var cases = group.map(function(l) {
                var t = l.text.trim();
                if (t === t.toUpperCase()) return "upper";
                if (t === t.toLowerCase()) return "lower";
                if (/^[A-ZÁÉÍÓÚÑ]/.test(t)) return "capitalized";
                return "other";
            });

            var caseCount = {};
            cases.forEach(function(c) { caseCount[c] = (caseCount[c] || 0) + 1; });

            var dominant = Object.keys(caseCount).sort(function(a, b) { return caseCount[b] - caseCount[a]; })[0];

            group.forEach(function(layer, idx) {
                if (cases[idx] !== dominant && caseCount[dominant] > 1) {
                    issues.push({
                        layerIndex: layer.index,
                        layerName: layer.name,
                        type: "coherence",
                        severity: "warning",
                        original: layer.text,
                        suggestion: null,
                        explanation: "Esta capa tipo \"" + type + "\" usa un estilo diferente (" + cases[idx] +
                            ") al de las otras capas del mismo tipo (" + dominant + "). Considera mantener consistencia.",
                        context: "Consistencia entre capas"
                    });
                }
            });

            var langs = group.map(function(l) {
                return /[áéíóúñ¿¡]/i.test(l.text) ? "es" : "en";
            });
            var langMix = new Set(langs);
            if (langMix.size > 1) {
                issues.push({
                    layerIndex: group[0].index,
                    layerName: group[0].name,
                    type: "coherence",
                    severity: "info",
                    original: "",
                    suggestion: null,
                    explanation: "Se detectaron capas tipo \"" + type + "\" en diferentes idiomas. Verifica si es intencional.",
                    context: "Mezcla de idiomas"
                });
            }
        }

        return issues;
    }

    // ─── Redundancy detection ────────────────────────────────────
    function checkRedundancy(text, lang) {
        var issues = [];
        lang = lang || "es";

        var esRedundant = [
            { pattern: /\bsubir\s+(?:para\s+)?arriba\b/gi, suggestion: "subir", explanation: "\"Subir arriba\" es redundante, \"subir\" ya implica dirección hacia arriba." },
            { pattern: /\bbajar\s+(?:para\s+)?abajo\b/gi, suggestion: "bajar", explanation: "\"Bajar abajo\" es redundante." },
            { pattern: /\bsalir\s+(?:para\s+)?afuera\b/gi, suggestion: "salir", explanation: "\"Salir afuera\" es redundante." },
            { pattern: /\bentrar\s+(?:para\s+)?adentro\b/gi, suggestion: "entrar", explanation: "\"Entrar adentro\" es redundante." },
            { pattern: /\bvolver\s+a\s+repetir\b/gi, suggestion: "repetir", explanation: "\"Volver a repetir\" es redundante; \"repetir\" ya significa hacer de nuevo." },
            { pattern: /\blapso\s+de\s+tiempo\b/gi, suggestion: "lapso", explanation: "\"Lapso\" ya significa periodo de tiempo." },
            { pattern: /\bpersonaje\s+ficticio\b/gi, suggestion: "personaje", explanation: "Un personaje es ficticio por definición, a menos que se refiera a una persona real." },
            { pattern: /\bprever\s+de\s+antemano\b/gi, suggestion: "prever", explanation: "\"Prever\" ya implica anticipación." },
            { pattern: /\bun total de\b/gi, suggestion: "", explanation: "\"Un total de\" es frecuentemente innecesario. Considera usar solo el número." },
            { pattern: /\b100\s*%\s+de\s+(?:todo|todos|todas)\b/gi, suggestion: "todo/todos/todas", explanation: "\"100% de todo\" es redundante." }
        ];

        var enRedundant = [
            { pattern: /\babsolutely\s+essential\b/gi, suggestion: "essential", explanation: "\"Essential\" is already absolute; \"absolutely\" is redundant." },
            { pattern: /\bfree\s+gift\b/gi, suggestion: "gift", explanation: "A gift is free by definition." },
            { pattern: /\bnew\s+innovation\b/gi, suggestion: "innovation", explanation: "Innovations are new by definition." },
            { pattern: /\bpast\s+history\b/gi, suggestion: "history", explanation: "History is in the past by definition." },
            { pattern: /\bfuture\s+plans?\b/gi, suggestion: "plans", explanation: "Plans are for the future by definition." },
            { pattern: /\bend\s+result\b/gi, suggestion: "result", explanation: "A result is already at the end of a process." },
            { pattern: /\bvery\s+unique\b/gi, suggestion: "unique", explanation: "\"Unique\" is absolute; it cannot be qualified with \"very\"." },
            { pattern: /\breason\s+(?:is\s+)?because\b/gi, suggestion: "reason is that", explanation: "\"The reason is because\" is redundant; use \"the reason is that\"." },
            { pattern: /\bATM\s+machine\b/gi, suggestion: "ATM", explanation: "ATM already stands for \"Automated Teller Machine\"." },
            { pattern: /\bPIN\s+number\b/gi, suggestion: "PIN", explanation: "PIN already stands for \"Personal Identification Number\"." }
        ];

        var rules = lang === "es" ? esRedundant : enRedundant;

        rules.forEach(function(rule) {
            var match;
            while ((match = rule.pattern.exec(text)) !== null) {
                issues.push({
                    type: "style",
                    severity: "info",
                    original: match[0],
                    suggestion: rule.suggestion,
                    explanation: rule.explanation,
                    context: "Redundancia",
                    position: match.index
                });
            }
        });

        return issues;
    }

    // ─── Apply confusion rules ───────────────────────────────────
    function checkConfusions(text, lang) {
        var issues = [];
        var confusions = lang === "es" ? ES_CONFUSIONS : EN_CONFUSIONS;

        confusions.forEach(function(group) {
            group.rules.forEach(function(rule) {
                var match;
                var regex = new RegExp(rule.find.source, rule.find.flags);
                while ((match = regex.exec(text)) !== null) {
                    var surroundStart = Math.max(0, match.index - 30);
                    var surroundEnd = Math.min(text.length, match.index + match[0].length + 30);
                    var surrounding = text.substring(surroundStart, surroundEnd);

                    if (rule.context && rule.context.test(surrounding)) {
                        var sug = typeof rule.suggestion === "function" ? rule.suggestion(match[0]) : rule.suggestion;
                        issues.push({
                            type: "grammar",
                            severity: "error",
                            original: match[0],
                            suggestion: sug,
                            explanation: rule.explanation,
                            context: "Confusión de palabras",
                            position: match.index
                        });
                    }
                }
            });
        });

        return issues;
    }

    // ─── Motion graphics specific checks ─────────────────────────
    function checkMotionGraphicsStyle(text, textType, lang) {
        var issues = [];
        var wordCount = text.trim().split(/\s+/).length;

        if (textType === "title" && wordCount > 8) {
            issues.push({
                type: "style",
                severity: "info",
                original: text,
                suggestion: null,
                explanation: lang === "es"
                    ? "Los títulos en motion graphics funcionan mejor con 3-6 palabras. Este tiene " + wordCount + " palabras. Considera acortarlo."
                    : "Motion graphics titles work best with 3-6 words. This has " + wordCount + ". Consider shortening it.",
                context: lang === "es" ? "Legibilidad en video" : "Video readability"
            });
        }

        if (textType === "cta" && wordCount > 5) {
            issues.push({
                type: "style",
                severity: "warning",
                original: text,
                suggestion: null,
                explanation: lang === "es"
                    ? "Los CTAs (llamados a la acción) deben ser muy cortos (2-4 palabras). Este tiene " + wordCount + "."
                    : "CTAs should be very short (2-4 words). This has " + wordCount + ".",
                context: "CTA"
            });
        }

        if (textType === "subtitle" && wordCount > 20) {
            issues.push({
                type: "style",
                severity: "info",
                original: text,
                suggestion: null,
                explanation: lang === "es"
                    ? "Los subtítulos en video son más legibles con menos de 15 palabras."
                    : "Video subtitles are more readable under 15 words.",
                context: lang === "es" ? "Legibilidad" : "Readability"
            });
        }

        if (text.length > 0 && /\s{3,}/.test(text)) {
            issues.push({
                type: "style",
                severity: "warning",
                original: text.match(/\s{3,}/)[0],
                suggestion: " ",
                explanation: lang === "es"
                    ? "Espaciado excesivo detectado. Puede causar problemas en la composición."
                    : "Excessive spacing detected. This may cause composition issues.",
                context: lang === "es" ? "Formato" : "Formatting"
            });
        }

        return issues;
    }

    // ─── Export ───────────────────────────────────────────────────
    global.ContextRules = {
        detectTextType: detectTextType,
        checkConsistency: checkConsistency,
        checkRedundancy: checkRedundancy,
        checkConfusions: checkConfusions,
        checkMotionGraphicsStyle: checkMotionGraphicsStyle,
        ES_CONFUSIONS: ES_CONFUSIONS,
        EN_CONFUSIONS: EN_CONFUSIONS
    };

})(window);
