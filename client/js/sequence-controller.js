/**
 * sequence-controller.js — Sequence detection, per-sequence state caching, dropdown
 * Cross-module calls use window.X() resolved at call time (after all scripts load).
 * Exposes: window.refreshSequenceInfo, window.startSequencePolling, window.toggleSeqDropdown,
 *          window.populateSeqDropdown, window.buildSeqSummaryTags, window.openSequenceByName,
 *          window.saveCurrentSequenceState, window.restoreSequenceState,
 *          window.clearAllToolState, window.restoreUIFromState, window._epNotifyBatchSeqSwitch
 */
(function(global) {
    "use strict";

    var state = global._epState; // state.js is loaded before this module

    // LRU sequence cache — stores per-sequence tool state
    var _seqCache = {};
    var _seqCacheOrder = [];
    var _SEQ_CACHE_MAX = 20;
    var _lastSeqName = "";
    var _seqSwitchInProgress = false;

    // Expose cache for transcript-cache.js to populate entries
    global._epSeqCache = _seqCache;

    function _isAnyBatchActive() {
        var EP = global.EditorProUI;
        if (!EP) return false;
        if (EP.supertexts && EP.supertexts.isBatchActive && EP.supertexts.isBatchActive()) return true;
        if (EP.editSuggestions && EP.editSuggestions.isBatchActive && EP.editSuggestions.isBatchActive()) return true;
        return false;
    }

    function _seqCacheTouch(name) {
        var idx = _seqCacheOrder.indexOf(name);
        if (idx !== -1) _seqCacheOrder.splice(idx, 1);
        _seqCacheOrder.push(name);
        while (_seqCacheOrder.length > _SEQ_CACHE_MAX) {
            var evicted = _seqCacheOrder.shift();
            delete _seqCache[evicted];
        }
    }

    function refreshSequenceInfo() {
        var csInterface = global._epCSInterface;
        csInterface.evalScript("getActiveSequenceInfo()", function(result) {
            try {
                var data = JSON.parse(result);
                if (data.error) {
                    document.getElementById("seq-name").textContent = "Sin secuencia activa";
                    document.getElementById("seq-meta").textContent = "";
                    return;
                }
                var newSeqName = data.name || "";
                var isFirstLoad = _lastSeqName === "" && newSeqName !== "";
                var changed = newSeqName && newSeqName !== _lastSeqName && _lastSeqName !== "";

                if (changed) {
                    if (global.EPLogger) EPLogger.log("main", "sequence-change", _lastSeqName + " → " + newSeqName);
                    saveCurrentSequenceState();
                }

                state.sequenceName = newSeqName;
                _lastSeqName = newSeqName;
                document.getElementById("seq-name").textContent = newSeqName;
                var meta = [];
                if (data.textClipCount > 0) meta.push(data.textClipCount + " textos");
                if (data.markerCount > 0) meta.push(data.markerCount + " markers");
                document.getElementById("seq-meta").textContent = meta.join(" · ");

                if (changed && !_isAnyBatchActive()) {
                    restoreSequenceState(newSeqName);
                    if (global.EditorProUI && global.EditorProUI.motionPro && global.EditorProUI.motionPro.switchToSequence) global.EditorProUI.motionPro.switchToSequence();
                    if (global.EditorProUI && global.EditorProUI.broll && global.EditorProUI.broll.switchToSequence) global.EditorProUI.broll.switchToSequence(newSeqName);
                } else if (isFirstLoad) {
                    if (!state.transcript && (!state.segments || state.segments.length === 0)) {
                        if (global.autoLoadTranscriptForSequence) global.autoLoadTranscriptForSequence(newSeqName);
                    }
                    // Notify B-Roll on first load too (not just on sequence change)
                    if (global.EditorProUI && global.EditorProUI.broll && global.EditorProUI.broll.switchToSequence) global.EditorProUI.broll.switchToSequence(newSeqName);
                }
            } catch(e) {}
        });

        csInterface.evalScript("getTranscribeFolder()", function(result) {
            try {
                var data = JSON.parse(result);
                if (data.success && data.path) {
                    state.transcribeFolder = data.path;
                    if (global._epSaveLastTranscriptFolder) global._epSaveLastTranscriptFolder(data.path + "/dummy");
                    if (global._epBuildTranscriptCache) global._epBuildTranscriptCache();
                }
            } catch(e) {}
        });
    }

    function startSequencePolling() {
        var csInterface = global._epCSInterface;
        setInterval(function() {
            if (_seqSwitchInProgress) return;
            csInterface.evalScript("getActiveSequenceInfo()", function(result) {
                if (_seqSwitchInProgress) return;
                try {
                    var data = JSON.parse(result);
                    if (data.error || !data.name) return;
                    if (data.name !== _lastSeqName && _lastSeqName !== "") {
                        if (global.EPLogger) EPLogger.log("main", "sequence-change-poll", _lastSeqName + " → " + data.name);
                        saveCurrentSequenceState();
                        _lastSeqName = data.name;
                        state.sequenceName = data.name;
                        document.getElementById("seq-name").textContent = data.name;
                        var meta = [];
                        if (data.markerCount > 0) meta.push(data.markerCount + " markers");
                        document.getElementById("seq-meta").textContent = meta.join(" · ");
                        if (_isAnyBatchActive()) return;
                        restoreSequenceState(data.name);
                        if (global.EditorProUI && global.EditorProUI.motionPro && global.EditorProUI.motionPro.switchToSequence) global.EditorProUI.motionPro.switchToSequence();
                        if (global.EditorProUI && global.EditorProUI.broll && global.EditorProUI.broll.switchToSequence) global.EditorProUI.broll.switchToSequence(data.name);
                        csInterface.evalScript("getTranscribeFolder()", function(tfResult) {
                            try {
                                var tfData = JSON.parse(tfResult);
                                if (tfData.success && tfData.path) {
                                    var _prevFolder = state.transcribeFolder;
                                    state.transcribeFolder = tfData.path;
                                    if (global._epSaveLastTranscriptFolder) global._epSaveLastTranscriptFolder(tfData.path + "/dummy");
                                    if (tfData.path !== _prevFolder && global._epBuildTranscriptCache) global._epBuildTranscriptCache();
                                }
                            } catch(e) {}
                        });
                    } else if (!_lastSeqName) {
                        _lastSeqName = data.name;
                        state.sequenceName = data.name;
                    }
                } catch(e) {}
            });
        }, 2000);
    }

    // ─── Sequence Dropdown ─────────────────────────────────────

    function toggleSeqDropdown() {
        var panel = document.getElementById("seq-dropdown-panel");
        if (!panel) return;
        var wasHidden = panel.classList.contains("hidden");
        if (wasHidden) {
            saveCurrentSequenceState();
            populateSeqDropdown();
        }
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
                    document.getElementById("seq-dropdown-panel").classList.add("hidden");
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
            if (segs && segs.length > 0) {
                tags.push({ label: "🎙 " + segs.length + " tomas", color: "var(--accent-bright)" });
            }
        }
        return tags;
    }

    function openSequenceByName(seqName) {
        if (seqName === _lastSeqName) return;
        saveCurrentSequenceState();
        _seqSwitchInProgress = true;
        var csInterface = global._epCSInterface;

        var safeName = seqName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        csInterface.evalScript('findAndOpenSequenceByName("' + safeName + '")', function(result) {
            try {
                var res = JSON.parse(result);
                if (res.error) {
                    _seqSwitchInProgress = false;
                    if (global._epShowToast) global._epShowToast("Error: " + res.error, "error");
                    return;
                }
                _lastSeqName = seqName;
                state.sequenceName = seqName;
                document.getElementById("seq-name").textContent = seqName;
                restoreSequenceState(seqName);
            } catch(e) {
                if (global._epShowToast) global._epShowToast("Error al abrir secuencia", "error");
            }
            _seqSwitchInProgress = false;
        });
    }

    // ─── Per-Sequence State Persistence ──────────────────────────

    function saveCurrentSequenceState() {
        if (!_lastSeqName) return;
        _seqCacheTouch(_lastSeqName);
        _seqCache[_lastSeqName] = {
            transcript: state.transcript,
            segments: state.segments,
            sttResult: state.sttResult,
            lastWhisperResult: state.lastWhisperResult,
            detectionResult: state.detectionResult,
            clipResults: state.clipResults,
            textClips: state.textClips,
            supertexts2: state.supertexts2,
            supertexts2Summary: document.getElementById("st2-summary") ? document.getElementById("st2-summary").innerHTML : "",
            es2Highlights: state.es2Highlights,
            es2Suggestions: state.es2Suggestions,
            es2Errors: state.es2Errors,
            es2ResultSummary: document.getElementById("es2-summary") ? document.getElementById("es2-summary").innerHTML : "",
            reelProposals: state.reelProposals,
            reelAssessment: document.getElementById("rp-assessment") ? document.getElementById("rp-assessment").innerHTML : ""
        };
    }

    function restoreSequenceState(seqName) {
        var cached = _seqCache[seqName];
        var isPlaceholder = cached && cached._hasTranscriptFile && !cached.transcript;
        if (cached && !isPlaceholder) {
            _seqCacheTouch(seqName);
            state.transcript = cached.transcript || "";
            state.segments = cached.segments || [];
            state.sttResult = cached.sttResult || null;
            state.lastWhisperResult = cached.lastWhisperResult || null;
            state.detectionResult = cached.detectionResult || null;
            state.clipResults = cached.clipResults || {};
            state.textClips = cached.textClips || [];
            state.supertexts2 = (cached.supertexts2 || []).map(function(st) {
                if (global._epNormalizeSt2Fields) global._epNormalizeSt2Fields(st);
                return st;
            });
            state.es2Highlights = cached.es2Highlights || [];
            state.es2Suggestions = cached.es2Suggestions || [];
            state.es2Errors = cached.es2Errors || [];
            state.reelProposals = cached.reelProposals || [];
            restoreUIFromState(cached);
            if (global._epShowToast) global._epShowToast("Secuencia: " + seqName, "info");
        } else {
            clearAllToolState();
            if (global.autoLoadTranscriptForSequence) global.autoLoadTranscriptForSequence(seqName);
        }
    }

    function clearAllToolState() {
        state.transcript = "";
        state.segments = [];
        state.sttResult = null;
        state.detectionResult = null;
        state.clipResults = {};
        state.textClips = [];
        state.supertexts2 = [];
        state.es2Highlights = [];
        state.es2Suggestions = [];
        state.es2Errors = [];
        state.reelProposals = [];
        state.analyzing = false;
        state.mpGenerating = false;
        restoreUIFromState(null);
    }

    function restoreUIFromState(cached) {
        // Transcript
        var textarea = document.getElementById("transcript-input");
        if (textarea) textarea.value = state.transcript || "";
        if (global._epOnTranscriptChange) global._epOnTranscriptChange();
        // Notify B-Roll that transcript may have changed
        if (global.EditorProUI && global.EditorProUI.broll && global.EditorProUI.broll.updateAnalyzeButton) global.EditorProUI.broll.updateAnalyzeButton();

        if (state.sttResult && state.sttResult.words && state.sttResult.words.length > 0) {
            if (global._epRenderTranscriptFromSegments) global._epRenderTranscriptFromSegments();
            if (global._epRefreshTraerTranscriptButtons) global._epRefreshTraerTranscriptButtons();
        } else {
            if (global.TranscriptManager && global.TranscriptManager.clearRenderedTranscript) global.TranscriptManager.clearRenderedTranscript();
        }

        // SpellCheck
        if (state.clipResults && Object.keys(state.clipResults).length > 0) {
            if (global.EditorProUI && global.EditorProUI.spellcheck) global.EditorProUI.spellcheck.render();
            if (global._epShowElement) global._epShowElement("sc-results");
            if (global._epHideElement) global._epHideElement("sc-empty");
        } else {
            var scList = document.getElementById("sc-clip-list");
            if (scList) scList.innerHTML = "";
            if (global._epHideElement) global._epHideElement("sc-results");
            if (global._epShowElement) global._epShowElement("sc-empty");
        }

        // Smart Supertexts
        if (state.supertexts2 && state.supertexts2.length > 0) {
            if (global.EditorProUI && global.EditorProUI.supertexts && global.EditorProUI.supertexts.render) {
                global.EditorProUI.supertexts.render({
                    summary: cached && cached.supertexts2Summary ? "" : state.supertexts2.length + " momentos clave identificados"
                });
            }
            if (cached && cached.supertexts2Summary) {
                var stSummary = document.getElementById("st2-summary");
                if (stSummary) stSummary.innerHTML = cached.supertexts2Summary;
            }
            if (global._epShowElement) global._epShowElement("st2-results");
            if (global._epHideElement) global._epHideElement("st2-empty");
        } else {
            var st2List = document.getElementById("st2-list");
            var st2Sum = document.getElementById("st2-summary");
            if (st2List) st2List.innerHTML = "";
            if (st2Sum) st2Sum.innerHTML = "";
            if (global._epHideElement) global._epHideElement("st2-results");
            if (global._epShowElement) global._epShowElement("st2-empty");
        }

        // Edit Suggestions
        if ((state.es2Highlights && state.es2Highlights.length > 0) ||
            (state.es2Suggestions && state.es2Suggestions.length > 0) ||
            (state.es2Errors && state.es2Errors.length > 0)) {
            if (global.EditorProUI && global.EditorProUI.editSuggestions) global.EditorProUI.editSuggestions.render({ summary: "", overallScore: undefined });
            if (cached && cached.es2ResultSummary) {
                var es2Summary = document.getElementById("es2-summary");
                if (es2Summary) es2Summary.innerHTML = cached.es2ResultSummary;
            }
            if (global._epShowElement) global._epShowElement("es2-results");
            if (global._epHideElement) global._epHideElement("es2-empty");
        } else {
            var es2List = document.getElementById("es2-list");
            var es2Sum = document.getElementById("es2-summary");
            if (es2List) es2List.innerHTML = "";
            if (es2Sum) es2Sum.innerHTML = "";
            if (global._epHideElement) global._epHideElement("es2-results");
            if (global._epShowElement) global._epShowElement("es2-empty");
        }

        // Reel Proposals
        if (state.reelProposals && state.reelProposals.length > 0) {
            if (global.EditorProUI && global.EditorProUI.editSuggestions) global.EditorProUI.editSuggestions.renderReelResults({ reels: state.reelProposals, assessment: "", notSuitable: [] });
            if (cached && cached.reelAssessment) {
                var rpAssess = document.getElementById("rp-assessment");
                if (rpAssess) rpAssess.innerHTML = cached.reelAssessment;
            }
            if (global._epShowElement) global._epShowElement("rp-results");
            if (global._epHideElement) global._epHideElement("rp-empty");
        } else {
            var rpList = document.getElementById("rp-list");
            var rpAssessEl = document.getElementById("rp-assessment");
            if (rpList) rpList.innerHTML = "";
            if (rpAssessEl) rpAssessEl.innerHTML = "";
            if (global._epHideElement) global._epHideElement("rp-results");
            if (global._epShowElement) global._epShowElement("rp-empty");
        }
    }

    // Allow batch navigators to update _lastSeqName and block polling
    global._epNotifyBatchSeqSwitch = function(seqName) {
        if (_lastSeqName && seqName !== _lastSeqName) {
            saveCurrentSequenceState();
        }
        _lastSeqName = seqName;
        state.sequenceName = seqName;
        document.getElementById("seq-name").textContent = seqName;
    };

    global.refreshSequenceInfo = refreshSequenceInfo;
    global.startSequencePolling = startSequencePolling;
    global.toggleSeqDropdown = toggleSeqDropdown;
    global.populateSeqDropdown = populateSeqDropdown;
    global.buildSeqSummaryTags = buildSeqSummaryTags;
    global.openSequenceByName = openSequenceByName;
    global.saveCurrentSequenceState = saveCurrentSequenceState;
    global.restoreSequenceState = restoreSequenceState;
    global.clearAllToolState = clearAllToolState;
    global.restoreUIFromState = restoreUIFromState;
    global._epRefreshSequenceInfo = refreshSequenceInfo;

})(window);
