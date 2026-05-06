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
        // Log what we're working with for debugging
        var rawType = typeof raw;
        var rawSnippet = (typeof raw === "string") ? raw.substring(0, 150) : JSON.stringify(raw).substring(0, 150);
        $.writeln("[_trySetTextValue] displayName=" + (param.displayName || "?") + " type=" + rawType + " snippet=" + rawSnippet);
        
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

            var jsonStr = JSON.stringify(obj);
            $.writeln("[_trySetTextValue] Setting JSON (len=" + jsonStr.length + "): " + jsonStr.substring(0, 200));
            param.setValue(jsonStr, 1);
            
            // Verify it took
            try {
                var verify = param.getValue();
                var vObj = (typeof verify === "string") ? JSON.parse(verify) : verify;
                $.writeln("[_trySetTextValue] After setValue, textEditValue=" + (vObj.textEditValue || "MISSING").substring(0, 50));
            } catch(ev) {}
            
            return true;
        }
    } catch(e1) {
        $.writeln("[_trySetTextValue] Strategy 1 FAILED: " + e1.message);
    }

    // Strategy 2: set as plain string with updateUI flag
    try {
        $.writeln("[_trySetTextValue] Trying Strategy 2: plain string with updateUI");
        param.setValue(newText, 1);
        return true;
    } catch(e2) {
        $.writeln("[_trySetTextValue] Strategy 2 FAILED: " + e2.message);
    }

    // Strategy 3: set as plain string without flag
    try {
        $.writeln("[_trySetTextValue] Trying Strategy 3: plain string no flag");
        param.setValue(newText);
        return true;
    } catch(e3) {
        $.writeln("[_trySetTextValue] Strategy 3 FAILED: " + e3.message);
    }

    return false;
}

