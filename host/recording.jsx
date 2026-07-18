/**
 * host/recording.jsx — Recording Notes: audio export, markers, backup+cut
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
// Read-only: resolves the Transcribe folder path WITHOUT creating it on disk.
// The folder is created lazily at the first real write (audio export / transcript
// save / copy). Pass createIfMissing=true only from an actual write path.

function getTranscribeFolder(createIfMissing) {
    try {
        var projPath = app.project.path;
        if (!projPath || projPath === "") {
            return JSON.stringify({ error: "El proyecto no ha sido guardado. Guárdalo primero." });
        }

        var projFile = new File(projPath);
        var projDir = projFile.parent;
        var transcribeDir = new Folder(projDir.fsName + "/Transcribe");

        if (createIfMissing === true && !transcribeDir.exists) {
            transcribeDir.create();
        }

        return JSON.stringify({
            success: true,
            path: transcribeDir.fsName,
            projectDir: projDir.fsName
        });
    } catch(e) {
        return JSON.stringify({ error: "Error al resolver carpeta Transcribe: " + e.message });
    }
}

// ─── Audio Export Preset ──────────────────────────────────────

function findOrCreateAudioPreset() {
    var cachedPreset = Folder.temp.fsName + "/EditorPro_wav_preset.epr";
    var cached = new File(cachedPreset);
    if (cached.exists) {
        return JSON.stringify({ success: true, path: cachedPreset, cached: true });
    }

    // 1) Preset .epr de WAV que Adobe ya deja en disco (AME y Premiere) —
    //    NO requiere abrir Media Encoder. Cubre macOS y Windows.
    var presetBases = [];
    var years = ["2026", "2025", "2024", "2023", "2022"];
    var y;
    for (y = 0; y < years.length; y++) {
        // macOS
        presetBases.push("/Applications/Adobe Media Encoder " + years[y] +
            "/Adobe Media Encoder " + years[y] + ".app/Contents/MediaIO/systempresets");
        presetBases.push("/Applications/Adobe Premiere Pro " + years[y] +
            "/Adobe Premiere Pro " + years[y] + ".app/Contents/MediaIO/systempresets");
        // Windows
        presetBases.push("C:/Program Files/Adobe/Adobe Media Encoder " + years[y] + "/MediaIO/systempresets");
        presetBases.push("C:/Program Files/Adobe/Adobe Premiere Pro " + years[y] + "/MediaIO/systempresets");
    }
    for (var b = 0; b < presetBases.length; b++) {
        var presetFolder = new Folder(presetBases[b]);
        if (!presetFolder.exists) continue;
        // Los .epr suelen estar en subcarpetas; recorrer un nivel también
        var found = _scanEprFolder(presetFolder);
        if (found) return JSON.stringify({ success: true, path: found, cached: false });
        var subs = presetFolder.getFiles(function(f) { return f instanceof Folder; });
        for (var s = 0; s < subs.length; s++) {
            found = _scanEprFolder(subs[s]);
            if (found) return JSON.stringify({ success: true, path: found, cached: false });
        }
    }

    // 2) Último recurso: pedirle el preset a Media Encoder (abre AME una vez)
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

    return JSON.stringify({
        error: "No se encontró un preset de exportación WAV. " +
               "Asegúrate de que Adobe Media Encoder esté instalado."
    });
}

// Busca en una carpeta un .epr de audio WAV (sin abrir AME).
function _scanEprFolder(folder) {
    if (!folder || !folder.exists) return null;
    var files = folder.getFiles("*.epr");
    for (var f = 0; f < files.length; f++) {
        var fname = files[f].name.toLowerCase();
        if (fname.indexOf("wav") >= 0 || fname.indexOf("waveform") >= 0 ||
            fname.indexOf("uncompressed") >= 0) {
            return files[f].fsName;
        }
    }
    return null;
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

