/**
 * host/common.jsx — JSON polyfill, shared utilities, backup/restore, sequence helpers
 * Loaded via #include from host/index.jsx
 */

/**
 * Editor-Pro — ExtendScript Host for Premiere Pro
 *
 * Combines Cutter (marker-based cuts), SpellCheck/Supertexts/EditSuggestions,
 * and Recording Notes (STT + take analysis) into a unified host script.
 */

// ─── JSON Polyfill (ES3) ────────────────────────────────────
if (typeof JSON === "undefined") { JSON = {}; }
if (typeof JSON.parse !== "function") {
    JSON.parse = function(s) { return eval("(" + s + ")"); };
}
if (typeof JSON.stringify !== "function") {
    JSON.stringify = function(obj) {
        if (obj === null) return "null";
        if (obj === undefined) return undefined;
        var t = typeof obj;
        if (t === "number" || t === "boolean") return String(obj);
        if (t === "string") return '"' + obj.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t").replace(/[\u0000-\u001f]/g, function(c) { return "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4); }) + '"';
        if (obj instanceof Array) {
            var a = [];
            for (var i = 0; i < obj.length; i++) a.push(JSON.stringify(obj[i]));
            return "[" + a.join(",") + "]";
        }
        if (t === "object") {
            var parts = [];
            for (var k in obj) {
                if (obj.hasOwnProperty(k)) {
                    var v = JSON.stringify(obj[k]);
                    if (v !== undefined) parts.push('"' + k + '":' + v);
                }
            }
            return "{" + parts.join(",") + "}";
        }
        return undefined;
    };
}

var TICKS_PER_SECOND = 254016000000;
var _backupSeqName = "";
var _backupSeqId = "";
var _originalSeqId = "";
var _originalParentBinName = "";
var _batchBackups = {}; // keyed by original seqId: { backupSeqId, backupSeqName, originalName }

// ─── Backup Persistence to Disk ─────────────────────────────
function _getBackupPersistPath() {
    try {
        var projPath = app.project.path;
        if (!projPath || projPath === "") return null;
        var projFile = new File(projPath);
        var projDir = projFile.parent;
        return projDir.fsName + "/editorpro_backups.json";
    } catch(e) {
        return null;
    }
}

function _persistBackups() {
    var filePath = _getBackupPersistPath();
    if (!filePath) return;
    try {
        var data = JSON.stringify(_batchBackups);
        var f = new File(filePath);
        f.encoding = "UTF-8";
        f.open("w");
        f.write(data);
        f.close();
    } catch(e) {}
}

function _loadPersistedBackups() {
    var filePath = _getBackupPersistPath();
    if (!filePath) return;
    try {
        var f = new File(filePath);
        if (!f.exists) return;
        f.encoding = "UTF-8";
        f.open("r");
        var content = f.read();
        f.close();
        if (content) {
            var loaded = JSON.parse(content);
            for (var k in loaded) {
                if (loaded.hasOwnProperty(k) && !_batchBackups[k]) {
                    _batchBackups[k] = loaded[k];
                }
            }
        }
    } catch(e) {}
}

// Load persisted backups on startup
_loadPersistedBackups();

// ─── Sequence Info ────────────────────────────────────────────

function getActiveSequenceInfo() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa. Abre una secuencia primero." });

        var audioTrackCount = 0;
        try { audioTrackCount = seq.audioTracks.numTracks; } catch(e) {}

        var fps = 0;
        try {
            var settings = seq.getSettings();
            if (settings && settings.videoFrameRate) {
                var frameDur = parseFloat(settings.videoFrameRate.seconds);
                if (frameDur > 0) fps = 1.0 / frameDur;
            }
        } catch(e) {}

        var seqId = "";
        try { seqId = seq.sequenceID; } catch(e) {}

        // Hasta dónde llega el último marcador: con esto el panel sabe qué tiene que
        // cubrir un transcript para poder validar los cortes.
        var lastMarker = 0;
        try {
            var mk = seq.markers.getFirstMarker();
            while (mk) {
                var mkStart = parseFloat(mk.start.seconds);
                if (mkStart > lastMarker) lastMarker = mkStart;
                mk = seq.markers.getNextMarker(mk);
            }
        } catch(e) {}

        return JSON.stringify({
            name: seq.name,
            sequenceID: seqId,
            duration: seq.end,
            durationSeconds: parseFloat(seq.end) / TICKS_PER_SECOND,
            frameRate: fps,
            markerCount: seq.markers.numMarkers,
            lastMarkerSeconds: lastMarker,
            audioTracks: audioTrackCount,
            videoTracks: seq.videoTracks.numTracks,
            projectPath: app.project.path || ""
        });
    } catch(e) {
        return JSON.stringify({ error: "Error al leer secuencia: " + e.message });
    }
}

// ─── Read All Sequence Markers ───────────────────────────────

function getSequenceMarkers() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        var markers = [];
        var m = seq.markers;

        if (m.numMarkers > 0) {
            var marker = m.getFirstMarker();
            while (marker) {
                var info = {
                    name: marker.name || "",
                    comments: marker.comments || "",
                    startSeconds: marker.start.seconds,
                    endSeconds: marker.end.seconds,
                    colorIndex: -1
                };
                info.colorIndex = epGetMarkerColor(marker);
                markers.push(info);
                try { marker = m.getNextMarker(marker); } catch(e) { marker = null; }
            }
        }

        return JSON.stringify({ success: true, markers: markers, count: markers.length });
    } catch(e) {
        return JSON.stringify({ error: "Error al leer marcadores: " + e.message });
    }
}

// ─── Get Track/Clip Structure ────────────────────────────────

function getSequenceTrackInfo() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        var tracks = [];

        for (var v = 0; v < seq.videoTracks.numTracks; v++) {
            var vt = seq.videoTracks[v];
            var clipCount = 0;
            try { clipCount = vt.clips.numItems; } catch(e) {}
            tracks.push({ type: "video", index: v, name: vt.name || ("V" + (v+1)), clips: clipCount });
        }
        for (var a = 0; a < seq.audioTracks.numTracks; a++) {
            var at = seq.audioTracks[a];
            var aClipCount = 0;
            try { aClipCount = at.clips.numItems; } catch(e) {}
            tracks.push({ type: "audio", index: a, name: at.name || ("A" + (a+1)), clips: aClipCount });
        }

        return JSON.stringify({ success: true, tracks: tracks });
    } catch(e) {
        return JSON.stringify({ error: "Error al leer pistas: " + e.message });
    }
}

