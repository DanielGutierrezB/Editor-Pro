/**
 * host/marker-reviewer.jsx — Revisar Marcadores: mover marcadores de secuencia
 * Loaded via #include from host/index.jsx
 *
 * Premiere no permite cambiar marker.start de un marcador existente, así que
 * "mover" = localizar el marcador (por tiempo +/- tolerancia y nombre), borrarlo
 * y recrearlo en la posición nueva conservando su metadata (epRecreateMarker en
 * common.jsx). Se resuelven todos los objetivos ANTES de tocar la secuencia,
 * reservando cada marcador por su guid.
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

        // ── Fase 1: resolver qué marcador corresponde a cada movimiento ──
        // Se hace ANTES de tocar nada. Recrear marcadores cambia las posiciones
        // de la secuencia, así que buscar por tiempo a mitad del proceso puede
        // agarrar el marcador equivocado (p.ej. un OUT que retrocede hasta
        // quedar donde estaba otro). Cada marcador se reserva por su guid.
        var plans = [];
        var takenGuids = {};

        for (var i = 0; i < moves.length; i++) {
            var mv = moves[i];
            var oldStart = parseFloat(mv.oldStart);
            var newStart = parseFloat(mv.newStart);
            if (isNaN(oldStart) || isNaN(newStart) || newStart < 0) {
                notFound.push(mv.oldStart);
                continue;
            }

            var target = null;
            var marker = m.getFirstMarker();
            while (marker) {
                var g = "";
                try { g = String(marker.guid || ""); } catch(eG) {}
                if (!(g && takenGuids[g]) && Math.abs(marker.start.seconds - oldStart) < EPS) {
                    if (!mv.name || (marker.name || "") === mv.name) {
                        target = marker;
                        break;
                    }
                    if (target === null) target = marker; // fallback solo por tiempo
                }
                try { marker = m.getNextMarker(marker); } catch(e) { marker = null; }
            }

            if (!target) {
                notFound.push(oldStart);
                continue;
            }

            var guid = "";
            try { guid = String(target.guid || ""); } catch(eG2) {}
            if (guid) takenGuids[guid] = true;
            plans.push({ guid: guid, oldStart: oldStart, newStart: newStart, marker: target });
        }

        // ── Fase 2: borrar + recrear ──
        for (var p = 0; p < plans.length; p++) {
            var plan = plans[p];
            // El guid identifica al marcador sin ambigüedad; si esta versión de
            // Premiere no lo expone, se usa la referencia capturada arriba.
            var current = plan.guid ? epFindMarkerByGuid(m, plan.guid) : plan.marker;
            if (!current) {
                notFound.push(plan.oldStart);
                continue;
            }

            var res = epRecreateMarker(m, current, plan.newStart, null);
            if (res.error) notFound.push(plan.oldStart);
            else moved++;
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
