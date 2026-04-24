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
        if (t === "string") return '"' + obj.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r") + '"';
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

        return JSON.stringify({
            name: seq.name,
            duration: seq.end,
            durationSeconds: parseFloat(seq.end) / TICKS_PER_SECOND,
            frameRate: fps,
            markerCount: seq.markers.numMarkers,
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
                try { info.colorIndex = marker.getColorByIndex(0); } catch(ec) {}
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

function backupSequence() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        _backupSeqName = seq.name;
        _originalSeqId = seq.sequenceID;
        var originalSeqId = seq.sequenceID;

        // Build datetime string: YYYY-MM-DD_HH-MM
        var now = new Date();
        var y = now.getFullYear();
        var mo = (now.getMonth() + 1 < 10 ? "0" : "") + (now.getMonth() + 1);
        var d = (now.getDate() < 10 ? "0" : "") + now.getDate();
        var h = (now.getHours() < 10 ? "0" : "") + now.getHours();
        var mi = (now.getMinutes() < 10 ? "0" : "") + now.getMinutes();
        var dateStr = y + "-" + mo + "-" + d + "_" + h + "-" + mi;

        var backupSeqName = seq.name + "_Backup_" + dateStr;

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

function getPostCutMarkers() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        var markers = [];
        var m = seq.markers;

        if (m.numMarkers > 0) {
            var marker = m.getFirstMarker();
            var idx = 0;
            while (marker) {
                var raw = (marker.comments || "").trim();
                var isOut = (raw.indexOf("OUT:") === 0);
                var hasComment = false;
                var editorNote = "";
                var transcript = "";

                if (!isOut) {
                    var dashIdx = raw.indexOf(" - ");
                    if (dashIdx > 0) {
                        hasComment = true;
                        editorNote = raw.substring(0, dashIdx).trim();
                        transcript = raw.substring(dashIdx + 3).trim();
                    } else if (raw.indexOf("- ") === 0) {
                        transcript = raw.substring(2).trim();
                    } else {
                        transcript = raw;
                    }
                }

                var ci = -1;
                try { ci = marker.getColorByIndex(0); } catch(e) {}

                markers.push({
                    index: idx,
                    name: marker.name || "",
                    comments: raw,
                    startSeconds: marker.start.seconds,
                    isOut: isOut,
                    hasComment: hasComment,
                    editorNote: editorNote,
                    transcript: transcript,
                    colorIndex: ci
                });

                idx++;
                try { marker = m.getNextMarker(marker); } catch(e) { marker = null; }
            }
        }

        return JSON.stringify({ success: true, markers: markers, count: markers.length });
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
            var raw = (marker.comments || "").trim();
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

function colorizeCommentMarkers() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        var m = seq.markers;
        var colored = 0;
        var marker = m.getFirstMarker();

        while (marker) {
            var raw = (marker.comments || "").trim();
            var isOut = (raw.indexOf("OUT:") === 0);
            var dashIdx = raw.indexOf(" - ");
            var hasComment = (!isOut && dashIdx > 0);

            if (hasComment) {
                try {
                    marker.setColorByIndex(0, 6);
                    colored++;
                } catch(e) {}
            }

            try { marker = m.getNextMarker(marker); } catch(e) { marker = null; }
        }

        return JSON.stringify({ success: true, colored: colored });
    } catch(e) {
        return JSON.stringify({ error: "Error: " + e.message });
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
                try { info.colorIndex = marker.getColorByIndex(0); } catch(ec) {}
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

// ─── Execute Cuts (Main Entry) ───────────────────────────────

function executeCuts(filePath) {
    var log = [];
    var stats = { razored: 0, removed: 0, errors: 0, method: "ninguno" };

    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        log.push("Secuencia: " + seq.name);
        log.push("Video tracks: " + seq.videoTracks.numTracks);
        log.push("Audio tracks: " + seq.audioTracks.numTracks);

        var f = new File(filePath);
        if (!f.exists) return JSON.stringify({ error: "Archivo no encontrado: " + filePath });
        f.encoding = "UTF-8"; f.open("r"); var content = f.read(); f.close();

        var data = JSON.parse(content);
        var removeZones = data.removeZones;
        if (!removeZones || removeZones.length === 0) {
            return JSON.stringify({ success: true, message: "Sin zonas a eliminar.", stats: stats });
        }

        log.push("Zonas a eliminar: " + removeZones.length);
        for (var zz = 0; zz < removeZones.length; zz++) {
            log.push("  Zona " + zz + ": " + parseFloat(removeZones[zz].start).toFixed(2) + "s - " + parseFloat(removeZones[zz].end).toFixed(2) + "s (" + removeZones[zz].label + ")");
        }

        enableAllTracks(seq);
        log.push("Tracks habilitados");

        var clipsBefore = countAllClips(seq);
        log.push("Clips totales antes: " + clipsBefore);

        // ── Enable QE & Discover Methods ──
        var qeSeq = null;
        try {
            app.enableQE();
            log.push("app.enableQE() OK");
        } catch(e) {
            log.push("app.enableQE() FALLO: " + e.message);
        }

        try {
            if (typeof qe !== "undefined" && qe !== null) {
                qeSeq = qe.project.getActiveSequence();
                if (qeSeq) {
                    log.push("QE secuencia: " + (qeSeq.name || "OK"));
                    log.push("QE V=" + qeSeq.numVideoTracks + " A=" + qeSeq.numAudioTracks);

                    var seqMethods = discoverMethods(qeSeq, "qeSeq");
                    log.push("QE seq metodos: " + seqMethods.join(", "));

                    if (qeSeq.numVideoTracks > 0) {
                        try {
                            var t0 = qeSeq.getVideoTrackAt(0);
                            var trackMethods = discoverMethods(t0, "qeTrack");
                            log.push("QE track metodos: " + trackMethods.join(", "));
                        } catch(e) {}
                    }
                } else {
                    log.push("QE secuencia es NULL");
                }
            } else {
                log.push("qe global NO disponible");
            }
        } catch(e) {
            log.push("QE check ERROR: " + e.message);
        }

        // Also discover Sequence DOM methods
        try {
            var domMethods = discoverMethods(seq, "seq");
            log.push("DOM seq metodos: " + domMethods.join(", "));
        } catch(e) {}

        // ══════════════════════════════════════════════════════════
        // STRATEGY: Set In/Out points + Extract for each zone
        // Process zones from END to START so time shifts don't affect earlier zones
        // ══════════════════════════════════════════════════════════

        log.push("=== ESTRATEGIA: In/Out + Extract ===");
        stats.method = "InOut+Extract";

        for (var z = removeZones.length - 1; z >= 0; z--) {
            var zStart = parseFloat(removeZones[z].start);
            var zEnd = parseFloat(removeZones[z].end);
            var startTicks = secsToTicks(zStart);
            var endTicks = secsToTicks(zEnd);

            log.push("Zona " + z + " [" + zStart.toFixed(2) + "s - " + zEnd.toFixed(2) + "s] (" + removeZones[z].label + ")");

            // Set In point
            var inOK = false;
            try {
                seq.setInPoint(startTicks);
                inOK = true;
                log.push("  setInPoint(" + zStart.toFixed(2) + "s) OK");
            } catch(e) {
                log.push("  setInPoint(ticks) ERR: " + e.message);
                try {
                    seq.setInPoint(zStart);
                    inOK = true;
                    log.push("  setInPoint(seconds) OK");
                } catch(e2) {
                    log.push("  setInPoint(seconds) ERR: " + e2.message);
                }
            }

            // Set Out point
            var outOK = false;
            try {
                seq.setOutPoint(endTicks);
                outOK = true;
                log.push("  setOutPoint(" + zEnd.toFixed(2) + "s) OK");
            } catch(e) {
                log.push("  setOutPoint(ticks) ERR: " + e.message);
                try {
                    seq.setOutPoint(zEnd);
                    outOK = true;
                    log.push("  setOutPoint(seconds) OK");
                } catch(e2) {
                    log.push("  setOutPoint(seconds) ERR: " + e2.message);
                }
            }

            $.sleep(500);

            if (!inOK || !outOK) {
                log.push("  SKIP: No se pudo poner In/Out");
                stats.errors++;
                continue;
            }

            var extracted = false;

            if (qeSeq) {
                var extractNames = [
                    "extract", "extractEdit", "performExtractEdit",
                    "performExtract", "rippleDelete", "performRippleDelete",
                    "rippleDeleteInOut", "extractInOut", "performExtraction",
                    "editExtract", "removeInOut", "deleteInOut"
                ];
                for (var em = 0; em < extractNames.length && !extracted; em++) {
                    try {
                        if (typeof qeSeq[extractNames[em]] === "function") {
                            qeSeq[extractNames[em]]();
                            extracted = true;
                            log.push("  qeSeq." + extractNames[em] + "() OK!");
                            stats.removed++;
                        }
                    } catch(e) {
                        log.push("  qeSeq." + extractNames[em] + "() ERR: " + e.message);
                    }
                }

                // Also try on the player sub-object
                if (!extracted) {
                    try {
                        var player = qeSeq.player;
                        if (player) {
                            var playerMethods = discoverMethods(player, "player");
                            log.push("  QE player metodos: " + playerMethods.join(", "));
                            var playerExtract = ["extract", "extractEdit", "performExtract", "rippleDelete"];
                            for (var pe = 0; pe < playerExtract.length && !extracted; pe++) {
                                try {
                                    if (typeof player[playerExtract[pe]] === "function") {
                                        player[playerExtract[pe]]();
                                        extracted = true;
                                        log.push("  player." + playerExtract[pe] + "() OK!");
                                        stats.removed++;
                                    }
                                } catch(e) {
                                    log.push("  player." + playerExtract[pe] + "() ERR: " + e.message);
                                }
                            }
                        }
                    } catch(e) {
                        log.push("  player access ERR: " + e.message);
                    }
                }
            }

            // If QE extract failed, try DOM-level methods
            if (!extracted) {
                var domExtract = ["extractEdit", "extract", "performExtract", "rippleDelete"];
                for (var de = 0; de < domExtract.length && !extracted; de++) {
                    try {
                        if (typeof seq[domExtract[de]] === "function") {
                            seq[domExtract[de]]();
                            extracted = true;
                            log.push("  seq." + domExtract[de] + "() OK!");
                            stats.removed++;
                        }
                    } catch(e) {
                        log.push("  seq." + domExtract[de] + "() ERR: " + e.message);
                    }
                }
            }

            if (!extracted) {
                log.push("  NINGÚN método de extract funciono para esta zona");
                stats.errors++;
            }

            $.sleep(700);
        }

        $.sleep(500);
        var clipsAfterExtract = countAllClips(seq);
        log.push("Clips despues de extract: " + clipsAfterExtract + " (antes: " + clipsBefore + ")");

        // ══════════════════════════════════════════════════════════
        // FALLBACK: If extract didn't work, try QE razor + manual trim/delete
        // ══════════════════════════════════════════════════════════

        if (clipsAfterExtract >= clipsBefore && stats.removed === 0) {
            log.push("=== FALLBACK: Razor + Trim manual ===");
            stats.method = "ManualTrim";
            stats.errors = 0;

            // Re-read zones (timecodes haven't shifted since extract didn't work)
            for (var z2 = removeZones.length - 1; z2 >= 0; z2--) {
                var zs2 = parseFloat(removeZones[z2].start);
                var ze2 = parseFloat(removeZones[z2].end);

                log.push("Zona " + z2 + " [" + zs2.toFixed(2) + "s - " + ze2.toFixed(2) + "s]");

                // For each track, handle clips that overlap this zone
                for (var v = 0; v < seq.videoTracks.numTracks; v++) {
                    trimZoneOnTrack(seq.videoTracks[v], zs2, ze2, stats, log, "V" + v);
                }
                for (var a = 0; a < seq.audioTracks.numTracks; a++) {
                    trimZoneOnTrack(seq.audioTracks[a], zs2, ze2, stats, log, "A" + a);
                }

                $.sleep(300);
            }

            var clipsAfterTrim = countAllClips(seq);
            log.push("Clips despues de trim: " + clipsAfterTrim + " (antes: " + clipsBefore + ")");
        }

        // ── Clear In/Out marks ──
        try { seq.setInPoint(seq.zeroPoint); } catch(e) {}
        try { seq.setOutPoint(seq.end); } catch(e) {}

        var clipsFinal = countAllClips(seq);
        log.push("=== RESULTADO ===");
        log.push("Clips finales: " + clipsFinal + " (original: " + clipsBefore + ")");
        log.push("Metodo: " + stats.method);
        log.push("Eliminados: " + stats.removed + ", Errores: " + stats.errors);

        // Write log to disk
        writeLog(filePath, log);

        return JSON.stringify({
            success: true,
            message: "Metodo: " + stats.method + ". Eliminados: " + stats.removed + ", Errores: " + stats.errors,
            stats: stats,
            log: log
        });
    } catch(e) {
        log.push("ERROR FATAL: " + e.message + " (linea " + e.line + ")");
        writeLog(filePath, log);
        return JSON.stringify({ error: e.message, log: log });
    }
}

// ─── Manual Trim for clips overlapping a zone ────────────────
// Handles: clip entirely inside (remove), clip ends in zone (trim end),
//          clip starts in zone (trim start), clip spans zone (trim both ends)

function trimZoneOnTrack(track, zStart, zEnd, stats, log, label) {
    var nc = 0;
    try { nc = track.clips.numItems; } catch(e) { return; }
    if (nc === 0) return;

    var EPS = 0.05;

    // Read all clip info first (since we'll modify them)
    var clips = [];
    for (var c = 0; c < nc; c++) {
        try {
            var clip = track.clips[c];
            clips.push({
                idx: c,
                clip: clip,
                start: clip.start.seconds,
                end: clip.end.seconds,
                inPt: clip.inPoint.seconds,
                outPt: clip.outPoint.seconds
            });
        } catch(e) {}
    }

    // Process backward for index stability
    for (var i = clips.length - 1; i >= 0; i--) {
        var ci = clips[i];
        if (ci.end <= zStart + EPS || ci.start >= zEnd - EPS) continue;

        // Case 1: Clip entirely inside zone -> remove it
        if (ci.start >= zStart - EPS && ci.end <= zEnd + EPS) {
            try {
                ci.clip.remove(true, true);
                stats.removed++;
                log.push("  " + label + "[" + ci.idx + "] REMOVE (" + ci.start.toFixed(2) + "-" + ci.end.toFixed(2) + ")");
            } catch(e) {
                log.push("  " + label + "[" + ci.idx + "] REMOVE ERR: " + e.message);
                stats.errors++;
            }
            $.sleep(100);
            continue;
        }

        // Case 2: Clip starts before zone, ends inside -> trim end to zone start
        if (ci.start < zStart - EPS && ci.end > zStart + EPS && ci.end <= zEnd + EPS) {
            try {
                var newOutPt = ci.inPt + (zStart - ci.start);
                ci.clip.outPoint = newOutPt;
                ci.clip.end = zStart;
                stats.removed++;
                log.push("  " + label + "[" + ci.idx + "] TRIM-END -> " + zStart.toFixed(2) + "s");
            } catch(e) {
                log.push("  " + label + "[" + ci.idx + "] TRIM-END ERR: " + e.message);
                stats.errors++;
            }
            $.sleep(100);
            continue;
        }

        // Case 3: Clip starts inside zone, ends after -> trim start to zone end
        if (ci.start >= zStart - EPS && ci.start < zEnd - EPS && ci.end > zEnd + EPS) {
            try {
                var trimDuration = zEnd - ci.start;
                ci.clip.inPoint = ci.inPt + trimDuration;
                ci.clip.start = zEnd;
                stats.removed++;
                log.push("  " + label + "[" + ci.idx + "] TRIM-START -> " + zEnd.toFixed(2) + "s");
            } catch(e) {
                log.push("  " + label + "[" + ci.idx + "] TRIM-START ERR: " + e.message);
                stats.errors++;
            }
            $.sleep(100);
            continue;
        }

        // Case 4: Clip spans entire zone (starts before, ends after)
        // We can only trim the end to zone start (losing everything after zone start)
        // This is destructive but it's the best we can do without razor
        if (ci.start < zStart - EPS && ci.end > zEnd + EPS) {
            log.push("  " + label + "[" + ci.idx + "] SPANS zona (" + ci.start.toFixed(2) + "-" + ci.end.toFixed(2) + ") - trim end solo");
            try {
                var newOut = ci.inPt + (zStart - ci.start);
                ci.clip.outPoint = newOut;
                ci.clip.end = zStart;
                stats.removed++;
                log.push("    -> clip.end = " + zStart.toFixed(2) + "s (pierde contenido despues)");
            } catch(e) {
                log.push("    TRIM ERR: " + e.message);
                stats.errors++;
            }
            $.sleep(100);
            continue;
        }
    }
}

function writeLog(filePath, log) {
    try {
        var logPath = filePath.replace(".json", "_log.txt");
        var lf = new File(logPath);
        lf.encoding = "UTF-8"; lf.open("w"); lf.write(log.join("\n")); lf.close();
    } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════
// SpellCheck / Supertexts / EditSuggestions Host Functions
// ═══════════════════════════════════════════════════════════════

function exportSequenceXML() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });
        var tmpPath = Folder.temp.fsName + "/EditorPro_SeqExport.xml";
        seq.exportAsFinalCutProXML(tmpPath, 1);
        var f = new File(tmpPath);
        if (!f.exists) return JSON.stringify({ error: "No se pudo exportar el XML." });
        return JSON.stringify({ success: true, path: tmpPath, sequenceName: seq.name });
    } catch(e) {
        return JSON.stringify({ error: "Error al exportar XML: " + e.message });
    }
}

