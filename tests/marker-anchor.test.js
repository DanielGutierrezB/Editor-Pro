/**
 * Tests del módulo puro marker-anchor.js: encontrar en el transcript la frase que
 * el CD escribió en el marcador y decidir si el corte está donde debe.
 *
 * El caso que da origen al módulo (bloque 9 de una clase real): el profesor dice
 * "Del lado cualitativo podemos tener, qué tendencias..." cinco veces; el IN
 * quedó dentro de la toma buena, comiéndose su arranque, porque el LLM leyó la
 * repetición anterior como "esto ya se dijo".
 *
 * Ejecutar con: node tests/run-node-tests.js
 */
"use strict";

const AN = require("../client/js/marker-anchor.js");

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (cond) { passed++; } else { failed++; console.error("  ✗ FALLO: " + msg); }
}
function assertEq(actual, expected, msg) {
    assert(actual === expected, msg + " (esperado: " + expected + ", obtenido: " + actual + ")");
}
function assertNear(actual, expected, tol, msg) {
    assert(Math.abs(actual - expected) <= tol,
        msg + " (esperado ~" + expected + " ±" + tol + ", obtenido: " + actual + ")");
}
function section(name) { console.log("\n── " + name); }

const OPTS = { padFrames: 10, fps: 25 };

/** words[] a partir de una frase: cada palabra dura 0.3s con 0.1s de aire. */
function say(text, startAt, gap) {
    let t = startAt || 0;
    const step = gap == null ? 0.1 : gap;
    return text.split(/\s+/).map(word => {
        const w = { text: word, start: +t.toFixed(3), end: +(t + 0.3).toFixed(3), type: "word" };
        t += 0.3 + step;
        return w;
    });
}

