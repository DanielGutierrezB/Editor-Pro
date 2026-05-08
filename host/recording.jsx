/**
 * host/recording.jsx — Recording Notes: audio export, markers, backup+cut, reel sequences
 * Loaded via #include from host/index.jsx
 */

function importCaptionsToSequence(srtFilePath) {
    var seq = app.project.activeSequence;
    if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });
    var errors = [];
    try {
        seq.importCaptionFile(srtFilePath);
        return JSON.stringify({ success: true, method: "importCaptionFile" });
    } catch(e1) { errors.push("importCaptionFile: " + e1.message); }
    try {
        var f = new File(srtFilePath);
        seq.importCaptionFile(f.fsName);
        return JSON.stringify({ success: true, method: "importCaptionFile_fsName" });
    } catch(e2) { errors.push("fsName: " + e2.message); }
    try {
        app.project.importFiles([srtFilePath], true, app.project.rootItem, false);
        return JSON.stringify({ success: true, method: "projectImport",
            note: "SRT importado al proyecto." });
    } catch(e3) { errors.push("importFiles: " + e3.message); }
    return JSON.stringify({
        error: "No se pudo importar. Archivo SRT: " + srtFilePath,
        srtPath: srtFilePath, debug: errors.join(" | ")
    });
}

function getPlayheadPosition() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });
        return JSON.stringify({
            seconds: seq.getPlayerPosition().seconds,
            ticks: seq.getPlayerPosition().ticks
        });
    } catch(e) {
        return JSON.stringify({ error: "Error: " + e.message });
    }
}

// ─── Transcribe Folder (next to .prproj) ─────────────────────

function getTranscribeFolder() {
    try {
        var projPath = app.project.path;
        if (!projPath || projPath === "") {
            return JSON.stringify({ error: "El proyecto no ha sido guardado. Guárdalo primero." });
        }

        var projFile = new File(projPath);
        var projDir = projFile.parent;
        var transcribeDir = new Folder(projDir.fsName + "/Transcribe");

        if (!transcribeDir.exists) {
            transcribeDir.create();
        }

        return JSON.stringify({
            success: true,
            path: transcribeDir.fsName,
            projectDir: projDir.fsName
        });
    } catch(e) {
        return JSON.stringify({ error: "Error al crear carpeta Transcribe: " + e.message });
    }
}

// ─── Audio Export Preset ──────────────────────────────────────

function findOrCreateAudioPreset() {
    var cachedPreset = Folder.temp.fsName + "/EditorPro_wav_preset.epr";
    var cached = new File(cachedPreset);
    if (cached.exists) {
        return JSON.stringify({ success: true, path: cachedPreset, cached: true });
    }

    try {
        app.encoder.launchEncoder();
        $.sleep(500);

        var exporters = app.encoder.getExporters();
        for (var i = 0; i < exporters.length; i++) {
            var eName = (exporters[i].name || "").toLowerCase();
            if (eName.indexOf("wav") >= 0 || eName.indexOf("waveform") >= 0) {
                var presets = exporters[i].getPresets();
                if (presets.length > 0) {
                    presets[0].writeToFile(cachedPreset);
                    return JSON.stringify({ success: true, path: cachedPreset, cached: false });
                }
            }
        }
    } catch(ex1) {}

    var years = ["2026", "2025", "2024", "2023", "2022"];
    for (var y = 0; y < years.length; y++) {
        var amePath = "/Applications/Adobe Media Encoder " + years[y];
        var presetBase = amePath + "/Adobe Media Encoder " + years[y] + ".app/Contents/MediaIO/systempresets";
        var presetFolder = new Folder(presetBase);
        if (presetFolder.exists) {
            var files = presetFolder.getFiles("*.epr");
            for (var f = 0; f < files.length; f++) {
                var fname = files[f].name.toLowerCase();
                if (fname.indexOf("wav") >= 0 || fname.indexOf("48") >= 0 || fname.indexOf("uncompressed") >= 0) {
                    return JSON.stringify({ success: true, path: files[f].fsName, cached: false });
                }
            }
        }
    }

    return JSON.stringify({
        error: "No se encontró un preset de exportación WAV. " +
               "Asegúrate de que Adobe Media Encoder esté instalado."
    });
}

// ─── Export Sequence Audio ────────────────────────────────────

