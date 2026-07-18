/**
 * Tests Node del motor de cortes XML (xml-cut-engine.js).
 * Ejecutar con: node tests/run-node-tests.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");
const engine = require("../client/js/xml-cut-engine.js");

const OPTS = { DOMParser, XMLSerializer };

const simpleXml = fs.readFileSync(path.join(__dirname, "fixtures", "fixture-simple.xml"), "utf8");
const nestedXml = fs.readFileSync(path.join(__dirname, "fixtures", "fixture-nested.xml"), "utf8");

// ─── Helpers de aserción ─────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (cond) {
        passed++;
    } else {
        failed++;
        console.error("  ✗ FALLO: " + msg);
    }
}

function assertEq(actual, expected, msg) {
    assert(actual === expected, msg + " (esperado: " + expected + ", obtenido: " + actual + ")");
}

function section(name) {
    console.log("\n── " + name);
}

// Helpers para inspeccionar el XML resultante
function parseResult(xml) {
    return new DOMParser().parseFromString(xml, "text/xml");
}

function els(node, name) {
    const out = [];
    const found = node.getElementsByTagName(name);
    for (let i = 0; i < found.length; i++) out.push(found[i]);
    return out;
}

function childTag(node, name) {
    for (let i = 0; i < node.childNodes.length; i++) {
        const k = node.childNodes[i];
        if (k.nodeType === 1 && k.nodeName === name) return k;
    }
    return null;
}

function childNum(node, name) {
    const el = childTag(node, name);
    if (!el) return NaN;
    return parseInt(el.textContent, 10);
}

function findClip(doc, id) {
    const clips = els(doc, "clipitem");
    for (const c of clips) {
        if (c.getAttribute("id") === id) return c;
    }
    return null;
}

/**
 * Verifica que en cada track los clips (por geometría start/end) no se solapen.
 */
function assertNoOverlaps(doc, label) {
    const media = els(doc, "media")[0];
    const rootTracks = [];
    // Solo tracks del nivel superior (evitar tracks dentro de nests)
    for (const mediaChild of ["video", "audio"]) {
        const section = childTag(media, mediaChild);
        if (!section) continue;
        for (let i = 0; i < section.childNodes.length; i++) {
            const k = section.childNodes[i];
            if (k.nodeType === 1 && k.nodeName === "track") rootTracks.push(k);
        }
    }
    for (const track of rootTracks) {
        const ranges = [];
        for (let i = 0; i < track.childNodes.length; i++) {
            const k = track.childNodes[i];
            if (k.nodeType !== 1 || (k.nodeName !== "clipitem" && k.nodeName !== "generatoritem")) continue;
            const s = childNum(k, "start");
            const e = childNum(k, "end");
            if (s === -1 || e === -1) continue;
            ranges.push({ s, e, id: k.getAttribute("id") });
        }
        ranges.sort((a, b) => a.s - b.s);
        for (let r = 1; r < ranges.length; r++) {
            assert(ranges[r].s >= ranges[r - 1].e,
                label + ": solape entre " + ranges[r - 1].id + " y " + ranges[r].id +
                " (" + ranges[r - 1].e + " > " + ranges[r].s + ")");
        }
    }
}

// ─── Tests ───────────────────────────────────────────────────