function findSequenceById(seqId) {
    for (var i = 0; i < app.project.sequences.numSequences; i++) {
        if (app.project.sequences[i].sequenceID === seqId) return app.project.sequences[i];
    }
    return null;
}

function addMarkersFromFile(filePath, seqId) {
    try {
        var seq;
        if (seqId) {
            seq = findSequenceById(seqId);
            if (!seq) return JSON.stringify({ error: "Secuencia no encontrada: " + seqId });
        } else {
            seq = app.project.activeSequence;
            if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });
        }
        var f = new File(filePath);
        if (!f.exists) return JSON.stringify({ error: "Archivo no encontrado: " + filePath });
        f.encoding = "UTF-8"; f.open("r"); var content = f.read(); f.close();
        var items = JSON.parse(content);
        var placed = 0;
        for (var i = 0; i < items.length; i++) {
            try {
                var item = items[i];
                var startSecs = parseFloat(item.time);
                if (isNaN(startSecs) || startSecs < 0) continue;
                var marker = seq.markers.createMarker(startSecs);
                marker.name = item.name || "";
                marker.comments = item.comment || "";
                if (item.endTime !== undefined) {
                    var endSecs = parseFloat(item.endTime);
                    if (!isNaN(endSecs) && endSecs > startSecs)
                        try { marker.end = endSecs; } catch(e4) {}
                }
                if (item.color !== undefined && item.color >= 0)
                    try { marker.setColorByIndex(parseInt(item.color)); } catch(e2) {}
                placed++;
            } catch(e3) {}
        }
        return JSON.stringify({ success: true, placed: placed, total: items.length, sequenceName: seq.name });
    } catch(e) {
        return JSON.stringify({ error: "Error al crear marcadores: " + e.message });
    }
}

