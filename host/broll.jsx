/**
 * host/broll.jsx — ExtendScript functions for B-Roll tab
 * ES3 compatible: no let/const, no arrow functions, no template literals
 */

// ── importAndPlaceBroll(jsonPath) ─────────────────────────────────────────────
// JSON schema: { clips: [{ filePath, clipName, startTimeSecs, durationSecs, labelColor, trackIndex }] }
// Creates a "B-Roll" bin and places clips on the specified track (or next available).

function importAndPlaceBroll(jsonPath) {
    try {
        var f = new File(jsonPath);
        if (!f.exists) return JSON.stringify({ error: "JSON file not found: " + jsonPath });
        f.encoding = "UTF-8";
        f.open("r");
        var raw = f.read();
        f.close();
        var payload = JSON.parse(raw);
        var clips = payload.clips;
        if (!clips || clips.length === 0) return JSON.stringify({ success: true, placed: 0 });

        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No active sequence" });

        var fps = getSequenceFps(seq);
        var bin = _getOrCreateBrollBin();
        var errors = [];
        var placed = 0;

        for (var i = 0; i < clips.length; i++) {
            var clip = clips[i];
            if (!clip || !clip.filePath) continue;

            // Import file
            var item = _findProjectItemByPath(clip.filePath);
            if (!item) {
                var importArr = [clip.filePath];
                app.project.importFiles(importArr, true, bin, false);
                item = _findProjectItemByPath(clip.filePath);
            }
            if (!item) { errors.push("Could not import: " + clip.filePath); continue; }

            // Move to B-Roll bin if not already there
            try {
                if (item.parent !== bin) item.moveBin(bin);
            } catch(e) {}

            // Set clip name
            if (clip.clipName) { try { item.name = clip.clipName; } catch(e) {} }

            // Determine track
            var trackIdx = (typeof clip.trackIndex === "number" && clip.trackIndex >= 0)
                ? clip.trackIndex
                : _getBrollBaseTrack(seq);

            // Ensure track exists
            while (seq.videoTracks.numTracks <= trackIdx) {
                try { seq.videoTracks.addTrack(); } catch(e) { break; }
            }

            var track = seq.videoTracks[trackIdx];
            if (!track) { errors.push("Track " + trackIdx + " unavailable"); continue; }

            var startTicks = Math.round((clip.startTimeSecs || 0) * 254016000000);
            var startTime = new Time();
            startTime.ticks = startTicks;

            try {
                track.insertClip(item, startTime);
            } catch(e) {
                errors.push("insertClip failed for " + clip.clipName + ": " + e.toString());
                continue;
            }

            // Set duration by trimming outPoint
            if (clip.durationSecs && clip.durationSecs > 0) {
                try {
                    // Find the clip we just inserted (last clip near startTime)
                    var trackItem = _findClipNearTime(track, startTicks, 1000000);
                    if (trackItem) {
                        var outTicks = startTicks + Math.round(clip.durationSecs * 254016000000);
                        var outTime = new Time();
                        outTime.ticks = outTicks;
                        trackItem.end = outTime;
                    }
                } catch(e) {}
            }

            // Set label color
            if (typeof clip.labelColor === "number") {
                try { item.setColorLabel(clip.labelColor); } catch(e) {}
            }

            placed++;
        }

        return JSON.stringify({ success: true, placed: placed, errors: errors });

    } catch(e) {
        return JSON.stringify({ error: e.toString() });
    }
}

// ── replaceBrollClip(jsonPath) ────────────────────────────────────────────────
// JSON schema: { proposalId, filePath, clipName, startTimeSecs, durationSecs, trackIndex }
// Imports new media, places on track above original (or same track), disables original.

