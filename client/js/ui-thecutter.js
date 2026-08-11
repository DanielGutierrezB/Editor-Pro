/**
 * ui-thecutter.js — "The Cutter": pipeline de primer corte automático.
 *
 * Encadena las herramientas que ya existen, en la secuencia ACTIVA:
 *   1. Transcript completo (cache Transcribe/<seq>.json o STT configurado)
 *   2. Leer marcadores y guardar los comentarios del director de contenido (CD)
 *   3. Revisar Marcadores en modo headless: valida IN/OUT y auto-aplica los movimientos
 *   4. Backup + cortar (todo lo que no está entre un IN y su OUT)
 *   5. Activar vistas con el preset elegido
 *   6. Borrar marcadores sin comentario y darle a los que quedan la duración de su bloque
 *   7. Transcript de la secuencia ya cortada (queda cargado en el panel)
 *   8. Sugerencias de edición con los comentarios del CD como contexto
 *
 * Toda la lógica de datos vive en thecutter-core.js (puro, testeado en Node).
 * Aquí solo hay orquestación, llamadas al host y UI. DOM IDs prefijados tc-*.
 */
(function(global) {
    "use strict";

    var EP = global.EditorProUI = global.EditorProUI || {};

    var csInterface, state, aiAnalyzer;
    var fs, path, os;
    try { fs = require("fs"); path = require("path"); os = require("os"); } catch (e) {}

    var VIEW_PRESETS_KEY = "editorpro_view_presets";
    var IGNORED_VIEWS_KEY = "editorpro_view_ignored";

    var tc = {
        running: false,
        cancelled: false,
        cutDone: false,
        // true cuando se lanzó un paso suelto: no encadena con el siguiente y el
        // contexto acumulado (tc.ctx) se conserva entre ejecuciones.
        single: false,
        steps: [],
        currentIdx: -1,
        startTime: 0,
        ctx: {},
        // Paso en el que el pipeline quedó esperando a que se decidan los ajustes
        // que la revisión no aplicó sola (null si no está esperando a nadie).
        resumeAt: null,
        pendingResolved: false,
        views: {
            scanned: false,
            loading: false,
            error: null,
            names: [],          // nombres de vista encontrados en todo el proyecto
            stats: {},          // nombre → {count, sequences} para distinguir cámara de recado
            tracks: [],         // pistas de video de la secuencia activa
            sequenceCount: 0
        }
    };

    function $(id) { return document.getElementById(id); }
    function Core() { return global.EPTheCutterCore; }

    function _initRefs() {
        csInterface = global._epCSInterface;
        state = global._epState;
        aiAnalyzer = global._epAiAnalyzer;
        bindEvents();
        renderViews();
        // La lista se pinta desde el arranque: es el menú para lanzar pasos sueltos,
        // no solo el reporte de un run.
        resetSteps();
    }

    // ─── Helpers ─────────────────────────────────────────────

    function showToast(msg, type) {
        if (global.EPUtils && global.EPUtils.showToast) return global.EPUtils.showToast(msg, type);
        var toast = $("toast");
        if (!toast) return;
        toast.textContent = msg;
        toast.className = "toast toast-" + (type || "info") + " show";
        setTimeout(function() { toast.className = "toast"; }, 3500);
    }

    function log(msg) {
        if (global.EPLogger) {
            try { EPLogger.log("thecutter", "log", msg); } catch (e) {}
        }
    }

    function escExtend(p) { return String(p).replace(/\\/g, "/").replace(/'/g, "\\'"); }

    function evalScript(script, callback) {
        csInterface.evalScript(script, function(result) {
            var data;
            try { data = JSON.parse(result); } catch (e) {
                data = { error: "Respuesta inválida del host: " + String(result).slice(0, 120) };
            }
            if (callback) callback(data);
        });
    }

    function writeTempJson(name, obj) {
        if (!fs || !os || !path) return { error: "Node.js no disponible en el panel" };
        try {
            var p = path.join(os.tmpdir(), name);
            fs.writeFileSync(p, JSON.stringify(obj), "utf8");
            return { path: p };
        } catch (e) {
            return { error: e.message };
        }
    }

    function removeTemp(p) {
        try { fs.unlinkSync(p); } catch (e) {}
    }

    function fmtSecs(s) {
        var n = Math.max(0, Math.round(Number(s) || 0));
        var m = Math.floor(n / 60);
        var r = n % 60;
        return m > 0 ? (m + "m " + r + "s") : (r + "s");
    }

    /** Un punto de la secuencia como se lee en la timeline (11:32.8). */
    function fmtClock(t) {
        var s = Math.max(0, Number(t) || 0);
        var m = Math.floor(s / 60);
        var rest = Math.round((s - m * 60) * 10) / 10;
        if (rest >= 60) { m++; rest = 0; }
        return m + ":" + (rest < 10 ? "0" : "") + rest.toFixed(1);
    }

    function skipClapperboard() {
        try {
            var stored = localStorage.getItem("editorpro_skip_clapperboard");
            if (stored !== null) return stored !== "false";
        } catch (e) {}
        return true;
    }

    // ─── Vista de Cámaras: mapeo marcador → pistas ───────────
    // Comparte el mismo almacén de presets que Cortes Automáticos
    // (localStorage editorpro_view_presets), así que los presets creados en
    // cualquiera de las dos herramientas sirven en la otra.

    function loadPresetsStore() {
        try {
            var raw = localStorage.getItem(VIEW_PRESETS_KEY);
            if (raw) {
                var store = JSON.parse(raw);
                if (store && store.presets) return store;
            }
        } catch (e) {}
        return { presets: { "Default": {} }, active: "Default" };
    }

    function savePresetsStore(store) {
        try { localStorage.setItem(VIEW_PRESETS_KEY, JSON.stringify(store)); } catch (e) {}
    }

    function activeMapping() {
        var store = loadPresetsStore();
        return store.presets[store.active] || {};
    }

    /** Mapeo del preset activo, pero solo con las vistas que tienen pistas asignadas. */
    function selectedMapping() {
        var mapping = activeMapping();
        var out = null;
        for (var k in mapping) {
            if (!mapping.hasOwnProperty(k)) continue;
            var tracks = mapping[k];
            if (typeof tracks === "string") tracks = tracks ? [tracks] : [];
            if (tracks && tracks.length) {
                if (!out) out = {};
                out[k] = tracks;
            }
        }
        return out;
    }

    /**
     * Lee los marcadores de TODAS las secuencias del proyecto (una sola llamada
     * al host, sin abrir ni cerrar pestañas) y las pistas de video de la activa.
     * Con eso se arma la tabla de mapeo.
     */
    function scanViews(cb) {
        if (!Core()) {
            tc.views.error = "Falta thecutter-core.js";
            renderViews();
            if (cb) cb(tc.views.error);
            return;
        }
        tc.views.loading = true;
        tc.views.error = null;
        renderViews();
        evalScript("getMarkerNamesAllSequences()", function(data) {
            if (data.error) {
                tc.views.loading = false;
                tc.views.error = data.error;
                renderViews();
                if (cb) cb(data.error);
                return;
            }
            // Se conserva cuántas veces aparece cada nombre: una cámara sale
            // decenas de veces, una nota de edición una o dos, y eso se ve en la UI.
            var names = [];
            var byName = {};
            var items = data.items || [];
            for (var i = 0; i < items.length; i++) {
                var n = Core().viewNameOf({ name: items[i].name, editorNote: items[i].note });
                if (!n) continue;
                if (!byName[n]) {
                    byName[n] = { name: n, count: 0, sequences: 0 };
                    names.push(n);
                }
                byName[n].count += (items[i].count || 1);
                byName[n].sequences = Math.max(byName[n].sequences, items[i].sequences || 1);
            }
            names.sort();
            tc.views.names = names;
            tc.views.stats = byName;
            tc.views.sequenceCount = data.sequenceCount || 0;

            evalScript("getVideoTrackNames()", function(tracksData) {
                tc.views.loading = false;
                tc.views.error = tracksData.error || null;
                tc.views.tracks = (tracksData.tracks || []).map(function(t) { return t.name; });
                tc.views.scanned = true;
                renderViews();
                if (cb) cb(null);
            });
        });
    }

    /**
     * Nombres que el usuario marcó como "no es una vista" (notas de edición tipo
     * "⚠ Sin WAV"). No se puede adivinar cuáles son, así que se recuerdan aquí.
     */
    function loadIgnoredViews() {
        try {
            var raw = localStorage.getItem(IGNORED_VIEWS_KEY);
            var list = raw ? JSON.parse(raw) : [];
            return (list && list.length) ? list : [];
        } catch (e) { return []; }
    }

    function saveIgnoredViews(list) {
        try { localStorage.setItem(IGNORED_VIEWS_KEY, JSON.stringify(list || [])); } catch (e) {}
    }

    function ignoreView(name) {
        var list = loadIgnoredViews();
        if (list.indexOf(name) === -1) list.push(name);
        saveIgnoredViews(list);
        renderViews();
    }

    function restoreIgnoredViews() {
        saveIgnoredViews([]);
        renderViews();
    }

    function renderViews() {
        var body = $("tc-views-body");
        if (!body) return;
        while (body.firstChild) body.removeChild(body.firstChild);

        if (tc.views.loading) {
            body.appendChild(hintEl("Leyendo marcadores de todas las secuencias..."));
            return;
        }
        if (tc.views.error) {
            body.appendChild(hintEl(tc.views.error));
            return;
        }
        if (!tc.views.scanned) {
            body.appendChild(hintEl("Presiona \"Releer marcadores\" para listar las vistas encontradas en el proyecto."));
            return;
        }

        var store = loadPresetsStore();
        body.appendChild(buildPresetBar(store));

        if (tc.views.names.length === 0) {
            body.appendChild(hintEl("Ningún marcador con nombre de vista en el proyecto: el paso " + stepNum("views") + " se omite."));
            return;
        }
        if (tc.views.tracks.length === 0) {
            body.appendChild(hintEl("La secuencia activa no tiene pistas de video con clips."));
            return;
        }

        var mapping = store.presets[store.active] || {};
        var ignored = loadIgnoredViews();
        var shown = 0;
        var list = document.createElement("div");
        list.className = "view-mapping-list";
        for (var i = 0; i < tc.views.names.length; i++) {
            if (ignored.indexOf(tc.views.names[i]) !== -1) continue;
            list.appendChild(buildMappingRow(tc.views.names[i], mapping));
            shown++;
        }
        body.appendChild(list);

        if (shown === 0) {
            body.appendChild(hintEl("Descartaste todos los nombres encontrados: el paso " + stepNum("views") + " se omite."));
        }
        body.appendChild(hintEl(shown + " vista(s) en " + tc.views.sequenceCount +
            " secuencia(s) del proyecto · las pistas son las de la secuencia activa"));

        var hiddenCount = tc.views.names.length - shown;
        if (hiddenCount > 0) body.appendChild(buildIgnoredBar(hiddenCount, ignored));
    }

    /** Los descartes son reversibles: si se va una vista real, hay cómo traerla. */
    function buildIgnoredBar(count, ignored) {
        var bar = document.createElement("div");
        bar.className = "tc-views-hint tc-views-ignored";

        var txt = document.createElement("span");
        txt.textContent = count + " descartado(s): " + ignored.join(", ") + " ";
        bar.appendChild(txt);

        var btn = document.createElement("button");
        btn.className = "tc-link-btn";
        btn.textContent = "Restaurar";
        btn.addEventListener("click", restoreIgnoredViews);
        bar.appendChild(btn);
        return bar;
    }

    function hintEl(text) {
        var el = document.createElement("div");
        el.className = "tc-views-hint";
        el.textContent = text;
        return el;
    }

    function buildPresetBar(store) {
        var bar = document.createElement("div");
        bar.className = "view-preset-bar";

        var select = document.createElement("select");
        select.className = "view-preset-select";
        var names = [];
        for (var k in store.presets) {
            if (store.presets.hasOwnProperty(k)) names.push(k);
        }
        names.sort();
        for (var p = 0; p < names.length; p++) {
            var opt = document.createElement("option");
            opt.value = names[p];
            opt.textContent = names[p];
            if (names[p] === store.active) opt.selected = true;
            select.appendChild(opt);
        }
        select.addEventListener("change", function() {
            var st = loadPresetsStore();
            st.active = select.value;
            savePresetsStore(st);
            renderViews();
        });
        bar.appendChild(select);

        var btnNew = document.createElement("button");
        btnNew.className = "btn btn-ghost btn-sm";
        btnNew.textContent = "+ Nuevo";
        btnNew.addEventListener("click", function() {
            var name = prompt("Nombre del nuevo preset:");
            if (!name || !name.trim()) return;
            name = name.trim();
            var st = loadPresetsStore();
            if (st.presets[name]) { showToast("Ya existe un preset con ese nombre.", "info"); return; }
            st.presets[name] = JSON.parse(JSON.stringify(st.presets[st.active] || {}));
            st.active = name;
            savePresetsStore(st);
            renderViews();
        });
        bar.appendChild(btnNew);

        var btnRename = document.createElement("button");
        btnRename.className = "btn btn-ghost btn-sm";
        btnRename.textContent = "Renombrar";
        btnRename.addEventListener("click", function() {
            var st = loadPresetsStore();
            var newName = prompt("Nuevo nombre:", st.active);
            if (!newName || !newName.trim() || newName.trim() === st.active) return;
            newName = newName.trim();
            if (st.presets[newName]) { showToast("Ya existe un preset con ese nombre.", "info"); return; }
            st.presets[newName] = st.presets[st.active];
            delete st.presets[st.active];
            st.active = newName;
            savePresetsStore(st);
            renderViews();
        });
        bar.appendChild(btnRename);

        if (names.length > 1) {
            var btnDelete = document.createElement("button");
            btnDelete.className = "btn btn-ghost btn-sm btn-danger-text";
            btnDelete.textContent = "Borrar";
            btnDelete.addEventListener("click", function() {
                var st = loadPresetsStore();
                var keys = [];
                for (var kk in st.presets) { if (st.presets.hasOwnProperty(kk)) keys.push(kk); }
                if (keys.length <= 1) return;
                delete st.presets[st.active];
                for (var k2 in st.presets) { if (st.presets.hasOwnProperty(k2)) { st.active = k2; break; } }
                savePresetsStore(st);
                renderViews();
            });
            bar.appendChild(btnDelete);
        }

        return bar;
    }

    function buildMappingRow(viewName, mapping) {
        var saved = mapping[viewName] || [];
        if (typeof saved === "string") saved = saved ? [saved] : [];

        var row = document.createElement("div");
        row.className = "view-mapping-row";
        row.setAttribute("data-view-name", viewName);

        var name = document.createElement("span");
        name.className = "view-mapping-name";
        name.textContent = viewName;
        row.appendChild(name);

        var stats = (tc.views.stats && tc.views.stats[viewName]) || null;
        if (stats) {
            var badge = document.createElement("span");
            badge.className = "view-mapping-count";
            badge.textContent = stats.count + "×";
            badge.title = "Aparece " + stats.count + " vez/veces en " + stats.sequences +
                " secuencia(s). Una cámara se repite mucho; una nota de edición, una o dos veces.";
            row.appendChild(badge);
        }

        var arrow = document.createElement("span");
        arrow.className = "view-mapping-arrow";
        arrow.textContent = "→";
        row.appendChild(arrow);

        var wrap = document.createElement("div");
        wrap.className = "view-tracks-wrap";
        for (var t = 0; t < tc.views.tracks.length; t++) {
            (function(trackName) {
                var label = document.createElement("label");
                label.className = "view-track-label";
                var cb = document.createElement("input");
                cb.type = "checkbox";
                cb.className = "view-track-cb";
                cb.value = trackName;
                if (saved.indexOf(trackName) !== -1) cb.checked = true;
                cb.addEventListener("change", saveMappingFromUI);
                label.appendChild(cb);
                label.appendChild(document.createTextNode(" " + trackName));
                wrap.appendChild(label);
            })(tc.views.tracks[t]);
        }
        row.appendChild(wrap);

        var discard = document.createElement("button");
        discard.className = "view-mapping-discard";
        discard.title = "No es una vista de cámara: quitar de la lista";
        discard.innerHTML = "<svg width='9' height='9' viewBox='0 0 10 10' fill='none'><path d='M1.5 1.5l7 7M8.5 1.5l-7 7' stroke='currentColor' stroke-width='1.6' stroke-linecap='round'/></svg>";
        discard.addEventListener("click", function(e) {
            e.stopPropagation();
            ignoreView(viewName);
        });
        row.appendChild(discard);

        return row;
    }

    function saveMappingFromUI() {
        var body = $("tc-views-body");
        if (!body) return;
        var mapping = {};
        var rows = body.querySelectorAll(".view-mapping-row");
        for (var r = 0; r < rows.length; r++) {
            var viewName = rows[r].getAttribute("data-view-name");
            if (!viewName) continue;
            var checked = rows[r].querySelectorAll(".view-track-cb:checked");
            var tracks = [];
            for (var c = 0; c < checked.length; c++) tracks.push(checked[c].value);
            mapping[viewName] = tracks;
        }
        var store = loadPresetsStore();
        // Conserva vistas de otras secuencias que no están en la tabla actual.
        var merged = store.presets[store.active] || {};
        for (var k in mapping) {
            if (mapping.hasOwnProperty(k)) merged[k] = mapping[k];
        }
        store.presets[store.active] = merged;
        savePresetsStore(store);
    }

    // ─── Definición de los pasos ─────────────────────────────

    /**
     * `usesAi`: el paso consulta al proveedor, así que se pre-chequea antes.
     * `needs`: qué le falta para correr suelto (devuelve mensaje o null). Los pasos
     * sin `needs` se pueden lanzar en cualquier momento.
     */
    var STEPS = [
        { id: "aicheck",     label: "Verificar el proveedor de IA",               fn: stepAiCheck, usesAi: true },
        { id: "transcript",  label: "Transcript completo de la secuencia",        fn: stepTranscript },
        { id: "markers",     label: "Leer marcadores y comentarios del CD",       fn: stepMarkers },
        { id: "review",      label: "Validar y mover marcadores IN/OUT",          fn: stepReview, usesAi: true },
        // Sin `needs`: si se corre suelto, ensureWords cae al transcript guardado.
        { id: "verify",      label: "Revisar el resultado y reajustar",           fn: stepVerify, usesAi: true },
        // No es fatal: un chequeo de calidad caído no debe dejar la clase sin cortar.
        { id: "coherence",   label: "Leer la clase como quedaría cortada",        fn: stepCoherence, usesAi: true, fatal: false },
        { id: "cut",         label: "Backup y cortar la secuencia",               fn: stepCut },
        { id: "views",       label: "Activar vistas de cámara",                   fn: stepViews,       fatal: false },
        {
            id: "clean", label: "Limpiar marcadores y ajustar duraciones", fn: stepClean, fatal: false,
            needs: function() {
                if (!tc.ctx.blockDurations) {
                    return "Necesito la duración original de cada bloque: ejecuta primero el paso " + stepNum("cut") + " (cortar).";
                }
                return null;
            }
        },
        { id: "transcript2", label: "Transcript de la secuencia cortada",         fn: stepTranscriptCut, fatal: false },
        { id: "suggestions", label: "Sugerencias de edición con notas del CD", fn: stepSuggestions, fatal: false, usesAi: true }
    ];

    /**
     * Número visible de un paso a partir de su id. Los mensajes que citan "el paso
     * N" se calculan así para que no queden mintiendo cuando se agrega un paso.
     */
    function stepNum(id) {
        for (var i = 0; i < STEPS.length; i++) {
            if (STEPS[i].id === id) return i + 1;
        }
        return 0;
    }

    // ─── UI de pasos ─────────────────────────────────────────

    var ICONS = {
        ok: "<svg width='11' height='11' viewBox='0 0 12 12' fill='none'><path d='M2 6.5L4.5 9L10 3' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/></svg>",
        error: "<svg width='11' height='11' viewBox='0 0 12 12' fill='none'><path d='M2.5 2.5l7 7M9.5 2.5l-7 7' stroke='currentColor' stroke-width='1.8' stroke-linecap='round'/></svg>",
        warn: "<svg width='11' height='11' viewBox='0 0 12 12' fill='none'><path d='M6 1.5L11 10.5H1z' stroke='currentColor' stroke-width='1.2' stroke-linejoin='round'/><path d='M6 5v2.2' stroke='currentColor' stroke-width='1.2' stroke-linecap='round'/><circle cx='6' cy='9' r='0.6' fill='currentColor'/></svg>",
        play: "<svg width='9' height='9' viewBox='0 0 10 10' fill='currentColor'><path d='M2 1l7 4-7 4z'/></svg>",
        stop: "<svg width='9' height='9' viewBox='0 0 10 10' fill='currentColor'><rect x='1' y='1' width='8' height='8' rx='1'/></svg>",
        retry: "<svg width='11' height='11' viewBox='0 0 12 12' fill='none'><path d='M10.5 6A4.5 4.5 0 1 1 9 2.5' stroke='currentColor' stroke-width='1.3' stroke-linecap='round'/><path d='M11 1v3H8' stroke='currentColor' stroke-width='1.3' stroke-linecap='round' stroke-linejoin='round'/></svg>"
    };

    function resetSteps() {
        tc.steps = [];
        for (var i = 0; i < STEPS.length; i++) {
            tc.steps.push({ status: "pending", detail: "", ms: 0 });
        }
        renderSteps();
    }

    function setStep(idx, status, detail) {
        if (!tc.steps[idx]) return;
        tc.steps[idx].status = status;
        if (detail !== undefined) tc.steps[idx].detail = detail || "";
        renderSteps();
    }

    function renderSteps() {
        var list = $("tc-steps");
        if (!list) return;
        while (list.firstChild) list.removeChild(list.firstChild);

        for (var i = 0; i < STEPS.length; i++) {
            var st = tc.steps[i] || { status: "pending", detail: "", ms: 0 };
            var row = document.createElement("div");
            row.className = "tc-step tc-step-" + st.status;

            var badge = document.createElement("span");
            badge.className = "tc-step-badge";
            if (st.status === "ok" || st.status === "error" || st.status === "warn") {
                badge.innerHTML = ICONS[st.status];
            } else {
                badge.textContent = String(i + 1);
            }
            row.appendChild(badge);

            var body = document.createElement("div");
            body.className = "tc-step-body";

            var label = document.createElement("div");
            label.className = "tc-step-label";
            label.textContent = STEPS[i].label;
            body.appendChild(label);

            if (st.detail) {
                var detail = document.createElement("div");
                detail.className = "tc-step-detail";
                detail.textContent = st.detail;
                body.appendChild(detail);
            }
            row.appendChild(body);

            if (st.ms > 0) {
                var time = document.createElement("span");
                time.className = "tc-step-time";
                time.textContent = fmtSecs(st.ms / 1000);
                row.appendChild(time);
            }

            row.appendChild(buildStepRunBtn(i, st.status));
            list.appendChild(row);
        }
        list.classList.remove("hidden");
    }

    function isFinished(status) {
        return status === "ok" || status === "warn" || status === "error";
    }

    /**
     * Botón para lanzar un solo paso y poder revisar el resultado antes de seguir.
     * En un paso ya ejecutado el botón es "reintentar": el mismo camino sirve para
     * devolverse a un paso anterior y volver a correrlo.
     */
    function buildStepRunBtn(idx, status) {
        var btn = document.createElement("button");
        btn.className = "tc-step-run";
        btn.setAttribute("data-idx", String(idx));

        var done = isFinished(status);
        if (status === "running") btn.innerHTML = ICONS.stop;
        else btn.innerHTML = done ? ICONS.retry : ICONS.play;

        if (tc.running) {
            btn.title = "Espera a que termine el paso en curso";
            btn.classList.add("btn-disabled");
        } else {
            btn.title = done
                ? "Reintentar este paso (los siguientes vuelven a pendiente)"
                : "Ejecutar solo este paso";
            if (done) btn.classList.add("tc-step-retry");
            btn.addEventListener("click", function(e) {
                e.stopPropagation();
                runSingleStep(idx);
            });
        }
        return btn;
    }

    /**
     * Al reintentar un paso, lo que venía después queda sin valor: se marca como
     * pendiente para que la lista no dé por bueno un resultado viejo.
     */
    function invalidateAfter(idx) {
        for (var j = idx + 1; j < tc.steps.length; j++) {
            if (tc.steps[j].status === "pending") continue;
            tc.steps[j].status = "pending";
            tc.steps[j].detail = "";
            tc.steps[j].ms = 0;
        }
        // Volver a revisar produce otra lista de ajustes: lo que se decidió sobre la
        // anterior ya no vale, y el pipeline tiene que volver a parar si hace falta.
        if (idx < stepNum("cut") - 1) tc.pendingResolved = false;
    }

    function isCollapsed() {
        var body = $("tc-body");
        return body && body.classList.contains("hidden");
    }

    function setProgress(pct, text) {
        var bar = $("tc-progress");
        if (bar) bar.classList.remove("hidden");
        var fill = $("tc-progress-fill");
        if (fill) fill.style.width = Math.max(0, Math.min(100, pct)) + "%";
        var txt = $("tc-progress-text");
        if (txt) txt.textContent = text;

        var hdr = $("tc-progress-header");
        if (hdr) hdr.classList.toggle("hidden", !(tc.running && isCollapsed()));
        var hf = $("tc-progress-header-fill");
        if (hf) hf.style.width = Math.max(0, Math.min(100, pct)) + "%";
        var ht = $("tc-progress-header-text");
        if (ht) ht.textContent = text;
    }

    function hideProgress() {
        var bar = $("tc-progress");
        if (bar) bar.classList.add("hidden");
        var hdr = $("tc-progress-header");
        if (hdr) hdr.classList.add("hidden");
    }

    function refreshHeaderProgress() {
        var hdr = $("tc-progress-header");
        if (hdr) hdr.classList.toggle("hidden", !(tc.running && isCollapsed()));
    }

    /** Progreso global: cada paso ocupa una franja igual; pct es interno al paso. */
    function stepProgress(pct, text) {
        // Corriendo un paso suelto la barra es de ese paso, no del pipeline.
        if (tc.single) { setProgress(pct || 0, text); return; }
        var slice = 100 / STEPS.length;
        var base = tc.currentIdx * slice;
        setProgress(base + (slice * (pct || 0) / 100), text);
    }

    // ─── Pasos ───────────────────────────────────────────────

    /**
     * Una consulta mínima al proveedor antes de gastar media hora transcribiendo:
     * una API key vencida o un modelo mal escrito se ve acá, no al final del pipeline.
     */
    function stepAiCheck(next) {
        var problem = aiProviderProblem();
        if (problem) return next(problem);

        var provider = "";
        var model = "";
        try {
            provider = (state && state.settings && state.settings.aiProvider) || "";
            model = (state && state.settings && state.settings.aiModel) || "";
        } catch (e) {}

        var provLabel = provider === "claude_code" ? "Claude (tu cuenta)" : (provider || "el proveedor de IA");
        stepProgress(30, "Consultando " + provLabel + "...");
        aiAnalyzer._send(
            "Responde únicamente con JSON válido.",
            'Responde exactamente {"ok": 1}',
            function(response) {
                if (tc.cancelled) return next("Detenido.");
                if (response && response.error) {
                    // Si el error es de parseo, el proveedor SÍ contestó: la clave
                    // y el modelo funcionan, solo no respetó el JSON en una
                    // pregunta trivial. Eso no justifica frenar el pipeline.
                    if (response.error.indexOf("Error al procesar respuesta") === 0) {
                        return next(null, provider + " responde, pero no respetó el formato JSON en la prueba", "warn");
                    }
                    return next(response.error + " — " + (provider === "claude_code"
                        ? "abre Ajustes y pulsa \"Iniciar sesión\" para reconectar tu cuenta de Claude."
                        : "revisa el proveedor, la API key y el modelo en Ajustes."));
                }
                next(null, provider + (model ? " · " + model : "") + " responde correctamente");
            },
            null,
            // Tope corto: es solo un ping, no vale la pena esperar los reintentos
            // largos de un proveedor mal configurado.
            {
                numPredict: 40, think: false, timeoutMs: 45000,
                onWait: function(secs) {
                    stepProgress(30 + Math.min(50, secs), "Esperando a " + provLabel + "... " + secs + "s");
                }
            }
        );
    }

    function stepTranscript(next) {
        evalScript("getActiveSequenceInfo()", function(info) {
            if (info.error) return next(info.error);
            tc.ctx.seqName = info.name;
            tc.ctx.seqId = info.sequenceID || "";
            tc.ctx.duration = info.durationSeconds || 0;
            if ((info.markerCount || 0) < 2) {
                return next("\"" + info.name + "\" no tiene marcadores IN/OUT suficientes (mínimo 2).");
            }

            var tb = EP.transcribeBatch;
            if (!tb || !tb.transcribeActiveSequence) return next("El módulo de transcripción no está disponible.");

            var cached = tb.findSavedTranscript ? tb.findSavedTranscript(info.name) : null;
            if (cached && cached.raw && cached.raw.words) {
                var cov = coverageOf(cached.raw, info);
                if (cov.ok) {
                    tc.ctx.words = cached.raw.words;
                    return next(null, cached.raw.words.length + " palabras (transcript guardado reutilizado)");
                }
                // Reutilizar un transcript que no corresponde a esta versión de la
                // secuencia es peor que no tener ninguno: los marcadores se moverían
                // a puntos que leen bien pero están en otro tiempo.
                log("Transcript guardado descartado (" + cov.code + "): " + cov.message);
                stepProgress(3, "El transcript guardado no corresponde: hay que rehacerlo");
            }

            stepProgress(5, "Transcribiendo \"" + info.name + "\"...");
            tb.setBusy(true);
            tb.transcribeActiveSequence(info.name, tc.ctx.seqId, function(pct, txt) {
                stepProgress(pct, txt);
            }, function(err, res) {
                tb.setBusy(false);
                if (err) return next(err === "cancelled" ? "Transcripción cancelada." : err);
                tc.ctx.words = res.words;
                next(null, res.words.length + " palabras transcritas");
            });
        });
    }

    /**
     * Bloques cuyo marcador IN trae escrita la frase de arranque con suficientes
     * palabras para buscarla en el transcript, que es lo que ubica el corte.
     */
    function countBlocksWithPhrase(pairs) {
        var AN = global.EPMarkerAnchor;
        if (!AN || !pairs) return 0;
        var n = 0;
        for (var i = 0; i < pairs.length; i++) {
            var mk = pairs[i] && pairs[i].inMarker;
            if (!mk) continue;
            if (AN.cueTokens(AN.cueTextFor(mk, "IN"), "IN").length) n++;
        }
        return n;
    }

    /** Bordes con una orden escrita del CD (`out antes de "…"`), que manda sobre todo. */
    function countDirectives(pairs) {
        var AN = global.EPMarkerAnchor;
        if (!AN || !AN.directivesFor || !pairs) return 0;
        var n = 0;
        for (var i = 0; i < pairs.length; i++) {
            if (!pairs[i]) continue;
            n += AN.directivesFor(pairs[i].inMarker).length + AN.directivesFor(pairs[i].outMarker).length;
        }
        return n;
    }

    /**
     * Nombre, id y duración de la secuencia activa. Ejecutando pasos sueltos el
     * paso 2 puede no haber corrido, así que cada paso que los necesita los pide.
     * cb(err)
     */
    function ensureSeqInfo(cb) {
        if (tc.ctx.seqName && tc.ctx.duration) return cb(null);
        evalScript("getActiveSequenceInfo()", function(info) {
            if (info.error) return cb(info.error);
            tc.ctx.seqName = info.name;
            tc.ctx.seqId = info.sequenceID || "";
            tc.ctx.duration = info.durationSeconds || 0;
            cb(null);
        });
    }

    function stepMarkers(next) {
        evalScript("getSequenceMarkers()", function(data) {
            if (data.error) return next(data.error);
            var MR = global.EPMarkerReviewer;
            if (!MR) return next("El módulo de marcadores no está disponible.");

            var parsed = MR.parsePairs(data.markers, { skipClapperboard: skipClapperboard() });
            if (parsed.error) return next(parsed.error);

            var blocks = Core().blocksFromPairs(parsed.pairs);
            if (blocks.length === 0) return next("No se encontraron pares IN/OUT válidos.");

            tc.ctx.preBlocks = blocks;
            var withComment = 0;
            for (var i = 0; i < blocks.length; i++) { if (blocks[i].hasComment) withComment++; }
            tc.ctx.cdNoteCount = withComment;

            // Se informan dos cosas distintas: la frase con la que el CD dice que
            // abre el bloque (es lo que ubica el corte al validar los marcadores) y
            // la nota suelta del editor (contexto para las sugerencias del final).
            var withPhrase = countBlocksWithPhrase(parsed.pairs);
            var withOrder = countDirectives(parsed.pairs);
            var detail = blocks.length + " bloque(s) IN/OUT, " + withPhrase + " con la frase del CD" +
                (withOrder ? ", " + withOrder + " con instrucción del CD" : "") +
                (withComment ? ", " + withComment + " con nota del editor" : "");
            if (parsed.warnings && parsed.warnings.length) {
                detail += " — " + parsed.warnings.length + " marcador(es) huérfano(s)";
            }
            log(detail);
            next(null, detail);
        });
    }

    function stepReview(next) {
        var reviewer = EP.markerReviewer;
        if (!reviewer || !reviewer.runHeadless) return next("Revisar Marcadores no está disponible.");

        reviewer.runHeadless({
            // El transcript completo ya se hizo en el paso 2: no hace falta
            // transcribir ventanas alrededor de los cortes.
            windowed: false,
            onProgress: function(pct, txt) { stepProgress(pct, txt || "Validando marcadores..."); }
        }, function(err, res) {
            if (err) return next(err);
            tc.ctx.markersMoved = res.moved;
            var detail = res.moved + " de " + res.proposals + " ajuste(s) aplicado(s)";
            if (res.anchored) {
                detail += " — " + res.anchored + " por la frase que el CD escribió en el marcador" +
                    (res.proposals > res.anchored ? ", el resto por la IA" : "");
            } else {
                detail += " por la IA";
            }
            if (res.moved === 0) {
                // Cortar en las posiciones originales suele ser justo lo que el
                // usuario NO quiere: que se vea que la IA no movió nada.
                return next(null, "La IA no movió ningún marcador: los cortes van a quedar en las posiciones originales", "warn");
            }
            next(null, detail);
        });
    }

    /**
     * Revisión del resultado: los marcadores ya están puestos, así que se releen de
     * la secuencia y se verifican contra el transcript. Lo que no pasa se reajusta y
     * se vuelve a verificar, hasta que no quede nada que arreglar.
     *
     * Del resto solo frena el corte la estructura rota. Lo demás queda anotado: un
     * borde que dos chequeos ven distinto, o uno que el audio no puede medir, se
     * repasa en la timeline mejor que dejando la clase sin cortar.
     */
    function stepVerify(next) {
        var reviewer = EP.markerReviewer;
        var MV = global.EPMarkerVerify;
        if (!reviewer || !reviewer.verifyAndFix) return next("La revisión de marcadores no está disponible.");
        if (!MV) return next("Falta marker-verify.js");

        ensureWords(function(wordsErr, words) {
            if (wordsErr) return next(wordsErr);

            stepProgress(5, "Releyendo los marcadores puestos...");
            reviewer.verifyAndFix({
                words: words,
                seqName: tc.ctx.seqName,   // para encontrar el WAV y medir los bordes
                isCancelled: function() { return !!tc.cancelled; },
                onProgress: function(pct, txt) { stepProgress(pct, txt || "Revisando los cortes..."); }
            }, function(err, res) {
                if (err) return next(err);

                tc.ctx.verify = res;
                var base = MV.summarize(res.result);
                if (res.fixed > 0) base += " · " + res.fixed + " reajustado(s)";
                for (var i = 0; i < (res.notes || []).length; i++) log("Revisión: " + res.notes[i]);
                log("Revisión del resultado: " + base);

                // Lo que queda se deja escrito borde por borde, para poder repasarlo
                // en la timeline sin adivinar de qué bloque hablaba el resumen.
                var pending = (res.remaining || []).concat(res.warnings || []);
                for (var p = 0; p < pending.length; p++) {
                    log("Revisar — bloque " + (pending[p].pairIdx + 1) + " " +
                        pending[p].kind + ": " + pending[p].message);
                }

                // Solo la estructura rota frena el corte (un OUT antes del IN, un
                // bloque vacío): ahí las zonas saldrían mal y no hay reajuste que lo
                // salve. Un borde discutible no vale parar el pipeline — la revisión
                // hizo lo que pudo, lo demás queda apuntado y la clase sale cortada.
                var blocking = res.blocking || [];
                if (blocking.length > 0) {
                    return next(base + " — bloque " + (blocking[0].pairIdx + 1) + " " +
                        blocking[0].kind + ": " + blocking[0].message);
                }
                if (pending.length === 0) return next(null, base);

                // Lo que quedó con un punto al que ir se decide en la lista de abajo,
                // así que el resumen manda ahí en vez de citar un solo borde.
                var decidable = (res.adjustments || []).length;
                if (decidable > 0) {
                    return next(null, base + " — " + decidable +
                        " con un punto al que ir, por decidir abajo", "warn");
                }
                return next(null, base + " — bloque " + (pending[0].pairIdx + 1) + " " +
                    pending[0].kind + ": " + pending[0].message, "warn");
            });
        });
    }

    /**
     * Lee la clase como quedaría cortada, antes de cortarla.
     *
     * Los chequeos del paso anterior miran un borde a la vez y no ven lo que solo se ve
     * leyendo: un bloque que entra a media idea porque el de antes ya la contó, un salto
     * de tema, la misma explicación dos veces con otras palabras. Lo que el revisor
     * señale vuelve a la decisión de los marcadores y se relee.
     *
     * No frena el pipeline: si el proveedor falla o quedan observaciones sin resolver,
     * queda escrito y la clase se corta igual.
     */
    function stepCoherence(next) {
        var reviewer = EP.markerReviewer;
        if (!reviewer || !reviewer.readClassAndFix) {
            return next(null, "La lectura de la clase no está disponible", "warn");
        }

        ensureWords(function(wordsErr, words) {
            if (wordsErr) return next(null, "Sin transcript con el que leer la clase: " + wordsErr, "warn");

            stepProgress(5, "Armando la clase como quedaría cortada...");
            reviewer.readClassAndFix({
                words: words,
                seqName: tc.ctx.seqName,
                isCancelled: function() { return !!tc.cancelled; },
                onProgress: function(pct, txt) { stepProgress(pct, txt || "Leyendo la clase..."); }
            }, function(err, res) {
                if (err) return next(null, "No se pudo leer la clase: " + err, "warn");

                tc.ctx.coherence = res;
                for (var i = 0; i < (res.notes || []).length; i++) log("Lectura: " + res.notes[i]);
                if (res.summary) log("Lectura de la clase: " + res.summary);

                var parts = [];
                if (res.score != null) parts.push("nota " + res.score + "/10");
                parts.push((res.issues || []).length + " observación(es)");
                if (res.fixed > 0) parts.push(res.fixed + " borde(s) reajustados");
                var base = parts.join(" · ");

                var pending = res.pending || [];
                if (pending.length === 0) return next(null, base);
                return next(null, base + " — queda por revisar el " + pending[0].kind +
                    " del bloque " + (pending[0].pairIdx + 1), "warn");
            });
        });
    }

    /**
     * ¿El transcript corresponde a la secuencia que hay ahora? Compara duración y
     * cobertura de los marcadores. `raw` es el JSON guardado; `info` la secuencia.
     */
    function coverageOf(raw, info) {
        var MV = global.EPMarkerVerify;
        if (!MV || !MV.checkCoverage) return { ok: true, code: "", message: "" };
        // Los parciales por ventanas (Revisar Marcadores) tienen su propia validación.
        if (raw && raw.partial) return { ok: true, code: "", message: "" };
        return MV.checkCoverage(raw.words, {
            sequenceDuration: (info && info.durationSeconds) || tc.ctx.duration || 0,
            savedDuration: raw.durationSeconds || 0,
            markerTimes: markerTimesOf(info)
        });
    }

    /** Tiempos de los marcadores conocidos, para saber qué debe cubrir el transcript. */
    function markerTimesOf(info) {
        var times = [];
        var blocks = tc.ctx.preBlocks || tc.ctx.blocks;
        if (blocks) {
            for (var i = 0; i < blocks.length; i++) {
                times.push(blocks[i].inTime);
                times.push(blocks[i].outTime);
            }
        } else if (info && info.lastMarkerSeconds) {
            times.push(info.lastMarkerSeconds);
        }
        return times;
    }

    /** El transcript del paso 2, o el guardado si se corre el paso suelto. */
    function ensureWords(cb) {
        if (tc.ctx.words && tc.ctx.words.length) return cb(null, tc.ctx.words);
        ensureSeqInfo(function(seqErr) {
            if (seqErr) return cb(seqErr);
            var batch = EP.transcribeBatch;
            if (!batch || !batch.findSavedTranscript) {
                return cb("No hay transcript en memoria: ejecuta primero el paso " + stepNum("transcript") + ".");
            }
            var saved = batch.findSavedTranscript(tc.ctx.seqName);
            if (!saved || !saved.raw || !saved.raw.words || !saved.raw.words.length) {
                return cb("No hay transcript guardado de \"" + tc.ctx.seqName +
                    "\": ejecuta primero el paso " + stepNum("transcript") + ".");
            }
            var cov = coverageOf(saved.raw, null);
            if (!cov.ok) {
                return cb("El transcript guardado no corresponde a esta secuencia. " + cov.message +
                    " Vuelve a ejecutar el paso " + stepNum("transcript") + ".");
            }
            tc.ctx.words = saved.raw.words;
            cb(null, saved.raw.words);
        });
    }

    function stepCut(next) {
        ensureSeqInfo(function(seqErr) {
            if (seqErr) return next(seqErr);
            doCut(next);
        });
    }

    function doCut(next) {
        // Los marcadores se movieron y se reajustaron antes: hay que releerlos.
        stepProgress(5, "Recalculando bloques tras los ajustes...");
        evalScript("getSequenceMarkers()", function(data) {
            if (data.error) return next(data.error);
            var parsed = global.EPMarkerReviewer.parsePairs(data.markers, { skipClapperboard: skipClapperboard() });
            if (parsed.error) return next(parsed.error);

            var blocks = Core().blocksFromPairs(parsed.pairs);
            if (blocks.length === 0) return next("No quedaron pares IN/OUT válidos para cortar.");
            tc.ctx.blocks = blocks;
            tc.ctx.blockDurations = Core().computeBlockDurations(blocks);

            var zones = Core().buildRemoveZones(blocks, tc.ctx.duration);
            tc.ctx.removedSeconds = Core().totalRemoved(zones);
            if (zones.length === 0) {
                return next(null, "No había nada que quitar: los bloques cubren toda la secuencia");
            }

            var tmp = writeTempJson("thecutter_cuts.json", {
                removeZones: zones,
                seqName: tc.ctx.seqName,
                timestamp: new Date().toISOString()
            });
            if (tmp.error) return next("No se pudo escribir el archivo de cortes: " + tmp.error);

            stepProgress(20, "Creando backup de la secuencia...");
            evalScript("backupSequence('Pre-Cut')", function(backup) {
                if (tc.cancelled) { removeTemp(tmp.path); return next("Detenido antes de cortar."); }
                if (backup.error) log("Backup falló: " + backup.error);
                else log("Backup: " + (backup.backupName || "OK"));

                stepProgress(45, "Cortando " + zones.length + " zona(s)...");
                evalScript('executeCuts("' + escExtend(tmp.path) + '")', function(result) {
                    removeTemp(tmp.path);
                    if (result.error) return next(result.error);
                    tc.cutDone = true;
                    setRestoreVisible(true);
                    var stats = result.stats || {};
                    var detail = zones.length + " zona(s) cortada(s), " + fmtSecs(tc.ctx.removedSeconds) + " eliminados";
                    if (stats.failed) detail += " — " + stats.failed + " fallo(s)";
                    next(null, detail);
                });
            });
        });
    }

    function stepViews(next) {
        var mapping = selectedMapping();
        if (!mapping) return next("Ninguna vista tiene pistas asignadas en el preset: paso omitido.");

        evalScript("getActiveSequenceInfo()", function(info) {
            if (info.error) return next(info.error);
            var newDuration = info.durationSeconds || 0;

            evalScript("getPostCutMarkers()", function(data) {
                if (data.error) return next(data.error);
                var payload = Core().buildViewPayload(mapping, data.markers || [], newDuration);
                if (payload.segments.length === 0) {
                    return next("Ningún marcador con nombre de vista: paso omitido.");
                }
                var tmp = writeTempJson("thecutter_views.json", payload);
                if (tmp.error) return next("No se pudo escribir el archivo de vistas: " + tmp.error);

                stepProgress(50, "Activando vistas...");
                evalScript('activateViews("' + escExtend(tmp.path) + '")', function(result) {
                    removeTemp(tmp.path);
                    if (result.error) return next(result.error);
                    next(null, (result.enabled || 0) + " clip(s) activado(s), " + (result.disabled || 0) + " desactivado(s)");
                });
            });
        });
    }

    function stepClean(next) {
        stepProgress(20, "Borrando marcadores sin comentario...");
        evalScript("deleteMarkersWithoutComments()", function(del) {
            if (del.error) return next(del.error);

            var durations = tc.ctx.blockDurations || [];
            if (durations.length === 0) {
                return next(null, (del.deleted || 0) + " marcador(es) borrado(s), ninguno con comentario del CD");
            }

            stepProgress(55, "Asignando duración a los marcadores con comentario...");
            evalScript("getPostCutMarkers()", function(data) {
                if (data.error) return next(data.error);
                tc.ctx.postMarkers = data.markers || [];

                var matched = Core().matchPostCutMarkers(tc.ctx.postMarkers, durations);
                if (matched.items.length === 0) {
                    return next(null, (del.deleted || 0) + " marcador(es) borrado(s); no se pudo emparejar ninguna duración");
                }
                var tmp = writeTempJson("thecutter_durations.json", matched.items);
                if (tmp.error) return next("No se pudo escribir el archivo de duraciones: " + tmp.error);

                evalScript('setMarkerDurations("' + escExtend(tmp.path) + '")', function(result) {
                    removeTemp(tmp.path);
                    if (result.error) return next(result.error);
                    var applied = (result.updated || 0) + (result.recreated || 0);
                    var detail = (del.deleted || 0) + " marcador(es) borrado(s), " + applied + " con duración de su bloque";
                    if (matched.unmatched.length) detail += " — " + matched.unmatched.length + " sin emparejar";
                    next(null, detail);
                });
            });
        });
    }

    function stepTranscriptCut(next) {
        var tb = EP.transcribeBatch;
        if (!tb || !tb.transcribeActiveSequence) return next("El módulo de transcripción no está disponible.");

        // Si no se quitó nada, el transcript del paso 2 ya describe la secuencia:
        // re-transcribir una clase completa para nada cuesta demasiado.
        if (!tc.cutDone && tc.ctx.words) {
            tc.ctx.cutWords = tc.ctx.words;
            return next(null, "La secuencia no cambió: se reutiliza el transcript del paso 2");
        }

        ensureSeqInfo(function(seqErr) {
            if (seqErr) return next(seqErr);
            doTranscriptCut(tb, next);
        });
    }

    function doTranscriptCut(tb, next) {
        stepProgress(5, "Transcribiendo la secuencia cortada...");
        tb.setBusy(true);
        tb.transcribeActiveSequence(tc.ctx.seqName, tc.ctx.seqId, function(pct, txt) {
            stepProgress(pct, txt);
        }, function(err, res) {
            tb.setBusy(false);
            if (err) return next(err === "cancelled" ? "Transcripción cancelada." : err);
            tc.ctx.cutWords = res.words;
            loadTranscriptIntoPanel(res.words);
            next(null, res.words.length + " palabras — transcript cargado en el panel");
        }, { stage: "cut" });
    }

    /** Deja el transcript del corte en la card de Transcripción, como si se hubiera cargado a mano. */
    function loadTranscriptIntoPanel(words) {
        try {
            var result = {
                words: words,
                text: global.EPTranscriptEdit ? global.EPTranscriptEdit.wordsToText(words) : "",
                language: "es"
            };
            if (state) {
                state.sttResult = result;
                state.lastWhisperResult = result;
            }
            if (global._epSttResultToSRT && global._epLoadTranscriptText) {
                global._epLoadTranscriptText(global._epSttResultToSRT(result), tc.ctx.seqName + ".json");
            }
            if (global._epRefreshTraerTranscriptButtons) global._epRefreshTraerTranscriptButtons();
        } catch (e) {
            log("No se pudo cargar el transcript en el panel: " + e.message);
        }
    }

    function stepSuggestions(next) {
        var es = EP.editSuggestions;
        if (!es || !es.runWithTranscript) return next("Sugerencias de Edición no está disponible.");
        if (!aiAnalyzer || !aiAnalyzer.isConfigured()) {
            return next("Sin proveedor de IA configurado: paso omitido.");
        }

        var words = tc.ctx.cutWords || tc.ctx.words;
        if (words && words.length) {
            return ensureBlocks(function() { doSuggestions(es, words, next); });
        }

        // Lanzado suelto (o tras recargar el panel) no hay nada en memoria: sirve
        // el transcript guardado. Se prefiere el del corte, que es el que describe
        // la clase como quedó.
        ensureSeqInfo(function(seqErr) {
            if (seqErr) return next(seqErr);
            var tb = EP.transcribeBatch;
            var saved = (tb && tb.findSavedTranscript)
                ? (tb.findSavedTranscript(tc.ctx.seqName, { stage: "cut" }) ||
                   tb.findSavedTranscript(tc.ctx.seqName))
                : null;
            if (!saved || !saved.raw || !saved.raw.words || !saved.raw.words.length) {
                return next("No hay transcript de \"" + tc.ctx.seqName + "\": ejecuta primero el paso " + stepNum("transcript") + ".");
            }
            tc.ctx.words = saved.raw.words;
            ensureBlocks(function() { doSuggestions(es, saved.raw.words, next); });
        });
    }

    /**
     * Bloques IN/OUT en memoria para poder pasar las notas del CD como contexto.
     * No es fatal si no se consiguen: las sugerencias salen igual, sin esas notas.
     */
    function ensureBlocks(cb) {
        if (tc.ctx.blocks || tc.ctx.preBlocks) return cb();
        evalScript("getSequenceMarkers()", function(data) {
            try {
                if (!data.error && global.EPMarkerReviewer) {
                    var parsed = global.EPMarkerReviewer.parsePairs(data.markers, { skipClapperboard: skipClapperboard() });
                    if (!parsed.error) {
                        var blocks = Core().blocksFromPairs(parsed.pairs);
                        if (blocks.length) tc.ctx.preBlocks = blocks;
                    }
                }
            } catch (e) {
                log("No se pudieron leer los bloques para el contexto del CD: " + e.message);
            }
            cb();
        });
    }

    function doSuggestions(es, words, next) {
        var timed = Core().buildTimedFromWords(words);
        var notes = Core().buildCdNotesContext(tc.ctx.blocks || tc.ctx.preBlocks, tc.ctx.postMarkers);

        stepProgress(20, "Analizando la clase cortada con la IA...");
        es.runWithTranscript(timed, notes, function(err, result) {
            if (err) return next(err);
            var n = ((result.highlights || []).length) + ((result.suggestions || []).length) + ((result.errors || []).length);
            tc.ctx.suggestionCount = n;
            next(null, n + " observación(es) — visibles en Sugerencias de Edición");
        });
    }

    // ─── Runner ──────────────────────────────────────────────

    /**
     * El pipeline entero depende de la IA (valida marcadores y da sugerencias).
     * Vale más avisar antes de transcribir media hora de clase que descubrirlo
     * a mitad de camino.
     */
    function aiProviderProblem() {
        if (!aiAnalyzer) return "El analizador de IA no está inicializado. Recarga el panel.";
        var provider = "";
        try { provider = (state && state.settings && state.settings.aiProvider) || ""; } catch (e) {}
        if (provider === "claude_code") {
            if (!global.EPClaudeCode || !global.EPClaudeCode.isInstalled()) {
                return "No se encontró Claude Code. Instálalo con `npm install -g @anthropic-ai/claude-code`.";
            }
            var sess = state && state.ccSession;
            if (sess && sess.installed && !sess.loggedIn) {
                return "Tu sesión de Claude no está activa: abre Ajustes y pulsa \"Iniciar sesión\".";
            }
            return null;
        }
        if (aiAnalyzer.isConfigured && !aiAnalyzer.isConfigured()) {
            return "Falta configurar el proveedor de IA" + (provider ? " (" + provider + ")" : "") +
                ": revisa la API key y el modelo en Ajustes.";
        }
        return null;
    }

    /**
     * Lo que impide arrancar, sea el pipeline entero o un paso suelto. Con `step`
     * el chequeo del proveedor solo aplica si ese paso usa la IA.
     */
    function commonBlocker(step) {
        if (!fs) return "Node.js no disponible en el panel";
        if (!Core()) return "Falta thecutter-core.js";
        if (!global.EPMarkerPrecision) return "Falta marker-precision.js";
        if (!step || step.usesAi) {
            var aiProblem = aiProviderProblem();
            if (aiProblem) return aiProblem;
        }
        if (EP.markerReviewer && EP.markerReviewer.isRunning && EP.markerReviewer.isRunning()) {
            return "Hay una revisión de marcadores en curso";
        }
        if (EP.transcribeBatch && EP.transcribeBatch.isBusy && EP.transcribeBatch.isBusy()) {
            return "Hay una transcripción en curso";
        }
        return null;
    }

    function run() {
        if (tc.running) { showToast("The Cutter ya está corriendo", "info"); return; }
        var blocker = commonBlocker(null);
        if (blocker) { showToast(blocker, "error"); return; }

        tc.running = true;
        tc.single = false;
        tc.cancelled = false;
        tc.cutDone = false;
        tc.ctx = {};
        tc.currentIdx = -1;
        tc.resumeAt = null;
        tc.pendingResolved = false;
        tc.startTime = Date.now();

        var empty = $("tc-empty");
        if (empty) empty.classList.add("hidden");
        var summary = $("tc-summary");
        if (summary) summary.classList.add("hidden");
        var pending = $("tc-pending");
        if (pending) pending.classList.add("hidden");
        setRestoreVisible(false);
        setRunning(true);
        resetSteps();
        setProgress(0, "Iniciando...");
        log("Run iniciado");

        runStep(0);
    }

    function runStep(i) {
        if (tc.cancelled) return finish("Detenido por el usuario.");
        if (i >= STEPS.length) return finish(null);

        // Último momento en que mover un marcador sirve de algo: después del corte,
        // aplicar un ajuste ya no cambia nada. Si la revisión dejó empates sin
        // romper, el pipeline espera aquí en vez de cortar con ellos dentro.
        if (STEPS[i].id === "cut" && !tc.pendingResolved && pendingItems().adjustments.length) {
            return pauseForPending(i);
        }

        tc.currentIdx = i;
        var step = STEPS[i];
        setStep(i, "running");
        stepProgress(0, step.label + "...");
        var t0 = Date.now();

        step.fn(function(err, detail, status) {
            tc.steps[i].ms = Date.now() - t0;

            if (tc.cancelled) {
                setStep(i, "error", "Detenido");
                return finish("Detenido por el usuario.");
            }
            if (err) {
                log("Paso " + (i + 1) + " (" + step.id + ") falló: " + err);
                if (step.fatal === false) {
                    setStep(i, "warn", err);
                    return runStep(i + 1);
                }
                setStep(i, "error", err);
                return finish(err);
            }
            setStep(i, status || "ok", detail);
            if (producesPending(step)) renderPending();
            runStep(i + 1);
        });
    }

    /** Pasos que dejan ajustes u observaciones que enseñar. */
    function producesPending(step) {
        return step.id === "verify" || step.id === "coherence";
    }

    /**
     * Ejecuta un único paso y para, para poder revisar el resultado en Premiere
     * antes de seguir. El contexto acumulado (tc.ctx) se conserva, así que los
     * pasos sueltos se pueden encadenar a mano en orden.
     */
    function runSingleStep(i) {
        if (tc.running) { showToast("Espera a que termine el paso en curso", "info"); return; }
        var step = STEPS[i];
        if (!step) return;

        var blocker = commonBlocker(step);
        if (blocker) { showToast(blocker, "error"); return; }
        if (step.needs) {
            var missing = step.needs();
            if (missing) { showToast(missing, "error"); return; }
        }

        if (!tc.steps.length) resetSteps();
        var retry = isFinished(tc.steps[i] && tc.steps[i].status);
        if (retry) invalidateAfter(i);

        // Pedir el corte a mano es una decisión: no se frena, pero se avisa de lo
        // que se está dejando dentro, que después de cortar ya no tiene arreglo.
        if (step.id === "cut" && !tc.pendingResolved) {
            var left = pendingItems().adjustments.length;
            if (left > 0) {
                showToast("Se corta con " + left + " ajuste(s) sin aplicar", "info");
                log("Corte a mano con " + left + " ajuste(s) pendientes sin aplicar");
            }
        }
        tc.running = true;
        tc.single = true;
        tc.cancelled = false;
        tc.currentIdx = i;
        if (!tc.startTime) tc.startTime = Date.now();

        var empty = $("tc-empty");
        if (empty) empty.classList.add("hidden");
        var summary = $("tc-summary");
        if (summary) summary.classList.add("hidden");
        setRunning(true);
        setStep(i, "running", "");
        setProgress(0, step.label + "...");
        log("Paso " + (i + 1) + " (" + step.id + ")" + (retry ? " reintentado" : " lanzado suelto"));

        var t0 = Date.now();
        step.fn(function(err, detail, status) {
            tc.steps[i].ms = Date.now() - t0;
            tc.running = false;
            tc.single = false;
            setRunning(false);
            hideProgress();
            if (tc.cutDone) setRestoreVisible(true);

            if (tc.cancelled) {
                setStep(i, "error", "Detenido");
                showToast("Paso " + (i + 1) + " detenido", "info");
                return;
            }
            if (err) {
                // Suelto no hay pipeline que frenar: el fallo se marca según la
                // gravedad del paso y el usuario decide qué hacer.
                setStep(i, step.fatal === false ? "warn" : "error", err);
                log("Paso " + (i + 1) + " (" + step.id + ") falló: " + err);
                showToast(err, step.fatal === false ? "info" : "error");
                return;
            }
            setStep(i, status || "ok", detail);
            if (producesPending(step)) renderPending();
            showToast("Paso " + (i + 1) + " listo" + (detail ? ": " + detail : ""), status === "warn" ? "info" : "success");
        });
    }

    // ─── Ajustes que la revisión no aplicó sola ──────────────
    //
    // El paso 5 arregla lo que puede y el resto lo reporta. Lo que reporta suele
    // traer un punto exacto al que ir: la guarda no se negó por no saber a dónde,
    // sino porque dos chequeos se contradicen y aplicar uno desharía el otro. Ese
    // empate lo rompe el editor en dos segundos mirando la onda, así que en vez de
    // dejarlo en el log sale aquí con el punto, el motivo y un botón.

    /** Lo que queda por decidir, juntando la revisión y la lectura de la clase. */
    function pendingItems() {
        var verify = tc.ctx.verify || {};
        var read = tc.ctx.coherence || {};
        return {
            adjustments: (verify.adjustments || []).slice(),
            observations: (verify.observations || []).concat(read.observations || [])
        };
    }

    function pauseForPending(resumeAt) {
        tc.running = false;
        tc.resumeAt = resumeAt;
        setRunning(false);
        hideProgress();
        var items = pendingItems();
        log("Pipeline en espera antes de cortar: " + items.adjustments.length +
            " ajuste(s) por decidir");
        renderPending();
        showToast(items.adjustments.length + " ajuste(s) por decidir antes de cortar", "info");
    }

    function renderPending() {
        var box = $("tc-pending");
        if (!box) return;
        while (box.firstChild) box.removeChild(box.firstChild);

        var items = pendingItems();
        if (!items.adjustments.length && !items.observations.length) {
            box.classList.add("hidden");
            return;
        }

        var title = document.createElement("div");
        title.className = "tc-pending-title";
        title.textContent = items.adjustments.length
            ? items.adjustments.length + " ajuste(s) por decidir antes de cortar"
            : "Observaciones de la revisión";
        box.appendChild(title);

        if (items.adjustments.length) {
            var intro = document.createElement("div");
            intro.className = "tc-pending-intro";
            intro.textContent = "La revisión sabe a dónde va cada uno de estos cortes, " +
                "pero no los movió sola porque otro chequeo pide lo contrario. Elige los que quieras aplicar.";
            box.appendChild(intro);
        }

        for (var i = 0; i < items.adjustments.length; i++) {
            box.appendChild(buildPendingRow(items.adjustments[i], i));
        }
        for (var o = 0; o < items.observations.length; o++) {
            box.appendChild(buildObservationRow(items.observations[o]));
        }

        box.appendChild(buildPendingActions(items));
        box.classList.remove("hidden");
    }

    function buildPendingRow(item, idx) {
        var row = document.createElement("div");
        row.className = "tc-pending-item";

        var check = document.createElement("input");
        check.type = "checkbox";
        check.checked = item.selected !== false;
        check.setAttribute("data-pending", String(idx));
        check.addEventListener("change", function() { item.selected = check.checked; });
        row.appendChild(check);

        var body = document.createElement("div");
        body.className = "tc-pending-body";

        var head = document.createElement("div");
        head.className = "tc-pending-head";
        head.appendChild(document.createTextNode(
            "bloque " + (item.pairIdx + 1) + " " + item.kind + " · "));
        var move = document.createElement("span");
        move.className = "tc-pending-move";
        move.textContent = fmtClock(item.from) + " → " + fmtClock(item.to);
        head.appendChild(move);
        body.appendChild(head);

        body.appendChild(lineEl("tc-pending-why", item.message));
        if (item.why) body.appendChild(lineEl("tc-pending-why", "No se aplicó solo: " + item.why));
        if (item.snippet) body.appendChild(lineEl("tc-pending-snippet", item.snippet));

        row.appendChild(body);
        return row;
    }

    function buildObservationRow(item) {
        var row = document.createElement("div");
        row.className = "tc-pending-note";
        var text = (item.source === "lectura" ? "Al leer la clase — " : "") +
            (item.pairIdx >= 0 && item.kind ? "bloque " + (item.pairIdx + 1) + " " + item.kind + ": " : "") +
            item.message;
        row.appendChild(lineEl("tc-pending-note-text", text));
        return row;
    }

    function lineEl(cls, text) {
        var el = document.createElement("div");
        el.className = cls;
        el.textContent = text;
        return el;
    }

    function buildPendingActions(items) {
        var wrap = document.createElement("div");
        wrap.className = "tc-pending-actions";
        var waiting = tc.resumeAt != null;

        if (items.adjustments.length) {
            var apply = document.createElement("button");
            apply.className = "btn btn-sm btn-primary";
            apply.textContent = waiting ? "Aplicar y seguir" : "Aplicar seleccionados";
            apply.addEventListener("click", function() { applyPending(items.adjustments); });
            wrap.appendChild(apply);
        }

        if (waiting) {
            var skip = document.createElement("button");
            skip.className = "btn btn-sm";
            skip.textContent = "Cortar sin aplicar";
            skip.addEventListener("click", function() {
                log("Se corta sin aplicar los ajustes pendientes");
                resumePending();
            });
            wrap.appendChild(skip);
        }
        return wrap;
    }

    function applyPending(adjustments) {
        var reviewer = EP.markerReviewer;
        if (!reviewer || !reviewer.applyAdjustments) {
            showToast("No se pueden aplicar los ajustes: falta el revisor", "error");
            return;
        }
        var chosen = [];
        for (var i = 0; i < adjustments.length; i++) {
            if (adjustments[i].selected !== false) chosen.push(adjustments[i]);
        }
        if (!chosen.length) { showToast("No hay ajustes seleccionados", "info"); return; }

        var verify = tc.ctx.verify || {};
        tc.running = true;
        setRunning(true);
        setProgress(50, "Aplicando " + chosen.length + " ajuste(s)...");
        reviewer.applyAdjustments(chosen, {
            seqId: verify.seqId || null,
            seqName: verify.seqName || tc.ctx.seqName,
            words: verify.words || tc.ctx.words
        }, function(err, res) {
            tc.running = false;
            setRunning(false);
            hideProgress();
            if (err) { showToast("No se pudieron aplicar: " + err, "error"); return; }

            var moved = (res && res.moved) || 0;
            log("Ajustes aplicados a mano: " + moved + " marcador(es) movido(s)");
            showToast(moved + " ajuste(s) aplicado(s)", "success");

            // Ya movidos, dejan de estar pendientes: si no, al reanudar el pipeline
            // volvería a parar por lo mismo.
            dropApplied(chosen);
            renderPending();
            resumePending();
        });
    }

    function dropApplied(applied) {
        var verify = tc.ctx.verify;
        if (!verify || !verify.adjustments) return;
        var left = [];
        for (var i = 0; i < verify.adjustments.length; i++) {
            var keep = true;
            for (var j = 0; j < applied.length; j++) {
                if (verify.adjustments[i] === applied[j]) { keep = false; break; }
            }
            if (keep) left.push(verify.adjustments[i]);
        }
        verify.adjustments = left;
    }

    /** Sigue el pipeline donde lo dejó, si estaba esperando por esta lista. */
    function resumePending() {
        if (tc.resumeAt == null) return;
        var at = tc.resumeAt;
        tc.resumeAt = null;
        tc.pendingResolved = true;
        tc.running = true;
        tc.cancelled = false;
        setRunning(true);
        runStep(at);
    }

    function finish(err) {
        tc.running = false;
        tc.resumeAt = null;
        setRunning(false);
        hideProgress();

        // A partir del corte, siempre debe poder volver atrás.
        if (tc.cutDone) setRestoreVisible(true);

        if (err) {
            showToast(err, "error");
            log("Run terminado con error: " + err);
            renderSummary(err);
            return;
        }
        var elapsed = fmtSecs((Date.now() - tc.startTime) / 1000);
        showToast("The Cutter terminó en " + elapsed, "success");
        log("Run completado en " + elapsed);
        renderSummary(null);
    }

    function renderSummary(err) {
        var box = $("tc-summary");
        if (!box) return;
        while (box.firstChild) box.removeChild(box.firstChild);

        var title = document.createElement("div");
        title.className = "tc-summary-title";
        title.textContent = err ? "Pipeline interrumpido" : "Primer corte listo";
        box.appendChild(title);

        var lines = [];
        if (tc.ctx.seqName) lines.push("Secuencia: " + tc.ctx.seqName);
        if (tc.ctx.blocks) lines.push("Bloques que sobrevivieron: " + tc.ctx.blocks.length);
        if (tc.ctx.cdNoteCount) lines.push("Comentarios del CD: " + tc.ctx.cdNoteCount);
        if (tc.ctx.removedSeconds) lines.push("Material eliminado: " + fmtSecs(tc.ctx.removedSeconds));
        if (tc.ctx.suggestionCount != null) lines.push("Observaciones de edición: " + tc.ctx.suggestionCount);
        lines.push("Tiempo total: " + fmtSecs((Date.now() - tc.startTime) / 1000));

        for (var i = 0; i < lines.length; i++) {
            var row = document.createElement("div");
            row.className = "tc-summary-line";
            row.textContent = lines[i];
            box.appendChild(row);
        }
        box.classList.remove("hidden");
    }

    function stop() {
        if (!tc.running) return;
        tc.cancelled = true;
        try { if (EP.transcribeBatch && EP.transcribeBatch.cancel) EP.transcribeBatch.cancel(); } catch (e) {}
        try { if (aiAnalyzer && aiAnalyzer.abort) aiAnalyzer.abort(); } catch (e) {}
        setProgress(100, "Deteniendo...");
    }

    function doRestore() {
        evalScript("restoreBackup()", function(result) {
            if (result.error) { showToast(result.error, "error"); return; }
            tc.cutDone = false;
            setRestoreVisible(false);
            showToast("Backup restaurado: la secuencia volvió a su estado original.", "success");
        });
    }

    function setRunning(on) {
        var btn = $("btn-tc-run");
        if (btn) btn.classList.toggle("btn-disabled", on);
        var stopBtn = $("btn-tc-stop");
        if (stopBtn) stopBtn.classList.toggle("hidden", !on);
        // Los botones ▶ de cada paso se habilitan según tc.running.
        if (tc.steps.length) renderSteps();
    }

    function setRestoreVisible(on) {
        var btn = $("btn-tc-restore");
        if (btn) btn.classList.toggle("hidden", !on);
    }

    // ─── Bindings ────────────────────────────────────────────

    function on(id, evt, fn) {
        var el = $(id);
        if (el) el.addEventListener(evt, fn);
    }

    /**
     * El colchón lo consume Revisar Marcadores al armar los puntos de corte, así
     * que se lee y guarda ahí: este input es solo la manija.
     */
    function bindPadInput() {
        var input = $("tc-pad-frames");
        var rev = EP.markerReviewer;
        if (!input || !rev || !rev.getPadFrames) return;
        input.value = String(rev.getPadFrames());
        input.addEventListener("change", function() {
            input.value = String(rev.setPadFrames(input.value));
        });
    }

    function bindEvents() {
        on("btn-tc-run", "click", run);
        on("btn-tc-stop", "click", stop);
        on("btn-tc-restore", "click", doRestore);
        on("btn-tc-scan-views", "click", function() { scanViews(null); });
        bindPadInput();

        // Al abrir la card por primera vez, listar las vistas sin que el usuario
        // tenga que pedirlo (una sola llamada al host, sin efectos secundarios).
        var header = document.querySelector('.tool-card-header[data-tool="thecutter"]');
        if (header) {
            header.addEventListener("click", function() {
                setTimeout(function() {
                    if (!isCollapsed() && !tc.views.scanned && !tc.views.loading) scanViews(null);
                }, 60);
            });
        }
    }

    EP.theCutter = {
        init: _initRefs,
        run: run,
        stop: stop,
        scanViews: scanViews,
        refreshHeaderProgress: refreshHeaderProgress,
        isRunning: function() { return !!tc.running; }
    };

})(window);