// ─── Video Track Names ──────────────────────────────────────

function getVideoTrackNames() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        var tracks = [];
        for (var v = 0; v < seq.videoTracks.numTracks; v++) {
            var vt = seq.videoTracks[v];
            var clipCount = 0;
            try { clipCount = vt.clips.numItems; } catch(e) {}
            if (clipCount > 0) {
                tracks.push({
                    index: v,
                    name: vt.name || ("V" + (v + 1))
                });
            }
        }
        return JSON.stringify({ success: true, tracks: tracks });
    } catch(e) {
        return JSON.stringify({ error: "Error al leer pistas: " + e.message });
    }
}

// ─── Video Clip Paths (for frame extraction) ───────────────

function getVideoClipPaths() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        var clips = [];
        for (var v = 0; v < seq.videoTracks.numTracks; v++) {
            var track = seq.videoTracks[v];
            var trackName = track.name || ("V" + (v + 1));
            var nc = 0;
            try { nc = track.clips.numItems; } catch(e) { continue; }

            for (var c = 0; c < nc; c++) {
                try {
                    var clip = track.clips[c];
                    var mp = "";
                    if (clip.projectItem) {
                        mp = clip.projectItem.getMediaPath() || "";
                    }
                    if (!mp) continue;
                    clips.push({
                        path: mp,
                        startSec: clip.start.seconds,
                        endSec: clip.end.seconds,
                        inPointSec: clip.inPoint.seconds,
                        trackName: trackName,
                        trackIndex: v
                    });
                } catch(e) {}
            }
        }
        return JSON.stringify({ success: true, clips: clips });
    } catch(e) {
        return JSON.stringify({ error: "Error al leer clips: " + e.message });
    }
}

// ─── Activate Views by Mapping ──────────────────────────────

function activateViews(jsonPath) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        var f = new File(jsonPath);
        if (!f.exists) return JSON.stringify({ error: "Archivo no encontrado: " + jsonPath });
        f.open('r');
        var content = f.read();
        f.close();

        var data = JSON.parse(content);
        var mapping = data.mapping;
        var segments = data.segments;
        var EPS = 0.05;

        var enabledCount = 0;
        var disabledCount = 0;

        for (var v = 0; v < seq.videoTracks.numTracks; v++) {
            var track = seq.videoTracks[v];
            var trackName = track.name || ("V" + (v + 1));
            var nc = 0;
            try { nc = track.clips.numItems; } catch(e) { continue; }

            for (var c = 0; c < nc; c++) {
                try {
                    var clip = track.clips[c];
                    var clipMid = (clip.start.seconds + clip.end.seconds) / 2;

                    var matchedSegment = null;
                    for (var s = 0; s < segments.length; s++) {
                        if (clipMid >= segments[s].start - EPS && clipMid < segments[s].end + EPS) {
                            matchedSegment = segments[s];
                            break;
                        }
                    }

                    if (matchedSegment) {
                        var targets = mapping[matchedSegment.name];
                        var isMatch = false;
                        if (targets) {
                            if (typeof targets === "string") {
                                isMatch = (targets === trackName);
                            } else {
                                for (var mt = 0; mt < targets.length; mt++) {
                                    if (targets[mt] === trackName) { isMatch = true; break; }
                                }
                            }
                        }
                        if (isMatch) {
                            clip.disabled = false;
                            enabledCount++;
                        } else {
                            clip.disabled = true;
                            disabledCount++;
                        }
                    }
                } catch(e) {}
            }
        }

        return JSON.stringify({
            success: true,
            enabled: enabledCount,
            disabled: disabledCount
        });
    } catch(e) {
        return JSON.stringify({ error: "Error al activar vistas: " + e.message });
    }
}

// ─── Move Playhead ───────────────────────────────────────────

function movePlayhead(timeSeconds) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });
        var ticks = parseFloat(timeSeconds) * TICKS_PER_SECOND;
        seq.setPlayerPosition(ticks.toString());
        return JSON.stringify({ success: true });
    } catch(e) {
        return JSON.stringify({ error: "Error: " + e.message });
    }
}

// Seek to a time (seconds). If seqId is given and it is not the active
// sequence, open it first so the playhead lands on the right class.
function seekSequenceToSeconds(timeSeconds, seqId) {
    try {
        var seq = app.project.activeSequence;
        var opened = false;
        if (seqId && (!seq || seq.sequenceID !== seqId)) {
            var target = findSequenceById(seqId);
            if (target) {
                try { app.project.openSequence(target.sequenceID); } catch(e) {}
                $.sleep(300);
                seq = app.project.activeSequence;
                opened = true;
            }
        }
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });
        var ticks = parseFloat(timeSeconds) * TICKS_PER_SECOND;
        seq.setPlayerPosition(ticks.toString());
        return JSON.stringify({ success: true, opened: opened });
    } catch(e) {
        return JSON.stringify({ error: "Error: " + e.message });
    }
}

// ─── Export Current Frame ─────────────────────────────────────

function exportCurrentFrame() {
    try {
        app.enableQE();
        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) return JSON.stringify({ error: "No hay secuencia activa." });

        // Get timecode from QE CTI (Current Time Indicator) — this is the playhead position
        var time = qeSeq.CTI.timecode;

        // Build output path — no .png extension, QE adds it
        var tidyTime = time.replace(/:|;/g, "_");
        var basePath = Folder.temp.fsName + "/mp_still_" + tidyTime + "_" + Date.now();

        // Export using timecode string (NOT ticks) — per Adobe docs
        qeSeq.exportFramePNG(time, basePath);
        $.sleep(1000);

        // QE appends .png automatically
        var candidates = [basePath + ".png", basePath, basePath + ".png.png"];
        for (var i = 0; i < candidates.length; i++) {
            var f = new File(candidates[i]);
            if (f.exists && f.length > 100) {
                return JSON.stringify({ success: true, path: candidates[i], timecode: time });
            }
        }

        return JSON.stringify({ error: "Archivo no creado. TC=" + time });
    } catch(e) {
        return JSON.stringify({ error: "Error: " + e.message });
    }
}

// ─── Backup Sequence ─────────────────────────────────────────