function replaceBrollClip(jsonPath) {
    try {
        var f = new File(jsonPath);
        if (!f.exists) return JSON.stringify({ error: "JSON file not found: " + jsonPath });
        f.encoding = "UTF-8";
        f.open("r");
        var raw = f.read();
        f.close();
        var payload = JSON.parse(raw);
        if (!payload.filePath) return JSON.stringify({ error: "filePath required" });

        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No active sequence" });

        var bin = _getOrCreateBrollBin();

        // Import new file
        var item = _findProjectItemByPath(payload.filePath);
        if (!item) {
            app.project.importFiles([payload.filePath], true, bin, false);
            item = _findProjectItemByPath(payload.filePath);
        }
        if (!item) return JSON.stringify({ error: "Could not import: " + payload.filePath });
        if (payload.clipName) { try { item.name = payload.clipName; } catch(e) {} }

        var trackIdx = (typeof payload.trackIndex === "number" && payload.trackIndex >= 0)
            ? payload.trackIndex
            : _getBrollBaseTrack(seq);

        while (seq.videoTracks.numTracks <= trackIdx) {
            try { seq.videoTracks.addTrack(); } catch(e) { break; }
        }

        var track = seq.videoTracks[trackIdx];
        if (!track) return JSON.stringify({ error: "Track unavailable" });

        var startTicks = Math.round((payload.startTimeSecs || 0) * 254016000000);
        var startTime = new Time();
        startTime.ticks = startTicks;

        track.insertClip(item, startTime);

        if (payload.durationSecs && payload.durationSecs > 0) {
            try {
                var trackItem = _findClipNearTime(track, startTicks, 1000000);
                if (trackItem) {
                    var outTicks = startTicks + Math.round(payload.durationSecs * 254016000000);
                    var outTime = new Time();
                    outTime.ticks = outTicks;
                    trackItem.end = outTime;
                }
            } catch(e) {}
        }

        return JSON.stringify({ success: true });

    } catch(e) {
        return JSON.stringify({ error: e.toString() });
    }
}

// ── getBrollTrackInfo() ───────────────────────────────────────────────────────
// Returns info about the current active sequence's video track count

function getBrollTrackInfo() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ trackCount: 0 });
        return JSON.stringify({
            trackCount: seq.videoTracks.numTracks,
            nextAvailable: _getBrollBaseTrack(seq)
        });
    } catch(e) {
        return JSON.stringify({ error: e.toString() });
    }
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _getOrCreateBrollBin() {
    var root = app.project.rootItem;
    for (var i = 0; i < root.children.numItems; i++) {
        var child = root.children[i];
        if (child && child.name === "B-Roll" && child.type === ProjectItemType.BIN) {
            return child;
        }
    }
    return root.createBin("B-Roll");
}

function _getBrollBaseTrack(seq) {
    // Find the next track above all existing content
    var count = seq.videoTracks.numTracks;
    for (var i = count - 1; i >= 0; i--) {
        var track = seq.videoTracks[i];
        if (track && track.clips && track.clips.numItems > 0) {
            return i + 1;
        }
    }
    return count > 0 ? count : 0;
}

function _findClipNearTime(track, targetTicks, toleranceTicks) {
    var best = null;
    var bestDist = toleranceTicks + 1;
    for (var i = 0; i < track.clips.numItems; i++) {
        var clip = track.clips[i];
        if (!clip) continue;
        var dist = Math.abs(clip.start.ticks - targetTicks);
        if (dist < bestDist) {
            bestDist = dist;
            best = clip;
        }
    }
    return best;
}

function _findProjectItemByPath(filePath) {
    function search(item) {
        if (!item) return null;
        if (item.type === ProjectItemType.FILE) {
            try {
                if (item.getMediaPath && item.getMediaPath() === filePath) return item;
            } catch(e) {}
            try {
                if (item.mediaPath && item.mediaPath === filePath) return item;
            } catch(e) {}
        }
        if (item.type === ProjectItemType.BIN || item === app.project.rootItem) {
            for (var i = 0; i < item.children.numItems; i++) {
                var found = search(item.children[i]);
                if (found) return found;
            }
        }
        return null;
    }
    return search(app.project.rootItem);
}
