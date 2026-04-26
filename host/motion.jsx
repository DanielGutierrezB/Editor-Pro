/**
 * host/motion.jsx — Motion-Pro: importAndPlaceMotions, replaceMotionOnTrack, helpers
 * Loaded via #include from host/index.jsx
 */

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

        // Find or create sequence subfolder inside Motion-Pro bin (same logic as importAndPlaceMotions)
        var seqBin = bin;
        try {
            var clipName = data.clipName || "";
            if (clipName) {
                var seqMatch = clipName.match(/^([^_]+)/);
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

        app.project.importFiles([mp4File.fsName], true, seqBin, false);

        var item = null;
        var w;
        for (w = 0; w < 25; w++) {
            $.sleep(250);
            item = _findProjectItemByPath(mp4File.fsName, seqBin);
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