function findOrCreateBin(parentBin, binName) {
    for (var i = 0; i < parentBin.children.numItems; i++) {
        var child = parentBin.children[i];
        if (child && child.type === 2 && child.name === binName) {
            return child;
        }
    }
    parentBin.createBin(binName);
    for (var j = 0; j < parentBin.children.numItems; j++) {
        var child2 = parentBin.children[j];
        if (child2 && child2.type === 2 && child2.name === binName) {
            return child2;
        }
    }
    return null;
}

function findBinContainingSequence(rootItem, seqId, seqName) {
    for (var i = 0; i < rootItem.children.numItems; i++) {
        var child = rootItem.children[i];
        if (child && child.type !== 2) {
            try {
                if (child.nodeId === seqId) return rootItem;
            } catch(e) {}
            try {
                if (child.projectItem && child.projectItem.nodeId === seqId) return rootItem;
            } catch(e) {}
            if (seqName && child.name === seqName) {
                try {
                    if (child.type === 1 || child.isSequence) return rootItem;
                } catch(e) {}
                return rootItem;
            }
        }
        if (child && child.type === 2) {
            var found = findBinContainingSequence(child, seqId, seqName);
            if (found) return found;
        }
    }
    return null;
}

function findItemByNameInBin(bin, itemName) {
    if (!bin || !bin.children) return null;
    for (var i = 0; i < bin.children.numItems; i++) {
        var child = bin.children[i];
        if (child && child.name === itemName) return child;
    }
    return null;
}

function findItemByNameRecursive(rootItem, itemName) {
    for (var i = 0; i < rootItem.children.numItems; i++) {
        var child = rootItem.children[i];
        if (child && child.name === itemName && child.type !== 2) return { item: child, parentBin: rootItem };
        if (child && child.type === 2) {
            var found = findItemByNameRecursive(child, itemName);
            if (found) return found;
        }
    }
    return null;
}

/**
 * Etiquetas de los dos momentos en que el pipeline copia la secuencia. El editor
 * las lee en el bin "Backup" para saber a qué estado vuelve, así que se escriben
 * exactamente así.
 */
var BACKUP_LABEL_MARKER = "Pre-Marker"; // estado previo a mover los marcadores
var BACKUP_LABEL_CUT = "Pre-Cut";       // estado previo a aplicar los cortes

/** Fecha del nombre del backup: YYYY-MM-DD_HH-MM */
function backupDateStamp(now) {
    function p2(n) { return (n < 10 ? "0" : "") + n; }
    return now.getFullYear() + "-" + p2(now.getMonth() + 1) + "-" + p2(now.getDate()) +
        "_" + p2(now.getHours()) + "-" + p2(now.getMinutes());
}

/**
 * Nombre de la copia: "<secuencia>_Backup_<etiqueta>_<fecha>". La etiqueta va
 * antes de la fecha para que se lea aunque el bin recorte el nombre, y "_Backup_"
 * se mantiene pegado al nombre original porque restoreBackup() busca por ese
 * prefijo cuando ya no tiene el sequenceID.
 *
 * Dos pasadas dentro del mismo minuto darían el mismo nombre; como la copia se
 * mueve al bin y se restaura buscándola por nombre, la segunda se numera (_2, _3)
 * en vez de dejar dos secuencias homónimas.
 *
 * @param {string}   seqName   nombre de la secuencia original
 * @param {string}   label     BACKUP_LABEL_MARKER / BACKUP_LABEL_CUT (opcional)
 * @param {string}   dateStamp de backupDateStamp()
 * @param {function} isTaken   opcional, nombre → boolean
 */
function buildBackupName(seqName, label, dateStamp, isTaken) {
    var base = seqName + "_Backup_";
    if (label) base += label + "_";
    base += dateStamp;
    if (!isTaken) return base;

    var name = base;
    var n = 1;
    while (isTaken(name)) {
        n++;
        name = base + "_" + n;
    }
    return name;
}

function sequenceNameExists(name) {
    for (var i = 0; i < app.project.sequences.numSequences; i++) {
        if (app.project.sequences[i].name === name) return true;
    }
    return false;
}

/**
 * Copia de la secuencia en el bin "Backup", junto a la original.
 * @param {string} label  opcional, de qué punto del proceso es la copia
 *                        (BACKUP_LABEL_MARKER / BACKUP_LABEL_CUT)
 * @param {string} seqId  opcional, la secuencia a copiar (por defecto, la activa)
 */
function backupSequence(label, seqId) {
    try {
        if (seqId) {
            var active = app.project.activeSequence;
            if (!active || active.sequenceID !== seqId) {
                var opened = JSON.parse(openSequenceById(seqId));
                if (opened.error) return JSON.stringify({ error: opened.error });
            }
        }
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        _backupSeqName = seq.name;
        _originalSeqId = seq.sequenceID;
        var originalSeqId = seq.sequenceID;

        var backupSeqName = buildBackupName(seq.name, label, backupDateStamp(new Date()), sequenceNameExists);

        // Snapshot all existing sequence IDs before cloning
        var existingIds = {};
        for (var si = 0; si < app.project.sequences.numSequences; si++) {
            existingIds[app.project.sequences[si].sequenceID] = true;
        }

        // Clone the sequence
        seq.clone();
        $.sleep(500);

        // Find the new sequence by checking which ID didn't exist before
        var clonedSeq = null;
        for (var i = 0; i < app.project.sequences.numSequences; i++) {
            var s = app.project.sequences[i];
            if (!existingIds[s.sequenceID]) {
                clonedSeq = s;
                break;
            }
        }

        if (clonedSeq) {
            // Rename backup
            try { clonedSeq.name = backupSeqName; } catch(e) {}
            $.sleep(200);

            // Find the parent bin of the ORIGINAL sequence (where backup folder should go)
            var parentBin = findBinContainingSequence(app.project.rootItem, originalSeqId, _backupSeqName);
            if (!parentBin) parentBin = app.project.rootItem;
            _originalParentBinName = parentBin.name || "";

            // Create "Backup" subfolder inside that parent bin
            var backupBin = findOrCreateBin(parentBin, "Backup");

            // Find the cloned item ANYWHERE in the project tree and move it
            if (backupBin) {
                var clonedResult = findItemByNameRecursive(app.project.rootItem, backupSeqName);
                if (clonedResult) {
                    try { clonedResult.item.moveBin(backupBin); } catch(e) {}
                }
            }

            _backupSeqId = clonedSeq.sequenceID;

            // Store in batch backups map (include parent bin info for restore)
            _batchBackups[originalSeqId] = {
                backupSeqId: clonedSeq.sequenceID,
                backupSeqName: backupSeqName,
                originalName: _backupSeqName,
                originalSeqId: originalSeqId,
                originalParentBinName: _originalParentBinName
            };
            _persistBackups();
        }

        // Close the backup tab by making it active then closing via QE
        if (clonedSeq) {
            try {
                // Activate the backup so it becomes the QE active sequence
                app.project.openSequence(clonedSeq.sequenceID);
                $.sleep(400);

                app.enableQE();
                var qeActive = qe.project.getActiveSequence();
                if (qeActive) {
                    qeActive.close();
                    $.sleep(300);
                }
            } catch(e) {}
        }

        // Re-ensure the original sequence is active
        $.sleep(200);
        try { app.project.openSequence(originalSeqId); } catch(e) {}
        $.sleep(200);
        try { app.project.openSequence(originalSeqId); } catch(e) {}

        return JSON.stringify({
            success: true,
            backupName: backupSeqName,
            message: "Backup creado: " + backupSeqName
        });
    } catch(e) {
        return JSON.stringify({ error: "Error al crear backup: " + e.message });
    }
}

