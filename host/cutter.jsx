/**
 * host/cutter.jsx — Execute marker-based cuts (executeCuts, trimZoneOnTrack, writeLog)
 * Loaded via #include from host/index.jsx
 */

// ─── Execute Cuts (Main Entry) ───────────────────────────────

function executeCuts(filePath) {
    var log = [];
    var stats = { razored: 0, removed: 0, errors: 0, method: "ninguno" };

    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        log.push("Secuencia: " + seq.name);
        log.push("Video tracks: " + seq.videoTracks.numTracks);
        log.push("Audio tracks: " + seq.audioTracks.numTracks);

        var f = new File(filePath);
        if (!f.exists) return JSON.stringify({ error: "Archivo no encontrado: " + filePath });
        f.encoding = "UTF-8"; f.open("r"); var content = f.read(); f.close();

        var data = JSON.parse(content);
        var removeZones = data.removeZones;
        if (!removeZones || removeZones.length === 0) {
            return JSON.stringify({ success: true, message: "Sin zonas a eliminar.", stats: stats });
        }

        log.push("Zonas a eliminar: " + removeZones.length);
        for (var zz = 0; zz < removeZones.length; zz++) {
            log.push("  Zona " + zz + ": " + parseFloat(removeZones[zz].start).toFixed(2) + "s - " + parseFloat(removeZones[zz].end).toFixed(2) + "s (" + removeZones[zz].label + ")");
        }

        enableAllTracks(seq);
        log.push("Tracks habilitados");

        var clipsBefore = countAllClips(seq);
        log.push("Clips totales antes: " + clipsBefore);

        // ── Enable QE & Discover Methods ──
        var qeSeq = null;
        try {
            app.enableQE();
            log.push("app.enableQE() OK");
        } catch(e) {
            log.push("app.enableQE() FALLO: " + e.message);
        }

        try {
            if (typeof qe !== "undefined" && qe !== null) {
                qeSeq = qe.project.getActiveSequence();
                if (qeSeq) {
                    log.push("QE secuencia: " + (qeSeq.name || "OK"));
                    log.push("QE V=" + qeSeq.numVideoTracks + " A=" + qeSeq.numAudioTracks);

                    var seqMethods = discoverMethods(qeSeq, "qeSeq");
                    log.push("QE seq metodos: " + seqMethods.join(", "));

                    if (qeSeq.numVideoTracks > 0) {
                        try {
                            var t0 = qeSeq.getVideoTrackAt(0);
                            var trackMethods = discoverMethods(t0, "qeTrack");
                            log.push("QE track metodos: " + trackMethods.join(", "));
                        } catch(e) {}
                    }
                } else {
                    log.push("QE secuencia es NULL");
                }
            } else {
                log.push("qe global NO disponible");
            }
        } catch(e) {
            log.push("QE check ERROR: " + e.message);
        }

        // Also discover Sequence DOM methods
        try {
            var domMethods = discoverMethods(seq, "seq");
            log.push("DOM seq metodos: " + domMethods.join(", "));
        } catch(e) {}

        // ══════════════════════════════════════════════════════════
        // STRATEGY: Set In/Out points + Extract for each zone
        // Process zones from END to START so time shifts don't affect earlier zones
        // ══════════════════════════════════════════════════════════

        log.push("=== ESTRATEGIA: In/Out + Extract ===");
        stats.method = "InOut+Extract";

        for (var z = removeZones.length - 1; z >= 0; z--) {
            var zStart = parseFloat(removeZones[z].start);
            var zEnd = parseFloat(removeZones[z].end);
            var startTicks = secsToTicks(zStart);
            var endTicks = secsToTicks(zEnd);

            log.push("Zona " + z + " [" + zStart.toFixed(2) + "s - " + zEnd.toFixed(2) + "s] (" + removeZones[z].label + ")");

            // Set In point
            var inOK = false;
            try {
                seq.setInPoint(startTicks);
                inOK = true;
                log.push("  setInPoint(" + zStart.toFixed(2) + "s) OK");
            } catch(e) {
                log.push("  setInPoint(ticks) ERR: " + e.message);
                try {
                    seq.setInPoint(zStart);
                    inOK = true;
                    log.push("  setInPoint(seconds) OK");
                } catch(e2) {
                    log.push("  setInPoint(seconds) ERR: " + e2.message);
                }
            }

            // Set Out point
            var outOK = false;
            try {
                seq.setOutPoint(endTicks);
                outOK = true;
                log.push("  setOutPoint(" + zEnd.toFixed(2) + "s) OK");
            } catch(e) {
                log.push("  setOutPoint(ticks) ERR: " + e.message);
                try {
                    seq.setOutPoint(zEnd);
                    outOK = true;
                    log.push("  setOutPoint(seconds) OK");
                } catch(e2) {
                    log.push("  setOutPoint(seconds) ERR: " + e2.message);
                }
            }

            $.sleep(500);

            if (!inOK || !outOK) {
                log.push("  SKIP: No se pudo poner In/Out");
                stats.errors++;
                continue;
            }

            var extracted = false;

            if (qeSeq) {
                var extractNames = [
                    "extract", "extractEdit", "performExtractEdit",
                    "performExtract", "rippleDelete", "performRippleDelete",
                    "rippleDeleteInOut", "extractInOut", "performExtraction",
                    "editExtract", "removeInOut", "deleteInOut"
                ];
                for (var em = 0; em < extractNames.length && !extracted; em++) {
                    try {
                        if (typeof qeSeq[extractNames[em]] === "function") {
                            qeSeq[extractNames[em]]();
                            extracted = true;
                            log.push("  qeSeq." + extractNames[em] + "() OK!");
                            stats.removed++;
                        }
                    } catch(e) {
                        log.push("  qeSeq." + extractNames[em] + "() ERR: " + e.message);
                    }
                }

                // Also try on the player sub-object
                if (!extracted) {
                    try {
                        var player = qeSeq.player;
                        if (player) {
                            var playerMethods = discoverMethods(player, "player");
                            log.push("  QE player metodos: " + playerMethods.join(", "));
                            var playerExtract = ["extract", "extractEdit", "performExtract", "rippleDelete"];
                            for (var pe = 0; pe < playerExtract.length && !extracted; pe++) {
                                try {
                                    if (typeof player[playerExtract[pe]] === "function") {
                                        player[playerExtract[pe]]();
                                        extracted = true;
                                        log.push("  player." + playerExtract[pe] + "() OK!");
                                        stats.removed++;
                                    }
                                } catch(e) {
                                    log.push("  player." + playerExtract[pe] + "() ERR: " + e.message);
                                }
                            }
                        }
                    } catch(e) {
                        log.push("  player access ERR: " + e.message);
                    }
                }
            }

            // If QE extract failed, try DOM-level methods
            if (!extracted) {
                var domExtract = ["extractEdit", "extract", "performExtract", "rippleDelete"];
                for (var de = 0; de < domExtract.length && !extracted; de++) {
                    try {
                        if (typeof seq[domExtract[de]] === "function") {
                            seq[domExtract[de]]();
                            extracted = true;
                            log.push("  seq." + domExtract[de] + "() OK!");
                            stats.removed++;
                        }
                    } catch(e) {
                        log.push("  seq." + domExtract[de] + "() ERR: " + e.message);
                    }
                }
            }

            if (!extracted) {
                log.push("  NINGÚN método de extract funciono para esta zona");
                stats.errors++;
            }

            $.sleep(700);
        }

        $.sleep(500);
        var clipsAfterExtract = countAllClips(seq);
        log.push("Clips despues de extract: " + clipsAfterExtract + " (antes: " + clipsBefore + ")");

        // ══════════════════════════════════════════════════════════
        // FALLBACK: If extract didn't work, try QE razor + manual trim/delete
        // ══════════════════════════════════════════════════════════

        if (clipsAfterExtract >= clipsBefore && stats.removed === 0) {
            log.push("=== FALLBACK: Razor + Trim manual ===");
            stats.method = "ManualTrim";
            stats.errors = 0;

            // Re-read zones (timecodes haven't shifted since extract didn't work)
            for (var z2 = removeZones.length - 1; z2 >= 0; z2--) {
                var zs2 = parseFloat(removeZones[z2].start);
                var ze2 = parseFloat(removeZones[z2].end);

                log.push("Zona " + z2 + " [" + zs2.toFixed(2) + "s - " + ze2.toFixed(2) + "s]");

                // For each track, handle clips that overlap this zone
                for (var v = 0; v < seq.videoTracks.numTracks; v++) {
                    trimZoneOnTrack(seq.videoTracks[v], zs2, ze2, stats, log, "V" + v);
                }
                for (var a = 0; a < seq.audioTracks.numTracks; a++) {
                    trimZoneOnTrack(seq.audioTracks[a], zs2, ze2, stats, log, "A" + a);
                }

                $.sleep(300);
            }

            var clipsAfterTrim = countAllClips(seq);
            log.push("Clips despues de trim: " + clipsAfterTrim + " (antes: " + clipsBefore + ")");
        }

        // ── Clear In/Out marks ──
        try { seq.setInPoint(seq.zeroPoint); } catch(e) {}
        try { seq.setOutPoint(seq.end); } catch(e) {}

        var clipsFinal = countAllClips(seq);
        log.push("=== RESULTADO ===");
        log.push("Clips finales: " + clipsFinal + " (original: " + clipsBefore + ")");
        log.push("Metodo: " + stats.method);
        log.push("Eliminados: " + stats.removed + ", Errores: " + stats.errors);

        // Write log to disk
        writeLog(filePath, log);

        return JSON.stringify({
            success: true,
            message: "Metodo: " + stats.method + ". Eliminados: " + stats.removed + ", Errores: " + stats.errors,
            stats: stats,
            log: log
        });
    } catch(e) {
        log.push("ERROR FATAL: " + e.message + " (linea " + e.line + ")");
        writeLog(filePath, log);
        return JSON.stringify({ error: e.message, log: log });
    }
}

