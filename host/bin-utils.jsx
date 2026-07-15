/**
 * host/bin-utils.jsx — Project panel bin lookup/creation helpers.
 * Used by host/backup.jsx (organizing backups) and host/motion.jsx/broll.jsx
 * (organizing generated media). Loaded via #include from host/index.jsx.
 */

function findOrCreateBin(parentBin, binName) {
    for (var i = 0; i < parentBin.children.numItems; i++) {
        var child = parentBin.children[i];
        if (child && child.type === 2 && child.name === binName) {
            return child;
        }
    }
    parentBin.createBin(binName);
    for (var j = 0; j < parentBin.children.numItems; j++) {
        var child2 = parentBin.children[j];
        if (child2 && child2.type === 2 && child2.name === binName) {
            return child2;
        }
    }
    return null;
}

function findBinContainingSequence(rootItem, seqId, seqName) {
    for (var i = 0; i < rootItem.children.numItems; i++) {
        var child = rootItem.children[i];
        if (child && child.type !== 2) {
            try {
                if (child.nodeId === seqId) return rootItem;
            } catch(e) {}
            try {
                if (child.projectItem && child.projectItem.nodeId === seqId) return rootItem;
            } catch(e) {}
            if (seqName && child.name === seqName) {
                try {
                    if (child.type === 1 || child.isSequence) return rootItem;
                } catch(e) {}
                return rootItem;
            }
        }
        if (child && child.type === 2) {
            var found = findBinContainingSequence(child, seqId, seqName);
            if (found) return found;
        }
    }
    return null;
}

function findItemByNameInBin(bin, itemName) {
    if (!bin || !bin.children) return null;
    for (var i = 0; i < bin.children.numItems; i++) {
        var child = bin.children[i];
        if (child && child.name === itemName) return child;
    }
    return null;
}

function findItemByNameRecursive(rootItem, itemName) {
    for (var i = 0; i < rootItem.children.numItems; i++) {
        var child = rootItem.children[i];
        if (child && child.name === itemName && child.type !== 2) return { item: child, parentBin: rootItem };
        if (child && child.type === 2) {
            var found = findItemByNameRecursive(child, itemName);
            if (found) return found;
        }
    }
    return null;
}