// ─── Restore Backup ──────────────────────────────────────────

function restoreBackup() {
    try {
        if (!_backupSeqId && !_backupSeqName) {
            return JSON.stringify({ error: "No hay backup registrado." });
        }

        var originalName = _backupSeqName;
        var cutSeq = app.project.activeSequence;
        if (!cutSeq) {
            return JSON.stringify({ error: "No hay secuencia activa." });
        }

        // --- Find backup sequence ---
        var backupSeq = null;
        var backupSeqName = "";

        if (_backupSeqId) {
            for (var i = 0; i < app.project.sequences.numSequences; i++) {
                var s = app.project.sequences[i];
                if (s.sequenceID === _backupSeqId) {
                    backupSeq = s;
                    backupSeqName = s.name;
                    break;
                }
            }
        }
        if (!backupSeq) {
            for (var j = 0; j < app.project.sequences.numSequences; j++) {
                var s2 = app.project.sequences[j];
                if (s2.name.indexOf(originalName + "_Backup_") === 0) {
                    backupSeq = s2;
                    backupSeqName = s2.name;
                    break;
                }
            }
        }

        if (!backupSeq) {
            return JSON.stringify({ error: "No se encontró la secuencia de backup." });
        }

        // --- Locate the cut sequence's current parent bin ---
        var cutItemName = cutSeq.name;
        var originalParentBin = findBinContainingSequence(app.project.rootItem, cutSeq.sequenceID, cutItemName);
        if (!originalParentBin) {
            var cutResult = findItemByNameRecursive(app.project.rootItem, cutItemName);
            originalParentBin = cutResult ? cutResult.parentBin : app.project.rootItem;
        }

        // The Backup folder lives inside this parent bin
        var backupBin = findOrCreateBin(originalParentBin, "Backup");

        // --- Step 1: Rename the cut sequence to _Fail and move it to Backup folder ---
        var failName = originalName + "_Fail";
        try { cutSeq.name = failName; } catch(e) {}
        $.sleep(200);

        // Find the renamed item anywhere in the project and move to Backup
        var failResult = findItemByNameRecursive(app.project.rootItem, failName);
        if (failResult && backupBin) {
            try { failResult.item.moveBin(backupBin); } catch(e) {}
        }
        $.sleep(200);

        // --- Step 2: Move backup from Backup folder to original parent ---
        var backupItem = findItemByNameRecursive(app.project.rootItem, backupSeqName);
        if (backupItem) {
            try { backupItem.item.moveBin(originalParentBin); } catch(e) {}
        }
        $.sleep(200);

        // --- Step 3: Rename backup to the original name ---
        try { backupSeq.name = originalName; } catch(e) {}

        // --- Step 4: Open the restored sequence so it becomes the active tab ---
        app.project.openSequence(backupSeq.sequenceID);
        $.sleep(300);

        // --- Step 5: Close the fail sequence tab ---
        try {
            // Open the fail sequence to make it the active QE sequence, then close it
            app.project.openSequence(cutSeq.sequenceID);
            $.sleep(400);
            app.enableQE();
            var qeActive2 = qe.project.getActiveSequence();
            if (qeActive2) {
                qeActive2.close();
                $.sleep(300);
            }
        } catch(e) {}

        // Re-ensure restored sequence is the active one
        $.sleep(200);
        try { app.project.openSequence(backupSeq.sequenceID); } catch(e) {}
        $.sleep(200);
        try { app.project.openSequence(backupSeq.sequenceID); } catch(e) {}

        _backupSeqId = "";
        _originalSeqId = "";

        return JSON.stringify({
            success: true,
            message: "Backup restaurado. Secuencia \"" + originalName + "\" activa."
        });
    } catch(e) {
        return JSON.stringify({ error: "Error al restaurar: " + e.message });
    }
}

function restoreBackupById(seqId) {
    try {
        var info = _batchBackups[seqId];
        if (!info) {
            return JSON.stringify({ error: "No hay backup registrado para esta secuencia." });
        }

        // Temporarily set globals so restoreBackup logic works
        var prevBackupSeqId = _backupSeqId;
        var prevBackupSeqName = _backupSeqName;
        var prevOriginalSeqId = _originalSeqId;
        var prevOriginalParentBinName = _originalParentBinName;

        _backupSeqId = info.backupSeqId;
        _backupSeqName = info.originalName;
        _originalSeqId = info.originalSeqId;
        _originalParentBinName = info.originalParentBinName || "";

        // First open the cut sequence so it becomes active
        app.project.openSequence(seqId);
        $.sleep(500);

        var result = restoreBackup();

        // Clean up batch backup entry
        delete _batchBackups[seqId];
        _persistBackups();

        // Restore previous globals
        _backupSeqId = prevBackupSeqId;
        _backupSeqName = prevBackupSeqName;
        _originalSeqId = prevOriginalSeqId;
        _originalParentBinName = prevOriginalParentBinName;

        return result;
    } catch(e) {
        return JSON.stringify({ error: "Error al restaurar: " + e.message });
    }
}

