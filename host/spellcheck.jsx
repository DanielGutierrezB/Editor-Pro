/**
 * host/spellcheck.jsx — SpellCheck/captions: exportSequenceXML, marker ops, transcript info
 * Loaded via #include from host/index.jsx
 */

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

// findSequenceById moved to common.jsx (shared by spellcheck + recording)

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

