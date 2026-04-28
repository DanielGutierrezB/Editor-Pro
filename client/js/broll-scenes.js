/**
 * broll-scenes.js — Scene parsing, time utilities, and scene management for B-Roll.
 * Extends window.BRoll prototype with scene-related methods.
 */
(function(global) {
    "use strict";

    var BRoll = global.BRoll;
    if (!BRoll) { console.error("[broll-scenes] BRoll not found — load broll.js first"); return; }

    // ── Time utilities ───────────────────────────────────────────────────────

    function timeToSecs(t) {
        if (!t) return 0;
        var parts = String(t).split(":");
        if (parts.length === 3) {
            var h = parseFloat(parts[0]) || 0;
            var m = parseFloat(parts[1]) || 0;
            var secMs = parts[2].split(".");
            var sec = parseFloat(secMs[0]) || 0;
            var ms = secMs.length > 1 ? parseFloat("0." + secMs[1]) : 0;
            return h * 3600 + m * 60 + sec + ms;
        }
        return parseFloat(t) || 0;
    }

    function secsToTime(secs) {
        var h = Math.floor(secs / 3600);
        var m = Math.floor((secs % 3600) / 60);
        var s = secs % 60;
        var sec = Math.floor(s);
        var ms = Math.round((s - sec) * 1000);
        return String(h).padStart(2, "0") + ":" +
               String(m).padStart(2, "0") + ":" +
               String(sec).padStart(2, "0") + "." +
               String(ms).padStart(3, "0");
    }

    // ── Snap shots within each scene to be contiguous ────────────────────────

    function snapShotsContiguous(proposals) {
        var sceneGroups = {};
        for (var i = 0; i < proposals.length; i++) {
            var p = proposals[i];
            var sid = p.sceneId || "__flat__";
            if (!sceneGroups[sid]) sceneGroups[sid] = [];
            sceneGroups[sid].push(p);
        }

        for (var key in sceneGroups) {
            var shots = sceneGroups[key];
            if (shots.length < 2) continue;

            shots.sort(function(a, b) {
                if (a.shotOrder && b.shotOrder) return a.shotOrder - b.shotOrder;
                return timeToSecs(a.startTime) - timeToSecs(b.startTime);
            });

            var sceneStart = timeToSecs(shots[0].startTime);
            var sceneEnd = timeToSecs(shots[shots.length - 1].endTime);
            var totalDuration = sceneEnd - sceneStart;
            var shotDuration = totalDuration / shots.length;

            for (var s = 0; s < shots.length; s++) {
                var newStart = sceneStart + (s * shotDuration);
                var newEnd = sceneStart + ((s + 1) * shotDuration);
                shots[s].startTime = secsToTime(newStart);
                shots[s].endTime = secsToTime(newEnd);
            }
        }
    }

    // ── Parse LLM response: scenes[] or legacy flat array ────────────────────

    function parseLLMResponse(result) {
        var scenes = [];
        var proposals = [];
        var data = result;

        // Try scenes format first (new cinematographic format)
        if (data && data.scenes && Array.isArray(data.scenes) && data.scenes.length > 0) {
            scenes = data.scenes;
            for (var si = 0; si < scenes.length; si++) {
                var scene = scenes[si];
                var sceneId = scene.id || ("scene_" + String(si + 1).padStart(3, "0"));
                scene.id = sceneId;
                var shots = scene.shots || [];
                for (var shi = 0; shi < shots.length; shi++) {
                    var shot = shots[shi];
                    var shotId = sceneId + "_shot_" + String(shi + 1).padStart(2, "0");
                    proposals.push({
                        id: shotId,
                        startTime: shot.startTime,
                        endTime: shot.endTime,
                        description: String(shot.description || "").trim(),
                        rationale: String(shot.rationale || "").trim(),
                        sceneId: sceneId,
                        sceneTitle: scene.title || "",
                        sceneNarrative: scene.narrative || "",
                        visualStyle: scene.visualStyle || "photorealistic",
                        shotType: (shot.shotType || "MED").toUpperCase(),
                        shotOrder: shi + 1,
                        visualWorld: scene.visualWorld || "",
                        isHero: !!shot.isHero
                    });
                }
            }
            snapShotsContiguous(proposals);
            return { proposals: proposals, scenes: scenes };
        }

        // Legacy format: flat array of proposals
        var rawProposals = Array.isArray(data) ? data : (data && (data.proposals || data.moments || []));
        if (!Array.isArray(rawProposals) || rawProposals.length === 0) {
            var str = JSON.stringify(data);
            var start = str.indexOf("[");
            var end = str.lastIndexOf("]");
            if (start !== -1 && end !== -1) {
                try { rawProposals = JSON.parse(str.substring(start, end + 1)); }
                catch(e) { rawProposals = []; }
            }
        }

        if (Array.isArray(rawProposals)) {
            proposals = rawProposals
                .filter(function(p) { return p && p.startTime && p.endTime && p.description; })
                .map(function(p, i) {
                    return {
                        id: "broll_" + Date.now() + "_" + i,
                        startTime: p.startTime,
                        endTime: p.endTime,
                        description: String(p.description).trim(),
                        rationale: String(p.rationale || "").trim()
                    };
                });
        }

        return { proposals: proposals, scenes: [] };
    }

    // ── Scene grouping methods ───────────────────────────────────────────────

    BRoll.prototype.getProposalsByScene = function() {
        var grouped = [];
        var sceneMap = {};

        for (var i = 0; i < this.proposals.length; i++) {
            var p = this.proposals[i];
            var sid = p.sceneId || null;
            if (!sceneMap[sid]) {
                var sceneInfo = sid ? this._findScene(sid) : null;
                sceneMap[sid] = {
                    sceneId: sid,
                    title: (sceneInfo && sceneInfo.title) || p.sceneTitle || "",
                    narrative: (sceneInfo && sceneInfo.narrative) || p.sceneNarrative || "",
                    visualWorld: (sceneInfo && sceneInfo.visualWorld) || p.visualWorld || "",
                    proposals: []
                };
                grouped.push(sceneMap[sid]);
            }
            sceneMap[sid].proposals.push(p);
        }

        return grouped;
    };

    BRoll.prototype.getClipsByScene = function() {
        var grouped = [];
        var sceneMap = {};

        for (var i = 0; i < this.clips.length; i++) {
            var c = this.clips[i];
            var sid = c.sceneId || null;
            if (!sceneMap[sid]) {
                var sceneInfo = sid ? this._findScene(sid) : null;
                sceneMap[sid] = {
                    sceneId: sid,
                    title: (sceneInfo && sceneInfo.title) || "",
                    clips: []
                };
                grouped.push(sceneMap[sid]);
            }
            sceneMap[sid].clips.push(c);
        }

        return grouped;
    };

    BRoll.prototype.redistributeSceneClips = function(sceneId) {
        var self = this;
        var validClips = [];
        for (var i = 0; i < self.clips.length; i++) {
            var cl = self.clips[i];
            if (cl.sceneId === sceneId && (cl.status === "image" || cl.status === "video")) {
                validClips.push(cl);
            }
        }
        if (validClips.length < 2) return;

        var sceneStart = Infinity, sceneEnd = 0;
        for (var p = 0; p < self.proposals.length; p++) {
            if (self.proposals[p].sceneId === sceneId) {
                var ps = timeToSecs(self.proposals[p].startTime);
                var pe = timeToSecs(self.proposals[p].endTime);
                if (ps < sceneStart) sceneStart = ps;
                if (pe > sceneEnd) sceneEnd = pe;
            }
        }
        if (sceneStart === Infinity || sceneEnd === 0) return;

        validClips.sort(function(a, b) {
            return timeToSecs(a.startTime) - timeToSecs(b.startTime);
        });

        var slotDuration = (sceneEnd - sceneStart) / validClips.length;
        for (var c = 0; c < validClips.length; c++) {
            validClips[c].startTime = secsToTime(sceneStart + c * slotDuration);
            validClips[c].endTime   = secsToTime(sceneStart + (c + 1) * slotDuration);
        }
    };

    BRoll.prototype._findHeroShotClip = function(sceneId) {
        if (!sceneId) return null;
        var fallback = null;
        for (var i = 0; i < this.clips.length; i++) {
            var c = this.clips[i];
            if (c.sceneId !== sceneId || c.status === "error") continue;
            if (c.isHero && c.versions.length > 0) return c;
            if (!fallback || (c.shotOrder && (!fallback.shotOrder || c.shotOrder < fallback.shotOrder))) {
                if (c.versions.length > 0) fallback = c;
            }
        }
        return fallback;
    };

    /** @deprecated Hero Shot system replaced shot-type compatibility checks. */
    BRoll.prototype._findFirstShotClip = function(sceneId) {
        return this._findHeroShotClip(sceneId);
    };

    BRoll.prototype.hasScenes = function() {
        return this.scenes.length > 0 ||
            (this.proposals.length > 0 && !!this.proposals[0].sceneId);
    };

    // ── Expose utilities for other modules ───────────────────────────────────

    global._epBrollScenes = {
        timeToSecs: timeToSecs,
        secsToTime: secsToTime,
        snapShotsContiguous: snapShotsContiguous,
        parseLLMResponse: parseLLMResponse
    };

})(window);