function clearMarkersByPrefix(prefix, seqId) {
    try {
        var seq;
        if (seqId) {
            seq = findSequenceById(seqId);
            if (!seq) return JSON.stringify({ error: "Secuencia no encontrada." });
        } else {
            seq = app.project.activeSequence;
            if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });
        }
        var toRemove = [];
        var m = seq.markers;
        if (m.numMarkers > 0) {
            var marker = m.getFirstMarker();
            while (marker) {
                if (marker.name.indexOf(prefix) === 0) toRemove.push(marker);
                try { marker = m.getNextMarker(marker); } catch(e) { marker = null; }
            }
        }
        for (var i = 0; i < toRemove.length; i++) m.deleteMarker(toRemove[i]);
        return JSON.stringify({ success: true, removed: toRemove.length });
    } catch(e) {
        return JSON.stringify({ error: "Error: " + e.message });
    }
}

function getSequenceCaptions() {
    var seq = app.project.activeSequence;
    if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });
    try { app.project.save(); } catch(e) {}
    return JSON.stringify({
        success: true,
        projectPath: app.project.path,
        sequenceName: seq.name,
        sequenceId: seq.sequenceID
    });
}

function getSequenceTranscriptInfo() {
    var seq = app.project.activeSequence;
    if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });
    try { app.project.save(); } catch(e) {}

    var mediaPaths = [];
    var seen = {};
    function collectFromTracks(trackGroup) {
        for (var i = 0; i < trackGroup.numTracks; i++) {
            var track = trackGroup[i];
            for (var j = 0; j < track.clips.numItems; j++) {
                try {
                    var clip = track.clips[j];
                    if (clip.projectItem) {
                        var mp = clip.projectItem.getMediaPath();
                        if (mp && !seen[mp]) {
                            mediaPaths.push(mp);
                            seen[mp] = true;
                        }
                    }
                } catch(e) {}
            }
        }
    }
    try { collectFromTracks(seq.audioTracks); } catch(e) {}
    try { collectFromTracks(seq.videoTracks); } catch(e) {}

    return JSON.stringify({
        success: true,
        projectPath: app.project.path,
        sequenceName: seq.name,
        sequenceId: seq.sequenceID,
        mediaPaths: mediaPaths
    });
}

