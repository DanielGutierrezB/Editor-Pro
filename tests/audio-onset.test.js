/**
 * Tests del módulo puro audio-onset.js: medir en el WAV dónde arranca y dónde
 * termina el sonido, en vez de creerle al transcript.
 *
 * El caso que da origen al módulo (clase real): el transcript decía que la frase
 * del bloque 2 empezaba en 181.44s, pero el sonido no arranca hasta 181.99 — 550
 * ms, 14 frames. Whisper estira la primera palabra de cada toma hacia el silencio
 * (mediana medida sobre 28 fronteras de esa clase: 0.47s), así que el colchón de
 * 10 frames o se vuelve un segundo de silencio muerto o desaparece y el corte pisa
 * el ataque de la palabra.
 *
 * Ejecutar con: node tests/run-node-tests.js
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const AO = require("../client/js/audio-onset.js");

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
const HOP = 0.005;

/**
 * Envolvente sintética: [[duraciónSeg, nivel], ...] con el hop por defecto.
 * Nivel bajo = ruido de sala, alto = voz.
 */
function envOf(spec) {
    const env = [];
    for (const [dur, level] of spec) {
        const n = Math.round(dur / HOP);
        for (let i = 0; i < n; i++) env.push(level);
    }
    return env;
}

function probeOf(spec, windowStart) {
    return { env: envOf(spec), hopSec: HOP, windowStart: windowStart || 0 };
}

const QUIET = 0.0008;   // ruido de sala
const VOICE = 0.15;     // voz

/** WAV PCM 16 bits estéreo con tramos de amplitud dada, para probar la lectura. */
function writeWav(file, spec, sampleRate) {
    const sr = sampleRate || 48000;
    const channels = 2;
    let frames = 0;
    for (const [dur] of spec) frames += Math.round(dur * sr);

    const data = Buffer.alloc(frames * channels * 2);
    let idx = 0;
    for (const [dur, amp] of spec) {
        const n = Math.round(dur * sr);
        for (let i = 0; i < n; i++) {
            // Tono de 200 Hz: la envolvente RMS solo mira magnitud, pero un tono
            // real ejercita la conversión de muestras mejor que una constante.
            const v = Math.round(amp * 32767 * Math.sin(2 * Math.PI * 200 * (i / sr)));
            data.writeInt16LE(v, idx * 4);
            data.writeInt16LE(v, idx * 4 + 2);
            idx++;
        }
    }

    const header = Buffer.alloc(44);
    header.write("RIFF", 0, "ascii");
    header.writeUInt32LE(36 + data.length, 4);
    header.write("WAVE", 8, "ascii");
    header.write("fmt ", 12, "ascii");
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);              // PCM
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sr, 24);
    header.writeUInt32LE(sr * channels * 2, 28);
    header.writeUInt16LE(channels * 2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36, "ascii");
    header.writeUInt32LE(data.length, 40);
    fs.writeFileSync(file, Buffer.concat([header, data]));
}

