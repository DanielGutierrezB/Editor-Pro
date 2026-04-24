/**
 * sequence-manager.js — Sequence detection, switching, and per-sequence state persistence
 * Polls for sequence changes, manages an LRU cache of per-sequence state,
 * and handles the sequence picker dropdown.
 * Depends on: utils.js, state.js, transcript-manager.js (loaded before this)
 * Exposes: window.SequenceManager = { ... } and backward-compat window._ep* bindings
 */
(function(global) {
    "use strict";

    // ─── Sequence cache (LRU) ─────────────────────────────────────

    var _seqCache = {};
    var _seqCacheOrder = [];
    var _SEQ_CACHE_MAX = 20;
    var _lastSeqName = "";
    var _seqSwitchInProgress = false;

    // Expose cache reference so transcript-manager can register transcript-available sequences
    global._epSeqCache = _seqCache;

    function _state() { return global._epState; }
    function _cs() { return global._epCSInterface; }

    function _seqCacheTouch(name) {
        var idx = _seqCacheOrder.indexOf(name);
        if (idx !== -1) _seqCacheOrder.splice(idx, 1);
        _seqCacheOrder.push(name);
        while (_seqCacheOrder.length > _SEQ_CACHE_MAX) {
            var evicted = _seqCacheOrder.shift();
            delete _seqCache[evicted];
        }
    }

    function _isAnyBatchActive() {
        var EP = global.EditorProUI;
        if (!EP) return false;
        if (EP.supertexts && EP.supertexts.isBatchActive && EP.supertexts.isBatchActive()) return true;
        if (EP.editSuggestions && EP.editSuggestions.isBatchActive && EP.editSuggestions.isBatchActive()) return true;
        return false;
    }

    // ─── State persistence ────────────────────────────────────────

    function saveCurrentSequenceState() {
        if (!_lastSeqName) return;
        _seqCacheTouch(_lastSeqName);
        var st = _state();
        _seqCache[_lastSeqName] = {
            transcript: st.transcript,
            segments: st.segments,
            sttResult: st.sttResult,
            lastWhisperResult: st.lastWhisperResult,
            detectionResult: st.detectionResult,
            clipResults: st.clipResults,
            textClips: st.textClips,
            supertexts2: st.supertexts2,
            supertexts2Summary: document.getElementById("st2-summary") ? document.getElementById("st2-summary").innerHTML : "",
            es2Highlights: st.es2Highlights,
            es2Suggestions: st.es2Suggestions,
            es2Errors: st.es2Errors,
            es2ResultSummary: document.getElementById("es2-summary") ? document.getElementById("es2-summary").innerHTML : "",
            reelProposals: st.reelProposals,
            reelAssessment: document.getElementById("rp-assessment") ? document.getElementById("rp-assessment").innerHTML : ""
        };
    }

    function restoreSequenceState(seqName) {
        var cached = _seqCache[seqName];
        var isPlaceholder = cached && cached._hasTranscriptFile && !cached.transcript;
        if (cached && !isPlaceholder) {
            _seqCacheTouch(seqName);
            var st = _state();
            var normalizeSt2 = (global.EPUtils && global.EPUtils.normalizeSt2Fields) || function(s) { return s; };
            st.transcript = cached.transcript || "";
            st.segments = cached.segments || [];
            st.sttResult = cached.sttResult || null;
            st.lastWhisperResult = cached.lastWhisperResult || null;
            st.detectionResult = cached.detectionResult || null;
            st.clipResults = cached.clipResults || {};
            st.textClips = cached.textClips || [];
            st.supertexts2 = (cached.supertexts2 || []).map(function(s) { normalizeSt2(s); return s; });
            st.es2Highlights = cached.es2Highlights || [];
            st.es2Suggestions = cached.es2Suggestions || [];
            st.es2Errors = cached.es2Errors || [];
            st.reelProposals = cached.reelProposals || [];
            restoreUIFromState(cached);
            if (global.EPUtils) global.EPUtils.showToast("Secuencia: " + seqName, "info");
        } else {
            clearAllToolState();
            if (global.TranscriptManager) global.TranscriptManager.autoLoadTranscriptForSequence(seqName);
        }
    }

    function clearAllToolState() {
        var st = _state();
        st.transcript = "";
        st.segments = [];
        st.sttResult = null;
        st.detectionResult = null;
        st.clipResults = {};
        st.textClips = [];
        st.supertexts2 = [];
        st.es2Highlights = [];
        st.es2Suggestions = [];
        st.es2Errors = [];
        st.reelProposals = [];
        st.analyzing = false;
        st.mpGenerating = false;
        restoreUIFromState(null);
    }

    function restoreUIFromState(cached) {
        var tm = global.TranscriptManager;

        // Transcript
        var textarea = document.getElementById("transcript-input");
        var st = _state();
        if (textarea) textarea.value = st.transcript || "";
        if (tm) { tm.onTranscriptChange(); }

        if (st.sttResult && st.sttResult.words && st.sttResult.words.length > 0) {
            if (tm) tm.renderTranscriptFromSegments();
            if (global.EditorProUI && global.EditorProUI.recording) global.EditorProUI.recording.refreshTraerTranscriptButtons();
        } else {
            if (tm) tm.clearRenderedTranscript();
        }

        // SpellCheck
        if (st.clipResults && Object.keys(st.clipResults).length > 0) {
            if (global.EditorProUI && global.EditorProUI.spellcheck) global.EditorProUI.spellcheck.render();
            if (global.EPUtils) { global.EPUtils.showElement("sc-results"); global.EPUtils.hideElement("sc-empty"); }
        } else {
            var scList = document.getElementById("sc-clip-list");
            if (scList) scList.innerHTML = "";
            if (global.EPUtils) { global.EPUtils.hideElement("sc-results"); global.EPUtils.showElement("sc-empty"); }
        }

        // Smart Supertexts
        if (st.supertexts2 && st.supertexts2.length > 0) {
            if (global.EditorProUI && global.EditorProUI.supertexts) {
                global.EditorProUI.supertexts.render({ summary: cached && cached.supertexts2Summary ? "" : st.supertexts2.length + " momentos clave identificados" });
                if (cached && cached.supertexts2Summary) {
                    var stSummary = document.getElementById("st2-summary");
                    if (stSummary) stSummary.innerHTML = cached.supertexts2Summary;
                }
            }
            if (global.EPUtils) { global.EPUtils.showElement("st2-results"); global.EPUtils.hideElement("st2-empty"); }
        } else {
            var st2List = document.getElementById("st2-list");
            var st2Sum = document.getElementById("st2-summary");
            if (st2List) st2List.innerHTML = "";
            if (st2Sum) st2Sum.innerHTML = "";
            if (global.EPUtils) { global.EPUtils.hideElement("st2-results"); global.EPUtils.showElement("st2-empty"); }
        }

        // Edit Suggestions
        if ((st.es2Highlights && st.es2Highlights.length > 0) ||
            (st.es2Suggestions && st.es2Suggestions.length > 0) ||
            (st.es2Errors && st.es2Errors.length > 0)) {
            if (global.EditorProUI && global.EditorProUI.editSuggestions) {
                global.EditorProUI.editSuggestions.render({ summary: "", overallScore: undefined });
                if (cached && cached.es2ResultSummary) {
                    var es2Sum = document.getElementById("es2-summary");
                    if (es2Sum) es2Sum.innerHTML = cached.es2ResultSummary;
                }
            }
            if (global.EPUtils) { global.EPUtils.showElement("es2-results"); global.EPUtils.hideElement("es2-empty"); }
        } else {
            var es2List = document.getElementById("es2-list");
            var es2SumEl = document.getElementById("es2-summary");
            if (es2List) es2List.innerHTML = "";
            if (es2SumEl) es2SumEl.innerHTML = "";
            if (global.EPUtils) { global.EPUtils.hideElement("es2-results"); global.EPUtils.showElement("es2-empty"); }
        }

        // Reel Proposals
        if (st.reelProposals && st.reelProposals.length > 0) {
            if (global.EditorProUI && global.EditorProUI.editSuggestions) {
                global.EditorProUI.editSuggestions.renderReelResults({ reels: st.reelProposals, assessment: "", notSuitable: [] });
                if (cached && cached.reelAssessment) {
                    var rpAssess = document.getElementById("rp-assessment");
                    if (rpAssess) rpAssess.innerHTML = cached.reelAssessment;
                }
            }
            if (global.EPUtils) { global.EPUtils.showElement("rp-results"); global.EPUtils.hideElement("rp-empty"); }
        } else {
            var rpList = document.getElementById("rp-list");
            var rpAssessEl = document.getElementById("rp-assessment");
            if (rpList) rpList.innerHTML = "";
            if (rpAssessEl) rpAssessEl.innerHTML = "";
            if (global.EPUtils) { global.EPUtils.hideElement("rp-results"); global.EPUtils.showElement("rp-empty"); }
        }
    }

    // ─── Sequence polling & refresh ───────────────────────────────

    function refreshSequenceInfo() {
        var cs = _cs();
        if (!cs) return;
        cs.evalScript("getActiveSequenceInfo()", function(result) {
            try {
                var data = JSON.parse(result);
                if (data.error) {
                    var nameEl = document.getElementById("seq-name");
                    var metaEl = document.getElementById("seq-meta");
                    if (nameEl) nameEl.textContent = "Sin secuencia activa";
                    if (metaEl) metaEl.textContent = "";
                    return;
                }
                var newSeqName = data.name || "";
                var isFirstLoad = _lastSeqName === "" && newSeqName !== "";
                var changed = newSeqName && newSeqName !== _lastSeqName && _lastSeqName !== "";

                if (changed) {
                    if (global.EPLogger) global.EPLogger.log("main", "sequence-change", _lastSeqName + " → " + newSeqName);
                    saveCurrentSequenceState();
                }

                var st = _state();
                st.sequenceName = newSeqName;
                _lastSeqName = newSeqName;
                var nameEl2 = document.getElementById("seq-name");
                if (nameEl2) nameEl2.textContent = newSeqName;
                var meta = [];
                if (data.textClipCount > 0) meta.push(data.textClipCount + " textos");
                if (data.markerCount > 0) meta.push(data.markerCount + " markers");
                var metaEl2 = document.getElementById("seq-meta");
                if (metaEl2) metaEl2.textContent = meta.join(" · ");

                if (changed && !_isAnyBatchActive()) {
                    restoreSequenceState(newSeqName);
                    if (global.EditorProUI && global.EditorProUI.motionPro && global.EditorProUI.motionPro.switchToSequence) {
                        global.EditorProUI.motionPro.switchToSequence();
                    }
                } else if (isFirstLoad) {
                    if (!st.transcript && (!st.segments || st.segments.length === 0)) {
                        if (global.TranscriptManager) global.TranscriptManager.autoLoadTranscriptForSequence(newSeqName);
                    }
                }
            } catch(e) {}
        });

        cs.evalScript("getTranscribeFolder()", function(result) {
            try {
                var data = JSON.parse(result);
                if (data.success && data.path) {
                    var st = _state();
                    st.transcribeFolder = data.path;
                    if (global.TranscriptManager) {
                        global.TranscriptManager.saveLastTranscriptFolder(data.path + "/dummy");
                        global.TranscriptManager.buildTranscriptCache();
                    }
                }
            } catch(e) {}
        });
    }

    function startSequencePolling() {
        setInterval(function() {
            if (_seqSwitchInProgress) return;
            var cs = _cs();
            if (!cs) return;
            cs.evalScript("getActiveSequenceInfo()", function(result) {
                if (_seqSwitchInProgress) return;
                try {
                    var data = JSON.parse(result);
                    if (data.error || !data.name) return;
                    if (data.name !== _lastSeqName && _lastSeqName !== "") {
                        if (global.EPLogger) global.EPLogger.log("main", "sequence-change-poll", _lastSeqName + " → " + data.name);
                        saveCurrentSequenceState();
                        _lastSeqName = data.name;
                        var st = _state();
                        st.sequenceName = data.name;
                        var nameEl = document.getElementById("seq-name");
                        if (nameEl) nameEl.textContent = data.name;
                        var meta = [];
                        if (data.markerCount > 0) meta.push(data.markerCount + " markers");
                        var metaEl = document.getElementById("seq-meta");
                        if (metaEl) metaEl.textContent = meta.join(" · ");
                        if (_isAnyBatchActive()) return;
                        restoreSequenceState(data.name);
                        if (global.EditorProUI && global.EditorProUI.motionPro && global.EditorProUI.motionPro.switchToSequence) {
                            global.EditorProUI.motionPro.switchToSequence();
                        }
                        // Refresh transcribe folder
                        cs.evalScript("getTranscribeFolder()", function(tfResult) {
                            try {
                                var tfData = JSON.parse(tfResult);
                                if (tfData.success && tfData.path) {
                                    var st2 = _state();
                                    var prevFolder = st2.transcribeFolder;
                                    st2.transcribeFolder = tfData.path;
                                    if (global.TranscriptManager) {
                                        global.TranscriptManager.saveLastTranscriptFolder(tfData.path + "/dummy");
                                        if (tfData.path !== prevFolder) global.TranscriptManager.buildTranscriptCache();
                                    }
                                }
                            } catch(e) {}
                        });
                    } else if (!_lastSeqName) {
                        _lastSeqName = data.name;
                        _state().sequenceName = data.name;
                    }
                } catch(e) {}
            });
        }, 2000);
    }

    // ─── Sequence dropdown ────────────────────────────────────────

    function toggleSeqDropdown() {
        var panel = document.getElementById("seq-dropdown-panel");
        if (!panel) return;
        var wasHidden = panel.classList.contains("hidden");
        if (wasHidden) { saveCurrentSequenceState(); populateSeqDropdown(); }
        panel.classList.toggle("hidden");
    }

    function populateSeqDropdown() {
        var list = document.getElementById("seq-dropdown-list");
        if (!list) return;
        list.innerHTML = "";

        var names = Object.keys(_seqCache);
        if (_lastSeqName && names.indexOf(_lastSeqName) === -1) {
            saveCurrentSequenceState();
            names = Object.keys(_seqCache);
        }

        if (names.length === 0) {
            list.innerHTML = '<div class="seq-dropdown-empty">Sin secuencias con contenido</div>';
            return;
        }

        names.forEach(function(name) {
            var cached = _seqCache[name];
            var tags = buildSeqSummaryTags(cached);
            if (tags.length === 0) return;

            var item = document.createElement("div");
            item.className = "seq-dropdown-item" + (name === _lastSeqName ? " seq-active" : "");

            var nameSpan = document.createElement("div");
            nameSpan.className = "seq-dropdown-name";
            nameSpan.textContent = name;
            item.appendChild(nameSpan);

            var tagsDiv = document.createElement("div");
            tagsDiv.className = "seq-dropdown-tags";
            tags.forEach(function(tag) {
                var t = document.createElement("span");
                t.className = "seq-dropdown-tag";
                t.style.color = tag.color || "var(--text-muted)";
                t.textContent = tag.label;
                tagsDiv.appendChild(t);
            });
            item.appendChild(tagsDiv);

            (function(seqName) {
                item.addEventListener("click", function() {
                    openSequenceByName(seqName);
                    var panel2 = document.getElementById("seq-dropdown-panel");
                    if (panel2) panel2.classList.add("hidden");
                });
            })(name);

            list.appendChild(item);
        });

        if (list.children.length === 0) {
            list.innerHTML = '<div class="seq-dropdown-empty">Sin secuencias con contenido</div>';
        }
    }

    function buildSeqSummaryTags(cached) {
        var tags = [];
        if (!cached) return tags;
        if ((cached.transcript && cached.transcript.trim().length > 0) || cached._hasTranscriptFile) {
            tags.push({ label: "📝 Transcripción", color: "var(--text-secondary)" });
        }
        if (cached.es2Highlights && cached.es2Highlights.length > 0) {
            tags.push({ label: "⭐ " + cached.es2Highlights.length + " highlights", color: "var(--highlight)" });
        }
        if (cached.es2Suggestions && cached.es2Suggestions.length > 0) {
            tags.push({ label: "✂️ " + cached.es2Suggestions.length + " sugerencias", color: "var(--warning)" });
        }
        if (cached.es2Errors && cached.es2Errors.length > 0) {
            tags.push({ label: "🚨 " + cached.es2Errors.length + " errores", color: "var(--error)" });
        }
        if (cached.supertexts2 && cached.supertexts2.length > 0) {
            tags.push({ label: "💡 " + cached.supertexts2.length + " supertexts", color: "var(--success)" });
        }
        if (cached.reelProposals && cached.reelProposals.length > 0) {
            tags.push({ label: "🎬 " + cached.reelProposals.length + " reels", color: "#ec4899" });
        }
        if (cached.detectionResult) {
            var segs = cached.detectionResult.segments;
            if (segs && segs.length > 0) tags.push({ label: "🎙 " + segs.length + " tomas", color: "var(--accent-bright)" });
        }
        return tags;
    }

    function openSequenceByName(seqName) {
        if (seqName === _lastSeqName) return;
        saveCurrentSequenceState();
        _seqSwitchInProgress = true;

        var safeName = seqName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        var cs = _cs();
        if (!cs) { _seqSwitchInProgress = false; return; }
        cs.evalScript('findAndOpenSequenceByName("' + safeName + '")', function(result) {
            try {
                var res = JSON.parse(result);
                if (res.error) {
                    _seqSwitchInProgress = false;
                    if (global.EPUtils) global.EPUtils.showToast("Error: " + res.error, "error");
                    return;
                }
                _lastSeqName = seqName;
                var st = _state();
                st.sequenceName = seqName;
                var nameEl = document.getElementById("seq-name");
                if (nameEl) nameEl.textContent = seqName;
                restoreSequenceState(seqName);
            } catch(e) {
                if (global.EPUtils) global.EPUtils.showToast("Error al abrir secuencia", "error");
            }
            _seqSwitchInProgress = false;
        });
    }

    // ─── Expose API ───────────────────────────────────────────────

    global.SequenceManager = {
        seqCache: _seqCache,
        getLastSeqName: function() { return _lastSeqName; },
        setLastSeqName: function(n) { _lastSeqName = n; },
        seqCacheTouch: _seqCacheTouch,
        saveCurrentSequenceState: saveCurrentSequenceState,
        restoreSequenceState: restoreSequenceState,
        clearAllToolState: clearAllToolState,
        restoreUIFromState: restoreUIFromState,
        refreshSequenceInfo: refreshSequenceInfo,
        startSequencePolling: startSequencePolling,
        toggleSeqDropdown: toggleSeqDropdown,
        populateSeqDropdown: populateSeqDropdown,
        buildSeqSummaryTags: buildSeqSummaryTags,
        openSequenceByName: openSequenceByName
    };

    // Backward-compat bindings
    global._epRefreshSequenceInfo = refreshSequenceInfo;

    // Allow batch navigators to update _lastSeqName and block polling
    global._epNotifyBatchSeqSwitch = function(seqName) {
        if (_lastSeqName && seqName !== _lastSeqName) saveCurrentSequenceState();
        _lastSeqName = seqName;
        var st = _state();
        st.sequenceName = seqName;
        var nameEl = document.getElementById("seq-name");
        if (nameEl) nameEl.textContent = seqName;
    };

})(window);