function exportSequenceAudio(presetPath) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        var projPath = app.project.path;
        var outputDir = Folder.temp.fsName;
        var projDir = "";

        if (projPath && projPath !== "") {
            var projFile = new File(projPath);
            projDir = projFile.parent.fsName;
            var transcribeDir = new Folder(projDir + "/Transcribe");
            if (!transcribeDir.exists) transcribeDir.create();
            if (transcribeDir.exists) outputDir = transcribeDir.fsName;
        }

        var safeName = seq.name.replace(/[^a-zA-Z0-9_\-\. áéíóúñÁÉÍÓÚÑ]/g, "_");
        var d = new Date();
        var yy = ("0" + (d.getFullYear() % 100)).slice(-2);
        var mm = ("0" + (d.getMonth() + 1)).slice(-2);
        var dd = ("0" + (d.getDate())).slice(-2);
        var hh = ("0" + d.getHours()).slice(-2);
        var min = ("0" + d.getMinutes()).slice(-2);
        var ss = ("0" + d.getSeconds()).slice(-2);
        var baseName = safeName + "_" + yy + "-" + mm + "-" + dd + "_" + hh + "-" + min + "-" + ss;
        var outputPath = outputDir + "/" + baseName + ".wav";

        var existing = new File(outputPath);
        if (existing.exists) existing.remove();

        seq.exportAsMediaDirect(outputPath, presetPath, 0);

        var exported = new File(outputPath);
        if (!exported.exists) {
            return JSON.stringify({ error: "La exportación no generó archivo. Verifica que el preset sea válido." });
        }

        var durationSecs = 0;
        try { durationSecs = seq.end.seconds || 0; } catch(ex2) {}

        return JSON.stringify({
            success: true,
            path: outputPath,
            baseName: baseName,
            transcribeFolder: outputDir,
            sequenceName: seq.name,
            durationSeconds: durationSecs
        });
    } catch(e) {
        return JSON.stringify({ error: "Error al exportar audio: " + e.message });
    }
}

// ─── Sequence Duration By ID ─────────────────────────────────

function getSequenceDurationById(seqId) {
    try {
        var seq = findSequenceById(seqId);
        if (!seq) return JSON.stringify({ error: "Secuencia no encontrada." });
        var durationSecs = 0;
        try { durationSecs = parseFloat(seq.end) / TICKS_PER_SECOND; } catch(e) {}
        return JSON.stringify({ success: true, name: seq.name, durationSeconds: durationSecs });
    } catch(e) {
        return JSON.stringify({ error: e.message });
    }
}

// ─── Open + Backup + Cut in one synchronous call ─────────────

function openBackupAndCut(seqId, cutsFilePath) {
    try {
        var targetSeq = findSequenceById(seqId);
        if (!targetSeq) return JSON.stringify({ error: "Secuencia no encontrada: " + seqId });

        var durationBefore = 0;
        try { durationBefore = parseFloat(targetSeq.end) / TICKS_PER_SECOND; } catch(e) {}

        app.project.openSequence(targetSeq.sequenceID);
        $.sleep(1500);

        var activeSeq = app.project.activeSequence;
        var retries = 0;
        while ((!activeSeq || activeSeq.sequenceID !== seqId) && retries < 20) {
            $.sleep(500);
            activeSeq = app.project.activeSequence;
            retries++;
        }
        if (!activeSeq || activeSeq.sequenceID !== seqId) {
            return JSON.stringify({
                error: "No se pudo activar secuencia (activa: " + (activeSeq ? activeSeq.name : "ninguna") + ")",
                durationBefore: durationBefore
            });
        }

        backupSequence();
        $.sleep(800);

        activeSeq = app.project.activeSequence;
        if (!activeSeq || activeSeq.sequenceID !== seqId) {
            app.project.openSequence(seqId);
            $.sleep(1500);
            activeSeq = app.project.activeSequence;
            if (!activeSeq || activeSeq.sequenceID !== seqId) {
                return JSON.stringify({
                    error: "Secuencia cambió después de backup (activa: " + (activeSeq ? activeSeq.name : "ninguna") + ")",
                    durationBefore: durationBefore
                });
            }
        }

        var cutResultStr = executeCuts(cutsFilePath);

        var durationAfter = 0;
        try {
            var seqAfter = app.project.activeSequence;
            if (seqAfter) durationAfter = parseFloat(seqAfter.end) / TICKS_PER_SECOND;
        } catch(e) {}

        var cutResult;
        try { cutResult = JSON.parse(cutResultStr); } catch(e) {
            return JSON.stringify({ error: "Error al parsear resultado de cortes", durationBefore: durationBefore });
        }

        cutResult.durationBefore = durationBefore;
        cutResult.durationAfter = durationAfter;
        cutResult.sequenceName = targetSeq.name;

        return JSON.stringify(cutResult);
    } catch(e) {
        return JSON.stringify({ error: "Error en openBackupAndCut: " + e.message });
    }
}

