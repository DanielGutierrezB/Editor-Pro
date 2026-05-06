/**
 * host/supertexts.jsx — MOGRT insertion: insertSupertextMOGRTs, replaceMOGRTClip, helpers
 * Loaded via #include from host/index.jsx
 */

function validateMOGRT(mogrtPath) {
    try {
        var f = new File(mogrtPath);
        if (!f.exists) return JSON.stringify({ error: "Archivo no encontrado: " + mogrtPath });
        var ext = mogrtPath.replace(/.*\./, "").toLowerCase();
        if (ext !== "mogrt") return JSON.stringify({ error: "El archivo no es un .mogrt" });
        return JSON.stringify({ success: true, path: f.fsName, size: f.length });
    } catch(e) {
        return JSON.stringify({ error: "Error validando MOGRT: " + e.message });
    }
}

function getAvailableVideoTrackCount() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });
        return JSON.stringify({ success: true, count: seq.videoTracks.numTracks });
    } catch(e) {
        return JSON.stringify({ error: e.message });
    }
}

function selectMOGRTFile() {
    try {
        var f = File.openDialog("Seleccionar plantilla MOGRT", "MOGRT:*.mogrt");
        if (!f) return JSON.stringify({ cancelled: true });
        return JSON.stringify({ success: true, path: f.fsName });
    } catch(e) {
        return JSON.stringify({ error: "Error al abrir diálogo: " + e.message });
    }
}

function findAndOpenSequenceByName(name) {
    try {
        var targetSeq = null;
        for (var i = 0; i < app.project.sequences.numSequences; i++) {
            if (app.project.sequences[i].name === name) {
                targetSeq = app.project.sequences[i];
                break;
            }
        }
        if (!targetSeq) return JSON.stringify({ error: "Secuencia no encontrada: " + name });

        app.project.openSequence(targetSeq.sequenceID);
        $.sleep(500);

        var activeSeq = app.project.activeSequence;
        var retries = 0;
        while ((!activeSeq || activeSeq.sequenceID !== targetSeq.sequenceID) && retries < 10) {
            $.sleep(300);
            activeSeq = app.project.activeSequence;
            retries++;
        }

        return JSON.stringify({
            success: true,
            name: targetSeq.name,
            sequenceID: targetSeq.sequenceID
        });
    } catch(e) {
        return JSON.stringify({ error: "Error: " + e.message });
    }
}

function selectFolder() {
    try {
        var folder = Folder.selectDialog("Seleccionar carpeta con archivos MOGRT");
        if (!folder) return JSON.stringify({ cancelled: true });
        return JSON.stringify({ success: true, path: folder.fsName });
    } catch(e) {
        return JSON.stringify({ error: "Error al abrir diálogo: " + e.message });
    }
}

/**
 * Convierte "\\n" literal (dos caracteres) en saltos reales y unifica a \\r,
 * que es lo que suelen respetar los controles de texto de MOGRT / AE en Premiere.
 */
function _normalizeMogrtNewlines(s) {
    if (s === undefined || s === null) return "";
    var t = String(s);
    t = t.replace(/\\r\\n/g, "\n");
    t = t.replace(/\\n/g, "\n");
    t = t.replace(/\\r/g, "\n");
    t = t.replace(/\r\n/g, "\n");
    t = t.replace(/\r/g, "\n");
    t = t.replace(/\n/g, "\r");
    return t;
}

function _mogrtOneLineName(s) {
    if (s === undefined || s === null) return "";
    var t = String(s);
    t = t.replace(/\\r\\n/g, " ");
    t = t.replace(/\\n/g, " ");
    t = t.replace(/\\r/g, " ");
    t = t.replace(/[\r\n]+/g, " ");
    return t;
}

/**
 * Añade "Cross Dissolve" al FINAL del clip MOGRT.
 * Usa QE DOM. Falla silenciosamente.
 *
 * addTransition(transition, atStart, duration):
 *   atStart = false → al FINAL del clip;  atStart = true → al inicio.
 */