// ═══════════════════════════════════════════════════════════════
// Smart Supertext 2 — MOGRT Graphics Insertion
// ═══════════════════════════════════════════════════════════════

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
    // --- Approach A: getMGTComponent (preferred, returns Essential Properties) ---
    try {
        if (typeof trackItem.getMGTComponent === "function") {
            var moComp = trackItem.getMGTComponent();
            if (moComp && moComp.properties && moComp.properties.numItems > 0) {
                // Try each property in the MGT component — the first text-like one wins
                for (var p = 0; p < moComp.properties.numItems; p++) {
                    var prop = moComp.properties[p];
                    if (!prop) continue;
                    var dn = "";
                    try { dn = prop.displayName; } catch(e) {}

                    // Check if it looks like a text property (any language)
                    var isText = (dn.indexOf("Text") !== -1) ||
                                 (dn.indexOf("text") !== -1) ||
                                 (dn.indexOf("Texto") !== -1) ||
                                 (dn.indexOf("texto") !== -1) ||
                                 (dn.indexOf("Source") !== -1) ||
                                 (dn.indexOf("Fuente") !== -1) ||
                                 (dn.indexOf("origen") !== -1);

                    // If only 1 property, assume it's the text
                    if (isText || moComp.properties.numItems === 1) {
                        if (_trySetTextValue(prop, newText)) return true;
                    }
                }

                // Last resort: try every property
                for (var p2 = 0; p2 < moComp.properties.numItems; p2++) {
                    var prop2 = moComp.properties[p2];
                    if (!prop2) continue;
                    if (_trySetTextValue(prop2, newText)) return true;
                }

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
            var mn = "";
            try { mn = comp.matchName || ""; } catch(em) {}
            var cn = "";
            try { cn = comp.displayName || ""; } catch(en) {}

            if (mn.indexOf("Text") !== -1 || mn.indexOf("ADBE") !== -1 ||
                cn.indexOf("Text") !== -1 || cn.indexOf("Texto") !== -1) {
                for (var pp = 0; pp < comp.properties.numItems; pp++) {
                    var pr;
                    try { pr = comp.properties[pp]; } catch(ep) { continue; }
                    var dname = "";
                    try { dname = pr.displayName || ""; } catch(ed) {}
                    if (dname.indexOf("Text") !== -1 || dname.indexOf("text") !== -1 ||
                        dname.indexOf("Texto") !== -1 || dname.indexOf("texto") !== -1 ||
                        dname.indexOf("Source") !== -1 || dname.indexOf("origen") !== -1) {
                        if (_trySetTextValue(pr, newText)) return true;
                    }
                }
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

                // 3. Nombre legible en timeline
                var typeTag = (st.type || "").toUpperCase();
                try { trackItem.name = "[" + typeTag + "] " + _mogrtOneLineName(st.text); } catch(eName) {}

                // 4. Disolvencia de salida (Cross Dissolve al final del clip)
                _addOutDissolve(seq, targetTrack, startSecs, 20);

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

function importCaptionsToSequence(srtFilePath) {
    var seq = app.project.activeSequence;
    if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });
    var errors = [];
    try {
        seq.importCaptionFile(srtFilePath);
        return JSON.stringify({ success: true, method: "importCaptionFile" });
    } catch(e1) { errors.push("importCaptionFile: " + e1.message); }
    try {
        var f = new File(srtFilePath);
        seq.importCaptionFile(f.fsName);
        return JSON.stringify({ success: true, method: "importCaptionFile_fsName" });
    } catch(e2) { errors.push("fsName: " + e2.message); }
    try {
        app.project.importFiles([srtFilePath], true, app.project.rootItem, false);
        return JSON.stringify({ success: true, method: "projectImport",
            note: "SRT importado al proyecto." });
    } catch(e3) { errors.push("importFiles: " + e3.message); }
    return JSON.stringify({
        error: "No se pudo importar. Archivo SRT: " + srtFilePath,
        srtPath: srtFilePath, debug: errors.join(" | ")
    });
}

function getPlayheadPosition() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });
        return JSON.stringify({
            seconds: seq.getPlayerPosition().seconds,
            ticks: seq.getPlayerPosition().ticks
        });
    } catch(e) {
        return JSON.stringify({ error: "Error: " + e.message });
    }
}

// ─── Transcribe Folder (next to .prproj) ─────────────────────

function getTranscribeFolder() {
    try {
        var projPath = app.project.path;
        if (!projPath || projPath === "") {
            return JSON.stringify({ error: "El proyecto no ha sido guardado. Guárdalo primero." });
        }

        var projFile = new File(projPath);
        var projDir = projFile.parent;
        var transcribeDir = new Folder(projDir.fsName + "/Transcribe");

        if (!transcribeDir.exists) {
            transcribeDir.create();
        }

        return JSON.stringify({
            success: true,
            path: transcribeDir.fsName,
            projectDir: projDir.fsName
        });
    } catch(e) {
        return JSON.stringify({ error: "Error al crear carpeta Transcribe: " + e.message });
    }
}

// ─── Audio Export Preset ──────────────────────────────────────

function findOrCreateAudioPreset() {
    var cachedPreset = "/tmp/EditorPro_wav_preset.epr";
    var cached = new File(cachedPreset);
    if (cached.exists) {
        return JSON.stringify({ success: true, path: cachedPreset, cached: true });
    }

    try {
        app.encoder.launchEncoder();
        $.sleep(500);

        var exporters = app.encoder.getExporters();
        for (var i = 0; i < exporters.length; i++) {
            var eName = (exporters[i].name || "").toLowerCase();
            if (eName.indexOf("wav") >= 0 || eName.indexOf("waveform") >= 0) {
                var presets = exporters[i].getPresets();
                if (presets.length > 0) {
                    presets[0].writeToFile(cachedPreset);
                    return JSON.stringify({ success: true, path: cachedPreset, cached: false });
                }
            }
        }
    } catch(ex1) {}

    var years = ["2026", "2025", "2024", "2023", "2022"];
    for (var y = 0; y < years.length; y++) {
        var amePath = "/Applications/Adobe Media Encoder " + years[y];
        var presetBase = amePath + "/Adobe Media Encoder " + years[y] + ".app/Contents/MediaIO/systempresets";
        var presetFolder = new Folder(presetBase);
        if (presetFolder.exists) {
            var files = presetFolder.getFiles("*.epr");
            for (var f = 0; f < files.length; f++) {
                var fname = files[f].name.toLowerCase();
                if (fname.indexOf("wav") >= 0 || fname.indexOf("48") >= 0 || fname.indexOf("uncompressed") >= 0) {
                    return JSON.stringify({ success: true, path: files[f].fsName, cached: false });
                }
            }
        }
    }

    return JSON.stringify({
        error: "No se encontró un preset de exportación WAV. " +
               "Asegúrate de que Adobe Media Encoder esté instalado."
    });
}

