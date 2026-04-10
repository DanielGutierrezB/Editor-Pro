/**
 * EditorPro — Create Smart Supertext MOGRTs (7 types, Phase 1)
 *
 * Run in After Effects: File > Scripts > Run Script File...
 * Exports to ~/Desktop/EditorPro_Supertexts/
 *
 * Layouts:
 *   title      — Big impactful text, SemiBold, no background
 *   bullet     — Simple clean line, Regular weight
 *   step       — Compact card (dark background + "PASO" badge)
 *   data       — Compact card (dark background + "DATO" badge)
 *   definition — Label "DEFINICIÓN" above text line
 *   summary    — Slide: "RESUMEN" title + body text + background
 *   highlight  — Medium weight text, subtle emphasis
 */

(function() {
    app.beginUndoGroup("EditorPro — Create Supertext MOGRTs");

    // ═════════════════════════════════════════════════════════════════
    // Type definitions
    // ═════════════════════════════════════════════════════════════════

    var TYPES = {
        title: {
            layout: "text", fontSize: 64, font: "DMSans-SemiBold",
            color: [1, 1, 1], label: "", boxW: 900, boxH: 350,
            posX: null, posY: 0.70, showBg: false
        },
        bullet: {
            layout: "text", fontSize: 52, font: "DMSans-Regular",
            color: [1, 1, 1], label: "", boxW: 900, boxH: 300,
            posX: null, posY: 0.73, showBg: false
        },
        highlight: {
            layout: "text", fontSize: 56, font: "DMSans-MediumItalic",
            color: [1, 1, 1], label: "", boxW: 900, boxH: 300,
            posX: null, posY: 0.72, showBg: false
        },
        definition: {
            layout: "label", fontSize: 52, font: "DMSans-Regular",
            color: [1, 0.72, 0.26], label: "DEFINICIÓN", boxW: 900, boxH: 300,
            posX: null, posY: 0.73, showBg: true
        },
        step: {
            layout: "card", fontSize: 44, font: "DMSans-Regular",
            color: [1, 1, 1], label: "PASO", labelColor: [0.53, 0.81, 0.98],
            boxW: 800, boxH: 150, padX: 30, padY: 25, bgRound: 14,
            posX: null, posY: 0.82
        },
        data: {
            layout: "card", fontSize: 44, font: "DMSans-Regular",
            color: [1, 1, 1], label: "DATO", labelColor: [0.98, 0.80, 0.08],
            boxW: 800, boxH: 150, padX: 30, padY: 25, bgRound: 14,
            posX: null, posY: 0.82
        },
        summary: {
            layout: "slide", fontSize: 48, font: "DMSans-Regular",
            color: [1, 1, 1], label: "RESUMEN", labelColor: [0.68, 0.51, 0.98],
            boxW: 850, boxH: 300, padX: 36, padY: 30, bgRound: 16,
            posX: null, posY: 0.66
        }
    };

    // ═════════════════════════════════════════════════════════════════
    // Shared config
    // ═════════════════════════════════════════════════════════════════

    var compW = 1920, compH = 1080, compFPS = 30, compDur = 30;
    var marginL = 100;
    var defFPW = 4, defPosY = 20, defEaseH = 100, defEaseL = 50, defOutFrames = 15;
    var placeholder = "Texto de ejemplo para supertexto educativo";

    // ═════════════════════════════════════════════════════════════════
    // Helpers
    // ═════════════════════════════════════════════════════════════════

    function addSlider(layer, name, val) {
        var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
        fx.name = name;
        fx.property("ADBE Slider Control-0001").setValue(val);
    }

    function addColorCtrl(layer, name, rgb) {
        var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Color Control");
        fx.name = name;
        fx.property("ADBE Color Control-0001").setValue(rgb);
    }

    function findProp(sel, mn) {
        try {
            var adv = sel.property("ADBE Text Range Advanced");
            if (adv) { var p = adv.property(mn); if (p) return p; }
        } catch(e) {}
        try { return sel.property(mn); } catch(e) { return null; }
    }

    // OUT: fade + slide down (all at once, layer-level)
    function applyOut(layer, ref) {
        var r = ref ? 'thisComp.layer("' + ref + '")' : 'thisLayer';
        var oE = 'var of=' + r + '.effect("Out Frames")("Slider");' +
                 'var os=outPoint-of*thisComp.frameDuration;' +
                 'if(time>os)ease(time,os,outPoint,100,0);else 100;';
        var pE = 'var of=' + r + '.effect("Out Frames")("Slider");' +
                 'var py=' + r + '.effect("Position Y")("Slider");' +
                 'var os=outPoint-of*thisComp.frameDuration;' +
                 'if(time>os)value+[0,ease(time,os,outPoint,0,py)];else value;';
        try { layer.property("ADBE Transform Group").property("ADBE Opacity").expression = oE; } catch(e) {}
        try { layer.property("ADBE Transform Group").property("ADBE Position").expression = pE; } catch(e) {}
    }

    // IN: simple fade for non-text layers (labels)
    function applyFadeIn(layer, frames, ref) {
        var r = ref ? 'thisComp.layer("' + ref + '")' : 'thisLayer';
        var e = 'var ie=inPoint+' + frames + '*thisComp.frameDuration;' +
                'if(time<ie)ease(time,inPoint,ie,0,100);else 100;';
        try { layer.property("ADBE Transform Group").property("ADBE Opacity").expression = e; } catch(e2) {}
    }

    // Bg opacity: show/hide toggle + fade-in + fade-out
    // Position OUT is inherited from parent (text layer), no need to duplicate
    function applyBgAnim(bgLayer, textRef) {
        var r = 'thisComp.layer("' + textRef + '")';
        var opacExpr =
            'var show = ' + r + '.effect("Show Background")("Checkbox");\n' +
            'if (!show) { 0; } else {\n' +
            '    var of = ' + r + '.effect("Out Frames")("Slider");\n' +
            '    var os = outPoint - of * thisComp.frameDuration;\n' +
            '    var ie = inPoint + 8 * thisComp.frameDuration;\n' +
            '    if (time < ie) ease(time, inPoint, ie, 0, 100);\n' +
            '    else if (time > os) ease(time, os, outPoint, 100, 0);\n' +
            '    else 100;\n' +
            '}';
        try { bgLayer.property("ADBE Transform Group").property("ADBE Opacity").expression = opacExpr; } catch(e) {}
    }

    function addCheckbox(layer, name, val) {
        var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Checkbox Control");
        fx.name = name;
        fx.property("ADBE Checkbox Control-0001").setValue(val ? 1 : 0);
    }

    // Word-by-word reveal animator + sliders + color control
    function setupTextAnim(textLayer, cfg) {
        addSlider(textLayer, "Frames Per Word", defFPW);
        addSlider(textLayer, "Position Y", defPosY);
        addSlider(textLayer, "Ease High", defEaseH);
        addSlider(textLayer, "Ease Low", defEaseL);
        addSlider(textLayer, "Out Frames", defOutFrames);
        addSlider(textLayer, "BG Margin", 30);
        addSlider(textLayer, "BG Roundness", 14);
        addColorCtrl(textLayer, "Text Color", cfg.color);
        addCheckbox(textLayer, "Show Background", cfg.showBg !== false);

        var anims = textLayer.property("ADBE Text Properties").property("ADBE Text Animators");

        // Animator 1: Word Reveal
        var rev = anims.addProperty("ADBE Text Animator");
        rev.name = "Word Reveal";
        var rp = rev.property("ADBE Text Animator Properties");
        rp.addProperty("ADBE Text Position 3D");
        rp.property("ADBE Text Position 3D").setValue([0, defPosY, 0]);
        try { rp.property("ADBE Text Position 3D").expression = '[0,thisLayer.effect("Position Y")("Slider"),0]'; } catch(e) {}
        rp.addProperty("ADBE Text Opacity");
        rp.property("ADBE Text Opacity").setValue(0);

        var sels = rev.property("ADBE Text Selectors");
        var sel = null;
        try { sel = sels.property(1); } catch(e) {}
        if (!sel) try { sel = sels.addProperty("ADBE Text Selector"); } catch(e) {}

        if (sel) {
            var t = findProp(sel, "ADBE Text Range Type2"); if (t) try { t.setValue(3); } catch(e) {}
            var s = findProp(sel, "ADBE Text Range Shape");  if (s) try { s.setValue(1); } catch(e) {}
            var eh = findProp(sel, "ADBE Text Ease High");
            if (eh) { try { eh.setValue(defEaseH); } catch(e) {} try { eh.expression = 'thisLayer.effect("Ease High")("Slider")'; } catch(e) {} }
            var el = findProp(sel, "ADBE Text Ease Low");
            if (el) { try { el.setValue(defEaseL); } catch(e) {} try { el.expression = 'thisLayer.effect("Ease Low")("Slider")'; } catch(e) {} }
            try { sel.property("ADBE Text Percent End").setValue(100); } catch(e) {}

            var sp = null;
            try { sp = sel.property("ADBE Text Percent Start"); } catch(e) {}
            if (sp) {
                var inExpr =
                    'var src=""+text.sourceText;var wc=Math.max(1,src.split(" ").length);' +
                    'var fpw=thisLayer.effect("Frames Per Word")("Slider");' +
                    'var af=clamp(wc*fpw,15,60);var as=af*thisComp.frameDuration;' +
                    'var ie=inPoint+as;if(time<ie)ease(time,inPoint,ie,0,100);else 100;';
                try { sp.expression = inExpr; } catch(e) {
                    sp.setValueAtTime(0, 0);
                    sp.setValueAtTime(defFPW * 10 / compFPS, 100);
                }
            }
        }

        // Animator 2: Color Override
        var col = anims.addProperty("ADBE Text Animator");
        col.name = "Color Override";
        var cp = col.property("ADBE Text Animator Properties");
        cp.addProperty("ADBE Text Fill Color");
        cp.property("ADBE Text Fill Color").setValue(cfg.color);
        try { cp.property("ADBE Text Fill Color").expression = 'thisLayer.effect("Text Color")("Color")'; } catch(e) {}

        applyOut(textLayer, null);
    }

    // Dynamic dark rounded rectangle — parented to text layer for auto-positioning
    // topExtra: additional height above text for label coverage (0 if no label)
    function addDynamicBg(comp, name, textLayerName, topExtra) {
        var te = topExtra || 0;
        var bg = comp.layers.addShape();
        bg.name = name;
        bg.parent = comp.layer(textLayerName);

        var root = bg.property("ADBE Root Vectors Group");
        var grp = root.addProperty("ADBE Vector Group");
        grp.name = "Rect";
        var c = grp.property("ADBE Vectors Group");
        var rect = c.addProperty("ADBE Vector Shape - Rect");
        rect.property("ADBE Vector Rect Size").setValue([400, 100]);
        rect.property("ADBE Vector Rect Roundness").setValue(14);
        var fill = c.addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue([0.06, 0.06, 0.08]);
        fill.property("ADBE Vector Fill Opacity").setValue(80);

        var sizeExpr =
            'var r = parent.sourceRectAtTime(time, false);\n' +
            'var m = parent.effect("BG Margin")("Slider");\n' +
            '[r.width + m * 2, r.height + m * 2 + ' + te + '];';
        try { rect.property("ADBE Vector Rect Size").expression = sizeExpr; } catch(e) {}

        try {
            rect.property("ADBE Vector Rect Roundness").expression =
                'parent.effect("BG Roundness")("Slider")';
        } catch(e) {}

        // Center on text, shifted up by half of topExtra to cover label
        var posExpr =
            'var r = parent.sourceRectAtTime(time, false);\n' +
            '[r.left + r.width/2, r.top + r.height/2 - ' + (te / 2) + '];';
        try { bg.property("ADBE Transform Group").property("ADBE Position").expression = posExpr; } catch(e) {}

        // Send to back
        bg.moveAfter(comp.layer(comp.numLayers));

        return bg;
    }

    // Expose controls to Essential Graphics
    function exposeEG(comp, textLayer, textDoc, labelDoc) {
        try { textDoc.addToMotionGraphicsTemplateAs(comp, "Source Text"); } catch(e) {}
        if (labelDoc) try { labelDoc.addToMotionGraphicsTemplateAs(comp, "Label"); } catch(e) {}
        try { textLayer.property("ADBE Effect Parade").property("Text Color")
              .property("ADBE Color Control-0001").addToMotionGraphicsTemplateAs(comp, "Text Color"); } catch(e) {}
        // Checkbox
        try { textLayer.property("ADBE Effect Parade").property("Show Background")
              .property("ADBE Checkbox Control-0001").addToMotionGraphicsTemplateAs(comp, "Show Background"); } catch(e) {}

        var sliders = ["Frames Per Word", "Position Y", "Ease High", "Ease Low", "Out Frames", "BG Margin", "BG Roundness"];
        for (var i = 0; i < sliders.length; i++) {
            try { textLayer.property("ADBE Effect Parade").property(sliders[i])
                  .property("ADBE Slider Control-0001").addToMotionGraphicsTemplateAs(comp, sliders[i]); } catch(e) {}
        }
    }

    // ═════════════════════════════════════════════════════════════════
    // Layout builders
    // ═════════════════════════════════════════════════════════════════

    // Helper: create label parented to text, positioned above sourceRect
    function addLabel(comp, cfg, labelSize, labelColor) {
        var ll = comp.layers.addText(cfg.label);
        ll.name = "Label";
        var ld = ll.property("ADBE Text Properties").property("ADBE Text Document");
        var lt = ld.value;
        try { lt.resetCharStyle(); } catch(e) {}
        lt.fontSize = labelSize;
        lt.font = "DMSans-SemiBold";
        lt.fillColor = labelColor;
        lt.applyFill = true; lt.applyStroke = false;
        lt.justification = ParagraphJustification.LEFT_JUSTIFY;
        lt.text = cfg.label;
        ld.setValue(lt);

        // Parent to text layer — label lives in text layer's local space
        ll.parent = comp.layer("Supertext");

        // Position: above text, left-aligned with text content (not the bg edge)
        var posExpr =
            'var r = parent.sourceRectAtTime(time, false);\n' +
            '[r.left, r.top - 15];';
        try { ll.property("ADBE Transform Group").property("ADBE Position").expression = posExpr; } catch(e) {}

        // Fade in
        applyFadeIn(ll, 8, null);

        // Color linked to text color control
        var la = ll.property("ADBE Text Properties").property("ADBE Text Animators").addProperty("ADBE Text Animator");
        la.name = "LabelColor";
        var lcp = la.property("ADBE Text Animator Properties");
        lcp.addProperty("ADBE Text Fill Color");
        lcp.property("ADBE Text Fill Color").setValue(labelColor);
        try { lcp.property("ADBE Text Fill Color").expression = 'thisComp.layer("Supertext").effect("Text Color")("Color")'; } catch(e) {}

        // Opacity for OUT (inherits position OUT from parent)
        var r = 'thisComp.layer("Supertext")';
        var opacExpr =
            'var of = ' + r + '.effect("Out Frames")("Slider");\n' +
            'var os = outPoint - of * thisComp.frameDuration;\n' +
            'var ie = inPoint + 8 * thisComp.frameDuration;\n' +
            'if (time < ie) ease(time, inPoint, ie, 0, 100);\n' +
            'else if (time > os) ease(time, os, outPoint, 100, 0);\n' +
            'else 100;';
        try { ll.property("ADBE Transform Group").property("ADBE Opacity").expression = opacExpr; } catch(e) {}

        return { layer: ll, doc: ld };
    }

    // Helper: create main text layer with animation
    function addMainText(comp, cfg) {
        var px = cfg.posX || (marginL + cfg.boxW / 2);
        var py = compH * cfg.posY;

        var tl = comp.layers.addBoxText([cfg.boxW, cfg.boxH]);
        tl.name = "Supertext";
        var doc = tl.property("ADBE Text Properties").property("ADBE Text Document");
        var td = doc.value;
        try { td.resetCharStyle(); } catch(e) {}
        td.fontSize = cfg.fontSize; td.font = cfg.font;
        td.fillColor = cfg.color; td.applyFill = true; td.applyStroke = false;
        td.justification = ParagraphJustification.LEFT_JUSTIFY;
        td.text = placeholder; doc.setValue(td);

        // Fix anchor to [0,0] so sourceRectAtTime returns clean coordinates.
        // Adjust position to compensate for the anchor change.
        var anchor = tl.property("ADBE Transform Group").property("ADBE Anchor Point");
        var pos = tl.property("ADBE Transform Group").property("ADBE Position");
        var defAnchor = anchor.value;
        anchor.setValue([0, 0]);
        pos.setValue([px - defAnchor[0], py - defAnchor[1]]);

        setupTextAnim(tl, cfg);

        // Drop Shadow
        try {
            var ds = tl.property("ADBE Layer Styles").addProperty("ADBE Drop Shadow");
            ds.property("ADBE Drop Shadow-0002").setValue(180);
            ds.property("ADBE Drop Shadow-0003").setValue(3);
            ds.property("ADBE Drop Shadow-0004").setValue(8);
        } catch(e) {}

        return { layer: tl, doc: doc };
    }

    // "text" layout: clean text, optional bg (title, bullet, highlight)
    function buildText(comp, cfg) {
        var main = addMainText(comp, cfg);
        var bg = addDynamicBg(comp, "Background", "Supertext", 0);
        applyBgAnim(bg, "Supertext");
        return { textLayer: main.layer, textDoc: main.doc, labelDoc: null };
    }

    // "label" layout: label above + text below (definition)
    function buildLabel(comp, cfg) {
        var main = addMainText(comp, cfg);
        var lbl = addLabel(comp, cfg, 28, cfg.color);
        var bg = addDynamicBg(comp, "Background", "Supertext", 45);
        applyBgAnim(bg, "Supertext");
        return { textLayer: main.layer, textDoc: main.doc, labelDoc: lbl.doc };
    }

    // "card" layout: bg card + label badge + text (step, data)
    function buildCard(comp, cfg) {
        var main = addMainText(comp, cfg);
        var lbl = addLabel(comp, cfg, 24, cfg.labelColor);
        var bg = addDynamicBg(comp, "Background", "Supertext", 42);
        applyBgAnim(bg, "Supertext");
        return { textLayer: main.layer, textDoc: main.doc, labelDoc: lbl.doc };
    }

    // "slide" layout: bg + title + body text (summary)
    function buildSlide(comp, cfg) {
        var main = addMainText(comp, cfg);
        var lbl = addLabel(comp, cfg, 32, cfg.labelColor);
        var bg = addDynamicBg(comp, "Background", "Supertext", 60);
        applyBgAnim(bg, "Supertext");
        return { textLayer: main.layer, textDoc: main.doc, labelDoc: lbl.doc };
    }

    // ═════════════════════════════════════════════════════════════════
    // Export folder
    // ═════════════════════════════════════════════════════════════════

    var exportFolder = new Folder(Folder.desktop.fsName + "/EditorPro_Supertexts");
    if (!exportFolder.exists) exportFolder.create();

    var results = [];

    // ═════════════════════════════════════════════════════════════════
    // Generate MOGRTs
    // ═════════════════════════════════════════════════════════════════

    for (var typeName in TYPES) {
        if (!TYPES.hasOwnProperty(typeName)) continue;
        var cfg = TYPES[typeName];

        try {
            var comp = app.project.items.addComp("ST_" + typeName, compW, compH, 1, compDur, compFPS);

            var built;
            switch (cfg.layout) {
                case "card":  built = buildCard(comp, cfg);  break;
                case "slide": built = buildSlide(comp, cfg); break;
                case "label": built = buildLabel(comp, cfg); break;
                default:      built = buildText(comp, cfg);  break;
            }

            // Essential Graphics
            comp.motionGraphicsTemplateName = typeName.toUpperCase();
            exposeEG(comp, built.textLayer, built.textDoc, built.labelDoc);

            // Export
            try { app.project.save(); } catch(e) {}
            var exported = false;
            try { exported = comp.exportAsMotionGraphicsTemplate(true, exportFolder.fsName); } catch(e) {}
            results.push(typeName.toUpperCase() + (exported ? " OK" : " (manual)"));

        } catch(eType) {
            results.push(typeName.toUpperCase() + " ERROR: " + eType.message);
        }
    }

    // ═════════════════════════════════════════════════════════════════

    alert(
        "Smart Supertext MOGRTs:\n\n" +
        results.join("\n") + "\n\n" +
        "Carpeta: " + exportFolder.fsName + "\n\n" +
        "En Editor-Pro: Smart Supertext 2 > Carpeta > EditorPro_Supertexts"
    );

    app.endUndoGroup();
})();