function _addOutDissolve(seq, trackIdx, startSecs, durFrames) {
    try {
        app.enableQE();
        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) return;
        var qeTrack = qeSeq.getVideoTrackAt(trackIdx);
        if (!qeTrack) return;

        var numItems = qeTrack.numItems;
        for (var qi = numItems - 1; qi >= 0; qi--) {
            var qeClip = qeTrack.getItemAt(qi);
            if (!qeClip) continue;
            var qeStart;
            try { qeStart = parseFloat(qeClip.start.secs); } catch(_e) {
                try { qeStart = parseFloat(qeClip.start); } catch(_e2) { continue; }
            }
            if (Math.abs(qeStart - startSecs) < 1.5) {
                var dip = qe.project.getVideoTransitionByName("Cross Dissolve");
                if (!dip) dip = qe.project.getVideoTransitionByName("Disolución cruzada");
                if (!dip) dip = qe.project.getVideoTransitionByName("Dip to Black");
                if (!dip) return;

                var df = durFrames || 20;
                var durTC = "00;00;00;" + (df < 10 ? "0" + df : String(df));
                // false = end of clip
                qeClip.addTransition(dip, false, durTC);
                return;
            }
        }
    } catch(_eDissolve) {}
}

/**
 * Fija el fin de un clip MOGRT buscándolo en track.clips[] por startTime.
 * El objeto devuelto por importMGT() NO permite fijar .end en MOGRTs;
 * hay que localizarlo en la pista (igual que Motion-Pro lo hace con éxito).
 *
 * @param {Sequence} seq
 * @param {number}   trackIdx    — índice de la pista de vídeo
 * @param {number}   startSecs   — segundo de inicio del clip en la secuencia
 * @param {number}   endSecs     — segundo de fin deseado (absoluto)
 * @returns {boolean} true si el end cambió
 */
function _setMogrtClipEnd(seq, trackIdx, startSecs, endSecs) {
    var track = seq.videoTracks[trackIdx];
    if (!track) return false;
    var endTicks = String(Math.round(endSecs * TICKS_PER_SECOND));

    for (var ci = track.clips.numItems - 1; ci >= 0; ci--) {
        var tc = track.clips[ci];
        var tcStart;
        try { tcStart = parseFloat(tc.start.seconds); } catch (_e) { continue; }
        if (Math.abs(tcStart - startSecs) < 1.0) {
            // Intento A: ticks string (funciona para clips regulares y Motion-Pro)
            try { tc.end = endTicks; } catch (_ea) {}
            $.sleep(100);
            // Verificar
            try {
                var after = parseFloat(tc.end.seconds);
                if (Math.abs(after - endSecs) < 1.5) return true;
            } catch (_ev) {}
            // Intento B: .end.ticks directo
            try { tc.end.ticks = endTicks; } catch (_eb) {}
            $.sleep(100);
            try {
                var after2 = parseFloat(tc.end.seconds);
                if (Math.abs(after2 - endSecs) < 1.5) return true;
            } catch (_ev2) {}
            // Intento C: segundos
            try { tc.end = endSecs; } catch (_ec) {}
            return true;
        }
    }
    return false;
}