// ─── Create Reel Sequence ────────────────────────────────────
// Clones the active sequence, renames it, and removes everything
// except the specified keep zones (reel segments).

function createReelSequence(jsonPath) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        var f = new File(jsonPath);
        if (!f.exists) return JSON.stringify({ error: "Archivo no encontrado: " + jsonPath });
        f.encoding = "UTF-8"; f.open("r"); var content = f.read(); f.close();

        var data = JSON.parse(content);
        var reelName = data.reelName || (seq.name + "_Reel");
        var keepZones = data.keepZones;
        if (!keepZones || keepZones.length === 0) {
            return JSON.stringify({ error: "No hay segmentos para el reel." });
        }

        var originalSeqId = seq.sequenceID;

        var existingIds = {};
        for (var si = 0; si < app.project.sequences.numSequences; si++) {
            existingIds[app.project.sequences[si].sequenceID] = true;
        }

        seq.clone();
        $.sleep(500);

        var clonedSeq = null;
        for (var i = 0; i < app.project.sequences.numSequences; i++) {
            var s = app.project.sequences[i];
            if (!existingIds[s.sequenceID]) {
                clonedSeq = s;
                break;
            }
        }

        if (!clonedSeq) {
            return JSON.stringify({ error: "No se pudo clonar la secuencia." });
        }

        try { clonedSeq.name = reelName; } catch(e) {}
        $.sleep(200);

        var parentBin = findBinContainingSequence(app.project.rootItem, originalSeqId, seq.name);
        if (!parentBin) parentBin = app.project.rootItem;
        var reelBin = findOrCreateBin(parentBin, "Reels");
        if (reelBin) {
            var clonedItem = findItemByNameRecursive(app.project.rootItem, reelName);
            if (clonedItem) {
                try { clonedItem.item.moveBin(reelBin); } catch(e) {}
            }
        }

        app.project.openSequence(clonedSeq.sequenceID);
        $.sleep(500);

        // Set 9:16 vertical resolution (1080x1920) via QE
        var frameChanged = false;
        try {
            app.enableQE();
            var qeReelSeq = qe.project.getActiveSequence();
            if (qeReelSeq) {
                qeReelSeq.setVideoFrameSize(1080, 1920);
                frameChanged = true;
            }
        } catch(e) {
            // QE frame resize failed — continue with original dimensions
        }
        $.sleep(300);

        var seqEnd = 0;
        try { seqEnd = parseFloat(clonedSeq.end) / TICKS_PER_SECOND; } catch(e) {}

        keepZones.sort(function(a, b) { return parseFloat(a.start) - parseFloat(b.start); });

        var removeZones = [];
        var cursor = 0;
        for (var k = 0; k < keepZones.length; k++) {
            var kStart = parseFloat(keepZones[k].start);
            var kEnd = parseFloat(keepZones[k].end);
            if (kStart > cursor + 0.1) {
                removeZones.push({ start: cursor, end: kStart, label: "Pre-reel gap " + (k + 1) });
            }
            cursor = kEnd;
        }
        if (cursor < seqEnd - 0.1) {
            removeZones.push({ start: cursor, end: seqEnd, label: "Post-reel tail" });
        }

        if (removeZones.length === 0) {
            return JSON.stringify({ success: true, reelName: reelName, reelSeqId: clonedSeq.sequenceID, frameChanged: frameChanged, message: "Reel creado (sin cortes necesarios)." });
        }

        var cutDataStr = JSON.stringify({ removeZones: removeZones, seqName: reelName, timestamp: "" });
        var tmpCutFile = new File(Folder.temp.fsName + "/EditorPro_reel_cuts.json");
        tmpCutFile.encoding = "UTF-8"; tmpCutFile.open("w"); tmpCutFile.write(cutDataStr); tmpCutFile.close();

        var cutResultStr = executeCuts(tmpCutFile.fsName);

        // Keep the reel sequence open (don't switch back)

        var cutResult;
        try { cutResult = JSON.parse(cutResultStr); } catch(e) {
            return JSON.stringify({ error: "Error al parsear resultado de cortes del reel." });
        }

        cutResult.reelName = reelName;
        cutResult.reelSeqId = clonedSeq.sequenceID;
        cutResult.frameChanged = frameChanged;
        return JSON.stringify(cutResult);
    } catch(e) {
        return JSON.stringify({ error: "Error al crear reel: " + e.message });
    }
}

// ═══════════════════════════════════════════════════════════════
// ═══ MOTION-PRO — Import & Place MP4 clips ═══════════════════
// ═══════════════════════════════════════════════════════════════

