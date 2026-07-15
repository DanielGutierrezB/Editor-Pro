/**
 * host/backup.jsx — sequence backup/restore + on-disk persistence
 * Loaded via #include from host/index.jsx.
 */

var _backupSeqName = "";
var _backupSeqId = "";
var _originalSeqId = "";
var _originalParentBinName = "";
var _batchBackups = {}; // keyed by original seqId: { backupSeqId, backupSeqName, originalName }

// ─── Backup Persistence to Disk ─────────────────────────────

function _getBackupPersistPath() {
    try {
        var projPath = app.project.path;
        if (!projPath || projPath === "") return null;
        var projFile = new File(projPath);
        var projDir = projFile.parent;
        return projDir.fsName + "/editorpro_backups.json";
    } catch(e) {
        return null;
    }
}

function _persistBackups() {
    var filePath = _getBackupPersistPath();
    if (!filePath) return;
    try {
        var data = JSON.stringify(_batchBackups);
        var f = new File(filePath);
        f.encoding = "UTF-8";
        f.open("w");
        f.write(data);
        f.close();
    } catch(e) {}
}

function _loadPersistedBackups() {
    var filePath = _getBackupPersistPath();
    if (!filePath) return;
    try {
        var f = new File(filePath);
        if (!f.exists) return;
        f.encoding = "UTF-8";
        f.open("r");
        var content = f.read();
        f.close();
        if (content) {
            var loaded = JSON.parse(content);
            for (var k in loaded) {
                if (loaded.hasOwnProperty(k) && !_batchBackups[k]) {
                    _batchBackups[k] = loaded[k];
                }
            }
        }
    } catch(e) {}
}

// Load persisted backups on startup
_loadPersistedBackups();

// ─── Backup Sequence ─────────────────────────────────────────

function backupSequence() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        _backupSeqName = seq.name;
        _originalSeqId = seq.sequenceID;
        var originalSeqId = seq.sequenceID;

        // Build datetime string: YYYY-MM-DD_HH-MM
        var now = new Date();
        var y = now.getFullYear();
        var mo = (now.getMonth() + 1 < 10 ? "0" : "") + (now.getMonth() + 1);
        var d = (now.getDate() < 10 ? "0" : "") + now.getDate();
        var h = (now.getHours() < 10 ? "0" : "") + now.getHours();
        var mi = (now.getMinutes() < 10 ? "0" : "") + now.getMinutes();
        var dateStr = y + "-" + mo + "-" + d + "_" + h + "-" + mi;

        var backupSeqName = seq.name + "_Backup_" + dateStr;

        // Snapshot all existing sequence IDs before cloning
        var existingIds = {};
        for (var si = 0; si < app.project.sequences.numSequences; si++) {
            existingIds[app.project.sequences[si].sequenceID] = true;
        }

        // Clone the sequence
        seq.clone();
        $.sleep(500);

        // Find the new sequence by checking which ID didn't exist before
        var clonedSeq = null;
        for (var i = 0; i < app.project.sequences.numSequences; i++) {
            var s = app.project.sequences[i];
            if (!existingIds[s.sequenceID]) {
                clonedSeq = s;
                break;
            }
        }

        if (clonedSeq) {
            // Rename backup
            try { clonedSeq.name = backupSeqName; } catch(e) {}
            $.sleep(200);

            // Find the parent bin of the ORIGINAL sequence (where backup folder should go)
            var parentBin = findBinContainingSequence(app.project.rootItem, originalSeqId, _backupSeqName);
            if (!parentBin) parentBin = app.project.rootItem;
            _originalParentBinName = parentBin.name || "";

            // Create "Backup" subfolder inside that parent bin
            var backupBin = findOrCreateBin(parentBin, "Backup");

            // Find the cloned item ANYWHERE in the project tree and move it
            if (backupBin) {
                var clonedResult = findItemByNameRecursive(app.project.rootItem, backupSeqName);
                if (clonedResult) {
                    try { clonedResult.item.moveBin(backupBin); } catch(e) {}
                }
            }

            _backupSeqId = clonedSeq.sequenceID;

            // Store in batch backups map (include parent bin info for restore)
            _batchBackups[originalSeqId] = {
                backupSeqId: clonedSeq.sequenceID,
                backupSeqName: backupSeqName,
                originalName: _backupSeqName,
                originalSeqId: originalSeqId,
                originalParentBinName: _originalParentBinName
            };
            _persistBackups();
        }

        // Close the backup tab by making it active then closing via QE
        if (clonedSeq) {
            try {
                // Activate the backup so it becomes the QE active sequence
                app.project.openSequence(clonedSeq.sequenceID);
                $.sleep(400);

                app.enableQE();
                var qeActive = qe.project.getActiveSequence();
                if (qeActive) {
                    qeActive.close();
                    $.sleep(300);
                }
            } catch(e) {}
        }

        // Re-ensure the original sequence is active
        $.sleep(200);
        try { app.project.openSequence(originalSeqId); } catch(e) {}
        $.sleep(200);
        try { app.project.openSequence(originalSeqId); } catch(e) {}

        return JSON.stringify({
            success: true,
            backupName: backupSeqName,
            message: "Backup creado: " + backupSeqName
        });
    } catch(e) {
        return JSON.stringify({ error: "Error al crear backup: " + e.message });
    }
}

// ─── Restore Backup ──────────────────────────────────────────