// ─── Export Sequence Audio ────────────────────────────────────

function exportSequenceAudio(presetPath) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        var projPath = app.project.path;
        var outputDir = "/tmp";
        var projDir = "";

        if (projPath && projPath !== "") {
            var projFile = new File(projPath);
            projDir = projFile.parent.fsName;
            var transcribeDir = new Folder(projDir + "/Transcribe");
            if (!transcribeDir.exists) transcribeDir.create();
            if (transcribeDir.exists) outputDir = transcribeDir.fsName;
        }

        var safeName = seq.name.replace(/[^a-zA-Z0-9_\-\. áéíóúñÁÉÍÓÚÑ]/g, "_");
        var d = new Date();
        var yy = ("0" + (d.getFullYear() % 100)).slice(-2);
        var mm = ("0" + (d.getMonth() + 1)).slice(-2);
        var dd = ("0" + (d.getDate())).slice(-2);
        var hh = ("0" + d.getHours()).slice(-2);
        var min = ("0" + d.getMinutes()).slice(-2);
        var ss = ("0" + d.getSeconds()).slice(-2);
        var baseName = safeName + "_" + yy + "-" + mm + "-" + dd + "_" + hh + "-" + min + "-" + ss;
        var outputPath = outputDir + "/" + baseName + ".wav";

        var existing = new File(outputPath);
        if (existing.exists) existing.remove();

        seq.exportAsMediaDirect(outputPath, presetPath, 0);

        var exported = new File(outputPath);
        if (!exported.exists) {
            return JSON.stringify({ error: "La exportación no generó archivo. Verifica que el preset sea válido." });
        }

        var durationSecs = 0;
        try { durationSecs = seq.end.seconds || 0; } catch(ex2) {}

        return JSON.stringify({
            success: true,
            path: outputPath,
            baseName: baseName,
            transcribeFolder: outputDir,
            sequenceName: seq.name,
            durationSeconds: durationSecs
        });
    } catch(e) {
        return JSON.stringify({ error: "Error al exportar audio: " + e.message });
    }
}

// ─── Sequence Duration By ID ─────────────────────────────────

function getSequenceDurationById(seqId) {
    try {
        var seq = findSequenceById(seqId);
        if (!seq) return JSON.stringify({ error: "Secuencia no encontrada." });
        var durationSecs = 0;
        try { durationSecs = parseFloat(seq.end) / TICKS_PER_SECOND; } catch(e) {}
        return JSON.stringify({ success: true, name: seq.name, durationSeconds: durationSecs });
    } catch(e) {
        return JSON.stringify({ error: e.message });
    }
}

// ─── Open + Backup + Cut in one synchronous call ─────────────

function openBackupAndCut(seqId, cutsFilePath) {
    try {
        var targetSeq = findSequenceById(seqId);
        if (!targetSeq) return JSON.stringify({ error: "Secuencia no encontrada: " + seqId });

        var durationBefore = 0;
        try { durationBefore = parseFloat(targetSeq.end) / TICKS_PER_SECOND; } catch(e) {}

        app.project.openSequence(targetSeq.sequenceID);
        $.sleep(1500);

        var activeSeq = app.project.activeSequence;
        var retries = 0;
        while ((!activeSeq || activeSeq.sequenceID !== seqId) && retries < 20) {
            $.sleep(500);
            activeSeq = app.project.activeSequence;
            retries++;
        }
        if (!activeSeq || activeSeq.sequenceID !== seqId) {
            return JSON.stringify({
                error: "No se pudo activar secuencia (activa: " + (activeSeq ? activeSeq.name : "ninguna") + ")",
                durationBefore: durationBefore
            });
        }

        backupSequence();
        $.sleep(800);

        activeSeq = app.project.activeSequence;
        if (!activeSeq || activeSeq.sequenceID !== seqId) {
            app.project.openSequence(seqId);
            $.sleep(1500);
            activeSeq = app.project.activeSequence;
            if (!activeSeq || activeSeq.sequenceID !== seqId) {
                return JSON.stringify({
                    error: "Secuencia cambió después de backup (activa: " + (activeSeq ? activeSeq.name : "ninguna") + ")",
                    durationBefore: durationBefore
                });
            }
        }

        var cutResultStr = executeCuts(cutsFilePath);

        var durationAfter = 0;
        try {
            var seqAfter = app.project.activeSequence;
            if (seqAfter) durationAfter = parseFloat(seqAfter.end) / TICKS_PER_SECOND;
        } catch(e) {}

        var cutResult;
        try { cutResult = JSON.parse(cutResultStr); } catch(e) {
            return JSON.stringify({ error: "Error al parsear resultado de cortes", durationBefore: durationBefore });
        }

        cutResult.durationBefore = durationBefore;
        cutResult.durationAfter = durationAfter;
        cutResult.sequenceName = targetSeq.name;

        return JSON.stringify(cutResult);
    } catch(e) {
        return JSON.stringify({ error: "Error en openBackupAndCut: " + e.message });
    }
}

// ─── Create Reel Sequence ────────────────────────────────────
// Clones the active sequence, renames it, and removes everything
// except the specified keep zones (reel segments).