function _trySetTextValue(param, newText) {
    // Strategy 1: parse as JSON, modify textEditValue + fontTextRunLength + strDB
    // fontTextRunLength MUST match the new text length; if it stays at the old
    // default (e.g. 29 chars) AE will only style/animate that many characters,
    // causing words beyond that limit to render with wrong position/size.
    try {
        var raw = param.getValue();
        if (typeof raw === "object" || (typeof raw === "string" && raw.charAt(0) === "{")) {
            var obj = (typeof raw === "string") ? JSON.parse(raw) : raw;
            var newLen = newText.length;

            obj.textEditValue = newText;

            // Update font run lengths to cover the entire new text
            if (obj.fontTextRunLength && obj.fontTextRunLength.length) {
                if (obj.fontTextRunLength.length === 1) {
                    obj.fontTextRunLength = [newLen];
                } else {
                    obj.fontTextRunLength = [newLen];
                    obj.capPropTextRunCount = 1;
                }
            }

            // Sync all font arrays to single run covering full text
            if (obj.fontEditValue && obj.fontEditValue.length > 1) {
                obj.fontEditValue = [obj.fontEditValue[0]];
            }
            if (obj.fontSizeEditValue && obj.fontSizeEditValue.length > 1) {
                obj.fontSizeEditValue = [obj.fontSizeEditValue[0]];
            }
            if (obj.fontFSBoldValue && obj.fontFSBoldValue.length > 1) {
                obj.fontFSBoldValue = [obj.fontFSBoldValue[0]];
            }
            if (obj.fontFSItalicValue && obj.fontFSItalicValue.length > 1) {
                obj.fontFSItalicValue = [obj.fontFSItalicValue[0]];
            }
            if (obj.fontFSAllCapsValue && obj.fontFSAllCapsValue.length > 1) {
                obj.fontFSAllCapsValue = [obj.fontFSAllCapsValue[0]];
            }
            if (obj.fontFSSmallCapsValue && obj.fontFSSmallCapsValue.length > 1) {
                obj.fontFSSmallCapsValue = [obj.fontFSSmallCapsValue[0]];
            }

            // strDB variants
            if (obj.value && obj.value.strDB && obj.value.strDB.length) {
                var si;
                for (si = 0; si < obj.value.strDB.length; si++) {
                    if (obj.value.strDB[si]) obj.value.strDB[si].str = newText;
                }
            }
            if (obj.strDB && obj.strDB.length) {
                var sj;
                for (sj = 0; sj < obj.strDB.length; sj++) {
                    if (obj.strDB[sj]) obj.strDB[sj].str = newText;
                }
            }

            param.setValue(JSON.stringify(obj), true);
            return true;
        }
    } catch(e1) {}

    // Strategy 2: set as plain string with updateUI flag
    try { param.setValue(newText, true); return true; } catch(e2) {}

    // Strategy 3: set as plain string without flag
    try { param.setValue(newText); return true; } catch(e3) {}

    return false;
}

