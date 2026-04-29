/**
 * host/broll.jsx — ExtendScript functions for B-Roll tab
 * ES3 compatible: no let/const, no arrow functions, no template literals
 * Follows the same proven placement pattern as motion.jsx
 */

// ── Constants (defensive — may already be defined in common.jsx) ──────────────

if (typeof TICKS_PER_SECOND === "undefined") {
    var TICKS_PER_SECOND = 254016000000;
}

// ── Utility (defensive — may already be defined in common.jsx or motion.jsx) ──

if (typeof _findProjectItemByPath === "undefined") {
    function _findProjectItemByPath(searchPath, bin) {
        if (!bin || !bin.children) return null;
        for (var i = 0; i < bin.children.numItems; i++) {
            var child = bin.children[i];
            try {
                if (child.getMediaPath && child.getMediaPath() === searchPath) return child;
            } catch(e) {}
            if (child.type === 2 && child.children) {
                var found = _findProjectItemByPath(searchPath, child);
                if (found) return found;
            }
        }
        return null;
    }
}

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

            // Find the placed trackItem to adjust duration and scale
            var placedTrackItem = null;
            try {
                var numClips = track.clips.numItems;
                for (var ci = numClips - 1; ci >= 0; ci--) {
                    var trackClip = track.clips[ci];
                    var clipStartSecs = parseFloat(trackClip.start.seconds);
                    if (Math.abs(clipStartSecs - (clip.startTimeSecs || 0)) < 1.0) {
                        placedTrackItem = trackClip;
                        break;
                    }
                }
            } catch(eFind) {}

            // Set clip duration by trimming end point
            try {
                var durationSecs = parseFloat(clip.durationSecs) || 0;
                if (durationSecs > 0 && placedTrackItem) {
                    var endTicks = Math.round(((clip.startTimeSecs || 0) + durationSecs) * TICKS_PER_SECOND);
                    placedTrackItem.end = endTicks.toString();
                }
            } catch(eDur) {}

            // Scale to frame size so smaller images fill the 1080p frame
            // Uses "Set to Frame Size" approach: scales proportionally to fill sequence dimensions
            try {
                if (placedTrackItem) {
                    // Try Premiere's native setScaleToFrameSize if available (Premiere 2024+)
                    if (typeof placedTrackItem.setScaleToFrameSize === "function") {
                        placedTrackItem.setScaleToFrameSize();
                    } else {
                        // Manual fallback: read clip dimensions from metadata and calculate scale
                        var seqW = parseInt(seq.frameSizeHorizontal) || 1920;
                        var seqH = parseInt(seq.frameSizeVertical) || 1080;
                        var clipW = 0;
                        var clipH = 0;
                        // Try to read clip dimensions from project item metadata
                        try {
                            var xmpMeta = item.getProjectMetadata();
                            if (xmpMeta) {
                                var wMatch = xmpMeta.match(/premierePrivateProjectMetaData:Column\.Intrinsic\.MediaWidth[^>]*>(\d+)/);
                                var hMatch = xmpMeta.match(/premierePrivateProjectMetaData:Column\.Intrinsic\.MediaHeight[^>]*>(\d+)/);
                                if (wMatch) clipW = parseInt(wMatch[1]);
                                if (hMatch) clipH = parseInt(hMatch[1]);
                            }
                        } catch(eMeta) {}
                        // If metadata read failed, try footage interpretation
                        if (clipW <= 0 || clipH <= 0) {
                            try {
                                var interp = item.getFootageInterpretation ? item.getFootageInterpretation() : null;
                                if (interp) {
                                    clipW = interp.frameWidth || 0;
                                    clipH = interp.frameHeight || 0;
                                }
                            } catch(eInterp) {}
                        }
                        // Only scale if we know the clip dimensions and they're smaller than seq
                        if (clipW > 0 && clipH > 0 && (clipW < seqW || clipH < seqH)) {
                            var components = placedTrackItem.components;
                            for (var cmp = 0; cmp < components.numItems; cmp++) {
                                var comp = components[cmp];
                                if (comp.displayName === "Motion") {
                                    for (var pp = 0; pp < comp.properties.numItems; pp++) {
                                        if (comp.properties[pp].displayName === "Scale") {
                                            var scaleW = (seqW / clipW) * 100;
                                            var scaleH = (seqH / clipH) * 100;
                                            // Use the larger ratio to fill frame (no black bars)
                                            var scaleFactor = Math.max(scaleW, scaleH);
                                            comp.properties[pp].setValue(scaleFactor, true);
                                            break;
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            } catch(eScale) {}
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

// ── importAndPlaceAudio(jsonPath) ──────────────────────────────────────────
// JSON schema: { clips: [{ filePath, clipName, startTimeSecs, durationSecs }] }
// Places audio clips on audio tracks.
// First clip creates a new audio track, rest go on the same track.

var _brAudioTrack = -1;
var _brAudioLastSeqId = "";

function importAndPlaceAudio(jsonPath) {
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

        // Reset audio track if sequence changed
        try {
            var sid = seq.sequenceID;
            if (sid && sid !== _brAudioLastSeqId) {
                _brAudioLastSeqId = sid;
                _brAudioTrack = -1;
            }
        } catch(eSid) {}

        var bin = _getOrCreateBrollBin();
        if (!bin) return JSON.stringify({ error: "No se pudo crear bin B-Roll." });

        // Determine audio base track
        var audioTrack = _brAudioTrack;
        if (audioTrack < 0 || audioTrack >= seq.audioTracks.numTracks) {
            // Create a new audio track
            var beforeCount = seq.audioTracks.numTracks;
            try {
                app.enableQE();
                var qeSeq = qe.project.getActiveSequence();
                qeSeq.addTracks(0, 0, 1); // 0 video, 0 submix, 1 audio
                $.sleep(500);
            } catch(eQE) {}
            var afterCount = seq.audioTracks.numTracks;
            audioTrack = (afterCount > beforeCount) ? afterCount - 1 : beforeCount - 1;
        }
        _brAudioTrack = audioTrack;

        var inserted = 0;
        var errors = [];

        for (var c = 0; c < data.clips.length; c++) {
            var clip = data.clips[c];
            var filePath = clip.filePath;
            if (!filePath) { errors.push("No filePath for audio clip " + c); continue; }

            var mediaFile = new File(filePath);
            if (!mediaFile.exists) { errors.push("Audio file not found: " + filePath); continue; }

            // Import file into B-Roll bin
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
            if (!item) { errors.push("Imported but could not find audio item: " + filePath); continue; }

            try { item.name = clip.clipName || ("BR_Audio_" + c); } catch(e) {}

            var startTicks = String(Math.round((clip.startTimeSecs || 0) * TICKS_PER_SECOND));
            var track = seq.audioTracks[audioTrack];
            if (!track) { errors.push("Audio track " + audioTrack + " not available."); continue; }

            var placed = false;
            try { track.overwriteClip(item, startTicks); placed = true; }
            catch(eOw) {
                try { track.insertClip(item, startTicks); placed = true; }
                catch(e2) { errors.push("Audio place error clip " + c + ": " + eOw.message + " | " + e2.message); continue; }
            }
            if (placed) inserted++;

            // Set duration
            try {
                var durationSecs = parseFloat(clip.durationSecs) || 0;
                if (durationSecs > 0) {
                    $.sleep(300);
                    for (var ci = track.clips.numItems - 1; ci >= 0; ci--) {
                        var tc = track.clips[ci];
                        if (Math.abs(parseFloat(tc.start.seconds) - (clip.startTimeSecs || 0)) < 1.0) {
                            tc.end = String(Math.round(((clip.startTimeSecs || 0) + durationSecs) * TICKS_PER_SECOND));
                            break;
                        }
                    }
                }
            } catch(eDur) {}

            $.sleep(100);
        }

        return JSON.stringify({
            success: true,
            placed: inserted,
            audioTrackIndex: audioTrack,
            audioTrackNumber: audioTrack + 1,
            errors: errors
        });
    } catch(e) {
        return JSON.stringify({ error: "importAndPlaceAudio error: " + e.message });
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