function run() {
    passed = 0; failed = 0;

    // ─── Envolvente y umbral ─────────────────────────────────

    section("envelope() — RMS por hops");
    const flat = new Float32Array(48000).fill(0.5);
    const env1 = AO.envelope(flat, 48000, { hopMs: 5 });
    assertNear(env1.hopSec, 0.005, 1e-9, "el hop sale en segundos");
    assertEq(env1.env.length, 200, "un segundo a hops de 5 ms son 200 puntos");
    assertNear(env1.env[0], 0.5, 1e-6, "RMS de una señal constante es su nivel");

    section("stats() — el umbral separa voz de ruido de sala");
    const st = AO.stats(envOf([[1, QUIET], [1, VOICE]]), {});
    assert(st.threshold > st.floor * 2, "el umbral queda claramente sobre el piso");
    assert(st.threshold < VOICE, "y por debajo del nivel de voz");

    section("voiceRuns() — un chasquido no es voz");
    const runs = AO.voiceRuns(envOf([[0.5, QUIET], [0.02, VOICE], [0.5, QUIET], [0.4, VOICE]]),
        st.threshold, Math.round(0.06 / HOP));
    assertEq(runs.length, 1, "el tramo de 20 ms se descarta y queda solo el de 400 ms");

    // ─── Borde del sonido ────────────────────────────────────

    section("refine() IN — el arranque real, no el que dice el transcript");
    // El transcript pone la palabra en 101.0; el sonido arranca en 101.5.
    const inProbe = probeOf([[1.5, QUIET], [1.5, VOICE]], 100);
    const inEdge = AO.refine(inProbe, 101.0, "IN", {});
    assert(inEdge != null, "con silencio por delante el arranque se puede afirmar");
    assertNear(inEdge.time, 101.5, 0.02, "el IN se mide donde sube la energía");
    assertNear(inEdge.shiftSec, 0.5, 0.02, "y se reporta cuánto se corrió respecto al transcript");

    section("refine() OUT — se queda en el borde más cercano al corte");
    // Caso real: tras la última palabra del bloque el profesor dice "pausa" al
    // editor. Buscando el último final de voz, el OUT se abría hasta después del
    // cue — justo la palabra que el bloque tiene que dejar fuera.
    const outProbe = probeOf([[0.5, QUIET], [1.0, VOICE], [0.5, QUIET], [0.6, VOICE], [0.5, QUIET]], 100);
    const outEdge = AO.refine(outProbe, 101.5, "OUT", {});
    assert(outEdge != null, "el final de la frase se puede afirmar");
    assertNear(outEdge.time, 101.5, 0.02, "cierra donde calla la frase, no tras el cue al editor");

    section("refine() — la cola de la palabra también es sonido");
    // Las palabras no se apagan de golpe: tras el tramo sostenido quedan chispazos
    // demasiado cortos para contar como voz. Tomando el final del tramo, el corte
    // caía 200 ms antes de que la frase acabara de sonar (encima de la onda), y el
    // chequeo de silencio —que sí veía los chispazos— tiraba el borde entero.
    const tailProbe = probeOf([
        [0.5, QUIET], [1.0, VOICE], [0.05, QUIET], [0.03, VOICE], [1.4, QUIET]
    ], 100);
    const tailEdge = AO.refine(tailProbe, 101.62, "OUT", {});
    assert(tailEdge != null, "con la cola contada, el borde se puede afirmar");
    assertNear(tailEdge.time, 101.58, 0.02, "el borde queda tras el último chispazo, no en 101.5");
    assert(tailEdge.quietSec > 1.0, "el silencio disponible se mide contra la voz, no contra la cola");

    section("refine() — cuándo el audio no puede afirmar nada");
    assertEq(AO.refine(probeOf([[3, VOICE]], 100), 101.5, "IN", {}), null,
        "habla continua: no hay silencio del que salir");
    assertEq(AO.refine(probeOf([[3, QUIET]], 100), 101.5, "IN", {}), null,
        "ventana sin contraste: nada que medir");
    assertEq(AO.refine(probeOf([[2.8, QUIET], [1.2, VOICE]], 100), 100.2, "IN", {}), null,
        "un borde a 2.6s del corte sería otra frase");
    assert(AO.refine(probeOf([[0.05, QUIET], [2, VOICE]], 100), 100.1, "IN", {}) == null,
        "sin silencio suficiente por delante no se afirma el arranque");

    // ─── Aire y alineación a frame ───────────────────────────

    section("evaluate() — el corte se mete en el sonido");
    const clip = AO.evaluate({ time: 181.99 }, 182.0, "IN", OPTS);
    assertEq(clip.code, "audio-clip", "un IN dentro del sonido es falla");
    assert(clip.airFrames < 0, "el aire sale negativo");
    assertNear(clip.applyTime, 181.56, 0.001, "se va 10 frames antes del arranque real");
    assert(clip.applyTime <= 181.99 - 10 / 25 + 1e-9,
        "el snap a frame nunca acerca el IN al sonido");

    section("evaluate() — sobra silencio");
    const air = AO.evaluate({ time: 181.99 }, 181.04, "IN", OPTS);
    assertEq(air.code, "audio-air", "casi un segundo de silencio muerto es aviso");
    assertNear(air.airFrames, 23.75, 0.01, "el aire se reporta en frames");
    assertNear(air.applyTime, 181.56, 0.001, "y se aprieta al mismo punto que la falla");

    section("evaluate() — poco aire sin llegar a pisar el sonido");
    const tight = AO.evaluate({ time: 181.99 }, 181.89, "IN", OPTS);
    assertEq(tight.code, "audio-air", "2.5 frames de aire no se oye roto, pero se gana aire");
    assertNear(tight.applyTime, 181.56, 0.001, "y se va al colchón completo");

    section("evaluate() — el colchón correcto pasa");
    assertEq(AO.evaluate({ time: 181.99 }, 181.59, "IN", OPTS).code, "",
        "10 frames de aire es exactamente lo que se pide");
    assertEq(AO.evaluate({ time: 72.845 }, 73.30, "OUT", OPTS).code, "",
        "un OUT con 11 frames de aire pasa");
    assertEq(AO.evaluate({ time: 181.99 }, 181.79, "IN", OPTS).code, "",
        "5 frames de aire entra en la banda aceptada, no se toca el marcador");

    section("refine() + evaluate() — el colchón no se mete en el sonido vecino");
    // La frase cierra y 0.3s después el profesor dice "pausa" al editor: el colchón
    // de 10 frames (0.4s) no cabe, así que se recorta.
    const tightProbe = probeOf([[0.5, QUIET], [1.0, VOICE], [0.3, QUIET], [0.6, VOICE], [0.5, QUIET]], 100);
    const tightEdge = AO.refine(tightProbe, 101.5, "OUT", { quietMs: 200 });
    assert(tightEdge != null, "el final de la frase se mide igual");
    assertNear(tightEdge.quietSec, 0.3, 0.02, "el silencio disponible se reporta");
    const clamped = AO.evaluate(tightEdge, 101.5, "OUT", OPTS);
    assert(clamped.applyTime <= 101.5 + 0.3 - 1 / 25 + 1e-9,
        "el OUT se queda dentro del silencio, sin tocar el cue al editor");
    assertEq(AO.evaluate(tightEdge, 101.76, "OUT", OPTS).code, "",
        "y con el colchón recortado ya puesto, el aviso no se repite");

    section("refine() — el límite del bloque manda sobre el borde más cercano");
    // El caso que se repetía ronda tras ronda: la frase y el "pausa" que el profesor
    // dice al editor van pegados, sin silencio suficiente en medio para separarlos,
    // así que el único borde medible es el final del cue. El techo lo dice el
    // transcript (dónde empieza esa palabra que el bloque deja fuera): si no cabe
    // ningún borde por debajo, el audio se calla y manda el transcript, en vez de
    // abrir el OUT hasta después del cue.
    const gluedProbe = probeOf([[0.5, QUIET], [1.0, VOICE], [0.1, QUIET], [0.6, VOICE], [0.5, QUIET]], 100);
    const glued = AO.refine(gluedProbe, 101.4, "OUT", { quietMs: 200 });
    assert(glued != null && glued.time > 102.0,
        "sin techo el borde medible es el final del cue (" + (glued && glued.time.toFixed(2)) + "s)");
    assertEq(AO.refine(gluedProbe, 101.4, "OUT", { quietMs: 200, maxTime: 101.6 }), null,
        "con techo no se afirma nada: el corte lo decide el transcript");
    assertEq(AO.refine(inProbe, 101.0, "IN", { minTime: 101.8 }), null,
        "y un IN no retrocede por debajo del suelo del bloque");

    section("refine() — un ruido en el silencio no es el ataque de la frase");
    // Clase 14, bloque 3: un golpe de 0.15s a 274.0s, silencio, y la frase que no
    // suena hasta 276.2. El transcript decía que la primera palabra empieza en
    // 275.30 (Whisper adelanta el arranque de cada toma), así que el suelo del
    // audio es 275.30 − 0.4 = 274.90: por debajo de ahí, lo que suene es sala.
    const knockProbe = probeOf([
        [1.4, QUIET],       // 272.6 … 274.0
        [0.15, VOICE],      // golpe
        [2.05, QUIET],      // 274.15 … 276.2
        [1.5, VOICE]        // la frase
    ], 272.6);
    const knock = AO.refine(knockProbe, 274.97, "IN", {});
    assertNear(knock.time, 274.0, 0.05, "sin suelo, el golpe se mide como el arranque");
    const real = AO.refine(knockProbe, 274.97, "IN", { edgeMinTime: 274.9 });
    assertNear(real.time, 276.2, 0.05, "con suelo, el borde es donde arranca la frase");
    assertNear(AO.evaluate(real, 274.97, "IN", OPTS).applyTime, 275.8, 0.03,
        "y el IN queda 10 frames antes del sonido, no dos segundos antes");
    // El suelo de búsqueda no recorta el colchón: el aire sale del silencio que hay.
    assertNear(AO.evaluate(real, 274.97, "IN", { padFrames: 10, fps: 25, edgeMinTime: 276.0 }).applyTime,
        275.8, 0.03, "el límite de búsqueda no le quita aire al corte");

    section("evaluate() — el colchón no cruza el límite del bloque");
    // Aunque el silencio siga, el colchón se recorta para no llevarse la palabra
    // anterior: el bloque no gana contenido por ganar aire.
    const bounded = AO.evaluate({ time: 101.5, quietSec: 3 }, 101.5, "IN", { padFrames: 10, fps: 25, minTime: 101.3 });
    assert(bounded.applyTime >= 101.3, "el IN no cruza el final de la palabra anterior");
    assertNear(bounded.applyTime, 101.32, 0.001, "se queda en el frame anterior al límite");

    section("evaluate() — el OUT se aleja del sonido al alinear a frame");
    const outFix = AO.evaluate({ time: 3761.42 }, 3759.66, "OUT", OPTS);
    assertEq(outFix.code, "audio-clip", "un OUT que corta la frase es falla");
    assert(outFix.applyTime >= 3761.42 + 10 / 25 - 1e-9,
        "el snap a frame nunca acerca el OUT al sonido");

    // ─── Lectura del WAV ─────────────────────────────────────

    section("wavInfo() + probe() + measure() sobre un WAV real");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ep-audio-"));
    const wavFile = path.join(dir, "clase_26-07-25_10-00-00.wav");
    writeWav(wavFile, [[1.2, 0.0005], [1.3, 0.25], [1.0, 0.0005]]);

    const info = AO.wavInfo(wavFile);
    assert(info != null, "la cabecera del WAV se lee");
    assertEq(info.sampleRate, 48000, "sample rate");
    assertEq(info.channels, 2, "canales");
    assertEq(info.bits, 16, "bits por muestra");
    assertNear(info.durationSec, 3.5, 0.01, "duración a partir del chunk de datos");

    const wav = { file: wavFile, info: info };
    const probe = AO.probe(wav, 0, 3.5, {});
    assert(probe != null && probe.env.length > 600, "la ventana se convierte en envolvente");

    // El "transcript" diría 0.2s; el sonido arranca en 1.2s.
    const measured = AO.measure(wav, 0.2, "IN", OPTS);
    assert(measured != null, "el borde se mide contra el audio");
    assertNear(measured.edge.time, 1.2, 0.03, "el arranque real se encuentra en el WAV");
    assertEq(measured.code, "audio-air", "un segundo de silencio muerto se aprieta");
    assertNear(measured.applyTime, 0.8, 0.02, "el IN se va 10 frames antes del sonido");
    assertEq(AO.measure(wav, 0.8, "IN", OPTS).code, "",
        "un IN ya puesto en el colchón correcto pasa la revisión");

    // ─── Alinear el transcript con el audio ──────────────────

    section("alignWords() — el arranque que el STT adelanta se pega al sonido");
    // WAV: silencio 1.2s · frase 1.3s · silencio 0.8s · frase 1.0s · silencio 0.7s
    const alignFile = path.join(dir, "tomas-align_26-07-25_10-00-00.wav");
    writeWav(alignFile, [[1.2, 0.0005], [1.3, 0.25], [0.8, 0.0005], [1.0, 0.25], [0.7, 0.0005]]);
    const alignWav = { file: alignFile, info: AO.wavInfo(alignFile) };

    // El "transcript": la primera palabra de cada tramo empieza medio segundo antes
    // de que suene (el sesgo real de Whisper) y los finales están bien.
    const raw = [
        { text: "hola", start: 0.70, end: 1.90, type: "word" },
        { text: "clase", start: 1.90, end: 2.50, type: "word" },
        { text: "vamos", start: 2.90, end: 3.60, type: "word" },
        { text: "allá", start: 3.60, end: 4.30, type: "word" }
    ];
    const al = AO.alignWords(alignWav, raw, OPTS);
    assertNear(al.words[0].start, 1.2, 0.05, "el primer arranque se va a donde suena");
    assertNear(al.words[1].end, 2.5, 0.05, "el final que ya estaba bien no se toca");
    assertNear(al.words[2].start, 3.3, 0.05, "el arranque tras el silencio interior también");
    assertEq(al.stats.movedStarts >= 2, true, "cuenta los arranques movidos");
    assert(al.stats.medianStartShift > 0, "el sesgo medido va en el sentido esperado (el sonido llega después)");
    assertEq(raw[0].start, 0.70, "no muta el array que le pasan");

    section("alignWords() — ni invierte palabras ni las pisa");
    let broken = 0;
    for (let i = 0; i < al.words.length; i++) {
        if (al.words[i].end <= al.words[i].start) broken++;
        if (i > 0 && al.words[i].start < al.words[i - 1].end - 0.001) broken++;
    }
    assertEq(broken, 0, "el transcript alineado sigue siendo consistente");
    // Un arranque que se va MÁS ALLÁ del final de su palabra empuja lo que sigue.
    const late = AO.alignWords(alignWav, [
        { text: "hola", start: 0.70, end: 0.95, type: "word" },
        { text: "clase", start: 0.95, end: 2.50, type: "word" }
    ], OPTS);
    assertNear(late.words[0].start, 1.2, 0.05, "el arranque va al sonido");
    assert(late.words[0].end > late.words[0].start, "la palabra no queda invertida");
    assert(late.words[1].start >= late.words[0].end - 0.001, "y la siguiente no se pisa con ella");

    section("alignWords() — la última palabra estirada sobre el silencio vuelve al sonido");
    // Clase 15, bloque 3: "conecte." acababa 0.7s después de que se apagara la voz, y
    // el OUT del bloque quedaba a mitad de palabra según el transcript aunque el corte
    // estuviera bien puesto. WAV: silencio 1s · frase 1–5s · silencio · frase 6–8s.
    const tailFile = path.join(dir, "tomas-tail_26-07-25_10-00-00.wav");
    writeWav(tailFile, [[1.0, 0.0005], [4.0, 0.25], [1.5, 0.0005], [2.0, 0.25], [0.6, 0.0005]]);
    const tailWav = { file: tailFile, info: AO.wavInfo(tailFile) };
    const tailWords = [];
    for (let i = 0; i < 11; i++) {
        tailWords.push({ text: "pal" + i, start: 1.0 + i * 0.33, end: 1.0 + (i + 1) * 0.33, type: "word" });
    }
    const stretched = { text: "conecte.", start: 4.63, end: 5.70, type: "word" };
    tailWords.push(stretched);
    for (let j = 0; j < 5; j++) {
        tailWords.push({ text: "sig" + j, start: 6.5 + j * 0.35, end: 6.5 + (j + 1) * 0.35, type: "word" });
    }
    const tail = AO.alignWords(tailWav, tailWords, OPTS);
    assertNear(tail.words[11].end, 5.0, 0.08, "el cierre se pega a donde se apaga la voz");
    assertNear(tail.words[11].start, 4.63, 0.01, "la corrección la absorbe la palabra del borde");
    assertNear(tail.words[5].end, tailWords[5].end, 0.01, "las palabras de en medio no se mueven");
    assert(tail.stats.movedEnds >= 1, "cuenta el final movido");

    section("alignWords() — alinear dos veces no mueve nada la segunda");
    // La ventana en la que se busca cada borde se abre alrededor de los tiempos del
    // transcript, así que un error grande solo se corrige en parte y hace falta otra
    // pasada. Se repite hasta que deje de mover: si el resultado no fuera estable, un
    // transcript ya guardado seguiría teniendo bordes que la siguiente medida cambia,
    // y un corte bien puesto se lee como corte a mitad de palabra (clase 15, bloque 3).
    [["arranques", alignWav, al.words], ["cola estirada", tailWav, tail.words]]
        .forEach(function(c) {
            var again = AO.alignWords(c[1], c[2], OPTS);
            assertEq(again.stats.movedStarts, 0, c[0] + ": ningún arranque se mueve ya");
            assertEq(again.stats.movedEnds, 0, c[0] + ": ningún final se mueve ya");
        });

    section("alignWords() — las stats son contra los tiempos que entraron");
    // Con varias pasadas, contar solo la última diría que no se movió casi nada.
    const oneShot = AO.alignWords(alignWav, raw, Object.assign({}, OPTS, { alignPasses: 1 }));
    const looped = AO.alignWords(alignWav, raw, OPTS);
    assertEq(looped.stats.movedStarts, oneShot.stats.movedStarts,
        "lo que ya arreglaba una pasada sigue contado igual");
    assertNear(looped.words[0].start, oneShot.words[0].start, 0.001,
        "y con estos tiempos una pasada ya bastaba: el resultado es el mismo");

    section("alignWords() — un ruido antes de la palabra no se toma por su arranque");
    // Golpe corto en el silencio, 0.6s antes de que empiece la frase de verdad.
    const knockFile = path.join(dir, "tomas-knock_26-07-25_10-00-00.wav");
    writeWav(knockFile, [[0.8, 0.0005], [0.12, 0.22], [0.9, 0.0005], [1.2, 0.25], [0.6, 0.0005]]);
    const knockWav = { file: knockFile, info: AO.wavInfo(knockFile) };
    const kn = AO.alignWords(knockWav, [
        { text: "esto", start: 1.95, end: 2.60, type: "word" },
        { text: "es", start: 2.60, end: 3.00, type: "word" }
    ], OPTS);
    assertNear(kn.words[0].start, 1.82, 0.06, "se queda en el sonido de la frase, no en el golpe");

    section("dropSilentWords() — la palabra que el STT oyó donde no suena nada");
    const halluc = [{ text: "Gracias.", start: 0.1, end: 0.18, type: "word" }]
        .concat(raw.map(w => ({ text: w.text, start: w.start + 10, end: w.end + 10, type: "word" })));
    // Sin nivel de habla de referencia (transcript corto) no se atreve a borrar nada.
    assertEq(AO.dropSilentWords(alignWav, halluc, OPTS).dropped.length, 0,
        "con pocas palabras no hay referencia de habla: no descarta");

    section("levelAt() — lo único que se puede decir de un borde sin silencio limpio");
    assertEq(AO.levelAt(wav, 1.35, {}).onSound, true, "en mitad de la frase suena");
    assertEq(AO.levelAt(wav, 0.6, {}).onSound, false, "en el silencio de antes, no");

    section("findWav() — no vale el WAV de la secuencia ya cortada");
    const cutFile = path.join(dir, "clase_26-07-25_11-00-00.wav");
    writeWav(cutFile, [[1.0, 0.25]]);   // más reciente, pero dura 1s
    const found = AO.findWav(dir, "clase", 3.5);
    assert(found != null, "se encuentra un WAV de la secuencia");
    assertEq(path.basename(found.file), "clase_26-07-25_10-00-00.wav",
        "gana el que cuadra con la duración, no el más nuevo");
    assertEq(AO.findWav(dir, "otra-clase", 3.5), null,
        "sin WAV de esa secuencia no se inventa uno");
    assertEq(AO.findWav(dir, "clase", 600), null,
        "ninguno cuadra con la duración: mejor sin medir que midiendo otro audio");

    fs.rmSync(dir, { recursive: true, force: true });

    console.log("\n" + passed + " OK, " + failed + " fallos");
    return { passed, failed };
}

module.exports = { run };