function _setMGTText(trackItem, newText, itemIdx, errors) {
    newText = _normalizeMogrtNewlines(newText);

    // Helper: check if a property name looks like an editable text field
    function _isTextProp(displayName) {
        var dl = displayName.toLowerCase();
        return (dl.indexOf("text") !== -1) ||
               (dl.indexOf("texto") !== -1) ||
               (dl.indexOf("titulo") !== -1) ||
               (dl.indexOf("título") !== -1) ||
               (dl.indexOf("bullet") !== -1) ||
               (dl.indexOf("pregunta") !== -1) ||
               (dl.indexOf("definic") !== -1) ||
               (dl.indexOf("source") !== -1) ||
               (dl.indexOf("fuente") !== -1) ||
               (dl.indexOf("origen") !== -1);
    }

    // Helper: recursively search properties (handles Groups that contain text fields)
    function _findAndSetText(propsContainer, depth) {
        if (depth > 5) return false; // prevent infinite recursion
        if (!propsContainer || !propsContainer.numItems) return false;

        // Pass 1: look for text-like named properties
        for (var p = 0; p < propsContainer.numItems; p++) {
            var prop;
            try { prop = propsContainer[p]; } catch(e) { continue; }
            if (!prop) continue;
            var dn = "";
            try { dn = prop.displayName || ""; } catch(e) {}

            if (_isTextProp(dn)) {
                if (_trySetTextValue(prop, newText)) return true;
                // If it's a group, recurse into it
                try {
                    if (prop.properties && prop.properties.numItems > 0) {
                        if (_findAndSetText(prop.properties, depth + 1)) return true;
                    }
                } catch(eg) {}
            }
        }

        // Pass 2: recurse into all groups
        for (var g = 0; g < propsContainer.numItems; g++) {
            var gProp;
            try { gProp = propsContainer[g]; } catch(e) { continue; }
            if (!gProp) continue;
            try {
                if (gProp.properties && gProp.properties.numItems > 0) {
                    if (_findAndSetText(gProp.properties, depth + 1)) return true;
                }
            } catch(eg) {}
        }

        // Pass 3: try every property as last resort
        for (var p2 = 0; p2 < propsContainer.numItems; p2++) {
            var prop2;
            try { prop2 = propsContainer[p2]; } catch(e) { continue; }
            if (!prop2) continue;
            if (_trySetTextValue(prop2, newText)) return true;
        }

        return false;
    }

    // --- Approach A: getMGTComponent (preferred, returns Essential Properties) ---
    try {
        if (typeof trackItem.getMGTComponent === "function") {
            var moComp = trackItem.getMGTComponent();
            if (moComp && moComp.properties && moComp.properties.numItems > 0) {
                if (_findAndSetText(moComp.properties, 0)) return true;
                errors.push("Item " + itemIdx + ": getMGTComponent tiene " + moComp.properties.numItems + " props pero ninguna aceptó texto");
            }
        }
    } catch(eMGT) {
        errors.push("Item " + itemIdx + ": getMGTComponent error — " + eMGT.message);
    }

    // --- Approach B: iterate trackItem.components looking for text components ---
    try {
        var numComps = trackItem.components.numItems;
        for (var c = 0; c < numComps; c++) {
            var comp;
            try { comp = trackItem.components[c]; } catch(ec) { continue; }
            if (comp && comp.properties && comp.properties.numItems > 0) {
                if (_findAndSetText(comp.properties, 0)) return true;
            }
        }
    } catch(eComp) {
        errors.push("Item " + itemIdx + ": components fallback error — " + eComp.message);
    }

    errors.push("Item " + itemIdx + ": no se encontró parámetro de texto en ninguna vía");
    return false;
}

function _setClipPositionY(trackItem, offsetPx, errors, idx) {
    if (offsetPx === 0) return;
    try {
        for (var c = 0; c < trackItem.components.numItems; c++) {
            var comp;
            try { comp = trackItem.components[c]; } catch(ec) { continue; }
            var mn = "";
            try { mn = comp.matchName || ""; } catch(em) {}
            var dn = "";
            try { dn = comp.displayName || ""; } catch(ed) {}
            if (mn === "AE.ADBE Motion" || dn === "Motion" || dn === "Movimiento") {
                var posProp = null;
                for (var pp = 0; pp < comp.properties.numItems; pp++) {
                    var pr;
                    try { pr = comp.properties[pp]; } catch(ep) { continue; }
                    var pdn = "";
                    try { pdn = pr.displayName || ""; } catch(epd) {}
                    if (pdn === "Position" || pdn === "Posición" || pdn === "Posicion") {
                        posProp = pr;
                        break;
                    }
                }
                if (posProp) {
                    var pos = posProp.getValue();
                    var seqHeight = 1080;
                    try { seqHeight = app.project.activeSequence.frameSizeVertical || 1080; } catch(eh) {}
                    pos[1] = pos[1] + (offsetPx / seqHeight);
                    posProp.setValue(pos, true);
                }
                break;
            }
        }
    } catch(ePos) {
        if (errors) errors.push("Item " + idx + ": error ajustando posición Y — " + ePos.message);
    }
}

