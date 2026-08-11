/**
 * marker-verify.js — Módulo PURO: revisión del RESULTADO después de mover los
 * marcadores.
 *
 * Por qué existe: mover el marcador es una propuesta; lo que se corta es lo que
 * quedó en la secuencia. Entre lo uno y lo otro se cuela de todo — el LLM eligió
 * un punto flojo, el movimiento se recreó en otro frame, o el bloque quedó
 * arrancando en un conteo. Este módulo mira los tiempos REALES de los marcadores
 * contra el transcript y dice, borde por borde, si el corte pasa o no.
 *
 * La revisión es determinística a propósito: es un chequeo, no una elección. Lo
 * que hace el LLM es volver a elegir el punto de los bordes que no pasan.
 *
 * Doble export: window.EPMarkerVerify + module.exports (Node).
 */
(function(global) {
    "use strict";

    var DEFAULTS = {
        padFrames: 10,        // colchón esperado (el mismo de marker-precision)
        fps: 25,
        hardAirFrames: 2,     // por debajo de esto el corte se come el ataque
        airSlackFrames: 3,    // ganancia mínima que vale la pena reclamar (~0.12s a 25fps)
        minBlockSec: 1.0,     // un bloque más corto que esto es sospechoso
        minPickupTokens: 3,   // palabras repetidas para cantar un pickup
        minPickupChars: 12,
        takeGapSec: 12,       // silencio que marca una toma nueva (grabación parada)
        takeSkipMaxSec: 15,   // hasta dónde se busca ese arranque hacia atrás
        takeSkipMaxWords: 30,
        headTokens: 8,        // palabras de la cabeza del bloque que se revisan
        tailTokens: 12,       // palabras de la cola que se revisan
        phraseGapSec: 1.0,    // pausa que separa dos frases aunque falte el punto
        phraseBackMaxSec: 8,  // hasta dónde se busca atrás el arranque de la frase
        phraseBackMaxWords: 14,
        phraseFwdMaxSec: 4,   // hasta dónde se busca adelante el final de la frase
        phraseFwdMaxWords: 12
    };

    function opt(opts, key) {
        if (opts && opts[key] !== undefined && opts[key] !== null) return opts[key];
        return DEFAULTS[key];
    }

    function frameRate(opts) {
        var fps = Number(opt(opts, "fps"));
        if (!isFinite(fps) || fps <= 0) return DEFAULTS.fps;
        return fps;
    }

    function padFrames(opts) {
        var pad = Number(opt(opts, "padFrames"));
        if (!isFinite(pad) || pad < 0) pad = DEFAULTS.padFrames;
        return pad;
    }

    /**
     * Veredicto del aire de un borde. Tres reglas, en este orden:
     *   1. Si no hay nada que ganar (el silencio disponible ya está casi todo
     *      tomado, o la ganancia no llega a lo que vale la pena mover) → pasa.
     *      Exigir el colchón completo donde no existe silencio para dárselo es
     *      pedirle al editor algo imposible.
     *   2. Si el aire es tan corto que se come el ataque de la palabra → BLOQUEA:
     *      eso sí se oye.
     *   3. Si no → AVISO: se podría tener más aire, pero nada está roto. No frena
     *      el corte; frenarlo por unos frames de estética es peor que el defecto.
     * @returns {string} "" | "block" | "warn"
     */
    function airVerdict(air, opts) {
        var achievable = Math.min(padFrames(opts), air.available);
        var gain = achievable - air.frames;
        if (gain < Number(opt(opts, "airSlackFrames"))) return "";
        if (air.frames < Number(opt(opts, "hardAirFrames"))) return "block";
        return "warn";
    }

    /** Compatibilidad: el aire mínimo que se considera seguro. */
    function minAirFrames(opts) {
        return Number(opt(opts, "hardAirFrames"));
    }

    // Comandos al editor: si el bloque termina con uno de estos, el OUT se pasó.
    var EDITOR_CUES = ["pausa", "corte", "corta", "alto", "para", "cortale", "cortala"];
    // Con qué se abandona un intento a media frase. Se quitan del final del bloque
    // como el comando al editor: no son clase, son el profesor parándose.
    //
    // Van por FRASES, no por palabras sueltas: "me" solo cuenta pegado a
    // "equivoqué", porque suelto cierra media clase ("...eso a mí me"). Por lo
    // mismo "no" solo cuenta repetido, que es como suena un aborto ("no, no").
    var ABORT_PHRASES = [
        ["me", "equivoque"], ["equivoque"], ["me", "equivoco"],
        ["perdon"], ["perdona"], ["perdoname"], ["disculpa"], ["disculpen"],
        ["otra", "vez"], ["esperate"], ["espera"], ["esperen"],
        ["repito"], ["lo", "repito"], ["no", "no"]
    ];
    // Muletillas que rodean a las sobras ("...dije. Bueno, no, espera.", "Pausa. Va.").
    // Solas NO significan nada —"y esto no" cierra clase— así que solo se quitan
    // cuando en la misma cola ya apareció un cue al editor o un aborto.
    var TAIL_FILLERS = ["bueno", "no", "eh", "ah", "ay", "uy", "este", "pues",
        "ok", "okey", "aja", "mmm", "em", "osea"];
    // Conteos y arranques de producción: si el bloque empieza aquí, el IN se quedó
    // corto. "una" NO está: nadie cuenta "tres, dos, una", y en cambio es artículo
    // en media clase ("Una pregunta de negocio sonaría...").
    var COUNT_TOKENS = ["0","1","2","3","4","5","6","7","8","9",
        "cero","uno","dos","tres","cuatro","cinco","seis","siete","ocho","nueve","diez"];
    var START_CUES = ["listo","dale","grabando","grabamos","accion","corre","corriendo","va","vale","aja"];
    // Con qué anuncia el profesor que vuelve a grabar. Vale por sí solo (no hace
    // falta conteo), pero solo cuando es un anuncio suelto: ver `leadInWord`.
    var RETAKE_CUES = ["retomemos","retomamos","retomo","retoma","retomando",
        "volvemos","repetimos","repito"];
    // Con qué se abre una toma cuando el intento anterior salió mal. No cuenta como
    // contenido: el arranque real es lo que viene después ("Ay... Perdón. En la
    // clase pasada vimos...").
    var RESTART_CUES = ["ay","uy","ok","okey","perdon","perdona","perdonen","perdoname",
        "disculpa","disculpen","otra","vez"];

    function toMap(arr) {
        var m = {};
        for (var i = 0; i < arr.length; i++) m[arr[i]] = true;
        return m;
    }
    var CUE_MAP = toMap(EDITOR_CUES);
    var COUNT_MAP = toMap(COUNT_TOKENS);
    var START_MAP = toMap(START_CUES);
    var RESTART_MAP = toMap(RESTART_CUES);
    var RETAKE_MAP = toMap(RETAKE_CUES);
    var FILLER_MAP = toMap(TAIL_FILLERS);
    // Con lo que se retoma una frase sin que eso sea contenido nuevo. Rehacer una toma
    // casi siempre añade uno de estos delante ("Entonces, ya que está esa cadena…" para
    // repetir "Ya que está esa cadena…"), y sin saltárselo la repetición no se ve.
    var CONNECTOR_MAP = toMap(["entonces", "bueno", "pues", "y", "osea", "asi", "aqui"]);

    function normToken(text) {
        var t = String(text || "").toLowerCase();
        try { t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {}
        return t.replace(/[.,!?;:…"“”'’¿¡()\[\]—–\-]/g, "").replace(/\s+/g, "");
    }

    function wordText(w) {
        if (!w) return "";
        var t = (w.text != null) ? w.text : w.word;
        return t == null ? "" : String(t);
    }

    function spokenWords(words) {
        var out = [];
        for (var i = 0; i < (words || []).length; i++) {
            var w = words[i];
            if (!w) continue;
            if (w.type && w.type !== "word") continue;
            if (typeof w.start !== "number" || typeof w.end !== "number") continue;
            if (!wordText(w)) continue;
            out.push(w);
        }
        out.sort(function(a, b) { return a.start - b.start; });
        return out;
    }

    function inRange(spoken, start, end) {
        var out = [];
        for (var i = 0; i < spoken.length; i++) {
            var mid = (spoken[i].start + spoken[i].end) / 2;
            if (mid >= start - 0.01 && mid <= end + 0.01) out.push(spoken[i]);
        }
        return out;
    }

    /** Palabra que contiene el instante t (el corte la estaría partiendo). */
    function wordAt(spoken, t) {
        for (var i = 0; i < spoken.length; i++) {
            if (t > spoken[i].start + 0.001 && t < spoken[i].end - 0.001) return spoken[i];
        }
        return null;
    }

    function prevWordEnd(spoken, t) {
        var best = null;
        for (var i = 0; i < spoken.length; i++) {
            if (spoken[i].end <= t + 0.001) best = spoken[i];
            else break;
        }
        return best;
    }

    function nextWordStart(spoken, t) {
        for (var i = 0; i < spoken.length; i++) {
            if (spoken[i].start >= t - 0.001) return spoken[i];
        }
        return null;
    }

    function significantTokens(list, limit, fromTail) {
        var toks = [];
        var seq = fromTail ? list.slice(Math.max(0, list.length - limit)) : list.slice(0, limit);
        for (var i = 0; i < seq.length; i++) {
            var t = normToken(wordText(seq[i]));
            if (t) toks.push({ token: t, word: seq[i] });
        }
        return toks;
    }

    // ─── Chequeos por borde ──────────────────────────────────

    /**
     * Aire real de un borde, en frames.
     *   IN:  distancia hasta la primera palabra del bloque
     *   OUT: distancia desde la última palabra del bloque
     * `available` es el silencio que había para trabajar: si el silencio es corto,
     * la falta de aire no es un error, es que no había de dónde sacarlo.
     */
    function airAt(spoken, time, kind, opts) {
        var fps = frameRate(opts);
        if (kind === "IN") {
            var next = nextWordStart(spoken, time);
            if (!next) return { frames: 0, available: 0, word: null };
            var prev = prevWordEnd(spoken, next.start);
            var gap = prev ? Math.max(0, next.start - prev.end) : next.start;
            return {
                frames: Math.max(0, next.start - time) * fps,
                available: gap * fps,
                word: next
            };
        }
        var last = prevWordEnd(spoken, time);
        if (!last) return { frames: 0, available: 0, word: null };
        var after = nextWordStart(spoken, last.end);
        var gap2 = after ? Math.max(0, after.start - last.end) : 999;
        return {
            frames: Math.max(0, time - last.end) * fps,
            available: gap2 * fps,
            word: last
        };
    }

    /**
     * ¿El bloque arranca con un conteo o un cue de producción? Devuelve la palabra
     * donde empieza el contenido real, o null si arranca bien.
     *
     * Un número suelto NO es un conteo: "Uno de los problemas...", "Dos cosas
     * importantes..." son contenido. Hace falta un conteo de verdad (dos números
     * seguidos) o un número con un cue de producción al lado ("listo, tres, va").
     *
     * El anuncio de retoma ("Retomamos.", "Volvemos.") vale por sí solo, pero solo
     * cuando es un anuncio suelto: lo que viene detrás tiene que ABRIR FRASE (punto
     * en medio o pausa). Sin esa guarda, "Retomemos lo que vimos la clase pasada"
     * —que es clase— abriría el bloque en "lo".
     */
    function leadInWord(blockWords, opts) {
        if (blockWords.length < 4) return null;
        var run = 0, numbers = 0, cues = 0, retakes = 0;
        for (var i = 0; i < blockWords.length; i++) {
            var tk = normToken(wordText(blockWords[i]));
            if (tk === "") { run++; continue; }
            if (COUNT_MAP[tk]) { numbers++; run++; }
            else if (START_MAP[tk]) { cues++; run++; }
            else if (RETAKE_MAP[tk]) { retakes++; run++; }
            else break;
        }
        if (run === 0) return null;
        var counted = numbers >= 2 || (numbers >= 1 && cues >= 1);
        if (!counted && !(retakes >= 1 && opensSentence(blockWords, run, opts))) return null;
        if (run >= blockWords.length - 2) return null; // casi todo conteo: no fiable
        return blockWords[run];
    }

    /**
     * ¿El bloque abre a mitad de la toma? Tras un silencio muy largo la grabación
     * se paró y volvió a arrancar, así que lo primero que se habla después es cómo
     * la profesora decidió abrir la toma nueva. Si el IN cae unas palabras más
     * adelante, el corte se come ese arranque — es el defecto que se ve como "el
     * marcador empieza después de donde habla".
     *
     * Devuelve la palabra donde arranca la toma, o null si el IN ya está bien.
     *
     * El umbral (`takeGapSec`, 12s) separa parar la grabación de pausar entre
     * intentos, y esa diferencia es la que evita falsos positivos. Medido sobre una
     * clase real: tras 4,6s venía "Ay... Perdón.", tras 5,5s un "¿Ahí estoy bien
     * centrada, sí, verdad?" al equipo y tras 6,3s un "OK, va." — basura que el IN
     * hacía bien en dejar fuera. Tras 24,5s venía "¿Qué es la respuesta?", el
     * arranque legítimo de la toma que el corte estaba tirando.
     *
     * Guardas adicionales:
     *   · el arranque tiene que estar cerca (pocas palabras, pocos segundos): si no
     *     hay una toma nueva ahí al lado, esto no opina;
     *   · no se cruza `floorTime` (el OUT del bloque anterior), porque entonces las
     *     palabras de atrás ya son de ese bloque y este empieza a mitad a propósito;
     *   · conteos, cues de producción y disculpas del arranque ("Ay... Perdón.") no
     *     cuentan como contenido: el arranque real es lo que viene después. Es la
     *     misma regla que `leadInWord`, para que los dos chequeos no se peleen.
     */
    function takeStartWord(spoken, inTime, floorTime, opts) {
        var takeGap = opt(opts, "takeGapSec");
        var maxWords = opt(opts, "takeSkipMaxWords");
        var maxSec = opt(opts, "takeSkipMaxSec");

        var first = -1;
        for (var i = 0; i < spoken.length; i++) {
            if (spoken[i].start >= inTime - 0.001) { first = i; break; }
        }
        if (first <= 0) return null;

        var idx = first, found = false;
        while (idx > 0) {
            if (spoken[idx].start - spoken[idx - 1].end >= takeGap) { found = true; break; }
            if (spoken[idx - 1].end < floorTime) return null;
            idx--;
            if (first - idx > maxWords) return null;
        }
        // Sin frontera de toma a la vista no hay nada que decir; si la frontera es
        // justo el arranque del bloque, el IN ya está donde debe.
        if (!found || idx === first) return null;
        if (spoken[first].start - spoken[idx].start > maxSec) return null;

        // Conteos, cues y disculpas del arranque no cuentan como contenido.
        while (idx < first) {
            var tk = normToken(wordText(spoken[idx]));
            if (tk && !COUNT_MAP[tk] && !START_MAP[tk] && !RESTART_MAP[tk]) break;
            idx++;
        }
        return idx < first ? spoken[idx] : null;
    }

    /**
     * El arranque de la toma en la que cae un IN, si el corte abre a mitad de ella.
     * Envoltorio de `takeStartWord` para quien trae words[] crudas: lo usa el paso 4
     * para colocar el IN antes de preguntarle al LLM, no solo para repararlo después.
     * @returns {object|null} la palabra donde arranca la toma
     */
    function takeStartAt(words, inTime, floorTime, opts) {
        return takeStartWord(spokenWords(words), inTime, floorTime || 0, opts);
    }

    /**
     * ¿El bloque termina con algo que no es clase? Dos cosas mandan aquí: el comando
     * al editor ("...un fenómeno. Pausa.") y el intento abandonado a media frase
     * ("...una línea de... Otra vez."). Devuelve la última palabra de contenido, o
     * null si el bloque cierra bien.
     *
     * Se pela desde el final, porque estas sobras vienen en racimo — de la clase 15:
     * *"...que yo ya dije. Bueno, no, espera."* y *"...esa cadena. Pausa. Va."*. Las
     * muletillas y los cues de producción del racimo solo cuentan si en la misma cola
     * apareció un comando al editor o un aborto: sueltos son clase ("y esto no").
     */
    function trailingCueWord(blockWords) {
        if (blockWords.length < 3) return null;
        var end = blockWords.length, strong = false;
        for (;;) {
            var peel = peelTail(blockWords, end);
            if (!peel) break;
            end = peel.end;
            if (peel.strong) strong = true;
        }
        // Con casi todo el bloque pelado, lo que hay no es una sobra al final: es un
        // bloque que no es contenido, y de eso no habla este chequeo.
        if (!strong || end < 3) return null;
        for (var i = end - 1; i >= 0; i--) {
            if (normToken(wordText(blockWords[i])) !== "") return blockWords[i];
        }
        return null;
    }

    /**
     * Quita del final una sobra: un comando al editor, una frase de aborto, un cue de
     * producción o una muletilla.
     * @returns {object|null} `{end, strong}` — `strong` distingue lo que por sí solo
     *   prueba que la cola sobra, de lo que solo acompaña
     */
    function peelTail(words, end) {
        var last = end - 1;
        while (last >= 0 && normToken(wordText(words[last])) === "") last--;
        if (last < 0) return null;

        var tk = normToken(wordText(words[last]));
        if (CUE_MAP[tk]) return { end: last, strong: true };

        for (var p = 0; p < ABORT_PHRASES.length; p++) {
            var phrase = ABORT_PHRASES[p], at = last, ok = true;
            for (var w = phrase.length - 1; w >= 0; w--) {
                while (at >= 0 && normToken(wordText(words[at])) === "") at--;
                if (at < 0 || normToken(wordText(words[at])) !== phrase[w]) { ok = false; break; }
                at--;
            }
            if (ok) return { end: at + 1, strong: true };
        }

        if (START_MAP[tk] || FILLER_MAP[tk]) return { end: last, strong: false };
        return null;
    }

    /**
     * ¿La cabeza del bloque repite la cola del anterior? Es el pickup clásico: el
     * profesor retoma repitiendo. Devuelve la primera palabra repetida y `cutAt`, el
     * final de la palabra anterior — el OUT tiene que caer ahí, porque un OUT vive
     * en el FIN de una palabra, no en el inicio de la siguiente.
     */
    // Puntuación con la que una frase termina. Los puntos suspensivos cierran la
    // frase ANTERIOR (lo que sigue empieza frase nueva) pero no cierran la propia:
    // "creo que..." es una frase a medias, no un final.
    var ENDS_SENTENCE = /[.!?][")'\]»]*$/;
    var ENDS_BEFORE_NEW = /(\.\.\.|…|[.!?])[")'\]»]*$/;

    /** ¿Esta palabra abre frase? (primera del transcript, tras punto o tras pausa) */
    function opensSentence(spoken, i, opts) {
        if (i <= 0) return true;
        var prev = spoken[i - 1];
        if (ENDS_BEFORE_NEW.test(wordText(prev).replace(/\s+$/, ""))) return true;
        return (spoken[i].start - prev.end) >= opt(opts, "phraseGapSec");
    }

    /** ¿Esta palabra cierra frase? (punto propio o pausa larga después) */
    function closesSentence(spoken, i, opts) {
        if (ENDS_SENTENCE.test(wordText(spoken[i]).replace(/\s+$/, ""))) return true;
        if (i >= spoken.length - 1) return true;
        return (spoken[i + 1].start - spoken[i].end) >= opt(opts, "phraseGapSec");
    }

    function isFillerToken(tk) {
        return !!(CUE_MAP[tk] || COUNT_MAP[tk] || START_MAP[tk] || RESTART_MAP[tk] ||
            RETAKE_MAP[tk]);
    }

    /**
     * ¿El IN abre a mitad de una frase? Devuelve la palabra con la que la frase
     * empieza, o null si el IN ya abre bien (o si no se puede afirmar).
     *
     * Es el defecto que más se ve en la timeline: el marcador cae dentro de una
     * frase seguida y el corte entra con la frase empezada. Caso real: la toma
     * arrancaba en "Por lo tanto, una cadena de evidencia muestra…" (401.9s) y el
     * IN entró en "una" (403.2s) — `mid-word` lo veía y lo mandaba al principio de
     * "cadena", que sigue estando a mitad de la frase. El silencio previo (6.4s) no
     * llegaba al umbral de `take-start`, así que nadie lo corregía.
     *
     * Se busca hacia atrás y solo se opina con pruebas: la frase tiene que empezar
     * cerca, sin cruzar el OUT del bloque anterior, y entre medias no puede haber
     * conteos ni cues (de eso hablan `lead-in` y `take-start`, y dos reglas
     * peleándose por el mismo borde es lo que hacía ir y volver al marcador).
     */
    function phraseStartWord(words, time, floorTime, opts) {
        var spoken = spokenWords(words);
        var idx = -1;
        for (var i = 0; i < spoken.length; i++) {
            if (spoken[i].end > time + 0.001) { idx = i; break; }
        }
        if (idx < 0) return null;
        if (opensSentence(spoken, idx, opts)) return null;

        var maxWords = opt(opts, "phraseBackMaxWords");
        var maxSec = opt(opts, "phraseBackMaxSec");
        for (var j = idx - 1; j >= 0 && idx - j <= maxWords; j--) {
            var w = spoken[j];
            if (time - w.start > maxSec) return null;
            if (floorTime && w.start < floorTime) return null;
            if (isFillerToken(normToken(wordText(w)))) return null;
            if (opensSentence(spoken, j, opts)) return w;
        }
        return null;
    }

    /**
     * ¿El OUT cierra a mitad de una frase? Devuelve la palabra con la que la frase
     * termina, o null si cierra bien (o si no se puede afirmar).
     *
     * Al revés que el IN: aquí hay que ir hacia ADELANTE, y eso añade palabras al
     * bloque, así que las condiciones son más duras — habla seguida hasta el punto
     * (sin pausas por medio), cerca, sin pasar del IN del bloque siguiente y sin
     * cues ni conteos en medio. Si la toma se cortó a mitad de frase, lo que sigue
     * es un cue o una muletilla y esto se calla: lo dicen `editor-cue` y `pickup`.
     */
    function phraseEndWord(words, time, ceilTime, opts) {
        var spoken = spokenWords(words);
        var idx = -1;
        for (var i = spoken.length - 1; i >= 0; i--) {
            if (spoken[i].start < time - 0.001) { idx = i; break; }
        }
        if (idx < 0) return null;
        if (closesSentence(spoken, idx, opts)) return null;

        var maxWords = opt(opts, "phraseFwdMaxWords");
        var maxSec = opt(opts, "phraseFwdMaxSec");
        var gapMax = opt(opts, "phraseGapSec");
        for (var j = idx + 1; j < spoken.length && j - idx <= maxWords; j++) {
            var w = spoken[j];
            if (w.end - time > maxSec) return null;
            if (ceilTime && w.end > ceilTime) return null;
            if (w.start - spoken[j - 1].end >= gapMax) return null;
            if (isFillerToken(normToken(wordText(w)))) return null;
            if (ENDS_SENTENCE.test(wordText(w).replace(/\s+$/, ""))) return w;
        }
        return null;
    }

    /**
     * ¿De este token en adelante la cola ya no dice nada? Solo se toleran cues al
     * editor ("pausa", "corte"), conteos y muletillas de arranque: el profesor
     * cortando la toma, no contenido de la clase.
     */
    function tailSpentFrom(tail, from) {
        for (var i = from; i < tail.length; i++) {
            var tk = tail[i].token;
            if (!CUE_MAP[tk] && !COUNT_MAP[tk] && !START_MAP[tk] && !RESTART_MAP[tk]) return false;
        }
        return true;
    }

    /**
     * @returns {object|null} `{word, tokens, cutAt, spent}`. `spent` distingue los dos
     *   casos: con la cola gastada es un pickup y se recorta; sin gastar, lo repetido
     *   puede ser una re-toma que el profesor rehizo o dos frases distintas de la clase
     *   que empiezan igual, y eso no lo decide una regla (ver `repeat-hint`).
     */
    function pickupOverlap(prevWords, nextWords, opts) {
        var minTok = opt(opts, "minPickupTokens");
        var minChars = opt(opts, "minPickupChars");
        var head = significantTokens(nextWords, opt(opts, "headTokens"), false);
        var tail = significantTokens(prevWords, opt(opts, "tailTokens"), true);
        if (head.length < minTok || tail.length < minTok) return null;
        var loose = null;

        // Match contiguo más largo entre la cola previa y la cabeza siguiente.
        var offsets = leadOffsets(head);
        for (var start = 0; start <= tail.length - minTok; start++) {
          for (var o = 0; o < offsets.length; o++) {
            var h = offsets[o], len = 0;
            while (start + len < tail.length && h + len < head.length &&
                   tail[start + len].token === head[h + len].token) len++;
            if (len < minTok) continue;
            var chars = 0;
            for (var c = 0; c < len; c++) chars += head[h + c].token.length;
            if (chars < minChars) continue;
            // Recortar solo cuando lo repetido es CON LO QUE EL BLOQUE ACABA: un pickup
            // es una toma que se cortó justo ahí. Si detrás queda contenido, la
            // coincidencia puede ser cualquiera de las dos cosas y ninguna regla las
            // separa —las dos son frases completas que arrancan igual y siguen distinto—:
            //   · clase 14, dos frases de la clase: "…convirtiendo a algo más ejecutivo.
            //     Un brief de mercado selecciona la evidencia relevante…" contra "Un
            //     brief de mercado sólido sigue más o menos esta secuencia."
            //   · clase 15, una re-toma: "Ya que está esa cadena, va a ser un wave
            //     frame." contra "Entonces, ya que está esa cadena, lo que va a hacer es
            //     va a dividir en pasos."
            // Recortar la primera se llevaba la frase de cierre entera, así que sale como
            // aviso (`repeat-hint`) y lo resuelve la nota del CD o el editor.
            var match = tailMatch(prevWords, tail, start, len);
            if (!match.spent) {
                if (!loose) loose = match;
                continue;
            }
            return match;
          }
        }
        return loose;
    }

    /**
     * Por dónde puede empezar la repetición en la cabeza del bloque siguiente: por su
     * primera palabra, o justo detrás de los conectores y cues con los que se retoma.
     */
    function leadOffsets(head) {
        var out = [0];
        for (var i = 0; i < head.length && i < 3; i++) {
            if (!CONNECTOR_MAP[head[i].token] && !isFillerToken(head[i].token)) break;
            out.push(i + 1);
        }
        return out;
    }

    function tailMatch(prevWords, tail, start, len) {
        var first = tail[start].word;
        var before = null;
        for (var p = 0; p < prevWords.length; p++) {
            if (prevWords[p] === first) break;
            before = prevWords[p];
        }
        // Sin palabra anterior, lo repetido es todo el bloque: no hay dónde recortar,
        // es una re-toma completa y hay que reportarla sin arreglo.
        return {
            word: first, tokens: len, cutAt: before ? before.end : null,
            spent: tailSpentFrom(tail, start + len)
        };
    }

    // ─── Revisión completa ───────────────────────────────────

    // Qué frena el corte y qué solo se avisa. Los problemas de CONTENIDO (el corte
    // parte una palabra, el bloque arranca en un conteo, sobra una repetición)
    // frenan: cortar así deja la clase mal. La falta de aire es estética y solo se
    // avisa — parar el pipeline por unos frames es peor que el defecto.
    var SEVERITY = {
        "inverted": "block",
        "empty": "block",
        "too-short": "block",
        "mid-word": "block",
        "mid-phrase": "block",  // el OUT lo pide como aviso (ver verifyBlocks)
        "lead-in": "block",
        "take-start": "block",
        "editor-cue": "block",
        "pickup": "block",
        "overlap": "block",
        "no-air": "block",     // aire tan corto que se oye el ataque cortado
        "tight-air": "warn",   // podría tener más aire, pero nada está roto
        // Los avisos que nadie puede arreglar solo: el borde queda a la vista para
        // revisarlo a mano, pero frenar el pipeline no lo mejora.
        "audio-unmeasured": "warn",
        "note-conflict": "warn",
        "repeat-hint": "warn"
    };

    /**
     * @param {Array} words words[] del STT
     * @param {Array} blocks [{inTime, outTime}] tiempos REALES de los marcadores
     * @returns {{ok, boundaries, failures, warnings, checked}} un verdict por borde:
     *   {pairIdx, kind, time, ok, code, severity, message, airFrames, targetTime?}
     *   failures = lo que frena el corte; warnings = lo que solo se reporta.
     *   targetTime = a dónde debería irse el corte cuando se puede decir sin dudar.
     */
    function verifyBlocks(words, blocks, opts) {
        var spoken = spokenWords(words);
        var pad = padFrames(opts);
        var fps = frameRate(opts);
        var out = [];

        function verdict(pairIdx, kind, time, code, message, extra) {
            var v = {
                pairIdx: pairIdx,
                kind: kind,
                time: time,
                ok: !code,
                code: code || "",
                severity: code ? (SEVERITY[code] || "block") : "",
                message: message || ""
            };
            if (extra) {
                for (var k in extra) { if (extra.hasOwnProperty(k)) v[k] = extra[k]; }
            }
            return v;
        }

        /** Mensaje del aire, distinto según si se oye o solo se podría mejorar. */
        function airMessage(kind, air, severity) {
            var where = kind === "IN" ? "El IN abre" : "El OUT cierra";
            var word = '"' + wordText(air.word) + '"';
            if (severity === "block") {
                return where + " a " + air.frames.toFixed(1) + " frames de " + word +
                    ": se come el ataque, habiendo " + air.available.toFixed(1) +
                    " frames de silencio.";
            }
            return where + " con " + air.frames.toFixed(1) + " de los " +
                air.available.toFixed(1) + " frames de aire que hay junto a " + word +
                " (el colchón pide " + pad + ").";
        }

        for (var b = 0; b < (blocks || []).length; b++) {
            var blk = blocks[b];
            var inT = blk.inTime, outT = blk.outTime;
            var blockWords = inRange(spoken, inT, outT);

            // ── Bloque entero
            if (outT <= inT) {
                out.push(verdict(b, "OUT", outT, "inverted",
                    "El OUT quedó antes del IN: el bloque no existe."));
                continue;
            }
            if (spoken.length > 0 && blockWords.length === 0) {
                out.push(verdict(b, "IN", inT, "empty",
                    "El bloque no contiene ni una palabra del transcript."));
                continue;
            }
            if (outT - inT < opt(opts, "minBlockSec")) {
                out.push(verdict(b, "IN", inT, "too-short",
                    "El bloque dura " + (outT - inT).toFixed(2) + "s: demasiado corto para ser contenido."));
                continue;
            }

            // ── IN
            var inWord = wordAt(spoken, inT);
            var inAir = airAt(spoken, inT, "IN", opts);
            var floorT = b > 0 ? blocks[b - 1].outTime : 0;
            var lead = leadInWord(blockWords, opts);
            var take = lead ? null : takeStartWord(spoken, inT, floorT, opts);
            // A mitad de frase se mira antes que la palabra partida: las dos ven el
            // mismo defecto, pero la frase sabe a dónde tiene que ir el corte y la
            // palabra solo sabe salirse de la palabra.
            var phraseIn = (lead || take) ? null : phraseStartWord(spoken, inT, floorT, opts);

            if (phraseIn) {
                out.push(verdict(b, "IN", inT, "mid-phrase",
                    "El IN abre a mitad de la frase: empieza en \"" + wordText(phraseIn) +
                    "\" (" + phraseIn.start.toFixed(1) + "s) y el IN entra " +
                    (inT - phraseIn.start).toFixed(1) + "s después.",
                    { airFrames: inAir.frames, targetTime: phraseIn.start, word: wordText(phraseIn) }));
            } else if (inWord) {
                out.push(verdict(b, "IN", inT, "mid-word",
                    "El IN parte la palabra \"" + wordText(inWord) + "\".",
                    { airFrames: 0, targetTime: inWord.start, word: wordText(inWord) }));
            } else if (lead) {
                out.push(verdict(b, "IN", inT, "lead-in",
                    "El bloque arranca con un conteo, un cue de producción o un anuncio " +
                    "de retoma antes de \"" + wordText(lead) + "\".",
                    { airFrames: inAir.frames, targetTime: lead.start, word: wordText(lead) }));
            } else if (take) {
                out.push(verdict(b, "IN", inT, "take-start",
                    "El bloque abre a mitad de la toma: la toma arranca en \"" +
                    wordText(take) + "\" (" + take.start.toFixed(1) + "s) y el IN entra " +
                    (inT - take.start).toFixed(1) + "s después.",
                    { airFrames: inAir.frames, targetTime: take.start, word: wordText(take) }));
            } else {
                var inAirSev = airVerdict(inAir, opts);
                out.push(inAirSev
                    ? verdict(b, "IN", inT, inAirSev === "block" ? "no-air" : "tight-air",
                        airMessage("IN", inAir, inAirSev),
                        { airFrames: inAir.frames, targetTime: inAir.word ? inAir.word.start : inT })
                    : verdict(b, "IN", inT, "", "", { airFrames: inAir.frames }));
            }

            // ── OUT
            var outWord = wordAt(spoken, outT);
            var outAir = airAt(spoken, outT, "OUT", opts);
            var cue = trailingCueWord(blockWords);
            var pickup = null, repeat = null;
            if (b + 1 < blocks.length) {
                var nextWords = inRange(spoken, blocks[b + 1].inTime, blocks[b + 1].outTime);
                pickup = pickupOverlap(blockWords, nextWords, opts);
                // Repetición que no se puede recortar a ciegas: se avisa y ya.
                if (pickup && !pickup.spent) { repeat = pickup; pickup = null; }
            }

            // Alargar el OUT añade palabras al bloque, así que va detrás de todo lo
            // que MANDA QUITAR (el cue al editor, la repetición del bloque siguiente)
            // y solo se avisa: si la frase de verdad seguía, ganarla es mejor que
            // cortarla, pero no es motivo para frenar nada.
            var phraseOut = (cue || pickup) ? null
                : phraseEndWord(spoken, outT, b + 1 < blocks.length ? blocks[b + 1].inTime : 0, opts);

            if (cue) {
                out.push(verdict(b, "OUT", outT, "editor-cue",
                    "El bloque cierra con un comando al editor después de \"" +
                    wordText(cue) + "\".",
                    { airFrames: outAir.frames, targetTime: cue.end, word: wordText(cue) }));
            } else if (pickup) {
                out.push(verdict(b, "OUT", outT, "pickup",
                    "El bloque " + (b + 2) + " repite " + pickup.tokens +
                    " palabras de este final: sobra desde \"" + wordText(pickup.word) + "\"" +
                    (pickup.cutAt == null ? " (se repite el bloque entero)" : "") + ".",
                    {
                        airFrames: outAir.frames,
                        targetTime: pickup.cutAt,
                        repeatedTokens: pickup.tokens,
                        repeatedFrom: pickup.word.start
                    }));
            } else if (phraseOut) {
                out.push(verdict(b, "OUT", outT, "mid-phrase",
                    "El OUT corta la frase a medias: termina en \"" + wordText(phraseOut) +
                    "\" (" + phraseOut.end.toFixed(1) + "s), " +
                    (phraseOut.end - outT).toFixed(1) + "s después del OUT.",
                    {
                        airFrames: outAir.frames,
                        targetTime: phraseOut.end,
                        word: wordText(phraseOut),
                        severity: "warn"
                    }));
            } else if (outWord) {
                out.push(verdict(b, "OUT", outT, "mid-word",
                    "El OUT parte la palabra \"" + wordText(outWord) + "\".",
                    { airFrames: 0, targetTime: outWord.end, word: wordText(outWord) }));
            } else {
                var outAirSev = airVerdict(outAir, opts);
                out.push(outAirSev
                    ? verdict(b, "OUT", outT, outAirSev === "block" ? "no-air" : "tight-air",
                        airMessage("OUT", outAir, outAirSev),
                        { airFrames: outAir.frames, targetTime: outAir.word ? outAir.word.end : outT })
                    : verdict(b, "OUT", outT, "", "", { airFrames: outAir.frames }));
            }

            // ── Lo mismo dicho dos veces a los dos lados del corte
            if (repeat) {
                out.push(verdict(b, "OUT", outT, "repeat-hint",
                    "El bloque " + (b + 2) + " vuelve a decir " + repeat.tokens +
                    " palabras que este ya dijo desde \"" + wordText(repeat.word) + "\" (" +
                    repeat.word.start.toFixed(1) + "s): si es una re-toma, el OUT va antes.",
                    {
                        severity: "warn",
                        repeatedTokens: repeat.tokens,
                        repeatedFrom: repeat.word.start
                    }));
            }

            // ── Solape con el bloque siguiente
            if (b + 1 < blocks.length && outT > blocks[b + 1].inTime + 1 / fps) {
                // El objetivo es el fin de la última palabra que cabe antes del IN
                // siguiente: así el arreglo cae en una frontera real y no en un
                // instante cualquiera.
                var fits = prevWordEnd(spoken, blocks[b + 1].inTime);
                out.push(verdict(b, "OUT", outT, "overlap",
                    "El OUT se pasa del IN del bloque " + (b + 2) + ".",
                    { targetTime: fits ? fits.end : blocks[b + 1].inTime }));
            }
        }

        var failures = [], warnings = [];
        for (var i = 0; i < out.length; i++) {
            if (out[i].ok) continue;
            if (out[i].severity === "warn") warnings.push(out[i]);
            else failures.push(out[i]);
        }
        return {
            ok: failures.length === 0,
            checked: out.length,
            boundaries: out,
            failures: failures,
            warnings: warnings
        };
    }

    // ─── ¿Este transcript describe esta secuencia? ───────────
    //
    // Antes de mover un solo marcador hay que estar seguro de que los tiempos del
    // transcript son los de ESTA línea de tiempo. Un transcript de la secuencia ya
    // cortada tiene las mismas palabras con otros tiempos: los marcadores se mueven
    // a puntos que "leen" bien y quedan a minutos de donde se habla.

    var COVERAGE = {
        outsideToleranceSec: 15,  // cuánto puede sobresalir un marcador del transcript
        minSpanRatio: 0.5,        // el transcript debe cubrir al menos esto de la secuencia
        durationToleranceSec: 2   // holgura al comparar duraciones
    };

    /**
     * @param {Array} words words[] del transcript
     * @param {object} info {sequenceDuration, savedDuration, markerTimes}
     *        savedDuration = duración que tenía la secuencia cuando se guardó
     * @returns {{ok, code, message, spanEnd}}
     */
    function checkCoverage(words, info) {
        info = info || {};
        var spoken = spokenWords(words);
        if (spoken.length === 0) {
            return { ok: false, code: "no-words", message: "El transcript no tiene palabras con tiempos.", spanEnd: 0 };
        }

        var spanEnd = spoken[spoken.length - 1].end;
        var seqDur = Number(info.sequenceDuration) || 0;
        var savedDur = Number(info.savedDuration) || 0;

        function fail(code, message) {
            return { ok: false, code: code, message: message, spanEnd: spanEnd };
        }

        // La secuencia cambió de largo desde que se hizo el transcript: cortaron,
        // pegaron o restauraron un backup. Los tiempos ya no sirven.
        if (seqDur > 0 && savedDur > 0) {
            var diff = Math.abs(seqDur - savedDur);
            var tol = Math.max(COVERAGE.durationToleranceSec, Math.max(seqDur, savedDur) * 0.01);
            if (diff > tol) {
                return fail("duration-changed",
                    "El transcript se hizo cuando la secuencia duraba " + fmtMin(savedDur) +
                    " y ahora dura " + fmtMin(seqDur) + ": los tiempos ya no corresponden.");
            }
        }

        // Marcadores fuera de lo que el transcript alcanza: no hay palabras con las
        // que decidir dónde va ese corte.
        var times = info.markerTimes || [];
        var outside = 0, lastOutside = 0;
        for (var i = 0; i < times.length; i++) {
            var t = Number(times[i]);
            if (!isFinite(t)) continue;
            if (t > spanEnd + COVERAGE.outsideToleranceSec) {
                outside++;
                if (t > lastOutside) lastOutside = t;
            }
        }
        if (outside > 0) {
            return fail("markers-outside",
                outside + " marcador(es) caen fuera del transcript, que termina en " +
                fmtMin(spanEnd) + " (el más lejano está en " + fmtMin(lastOutside) + ").");
        }

        // Sin marcadores que lo delaten, un transcript que cubre una fracción de la
        // secuencia también es señal de que no es de esta versión del timeline.
        if (seqDur > 0 && spanEnd < seqDur * COVERAGE.minSpanRatio) {
            return fail("span-short",
                "El transcript solo llega a " + fmtMin(spanEnd) + " de una secuencia de " +
                fmtMin(seqDur) + ".");
        }

        return { ok: true, code: "", message: "", spanEnd: spanEnd };
    }

    function fmtMin(secs) {
        secs = Math.max(0, Math.round(Number(secs) || 0));
        var m = Math.floor(secs / 60), s = secs % 60;
        return m > 0 ? (m + "m" + (s < 10 ? "0" : "") + s + "s") : (s + "s");
    }

    /**
     * ¿El tiempo nuevo resuelve la falla? Un arreglo tiene que mover el borde en la
     * dirección del problema: si el bloque arrancaba en un conteo, el IN va después;
     * si cerraba con "pausa", el OUT va antes. Sin este contrato, un "déjalo donde
     * está" del LLM se aplicaría como arreglo y la ronda siguiente encontraría la
     * misma falla.
     * @param {object} verdict un borde devuelto por verifyBlocks
     * @param {number} newTime tiempo propuesto
     */
    function resolvesIssue(verdict, newTime, opts) {
        if (!verdict || verdict.targetTime == null) return true;
        var fps = frameRate(opts);
        var padFrames = Number(opt(opts, "padFrames"));
        if (!isFinite(padFrames) || padFrames < 0) padFrames = DEFAULTS.padFrames;
        var pad = padFrames / fps;
        var target = verdict.targetTime;

        switch (verdict.code) {
            case "lead-in":
                // El IN tiene que quedar en el contenido, no antes del conteo.
                return newTime >= target - pad - 0.01;
            case "take-start":
                // El IN tiene que abrir en el arranque de la toma, no después.
                return newTime <= target + pad + 0.01;
            case "mid-phrase":
                // La frase entera tiene que quedar dentro: el IN antes de donde
                // empieza, el OUT después de donde termina.
                return verdict.kind === "IN"
                    ? newTime <= target + pad + 0.01
                    : newTime >= target - pad - 0.01;
            case "editor-cue":
            case "pickup":
            case "overlap":
                // El OUT tiene que quedar antes de lo que sobra.
                return newTime <= target + pad + 0.01;
            case "mid-word":
            case "no-air":
            case "tight-air":
                // Basta con que deje de partir la palabra y gane aire.
                return Math.abs(newTime - target) * fps >= minAirFrames(opts) - 0.01;
            default:
                return true;
        }
    }

    // Nombre en claro de cada falla: el resumen lo lee el editor, no el programador.
    // Los códigos sense-* los produce marker-anchor (la nota del CD) y los audio-*
    // los mide audio-onset en el WAV, pero el vocabulario de veredictos vive aquí.
    var CODE_LABELS = {
        "inverted": "OUT antes del IN",
        "empty": "bloque sin palabras",
        "too-short": "bloque demasiado corto",
        "mid-word": "corte a mitad de palabra",
        "mid-phrase": "corte a mitad de la frase",
        "lead-in": "arranca en un conteo o anuncio de retoma",
        "take-start": "abre a mitad de la toma",
        "editor-cue": "cierra con un cue al editor o un intento abandonado",
        "pickup": "el bloque siguiente repite el final",
        "overlap": "solape con el bloque siguiente",
        "no-air": "sin aire",
        "tight-air": "poco aire",
        "sense-in": "no abre en la frase de la nota",
        "sense-out": "no cierra en la frase de la nota",
        "audio-clip": "el corte se mete en el sonido",
        "audio-air": "el aire del corte no es el del colchón",
        "audio-unmeasured": "el audio no puede medir este borde",
        "note-conflict": "la nota del CD dice otra cosa",
        "repeat-hint": "lo mismo dicho a los dos lados del corte"
    };

    // Lo que de verdad impide cortar: la estructura del bloque está mal (el OUT
    // antes del IN, un bloque sin nada dentro, dos bloques que se pisan). Ahí las
    // zonas de corte saldrían mal y no hay reajuste que lo salve.
    //
    // Todo lo demás es DÓNDE cae el corte: se reajusta lo que se pueda y lo que
    // quede se avisa con el detalle a la vista. Dejar la clase sin cortar por un
    // borde discutible sale más caro que cortarla y repasar ese borde.
    var STRUCTURAL = { "inverted": 1, "empty": 1, "too-short": 1, "overlap": 1 };

    function isStructural(v) { return !!(v && STRUCTURAL[v.code]); }

    /** Resumen de una línea para la UI y el log. */
    function summarize(result) {
        if (!result) return "";
        var warns = (result.warnings || []).length;
        var tail = warns > 0 ? " · " + warns + " aviso(s) que no frenan el corte" : "";
        if (result.ok) {
            return result.checked + " borde(s) revisados: todos pasan" + tail;
        }
        var counts = {};
        for (var i = 0; i < result.failures.length; i++) {
            var c = result.failures[i].code;
            counts[c] = (counts[c] || 0) + 1;
        }
        var parts = [];
        for (var k in counts) {
            if (counts.hasOwnProperty(k)) parts.push(counts[k] + "× " + (CODE_LABELS[k] || k));
        }
        return result.failures.length + " de " + result.checked + " borde(s) no pasan (" +
            parts.join(", ") + ")" + tail;
    }

    var EPMarkerVerify = {
        DEFAULTS: DEFAULTS,
        verifyBlocks: verifyBlocks,
        resolvesIssue: resolvesIssue,
        checkCoverage: checkCoverage,
        COVERAGE: COVERAGE,
        STRUCTURAL: STRUCTURAL,
        isStructural: isStructural,
        summarize: summarize,
        leadInWord: leadInWord,
        takeStartWord: takeStartWord,
        phraseStartWord: phraseStartWord,
        phraseEndWord: phraseEndWord,
        opensSentence: opensSentence,
        closesSentence: closesSentence,
        takeStartAt: takeStartAt,
        trailingCueWord: trailingCueWord,
        pickupOverlap: pickupOverlap,
        airAt: airAt,
        airVerdict: airVerdict,
        minAirFrames: minAirFrames,
        SEVERITY: SEVERITY,
        CODE_LABELS: CODE_LABELS
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = EPMarkerVerify;
    }
    if (global) {
        global.EPMarkerVerify = EPMarkerVerify;
    }

})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : null));