function restoreBackup() {
    try {
        if (!_backupSeqId && !_backupSeqName) {
            return JSON.stringify({ error: "No hay backup registrado." });
        }

        var originalName = _backupSeqName;
        var cutSeq = app.project.activeSequence;
        if (!cutSeq) {
            return JSON.stringify({ error: "No hay secuencia activa." });
        }

        // --- Find backup sequence ---
        var backupSeq = null;
        var backupSeqName = "";

        if (_backupSeqId) {
            for (var i = 0; i < app.project.sequences.numSequences; i++) {
                var s = app.project.sequences[i];
                if (s.sequenceID === _backupSeqId) {
                    backupSeq = s;
                    backupSeqName = s.name;
                    break;
                }
            }
        }
        if (!backupSeq) {
            for (var j = 0; j < app.project.sequences.numSequences; j++) {
                var s2 = app.project.sequences[j];
                if (s2.name.indexOf(originalName + "_Backup_") === 0) {
                    backupSeq = s2;
                    backupSeqName = s2.name;
                    break;
                }
            }
        }

        if (!backupSeq) {
            return JSON.stringify({ error: "No se encontró la secuencia de backup." });
        }

        // --- Locate the cut sequence's current parent bin ---
        var cutItemName = cutSeq.name;
        var originalParentBin = findBinContainingSequence(app.project.rootItem, cutSeq.sequenceID, cutItemName);
        if (!originalParentBin) {
            var cutResult = findItemByNameRecursive(app.project.rootItem, cutItemName);
            originalParentBin = cutResult ? cutResult.parentBin : app.project.rootItem;
        }

        // The Backup folder lives inside this parent bin
        var backupBin = findOrCreateBin(originalParentBin, "Backup");

        // --- Step 1: Rename the cut sequence to _Fail and move it to Backup folder ---
        var failName = originalName + "_Fail";
        try { cutSeq.name = failName; } catch(e) {}
        $.sleep(200);

        // Find the renamed item anywhere in the project and move to Backup
        var failResult = findItemByNameRecursive(app.project.rootItem, failName);
        if (failResult && backupBin) {
            try { failResult.item.moveBin(backupBin); } catch(e) {}
        }
        $.sleep(200);

        // --- Step 2: Move backup from Backup folder to original parent ---
        var backupItem = findItemByNameRecursive(app.project.rootItem, backupSeqName);
        if (backupItem) {
            try { backupItem.item.moveBin(originalParentBin); } catch(e) {}
        }
        $.sleep(200);

        // --- Step 3: Rename backup to the original name ---
        try { backupSeq.name = originalName; } catch(e) {}

        // --- Step 4: Open the restored sequence so it becomes the active tab ---
        app.project.openSequence(backupSeq.sequenceID);
        $.sleep(300);

        // --- Step 5: Close the fail sequence tab ---
        try {
            // Open the fail sequence to make it the active QE sequence, then close it
            app.project.openSequence(cutSeq.sequenceID);
            $.sleep(400);
            app.enableQE();
            var qeActive2 = qe.project.getActiveSequence();
            if (qeActive2) {
                qeActive2.close();
                $.sleep(300);
            }
        } catch(e) {}

        // Re-ensure restored sequence is the active one
        $.sleep(200);
        try { app.project.openSequence(backupSeq.sequenceID); } catch(e) {}
        $.sleep(200);
        try { app.project.openSequence(backupSeq.sequenceID); } catch(e) {}

        _backupSeqId = "";
        _originalSeqId = "";

        return JSON.stringify({
            success: true,
            message: "Backup restaurado. Secuencia \"" + originalName + "\" activa."
        });
    } catch(e) {
        return JSON.stringify({ error: "Error al restaurar: " + e.message });
    }
}

function restoreBackupById(seqId) {
    try {
        var info = _batchBackups[seqId];
        if (!info) {
            return JSON.stringify({ error: "No hay backup registrado para esta secuencia." });
        }

        // Temporarily set globals so restoreBackup logic works
        var prevBackupSeqId = _backupSeqId;
        var prevBackupSeqName = _backupSeqName;
        var prevOriginalSeqId = _originalSeqId;
        var prevOriginalParentBinName = _originalParentBinName;

        _backupSeqId = info.backupSeqId;
        _backupSeqName = info.originalName;
        _originalSeqId = info.originalSeqId;
        _originalParentBinName = info.originalParentBinName || "";

        // First open the cut sequence so it becomes active
        app.project.openSequence(seqId);
        $.sleep(500);

        var result = restoreBackup();
        var restoreOk = false;
        try { restoreOk = !!JSON.parse(result).success; } catch(_pe) { restoreOk = false; }

        if (restoreOk) {
            // restoreBackup() already cleared _backupSeqId/_originalSeqId on success;
            // only drop the registry entry once we know the restore actually happened,
            // so a failed restore can still be retried from the UI.
            delete _batchBackups[seqId];
            _persistBackups();
        } else {
            // Restore did not succeed — put the previous globals back so this call's
            // temporary swap doesn't leave stale/corrupted backup state behind.
            _backupSeqId = prevBackupSeqId;
            _backupSeqName = prevBackupSeqName;
            _originalSeqId = prevOriginalSeqId;
            _originalParentBinName = prevOriginalParentBinName;
        }

        return result;
    } catch(e) {
        return JSON.stringify({ error: "Error al restaurar: " + e.message });
    }
}

function getBatchBackupInfo() {
    try {
        var keys = [];
        for (var k in _batchBackups) {
            if (_batchBackups.hasOwnProperty(k)) {
                keys.push({
                    seqId: k,
                    backupName: _batchBackups[k].backupSeqName,
                    originalName: _batchBackups[k].originalName
                });
            }
        }
        return JSON.stringify({ success: true, backups: keys });
    } catch(e) {
        return JSON.stringify({ error: e.message });
    }
}