function insertSupertextMOGRTs(jsonPath) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        var f = new File(jsonPath);
        if (!f.exists) return JSON.stringify({ error: "Archivo JSON no encontrado: " + jsonPath });
        f.encoding = "UTF-8";
        f.open("r");
        var content = f.read();
        f.close();

        var data = JSON.parse(content);
        var baseTrackIndex = data.baseTrackIndex;
        var items = data.supertexts;

        if (!items || items.length === 0) return JSON.stringify({ error: "No hay supertextos para insertar." });

        // Calculate max bullet offset to know how many tracks we need
        var maxOffset = 0;
        for (var m = 0; m < items.length; m++) {
            var off = parseInt(items[m].bulletTrackOffset) || 0;
            if (off > maxOffset) maxOffset = off;
        }
        var tracksNeeded = 1 + maxOffset;

        if (baseTrackIndex === -1) {
            var beforeCount = seq.videoTracks.numTracks;
            try {
                app.enableQE();
                var qeSeq = qe.project.getActiveSequence();
                qeSeq.addTracks(tracksNeeded, beforeCount, 0);
                $.sleep(500);
            } catch(eQE) {}
            var afterCount = seq.videoTracks.numTracks;
            if (afterCount > beforeCount) {
                baseTrackIndex = afterCount - tracksNeeded;
            } else {
                baseTrackIndex = beforeCount;
            }
        }

        var inserted = 0;
        var textSet = 0;
        var errors = [];

        for (var i = 0; i < items.length; i++) {
            try {
                var st = items[i];
                var startSecs = parseFloat(st.time);
                var endSecs = parseFloat(st.endTime);
                if (isNaN(startSecs)) { errors.push("Item " + i + ": tiempo inválido"); continue; }
                if (isNaN(endSecs)) endSecs = startSecs + 5;

                var itemMogrtPath = st.mogrtPath;
                if (!itemMogrtPath) { errors.push("Item " + i + ": sin mogrtPath"); continue; }
                var itemMogrtFile = new File(itemMogrtPath);
                if (!itemMogrtFile.exists) { errors.push("Item " + i + ": MOGRT no encontrado — " + itemMogrtPath); continue; }

                var bulletOff = parseInt(st.bulletTrackOffset) || 0;
                var targetTrack = baseTrackIndex + bulletOff;

                var timeTicks = String(Math.round(startSecs * TICKS_PER_SECOND));
                var trackItem = seq.importMGT(itemMogrtFile.fsName, timeTicks, targetTrack, 0);

                if (!trackItem) {
                    errors.push("Item " + i + ": importMGT retornó null");
                    continue;
                }

                inserted++;

                // El MOGRT necesita tiempo para inicializar su Dynamic Link con AE
                $.sleep(1000);

                // 1. Texto — primero para no perder la referencia
                var didSetText = _setMGTText(trackItem, st.text, i, errors);
                if (didSetText) textSet++;
                $.sleep(200);

                // 2. Duración: buscar el clip en la pista y fijar .end ahí
                //    (importMGT devuelve un objeto que NO permite fijar .end en MOGRTs)
                try {
                    var duration = endSecs - startSecs;
                    if (duration > 0.01) {
                        if (!_setMogrtClipEnd(seq, targetTrack, startSecs, endSecs)) {
                            errors.push("Item " + i + ": no se pudo fijar duración (" + duration.toFixed(1) + "s) en pista " + targetTrack);
                        }
                    }
                } catch(eDur) {
                    errors.push("Item " + i + ": excepción ajustando duración — " + eDur.message);
                }

                // 3. Nombre legible en timeline + color label por tipo
                var typeTag = (st.type || "").toUpperCase();
                try { trackItem.name = "[" + typeTag + "] " + _mogrtOneLineName(st.text); } catch(eName) {}

                // Label colors (Premiere 0-15): high contrast between types
                var TYPE_COLORS = {
                    title:      6,   // Amarillo
                    bullet:     4,   // Cyan
                    definition: 9,   // Naranja
                    highlight:  7,   // Morado
                    question:   3    // Verde
                };
                var labelColor = TYPE_COLORS[st.type] !== undefined ? TYPE_COLORS[st.type] : 0;
                try { trackItem.setColorLabel(labelColor); } catch(eLabel) {}

                // 4. Disolvencia de salida — DESACTIVADA (los MOGRTs manejan su propia animación)
                // _addOutDissolve(seq, targetTrack, startSecs, 20);

                // 5. Bullet Y position offset
                var bulletPosY = parseFloat(st.bulletPositionY) || 0;
                if (bulletPosY !== 0) {
                    _setClipPositionY(trackItem, bulletPosY, errors, i);
                }

            } catch(eItem) {
                errors.push("Item " + i + ": " + eItem.message);
            }
        }

        return JSON.stringify({
            success: true,
            inserted: inserted,
            textSet: textSet,
            total: items.length,
            baseTrackIndex: baseTrackIndex,
            errors: errors
        });
    } catch(e) {
        return JSON.stringify({ error: "Error en insertSupertextMOGRTs: " + e.message });
    }
}

