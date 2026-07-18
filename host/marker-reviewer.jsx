/**
 * host/marker-reviewer.jsx — Revisar Marcadores: mover marcadores de secuencia
 * Loaded via #include from host/index.jsx
 *
 * Premiere no permite cambiar marker.start de un marcador existente, así que
 * "mover" = localizar el marcador (por tiempo +/- tolerancia y nombre), borrarlo
 * y recrearlo en la posición nueva conservando nombre, comentario, color y
 * duración (end - start).
 */

function mrMoveMarkers(jsonPath, seqId) {
    try {
        var seq;
        if (seqId) {
            seq = findSequenceById(seqId);
            if (!seq) return JSON.stringify({ error: "Secuencia no encontrada: " + seqId });
        } else {
            seq = app.project.activeSequence;
            if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });
        }

        var f = new File(jsonPath);
        if (!f.exists) return JSON.stringify({ error: "Archivo no encontrado: " + jsonPath });
        f.encoding = "UTF-8"; f.open("r"); var content = f.read(); f.close();
        var moves = JSON.parse(content);

        var EPS = 0.05;
        var m = seq.markers;
        var moved = 0;
        var notFound = [];

        for (var i = 0; i < moves.length; i++) {
            var mv = moves[i];
            var oldStart = parseFloat(mv.oldStart);
            var newStart = parseFloat(mv.newStart);
            if (isNaN(oldStart) || isNaN(newStart) || newStart < 0) {
                notFound.push(mv.oldStart);
                continue;
            }

            // Localizar el marcador por tiempo (y nombre si viene)
            var target = null;
            var marker = m.getFirstMarker();
            while (marker) {
                if (Math.abs(marker.start.seconds - oldStart) < EPS) {
                    if (!mv.name || (marker.name || "") === mv.name) {
                        target = marker;
                        break;
                    }
                    if (target === null) target = marker; // fallback por tiempo
                }
                try { marker = m.getNextMarker(marker); } catch(e) { marker = null; }
            }

            if (!target) {
                notFound.push(oldStart);
                continue;
            }

            // Capturar metadata antes de borrar
            var name = target.name || "";
            var comments = target.comments || "";
            var durationSecs = 0;
            try { durationSecs = target.end.seconds - target.start.seconds; } catch(eD) {}
            var colorIdx = -1;
            try { colorIdx = target.getColorByIndex(0); } catch(eC) {}

            try { m.deleteMarker(target); } catch(eDel) {
                notFound.push(oldStart);
                continue;
            }

            try {
                var created = m.createMarker(newStart);
                created.name = name;
                created.comments = comments;
                if (durationSecs > 0.01) {
                    try { created.end = newStart + durationSecs; } catch(eE) {}
                }
                if (colorIdx >= 0) {
                    try { created.setColorByIndex(colorIdx); } catch(eCol) {}
                }
                moved++;
            } catch(eNew) {
                notFound.push(oldStart);
            }
        }

        return JSON.stringify({
            success: true,
            moved: moved,
            requested: moves.length,
            notFound: notFound,
            sequenceName: seq.name,
            markerCount: m.numMarkers
        });
    } catch(e) {
        return JSON.stringify({ error: "Error al mover marcadores: " + e.message });
    }
}