function _setMGTText(trackItem, newText, itemIdx, errors, titleOverride) {
    newText = _normalizeMogrtNewlines(newText);

    // --- Approach: getMGTComponent ---
    // All MOGRTs have a property named "Text" (displayName) that controls the visible text.
    // It can be either:
    //   A) A JSON string with textEditValue (AE Source Text) — use _trySetTextValue
    //   B) A plain string — use setValue directly
    // For MOGRTs with Title+Text fields (Definition/Data/Step/Summary):
    //   - "Title" prop → titleOverride (type label like "Dato", "Paso", "Resumen")
    //   - "Text" prop → newText (supertext content)
    // For MOGRTs with a single text field: set all to newText.
    try {
        if (typeof trackItem.getMGTComponent === "function") {
            var moComp = trackItem.getMGTComponent();
            if (moComp && moComp.properties && moComp.properties.numItems > 0) {
                var numProps = moComp.properties.numItems;
                var propNames = [];
                var didSet = false;

                // Collect all properties and classify them
                var titleProps = [];     // props named "Title" (for titleOverride)
                var textProps = [];      // props named "Text" or similar (primary targets)
                var textEditProps = [];   // props with textEditValue (AE Source Text)

                for (var p = 0; p < numProps; p++) {
                    var prop;
                    try { prop = moComp.properties[p]; } catch(e) { continue; }
                    if (!prop) continue;
                    var dn = "";
                    try { dn = prop.displayName || ""; } catch(e) {}
                    propNames.push(dn);

                    var dl = dn.toLowerCase();

                    // Detect "Title" property specifically (for type label)
                    var isTitleName = (dl === "title") || (dl === "titulo") || (dl === "título");

                    var isTextName = (dl === "text") ||
                                     (dl.indexOf("text") !== -1) ||
                                     (dl.indexOf("texto") !== -1) ||
                                     (dl.indexOf("bullet") !== -1) ||
                                     (dl.indexOf("pregunta") !== -1) ||
                                     (dl.indexOf("definic") !== -1) ||
                                     (dl.indexOf("source") !== -1) ||
                                     (dl.indexOf("fuente") !== -1) ||
                                     (dl.indexOf("origen") !== -1);

                    // If it's a Title prop with titleOverride, DON'T classify as generic text
                    if (isTitleName && titleOverride) {
                        isTextName = false;
                    }

                    // Check what type of value this property has
                    var hasTextEdit = false;
                    try {
                        var val = prop.getValue();
                        if (typeof val === "string" && val.charAt(0) === "{") {
                            try {
                                var parsed = JSON.parse(val);
                                hasTextEdit = (parsed.textEditValue !== undefined);
                            } catch(ep) {}
                        } else if (typeof val === "object" && val !== null) {
                            hasTextEdit = (val.textEditValue !== undefined);
                        }
                    } catch(ev) {}

                    if (isTitleName && titleOverride) {
                        titleProps.push({ prop: prop, index: p, name: dn, hasTextEdit: hasTextEdit });
                    } else {
                        if (hasTextEdit) textEditProps.push({ prop: prop, index: p, name: dn });
                        if (isTextName) textProps.push({ prop: prop, index: p, name: dn, hasTextEdit: hasTextEdit });
                    }
                }

                $.writeln("[_setMGTText] Item " + itemIdx + ": " + numProps + " props [" + propNames.join(", ") + "]");
                $.writeln("[_setMGTText]   titleProps: " + titleProps.length + ", textProps (by name): " + textProps.length + ", textEditProps: " + textEditProps.length);

                // Strategy 0: Set Title property with titleOverride (type label)
                if (titleOverride && titleProps.length > 0) {
                    for (var ti = 0; ti < titleProps.length; ti++) {
                        $.writeln("[_setMGTText]   Setting title override on [" + titleProps[ti].index + "] " + titleProps[ti].name + " = " + titleOverride);
                        if (titleProps[ti].hasTextEdit) {
                            if (_trySetTextValue(titleProps[ti].prop, titleOverride)) didSet = true;
                        } else {
                            try { titleProps[ti].prop.setValue(titleOverride, 1); didSet = true; } catch(e1) {
                                try { titleProps[ti].prop.setValue(titleOverride); didSet = true; } catch(e2) {}
                            }
                        }
                    }
                }

                // Strategy A: Set ALL textEditValue properties (these are AE Source Text layers)
                for (var te = 0; te < textEditProps.length; te++) {
                    $.writeln("[_setMGTText]   Setting textEditValue on [" + textEditProps[te].index + "] " + textEditProps[te].name);
                    if (_trySetTextValue(textEditProps[te].prop, newText)) didSet = true;
                }

                // Strategy B: Set text-named properties that are plain strings (not JSON/textEditValue)
                for (var tn = 0; tn < textProps.length; tn++) {
                    if (textProps[tn].hasTextEdit) continue; // already handled in Strategy A
                    var tProp = textProps[tn].prop;
                    $.writeln("[_setMGTText]   Setting plain string on [" + textProps[tn].index + "] " + textProps[tn].name);
                    try { tProp.setValue(newText, 1); didSet = true; } catch(e1) {
                        $.writeln("[_setMGTText]   setValue(text,1) failed: " + e1.message);
                        try { tProp.setValue(newText); didSet = true; } catch(e2) {
                            $.writeln("[_setMGTText]   setValue(text) failed: " + e2.message);
                        }
                    }
                }

                if (didSet) return true;

                errors.push("Item " + itemIdx + ": " + numProps + " props [" + propNames.join(", ") + "] — none accepted text");
            }
        }
    } catch(eMGT) {
        errors.push("Item " + itemIdx + ": getMGTComponent error — " + eMGT.message);
    }

    // --- Fallback: iterate trackItem.components ---
    try {
        var numComps = trackItem.components.numItems;
        for (var c = 0; c < numComps; c++) {
            var comp;
            try { comp = trackItem.components[c]; } catch(ec) { continue; }
            if (!comp || !comp.properties) continue;
            for (var pp = 0; pp < comp.properties.numItems; pp++) {
                var pr;
                try { pr = comp.properties[pp]; } catch(ep) { continue; }
                if (!pr) continue;
                try {
                    var prVal = pr.getValue();
                    if (typeof prVal === "string" && prVal.charAt(0) === "{") {
                        var prParsed = JSON.parse(prVal);
                        if (prParsed.textEditValue !== undefined) {
                            if (_trySetTextValue(pr, newText)) return true;
                        }
                    }
                } catch(epv) {}
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
                // For MOGRTs with Title+Text (definition, data, step, summary):
                // set Title to type label, Text to supertext content
                var TYPE_TITLE_LABELS = {
                    definition: "Definición",
                    data: "Dato",
                    step: "Paso",
                    summary: "Resumen"
                };
                var titleLabel = TYPE_TITLE_LABELS[st.type] || null;
                var didSetText = _setMGTText(trackItem, st.text, i, errors, titleLabel);
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
                // NOTE: setColorLabel only works on projectItems (bin items), NOT trackItems.
                // Clips inherit color from their source projectItem at insertion time,
                // but changing the projectItem color afterwards also updates timeline clips.
                var TYPE_COLORS = {
                    title:      3,   // Lavender — matches UI indigo (#a5b4fc)
                    bullet:    10,   // Teal — matches UI green (#34d399)
                    step:       8,   // Cerulean — matches UI info/blue
                    definition: 7,   // Mango — matches UI amber (#fbbf24)
                    data:       9,   // Caribbean — matches UI highlight
                    highlight: 15,   // Yellow — matches UI yellow (#facc15)
                    summary:    4,   // Iris — matches UI brand/purple
                    question:   6    // Rose — matches UI pink (#f472b6)
                };
                var labelColor = TYPE_COLORS[st.type] !== undefined ? TYPE_COLORS[st.type] : 0;
                try {
                    // Find the projectItem in the bin via the trackItem's projectItem reference
                    var realClip = null;
                    var targetTrackObj = seq.videoTracks[targetTrack];
                    if (targetTrackObj) {
                        for (var ci = targetTrackObj.clips.numItems - 1; ci >= 0; ci--) {
                            var tc = targetTrackObj.clips[ci];
                            if (Math.abs(tc.start.seconds - startSecs) < 0.1) {
                                realClip = tc;
                                break;
                            }
                        }
                    }
                    // Get the projectItem from the clip and set color there
                    var pItem = null;
                    if (realClip && realClip.projectItem) {
                        pItem = realClip.projectItem;
                    } else if (trackItem && trackItem.projectItem) {
                        pItem = trackItem.projectItem;
                    }
                    if (pItem && typeof pItem.setColorLabel === "function") {
                        pItem.setColorLabel(labelColor);
                    }
                } catch(eLabel) {}

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
        var REP_TYPE_LABELS = {
            definition: "Definición",
            data: "Dato",
            step: "Paso",
            summary: "Resumen"
        };
        var repTitleLabel = REP_TYPE_LABELS[data.type] || null;
        _setMGTText(trackItem, data.text, 0, errors, repTitleLabel);
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


// ─── Debug: inspect ALL 5 MOGRT files and dump their text properties ───
function debugAllMOGRTs(mogrtPathsJson) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa" });

        var paths = JSON.parse(mogrtPathsJson);
        var results = {};
        var trackIdx = seq.videoTracks.numTracks - 1;
        var timeSecs = 0;

        var types = ["title", "bullet", "definition", "highlight", "question"];
        for (var ti = 0; ti < types.length; ti++) {
            var type = types[ti];
            var mogrtPath = paths[type];
            if (!mogrtPath) { results[type] = { error: "No path" }; continue; }
            var mogrtFile = new File(mogrtPath);
            if (!mogrtFile.exists) { results[type] = { error: "Not found" }; continue; }

            try {
                var timeTicks = String(Math.round(timeSecs * TICKS_PER_SECOND));
                var trackItem = seq.importMGT(mogrtFile.fsName, timeTicks, trackIdx, 0);
                if (!trackItem) { results[type] = { error: "importMGT null" }; timeSecs += 10; continue; }

                $.sleep(1500);

                var props = [];
                if (typeof trackItem.getMGTComponent === "function") {
                    var moComp = trackItem.getMGTComponent();
                    if (moComp && moComp.properties) {
                        for (var p = 0; p < moComp.properties.numItems; p++) {
                            var prop = moComp.properties[p];
                            var info = { i: p, name: "" };
                            try { info.name = prop.displayName || ""; } catch(e) {}
                            try {
                                var val = prop.getValue();
                                info.type = typeof val;
                                if (typeof val === "string") {
                                    if (val.charAt(0) === "{") {
                                        try {
                                            var parsed = JSON.parse(val);
                                            if (parsed.textEditValue !== undefined) {
                                                info.textEditValue = String(parsed.textEditValue).substring(0, 50);
                                            }
                                            info.keys = [];
                                            for (var k in parsed) { if (parsed.hasOwnProperty(k)) info.keys.push(k); }
                                        } catch(ep) {}
                                    }
                                    info.val = val.substring(0, 80);
                                } else if (typeof val === "object" && val !== null) {
                                    if (val.textEditValue !== undefined) {
                                        info.textEditValue = String(val.textEditValue).substring(0, 50);
                                    }
                                    info.val = JSON.stringify(val).substring(0, 80);
                                } else {
                                    info.val = String(val).substring(0, 50);
                                }
                            } catch(ev) { info.err = ev.message; }
                            props.push(info);
                        }
                    }
                }

                results[type] = { n: props.length, props: props };

                // Cleanup
                try {
                    var track = seq.videoTracks[trackIdx];
                    for (var ci = track.clips.numItems - 1; ci >= 0; ci--) {
                        if (Math.abs(track.clips[ci].start.seconds - timeSecs) < 1.0) {
                            track.clips[ci].remove(true, true); break;
                        }
                    }
                } catch(eR) {}
            } catch(eT) { results[type] = { error: eT.message }; }
            timeSecs += 10;
        }

        return JSON.stringify({ success: true, mogrts: results });
    } catch(e) {
        return JSON.stringify({ error: e.message });
    }
}

// ─── Debug: inspect MOGRT properties of selected clip ───
function debugMOGRTProperties() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa" });

        // Find selected clip
        var selectedClip = null;
        for (var t = 0; t < seq.videoTracks.numTracks; t++) {
            var track = seq.videoTracks[t];
            for (var c = 0; c < track.clips.numItems; c++) {
                var clip = track.clips[c];
                if (clip.isSelected()) {
                    selectedClip = clip;
                    break;
                }
            }
            if (selectedClip) break;
        }
        if (!selectedClip) return JSON.stringify({ error: "Selecciona un clip MOGRT en la timeline" });

        var result = { clipName: selectedClip.name, approaches: {} };

        // Approach A: getMGTComponent
        try {
            if (typeof selectedClip.getMGTComponent === "function") {
                var moComp = selectedClip.getMGTComponent();
                if (moComp && moComp.properties) {
                    var props = [];
                    for (var p = 0; p < moComp.properties.numItems; p++) {
                        var prop = moComp.properties[p];
                        var info = { index: p, displayName: "", valueType: "", valueSnippet: "" };
                        try { info.displayName = prop.displayName || ""; } catch(e) {}
                        try {
                            var val = prop.getValue();
                            info.valueType = typeof val;
                            if (typeof val === "string") {
                                info.valueSnippet = val.substring(0, 200);
                                // Check if it has textEditValue
                                if (val.charAt(0) === "{") {
                                    try {
                                        var parsed = JSON.parse(val);
                                        info.hasTextEditValue = (parsed.textEditValue !== undefined);
                                        if (parsed.textEditValue) info.textEditValue = parsed.textEditValue;
                                    } catch(ep) {}
                                }
                            } else if (typeof val === "object" && val !== null) {
                                info.hasTextEditValue = (val.textEditValue !== undefined);
                                if (val.textEditValue) info.textEditValue = val.textEditValue;
                                info.valueSnippet = JSON.stringify(val).substring(0, 200);
                            } else {
                                info.valueSnippet = String(val);
                            }
                        } catch(ev) { info.valueError = ev.message; }
                        props.push(info);
                    }
                    result.approaches.getMGTComponent = { numProps: moComp.properties.numItems, props: props };
                }
            }
        } catch(eA) {
            result.approaches.getMGTComponent = { error: eA.message };
        }

        // Approach B: components
        try {
            var comps = [];
            for (var c2 = 0; c2 < selectedClip.components.numItems; c2++) {
                var comp = selectedClip.components[c2];
                var cInfo = { displayName: "", matchName: "", props: [] };
                try { cInfo.displayName = comp.displayName || ""; } catch(e) {}
                try { cInfo.matchName = comp.matchName || ""; } catch(e) {}
                for (var pp = 0; pp < comp.properties.numItems; pp++) {
                    var pr = comp.properties[pp];
                    var pInfo = { displayName: "", valueType: "" };
                    try { pInfo.displayName = pr.displayName || ""; } catch(e) {}
                    try {
                        var pVal = pr.getValue();
                        pInfo.valueType = typeof pVal;
                        if (typeof pVal === "string" && pVal.charAt(0) === "{") {
                            try {
                                var pp2 = JSON.parse(pVal);
                                pInfo.hasTextEditValue = (pp2.textEditValue !== undefined);
                                if (pp2.textEditValue) pInfo.textEditValue = pp2.textEditValue;
                            } catch(ep2) {}
                        }
                    } catch(epv) {}
                    cInfo.props.push(pInfo);
                }
                comps.push(cInfo);
            }
            result.approaches.components = comps;
        } catch(eB) {
            result.approaches.components = { error: eB.message };
        }

        return JSON.stringify(result);
    } catch(e) {
        return JSON.stringify({ error: e.message });
    }
}
