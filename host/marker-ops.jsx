/**
 * host/marker-ops.jsx — post-cut marker cleanup and colorization.
 * Loaded via #include from host/index.jsx.
 */

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