function createReelSequence(jsonPath) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        var f = new File(jsonPath);
        if (!f.exists) return JSON.stringify({ error: "Archivo no encontrado: " + jsonPath });
        f.encoding = "UTF-8"; f.open("r"); var content = f.read(); f.close();

        var data = JSON.parse(content);
        var reelName = data.reelName || (seq.name + "_Reel");
        var keepZones = data.keepZones;
        if (!keepZones || keepZones.length === 0) {
            return JSON.stringify({ error: "No hay segmentos para el reel." });
        }

        var originalSeqId = seq.sequenceID;

        var existingIds = {};
        for (var si = 0; si < app.project.sequences.numSequences; si++) {
            existingIds[app.project.sequences[si].sequenceID] = true;
        }

        seq.clone();
        $.sleep(500);

        var clonedSeq = null;
        for (var i = 0; i < app.project.sequences.numSequences; i++) {
            var s = app.project.sequences[i];
            if (!existingIds[s.sequenceID]) {
                clonedSeq = s;
                break;
            }
        }

        if (!clonedSeq) {
            return JSON.stringify({ error: "No se pudo clonar la secuencia." });
        }

        try { clonedSeq.name = reelName; } catch(e) {}
        $.sleep(200);

        var parentBin = findBinContainingSequence(app.project.rootItem, originalSeqId, seq.name);
        if (!parentBin) parentBin = app.project.rootItem;
        var reelBin = findOrCreateBin(parentBin, "Reels");
        if (reelBin) {
            var clonedItem = findItemByNameRecursive(app.project.rootItem, reelName);
            if (clonedItem) {
                try { clonedItem.item.moveBin(reelBin); } catch(e) {}
            }
        }

        app.project.openSequence(clonedSeq.sequenceID);
        $.sleep(500);

        // Set 9:16 vertical resolution (1080x1920) via QE
        var frameChanged = false;
        try {
            app.enableQE();
            var qeReelSeq = qe.project.getActiveSequence();
            if (qeReelSeq) {
                qeReelSeq.setVideoFrameSize(1080, 1920);
                frameChanged = true;
            }
        } catch(e) {
            // QE frame resize failed — continue with original dimensions
        }
        $.sleep(300);

        var seqEnd = 0;
        try { seqEnd = parseFloat(clonedSeq.end) / TICKS_PER_SECOND; } catch(e) {}

        keepZones.sort(function(a, b) { return parseFloat(a.start) - parseFloat(b.start); });

        var removeZones = [];
        var cursor = 0;
        for (var k = 0; k < keepZones.length; k++) {
            var kStart = parseFloat(keepZones[k].start);
            var kEnd = parseFloat(keepZones[k].end);
            if (kStart > cursor + 0.1) {
                removeZones.push({ start: cursor, end: kStart, label: "Pre-reel gap " + (k + 1) });
            }
            cursor = kEnd;
        }
        if (cursor < seqEnd - 0.1) {
            removeZones.push({ start: cursor, end: seqEnd, label: "Post-reel tail" });
        }

        if (removeZones.length === 0) {
            return JSON.stringify({ success: true, reelName: reelName, reelSeqId: clonedSeq.sequenceID, frameChanged: frameChanged, message: "Reel creado (sin cortes necesarios)." });
        }

        var cutDataStr = JSON.stringify({ removeZones: removeZones, seqName: reelName, timestamp: "" });
        var tmpCutFile = new File(Folder.temp.fsName + "/EditorPro_reel_cuts.json");
        tmpCutFile.encoding = "UTF-8"; tmpCutFile.open("w"); tmpCutFile.write(cutDataStr); tmpCutFile.close();

        var cutResultStr = executeCuts(tmpCutFile.fsName);

        // Keep the reel sequence open (don't switch back)

        var cutResult;
        try { cutResult = JSON.parse(cutResultStr); } catch(e) {
            return JSON.stringify({ error: "Error al parsear resultado de cortes del reel." });
        }

        cutResult.reelName = reelName;
        cutResult.reelSeqId = clonedSeq.sequenceID;
        cutResult.frameChanged = frameChanged;
        return JSON.stringify(cutResult);
    } catch(e) {
        return JSON.stringify({ error: "Error al crear reel: " + e.message });
    }
}

// ═══════════════════════════════════════════════════════════════
// ═══ MOTION-PRO — Import & Place MP4 clips ═══════════════════
// ═══════════════════════════════════════════════════════════════

function getNextAvailableTrack() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        var maxUsed = -1;
        for (var t = 0; t < seq.videoTracks.numTracks; t++) {
            var track = seq.videoTracks[t];
            if (track.clips.numItems > 0) {
                maxUsed = t;
            }
        }

        var nextTrack = maxUsed + 1;
        var totalTracks = seq.videoTracks.numTracks;

        return JSON.stringify({
            success: true,
            nextTrackIndex: nextTrack,
            totalTracks: totalTracks,
            needsNewTrack: nextTrack >= totalTracks
        });
    } catch(e) {
        return JSON.stringify({ error: "Error: " + e.message });
    }
}

function _getOrCreateMotionBin() {
    var root = app.project.rootItem;
    for (var i = 0; i < root.children.numItems; i++) {
        if (root.children[i].name === "Motion-Pro" && root.children[i].type === 2) {
            return root.children[i];
        }
    }
    var binIdx = root.children.numItems;
    app.project.rootItem.createBin("Motion-Pro");
    for (var j = 0; j < root.children.numItems; j++) {
        if (root.children[j].name === "Motion-Pro" && root.children[j].type === 2) {
            return root.children[j];
        }
    }
    return null;
}

function _findProjectItemByPath(searchPath, bin) {
    // First: search in the specific bin (most reliable after import)
    if (bin && bin.children) {
        for (var b = bin.children.numItems - 1; b >= 0; b--) {
            var bChild = bin.children[b];
            if (bChild.type === 1) {
                try {
                    var bmp = bChild.getMediaPath();
                    if (bmp && (bmp === searchPath || bmp.indexOf(searchPath) !== -1 || searchPath.indexOf(bmp) !== -1)) return bChild;
                } catch(e) {}
                // Also match by filename
                try {
                    var searchName = searchPath.replace(/^.*[\/\\]/, "").replace(/\.[^.]+$/, "");
                    if (bChild.name.indexOf(searchName) !== -1) return bChild;
                } catch(e) {}
            }
        }
    }
    // Fallback: search entire project
    var root = app.project.rootItem;
    var queue = [root];
    while (queue.length > 0) {
        var item = queue.shift();
        if (item.children) {
            for (var i = 0; i < item.children.numItems; i++) {
                var child = item.children[i];
                if (child.type === 1) {
                    try {
                        var mp = child.getMediaPath();
                        if (mp && (mp === searchPath || mp.indexOf(searchPath) !== -1 || searchPath.indexOf(mp) !== -1)) return child;
                    } catch(e) {}
                }
                if (child.type === 2 && child.children) {
                    queue.push(child);
                }
            }
        }
    }
    return null;
}

var _mpBaseTrack = -1;
var _mpLastSequenceId = "";