// ─── Manual Trim for clips overlapping a zone ────────────────
// Handles: clip entirely inside (remove), clip ends in zone (trim end),
//          clip starts in zone (trim start), clip spans zone (trim both ends)

function trimZoneOnTrack(track, zStart, zEnd, stats, log, label) {
    var nc = 0;
    try { nc = track.clips.numItems; } catch(e) { return; }
    if (nc === 0) return;

    var EPS = 0.05;

    // Read all clip info first (since we'll modify them)
    var clips = [];
    for (var c = 0; c < nc; c++) {
        try {
            var clip = track.clips[c];
            clips.push({
                idx: c,
                clip: clip,
                start: clip.start.seconds,
                end: clip.end.seconds,
                inPt: clip.inPoint.seconds,
                outPt: clip.outPoint.seconds
            });
        } catch(e) {}
    }

    // Process backward for index stability
    for (var i = clips.length - 1; i >= 0; i--) {
        var ci = clips[i];
        if (ci.end <= zStart + EPS || ci.start >= zEnd - EPS) continue;

        // Case 1: Clip entirely inside zone -> remove it
        if (ci.start >= zStart - EPS && ci.end <= zEnd + EPS) {
            try {
                ci.clip.remove(true, true);
                stats.removed++;
                log.push("  " + label + "[" + ci.idx + "] REMOVE (" + ci.start.toFixed(2) + "-" + ci.end.toFixed(2) + ")");
            } catch(e) {
                log.push("  " + label + "[" + ci.idx + "] REMOVE ERR: " + e.message);
                stats.errors++;
            }
            $.sleep(100);
            continue;
        }

        // Case 2: Clip starts before zone, ends inside -> trim end to zone start
        if (ci.start < zStart - EPS && ci.end > zStart + EPS && ci.end <= zEnd + EPS) {
            try {
                var newOutPt = ci.inPt + (zStart - ci.start);
                ci.clip.outPoint = newOutPt;
                ci.clip.end = zStart;
                stats.removed++;
                log.push("  " + label + "[" + ci.idx + "] TRIM-END -> " + zStart.toFixed(2) + "s");
            } catch(e) {
                log.push("  " + label + "[" + ci.idx + "] TRIM-END ERR: " + e.message);
                stats.errors++;
            }
            $.sleep(100);
            continue;
        }

        // Case 3: Clip starts inside zone, ends after -> trim start to zone end
        if (ci.start >= zStart - EPS && ci.start < zEnd - EPS && ci.end > zEnd + EPS) {
            try {
                var trimDuration = zEnd - ci.start;
                ci.clip.inPoint = ci.inPt + trimDuration;
                ci.clip.start = zEnd;
                stats.removed++;
                log.push("  " + label + "[" + ci.idx + "] TRIM-START -> " + zEnd.toFixed(2) + "s");
            } catch(e) {
                log.push("  " + label + "[" + ci.idx + "] TRIM-START ERR: " + e.message);
                stats.errors++;
            }
            $.sleep(100);
            continue;
        }

        // Case 4: Clip spans entire zone (starts before, ends after)
        // We can only trim the end to zone start (losing everything after zone start)
        // This is destructive but it's the best we can do without razor
        if (ci.start < zStart - EPS && ci.end > zEnd + EPS) {
            log.push("  " + label + "[" + ci.idx + "] SPANS zona (" + ci.start.toFixed(2) + "-" + ci.end.toFixed(2) + ") - trim end solo");
            try {
                var newOut = ci.inPt + (zStart - ci.start);
                ci.clip.outPoint = newOut;
                ci.clip.end = zStart;
                stats.removed++;
                log.push("    -> clip.end = " + zStart.toFixed(2) + "s (pierde contenido despues)");
            } catch(e) {
                log.push("    TRIM ERR: " + e.message);
                stats.errors++;
            }
            $.sleep(100);
            continue;
        }
    }
}

function writeLog(filePath, log) {
    try {
        var logPath = filePath.replace(".json", "_log.txt");
        var lf = new File(logPath);
        lf.encoding = "UTF-8"; lf.open("w"); lf.write(log.join("\n")); lf.close();
    } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════
// SpellCheck / Supertexts / EditSuggestions Host Functions
// ═══════════════════════════════════════════════════════════════

