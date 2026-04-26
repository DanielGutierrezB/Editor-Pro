/**
 * host/broll.jsx — ExtendScript functions for B-Roll tab
 * ES3 compatible: no let/const, no arrow functions, no template literals
 * Follows the same proven placement pattern as motion.jsx
 */

// ── Bin management ────────────────────────────────────────────────────────────

var _brBaseTrack = -1;
var _brLastSequenceId = "";

function _getOrCreateBrollBin() {
    var root = app.project.rootItem;
    for (var i = 0; i < root.children.numItems; i++) {
        if (root.children[i].name === "B-Roll" && root.children[i].type === 2) {
            return root.children[i];
        }
    }
    app.project.rootItem.createBin("B-Roll");
    for (var j = 0; j < root.children.numItems; j++) {
        if (root.children[j].name === "B-Roll" && root.children[j].type === 2) {
            return root.children[j];
        }
    }
    return null;
}

// ── importAndPlaceBroll(jsonPath) ─────────────────────────────────────────────
// JSON schema: { clips: [{ filePath, clipName, startTimeSecs, durationSecs, labelColor, trackIndex }] }
// Creates a "B-Roll" bin with sequence subfolders and places clips using
// overwriteClip / insertClip (same robust pattern as importAndPlaceMotions).

function importAndPlaceBroll(jsonPath) {
    try {
        var f = new File(jsonPath);
        if (!f.exists) return JSON.stringify({ error: "JSON file not found: " + jsonPath });
        f.encoding = "UTF-8";
        f.open("r");
        var raw = f.read();
        f.close();

        var data = JSON.parse(raw);
        if (!data.clips || data.clips.length === 0) {
            return JSON.stringify({ success: true, placed: 0 });
        }

        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No active sequence" });

        // Reset base track if sequence changed
        try {
            var sid = seq.sequenceID;
            if (sid && sid !== _brLastSequenceId) {
                _brLastSequenceId = sid;
                _brBaseTrack = -1;
            }
        } catch(eSid) {}

        var bin = _getOrCreateBrollBin();
        if (!bin) return JSON.stringify({ error: "No se pudo crear bin B-Roll." });

        // Create sequence subfolder inside B-Roll bin
        var seqBin = bin;
        try {
            var firstClip = data.clips[0];
            if (firstClip && firstClip.clipName) {
                var seqMatch = firstClip.clipName.match(/^([^_]+)/);
                if (seqMatch) {
                    var seqFolderName = seqMatch[1];
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

        // Determine base track: use explicit trackIndex from first clip, or reuse/create
        var baseTrack = _brBaseTrack;

        // If first clip specifies a trackIndex >= 0, use that
        var firstTrackIdx = (data.clips[0] && typeof data.clips[0].trackIndex === "number" && data.clips[0].trackIndex >= 0)
            ? data.clips[0].trackIndex : -1;

        if (firstTrackIdx >= 0) {
            baseTrack = firstTrackIdx;
        }

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
        }
        _brBaseTrack = baseTrack;

        // Ensure track exists
        while (seq.videoTracks.numTracks <= baseTrack) {
            try {
                app.enableQE();
                var qeSeq2 = qe.project.getActiveSequence();
                qeSeq2.addTracks(1, seq.videoTracks.numTracks, 0);
                $.sleep(500);
            } catch(eQE2) { break; }
        }

        var inserted = 0;
        var errors = [];

        for (var c = 0; c < data.clips.length; c++) {
            var clip = data.clips[c];
            var filePath = clip.filePath || clip.mp4Path;
            if (!filePath) {
                errors.push("No filePath for clip " + c);
                continue;
            }

            var mediaFile = new File(filePath);
            if (!mediaFile.exists) {
                errors.push("File not found: " + filePath);
                continue;
            }

            // Import file into seqBin
            var countBefore = seqBin.children ? seqBin.children.numItems : 0;
            app.project.importFiles(
                [mediaFile.fsName],
                true,
                seqBin,
                false
            );

            // Retry loop: wait for item to appear (up to 25 × 250ms = ~6s)
            var item = null;
            var wait;
            for (wait = 0; wait < 25; wait++) {
                $.sleep(250);
                if (seqBin.children && seqBin.children.numItems > countBefore) {
                    item = seqBin.children[seqBin.children.numItems - 1];
                }
                if (!item) {
                    item = _findProjectItemByPath(mediaFile.fsName, seqBin);
                }
                if (item) break;
            }
            if (!item) {
                errors.push("Imported but could not find item (timeout): " + filePath);
                continue;
            }

            // Set clip name
            try { item.name = clip.clipName || ("BR_" + c); } catch(e) {}

            // Set label color
            try {
                if (clip.labelColor !== undefined && clip.labelColor >= 0) {
                    item.setColorLabel(clip.labelColor);
                }
            } catch(eLabel) {}

            // Calculate start position as string ticks
            var startTicks = String(Math.round((clip.startTimeSecs || 0) * TICKS_PER_SECOND));
            var track = seq.videoTracks[baseTrack];
            if (!track) {
                errors.push("Track " + baseTrack + " not available.");
                continue;
            }

            // Place clip: overwriteClip first, fall back to insertClip
            var placed = false;
            try {
                track.overwriteClip(item, startTicks);
                placed = true;
            } catch(eOw) {
                try {
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

            // Set clip duration by trimming end point
            try {
                var durationSecs = parseFloat(clip.durationSecs) || 0;
                if (durationSecs > 0) {
                    var numClips = track.clips.numItems;
                    for (var ci = numClips - 1; ci >= 0; ci--) {
                        var trackClip = track.clips[ci];
                        var clipStartSecs = parseFloat(trackClip.start.seconds);
                        if (Math.abs(clipStartSecs - (clip.startTimeSecs || 0)) < 1.0) {
                            var endTicks = Math.round(((clip.startTimeSecs || 0) + durationSecs) * TICKS_PER_SECOND);
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

        return JSON.stringify({
            success: true,
            placed: inserted,
            inserted: inserted,
            trackIndex: baseTrack,
            videoTrackNumber: baseTrack + 1,
            errors: errors
        });

    } catch(e) {
        return JSON.stringify({ error: "importAndPlaceBroll error: " + e.message });
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
        var filePath = payload.filePath || payload.mp4Path;
        if (!filePath) return JSON.stringify({ error: "filePath required" });

        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No active sequence" });

        var bin = _getOrCreateBrollBin();
        if (!bin) return JSON.stringify({ error: "No se pudo crear bin B-Roll." });

        // Import new file
        var mediaFile = new File(filePath);
        if (!mediaFile.exists) return JSON.stringify({ error: "File not found: " + filePath });

        var countBefore = bin.children ? bin.children.numItems : 0;
        app.project.importFiles([mediaFile.fsName], true, bin, false);

        var item = null;
        for (var w = 0; w < 25; w++) {
            $.sleep(250);
            if (bin.children && bin.children.numItems > countBefore) {
                item = bin.children[bin.children.numItems - 1];
            }
            if (!item) item = _findProjectItemByPath(mediaFile.fsName, bin);
            if (item) break;
        }
        if (!item) return JSON.stringify({ error: "Could not find imported item (timeout)." });

        if (payload.clipName) { try { item.name = payload.clipName; } catch(e) {} }

        var trackIdx = (typeof payload.trackIndex === "number" && payload.trackIndex >= 0)
            ? payload.trackIndex
            : _brBaseTrack;

        if (trackIdx < 0) trackIdx = 0;

        while (seq.videoTracks.numTracks <= trackIdx) {
            try {
                app.enableQE();
                var qeSeq = qe.project.getActiveSequence();
                qeSeq.addTracks(1, seq.videoTracks.numTracks, 0);
                $.sleep(500);
            } catch(eQE) { break; }
        }

        var track = seq.videoTracks[trackIdx];
        if (!track) return JSON.stringify({ error: "Track unavailable" });

        var startTicks = String(Math.round((payload.startTimeSecs || 0) * TICKS_PER_SECOND));

        // Place: overwriteClip first, fall back to insertClip
        try {
            track.overwriteClip(item, startTicks);
        } catch(eOw) {
            try {
                track.insertClip(item, startTicks, trackIdx, 0);
            } catch(e4) {
                try {
                    track.insertClip(item, startTicks);
                } catch(e2) {
                    return JSON.stringify({ error: "Place error: " + eOw.message + " | " + e4.message + " | " + e2.message });
                }
            }
        }

        // Set duration
        if (payload.durationSecs && parseFloat(payload.durationSecs) > 0) {
            $.sleep(300);
            try {
                var durationSecs = parseFloat(payload.durationSecs);
                for (var ci = track.clips.numItems - 1; ci >= 0; ci--) {
                    var tc = track.clips[ci];
                    if (Math.abs(parseFloat(tc.start.seconds) - (payload.startTimeSecs || 0)) < 1.0) {
                        tc.end = String(Math.round(((payload.startTimeSecs || 0) + durationSecs) * TICKS_PER_SECOND));
                        break;
                    }
                }
            } catch(eDur) {}
        }

        return JSON.stringify({ success: true });

    } catch(e) {
        return JSON.stringify({ error: e.toString() });
    }
}

// ── getBrollTrackInfo() ───────────────────────────────────────────────────────

function getBrollTrackInfo() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ trackCount: 0 });
        return JSON.stringify({
            trackCount: seq.videoTracks.numTracks,
            brollTrack: _brBaseTrack,
            videoTrackNumber: _brBaseTrack >= 0 ? _brBaseTrack + 1 : -1
        });
    } catch(e) {
        return JSON.stringify({ error: e.toString() });
    }
}
