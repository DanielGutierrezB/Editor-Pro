/**
 * host/sequence-discovery.jsx — multi-sequence listing/lookup/navigation.
 * Loaded via #include from host/index.jsx.
 */

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

// ─── Sequence lookup by ID ─────────────────────────────────

function findSequenceById(seqId) {
    for (var i = 0; i < app.project.sequences.numSequences; i++) {
        if (app.project.sequences[i].sequenceID === seqId) return app.project.sequences[i];
    }
    return null;
}