function importAndPlaceMotions(jsonPath) {
    try {
        var f = new File(jsonPath);
        if (!f.exists) return JSON.stringify({ error: "JSON file not found: " + jsonPath });
        f.encoding = "UTF-8";
        f.open("r");
        var raw = f.read();
        f.close();

        var data = JSON.parse(raw);
        if (!data.clips || data.clips.length === 0) {
            return JSON.stringify({ error: "No clips in payload." });
        }

        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        // Otra secuencia = índices de pista inválidos: volver a crear pista Motion-Pro
        try {
            var sid = seq.sequenceID;
            if (sid && sid !== _mpLastSequenceId) {
                _mpLastSequenceId = sid;
                _mpBaseTrack = -1;
            }
        } catch(eSid) {}

        var bin = _getOrCreateMotionBin();
        if (!bin) return JSON.stringify({ error: "No se pudo crear bin Motion-Pro." });

        // Create sequence subfolder inside Motion-Pro bin
        var seqBin = bin;
        try {
            var firstClip = data.clips[0];
            if (firstClip && firstClip.clipName) {
                // Extract sequence prefix from clip name (e.g., "14-2604" from "14-2604_Clip01_Reveal")
                var seqMatch = firstClip.clipName.match(/^([^_]+)/);
                if (seqMatch) {
                    var seqFolderName = seqMatch[1];
                    // Check if subfolder exists
                    var found = false;
                    if (bin.children) {
                        for (var sf = 0; sf < bin.children.numItems; sf++) {
                            if (bin.children[sf].name === seqFolderName && bin.children[sf].type === 2) {
                                seqBin = bin.children[sf];
                                found = true;
                                break;
                            }
                        }
                    }
                    if (!found) {
                        bin.createBin(seqFolderName);
                        // createBin returns void in ExtendScript — find the newly created bin
                        for (var sf2 = 0; sf2 < bin.children.numItems; sf2++) {
                            if (bin.children[sf2].name === seqFolderName && bin.children[sf2].type === 2) {
                                seqBin = bin.children[sf2];
                                break;
                            }
                        }
                    }
                }
            }
        } catch(eBin) {}

        // Reuse existing Motion-Pro track or create a new one
        var baseTrack = _mpBaseTrack;
        if (baseTrack < 0 || baseTrack >= seq.videoTracks.numTracks) {
            var beforeCount = seq.videoTracks.numTracks;
            try {
                app.enableQE();
                var qeSeq = qe.project.getActiveSequence();
                qeSeq.addTracks(1, beforeCount, 0);
                $.sleep(500);
            } catch(eQE) {}
            var afterCount = seq.videoTracks.numTracks;
            baseTrack = (afterCount > beforeCount) ? afterCount - 1 : beforeCount - 1;
            _mpBaseTrack = baseTrack;
        }

        var inserted = 0;
        var errors = [];

        for (var c = 0; c < data.clips.length; c++) {
            var clip = data.clips[c];
            var mp4File = new File(clip.mp4Path);
            if (!mp4File.exists) {
                errors.push("File not found: " + clip.mp4Path);
                continue;
            }

            var countBefore = seqBin.children ? seqBin.children.numItems : 0;
            app.project.importFiles(
                [mp4File.fsName],
                true,
                seqBin,
                false
            );

            var item = null;
            var wait;
            for (wait = 0; wait < 25; wait++) {
                $.sleep(250);
                if (seqBin.children && seqBin.children.numItems > countBefore) {
                    item = seqBin.children[seqBin.children.numItems - 1];
                }
                if (!item) {
                    item = _findProjectItemByPath(mp4File.fsName, seqBin);
                }
                if (item) break;
            }
            if (!item) {
                errors.push("Imported but could not find item (timeout): " + clip.mp4Path);
                continue;
            }

            try { item.name = clip.clipName || ("MP_" + c); } catch(e) {}
            // Set label color by motion type
            try {
                if (clip.labelColor !== undefined && clip.labelColor >= 0) {
                    item.setColorLabel(clip.labelColor);
                }
            } catch(eLabel) {}

            var startTicks = String(Math.round(clip.startTimeSecs * TICKS_PER_SECOND));
            var track = seq.videoTracks[baseTrack];
            if (!track) {
                errors.push("Track " + baseTrack + " not available.");
                continue;
            }

            var placed = false;
            try {
                track.overwriteClip(item, startTicks);
                placed = true;
            } catch(eOw) {
                try {
                    // API documentada: insertClip(projectItem, time, vTrackIndex, aTrackIndex)
                    track.insertClip(item, startTicks, baseTrack, 0);
                    placed = true;
                } catch(e4) {
                    try {
                        track.insertClip(item, startTicks);
                        placed = true;
                    } catch(e2) {
                        errors.push("Place error on clip " + c + ": " + eOw.message + " | " + e4.message + " | " + e2.message);
                        continue;
                    }
                }
            }
            if (placed) inserted++;
            $.sleep(300);

            // Set clip duration to match the MP4 source
            try {
                var durationSecs = parseFloat(clip.durationSecs) || 0;
                if (durationSecs > 0) {
                    var numClips = track.clips.numItems;
                    for (var ci = numClips - 1; ci >= 0; ci--) {
                        var trackClip = track.clips[ci];
                        var clipStartSecs = parseFloat(trackClip.start.seconds);
                        if (Math.abs(clipStartSecs - clip.startTimeSecs) < 1.0) {
                            var endTicks = Math.round((clip.startTimeSecs + durationSecs) * TICKS_PER_SECOND);
                            trackClip.end = endTicks.toString();
                            break;
                        }
                    }
                }
            } catch(eDur) {}
            $.sleep(100);
        }

        if (inserted === 0 && errors.length > 0) {
            return JSON.stringify({
                error: errors.join("; "),
                inserted: 0,
                trackIndex: baseTrack,
                videoTrackNumber: baseTrack + 1,
                errors: errors
            });
        }

        // videoTrackNumber: 1-based label como en la UI (V1 = índice 0)
        return JSON.stringify({
            success: true,
            inserted: inserted,
            trackIndex: baseTrack,
            videoTrackNumber: baseTrack + 1,
            errors: errors
        });
    } catch(e) {
        return JSON.stringify({ error: "importAndPlaceMotions error: " + e.message });
    }
}

function getSequenceFps() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ fps: 30 });
        // Premiere stores timebase as ticks per second / ticks per frame
        var timebase = seq.timebase;
        if (timebase) {
            var fps = parseFloat(timebase);
            if (fps > 0) return JSON.stringify({ fps: fps });
        }
        return JSON.stringify({ fps: 30 });
    } catch(e) {
        return JSON.stringify({ fps: 30, error: e.message });
    }
}

function replaceMotionOnTrack(jsonPath) {
    try {
        var f = new File(jsonPath);
        if (!f.exists) return JSON.stringify({ error: "JSON file not found." });
        f.encoding = "UTF-8";
        f.open("r");
        var raw = f.read();
        f.close();

        var data = JSON.parse(raw);
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        var bin = _getOrCreateMotionBin();

        // For version stacking: add a new track above baseTrack
        var newTrackIdx = data.newTrackIndex || 0;
        if (newTrackIdx >= seq.videoTracks.numTracks) {
            try {
                app.enableQE();
                var qeSeq = qe.project.getActiveSequence();
                qeSeq.addTracks(1, seq.videoTracks.numTracks, 0);
                $.sleep(500);
            } catch(eQE) {}
            newTrackIdx = seq.videoTracks.numTracks - 1;
        }

        var mp4File = new File(data.mp4Path);
        if (!mp4File.exists) return JSON.stringify({ error: "MP4 not found: " + data.mp4Path });

        app.project.importFiles([mp4File.fsName], true, bin, false);

        var item = null;
        var w;
        for (w = 0; w < 25; w++) {
            $.sleep(250);
            item = _findProjectItemByPath(mp4File.fsName, bin);
            if (item) break;
        }
        if (!item) return JSON.stringify({ error: "Could not find imported item (timeout)." });

        try { item.name = data.clipName || "MP_replaced"; } catch(e) {}

        var startTicks = String(Math.round(data.startTimeSecs * TICKS_PER_SECOND));
        var track = seq.videoTracks[newTrackIdx];
        if (!track) return JSON.stringify({ error: "Track " + newTrackIdx + " not available." });

        try {
            track.overwriteClip(item, startTicks);
        } catch(eOw) {
            try {
                track.insertClip(item, startTicks, newTrackIdx, 0);
            } catch(e4) {
                try {
                    track.insertClip(item, startTicks);
                } catch(e2) {
                    return JSON.stringify({ error: "Place error: " + eOw.message + " | " + e4.message + " | " + e2.message });
                }
            }
        }

        // Set clip end to match source duration
        $.sleep(300);
        try {
            var durationSecs = parseFloat(data.durationSecs) || 0;
            if (durationSecs > 0) {
                for (var ci = track.clips.numItems - 1; ci >= 0; ci--) {
                    var tc = track.clips[ci];
                    if (Math.abs(parseFloat(tc.start.seconds) - data.startTimeSecs) < 1.0) {
                        tc.end = String(Math.round((data.startTimeSecs + durationSecs) * TICKS_PER_SECOND));
                        break;
                    }
                }
            }
        } catch(eDur) {}

        return JSON.stringify({
            success: true,
            trackIndex: newTrackIdx,
            clipName: data.clipName
        });
    } catch(e) {
        return JSON.stringify({ error: "replaceMotionOnTrack error: " + e.message });
    }
}

