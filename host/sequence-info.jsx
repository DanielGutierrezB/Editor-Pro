/**
 * host/sequence-info.jsx — Active-sequence read helpers.
 * Sequence/track/marker/clip metadata queries, playhead/frame export,
 * track-enable and clip-range utilities. Loaded via #include from
 * host/index.jsx.
 */

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


// ─── Enable All Tracks / Misc Utilities ──────────────────────

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