function run() {
    passed = 0; failed = 0;

    // ─── Texto de referencia del marcador ────────────────────

    section("cueFromText() — convención de comentarios del CD");
    assertEq(AN.cueFromText(" -  Del lado cualitativo podemos tener, qué tendencia", "IN"),
        "Del lado cualitativo podemos tener, qué tendencia",
        "IN sin nota del editor: lo que va tras el guion");
    assertEq(AN.cueFromText("revisar out -  Entonces, mira, este es el resumen", "IN"),
        "Entonces, mira, este es el resumen",
        "IN con nota del editor: se descarta la nota");
    assertEq(AN.cueFromText("OUT: de un tipo de evidencia la que vamos a considerar.", "OUT"),
        "de un tipo de evidencia la que vamos a considerar.",
        "OUT: lo que va tras el prefijo");
    assertEq(AN.cueFromText("OUT: cierra aquí", "IN"), "",
        "un comentario de OUT no se lee como frase de IN");
    // Caso real: el CD deja en el IN un recado sobre el OUT del bloque y detrás,
    // tras el guion, la frase con la que abre. Descartar el comentario entero por
    // empezar en "out:" dejaba al LLM sin saber con qué arrancaba el bloque.
    assertEq(AN.cueFromText("out: cortar antes que diga \"nos vemos en la siguiente\" -  Y ah", "IN"),
        "Y ah",
        "IN con recado sobre el OUT: manda el guion, no el prefijo");
    assertEq(AN.cueFromText(" -  algo", "OUT"), "",
        "un OUT sin prefijo OUT: no aporta frase");
    assertEq(AN.cueTextFor({ name: "PV", comments: " -  hola a todos" }, "IN"), "hola a todos",
        "cueTextFor prefiere el comentario");
    assertEq(AN.cueTextFor({ name: "PV - hola a todos", comments: "" }, "IN"), "hola a todos",
        "sin comentario cae al nombre del marcador");

    // ─── Instrucciones del CD sobre un borde ──────────────────

    section("directivesFrom() — el CD dice qué hacer con el borde, no con qué frase");
    // Comentario real del IN del bloque 4 de la clase 15.
    const dirs = AN.directivesFrom(
        'out antes de "ya que está esa cadena," -  Ahora lo que vamos a hacer es vamos a ir a cloud,');
    assertEq(dirs.length, 1, "lee una instrucción");
    assertEq(dirs[0].kind, "OUT", "habla del OUT del bloque");
    assertEq(dirs[0].side, "before", "y pide cortar antes de la frase");
    assertEq(dirs[0].phrase, "ya que está esa cadena,", "se queda con la frase entre comillas");
    assertEq(AN.cueFromText(
        'out antes de "ya que está esa cadena," -  Ahora lo que vamos a hacer es vamos a ir a cloud,',
        "IN"),
        "Ahora lo que vamos a hacer es vamos a ir a cloud,",
        "la instrucción no se cuela en la frase de apertura del bloque");
    assertEq(AN.directivesFrom('out antes de "ya"').length, 0,
        "una frase de dos letras no da para buscarla");
    assertEq(AN.directivesFrom("cortar antes de que diga eso").length, 0,
        "sin comillas no se sabe dónde acaba la frase: no es instrucción");
    assertEq(AN.directivesFrom('in después de "va, listo, empiezo"')[0].side, "after",
        "también entiende \"después de\"");

    section("directiveAnchor() — la instrucción deja el corte fuera de lo repetido");
    // Clase 15: el profesor arrancó dos veces con "ya que está esa cadena". El OUT del
    // bloque cerraba después de la primera vez y la idea quedaba dicha a los dos lados
    // del corte; la instrucción del CD manda cerrar antes de esa frase.
    const takeOne = say("entonces te va a explicar cómo lo está construyendo", 10);
    const abort = say("ya que está esa cadena va a ser un frame", 14);
    const retakeWords = say("entonces ya que está esa cadena lo que va a hacer", 30);
    const dirWords = takeOne.concat(abort, retakeWords);
    const dirRes = AN.directiveAnchor(dirWords, dirs[0], "OUT", 18,
        Object.assign({}, OPTS, { minTime: 8, maxTime: 29 }));
    assert(dirRes.ok, "encuentra la frase de la instrucción");
    assertNear(dirRes.time, takeOne[takeOne.length - 1].end, 0.01,
        "el corte queda al final de la palabra anterior a la frase");
    assertEq(dirRes.ambiguous, false,
        "la segunda vez cae en el bloque siguiente: no cuenta como duda");
    // Sin los límites del bloque, la misma frase del bloque siguiente sí crea la duda.
    assertEq(AN.directiveAnchor(dirWords, dirs[0], "OUT", 18, OPTS).ambiguous, true,
        "fuera del bloque la frase aparece dos veces");
    assert(!AN.directiveAnchor(dirWords, { kind: "OUT", side: "before", phrase: "esto no se dijo nunca" },
        "OUT", 18, OPTS).ok, "una frase que no está en el transcript no mueve nada");

    section("cueTokens() — bordes recortados por el CD");
    // El CD recorta a ~50 caracteres: al IN le falta el final de la última palabra.
    const inTok = AN.cueTokens("En la clase pasada vimos el camino completo de un", "IN", OPTS);
    assertEq(inTok[0], "en", "el IN empareja desde la primera palabra");
    assertEq(inTok.length, 7, "toma headTokens palabras");
    // Al OUT le falta el principio de la primera y le sobra el cue al editor.
    const outTok = AN.cueTokens("r, explicar o incluso explorar un fenómeno. Pausa.", "OUT", OPTS);
    assertEq(outTok[outTok.length - 1], "fenomeno", "el OUT empareja hasta la última palabra real");
    assertEq(outTok.indexOf("pausa"), -1, "descarta el comando al editor del final");
    assertEq(outTok.indexOf("r"), -1, "descarta la palabra que el recorte dejó a medias");
    assertEq(AN.cueTokens("PV", "IN", OPTS).length, 0, "un nombre suelto no es una frase");

    section("cueSearchable() — lo que se puede buscar y lo que solo sirve de pista");
    assert(AN.cueSearchable("En la clase pasada vimos el camino", "IN", OPTS),
        "una frase entera se busca en el transcript");
    assert(!AN.cueSearchable("Y ah", "IN", OPTS),
        "un trozo de dos palabras no: medio transcript coincidiría");

    section("tokenEq() — el CD escribe de oído y el STT a su manera");
    assert(AN.tokenEq("tendencia", "tendencias"), "plural: prefijo");
    assert(AN.tokenEq("artifici", "artificial"), "palabra recortada por el CD");
    assert(AN.tokenEq("hacer", "hacen"), "una letra de diferencia");
    assert(!AN.tokenEq("de", "del"), "palabras cortas no se confunden entre sí");
    assert(!AN.tokenEq("cual", "todo"), "palabras distintas no casan");

    // ─── Emparejamiento ──────────────────────────────────────

    section("findMatches() — la frase aparece una vez");
    const simple = say("hoy vamos a ver como se calcula el margen bruto de la tienda", 10);
    const one = AN.findMatches(simple, "vamos a ver como se calcula el margen", "IN", OPTS);
    assertEq(one.length, 1, "una sola aparición");
    assertNear(one[0].time, simple[1].start, 0.001, "el ancla del IN es el inicio de la primera palabra");
    assertEq(one[0].score, 1, "coincidencia total");

    const outM = AN.findMatches(simple, "se calcula el margen bruto de la tienda", "OUT", OPTS);
    assertEq(outM.length, 1, "OUT: una aparición");
    assertNear(outM[0].time, simple[simple.length - 1].end, 0.001,
        "el ancla del OUT es el final de la última palabra");

    section("anchorFor() — tomas repetidas: manda la cercanía al marcador");
    // Toma fallida (t≈100), toma buena (t≈140). El marcador del CD quedó tarde,
    // ya dentro de la toma buena.
    const takes = []
        .concat(say("del lado cualitativo tenemos que tendencias de consumo se observan", 100))
        .concat(say("del lado cualitativo podemos tener que tendencias de consumo se observan en cada categoria", 140))
        .concat(say("que valoran y que problemas mencionan los clientes", 152));
    const cue = "Del lado cualitativo podemos tener, qué tendencia";
    const late = AN.anchorFor(takes, cue, "IN", 152.0, OPTS);
    assertEq(late.ok, true, "encuentra la frase");
    assertNear(late.time, 140.0, 0.05, "ancla en el arranque de la toma buena, no en la fallida");
    assertEq(late.confident, true, "una sola toma cerca: se puede aplicar sin preguntar");
    assert(late.shiftSec < -10, "el ancla está por detrás del marcador (se movió el IN hacia atrás)");

    section("anchorFor() — dos tomas igual de buenas cerca: decide el LLM");
    const twin = []
        .concat(say("y es que por un lado tenemos la investigacion cualitativa que sirve", 60))
        .concat(say("y es que por un lado tenemos la investigacion cualitativa que sirve para entender", 75));
    const amb = AN.anchorFor(twin, "Y es que por un lado tenemos la investigación cua", "IN", 76.0, OPTS);
    assertEq(amb.ok, true, "encuentra las dos");
    assertEq(amb.matches.length, 2, "dos apariciones");
    assertEq(amb.ambiguous, true, "marca ambigüedad");
    assertEq(amb.confident, false, "no se aplica solo");

    section("anchorFor() — la toma que está en el bloque siguiente no es una opción");
    // Clase 15, bloque 4: el profesor rehace la frase con la que el bloque cierra y el
    // bloque 5 abre con esa retoma. Con las dos tomas a la vista el OUT se fue a la
    // segunda —3.4s DENTRO del bloque siguiente— y el recorte de emergencia lo dejó
    // exactamente encima del IN, con lo que el bloque dejó de poder emparejarse.
    const retake = []
        .concat(say("entonces ya que esta esa cadena lo que va a hacer es dividir en pasos", 60))
        .concat(say("va", 71))            // el cue al editor entre las dos tomas
        .concat(say("entonces ya que esta esa cadena lo que va a hacer es dividir en pasos", 73));
    const retakeCue = "Entonces, ya que está esa cadena, lo que va a hacer";
    const loose = AN.anchorFor(retake, retakeCue, "OUT", 70.0, OPTS);
    assertEq(loose.matches.length, 2, "sin límites ve las dos tomas");
    assertEq(loose.confident, false, "y no se atreve a elegir");
    // El IN del bloque siguiente abre en la retoma: el OUT de este no puede pasar de ahí.
    const bounded = AN.anchorFor(retake, retakeCue, "OUT", 70.0,
        Object.assign({}, OPTS, { minTime: 55, maxTime: 72.9 }));
    assertEq(bounded.matches.length, 1, "solo la toma que es de este bloque");
    assertEq(bounded.confident, true, "con una sola toma elegible se resuelve sin preguntar");
    assert(bounded.time < 72.9, "y el cierre cae antes del IN siguiente");
    // Si TODAS las apariciones son del vecino, se calla en vez de anclar mal.
    const alien = AN.anchorFor(retake, retakeCue, "OUT", 70.0,
        Object.assign({}, OPTS, { maxTime: 50 }));
    assertEq(alien.ok, false, "sin apariciones propias no hay ancla");
    assert(alien.reason.indexOf("vecino") >= 0, "y lo dice en claro");

    section("anchorFor() — coincidencia lejana: no se mueve el marcador 100s");
    const far = [].concat(say("ninguna de estas subpreguntas te da la respuesta por si sola", 30))
        .concat(say("para cerrar el circulo piensa en la diferencia entre un dashboard", 300));
    const away = AN.anchorFor(far, "Ninguna de estas supreguntas te da la respuesta p", "IN", 300.0, OPTS);
    assertEq(away.ok, true, "la frase existe");
    assertEq(away.tooFar, true, "queda demasiado lejos del marcador");
    assertEq(away.confident, false, "no se aplica sin confirmación");

    section("anchorFor() — la frase no está en el transcript");
    const none = AN.anchorFor(simple, "esto no lo dijo nadie en toda la clase", "IN", 10, OPTS);
    assertEq(none.ok, false, "no inventa un ancla");
    assertEq(none.matches.length, 0, "sin apariciones");

    section("anchorFor() — sin frase de referencia no hay nada que afirmar");
    assertEq(AN.anchorFor(simple, "", "IN", 10, OPTS).ok, false, "cue vacío");
    assertEq(AN.anchorFor([], "hola a todos otra vez", "IN", 10, OPTS).ok, false, "transcript vacío");

    // ─── Revisión de sentido ─────────────────────────────────

    section("senseVerdicts() — el caso real: el IN se come el arranque del bloque");
    const inCue = "Del lado cualitativo podemos tener, qué tendencia";
    const blocks = [{
        inTime: 151.9,          // dentro de la toma buena, tras su primera frase
        outTime: 158.0,
        inCue: inCue,
        outCue: ""
    }];
    const bad = AN.senseVerdicts(takes, blocks, OPTS);
    assertEq(bad.length, 1, "canta un problema de sentido");
    assertEq(bad[0].code, "sense-in", "código del IN");
    assertEq(bad[0].severity, "block", "frena el corte: es contenido, no estética");
    assertNear(bad[0].targetTime, 140.0, 0.05, "señala el arranque real de la frase");
    assert(bad[0].message.indexOf("del lado cualitativo") !== -1,
        "el mensaje cita la frase que pide la nota del CD");

    section("senseVerdicts() — puesto donde dice la nota, no dice nada");
    const good = AN.senseVerdicts(takes, [{
        inTime: 139.6,          // el colchón de 10 frames antes de la palabra
        outTime: 158.0,
        inCue: inCue,
        outCue: ""
    }], OPTS);
    assertEq(good.length, 0, "el colchón de aire no se confunde con un error de sentido");

    // Clase 14, bloque 1: la frase de la nota se grabó dos veces (1:21 y 1:38) y el
    // borde acabó en 1:41, ya dentro de la frase SIGUIENTE. Cuál de las dos tomas es
    // la buena no se puede afirmar, pero que el bloque no abre con lo que el CD
    // escribió, sí.
    section("senseVerdicts() — con la frase grabada dos veces, el borde tiene que caer en una");
    const twoTakes = say("en la clase pasada conseguiste data con perplexity finance", 81)
        .concat(say("en la clase pasada conseguiste data con perplexity finance", 98))
        .concat(say("ahora es momento de convertir esos numeros sueltos", 105));
    const cueTwice = "En la clase pasada conseguiste data con Perplex";
    const off = AN.senseVerdicts(twoTakes, [{
        inTime: 104.8,          // después de las dos tomas, en la frase siguiente
        outTime: 130.0,
        inCue: cueTwice,
        outCue: ""
    }], OPTS);
    assertEq(off.length, 1, "canta que el bloque no abre con la frase de la nota");
    assertEq(off[0].code, "sense-in", "código del IN");
    assertNear(off[0].targetTime, 98.0, 0.1, "apunta a la toma más cercana al borde");
    assertEq(AN.senseVerdicts(twoTakes, [{
        inTime: 97.6,           // el colchón antes de la segunda toma
        outTime: 130.0,
        inCue: cueTwice,
        outCue: ""
    }], OPTS).length, 0, "puesto en una de las tomas, no dice nada");
    assertEq(AN.senseVerdicts(twoTakes, [{
        inTime: 80.6,           // la primera toma también es una toma válida
        outTime: 130.0,
        inCue: cueTwice,
        outCue: ""
    }], OPTS).length, 0, "y no impone cuál de las dos tomas es la buena");

    section("frontierAt() — la frontera la marcan los finales de palabra");
    const grid = say("en la clase pasada vimos el camino completo", 10);
    assertEq(AN.frontierAt(grid, 10.10, "IN").word.text, "en",
        "un IN dentro de la primera palabra abre con ella: todavía suena entera");
    assertEq(AN.frontierAt(grid, 10.35, "IN").word.text, "la",
        "un IN en el silencio abre con la palabra que viene");
    assertEq(AN.frontierAt(grid, 10.75, "OUT").word.text, "la",
        "un OUT tras el final de la palabra cierra con ella");
    assertEq(AN.frontierAt(grid, 10.55, "OUT").word.text, "en",
        "un OUT antes de que la siguiente termine no se la lleva");
    assertEq(AN.frontierAt(grid, 10.35, "OUT").word.text, "en",
        "un OUT en el silencio cierra con la anterior");

    // Un corte a mitad de palabra no debería existir, pero el audio manda sobre el
    // transcript y a veces lo deja ahí: cuando el STT alarga la última palabra sobre
    // el silencio, el cierre correcto cae dentro de ella según esta rejilla. Quien
    // vaya a medir ese borde en el WAV tiene que buscar el sonido en la ventana de
    // ESA palabra; con la de la frontera (la anterior) no lo encuentra, el borde se
    // vuelve inmedible y los chequeos del transcript denuncian un corte que está bien.
    section("holdingWord() — la palabra que el corte parte");
    assertEq(AN.holdingWord(grid, 10.15).text, "en", "dentro de la primera palabra");
    assertEq(AN.holdingWord(grid, 10.35), null, "en el silencio no parte ninguna");
    assertEq(AN.holdingWord(grid, 10.00), null, "justo en el arranque tampoco");
    assertEq(AN.holdingWord(grid, 10.30), null, "justo en el final tampoco");
    assertEq(AN.holdingWord(grid, 10.55).text, "la", "dentro de una del medio");
    assertEq(AN.holdingWord(grid, 999), null, "más allá del transcript no hay palabra");
    assertEq(AN.holdingWord([], 10.15), null, "sin transcript no inventa una");

    // El fallo que se repetía ronda tras ronda: el IN se mide contra el audio y cae
    // DENTRO de su propia primera palabra, porque Whisper la estira medio segundo
    // hacia el silencio. Se leía como "el bloque abre con la segunda palabra" y el
    // arreglo lo devolvía a la rejilla del transcript, donde el audio volvía a
    // moverlo: 16 movimientos para acabar donde empezó.
    section("senseVerdicts() — un corte medido contra el audio no es un error de sentido");
    assertEq(AN.senseVerdicts(takes, [{
        inTime: 140.15,         // dentro de la primera palabra según el transcript
        outTime: 158.0,
        inCue: inCue,
        outCue: ""
    }], OPTS).length, 0, "el IN abre con la palabra que parte, no con la siguiente");
    const closingWords = say("y esta pregunta su finalidad es buscar y orientar una accion concreta", 200)
        .concat(say("ahora vamos a comparar el periodo", 226));
    assertEq(AN.senseVerdicts(closingWords, [{
        inTime: 199.0,
        outTime: 204.95,        // dentro de "concreta", la última palabra del bloque
        inCue: "",
        outCue: "inalidad es buscar y orientar una acción concreta."
    }], OPTS).length, 0, "el OUT cierra con la palabra que parte, no con la anterior");

    section("outerBound() — el límite que el audio no puede cruzar");
    const midOf = w => (w.start + w.end) / 2;
    assertEq(AN.outerBound(grid, 10.10, "IN"), null,
        "sin palabra anterior no hay suelo");
    assertNear(AN.outerBound(grid, 10.50, "IN"), grid[0].end, 0.001,
        "el suelo del IN es el final de la palabra anterior");
    assertNear(AN.outerBound(grid, 10.75, "OUT"), midOf(grid[2]), 0.001,
        "el techo del OUT es el punto medio de la palabra siguiente");
    assertEq(AN.outerBound(grid, grid[grid.length - 1].end + 5, "OUT"), null,
        "sin palabra siguiente no hay techo");

    section("senseVerdicts() — OUT que corta la frase antes de que cierre");
    const closing = say("y esta pregunta su finalidad es buscar y orientar una accion concreta", 200)
        .concat(say("ahora vamos a comparar el periodo", 226));
    const cutEarly = AN.senseVerdicts(closing, [{
        inTime: 199.0,
        outTime: 203.0,        // a mitad de la frase que el CD marca como cierre
        inCue: "",
        outCue: "inalidad es buscar y orientar una acción concreta."
    }], OPTS);
    assertEq(cutEarly.length, 1, "canta el OUT");
    assertEq(cutEarly[0].code, "sense-out", "código del OUT");
    assertNear(cutEarly[0].targetTime, closing[11].end, 0.05,
        "señala el final de \"concreta\", la última palabra de la frase de cierre");

    section("senseVerdicts() — sin frase en el marcador se calla");
    assertEq(AN.senseVerdicts(takes, [{ inTime: 151.9, outTime: 158.0 }], OPTS).length, 0,
        "sin cue no hay veredicto");
    assertEq(AN.senseVerdicts(takes, [{ inTime: 151.9, outTime: 158.0, inCue: "algo que nadie dijo nunca aqui" }], OPTS).length, 0,
        "cue que no aparece: no se afirma nada");
    assertEq(AN.senseVerdicts(twin, [{ inTime: 76.0, outTime: 90.0,
        inCue: "Y es que por un lado tenemos la investigación cua" }], OPTS).length, 0,
        "con dos tomas iguales no se decide por cuenta propia");

    section("resolvesSense() — el arreglo tiene que caer en el ancla");
    const v = bad[0];
    assertEq(AN.resolvesSense(v, 140.0, OPTS), true, "el ancla exacta resuelve");
    assertEq(AN.resolvesSense(v, 139.6, OPTS), true, "el ancla con el colchón resuelve");
    assertEq(AN.resolvesSense(v, 151.9, OPTS), false, "quedarse donde estaba no resuelve");
    assertEq(AN.resolvesSense(v, 145.0, OPTS), false, "un punto intermedio tampoco");

    section("noteFromText() — el recado del editor, sin la frase ni las etiquetas");
    assertEq(AN.noteFromText("PV -  Cada elemento de esta cadena justifica al siguiente.", "IN"), "",
        "una etiqueta de vista no es un recado");
    assertEq(AN.noteFromText("OUT: ...cambiarla sin importar qué tan bien se vea.", "OUT"), "",
        "la convención del OUT tampoco");
    assertEq(AN.noteFromText("revisar out -  Entonces, ya que está esa cadena, lo que", "IN"), "revisar out",
        "el recado va delante de la frase del bloque");
    assertEq(AN.noteFromText("out antes de \"ya que está esa cadena,\" -  Ahora lo que vamos", "IN"),
        "out antes de \"ya que está esa cadena,\"", "la instrucción entera se conserva");
    assertEq(AN.noteFromText("R sin WAV -  Y ahora sí, vamos a", "IN"), "sin WAV",
        "el recado que no habla del corte también se lee");
    assertEq(AN.noteFor({ comments: "", name: "revisar el out" }, "OUT"), "",
        "sin separador ni OUT: no hay recado que sacar");

    section("flagsBoundary() — qué recados señalan este borde");
    assertEq(AN.flagsBoundary("revisar out", "OUT"), true, "\"revisar out\" señala el cierre");
    assertEq(AN.flagsBoundary("revisar out", "IN"), false, "pero no la apertura");
    assertEq(AN.flagsBoundary("out antes de \"ya que está esa cadena,\"", "OUT"), true,
        "la instrucción del CD también señala el cierre");
    assertEq(AN.flagsBoundary("sobra el cierre", "OUT"), true, "y lo dicho con otras palabras");
    assertEq(AN.flagsBoundary("revisar el in", "IN"), true, "el IN se señala igual");
    assertEq(AN.flagsBoundary("sin WAV", "OUT"), false, "una nota de producción no señala nada");
    assertEq(AN.flagsBoundary("", "OUT"), false, "sin recado no hay señal");
    assertEq(AN.flagsBoundary("retomamos desde donde dice ya que está esa cadena", "OUT"), true,
        "decir desde dónde se retomó señala el cierre de antes");

    section("retakeDirectiveFrom() — la orden del CD sin comillas");
    const rd = AN.retakeDirectiveFrom("retomamos desde donde dice ya que está esa cadena");
    assertEq(rd.kind, "OUT", "habla del cierre del bloque anterior");
    assertEq(rd.side, "before", "y de cortar antes de la frase");
    assertEq(rd.phrase, "ya que está esa cadena", "la frase es lo que sigue a \"desde\"");
    assertEq(AN.retakeDirectiveFrom("retomo desde \"el paso uno\"").phrase, "el paso uno",
        "con comillas se leen igual, sin las comillas");
    assertEq(AN.retakeDirectiveFrom("volvemos desde el minuto de la cadena").phrase,
        "el minuto de la cadena", "\"volvemos desde\" cuenta igual");
    assertEq(AN.retakeDirectiveFrom("empezamos desde donde dijo que la cadena importa").phrase,
        "que la cadena importa", "y \"empezamos desde donde dijo\" también");
    assertEq(AN.retakeDirectiveFrom("revisar out"), null, "un recado sin frase no es una orden");
    assertEq(AN.retakeDirectiveFrom("retomamos desde ahí"), null,
        "una frase demasiado corta no se puede buscar");
    assertEq(AN.retakeDirectiveFrom(""), null, "sin recado no hay orden");
    // La orden se lee del recado, así que la frase del bloque no se cuela dentro.
    assertEq(AN.retakeDirectiveFor({
        comments: "retomamos desde donde dice ya que está esa cadena -  Entonces, ya que está esa"
    }, "IN").phrase, "ya que está esa cadena", "la frase del bloque queda fuera de la orden");

    section("findMatches() — rendimiento sobre una clase entera");
    let big = [];
    for (let i = 0; i < 40; i++) {
        big = big.concat(say("hoy vamos a ver como se calcula el margen bruto de la tienda y su conversion", i * 30));
    }
    const t0 = Date.now();
    AN.findMatches(big, "como se calcula el margen bruto de la tienda", "IN", OPTS);
    const ms = Date.now() - t0;
    assert(ms < 500, "empareja " + big.length + " palabras en " + ms + "ms (< 500ms)");

    console.log("\n" + passed + " OK, " + failed + " fallos");
    return { passed, failed };
}

module.exports = { run };

if (require.main === module) {
    const r = run();
    if (r.failed > 0) process.exit(1);
}