function run() {

    section("inspect() — fixture simple");
    {
        const info = engine.inspect(simpleXml, OPTS);
        assert(info.ok, "inspect ok");
        assertEq(info.sequenceName, "Clase Demo", "nombre de secuencia");
        assertEq(info.fps, 30, "fps");
        assertEq(info.durationFrames, 900, "duración en frames");
        assertEq(info.videoTrackCount, 2, "tracks de video");
        assertEq(info.audioTrackCount, 1, "tracks de audio");
        assertEq(info.clipCount, 5, "total de clips");
        assertEq(info.nestedClips.length, 0, "sin nests");
        assertEq(info.remappedClips.length, 0, "sin remaps");
    }

    section("inspect() — fixture con nests y remap");
    {
        const info = engine.inspect(nestedXml, OPTS);
        assert(info.ok, "inspect ok");
        assertEq(info.nestedClips.length, 2, "detecta 2 clips anidados (definición + referencia)");
        assertEq(info.nestedSequenceCount, 1, "1 anidación única (mismo nest usado 2 veces)");
        assertEq(info.remappedClips.length, 1, "detecta 1 clip con time remap");
        assertEq(info.remappedClips[0].name, "slowmo.mp4", "nombre del clip remapeado");
    }

    section("normalizeZones() — guardas de sanidad");
    {
        let r = engine.normalizeZones([{ start: 5, end: 2, label: "mala" }], 30);
        assert(r.errors.length > 0, "zona invertida produce error");

        r = engine.normalizeZones([{ start: 1, end: 5 }, { start: 4, end: 8 }], 30);
        assertEq(r.zones.length, 1, "zonas solapadas se fusionan");
        assertEq(r.zones[0].end, 8, "fin de la zona fusionada");
        assert(r.warnings.length > 0, "el merge genera warning");

        r = engine.normalizeZones([{ start: -2, end: 5 }, { start: 40, end: 50 }], 30);
        assertEq(r.zones.length, 1, "zona fuera de rango descartada");
        assertEq(r.zones[0].start, 0, "inicio negativo recortado a 0");

        r = engine.normalizeZones([{ start: 0, end: 29 }], 30);
        assert(r.needsConfirmation, "eliminar >90% requiere confirmación");

        r = engine.normalizeZones([{ start: 0, end: 30 }], 30);
        assert(r.errors.length > 0, "eliminar el 100% es error");
    }

    section("applyCuts() — zona en medio de un clip (split)");
    {
        // Zona 20s–25s = frames 600–750, dentro de clipitem-2 (eff 420–900)
        const res = engine.applyCuts(simpleXml, [{ start: 20, end: 25, label: "Brecha" }], OPTS);
        assert(res.ok, "applyCuts ok: " + (res.error || ""));
        const rep = res.report;
        assertEq(rep.framesRemoved, 150, "frames eliminados");
        assertEq(rep.newDurationFrames, 750, "nueva duración 900-150");
        assert(rep.splitClips >= 2, "clipitem-2 y clipitem-5 divididos (video+audio)");

        const doc = parseResult(res.xml);
        const c2 = findClip(doc, "clipitem-2");
        assertEq(childNum(c2, "end"), 600, "primera mitad termina en el corte");
        assertEq(childNum(c2, "out"), 180, "out primera mitad = in + (600-420)");

        // La segunda mitad es un clon con id nuevo
        const clips = els(doc, "clipitem");
        const clone = clips.find(c => (c.getAttribute("id") || "").indexOf("clipitem-2-ca2s") === 0);
        assert(!!clone, "existe el clon de clipitem-2");
        assertEq(childNum(clone, "start"), 600, "clon empieza en el join");
        assertEq(childNum(clone, "end"), 750, "clon termina en 900-150");
        assertEq(childNum(clone, "in"), 330, "in del clon = 0 + (750-420)");
        assertEq(childNum(clone, "out"), 480, "out del clon conserva el original");

        // Los <link> del clon apuntan a los clones correspondientes (no a las
        // primeras mitades) — así el A/V del split sigue vinculado
        const audioClone = clips.find(c => (c.getAttribute("id") || "").indexOf("clipitem-5-ca2s") === 0);
        assert(!!audioClone, "existe el clon del audio (clipitem-5)");
        const cloneLinkRefs = els(clone, "linkclipref").map(l => l.textContent.trim());
        assert(cloneLinkRefs.indexOf(clone.getAttribute("id")) !== -1, "el clon se auto-referencia en <link>");
        assert(cloneLinkRefs.indexOf(audioClone.getAttribute("id")) !== -1, "el clon de video linkea al clon de audio");
        assert(cloneLinkRefs.indexOf("clipitem-2") === -1, "el clon NO linkea a la primera mitad");
        assert(cloneLinkRefs.indexOf("clipitem-5") === -1, "el clon NO linkea al audio original");

        // logo (300-600) queda intacto; marcador M3 (800) → 650
        const c3 = findClip(doc, "clipitem-3");
        assertEq(childNum(c3, "end"), 600, "logo intacto");
        const markers = els(doc, "marker");
        const m3 = markers.find(m => childTag(m, "name").textContent === "M3");
        assertEq(childNum(m3, "in"), 650, "marcador M3 desplazado");

        assertNoOverlaps(doc, "split");
    }

    section("applyCuts() — zona sobre transición (materializa bordes)");
    {
        // Zona 10s–15s = frames 300–450, toca la transición 420–480
        const res = engine.applyCuts(simpleXml, [{ start: 10, end: 15, label: "Brecha 1" }], OPTS);
        assert(res.ok, "applyCuts ok: " + (res.error || ""));
        const rep = res.report;
        assertEq(rep.deletedTransitions, 1, "transición eliminada");
        assertEq(rep.newDurationFrames, 750, "nueva duración");

        const doc = parseResult(res.xml);
        const c1 = findClip(doc, "clipitem-1");
        // Transición materializada al centro (450) y luego trim a 300
        assertEq(childNum(c1, "end"), 300, "clipitem-1 recortado al inicio de la zona");
        assertEq(childNum(c1, "out"), 400, "out de clipitem-1 = 100 + 300");
        // pproTicksOut sincronizado: 400 frames * 8467200000
        assertEq(childNum(c1, "pproTicksOut"), 400 * 8467200000, "pproTicksOut sincronizado");

        const c2 = findClip(doc, "clipitem-2");
        assertEq(childNum(c2, "start"), 300, "clipitem-2 arranca en el join");
        assertEq(childNum(c2, "end"), 750, "clipitem-2 desplazado");
        assertEq(childNum(c2, "in"), 30, "in de clipitem-2 avanzado por materialización");

        // logo (300–600): head trim → 300–450, in += 150
        const c3 = findClip(doc, "clipitem-3");
        assertEq(childNum(c3, "start"), 300, "logo mantiene inicio");
        assertEq(childNum(c3, "end"), 450, "logo desplazado");
        assertEq(childNum(c3, "in"), 150, "in del logo avanzado");

        // Marcadores: M2 (480) → 330, M1 (60) intacto
        const doc2 = parseResult(res.xml);
        const markers = els(doc2, "marker");
        assertEq(markers.length, 3, "3 marcadores conservados");
        const m2 = markers.find(m => childTag(m, "name").textContent === "M2");
        assertEq(childNum(m2, "in"), 330, "M2 desplazado");

        assertNoOverlaps(doc, "transición");
    }

    section("applyCuts() — zona Pre-inicio (trim de cabeza)");
    {
        // Zona 0–5s = frames 0–150
        const res = engine.applyCuts(simpleXml, [{ start: 0, end: 5, label: "Pre-inicio" }], OPTS);
        assert(res.ok, "applyCuts ok: " + (res.error || ""));
        const doc = parseResult(res.xml);
        const c1 = findClip(doc, "clipitem-1");
        assertEq(childNum(c1, "start"), 0, "clipitem-1 arranca en 0");
        assertEq(childNum(c1, "in"), 250, "in avanzado 150 frames");
        const c4 = findClip(doc, "clipitem-4");
        assertEq(childNum(c4, "start"), 0, "audio arranca en 0");
        assertEq(childNum(c4, "end"), 300, "audio desplazado");
        assertEq(res.report.newDurationFrames, 750, "duración reducida");
        assertNoOverlaps(doc, "pre-inicio");
    }

    section("applyCuts() — clip eliminado completo + limpieza de links");
    {
        // Zona 10s–20s = frames 300–600: cubre el logo (300–600) completo
        const res = engine.applyCuts(simpleXml, [{ start: 10, end: 20, label: "Brecha" }], OPTS);
        assert(res.ok, "applyCuts ok: " + (res.error || ""));
        assert(res.report.deletedClips >= 1, "logo eliminado");
        const doc = parseResult(res.xml);
        assert(!findClip(doc, "clipitem-3"), "clipitem-3 ya no existe");

        // clipitem-1 tenía un <link> a clipitem-3: debe haberse limpiado
        const c1 = findClip(doc, "clipitem-1");
        const linkRefs = els(c1, "linkclipref").map(l => l.textContent.trim());
        assert(linkRefs.indexOf("clipitem-3") === -1, "link a clip eliminado se limpia");
        assert(linkRefs.indexOf("clipitem-4") !== -1, "links válidos se conservan");
        assertNoOverlaps(doc, "delete");
        assertEq(res.report.newDurationFrames, 600, "duración 900-300");
    }

    section("applyCuts() — múltiples zonas (shifts acumulados)");
    {
        const res = engine.applyCuts(simpleXml, [
            { start: 10, end: 15, label: "Z1" },
            { start: 20, end: 25, label: "Z2" }
        ], OPTS);
        assert(res.ok, "applyCuts ok: " + (res.error || ""));
        assertEq(res.report.framesRemoved, 300, "300 frames eliminados en total");
        assertEq(res.report.newDurationFrames, 600, "duración 900-300");
        const doc = parseResult(res.xml);
        assertNoOverlaps(doc, "multizona");
        // Continuidad: la secuencia resultante no tiene huecos en V1+audio
        const c2 = findClip(doc, "clipitem-2");
        assertEq(childNum(c2, "start"), 300, "clipitem-2 pegado al join de Z1");
    }

    section("applyCuts() — nests: definición intacta y clon con referencia");
    {
        // fps 25. Zona 22s–28s = frames 550–700: divide el nest (500–1000)
        const res = engine.applyCuts(nestedXml, [{ start: 22, end: 28, label: "Brecha" }], OPTS);
        assert(res.ok, "applyCuts ok: " + (res.error || ""));
        assertEq(res.report.nestedClipCount, 2, "reporta 2 clips anidados");

        const doc = parseResult(res.xml);
        const n2 = findClip(doc, "clipitem-n2");
        assertEq(childNum(n2, "end"), 550, "primera mitad del nest termina en el corte");
        assertEq(childNum(n2, "out"), 50, "out de la primera mitad");

        // La definición embebida del nest queda intacta
        const embedded = childTag(n2, "sequence");
        assert(!!embedded, "la definición del nest sigue embebida");
        const inner = els(embedded, "clipitem");
        assertEq(inner.length, 1, "el interior del nest no se toca");
        assertEq(childNum(inner[0], "start"), 0, "inner start intacto");
        assertEq(childNum(inner[0], "end"), 500, "inner end intacto");
        assertEq(childNum(inner[0], "in"), 50, "inner in intacto");

        // El clon del nest usa referencia vacía, no duplica la definición
        const clips = els(doc, "clipitem");
        const clone = clips.find(c => (c.getAttribute("id") || "").indexOf("clipitem-n2-ca2s") === 0);
        assert(!!clone, "existe el clon del nest");
        const cloneSeq = childTag(clone, "sequence");
        assert(!!cloneSeq, "el clon referencia la secuencia anidada");
        assertEq(cloneSeq.getAttribute("id"), "nested-seq-1", "referencia por id");
        assertEq(els(cloneSeq, "clipitem").length, 0, "la referencia del clon es vacía (sin duplicar definición)");
        assertEq(childNum(clone, "in"), 200, "in del clon = 0 + (700-500)");

        // n3 (referencia, 1000–1500) desplazado 150 frames
        const n3 = findClip(doc, "clipitem-n3");
        assertEq(childNum(n3, "start"), 850, "n3 desplazado");
        assertEq(childNum(n3, "end"), 1350, "n3 fin desplazado");

        assertNoOverlaps(doc, "nests");
        assertEq(res.report.newDurationFrames, 1350, "duración 1500-150");
    }

    section("applyCuts() — eliminar el clip con la definición del nest restaura la definición");
    {
        // fps 25. Zona 20s–40s = frames 500–1000: cubre clipitem-n2 (que contiene
        // la definición completa de nested-seq-1) — clipitem-n3 sobrevive con
        // una referencia <sequence id="nested-seq-1"/> que quedaría huérfana
        const res = engine.applyCuts(nestedXml, [{ start: 20, end: 40, label: "Brecha" }],
            Object.assign({ allowLargeRemoval: true }, OPTS));
        assert(res.ok, "applyCuts ok: " + (res.error || ""));
        assert(res.report.deletedClips >= 1, "clipitem-n2 eliminado");
        assertEq(res.report.restoredDefinitions, 1, "1 definición restaurada");

        const doc = parseResult(res.xml);
        assert(!findClip(doc, "clipitem-n2"), "clipitem-n2 ya no existe");
        const n3 = findClip(doc, "clipitem-n3");
        assert(!!n3, "clipitem-n3 sobrevive");
        assertEq(childNum(n3, "start"), 500, "n3 desplazado 500 frames");

        // La referencia del n3 ahora contiene la definición completa del nest
        const n3seq = childTag(n3, "sequence");
        assert(!!n3seq, "n3 conserva su <sequence>");
        assertEq(n3seq.getAttribute("id"), "nested-seq-1", "id del nest");
        assert(els(n3seq, "clipitem").length >= 1, "la definición del nest fue restaurada (no es referencia vacía)");
    }

    section("applyCuts() — marcador de rango que cruza la zona ajusta su out");
    {
        // M1: in=60, out=700 → zona 10s–15s (frames 300–450, L=150):
        // in queda intacto, out debe reducirse a 550
        const rangeXml = simpleXml.replace(
            "<name>M1</name>\n            <in>60</in>\n            <out>-1</out>",
            "<name>M1</name>\n            <in>60</in>\n            <out>700</out>"
        );
        assert(rangeXml !== simpleXml, "fixture modificado para marcador de rango");
        const res = engine.applyCuts(rangeXml, [{ start: 10, end: 15, label: "Z" }], OPTS);
        assert(res.ok, "applyCuts ok: " + (res.error || ""));
        const doc = parseResult(res.xml);
        const m1 = els(doc, "marker").find(m => childTag(m, "name").textContent === "M1");
        assertEq(childNum(m1, "in"), 60, "in del marcador intacto");
        assertEq(childNum(m1, "out"), 550, "out del marcador reducido por la zona");
    }

    section("applyCuts() — remap en borde de corte → error claro");
    {
        // Zona 6s–10s = frames 150–250: recorta el borde del clip remapeado (200–400)
        const res = engine.applyCuts(nestedXml, [{ start: 6, end: 10, label: "Brecha" }], OPTS);
        assert(!res.ok, "debe fallar");
        assert((res.error || "").indexOf("slowmo.mp4") !== -1, "el error menciona el clip remapeado");
    }

    section("applyCuts() — remap eliminado completo → permitido");
    {
        // Zona 7s–17s = frames 175–425: cubre el clip remapeado (200–400) completo
        const res = engine.applyCuts(nestedXml, [{ start: 7, end: 17, label: "Brecha" }], OPTS);
        assert(res.ok, "eliminar un clip remapeado completo es válido: " + (res.error || ""));
        const doc = parseResult(res.xml);
        assert(!findClip(doc, "clipitem-remap"), "clip remapeado eliminado");
    }

    section("parseo tolerante — BOM y whitespace antes de la declaración XML");
    {
        const withBom = "\uFEFF" + simpleXml;
        const info = engine.inspect(withBom, OPTS);
        assert(info.ok, "inspect acepta XML con BOM: " + (info.error || ""));
        const res = engine.applyCuts(withBom, [{ start: 20, end: 25 }], OPTS);
        assert(res.ok, "applyCuts acepta XML con BOM: " + (res.error || ""));

        const withJunk = "\n  \uFEFF" + simpleXml;
        assert(engine.inspect(withJunk, OPTS).ok, "inspect acepta whitespace + BOM inicial");

        const bad = engine.inspect("no soy xml", OPTS);
        assert(!bad.ok, "contenido no-XML sigue fallando");
        assert((bad.error || "").indexOf("no soy xml") !== -1, "el error incluye el inicio del archivo para diagnóstico");
    }

    section("applyCuts() — renombrado de secuencia");
    {
        const res = engine.applyCuts(simpleXml, [{ start: 20, end: 25 }],
            Object.assign({ newName: "Clase Demo - CA2" }, OPTS));
        assert(res.ok, "applyCuts ok");
        const doc = parseResult(res.xml);
        const seq = els(doc, "sequence")[0];
        assertEq(childTag(seq, "name").textContent, "Clase Demo - CA2", "secuencia renombrada");
    }

    section("applyCuts() — eliminación grande requiere confirmación");
    {
        const res = engine.applyCuts(simpleXml, [{ start: 0, end: 28 }], OPTS);
        assert(!res.ok && res.needsConfirmation, "pide confirmación");
        const res2 = engine.applyCuts(simpleXml, [{ start: 0, end: 28 }],
            Object.assign({ allowLargeRemoval: true }, OPTS));
        assert(res2.ok, "con allowLargeRemoval procede: " + (res2.error || ""));
    }

    return { passed, failed };
}

module.exports = { run };
