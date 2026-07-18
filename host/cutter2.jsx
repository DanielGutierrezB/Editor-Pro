/**
 * host/cutter2.jsx — Cortes Automáticos 2: export/import de secuencia vía Final Cut Pro XML
 * Loaded via #include from host/index.jsx
 *
 * La estrategia CA2 nunca modifica la secuencia original:
 * 1. ca2ExportSequenceXML() exporta la secuencia activa a xmeml (solo lectura).
 * 2. El panel edita el XML (elimina zonas de remove) con xml-cut-engine.js.
 * 3. ca2ImportSequenceXML() importa el XML editado a un bin dedicado y
 *    devuelve la secuencia nueva resultante.
 */

function ca2ExportSequenceXML(outPath) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No hay secuencia activa." });

        var exported = false;
        try {
            // Segundo parámetro: 1 = suprimir UI
            exported = seq.exportAsFinalCutProXML(outPath, 1);
        } catch(e) {
            return JSON.stringify({ error: "exportAsFinalCutProXML falló: " + e.message });
        }

        var f = new File(outPath);
        if (!f.exists || f.length < 100) {
            return JSON.stringify({ error: "El XML no se generó (resultado: " + exported + ")." });
        }

        return JSON.stringify({
            success: true,
            path: outPath,
            seqName: seq.name,
            seqId: seq.sequenceID,
            durationSeconds: parseFloat(seq.end) / TICKS_PER_SECOND,
            fileSize: f.length
        });
    } catch(e) {
        return JSON.stringify({ error: "Error al exportar XML: " + e.message });
    }
}

function ca2ImportSequenceXML(xmlPath, binName, expectedSeqName) {
    try {
        var f = new File(xmlPath);
        if (!f.exists) return JSON.stringify({ error: "Archivo no encontrado: " + xmlPath });

        // Snapshot de IDs de secuencias existentes para detectar las nuevas
        var existingIds = {};
        for (var i = 0; i < app.project.sequences.numSequences; i++) {
            existingIds[app.project.sequences[i].sequenceID] = true;
        }

        var targetBin = findOrCreateBin(app.project.rootItem, binName);
        if (!targetBin) targetBin = app.project.rootItem;

        var imported = false;
        try {
            imported = app.project.importFiles([xmlPath], true, targetBin, false);
        } catch(e) {
            return JSON.stringify({ error: "importFiles falló: " + e.message });
        }

        // Esperar a que aparezcan las secuencias nuevas (la importación puede ser asíncrona)
        var newSeqs = [];
        var retries = 20;
        while (retries-- > 0) {
            newSeqs = [];
            for (var j = 0; j < app.project.sequences.numSequences; j++) {
                var s = app.project.sequences[j];
                if (!existingIds[s.sequenceID]) newSeqs.push(s);
            }
            if (newSeqs.length > 0) break;
            $.sleep(500);
        }

        if (newSeqs.length === 0) {
            return JSON.stringify({ error: "La importación no creó secuencias nuevas (importFiles: " + imported + ")." });
        }

        // La secuencia principal es la que coincide con el nombre esperado.
        // Las demás secuencias nuevas son copias de anidaciones reimportadas.
        // Fallback si el nombre no coincide (p.ej. Premiere renombró al
        // importar): la de mayor duración — las copias de nests son siempre
        // más cortas que la secuencia principal que las contiene.
        var mainSeq = null;
        for (var k = 0; k < newSeqs.length; k++) {
            if (newSeqs[k].name === expectedSeqName) { mainSeq = newSeqs[k]; break; }
        }
        if (!mainSeq) {
            var maxEnd = -1;
            for (var m = 0; m < newSeqs.length; m++) {
                var seqEnd = 0;
                try { seqEnd = parseFloat(newSeqs[m].end); } catch(eDur) { seqEnd = 0; }
                if (seqEnd > maxEnd) { maxEnd = seqEnd; mainSeq = newSeqs[m]; }
            }
            if (!mainSeq) mainSeq = newSeqs[0];
        }

        var nestedCopies = [];
        for (var n = 0; n < newSeqs.length; n++) {
            if (newSeqs[n].sequenceID !== mainSeq.sequenceID) {
                nestedCopies.push(newSeqs[n].name);
            }
        }

        // Abrir la secuencia resultante para revisión inmediata
        try {
            app.project.openSequence(mainSeq.sequenceID);
            $.sleep(300);
        } catch(e) {}

        return JSON.stringify({
            success: true,
            name: mainSeq.name,
            sequenceID: mainSeq.sequenceID,
            durationSeconds: parseFloat(mainSeq.end) / TICKS_PER_SECOND,
            binName: targetBin.name || binName,
            newSequenceCount: newSeqs.length,
            nestedCopies: nestedCopies
        });
    } catch(e) {
        return JSON.stringify({ error: "Error al importar XML: " + e.message });
    }
}