// ─── Motion-Pro Preview → Animar: Clip duration + overlay insertion ──────

/**
 * Get the duration (in seconds) and position of a clip in the active sequence by name pattern.
 * Searches all video tracks for a clip whose name contains the given pattern.
 * Returns: { found, trackIndex, clipIndex, startSecs, endSecs, durationSecs, clipName }
 */
function getClipInfoByName(namePattern) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        for (var t = seq.videoTracks.numTracks - 1; t >= 0; t--) {
            var track = seq.videoTracks[t];
            for (var c = 0; c < track.clips.numItems; c++) {
                var clip = track.clips[c];
                if (clip.name && clip.name.indexOf(namePattern) !== -1) {
                    var startSecs = parseFloat(clip.start.seconds);
                    var endSecs = parseFloat(clip.end.seconds);
                    return JSON.stringify({
                        found: true,
                        trackIndex: t,
                        clipIndex: c,
                        startSecs: startSecs,
                        endSecs: endSecs,
                        durationSecs: endSecs - startSecs,
                        clipName: clip.name
                    });
                }
            }
        }
        return JSON.stringify({ found: false, error: "Clip not found: " + namePattern });
    } catch(e) {
        return JSON.stringify({ error: "getClipInfoByName error: " + e.message });
    }
}

/**
 * Import a clip and place it directly above an existing clip (same in-point, track+1).
 * Used by "Animar" to replace a PNG preview with the rendered video.
 * jsonPath: { mp4Path, targetClipName, clipName, labelColor, durationSecs }
 */
function importAndPlaceAbove(jsonPath) {
    try {
        var f = new File(jsonPath);
        if (!f.exists) return JSON.stringify({ error: "JSON file not found: " + jsonPath });
        f.encoding = "UTF-8";
        f.open("r");
        var raw = f.read();
        f.close();

        var data = JSON.parse(raw);
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        // Find the target clip (the PNG preview) in the timeline
        var targetTrack = -1;
        var targetClip = null;
        var targetStartSecs = 0;

        for (var t = seq.videoTracks.numTracks - 1; t >= 0; t--) {
            var track = seq.videoTracks[t];
            for (var c = 0; c < track.clips.numItems; c++) {
                var clip = track.clips[c];
                if (clip.name && clip.name.indexOf(data.targetClipName) !== -1) {
                    targetTrack = t;
                    targetClip = clip;
                    targetStartSecs = parseFloat(clip.start.seconds);
                    break;
                }
            }
            if (targetClip) break;
        }

        if (!targetClip) {
            return JSON.stringify({ error: "Target clip not found: " + data.targetClipName });
        }

        // Determine the track above (targetTrack + 1)
        var aboveTrack = targetTrack + 1;
        if (aboveTrack >= seq.videoTracks.numTracks) {
            // Need to create a new track
            try {
                app.enableQE();
                var qeSeq = qe.project.getActiveSequence();
                qeSeq.addTracks(1, seq.videoTracks.numTracks, 0);
                $.sleep(500);
            } catch(eQE) {}
            aboveTrack = seq.videoTracks.numTracks - 1;
        }

        // Import the MP4
        var mp4File = new File(data.mp4Path);
        if (!mp4File.exists) return JSON.stringify({ error: "MP4 not found: " + data.mp4Path });

        var bin = _getOrCreateMotionBin();
        if (!bin) return JSON.stringify({ error: "No se pudo crear bin Motion-Pro." });

        var countBefore = bin.children ? bin.children.numItems : 0;
        app.project.importFiles([mp4File.fsName], true, bin, false);

        var item = null;
        for (var w = 0; w < 25; w++) {
            $.sleep(250);
            if (bin.children && bin.children.numItems > countBefore) {
                item = bin.children[bin.children.numItems - 1];
            }
            if (!item) item = _findProjectItemByPath(mp4File.fsName, bin);
            if (item) break;
        }
        if (!item) return JSON.stringify({ error: "Imported but could not find item (timeout)." });

        try { item.name = data.clipName || "MP_anim"; } catch(e) {}
        try {
            if (data.labelColor !== undefined && data.labelColor >= 0) {
                item.setColorLabel(data.labelColor);
            }
        } catch(eLabel) {}

        // Place on track above at same start position
        var startTicks = String(Math.round(targetStartSecs * TICKS_PER_SECOND));
        var aboveTrackObj = seq.videoTracks[aboveTrack];
        if (!aboveTrackObj) return JSON.stringify({ error: "Track " + aboveTrack + " not available." });

        var placed = false;
        try {
            aboveTrackObj.overwriteClip(item, startTicks);
            placed = true;
        } catch(eOw) {
            try {
                aboveTrackObj.insertClip(item, startTicks, aboveTrack, 0);
                placed = true;
            } catch(e4) {
                try {
                    aboveTrackObj.insertClip(item, startTicks);
                    placed = true;
                } catch(e2) {
                    return JSON.stringify({ error: "Place error: " + eOw.message + " | " + e4.message + " | " + e2.message });
                }
            }
        }

        // Set clip duration if specified
        if (placed && data.durationSecs && parseFloat(data.durationSecs) > 0) {
            $.sleep(300);
            try {
                var durationSecs = parseFloat(data.durationSecs);
                for (var ci = aboveTrackObj.clips.numItems - 1; ci >= 0; ci--) {
                    var tc = aboveTrackObj.clips[ci];
                    if (Math.abs(parseFloat(tc.start.seconds) - targetStartSecs) < 1.0) {
                        tc.end = String(Math.round((targetStartSecs + durationSecs) * TICKS_PER_SECOND));
                        break;
                    }
                }
            } catch(eDur) {}
        }

        // Disable the PNG preview clip (video on track above will cover it).
        // Don't remove() — not all Premiere versions support it and it can crash.
        try {
            targetClip.disabled = true;
        } catch(eDis) {
            // If disable not supported, leave it — video above covers it anyway
        }

        return JSON.stringify({
            success: true,
            trackIndex: aboveTrack,
            videoTrackNumber: aboveTrack + 1,
            clipName: data.clipName,
            startSecs: targetStartSecs
        });
    } catch(e) {
        return JSON.stringify({ error: "importAndPlaceAbove error: " + e.message });
    }
}