function getBatchBackupInfo() {
    try {
        var keys = [];
        for (var k in _batchBackups) {
            if (_batchBackups.hasOwnProperty(k)) {
                keys.push({
                    seqId: k,
                    backupName: _batchBackups[k].backupSeqName,
                    originalName: _batchBackups[k].originalName
                });
            }
        }
        return JSON.stringify({ success: true, backups: keys });
    } catch(e) {
        return JSON.stringify({ error: e.message });
    }
}

// ─── Marker Management (Post-Cut) ────────────────────────────

/**
 * Texto de una propiedad de Premiere, sin espacios a los lados.
 *
 * ExtendScript es ES3: `String.prototype.trim` es de ES5 y aquí no existe.
 * `(marker.comments || "").trim()` reventaba con "marker.comments||.trim is not
 * a function" y, como la lectura entera iba en un solo try, **un marcador
 * dejaba la lista en cero**: 21 marcadores antes de cortar, ninguno después.
 * Se veía como "la secuencia no tiene marcadores" y se llevaba puesta también
 * la Vista de Cámaras, que sale de esos mismos nombres.
 *
 * Y no siempre llega un string: `comments` puede venir como objeto, así que
 * primero se convierte y después se recorta.
 */
function epText(v) {
    if (v === null || v === undefined) return "";
    var s = String(v);
    return s.replace(/^[\s\u00A0]+/, "").replace(/[\s\u00A0]+$/, "");
}

function getPostCutMarkers() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        var markers = [];
        var m = seq.markers;

        var unreadable = 0;

        if (m.numMarkers > 0) {
            var marker = m.getFirstMarker();
            var idx = 0;
            while (marker) {
                // Cada marcador va en su propio try: uno que no se deje leer se
                // cuenta y se sigue, en vez de dejar la lista entera en cero.
                try {
                    var raw = epText(marker.comments);
                    var isOut = (raw.indexOf("OUT:") === 0);
                    var hasComment = false;
                    var editorNote = "";
                    var transcript = "";

                    if (!isOut) {
                        var dashIdx = raw.indexOf(" - ");
                        if (dashIdx > 0) {
                            hasComment = true;
                            editorNote = epText(raw.substring(0, dashIdx));
                            transcript = epText(raw.substring(dashIdx + 3));
                        } else if (raw.indexOf("- ") === 0) {
                            transcript = epText(raw.substring(2));
                        } else {
                            transcript = raw;
                        }
                    }

                    markers.push({
                        index: idx,
                        name: epText(marker.name),
                        comments: raw,
                        startSeconds: marker.start.seconds,
                        isOut: isOut,
                        hasComment: hasComment,
                        editorNote: editorNote,
                        transcript: transcript,
                        colorIndex: epGetMarkerColor(marker)
                    });
                } catch(eMk) {
                    unreadable++;
                }

                idx++;
                try { marker = m.getNextMarker(marker); } catch(e) { marker = null; }
            }
        }

        return JSON.stringify({
            success: true,
            markers: markers,
            count: markers.length,
            unreadable: unreadable
        });
    } catch(e) {
        return JSON.stringify({ error: "Error al leer marcadores: " + e.message });
    }
}

function deleteMarkersByTimes(timesJSON) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        var times = JSON.parse(timesJSON);
        var m = seq.markers;
        var EPS = 0.05;

        var toDelete = [];
        var marker = m.getFirstMarker();
        while (marker) {
            for (var t = 0; t < times.length; t++) {
                if (Math.abs(marker.start.seconds - times[t]) < EPS) {
                    toDelete.push(marker);
                    break;
                }
            }
            try { marker = m.getNextMarker(marker); } catch(e) { marker = null; }
        }

        var deleted = 0;
        for (var d = 0; d < toDelete.length; d++) {
            try {
                m.deleteMarker(toDelete[d]);
                deleted++;
            } catch(e) {}
        }

        return JSON.stringify({ success: true, deleted: deleted, remaining: m.numMarkers });
    } catch(e) {
        return JSON.stringify({ error: "Error al borrar marcadores: " + e.message });
    }
}

function deleteMarkersWithoutComments() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        var m = seq.markers;
        var toDelete = [];
        var marker = m.getFirstMarker();

        while (marker) {
            var raw = epText(marker.comments);
            var isOut = (raw.indexOf("OUT:") === 0);
            var dashIdx = raw.indexOf(" - ");
            var hasComment = (!isOut && dashIdx > 0);

            if (!hasComment) {
                toDelete.push(marker);
            }

            try { marker = m.getNextMarker(marker); } catch(e) { marker = null; }
        }

        var deleted = 0;
        for (var d = 0; d < toDelete.length; d++) {
            try {
                m.deleteMarker(toDelete[d]);
                deleted++;
            } catch(e) {}
        }

        return JSON.stringify({ success: true, deleted: deleted, remaining: m.numMarkers });
    } catch(e) {
        return JSON.stringify({ error: "Error: " + e.message });
    }
}

// ─── Marcadores: reposicionar sin "mover" ────────────────────
//
// La API de Premiere NO permite reposicionar un marcador existente:
//   · `Marker.start` figura como "Time object; read/write", pero asignarle un
//     Time lanza "Illegal Parameter type", y mutar `marker.start.ticks` no hace
//     nada porque el getter devuelve una copia del Time.
//   · `Marker.end` sí se puede escribir, pero SOLO con un valor en SEGUNDOS
//     (la propia doc lo aclara: "pass a Seconds value, not a complete
//     replacement Time").
//   · `Marker.type` es read-only; el tipo se restituye con setTypeAs*().
//
// Por eso cualquier cambio de posición se hace borrando y recreando el
// marcador con su metadata (epRecreateMarker). Nunca dependemos de un "move".

function epIsColorIndex(v) {
    var n = parseInt(v, 10);
    return !isNaN(n) && n >= 0 && n <= 7;
}

/**
 * Índice de color de un marcador, o -1 si no se pudo leer.
 * La doc describe `getColorByIndex(index)` con index = "marcador a leer", pero
 * los scripts reales la llaman sin argumentos sobre la instancia. Se prueban
 * las dos formas y se valida que el resultado sea un color (0-7).
 */