function replaceMOGRTClip(jsonPath) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        var f = new File(jsonPath);
        if (!f.exists) return JSON.stringify({ error: "Archivo JSON no encontrado." });
        f.encoding = "UTF-8";
        f.open("r");
        var content = f.read();
        f.close();

        var data = JSON.parse(content);
        var targetTime = parseFloat(data.time);
        var endTime = parseFloat(data.endTime);
        var mogrtPath = data.mogrtPath;
        var trackIndex = data.trackIndex;

        if (isNaN(targetTime)) return JSON.stringify({ error: "Tiempo inválido." });
        if (!mogrtPath) return JSON.stringify({ error: "Sin mogrtPath." });

        var mogrtFile = new File(mogrtPath);
        if (!mogrtFile.exists) return JSON.stringify({ error: "MOGRT no encontrado: " + mogrtPath });

        // Find and remove existing clip near targetTime
        if (trackIndex === -1) trackIndex = seq.videoTracks.numTracks - 1;
        var tolerance = 0.5;
        var removed = false;

        for (var t = 0; t < seq.videoTracks.numTracks; t++) {
            var track = seq.videoTracks[t];
            try {
                for (var c = track.clips.numItems - 1; c >= 0; c--) {
                    var clip = track.clips[c];
                    var clipStart = clip.start.seconds;
                    if (Math.abs(clipStart - targetTime) < tolerance) {
                        trackIndex = t;
                        clip.remove(true, true);
                        removed = true;
                        break;
                    }
                }
            } catch(eT) {}
            if (removed) break;
        }

        $.sleep(300);

        // Insert new MOGRT
        var timeTicks = String(Math.round(targetTime * TICKS_PER_SECOND));
        var trackItem = seq.importMGT(mogrtFile.fsName, timeTicks, trackIndex, 0);
        if (!trackItem) return JSON.stringify({ error: "importMGT retornó null." });

        $.sleep(1000);

        var errors = [];
        _setMGTText(trackItem, data.text, 0, errors);
        $.sleep(200);

        try {
            if (!isNaN(endTime)) {
                var durRep = endTime - targetTime;
                if (durRep > 0.01) {
                    if (!_setMogrtClipEnd(seq, trackIndex, targetTime, endTime)) {
                        errors.push("No se pudo fijar fin de clip (reemplazo, dur " + durRep.toFixed(1) + "s)");
                    }
                }
            }
        } catch(eDur) {}

        // Name with type prefix and color (best-effort)
        var typeTag = (data.type || "").toUpperCase();
        try { trackItem.name = "[" + typeTag + "] " + _mogrtOneLineName(data.text); } catch(e) {}

        // Disolvencia de salida
        _addOutDissolve(seq, trackIndex, targetTime, 20);

        return JSON.stringify({ success: true, removed: removed, trackIndex: trackIndex, errors: errors });
    } catch(e) {
        return JSON.stringify({ error: "Error en replaceMOGRTClip: " + e.message });
    }
}

