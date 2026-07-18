/**
 * xml-cut-engine.js — Motor de cortes por reconstrucción FCPXML (xmeml)
 *
 * Módulo puro, sin dependencias de Premiere ni del DOM del panel.
 * Recibe el XML exportado por exportAsFinalCutProXML(), elimina las zonas
 * de remove (con ripple en todas las pistas) y devuelve el XML editado
 * listo para reimportar como secuencia nueva.
 *
 * Funciona en el panel CEP (usa window.DOMParser/XMLSerializer) y en Node
 * para tests (recibe implementaciones vía opts, p.ej. @xmldom/xmldom).
 *
 * Expone: window.EPXmlCutEngine / module.exports
 *   - inspect(xmlString, opts)        → info de la secuencia (fps, nests, remaps...)
 *   - applyCuts(xmlString, zones, opts) → { ok, xml, report } | { ok:false, error }
 *   - normalizeZones(zones, durationSeconds, opts) → { zones, warnings, errors }
 */
(function(global) {
    "use strict";

    var FRAME_EPS = 1e-6;
    var DEFAULT_MAX_REMOVE_FRACTION = 0.9;

    // ─── DOM helpers (compatibles con browser DOMParser y @xmldom/xmldom) ───

    function childElements(node, name) {
        var out = [];
        if (!node) return out;
        var kids = node.childNodes;
        for (var i = 0; i < kids.length; i++) {
            var k = kids[i];
            if (k.nodeType === 1 && (!name || k.nodeName === name)) out.push(k);
        }
        return out;
    }

    function firstChildElement(node, name) {
        var els = childElements(node, name);
        return els.length > 0 ? els[0] : null;
    }

    function textOf(node) {
        if (!node) return "";
        var s = "";
        var kids = node.childNodes;
        for (var i = 0; i < kids.length; i++) {
            if (kids[i].nodeType === 3 || kids[i].nodeType === 4) s += kids[i].nodeValue;
        }
        return s;
    }

    function setText(doc, node, value) {
        while (node.firstChild) node.removeChild(node.firstChild);
        node.appendChild(doc.createTextNode(String(value)));
    }

    function childText(node, name) {
        return textOf(firstChildElement(node, name));
    }

    function setChildText(doc, node, name, value) {
        var el = firstChildElement(node, name);
        if (!el) {
            el = doc.createElement(name);
            node.appendChild(el);
        }
        setText(doc, el, value);
    }

    function childInt(node, name, def) {
        var t = childText(node, name).replace(/\s+/g, "");
        if (t === "") return def;
        var n = parseInt(t, 10);
        return isNaN(n) ? def : n;
    }

    // ─── Parsing ─────────────────────────────────────────────

    function getParsers(opts) {
        opts = opts || {};
        var P = opts.DOMParser || (typeof DOMParser !== "undefined" ? DOMParser : null);
        var S = opts.XMLSerializer || (typeof XMLSerializer !== "undefined" ? XMLSerializer : null);
        if (!P || !S) throw new Error("DOMParser/XMLSerializer no disponibles");
        return { parser: new P(), serializer: new S() };
    }

    function parseDoc(xmlString, opts) {
        var p = getParsers(opts);
        // Quitar BOM y bytes basura antes de la declaración <?xml — el
        // DOMParser de Chromium es estricto y falla si hay cualquier cosa
        // antes de la declaración (Premiere exporta con BOM UTF-8).
        var clean = String(xmlString).replace(/^[\s\uFEFF\u0000]+/, "");
        var doc;
        try {
            doc = p.parser.parseFromString(clean, "text/xml");
        } catch(eParse) {
            // @xmldom lanza en errores fatales; el DOMParser del browser no
            throw new Error("XML inválido: " + eParse.message +
                " Inicio del archivo: \"" + clean.slice(0, 80) + "\"");
        }
        var root = doc ? doc.documentElement : null;
        if (!root || root.nodeName !== "xmeml") {
            var rootName = root ? root.nodeName : "(sin raíz)";
            var detail = "";
            if (root && (rootName === "parsererror" || rootName === "html")) {
                // Chromium envuelve los errores de parseo en <parsererror>
                try {
                    var errEls = doc.getElementsByTagName("parsererror");
                    if (errEls.length > 0) detail = " Parser: " + String(errEls[0].textContent || "").slice(0, 160);
                } catch(_e) {}
            }
            throw new Error("El archivo no es un XML de Final Cut Pro (xmeml). Raíz: <" + rootName + ">." + detail +
                " Inicio del archivo: \"" + clean.slice(0, 80) + "\"");
        }
        var seq = firstChildElement(root, "sequence");
        if (!seq) {
            // Algunas exportaciones envuelven la secuencia en <project><children>
            var project = firstChildElement(root, "project");
            if (project) {
                var children = firstChildElement(project, "children");
                if (children) seq = firstChildElement(children, "sequence");
            }
        }
        if (!seq) throw new Error("No se encontró la secuencia en el XML.");
        return { doc: doc, seq: seq, serializer: p.serializer };
    }

    function getFps(seq) {
        var rate = firstChildElement(seq, "rate");
        var timebase = rate ? childInt(rate, "timebase", 0) : 0;
        if (!timebase) throw new Error("No se pudo leer el timebase de la secuencia.");
        var ntsc = rate ? childText(rate, "ntsc").replace(/\s+/g, "").toUpperCase() === "TRUE" : false;
        return { fps: ntsc ? timebase * 1000 / 1001 : timebase, timebase: timebase, ntsc: ntsc };
    }

    function getTracks(seq) {
        var media = firstChildElement(seq, "media");
        if (!media) throw new Error("La secuencia no tiene <media>.");
        var tracks = [];
        var video = firstChildElement(media, "video");
        var audio = firstChildElement(media, "audio");
        var vts = video ? childElements(video, "track") : [];
        var ats = audio ? childElements(audio, "track") : [];
        var i;
        for (i = 0; i < vts.length; i++) tracks.push({ type: "video", index: i, el: vts[i] });
        for (i = 0; i < ats.length; i++) tracks.push({ type: "audio", index: i, el: ats[i] });
        return tracks;
    }

    function isClipNode(node) {
        return node.nodeName === "clipitem" || node.nodeName === "generatoritem";
    }

    /**
     * Lee los items de una pista con boundaries efectivos resueltos.
     * start/end = -1 significa que el borde lo define el transitionitem adyacente.
     */
    function readTrackItems(track) {
        var raw = [];
        var kids = track.childNodes;
        for (var i = 0; i < kids.length; i++) {
            var k = kids[i];
            if (k.nodeType !== 1) continue;
            if (isClipNode(k) || k.nodeName === "transitionitem") {
                raw.push({
                    el: k,
                    isTransition: k.nodeName === "transitionitem",
                    start: childInt(k, "start", -1),
                    end: childInt(k, "end", -1)
                });
            }
        }
        // Resolver -1 usando transiciones adyacentes
        for (var j = 0; j < raw.length; j++) {
            var it = raw[j];
            if (it.isTransition) {
                it.effStart = it.start;
                it.effEnd = it.end;
                continue;
            }
            it.effStart = it.start;
            it.effEnd = it.end;
            if (it.start === -1) {
                var prev = raw[j - 1];
                if (prev && prev.isTransition) it.effStart = prev.start;
            }
            if (it.end === -1) {
                var next = raw[j + 1];
                if (next && next.isTransition) it.effEnd = next.end;
            }
        }
        return raw;
    }

    function hasNestedSequence(clipEl) {
        return firstChildElement(clipEl, "sequence") !== null;
    }

    /**
     * Detecta time remapping real (velocidad != 100 o velocidad variable).
     */
    function hasActiveTimeRemap(clipEl) {
        var filters = childElements(clipEl, "filter");
        for (var f = 0; f < filters.length; f++) {
            var effect = firstChildElement(filters[f], "effect");
            if (!effect) continue;
            var effectId = childText(effect, "effectid").replace(/\s+/g, "").toLowerCase();
            if (effectId !== "timeremap") continue;
            var params = childElements(effect, "parameter");
            for (var p = 0; p < params.length; p++) {
                var pid = childText(params[p], "parameterid").replace(/\s+/g, "").toLowerCase();
                if (pid === "speed") {
                    var v = parseFloat(childText(params[p], "value"));
                    if (!isNaN(v) && Math.abs(v - 100) > 0.01) return true;
                } else if (pid === "variablespeed") {
                    var vs = parseFloat(childText(params[p], "value"));
                    if (!isNaN(vs) && vs !== 0) return true;
                }
            }
        }
        return false;
    }

    var STILL_EXT_RE = /\.(png|jpe?g|gif|tiff?|psd|bmp|webp|ai|eps|heic|svg|tga|dpx|exr)$/i;

    /**
     * Detecta clips de imagen fija por la extensión del archivo fuente.
     * Los stills se estiran a cualquier duración sin time remapping, así que
     * el chequeo timeline-vs-source no aplica. Resuelve referencias vacías
     * <file id="X"/> buscando la definición completa en el documento.
     */
    function isStillImageClip(clipEl) {
        var fileEl = firstChildElement(clipEl, "file");
        if (!fileEl) return false;
        var pathurl = childText(fileEl, "pathurl");
        var fname = childText(fileEl, "name");
        if (!pathurl && !fname) {
            // Referencia vacía: buscar la definición por id
            var id = fileEl.getAttribute("id");
            if (id && clipEl.ownerDocument) {
                var all = clipEl.ownerDocument.getElementsByTagName("file");
                for (var i = 0; i < all.length; i++) {
                    if (all[i].getAttribute("id") === id && childElements(all[i]).length > 0) {
                        pathurl = childText(all[i], "pathurl");
                        fname = childText(all[i], "name");
                        break;
                    }
                }
            }
        }
        var ref = (pathurl || fname || "").replace(/\s+$/, "");
        return STILL_EXT_RE.test(ref);
    }

    /**
     * Un clip es "lineal" si su duración en timeline coincide con la de source.
     * Los clips no lineales (speed changes) no se pueden trimear/dividir con
     * aritmética simple de frames.
     */
    function isLinearClip(clipEl, effStart, effEnd) {
        var inF = childInt(clipEl, "in", -1);
        var outF = childInt(clipEl, "out", -1);
        if (inF === -1 || outF === -1) return true; // sin source in/out (p.ej. generators): tratar como lineal
        if (isStillImageClip(clipEl)) return true;  // stills: duración libre sin remap
        if (hasActiveTimeRemap(clipEl)) return false;
        // Tolerancia de 1 frame por redondeos del export
        return Math.abs((effEnd - effStart) - (outF - inF)) <= 1;
    }

    function clipName(clipEl) {
        return childText(clipEl, "name") || clipEl.getAttribute("id") || "(sin nombre)";
    }

    // ─── Definiciones compartidas (file / sequence / multiclip) ───
    //
    // En xmeml la definición completa de <file id="X"> (o <sequence>/<multiclip>)
    // vive solo en la PRIMERA aparición; el resto son referencias vacías
    // <file id="X"/>. Si el corte elimina el clip que contenía la definición,
    // las referencias supervivientes quedarían huérfanas (media offline al
    // importar). Guardamos las definiciones antes de cortar y las restauramos
    // en la primera referencia superviviente si hace falta.

    var DEF_TAGS = ["file", "sequence", "multiclip"];

    function hasElementChildren(el) {
        return childElements(el).length > 0;
    }

    function collectDefinitions(doc) {
        var defs = {};
        for (var d = 0; d < DEF_TAGS.length; d++) {
            var tag = DEF_TAGS[d];
            var all = doc.getElementsByTagName(tag);
            for (var i = 0; i < all.length; i++) {
                var el = all[i];
                var id = el.getAttribute ? el.getAttribute("id") : null;
                if (!id) continue;
                var key = tag + "#" + id;
                if (!defs[key] && hasElementChildren(el)) defs[key] = el.cloneNode(true);
            }
        }
        return defs;
    }

    function restoreLostDefinitions(doc, defs) {
        var restored = 0;
        for (var d = 0; d < DEF_TAGS.length; d++) {
            var tag = DEF_TAGS[d];
            var live = doc.getElementsByTagName(tag);
            var arr = [];
            var i;
            for (i = 0; i < live.length; i++) arr.push(live[i]);
            var hasFull = {};
            var firstRef = {};
            for (i = 0; i < arr.length; i++) {
                var el = arr[i];
                var id = el.getAttribute ? el.getAttribute("id") : null;
                if (!id) continue;
                if (hasElementChildren(el)) hasFull[id] = true;
                else if (!firstRef[id]) firstRef[id] = el;
            }
            for (var lostId in firstRef) {
                if (!firstRef.hasOwnProperty(lostId) || hasFull[lostId]) continue;
                var def = defs[tag + "#" + lostId];
                if (def && firstRef[lostId].parentNode) {
                    firstRef[lostId].parentNode.replaceChild(def.cloneNode(true), firstRef[lostId]);
                    restored++;
                }
            }
        }
        return restored;
    }

    var TICKS_PER_SECOND = 254016000000;

    function computeTicksPerFrame(timebase, ntsc) {
        var base = TICKS_PER_SECOND / timebase;
        return ntsc ? base * 1001 / 1000 : base;
    }

    /**
     * Setea <in>/<out> (frames de source) y mantiene sincronizados los
     * <pproTicksIn>/<pproTicksOut> de Premiere si existen — Premiere puede
     * preferir los ticks al importar, así que no pueden quedar obsoletos.
     */
    function setSourcePoint(doc, clipEl, which, frames, ticksPerFrame) {
        setChildText(doc, clipEl, which, frames);
        var ticksTag = which === "in" ? "pproTicksIn" : "pproTicksOut";
        if (firstChildElement(clipEl, ticksTag)) {
            setChildText(doc, clipEl, ticksTag, Math.round(frames * ticksPerFrame));
        }
    }

    // ─── Normalización y sanidad de zonas ─────────────────────

    function normalizeZones(zones, durationSeconds, opts) {
        opts = opts || {};
        var maxFraction = typeof opts.maxRemoveFraction === "number" ? opts.maxRemoveFraction : DEFAULT_MAX_REMOVE_FRACTION;
        var errors = [];
        var warnings = [];

        if (!zones || zones.length === 0) {
            return { zones: [], warnings: warnings, errors: ["No hay zonas para eliminar."] };
        }

        var clean = [];
        for (var i = 0; i < zones.length; i++) {
            var z = zones[i];
            var s = parseFloat(z.start);
            var e = parseFloat(z.end);
            var label = z.label || ("Zona " + (i + 1));
            if (isNaN(s) || isNaN(e)) {
                errors.push("Zona \"" + label + "\" tiene tiempos inválidos.");
                continue;
            }
            if (e <= s) {
                errors.push("Zona \"" + label + "\" invertida o vacía (" + s.toFixed(2) + "s → " + e.toFixed(2) + "s).");
                continue;
            }
            if (durationSeconds > 0 && s >= durationSeconds) {
                warnings.push("Zona \"" + label + "\" empieza después del final de la secuencia — descartada.");
                continue;
            }
            if (s < 0) {
                warnings.push("Zona \"" + label + "\" empezaba antes de 0 — recortada.");
                s = 0;
            }
            if (durationSeconds > 0 && e > durationSeconds + 0.5) {
                warnings.push("Zona \"" + label + "\" terminaba después del final (" + e.toFixed(2) + "s) — recortada a " + durationSeconds.toFixed(2) + "s.");
                e = durationSeconds;
            }
            clean.push({ start: s, end: e, label: label });
        }

        if (errors.length > 0) return { zones: [], warnings: warnings, errors: errors };
        if (clean.length === 0) return { zones: [], warnings: warnings, errors: ["No quedaron zonas válidas para eliminar."] };

        clean.sort(function(a, b) { return a.start - b.start; });

        // Merge de solapes
        var merged = [clean[0]];
        for (var m = 1; m < clean.length; m++) {
            var last = merged[merged.length - 1];
            if (clean[m].start <= last.end + 0.001) {
                if (clean[m].end > last.end) {
                    warnings.push("Zonas \"" + last.label + "\" y \"" + clean[m].label + "\" se solapaban — fusionadas.");
                    last.end = clean[m].end;
                    last.label = last.label + "+" + clean[m].label;
                }
            } else {
                merged.push(clean[m]);
            }
        }

        var totalRemove = 0;
        for (var t = 0; t < merged.length; t++) totalRemove += merged[t].end - merged[t].start;

        var needsConfirmation = false;
        if (durationSeconds > 0) {
            var fraction = totalRemove / durationSeconds;
            if (fraction >= 0.999) {
                errors.push("Las zonas eliminarían la secuencia completa.");
            } else if (fraction > maxFraction && !opts.allowLargeRemoval) {
                needsConfirmation = true;
                warnings.push("Las zonas eliminan el " + Math.round(fraction * 100) + "% de la secuencia.");
            }
        }

        return { zones: merged, warnings: warnings, errors: errors, needsConfirmation: needsConfirmation, removeFraction: durationSeconds > 0 ? totalRemove / durationSeconds : 0 };
    }

    // ─── Inspección (para preview antes de cortar) ────────────

    function inspect(xmlString, opts) {
        var parsed;
        try {
            parsed = parseDoc(xmlString, opts);
        } catch(e) {
            return { ok: false, error: e.message };
        }
        var seq = parsed.seq;
        var rate;
        try {
            rate = getFps(seq);
        } catch(e2) {
            return { ok: false, error: e2.message };
        }

        var tracks;
        try {
            tracks = getTracks(seq);
        } catch(e3) {
            return { ok: false, error: e3.message };
        }

        var info = {
            ok: true,
            sequenceName: childText(seq, "name"),
            fps: rate.fps,
            timebase: rate.timebase,
            ntsc: rate.ntsc,
            durationFrames: childInt(seq, "duration", 0),
            videoTrackCount: 0,
            audioTrackCount: 0,
            clipCount: 0,
            nestedClips: [],
            remappedClips: []
        };
        info.durationSeconds = info.durationFrames / rate.fps;

        for (var t = 0; t < tracks.length; t++) {
            if (tracks[t].type === "video") info.videoTrackCount++;
            else info.audioTrackCount++;

            var items = readTrackItems(tracks[t].el);
            for (var i = 0; i < items.length; i++) {
                var it = items[i];
                if (it.isTransition) continue;
                info.clipCount++;
                var entry = {
                    name: clipName(it.el),
                    trackType: tracks[t].type,
                    trackIndex: tracks[t].index,
                    startSec: it.effStart >= 0 ? it.effStart / rate.fps : -1,
                    endSec: it.effEnd >= 0 ? it.effEnd / rate.fps : -1
                };
                var nestedSeq = firstChildElement(it.el, "sequence");
                if (nestedSeq) {
                    entry.nestedSeqId = nestedSeq.getAttribute("id") || null;
                    info.nestedClips.push(entry);
                }
                if (!isLinearClip(it.el, it.effStart, it.effEnd)) info.remappedClips.push(entry);
            }
        }

        // Anidaciones únicas (un mismo nest usado N veces cuenta una vez)
        var seenNestIds = {};
        info.nestedSequenceCount = 0;
        for (var nc = 0; nc < info.nestedClips.length; nc++) {
            var nid = info.nestedClips[nc].nestedSeqId || ("__anon" + nc);
            if (!seenNestIds[nid]) {
                seenNestIds[nid] = true;
                info.nestedSequenceCount++;
            }
        }

        return info;
    }

    // ─── Aplicación de cortes ─────────────────────────────────

    /**
     * En clones (segunda mitad de un split), colapsa las definiciones con id
     * (file/sequence/multiclip) a referencias vacías <tag id="X"/> — la
     * definición completa ya existe en la primera mitad, que va antes en el
     * documento. Los <link> se conservan: se reescriben después con los ids
     * de los clones correspondientes (ver rewriteCloneLinks), porque Premiere
     * NO re-vincula A/V automáticamente al importar.
     */
    function sanitizeClone(doc, cloneEl) {
        var collapseTags = { file: true, sequence: true, multiclip: true };
        var kids = childElements(cloneEl);
        for (var i = 0; i < kids.length; i++) {
            var k = kids[i];
            if (collapseTags[k.nodeName]) {
                var id = k.getAttribute("id");
                if (id) {
                    var ref = doc.createElement(k.nodeName);
                    ref.setAttribute("id", id);
                    cloneEl.replaceChild(ref, k);
                }
            }
        }
    }

    /**
     * Reescribe los <link> de los clones de una zona: cada linkclipref que
     * apunte a un clip que también se dividió en esta zona pasa a apuntar a
     * su clon. Links a clips que NO se dividieron se eliminan del clon (ese
     * clip sigue vinculado a la primera mitad; duplicar el link corrompería
     * el grupo de sync).
     */
    function rewriteCloneLinks(doc, zoneClones, cloneIdMap) {
        for (var c = 0; c < zoneClones.length; c++) {
            var cloneEl = zoneClones[c];
            var links = childElements(cloneEl, "link");
            for (var li = 0; li < links.length; li++) {
                var refEl = firstChildElement(links[li], "linkclipref");
                var refId = refEl ? textOf(refEl).replace(/\s+/g, "") : "";
                if (refId && cloneIdMap[refId]) {
                    setText(doc, refEl, cloneIdMap[refId]);
                } else {
                    cloneEl.removeChild(links[li]);
                }
            }
        }
    }

    var _splitCounter = 0;

    function makeSplitId(originalId) {
        _splitCounter++;
        return (originalId || "clipitem") + "-ca2s" + _splitCounter;
    }

    function applyCuts(xmlString, removeZones, opts) {
        opts = opts || {};
        var parsed;
        try {
            parsed = parseDoc(xmlString, opts);
        } catch(e) {
            return { ok: false, error: e.message };
        }
        var doc = parsed.doc;
        var seq = parsed.seq;

        var rate;
        try {
            rate = getFps(seq);
        } catch(eRate) {
            return { ok: false, error: eRate.message };
        }
        var fps = rate.fps;
        var ticksPerFrame = computeTicksPerFrame(rate.timebase, rate.ntsc);

        var durationFrames = childInt(seq, "duration", 0);
        var durationSeconds = durationFrames / fps;

        var norm = normalizeZones(removeZones, durationSeconds, opts);
        if (norm.errors.length > 0) {
            return { ok: false, error: norm.errors.join(" "), warnings: norm.warnings };
        }
        if (norm.needsConfirmation && !opts.allowLargeRemoval) {
            return {
                ok: false,
                needsConfirmation: true,
                error: "Las zonas eliminan el " + Math.round(norm.removeFraction * 100) + "% de la secuencia. Confirma para continuar.",
                warnings: norm.warnings
            };
        }

        // Segundos → frames. Política conservadora: el inicio de la zona se
        // redondea hacia arriba y el fin hacia abajo — ante ambigüedad se
        // conserva un frame extra de contenido, nunca se pierde.
        var zonesF = [];
        for (var zi = 0; zi < norm.zones.length; zi++) {
            var zf = {
                start: Math.ceil(norm.zones[zi].start * fps - FRAME_EPS),
                end: Math.floor(norm.zones[zi].end * fps + FRAME_EPS),
                label: norm.zones[zi].label
            };
            if (zf.start < 0) zf.start = 0;
            if (zf.end > zf.start) zonesF.push(zf);
        }
        if (zonesF.length === 0) {
            return { ok: false, error: "Las zonas son menores a un frame — nada que cortar.", warnings: norm.warnings };
        }

        var tracks;
        try {
            tracks = getTracks(seq);
        } catch(eTracks) {
            return { ok: false, error: eTracks.message, warnings: norm.warnings };
        }

        var report = {
            fps: fps,
            zoneCount: zonesF.length,
            framesRemoved: 0,
            deletedClips: 0,
            trimmedClips: 0,
            splitClips: 0,
            shiftedClips: 0,
            deletedTransitions: 0,
            deletedMarkers: 0,
            shiftedMarkers: 0,
            nestedClipCount: 0,
            warnings: norm.warnings.slice()
        };

        // Pre-chequeo: clips no lineales que las zonas obligarían a trim/split
        var remapBlockers = [];
        var t, i;
        for (t = 0; t < tracks.length; t++) {
            var preItems = readTrackItems(tracks[t].el);
            for (i = 0; i < preItems.length; i++) {
                var pit = preItems[i];
                if (pit.isTransition) continue;
                if (hasNestedSequence(pit.el)) report.nestedClipCount++;
                if (isLinearClip(pit.el, pit.effStart, pit.effEnd)) continue;
                for (var zc = 0; zc < zonesF.length; zc++) {
                    var zz = zonesF[zc];
                    var overlaps = pit.effStart < zz.end && pit.effEnd > zz.start;
                    var fullyInside = pit.effStart >= zz.start && pit.effEnd <= zz.end;
                    if (overlaps && !fullyInside) {
                        remapBlockers.push(clipName(pit.el) + " (" + tracks[t].type + " " + (tracks[t].index + 1) + ")");
                        break;
                    }
                }
            }
        }
        if (remapBlockers.length > 0) {
            return {
                ok: false,
                error: "Clips con velocidad modificada (time remapping) caen sobre un borde de corte y no se pueden dividir con precisión: " +
                    remapBlockers.join(", ") + ". Ajusta los marcadores para no cortar dentro de esos clips.",
                warnings: report.warnings
            };
        }

        // Snapshot de definiciones file/sequence/multiclip: si el corte elimina
        // el clip que contenía la definición completa, se restaura después en
        // la primera referencia superviviente.
        var savedDefs = collectDefinitions(doc);

        // Procesar zonas de FIN a INICIO para que los shifts no afecten zonas anteriores
        for (var z = zonesF.length - 1; z >= 0; z--) {
            var zone = zonesF[z];
            var L = zone.end - zone.start;
            report.framesRemoved += L;

            // Clones creados por splits en esta zona (todas las pistas se
            // dividen en el mismo frame): id original → id del clon, para
            // reescribir los <link> entre clones.
            var zoneClones = [];
            var cloneIdMap = {};

            for (t = 0; t < tracks.length; t++) {
                var trackEl = tracks[t].el;
                var items = readTrackItems(trackEl);

                // 1) Transiciones que tocan la zona: materializar bordes vecinos
                //    en el punto de edición central (evita clips solapados al
                //    eliminar la transición) y borrar el transitionitem.
                for (i = 0; i < items.length; i++) {
                    var tr = items[i];
                    if (!tr.isTransition) continue;
                    if (tr.effEnd <= zone.start || tr.effStart >= zone.end) continue;

                    var center = Math.round((tr.start + tr.end) / 2);
                    var prevIt = items[i - 1];
                    var nextIt = items[i + 1];
                    if (prevIt && !prevIt.isTransition && prevIt.end === -1) {
                        var prevDelta = prevIt.effEnd - center;
                        setChildText(doc, prevIt.el, "end", center);
                        var prevOut = childInt(prevIt.el, "out", -1);
                        if (prevOut !== -1) setSourcePoint(doc, prevIt.el, "out", prevOut - prevDelta, ticksPerFrame);
                        prevIt.end = center;
                    }
                    if (nextIt && !nextIt.isTransition && nextIt.start === -1) {
                        var nextDelta = center - nextIt.effStart;
                        setChildText(doc, nextIt.el, "start", center);
                        var nextIn = childInt(nextIt.el, "in", -1);
                        if (nextIn !== -1) setSourcePoint(doc, nextIt.el, "in", nextIn + nextDelta, ticksPerFrame);
                        nextIt.start = center;
                    }
                    trackEl.removeChild(tr.el);
                    report.deletedTransitions++;
                }

                // Releer tras posibles cambios
                items = readTrackItems(trackEl);

                // 2) Clips
                for (i = 0; i < items.length; i++) {
                    var it = items[i];
                    if (it.isTransition) {
                        // Transición posterior a la zona: shift
                        if (it.effStart >= zone.end) {
                            setChildText(doc, it.el, "start", it.start - L);
                            setChildText(doc, it.el, "end", it.end - L);
                        }
                        continue;
                    }

                    var S = it.effStart;
                    var E = it.effEnd;
                    if (S < 0 || E < 0) continue; // sin geometría resoluble — no tocar

                    var inF = childInt(it.el, "in", -1);
                    var outF = childInt(it.el, "out", -1);

                    // Stills estirados (duración timeline != source): no tocar
                    // in/out — no mapean 1:1 al timeline y Premiere los ignora
                    var freezeSource = inF !== -1 && outF !== -1 &&
                        Math.abs((E - S) - (outF - inF)) > 1 && isStillImageClip(it.el);

                    if (E <= zone.start) continue; // antes de la zona

                    if (S >= zone.end) {
                        // Después de la zona: shift a la izquierda
                        if (it.start !== -1) setChildText(doc, it.el, "start", it.start - L);
                        if (it.end !== -1) setChildText(doc, it.el, "end", it.end - L);
                        report.shiftedClips++;
                        continue;
                    }

                    if (S >= zone.start && E <= zone.end) {
                        // Completamente dentro: eliminar
                        trackEl.removeChild(it.el);
                        report.deletedClips++;
                        continue;
                    }

                    if (S < zone.start && E > zone.end) {
                        // El clip abarca la zona: dividir en dos
                        var cloneEl = it.el.cloneNode(true);
                        var cloneId = makeSplitId(it.el.getAttribute("id"));
                        cloneEl.setAttribute("id", cloneId);
                        sanitizeClone(doc, cloneEl);
                        var origId = it.el.getAttribute("id");
                        if (origId) cloneIdMap[origId] = cloneId;
                        zoneClones.push(cloneEl);

                        // Primera mitad (nodo original): termina en zone.start
                        setChildText(doc, it.el, "start", S);
                        setChildText(doc, it.el, "end", zone.start);
                        if (!freezeSource && outF !== -1 && inF !== -1) setSourcePoint(doc, it.el, "out", inF + (zone.start - S), ticksPerFrame);

                        // Segunda mitad (clon): empieza donde quedó el join
                        setChildText(doc, cloneEl, "start", zone.start);
                        setChildText(doc, cloneEl, "end", E - L);
                        if (!freezeSource && inF !== -1) setSourcePoint(doc, cloneEl, "in", inF + (zone.end - S), ticksPerFrame);
                        if (!freezeSource && outF !== -1) setSourcePoint(doc, cloneEl, "out", outF, ticksPerFrame);

                        if (it.el.nextSibling) trackEl.insertBefore(cloneEl, it.el.nextSibling);
                        else trackEl.appendChild(cloneEl);
                        report.splitClips++;
                        continue;
                    }

                    if (S < zone.start) {
                        // Solo la cola cae en la zona: trim del final
                        setChildText(doc, it.el, "start", S);
                        setChildText(doc, it.el, "end", zone.start);
                        if (!freezeSource && outF !== -1 && inF !== -1) setSourcePoint(doc, it.el, "out", inF + (zone.start - S), ticksPerFrame);
                        report.trimmedClips++;
                    } else {
                        // Solo la cabeza cae en la zona: trim del inicio + shift
                        setChildText(doc, it.el, "start", zone.start);
                        setChildText(doc, it.el, "end", E - L);
                        if (!freezeSource && inF !== -1) setSourcePoint(doc, it.el, "in", inF + (zone.end - S), ticksPerFrame);
                        report.trimmedClips++;
                    }
                }
            }

            // Reescribir los <link> entre los clones creados en esta zona
            rewriteCloneLinks(doc, zoneClones, cloneIdMap);

            // 3) Marcadores de secuencia
            var seqMarkers = childElements(seq, "marker");
            for (var mk = 0; mk < seqMarkers.length; mk++) {
                var mEl = seqMarkers[mk];
                var mIn = childInt(mEl, "in", -1);
                if (mIn < 0) continue;
                var mOut = childInt(mEl, "out", -1);
                if (mIn >= zone.start && mIn < zone.end) {
                    seq.removeChild(mEl);
                    report.deletedMarkers++;
                } else if (mIn >= zone.end) {
                    setChildText(doc, mEl, "in", mIn - L);
                    if (mOut >= zone.end) setChildText(doc, mEl, "out", mOut - L);
                    report.shiftedMarkers++;
                } else if (mOut >= 0) {
                    // Marcador de rango que empieza antes de la zona: ajustar su out
                    if (mOut >= zone.end) setChildText(doc, mEl, "out", mOut - L);
                    else if (mOut > zone.start) setChildText(doc, mEl, "out", zone.start);
                }
            }
        }

        // Restaurar definiciones file/sequence/multiclip cuya copia completa
        // fue eliminada junto con su clip pero que aún tienen referencias vivas
        var restoredDefs = restoreLostDefinitions(doc, savedDefs);
        if (restoredDefs > 0) report.restoredDefinitions = restoredDefs;

        // Limpiar <link> que apunten a clips eliminados y recomputar duración
        var validIds = {};
        var maxEnd = 0;
        for (t = 0; t < tracks.length; t++) {
            var finalItems = readTrackItems(tracks[t].el);
            for (i = 0; i < finalItems.length; i++) {
                var fit = finalItems[i];
                if (fit.isTransition) continue;
                var fid = fit.el.getAttribute("id");
                if (fid) validIds[fid] = true;
                if (fit.effEnd > maxEnd) maxEnd = fit.effEnd;
            }
        }
        for (t = 0; t < tracks.length; t++) {
            var linkItems = readTrackItems(tracks[t].el);
            for (i = 0; i < linkItems.length; i++) {
                if (linkItems[i].isTransition) continue;
                var links = childElements(linkItems[i].el, "link");
                for (var li = 0; li < links.length; li++) {
                    var refId = childText(links[li], "linkclipref").replace(/\s+/g, "");
                    if (refId && !validIds[refId]) {
                        linkItems[i].el.removeChild(links[li]);
                    }
                }
            }
        }

        setChildText(doc, seq, "duration", maxEnd);
        report.newDurationFrames = maxEnd;
        report.newDurationSeconds = maxEnd / fps;

        // Renombrar la secuencia resultante
        if (opts.newName) {
            setChildText(doc, seq, "name", opts.newName);
        }

        var xmlOut;
        try {
            xmlOut = parsed.serializer.serializeToString(doc);
        } catch(eSer) {
            return { ok: false, error: "Error al serializar XML: " + eSer.message, warnings: report.warnings };
        }
        if (xmlOut.indexOf("<?xml") !== 0) {
            xmlOut = '<?xml version="1.0" encoding="UTF-8"?>\n' + xmlOut;
        }

        return { ok: true, xml: xmlOut, report: report };
    }

    var EPXmlCutEngine = {
        inspect: inspect,
        applyCuts: applyCuts,
        normalizeZones: normalizeZones
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = EPXmlCutEngine;
    }
    if (global) {
        global.EPXmlCutEngine = EPXmlCutEngine;
    }

})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : null));