function epGetMarkerColor(marker) {
    var v;
    try {
        v = marker.getColorByIndex();
        if (epIsColorIndex(v)) return parseInt(v, 10);
    } catch(e1) {}
    try {
        v = marker.getColorByIndex(0);
        if (epIsColorIndex(v)) return parseInt(v, 10);
    } catch(e2) {}
    return -1;
}

/**
 * Colorea un marcador. Se llama con UN solo argumento: el segundo parámetro
 * documentado (`markerIndex`) apunta a otro marcador de la colección y
 * terminaría coloreando el equivocado.
 * Colores: 0 verde · 1 rojo · 2 morado · 3 naranja · 4 amarillo · 5 blanco ·
 * 6 azul · 7 cian.
 */
function epSetMarkerColor(marker, colorIdx) {
    if (!epIsColorIndex(colorIdx)) return false;
    try { marker.setColorByIndex(parseInt(colorIdx, 10)); return true; } catch(e) { return false; }
}

/** createMarker() siempre crea un marcador de comentario: restituye el tipo original. */
function epApplyMarkerType(marker, typeStr) {
    try {
        if (typeStr === "Chapter" && marker.setTypeAsChapter) marker.setTypeAsChapter();
        else if (typeStr === "Segmentation" && marker.setTypeAsSegmentation) marker.setTypeAsSegmentation();
        else if (typeStr === "WebLink" && marker.setTypeAsWebLink) marker.setTypeAsWebLink();
    } catch(e) {}
}

/** Marcador de la colección con ese guid (identidad estable), o null. */
function epFindMarkerByGuid(markers, guid) {
    if (!guid) return null;
    var marker = markers.getFirstMarker();
    while (marker) {
        var g = "";
        try { g = String(marker.guid || ""); } catch(e) {}
        if (g === guid) return marker;
        try { marker = markers.getNextMarker(marker); } catch(eN) { marker = null; }
    }
    return null;
}

/**
 * Reposiciona un marcador borrándolo y creando uno nuevo en newStart, con el
 * mismo nombre, comentario, color, tipo y duración.
 * @param endSecs fin absoluto en segundos; null conserva la duración original.
 * @returns {{created, error}}
 */
function epRecreateMarker(markers, target, newStart, endSecs) {
    var name = "", comments = "", typeStr = "", durationSecs = 0;
    try { name = target.name || ""; } catch(e1) {}
    try { comments = target.comments || ""; } catch(e2) {}
    try { typeStr = String(target.type || ""); } catch(e3) {}
    try { durationSecs = target.end.seconds - target.start.seconds; } catch(e4) {}
    var colorIdx = epGetMarkerColor(target);

    try {
        markers.deleteMarker(target);
    } catch(eDel) {
        return { created: null, error: "no se pudo borrar el marcador: " + eDel.message };
    }

    var created = null;
    try {
        created = markers.createMarker(newStart);
    } catch(eNew) {
        return { created: null, error: "no se pudo recrear el marcador: " + eNew.message };
    }

    try { created.name = name; } catch(e5) {}
    try { created.comments = comments; } catch(e6) {}

    var wantEnd = null;
    if (typeof endSecs === "number" && !isNaN(endSecs)) wantEnd = endSecs;
    else if (durationSecs > 0.01) wantEnd = newStart + durationSecs;
    if (wantEnd !== null && wantEnd > newStart) {
        try { created.end = wantEnd; } catch(e7) {}
    }

    epSetMarkerColor(created, colorIdx);
    epApplyMarkerType(created, typeStr);
    return { created: created, error: null };
}

function colorizeCommentMarkers() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        var m = seq.markers;
        var colored = 0;
        var marker = m.getFirstMarker();

        while (marker) {
            var raw = epText(marker.comments);
            var isOut = (raw.indexOf("OUT:") === 0);
            var dashIdx = raw.indexOf(" - ");
            var hasComment = (!isOut && dashIdx > 0);

            if (hasComment) {
                if (epSetMarkerColor(marker, 6)) colored++;
            }

            try { marker = m.getNextMarker(marker); } catch(e) { marker = null; }
        }

        return JSON.stringify({ success: true, colored: colored });
    } catch(e) {
        return JSON.stringify({ error: "Error: " + e.message });
    }
}

// ─── Nombres de marcadores de TODAS las secuencias ───────────

/**
 * Recorre todas las secuencias del proyecto (menos backups) y devuelve los
 * nombres/notas distintos de los marcadores IN. Sirve para armar el mapeo de
 * vistas (nombre de marcador → pistas de video) sin tener que abrir ni cerrar
 * pestañas: una sola llamada, sin efectos secundarios en el proyecto.
 * items: [{name, note, count, sequences}]
 */
function getMarkerNamesAllSequences() {
    try {
        var seen = {};
        var items = [];
        var seqCount = 0;
        var MAX_ITEMS = 200;

        for (var i = 0; i < app.project.sequences.numSequences; i++) {
            var seq = app.project.sequences[i];
            if (seq.name.indexOf("_Backup_") >= 0 || seq.name.indexOf("_Fail") >= 0) continue;
            seqCount++;

            var m = seq.markers;
            var numM = 0;
            try { numM = m.numMarkers; } catch(eN) { continue; }
            if (numM === 0) continue;

            var seenHere = {};
            var marker = m.getFirstMarker();
            while (marker) {
                var trimmed = epText(marker.comments);
                if (trimmed.indexOf("OUT:") !== 0) {
                    var note = "";
                    var dashIdx = trimmed.indexOf(" - ");
                    if (dashIdx > 0) note = epText(trimmed.substring(0, dashIdx));

                    var name = epText(marker.name);
                    var key = name + "\u0000" + note;
                    if (seen[key] === undefined) {
                        if (items.length < MAX_ITEMS) {
                            seen[key] = items.length;
                            items.push({ name: name, note: note, count: 1, sequences: 1 });
                            seenHere[key] = true;
                        }
                    } else {
                        var it = items[seen[key]];
                        it.count++;
                        if (!seenHere[key]) { it.sequences++; seenHere[key] = true; }
                    }
                }
                try { marker = m.getNextMarker(marker); } catch(eX) { marker = null; }
            }
        }

        return JSON.stringify({
            success: true,
            items: items,
            sequenceCount: seqCount,
            truncated: items.length >= MAX_ITEMS
        });
    } catch(e) {
        return JSON.stringify({ error: "Error al leer nombres de marcadores: " + e.message });
    }
}

