/**
 * prompt-editor.js — AI prompt editing system with version history
 * Manages custom system/user prompts and their versioned history for all AI tools.
 * Depends on: utils.js, state.js (loaded before this)
 * Exposes: window.PromptEditor = { ... } and backward-compat window._ep* bindings
 */
(function(global) {
    "use strict";

    // Configs reference AIAnalyzer defaults via deferred lambdas so they resolve
    // after ai-analyzer.js has loaded (at call time, not at module parse time).
    var PROMPT_CONFIGS = {
        st2: {
            storageKey: "pr_st2",
            defaultSystem: function() { return global.AIAnalyzer && global.AIAnalyzer.DEFAULT_SYSTEM_MSGS ? global.AIAnalyzer.DEFAULT_SYSTEM_MSGS.supertexts : ""; },
            defaultUser: function() { var a = global._epAiAnalyzer; return a && a.getDefaultSupertextsPrompt ? a.getDefaultSupertextsPrompt() : ""; }
        },
        es2: {
            storageKey: "pr_es2",
            defaultSystem: function() { return global.AIAnalyzer && global.AIAnalyzer.DEFAULT_SYSTEM_MSGS ? global.AIAnalyzer.DEFAULT_SYSTEM_MSGS.editsuggestions2 : ""; },
            defaultUser: function() { var a = global._epAiAnalyzer; return a && a.getDefaultEditSuggestions2Prompt ? a.getDefaultEditSuggestions2Prompt() : ""; }
        },
        ta: {
            storageKey: "pr_ta",
            defaultSystem: function() { return global.AIAnalyzer && global.AIAnalyzer.DEFAULT_SYSTEM_MSGS ? global.AIAnalyzer.DEFAULT_SYSTEM_MSGS.supplementReview : ""; },
            defaultUser: function() { var a = global._epAiAnalyzer; return a && a.getDefaultSupplementPrompt ? a.getDefaultSupplementPrompt() : ""; }
        }
    };

    // ─── Version storage ──────────────────────────────────────────

    function getPromptVersions(prefix) {
        try {
            var raw = localStorage.getItem(prefix + "_prompt_versions");
            return raw ? JSON.parse(raw) : [];
        } catch(e) { return []; }
    }

    function savePromptVersions(prefix, versions) {
        localStorage.setItem(prefix + "_prompt_versions", JSON.stringify(versions));
    }

    // ─── Editor lifecycle ─────────────────────────────────────────

    function initPromptEditor() {
        Object.keys(PROMPT_CONFIGS).forEach(function(id) {
            initSinglePromptEditor(id);
        });
    }

    function initSinglePromptEditor(id) {
        var cfg = PROMPT_CONFIGS[id];
        var systemEl = document.getElementById(id + "-prompt-system");
        var userEl = document.getElementById(id + "-prompt-user");
        if (!systemEl || !userEl) return;

        var savedSystem = localStorage.getItem(cfg.storageKey + "_system_prompt");
        var savedUser = localStorage.getItem(cfg.storageKey + "_user_prompt");

        systemEl.value = savedSystem || cfg.defaultSystem();
        userEl.value = savedUser || cfg.defaultUser();

        var toggleBtn = document.getElementById("btn-" + id + "-prompt-toggle");
        if (toggleBtn && (savedSystem || savedUser)) {
            toggleBtn.textContent = "⚙ Prompt personalizado";
        }

        renderPromptVersionList(id);
    }

    function togglePromptEditorById(id) {
        var editor = document.getElementById(id + "-prompt-editor");
        var btn = document.getElementById("btn-" + id + "-prompt-toggle");
        if (!editor) return;
        var isHidden = editor.classList.contains("hidden");
        if (isHidden) {
            editor.classList.remove("hidden");
            if (btn) btn.textContent = "⚙ Ocultar Prompt";
        } else {
            editor.classList.add("hidden");
            var cfg = PROMPT_CONFIGS[id];
            var hasCustom = cfg && localStorage.getItem(cfg.storageKey + "_user_prompt");
            if (btn) btn.textContent = hasCustom ? "⚙ Prompt personalizado" : "⚙ Editar Prompt";
        }
    }

    function savePromptById(id) {
        var cfg = PROMPT_CONFIGS[id];
        if (!cfg) return;
        var systemEl = document.getElementById(id + "-prompt-system");
        var userEl = document.getElementById(id + "-prompt-user");
        if (!systemEl || !userEl) return;

        var systemVal = systemEl.value;
        var userVal = userEl.value;

        localStorage.setItem(cfg.storageKey + "_system_prompt", systemVal);
        localStorage.setItem(cfg.storageKey + "_user_prompt", userVal);

        var versions = getPromptVersions(cfg.storageKey);
        var now = new Date();
        var label = "v" + (versions.length + 1) + " — " +
            now.toLocaleDateString("es", { day: "2-digit", month: "short" }) + " " +
            now.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
        versions.push({ label: label, system: systemVal, user: userVal, ts: now.toISOString() });
        if (versions.length > 20) versions = versions.slice(-20);
        savePromptVersions(cfg.storageKey, versions);

        renderPromptVersionList(id);
        if (global.EPUtils) global.EPUtils.showToast("Prompt guardado como " + label, "success");
        var btn = document.getElementById("btn-" + id + "-prompt-toggle");
        if (btn) btn.textContent = "⚙ Prompt personalizado";
    }

    function resetPromptById(id) {
        var cfg = PROMPT_CONFIGS[id];
        if (!cfg) return;
        localStorage.removeItem(cfg.storageKey + "_system_prompt");
        localStorage.removeItem(cfg.storageKey + "_user_prompt");

        var systemEl = document.getElementById(id + "-prompt-system");
        var userEl = document.getElementById(id + "-prompt-user");
        if (systemEl) systemEl.value = cfg.defaultSystem();
        if (userEl) userEl.value = cfg.defaultUser();

        if (global.EPUtils) global.EPUtils.showToast("Prompt restaurado al original", "info");
        var btn = document.getElementById("btn-" + id + "-prompt-toggle");
        if (btn) btn.textContent = "⚙ Editar Prompt";
    }

    function renderPromptVersionList(id) {
        var cfg = PROMPT_CONFIGS[id];
        if (!cfg) return;
        var container = document.getElementById(id + "-prompt-versions");
        if (!container) return;

        var esc = (global.EPUtils && global.EPUtils.esc) || function(s) { return s; };
        var versions = getPromptVersions(cfg.storageKey);
        if (versions.length === 0) {
            container.innerHTML = '<span class="prompt-versions-empty">Sin versiones guardadas</span>';
            return;
        }

        var html = '<select id="' + id + '-version-select" class="prompt-version-select">' +
            '<option value="">Historial (' + versions.length + ' versiones)</option>';
        for (var i = versions.length - 1; i >= 0; i--) {
            html += '<option value="' + i + '">' + esc(versions[i].label) + '</option>';
        }
        html += '</select>';
        html += '<button class="btn btn-sm btn-ghost prompt-version-delete" data-promptid="' + id + '" title="Eliminar versión seleccionada">🗑</button>';
        container.innerHTML = html;

        var select = document.getElementById(id + "-version-select");
        if (select) {
            select.addEventListener("change", function() {
                var idx = parseInt(this.value, 10);
                if (isNaN(idx)) return;
                loadPromptVersion(id, idx);
            });
        }
        var delBtn = container.querySelector(".prompt-version-delete");
        if (delBtn) {
            delBtn.addEventListener("click", function() {
                var sel = document.getElementById(id + "-version-select");
                var idx = sel ? parseInt(sel.value, 10) : NaN;
                if (isNaN(idx)) {
                    if (global.EPUtils) global.EPUtils.showToast("Selecciona una versión primero", "info");
                    return;
                }
                deletePromptVersion(id, idx);
            });
        }
    }

    function loadPromptVersion(id, versionIdx) {
        var cfg = PROMPT_CONFIGS[id];
        if (!cfg) return;
        var versions = getPromptVersions(cfg.storageKey);
        if (!versions[versionIdx]) return;

        var v = versions[versionIdx];
        var systemEl = document.getElementById(id + "-prompt-system");
        var userEl = document.getElementById(id + "-prompt-user");
        if (systemEl) systemEl.value = v.system;
        if (userEl) userEl.value = v.user;

        if (global.EPUtils) global.EPUtils.showToast("Cargada: " + v.label + ". Haz clic en Guardar para activarla.", "info");
    }

    function deletePromptVersion(id, versionIdx) {
        var cfg = PROMPT_CONFIGS[id];
        if (!cfg) return;
        var versions = getPromptVersions(cfg.storageKey);
        if (!versions[versionIdx]) return;
        var label = versions[versionIdx].label;
        versions.splice(versionIdx, 1);
        savePromptVersions(cfg.storageKey, versions);
        renderPromptVersionList(id);
        if (global.EPUtils) global.EPUtils.showToast("Eliminada: " + label, "info");
    }

    // ─── Context accessors ────────────────────────────────────────

    function getPromptContext(id) {
        var cfg = PROMPT_CONFIGS[id];
        if (!cfg) return {};
        var savedSystem = localStorage.getItem(cfg.storageKey + "_system_prompt");
        var savedUser = localStorage.getItem(cfg.storageKey + "_user_prompt");
        var ctx = {};
        if (savedSystem) ctx.customSystemMsg = savedSystem;
        if (savedUser) ctx.customPrompt = savedUser;
        return ctx;
    }

    function getTakeAnalysisPromptContext() { return getPromptContext("ta"); }

    // Convenience aliases used in bindEvents
    function toggleTaPromptEditor() { togglePromptEditorById("ta"); }
    function saveTaPrompt() { savePromptById("ta"); }
    function resetTaPrompt() { resetPromptById("ta"); }

    // ─── Expose API ───────────────────────────────────────────────

    global.PromptEditor = {
        PROMPT_CONFIGS: PROMPT_CONFIGS,
        getPromptVersions: getPromptVersions,
        savePromptVersions: savePromptVersions,
        init: initPromptEditor,
        initSingle: initSinglePromptEditor,
        toggle: togglePromptEditorById,
        save: savePromptById,
        reset: resetPromptById,
        renderVersionList: renderPromptVersionList,
        loadVersion: loadPromptVersion,
        deleteVersion: deletePromptVersion,
        getContext: getPromptContext,
        getTakeAnalysisContext: getTakeAnalysisPromptContext
    };

    // Backward-compat window._ep* bindings
    global._epGetPromptContext = getPromptContext;
    global._epTogglePromptEditorById = togglePromptEditorById;
    global._epSavePromptById = savePromptById;
    global._epResetPromptById = resetPromptById;
    global._epGetTakeAnalysisPromptContext = getTakeAnalysisPromptContext;

})(window);
