/**
 * EditorPro — After Effects Script: Create Supertext MOGRT
 *
 * Run this in After Effects (File > Scripts > Run Script File...)
 * Creates a word-by-word reveal animation with fade-in from below,
 * exports it as a .mogrt to your Desktop for use in Smart Supertext 2.
 *
 * Animation: each word fades in and slides up (bottom → top)
 * Easing: Range Selector Ease Out 33%, Ease In 100%
 * Duration of reveal: ~2 seconds, then text stays visible
 */

(function() {
    app.beginUndoGroup("EditorPro — Create Supertext MOGRT");

    try {
        var compW = 1920;
        var compH = 1080;
        var compDur = 10;
        var compFPS = 30;
        var revealDuration = 2;

        var comp = app.project.items.addComp(
            "EditorPro_Supertext", compW, compH, 1, compDur, compFPS
        );

        // 200+ char placeholder so ExtendScript setValue won't truncate
        var placeholder =
            "Este es un texto de ejemplo placeholder que debe ser lo suficientemente " +
            "largo para que cualquier supertexto que se quiera mostrar en pantalla " +
            "pueda caber sin problemas de longitud maxima permitida por el template";

        var textLayer = comp.layers.addText(placeholder);
        textLayer.name = "Supertext";

        // ─── Text Style ─────────────────────────────────────────────

        var textProp = textLayer.property("ADBE Text Properties").property("ADBE Text Document");
        var td = textProp.value;
        td.fontSize = 54;
        td.font = "Arial-BoldMT";
        td.fillColor = [1, 1, 1];
        td.applyFill = true;
        td.applyStroke = false;
        td.justification = ParagraphJustification.CENTER_JUSTIFY;
        textProp.setValue(td);

        // Point text centered in lower third
        textLayer.property("Position").setValue([compW / 2, compH * 0.78]);

        // ─── Text Animator: Word-by-Word Reveal ─────────────────────

        var animators = textLayer.property("ADBE Text Properties").property("ADBE Text Animators");
        var anim = animators.addProperty("ADBE Text Animator");
        anim.name = "Word Reveal";

        // Animator properties: hidden state (applied to selected chars)
        var animProps = anim.property("ADBE Text Animator Properties");

        // Position Y +50px (text starts 50px below final position)
        animProps.addProperty("ADBE Text Position 3D");
        animProps.property("ADBE Text Position 3D").setValue([0, 50, 0]);

        // Opacity 0 (text starts invisible)
        animProps.addProperty("ADBE Text Opacity");
        animProps.property("ADBE Text Opacity").setValue(0);

        // ─── Range Selector ─────────────────────────────────────────

        var selectors = anim.property("ADBE Text Selectors");
        var selector;

        // Try to access existing default selector, or add one
        try { selector = selectors.property(1); } catch(e1) { selector = null; }
        if (!selector) {
            try { selector = selectors.addProperty("ADBE Text Selector"); } catch(e2) {}
        }
        if (!selector) {
            try { selector = selectors.addProperty("ADBE Text Range Selector2"); } catch(e3) {}
        }

        if (selector) {
            // Helper: find a property by matchName, trying Advanced sub-group first, then direct
            function findProp(sel, matchName) {
                var adv = null;
                try { adv = sel.property("ADBE Text Range Advanced"); } catch(e) {}
                if (adv) {
                    var p = null;
                    try { p = adv.property(matchName); } catch(e) {}
                    if (p) return p;
                }
                try { return sel.property(matchName); } catch(e) { return null; }
            }

            // Based on: Words (3)
            var typeProp = findProp(selector, "ADBE Text Range Type2");
            if (typeProp) try { typeProp.setValue(3); } catch(e) {}

            // Shape: Square (1)
            var shapeProp = findProp(selector, "ADBE Text Range Shape");
            if (shapeProp) try { shapeProp.setValue(1); } catch(e) {}

            // Per-word transition easing
            var easeHighProp = findProp(selector, "ADBE Text Ease High");
            if (easeHighProp) try { easeHighProp.setValue(33); } catch(e) {}

            var easeLowProp = findProp(selector, "ADBE Text Ease Low");
            if (easeLowProp) try { easeLowProp.setValue(100); } catch(e) {}

            // End fixed at 100%
            try { selector.property("ADBE Text Percent End").setValue(100); } catch(e) {}

            // Animate Start from 0% → 100% over revealDuration
            var startProp = null;
            try { startProp = selector.property("ADBE Text Percent Start"); } catch(e) {}

            if (startProp) {
                startProp.setValueAtTime(0, 0);
                startProp.setValueAtTime(revealDuration, 100);

                // Keyframe temporal easing
                var easeOut = new KeyframeEase(0, 33);
                var easeIn = new KeyframeEase(0, 100);
                try {
                    startProp.setTemporalEaseAtKey(1, [easeOut], [easeOut]);
                    startProp.setTemporalEaseAtKey(2, [easeIn], [easeIn]);
                } catch(eKF) {}
            }
        }

        // ─── Drop Shadow for readability over video ─────────────────

        var layerStyles = textLayer.property("ADBE Layer Styles");
        try {
            var dropShadow = layerStyles.addProperty("ADBE Drop Shadow");
            if (dropShadow) {
                dropShadow.property("ADBE Drop Shadow-0002").setValue(180);
                dropShadow.property("ADBE Drop Shadow-0003").setValue(3);
                dropShadow.property("ADBE Drop Shadow-0004").setValue(8);
            }
        } catch(eShadow) {
            // Layer styles may not be available; skip
        }

        // ─── Essential Graphics: expose Source Text ──────────────────

        var added = false;
        try {
            if (typeof textProp.addToMotionGraphicsTemplateAs === "function") {
                textProp.addToMotionGraphicsTemplateAs(comp, "Source Text");
                added = true;
            } else if (typeof textProp.addToMotionGraphicsTemplate === "function") {
                textProp.addToMotionGraphicsTemplate(comp);
                added = true;
            }
        } catch(eEGP) {
            // Will need manual addition
        }

        comp.motionGraphicsTemplateName = "EditorPro Supertext";

        // ─── Export as MOGRT ─────────────────────────────────────────

        var savePath = Folder.desktop.fsName + "/EditorPro_Supertext.mogrt";
        var mogrtFile = new File(savePath);
        var exported = false;

        try {
            if (typeof comp.exportAsMotionGraphicsTemplate === "function") {
                comp.exportAsMotionGraphicsTemplate(mogrtFile);
                exported = true;
            }
        } catch(eExport) {
            // Export not supported in this AE version
        }

        comp.openInViewer();

        // ─── Result message ──────────────────────────────────────────

        if (exported) {
            alert(
                "MOGRT creado exitosamente!\n\n" +
                "Archivo: " + savePath + "\n\n" +
                "Pasos siguientes:\n" +
                "1. Abre Editor-Pro en Premiere Pro\n" +
                "2. Ve a Smart Supertext 2\n" +
                "3. Click 'Elegir' y selecciona este archivo\n" +
                "4. Genera supertextos y crea gráficos"
            );
        } else {
            var msg = "Composición creada: 'EditorPro_Supertext'\n\n";
            msg += "Tu versión de After Effects no soporta exportar MOGRT por script.\n\n";
            msg += "Exporta manualmente:\n";
            msg += "1. Selecciona la composición 'EditorPro_Supertext'\n";
            msg += "2. Abre el panel Essential Graphics (Window > Essential Graphics)\n";
            if (!added) {
                msg += "3. Arrastra 'Source Text' al panel Essential Graphics\n";
                msg += "4. Click 'Export Motion Graphics Template'\n";
                msg += "5. Guarda como .mogrt\n";
            } else {
                msg += "3. Click 'Export Motion Graphics Template'\n";
                msg += "4. Guarda como .mogrt\n";
            }
            alert(msg);
        }

    } catch(e) {
        alert("Error: " + e.message + " (línea " + e.line + ")");
    }

    app.endUndoGroup();
})();