// ─── Duración de marcadores existentes ───────────────────────

/**
 * Asigna una duración (endTime absoluto en segundos) a marcadores existentes.
 * items: [{ start, endTime, comment? }] — match por start (±0.05s) y comentario
 * opcional. Intenta asignar marker.end in-place; si Premiere no lo acepta,
 * borra y recrea el marcador conservando nombre, comentario y color.
 */
function setMarkerDurations(jsonPath, seqId) {
    try {
        var seq;
        if (seqId) {
            seq = findSequenceById(seqId);
            if (!seq) return JSON.stringify({ error: "Secuencia no encontrada: " + seqId });
        } else {
            seq = app.project.activeSequence;
            if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });
        }

        var f = new File(jsonPath);
        if (!f.exists) return JSON.stringify({ error: "Archivo no encontrado: " + jsonPath });
        f.encoding = "UTF-8"; f.open("r"); var content = f.read(); f.close();
        var items = JSON.parse(content);

        var EPS = 0.05;
        var m = seq.markers;
        var updated = 0;
        var recreated = 0;
        var notFound = [];

        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var startS = parseFloat(it.start);
            var endS = parseFloat(it.endTime);
            if (isNaN(startS) || isNaN(endS) || endS <= startS) {
                notFound.push(it.start);
                continue;
            }

            var target = null;
            var marker = m.getFirstMarker();
            while (marker) {
                if (Math.abs(marker.start.seconds - startS) < EPS) {
                    if (!it.comment || (marker.comments || "") === it.comment) {
                        target = marker;
                        break;
                    }
                    if (target === null) target = marker; // fallback solo por tiempo
                }
                try { marker = m.getNextMarker(marker); } catch(eN) { marker = null; }
            }

            if (!target) {
                notFound.push(startS);
                continue;
            }

            // 1) Intento in-place
            var ok = false;
            try {
                target.end = endS;
                var readBack = target.end.seconds;
                ok = (Math.abs(readBack - endS) < 0.1);
            } catch(eSet) {
                ok = false;
            }
            if (ok) {
                updated++;
                continue;
            }

            // 2) Fallback: borrar + recrear con la duración deseada
            var res = epRecreateMarker(m, target, startS, endS);
            if (res.error) notFound.push(startS);
            else recreated++;
        }

        return JSON.stringify({
            success: true,
            updated: updated,
            recreated: recreated,
            requested: items.length,
            notFound: notFound,
            sequenceName: seq.name,
            markerCount: m.numMarkers
        });
    } catch(e) {
        return JSON.stringify({ error: "Error al asignar duraciones: " + e.message });
    }
}

// ─── Multi-Sequence Support ──────────────────────────────────

function getAllProjectSequences() {
    try {
        app.enableQE();
        var activeSeq = app.project.activeSequence;
        var activeId = activeSeq ? activeSeq.sequenceID : "";

        // Collect info for all non-backup project sequences
        var seqInfo = {};
        for (var i = 0; i < app.project.sequences.numSequences; i++) {
            var seq = app.project.sequences[i];
            if (seq.name.indexOf("_Backup_") >= 0 || seq.name.indexOf("_Fail") >= 0) continue;
            var mc = 0;
            try { mc = seq.markers.numMarkers; } catch(e) {}
            seqInfo[seq.sequenceID] = {
                name: seq.name,
                sequenceID: seq.sequenceID,
                duration: seq.end,
                markerCount: mc
            };
        }

        // Discover open tabs by closing each active tab and recording its ID.
        // openIds is collected in REVERSE tab order (last closed = leftmost tab).
        var openIds = [];
        var safety = 200;
        while (safety-- > 0) {
            var current = app.project.activeSequence;
            if (!current) break;

            var cid = current.sequenceID;
            var isDup = false;
            for (var d = 0; d < openIds.length; d++) {
                if (openIds[d] === cid) { isDup = true; break; }
            }
            if (isDup) break;

            openIds.push(cid);

            try {
                qe.project.getActiveSequence().close();
                $.sleep(80);
            } catch(e) { break; }
        }

        // Reopen in REVERSE order so the first-closed (rightmost) opens first,
        // and the last-closed (leftmost) opens last → preserves original tab order.
        for (var r = openIds.length - 1; r >= 0; r--) {
            app.project.openSequence(openIds[r]);
            $.sleep(50);
        }

        // Restore the originally active tab on top
        if (activeId) {
            $.sleep(100);
            app.project.openSequence(activeId);
        }

        // Build results marking open/closed
        var openSet = {};
        for (var o = 0; o < openIds.length; o++) openSet[openIds[o]] = true;

        var results = [];
        for (var id in seqInfo) {
            if (!seqInfo.hasOwnProperty(id)) continue;
            var s = seqInfo[id];
            results.push({
                name: s.name,
                sequenceID: s.sequenceID,
                duration: s.duration,
                markerCount: s.markerCount,
                isActive: (s.sequenceID === activeId),
                isOpen: !!openSet[s.sequenceID]
            });
        }

        return JSON.stringify({ success: true, sequences: results, probeReliable: (openIds.length > 0) });
    } catch(e) {
        return JSON.stringify({ error: "Error al listar secuencias: " + e.message });
    }
}

function listProjectSequences() {
    try {
        var results = [];
        for (var i = 0; i < app.project.sequences.numSequences; i++) {
            var seq = app.project.sequences[i];
            if (seq.name.indexOf("_Backup_") >= 0 || seq.name.indexOf("_Fail") >= 0) continue;
            results.push({
                name: seq.name,
                sequenceID: seq.sequenceID
            });
        }
        return JSON.stringify({ success: true, sequences: results });
    } catch(e) {
        return JSON.stringify({ error: e.message });
    }
}

