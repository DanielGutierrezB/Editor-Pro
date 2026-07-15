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
        var restoreOk = false;
        try { restoreOk = !!JSON.parse(result).success; } catch(_pe) { restoreOk = false; }

        if (restoreOk) {
            // restoreBackup() already cleared _backupSeqId/_originalSeqId on success;
            // only drop the registry entry once we know the restore actually happened,
            // so a failed restore can still be retried from the UI.
            delete _batchBackups[seqId];
            _persistBackups();
        } else {
            // Restore did not succeed — put the previous globals back so this call's
            // temporary swap doesn't leave stale/corrupted backup state behind.
            _backupSeqId = prevBackupSeqId;
            _backupSeqName = prevBackupSeqName;
            _originalSeqId = prevOriginalSeqId;
            _originalParentBinName = prevOriginalParentBinName;
        }

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


// ─── Sequence lookup by ID ─────────────────────────────────
function findSequenceById(seqId) {
    for (var i = 0; i < app.project.sequences.numSequences; i++) {
        if (app.project.sequences[i].sequenceID === seqId) return app.project.sequences[i];
    }
    return null;
}