function getMarkersForSequence(seqId) {
    try {
        var targetSeq = null;
        for (var i = 0; i < app.project.sequences.numSequences; i++) {
            if (app.project.sequences[i].sequenceID === seqId) {
                targetSeq = app.project.sequences[i];
                break;
            }
        }
        if (!targetSeq) return JSON.stringify({ error: "Secuencia no encontrada." });

        var markers = [];
        var m = targetSeq.markers;

        if (m.numMarkers > 0) {
            var marker = m.getFirstMarker();
            while (marker) {
                var info = {
                    name: marker.name || "",
                    comments: marker.comments || "",
                    startSeconds: marker.start.seconds,
                    endSeconds: marker.end.seconds,
                    colorIndex: -1
                };
                info.colorIndex = epGetMarkerColor(marker);
                markers.push(info);
                try { marker = m.getNextMarker(marker); } catch(e) { marker = null; }
            }
        }

        return JSON.stringify({
            success: true,
            seqId: seqId,
            seqName: targetSeq.name,
            duration: targetSeq.end,
            markers: markers,
            count: markers.length
        });
    } catch(e) {
        return JSON.stringify({ error: "Error: " + e.message });
    }
}

function openSequenceById(seqId) {
    try {
        var targetSeq = null;
        for (var i = 0; i < app.project.sequences.numSequences; i++) {
            if (app.project.sequences[i].sequenceID === seqId) {
                targetSeq = app.project.sequences[i];
                break;
            }
        }
        if (!targetSeq) return JSON.stringify({ error: "Secuencia no encontrada." });

        app.project.openSequence(targetSeq.sequenceID);
        $.sleep(1000);

        var activeSeq = app.project.activeSequence;
        var retries = 0;
        while ((!activeSeq || activeSeq.sequenceID !== seqId) && retries < 15) {
            $.sleep(500);
            activeSeq = app.project.activeSequence;
            retries++;
        }

        var verified = activeSeq && activeSeq.sequenceID === seqId;

        return JSON.stringify({
            success: true,
            verified: verified,
            name: targetSeq.name,
            activeName: activeSeq ? activeSeq.name : "none",
            sequenceID: targetSeq.sequenceID
        });
    } catch(e) {
        return JSON.stringify({ error: "Error: " + e.message });
    }
}

// ─── Enable All Tracks ───────────────────────────────────────

function enableAllTracks(seq) {
    app.enableQE();
    var qeSeq = qe.project.getActiveSequence();
    if (!qeSeq) return;

    for (var v = 0; v < qeSeq.numVideoTracks; v++) {
        try {
            var vt = qeSeq.getVideoTrackAt(v);
            if (vt) vt.setLock(false);
        } catch(e) {}
    }
    for (var a = 0; a < qeSeq.numAudioTracks; a++) {
        try {
            var at2 = qeSeq.getAudioTrackAt(a);
            if (at2) at2.setLock(false);
        } catch(e) {}
        try { seq.audioTracks[a].setMute(0); } catch(e) {}
    }
}

// ─── Helpers ─────────────────────────────────────────────────

function countAllClips(seq) {
    var total = 0;
    for (var v = 0; v < seq.videoTracks.numTracks; v++) {
        try { total += seq.videoTracks[v].clips.numItems; } catch(e) {}
    }
    for (var a = 0; a < seq.audioTracks.numTracks; a++) {
        try { total += seq.audioTracks[a].clips.numItems; } catch(e) {}
    }
    return total;
}

function discoverMethods(obj, label) {
    var found = [];
    try {
        var r = obj.reflect;
        if (r && r.methods) {
            for (var i = 0; i < r.methods.length; i++) {
                found.push(r.methods[i].name);
            }
        }
    } catch(e) {
        found.push("reflect-error:" + e.message);
    }
    return found;
}

function secsToTicks(seconds) {
    return String(Math.round(parseFloat(seconds) * TICKS_PER_SECOND));
}

/** Ticks que dura un frame de la secuencia. 0 si Premiere no lo dice. */
function ticksPerFrameOf(seq) {
    var tpf = 0;
    try { tpf = parseFloat(seq.timebase); } catch(e) {}
    if (!(tpf > 0)) {
        try {
            var settings = seq.getSettings();
            var frameDur = (settings && settings.videoFrameRate)
                ? parseFloat(settings.videoFrameRate.seconds) : 0;
            if (frameDur > 0) tpf = frameDur * TICKS_PER_SECOND;
        } catch(e2) {}
    }
    return (tpf > 0) ? tpf : 0;
}

/**
 * Segundos → ticks, pegados a la rejilla de frames de la secuencia.
 *
 * Premiere edita por frames: un punto de entrada/salida a mitad de frame hace
 * que el extract ripplee una cantidad NO entera de frames y la unión queda con
 * un hueco (o un frame de sobra). Y a mitad de frame llegan siempre: los tiempos
 * salen de marcadores clavados en un frame, pero viajan al panel y vuelven como
 * segundos redondeados al milisegundo, y a 30 fps dos de cada tres frames no
 * caen en un milisegundo exacto (a 29.97, ninguno). Medio milisegundo es una
 * centésima de frame, así que volver al frame más cercano es exacto.
 */
function secsToFrameTicks(seconds, ticksPerFrame) {
    var ticks = parseFloat(seconds) * TICKS_PER_SECOND;
    if (!(ticksPerFrame > 0)) return String(Math.round(ticks));
    return String(Math.round(ticks / ticksPerFrame) * ticksPerFrame);
}

function getClipRangesOnTrack(trackIndex) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });
        var idx = parseInt(trackIndex);
        if (isNaN(idx) || idx < 0 || idx >= seq.videoTracks.numTracks) {
            return JSON.stringify({ error: "Pista V" + (idx + 1) + " no encontrada." });
        }
        var track = seq.videoTracks[idx];
        var ranges = [];
        var skipped = 0;
        for (var i = 0; i < track.clips.numItems; i++) {
            var clip = track.clips[i];
            var enabled = true;
            try { enabled = !clip.disabled; } catch(_e) {
                try { enabled = clip.enabled !== false; } catch(_e2) {}
            }
            if (!enabled) { skipped++; continue; }
            ranges.push({
                start: parseFloat(clip.start.seconds),
                end: parseFloat(clip.end.seconds),
                name: (function() { try { return clip.name; } catch(_e) { return ""; } })()
            });
        }
        return JSON.stringify({ success: true, ranges: ranges, trackIndex: idx, clipCount: ranges.length, skippedDisabled: skipped });
    } catch(e) {
        return JSON.stringify({ error: "Error leyendo pista: " + e.message });
    }
}


// ─── Sequence lookup by ID ─────────────────────────────────
function findSequenceById(seqId) {
    for (var i = 0; i < app.project.sequences.numSequences; i++) {
        if (app.project.sequences[i].sequenceID === seqId) return app.project.sequences[i];
    }
    return null;
}
