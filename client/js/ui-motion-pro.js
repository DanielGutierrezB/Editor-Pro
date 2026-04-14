/**
 * Editor-Pro — Motion-Pro UI Module
 * Extracted from main.js for organizational clarity.
 * All behavior is identical to the original.
 */
(function(global) {
    "use strict";

    var EP = global.EditorProUI = global.EditorProUI || {};

    // ─── Shared references (captured at init time, not load time) ─
    var state, csInterface, fs, path, os, motionPro, aiAnalyzer;
    var on, clearContainer, safeCallback, showToast, showElement, hideElement;
    var disableBtn, enableBtn, esc, escAttr, escExtend, setProgress;
    var checkAIReady, expandSection, formatTime, formatTimeFull, navigateToTime;
    var refreshSequenceInfo, buildTimedTranscript, copyToClipboard;
    var getPromptContext, togglePromptEditorById, savePromptById, resetPromptById;
    var normalizeSupertextNewlines, normalizeSt2Fields, escSupertextHtml;
    var secsToSRTTime, pad2, pad3, truncate, formatFileSize;
    var refreshAllHeaderProgress, updateAIStatus, showInfoModal, refreshProviderUI;
    var parseTextClipsFromXML, sttResultToSRT, parseSRT, srtTimeToSeconds;
    var loadTranscriptText, onTranscriptChange;
    var readTranscriptFromProjectFile, readCaptionsFromProjectFile;
    var srtSegmentsToSttResult, renderTranscriptFromSegments, bindCollapsibles;
    var MP_ANTICIPATION_SECS;

    var _mpTimers = {
        analysisStart: 0,
        generateStart: 0,
        totalStart: 0,
        itemStarts: {},
    };

    function _initRefs() {
        state       = global._epState;
        csInterface = global._epCSInterface;
        fs          = global._epFs;
        path        = global._epPath;
        os          = global._epOs;
        motionPro    = global._epMotionPro;
        aiAnalyzer   = global._epAiAnalyzer;

        on                       = global._epOn;
        clearContainer           = global._epClearContainer;
        safeCallback             = global._epSafeCallback;
        showToast                = global._epShowToast;
        showElement              = global._epShowElement;
        hideElement              = global._epHideElement;
        disableBtn               = global._epDisableBtn;
        enableBtn                = global._epEnableBtn;
        esc                      = global._epEsc;
        escAttr                  = global._epEscAttr;
        escExtend                = global._epEscExtend;
        setProgress              = global._epSetProgress;
        checkAIReady             = global._epCheckAIReady;
        expandSection            = global._epExpandSection;
        formatTime               = global._epFormatTime;
        formatTimeFull           = global._epFormatTimeFull;
        navigateToTime           = global._epNavigateToTime;
        refreshSequenceInfo      = global._epRefreshSequenceInfo;
        buildTimedTranscript     = global._epBuildTimedTranscript;
        copyToClipboard          = global._epCopyToClipboard;
        getPromptContext         = global._epGetPromptContext;
        togglePromptEditorById   = global._epTogglePromptEditorById;
        savePromptById           = global._epSavePromptById;
        resetPromptById          = global._epResetPromptById;
        normalizeSupertextNewlines = global._epNormalizeSupertextNewlines;
        normalizeSt2Fields       = global._epNormalizeSt2Fields;
        escSupertextHtml         = global._epEscSupertextHtml;
        secsToSRTTime            = global._epSecsToSRTTime;
        pad2                     = global._epPad2;
        pad3                     = global._epPad3;
        truncate                 = global._epTruncate;
        formatFileSize           = global._epFormatFileSize;
        refreshAllHeaderProgress = global._epRefreshAllHeaderProgress;
        updateAIStatus           = global._epUpdateAIStatus;
        showInfoModal            = global._epShowInfoModal;
        refreshProviderUI        = global._epRefreshProviderUI;
        parseTextClipsFromXML    = global._epParseTextClipsFromXML;
        sttResultToSRT           = global._epSttResultToSRT;
        parseSRT                 = global._epParseSRT;
        srtTimeToSeconds         = global._epSrtTimeToSeconds;
        loadTranscriptText       = global._epLoadTranscriptText;
        onTranscriptChange       = global._epOnTranscriptChange;
        readTranscriptFromProjectFile = global._epReadTranscriptFromProjectFile;
        readCaptionsFromProjectFile = global._epReadCaptionsFromProjectFile;
        srtSegmentsToSttResult   = global._epSrtSegmentsToSttResult;
        renderTranscriptFromSegments = global._epRenderTranscriptFromSegments;
        bindCollapsibles         = global._epBindCollapsibles;
        MP_ANTICIPATION_SECS     = global._epMP_ANTICIPATION_SECS || 0;
    }

    // Store multiple reference images for AI palette analysis
    var _referenceImages = [];

    // ─── Color Extraction (canvas fallback + AI vision) ─────────────────

    function _extractPaletteFromImage(imageSrc, callback) {
        var img = new Image();
        img.onload = function() {
            var canvas = document.createElement('canvas');
            var ctx = canvas.getContext('2d');
            var w = 100; // downsample for speed
            var h = Math.round(img.height * (w / img.width));
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(img, 0, 0, w, h);

            var imageData = ctx.getImageData(0, 0, w, h).data;
            var colors = [];

            for (var i = 0; i < imageData.length; i += 16) {
                colors.push({ r: imageData[i], g: imageData[i + 1], b: imageData[i + 2] });
            }

            colors.sort(function(a, b) { return (a.r + a.g + a.b) - (b.r + b.g + b.b); });

            var darkQuarter = colors.slice(0, Math.floor(colors.length * 0.25));
            var bg = _avgColor(darkQuarter);
            var bgBrightness = (bg.r + bg.g + bg.b) / 3;

            var bgMax = Math.max(bg.r, bg.g, bg.b);
            var bgMin = Math.min(bg.r, bg.g, bg.b);
            var bgHue = 0;
            if (bgMax !== bgMin) {
                if (bgMax === bg.r) bgHue = 60 * ((bg.g - bg.b) / (bgMax - bgMin));
                else if (bgMax === bg.g) bgHue = 60 * (2 + (bg.b - bg.r) / (bgMax - bgMin));
                else bgHue = 60 * (4 + (bg.r - bg.g) / (bgMax - bgMin));
                if (bgHue < 0) bgHue += 360;
            }

            var accentHue = (bgHue + 160) % 360;
            function hslToRgb(h, s, l) {
                var c = (1 - Math.abs(2*l - 1)) * s;
                var x = c * (1 - Math.abs((h/60) % 2 - 1));
                var m = l - c/2;
                var r1=0,g1=0,b1=0;
                if(h<60){r1=c;g1=x;}else if(h<120){r1=x;g1=c;}else if(h<180){g1=c;b1=x;}
                else if(h<240){g1=x;b1=c;}else if(h<300){r1=x;b1=c;}else{r1=c;b1=x;}
                return {r:Math.round((r1+m)*255),g:Math.round((g1+m)*255),b:Math.round((b1+m)*255)};
            }
            var accent = hslToRgb(accentHue, 0.8, 0.65);
            var card = { r: Math.min(255, bg.r + 20), g: Math.min(255, bg.g + 20), b: Math.min(255, bg.b + 20) };
            var textColor = bgBrightness < 128 ? '#ffffff' : '#1a1d23';
            var dimColor = bgBrightness < 128 ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)';
            var secondaryHue = (accentHue + 90) % 360;
            var warningHue = (accentHue + 180) % 360;
            var secondary = hslToRgb(secondaryHue, 0.7, 0.6);
            var warning = hslToRgb(warningHue, 0.7, 0.6);

            var palette = {
                bg: _rgbToHex(bg), card: _rgbToHex(card), accent: _rgbToHex(accent),
                text: textColor, dim: dimColor,
                border: bgBrightness < 128 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                glow: _hexToRgba(_rgbToHex(accent), 0.08),
                green: _rgbToHex(accent), orange: _rgbToHex(warning),
                purple: _rgbToHex(secondary), red: '#f87171',
            };
            callback(null, palette);
        };
        img.onerror = function() { callback(new Error('No se pudo cargar la imagen')); };
        img.src = imageSrc;
    }

    /** AI Vision palette: sends base64 image to server → LLM with vision → palette JSON */
    function _extractPaletteAI(base64, callback) {
        if (!motionPro || !aiAnalyzer || !aiAnalyzer.isConfigured()) {
            return callback(new Error('AI not configured'));
        }
        motionPro._post("/api/palette", {
            imageBase64: base64,
            provider: state.settings.aiProvider,
            model: state.settings.aiModel,
            apiKey: aiAnalyzer.getActiveKey()
        }, function(err, result) {
            if (err || !result || !result.palette) {
                return callback(new Error(err ? err.message : (result && result.error) || 'Sin respuesta de paleta'));
            }
            callback(null, result.palette, result.reasoning || '');
        });
    }

    /** AI Vision palette with multiple reference images */
    function _extractPaletteAIMultiple(images, callback) {
        if (!motionPro || !aiAnalyzer || !aiAnalyzer.isConfigured()) {
            return callback(new Error('AI not configured'));
        }
        motionPro._post("/api/palette", {
            images: images,
            provider: state.settings.aiProvider,
            model: state.settings.aiModel,
            apiKey: aiAnalyzer.getActiveKey()
        }, function(err, result) {
            if (err || !result || !result.palette) {
                return callback(new Error(err ? err.message : (result && result.error) || 'Sin respuesta de paleta'));
            }
            callback(null, result.palette, result.reasoning || '');
        });
    }

    /** Apply palette to state, motionPro, localStorage, and UI swatches */
    function _applyPalette(palette) {
        state.customPalette = palette;
        if (motionPro) motionPro.customPalette = palette;
        localStorage.setItem("mp_custom_palette", JSON.stringify(palette));
        _mpUpdateStyleSwatches(palette);
        showToast("Paleta aplicada", "success");
        if (window.EPLogger) EPLogger.log("motion-pro", "style-applied", "bg=" + palette.bg + " accent=" + palette.accent);
    }

    function _avgColor(colors) {
        var r = 0, g = 0, b = 0;
        colors.forEach(function(c) { r += c.r; g += c.g; b += c.b; });
        var n = colors.length || 1;
        return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
    }

    function _rgbToHex(c) {
        return '#' + [c.r, c.g, c.b].map(function(v) {
            return v.toString(16).padStart(2, '0');
        }).join('');
    }

    function _hexToRgba(hex, alpha) {
        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    function _mpUpdateStyleSwatches(palette) {
        var swatches = document.querySelectorAll('.mp-swatch');
        swatches.forEach(function(sw) {
            var key = sw.getAttribute('data-color-key');
            if (key && palette[key]) {
                sw.style.background = palette[key];
            }
        });
        var label = document.getElementById("mp-style-label");
        if (label) label.textContent = "Personalizado";
        var resetBtn = document.getElementById("btn-mp-reset-style");
        if (resetBtn) resetBtn.style.display = "";
    }

    function _mpResetStyleSwatches() {
        var defaults = { bg: '#1a1d23', card: '#2d323a', accent: '#0ae98d', orange: '#fb923c', purple: '#a78bfa', red: '#f87171', text: '#ffffff' };
        var swatches = document.querySelectorAll('.mp-swatch');
        swatches.forEach(function(sw) {
            var key = sw.getAttribute('data-color-key');
            if (key && defaults[key]) {
                sw.style.background = defaults[key];
            }
        });
        var label = document.getElementById("mp-style-label");
        if (label) label.textContent = "Default";
        var resetBtn = document.getElementById("btn-mp-reset-style");
        if (resetBtn) resetBtn.style.display = "none";
    }

    function mpInit() {
        _initRefs();
        mpUpdateServerUI();
        mpCheckServerStatus();
        mpUpdateAnalyzeButton();
        mpBindStepHeaders();
        mpInitStyleImport();

        // On init, restart server to ensure clean state
        if (motionPro) {
            motionPro.stopServer();
            mpUpdateServerUI();
            var extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);
            motionPro.startServer(extensionPath, function(err) {
                if (!err) {
                    mpUpdateServerUI();
                }
            });
        }

        // Resolve session from active sequence, then load state + render UI
        mpResolveOutputDir(function() {
            mpRenderFullUI();
        });
    }

    function mpBindStepHeaders() {
        document.querySelectorAll(".mp-step-header").forEach(function(hdr) {
            hdr.addEventListener("click", function() {
                var stepNum = hdr.getAttribute("data-mp-step");
                mpToggleStep(stepNum);
            });
        });
    }

    function mpToggleStep(stepNum) {
        var body = document.getElementById("mp-step-body-" + stepNum);
        if (!body) return;
        var isHidden = body.classList.contains("hidden");

        if (isHidden) {
            document.querySelectorAll("[id^='mp-step-body-']").forEach(function(b) {
                b.classList.add("hidden");
            });
            document.querySelectorAll(".mp-step-header .rec-step-arrow").forEach(function(a) {
                a.textContent = "▸";
            });
            body.classList.remove("hidden");
            var arrow = body.previousElementSibling.querySelector(".rec-step-arrow");
            if (arrow) arrow.textContent = "▾";
        } else {
            body.classList.add("hidden");
            var arrow2 = body.previousElementSibling.querySelector(".rec-step-arrow");
            if (arrow2) arrow2.textContent = "▸";
        }
    }

    function mpShowStep(num) {
        var el = document.getElementById(num === 2 ? "mp-proposals-section" : num === 3 ? "mp-control-section" : null);
        if (el) el.style.display = "";
    }

    // ─── Style Import Initialization ─────────────────────────────

    function mpInitStyleImport() {
        var importBtn = document.getElementById("btn-mp-import-style");
        var captureBtn = document.getElementById("btn-mp-capture-frame");
        var fileInput = document.getElementById("mp-style-file-input");
        var resetBtn = document.getElementById("btn-mp-reset-style");

        // Capture current frame from Premiere → AI vision palette (canvas fallback)
        if (captureBtn) {
            captureBtn.addEventListener("click", function() {
                captureBtn.textContent = "⏳ Capturando...";
                captureBtn.disabled = true;
                csInterface.evalScript('exportCurrentFrame()', function(res) {
                    try {
                        var result = JSON.parse(res);
                        if (result.error) {
                            captureBtn.textContent = "📷 Capturar Frame";
                            captureBtn.disabled = false;
                            showToast("Error al capturar: " + result.error, "error");
                            return;
                        }
                        if (result.path) {
                            // Copy frame to Motion-Pro session folder
                            if (_mpOutputDir && fs) {
                                try {
                                    var refDir = path.join(_mpOutputDir, "reference");
                                    if (!fs.existsSync(refDir)) fs.mkdirSync(refDir, {recursive:true});
                                    var destPath = path.join(refDir, "style-reference.png");
                                    fs.copyFileSync(result.path, destPath);
                                } catch(copyErr) { console.warn("Could not copy reference frame:", copyErr.message); }
                            }

                            // Just save as reference — don't analyze yet
                            try {
                                var imgData = fs.readFileSync(result.path);
                                var base64 = imgData.toString('base64');
                                _referenceImages.push({ base64: base64, name: "Frame capturado" });
                                // Show thumbnail
                                var refsContainer = document.getElementById("mp-style-refs");
                                if (refsContainer) {
                                    var thumb = document.createElement('img');
                                    thumb.src = "data:image/png;base64," + base64;
                                    thumb.style.cssText = 'width:30px; height:30px; border-radius:3px; object-fit:cover; border:1px solid rgba(255,255,255,0.15);';
                                    thumb.title = "Frame capturado";
                                    refsContainer.appendChild(thumb);
                                }
                                // Enable analyze button
                                var anBtn = document.getElementById("btn-mp-analyze-palette");
                                if (anBtn) { anBtn.style.opacity = '1'; anBtn.style.pointerEvents = 'auto'; }
                                captureBtn.textContent = "📷 Capturar Frame";
                                captureBtn.disabled = false;
                                showToast("Frame capturado — click 🎨 Analizar para generar paleta", "success");
                            } catch(readErr) {
                                captureBtn.textContent = "📷 Capturar Frame";
                                captureBtn.disabled = false;
                                showToast("Error al leer frame: " + readErr.message, "error");
                            }
                        }
                    } catch(e) {
                        captureBtn.textContent = "📷 Capturar Frame";
                        captureBtn.disabled = false;
                        showToast("Error: " + e.message, "error");
                    }
                });
            });
        }

        if (importBtn && fileInput) {
            importBtn.addEventListener("click", function() {
                fileInput.click();
            });

            fileInput.addEventListener("change", function(evt) {
                var files = Array.from(evt.target.files || []);
                if (files.length === 0) return;

                var refsContainer = document.getElementById("mp-style-refs");
                // Don't clear — append to existing references
                var totalFiles = files.length;
                var loaded = 0;

                if (importBtn) importBtn.textContent = "🎨 Analizando...";

                files.forEach(function(file) {
                    var reader = new FileReader();
                    reader.onload = function(e) {
                        var dataUrl = e.target.result;
                        var base64 = dataUrl.split(',')[1];
                        _referenceImages.push({ base64: base64, name: file.name });

                        // Show thumbnail
                        if (refsContainer) {
                            var thumb = document.createElement('img');
                            thumb.src = dataUrl;
                            thumb.style.cssText = 'width:30px; height:30px; border-radius:3px; object-fit:cover; border:1px solid rgba(255,255,255,0.15);';
                            thumb.title = file.name;
                            refsContainer.appendChild(thumb);
                        }

                        loaded++;
                        // When all files loaded, show analyze button
                        if (loaded === totalFiles) {
                            if (importBtn) importBtn.textContent = "📁 Importar";
                            var analyzeBtn = document.getElementById("btn-mp-analyze-palette");
                            if (analyzeBtn) { analyzeBtn.style.opacity = '1'; analyzeBtn.style.pointerEvents = 'auto'; }
                            showToast(_referenceImages.length + " referencia(s) cargada(s) — click 🎨 Analizar Paleta", "success");
                        }
                    };
                    reader.readAsDataURL(file);
                });
                // Reset input so re-selecting same file triggers change
                fileInput.value = "";
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener("click", function() {
                state.customPalette = null;
                if (motionPro) motionPro.customPalette = null;
                localStorage.removeItem("mp_custom_palette");
                _mpResetStyleSwatches();
                _referenceImages = [];
                var refsC = document.getElementById("mp-style-refs");
                if (refsC) refsC.innerHTML = "";
                var analyzeB = document.getElementById("btn-mp-analyze-palette");
                if (analyzeB) { analyzeB.style.opacity = '0.4'; analyzeB.style.pointerEvents = 'none'; }
                showToast("Paleta restaurada a default", "info");
                if (window.EPLogger) EPLogger.log("motion-pro", "style-reset", "default palette");
            });
        }

        // Click swatch → native color picker (no prompt())
        var _colorInput = document.getElementById('mp-hidden-color-picker') || document.createElement('input');
        _colorInput.id = 'mp-hidden-color-picker';
        _colorInput.type = 'color';
        _colorInput.style.cssText = 'position:absolute;opacity:0;width:0;height:0;pointer-events:none;';
        if (!_colorInput.parentNode) document.body.appendChild(_colorInput);
        var _activeSwatchKey = null;

        var hexInput = document.getElementById('mp-hex-input');
        
        document.querySelectorAll('.mp-swatch').forEach(function(sw) {
            sw.addEventListener('click', function() {
                _activeSwatchKey = sw.getAttribute('data-color-key');
                var currentHex = _rgbToHexFromStyle(sw.style.background || '#000000');
                
                // Show HEX input
                if (hexInput) {
                    hexInput.style.display = '';
                    hexInput.value = currentHex;
                    hexInput.focus();
                    hexInput.select();
                }
                
                // Don't open native color picker — use HEX input only
            });
        });
        
        // HEX input handler
        if (hexInput) {
            hexInput.addEventListener('change', function() {
                var hex = hexInput.value.trim();
                if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
                    if (/^[0-9a-fA-F]{6}$/.test(hex)) hex = '#' + hex;
                    else return;
                }
                if (_activeSwatchKey) {
                    var sw = document.querySelector('.mp-swatch[data-color-key="' + _activeSwatchKey + '"]');
                    if (sw) sw.style.background = hex;
                    if (!state.customPalette) state.customPalette = {};
                    state.customPalette[_activeSwatchKey] = hex;
                    if (_activeSwatchKey === 'accent') state.customPalette.green = hex;
                    if (motionPro) motionPro.customPalette = state.customPalette;
                    localStorage.setItem("mp_custom_palette", JSON.stringify(state.customPalette));
                    var label = document.getElementById("mp-style-label");
                    if (label) label.textContent = "Personalizado";
                }
            });
            hexInput.addEventListener('blur', function() {
                hexInput.style.display = 'none';
            });
        }

        _colorInput.addEventListener('input', function() {
            if (!_activeSwatchKey) return;
            var hex = _colorInput.value;
            var sw = document.querySelector('.mp-swatch[data-color-key="' + _activeSwatchKey + '"]');
            if (sw) sw.style.background = hex;
            if (!state.customPalette) state.customPalette = {};
            state.customPalette[_activeSwatchKey] = hex;
            if (_activeSwatchKey === 'accent') state.customPalette.green = hex;
            if (motionPro) motionPro.customPalette = state.customPalette;
            localStorage.setItem("mp_custom_palette", JSON.stringify(state.customPalette));
            var label = document.getElementById("mp-style-label");
            if (label) label.textContent = "Personalizado";
        });

        // Analyze Palette button — sends all references to AI
        var analyzeBtn = document.getElementById("btn-mp-analyze-palette");
        if (analyzeBtn) {
            analyzeBtn.addEventListener("click", function() {
                if (_referenceImages.length === 0) {
                    showToast("Primero captura un frame o importa imágenes de referencia", "error");
                    return;
                }
                analyzeBtn.textContent = "🎨 Analizando...";
                analyzeBtn.disabled = true;

                var callback = function(err, palette, reasoning) {
                    analyzeBtn.textContent = "🎨 Analizar Paleta";
                    analyzeBtn.disabled = false;
                    if (err) {
                        showToast("Error al analizar: " + err.message, "error");
                        return;
                    }
                    _applyPalette(palette);
                    if (reasoning) showToast("🎨 " + reasoning.substring(0, 100), "info");
                    if (window.EPLogger) EPLogger.log("motion-pro", "palette-analyzed", "bg=" + palette.bg + " accent=" + palette.accent);
                };

                if (_referenceImages.length === 1) {
                    _extractPaletteAI(_referenceImages[0].base64, callback);
                } else {
                    _extractPaletteAIMultiple(_referenceImages, callback);
                }
            });

            // Show analyze button if references already loaded
            if (_referenceImages.length > 0) analyzeBtn.style.display = "";
        }

        // Load saved palette on init
        var savedPalette = localStorage.getItem("mp_custom_palette");
        if (savedPalette) {
            try {
                var palette = JSON.parse(savedPalette);
                state.customPalette = palette;
                if (motionPro) motionPro.customPalette = palette;
                _mpUpdateStyleSwatches(palette);
            } catch (e) { /* ignore corrupt data */ }
        }
    }

    function _rgbToHexFromStyle(style) {
        if (style.startsWith('#')) return style;
        var match = style.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            return '#' + [match[1], match[2], match[3]].map(function(v) {
                return parseInt(v).toString(16).padStart(2, '0');
            }).join('');
        }
        return '#000000';
    }

    // ─── Server management ────────────────────────────────────────

    function mpCheckServerStatus() {
        if (!motionPro) return;
        motionPro.checkServer(function(running) {
            mpUpdateServerUI();
        });
    }

    function mpToggleServer() {
        if (motionPro.serverRunning) {
            if (window.EPLogger) EPLogger.log("motion-pro", "server-stop", "");
            motionPro.stopServer();
            mpUpdateServerUI();
            showToast("Servidor Motion-Pro detenido", "info");
        } else {
            if (window.EPLogger) EPLogger.log("motion-pro", "server-start", "");
            var extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);
            var btn = document.getElementById("btn-mp-server-toggle");
            if (btn) { btn.textContent = "Iniciando..."; btn.disabled = true; }

            motionPro.startServer(extensionPath, function(err, ok) {
                if (btn) btn.disabled = false;
                if (err) {
                    if (window.EPLogger) EPLogger.error("motion-pro", "server-start", err);
                    showToast("Error al iniciar servidor: " + err.message, "error");
                } else {
                    if (window.EPLogger) EPLogger.log("motion-pro", "server-started", "ok");
                    showToast("Servidor Motion-Pro iniciado", "success");
                }
                mpUpdateServerUI();
            });
        }
    }

    function mpUpdateServerUI() {
        var dot = document.getElementById("mp-server-indicator");
        var text = document.getElementById("mp-server-text");
        var btn = document.getElementById("btn-mp-server-toggle");
        var running = motionPro && motionPro.serverRunning;

        if (dot) {
            dot.classList.toggle("mp-dot-on", running);
            dot.classList.toggle("mp-dot-off", !running);
        }
        if (text) text.textContent = running ? "Servidor activo (:" + MotionPro.SERVER_PORT + ")" : "Servidor detenido";
        if (btn) btn.textContent = running ? "Detener" : "Iniciar";
    }

    // ─── Analysis ─────────────────────────────────────────────────

    function mpUpdateAnalyzeButton() {
        var btn = document.getElementById("btn-mp-analyze");
        var warn = document.getElementById("mp-no-transcript");
        var hasTranscript = state.transcript && state.transcript.trim().length > 0;
        if (state.mpAnalyzing) return;
        if (btn) btn.classList.toggle("btn-disabled", !hasTranscript);
        if (warn) warn.classList.toggle("hidden", hasTranscript);
    }

    var _mpAnalysisHeartbeat = null;
    var _mpAnalysisCancelled = false;

    function mpClearMotionAnalysisHeartbeat() {
        if (_mpAnalysisHeartbeat) {
            clearInterval(_mpAnalysisHeartbeat);
            _mpAnalysisHeartbeat = null;
        }
    }

    function mpSetMotionAnalyzeButtonMode(analyzing) {
        var btn = document.getElementById("btn-mp-analyze");
        if (!btn) return;
        var textEl = btn.querySelector(".btn-analyze-text");
        if (analyzing) {
            btn.classList.remove("btn-disabled");
            btn.classList.add("btn-analyze-cancel");
            if (textEl) textEl.textContent = "Detener análisis";
        } else {
            btn.classList.remove("btn-analyze-cancel");
            if (textEl) textEl.textContent = "Analizar para Motions";
            mpUpdateAnalyzeButton();
        }
    }

    // Premiere label color indices by motion type
    // 0=Violet, 1=Iris, 2=Caribbean, 3=Lavender, 4=Cerulean, 5=Forest
    // 6=Rose, 7=Mango, 8=Purple, 9=Blue, 10=Teal, 11=Magenta, 12=Tan, 13=Green, 14=Brown, 15=Yellow
    function _mpLabelColorForType(type) {
        var map = {
            title: 4,        // Cerulean (blue)
            reveal: 8,       // Purple
            callout: 11,     // Magenta
            comparison: 7,   // Mango (orange)
            beforeafter: 6,  // Rose (pink)
            steps: 13,       // Green
            icons: 15,       // Yellow
            cards: 2,        // Caribbean (teal)
            diagram: 5,      // Forest (dark green)
            funnel: 14,      // Brown
            chart: 3,        // Lavender
            metrics: 0,      // Violet
            list: 10,        // Teal
            timeline: 1,     // Iris
            ui: 12,          // Tan
        };
        return map[(type || "").toLowerCase()] !== undefined ? map[(type || "").toLowerCase()] : 4;
    }

    function _mpBuildSeqPrefix() {
        var name = state.sequenceName || "";
        if (!name) return "mp";
        // Extract first two parts: "13_2603_curso..." → "13-2603"
        var parts = name.split(/[_\-\s]+/);
        var prefix = "";
        if (parts.length >= 2) {
            prefix = parts[0] + "-" + parts[1];
        } else if (parts.length === 1) {
            prefix = parts[0];
        }
        // Sanitize: only a-z, 0-9, hyphens (Remotion compatible)
        prefix = prefix.replace(/[^a-zA-Z0-9-]/g, "").substring(0, 12);
        return prefix || "mp";
    }

    // ─── Brandfetch Logo API ──────────────────────────────────────

    var _mpBrandfetchKey = "";

    function mpSaveBrandfetchKey() {
        var input = document.getElementById("mp-brandfetch-key");
        var key = input ? input.value.trim() : "";
        if (key) {
            localStorage.setItem("editorpro_brandfetch_key", key);
            _mpBrandfetchKey = key;
            if (input) input.value = "";
            showToast("Brandfetch key guardada", "success");
        } else {
            localStorage.removeItem("editorpro_brandfetch_key");
            _mpBrandfetchKey = "";
            showToast("Brandfetch key eliminada", "info");
        }
        mpUpdateBrandfetchUI();
    }

    function mpLoadBrandfetchKey() {
        _mpBrandfetchKey = localStorage.getItem("editorpro_brandfetch_key") || "";
        mpUpdateBrandfetchUI();
    }

    function mpUpdateBrandfetchUI() {
        var dot = document.getElementById("mp-brandfetch-dot");
        var text = document.getElementById("mp-brandfetch-text");
        var hasKey = _mpBrandfetchKey && _mpBrandfetchKey.length > 3;
        if (dot) {
            dot.classList.toggle("mp-dot-on", hasKey);
            dot.classList.toggle("mp-dot-off", !hasKey);
        }
        if (text) text.textContent = hasKey ? "Logos activos" : "Sin configurar";
    }

    function mpGetBrandfetchKey() {
        return _mpBrandfetchKey || "";
    }

    function _mpGetFeedbackDir() {
        if (!_mpOutputDir) return null;
        var dir = path.join(_mpOutputDir, "feedback");
        try {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            return dir;
        } catch(e) { return null; }
    }

    // ─── Generation Prompts Panel ───────────────────────────────

    function mpToggleGenPromptsPanel() {
        var body = document.getElementById("mp-gen-prompts-body");
        var icon = document.getElementById("mp-gen-prompts-icon");
        if (!body) return;
        var hidden = body.classList.contains("hidden");
        body.classList.toggle("hidden");
        if (icon) icon.textContent = hidden ? "▾" : "▸";
        if (hidden) mpLoadGenPrompts();
    }

    function mpBindGenPromptAccordions() {
        document.querySelectorAll(".mp-gp-item-header").forEach(function(hdr) {
            hdr.addEventListener("click", function() {
                var key = hdr.getAttribute("data-mp-gp");
                var body = document.querySelector('[data-mp-gp-body="' + key + '"]');
                var arrow = hdr.querySelector(".mp-gp-item-arrow");
                if (!body) return;
                var hidden = body.classList.contains("hidden");
                body.classList.toggle("hidden");
                if (arrow) arrow.textContent = hidden ? "▾" : "▸";
            });
        });
    }

    function mpLoadGenPrompts() {
        if (!motionPro || !motionPro.serverRunning) {
            showToast("Inicia el servidor primero para cargar los prompts", "info");
            return;
        }
        motionPro._get("/api/prompts", function(err, data) {
            if (err || !data) {
                showToast("Error al cargar prompts: " + (err ? err.message : "sin datos"), "error");
                return;
            }
            var sysEl = document.getElementById("mp-gp-system");
            var styleEl = document.getElementById("mp-gp-style");
            var designEl = document.getElementById("mp-gp-design");
            var typesEl = document.getElementById("mp-gp-types");
            if (sysEl) sysEl.value = data.system || "";
            if (styleEl) styleEl.value = data.style || "";
            if (designEl) designEl.value = data.design || "";
            if (typesEl) { typesEl.value = data.types || ""; typesEl.readOnly = true; }
        });
    }

    function mpSaveGenPrompts() {
        if (!motionPro || !motionPro.serverRunning) {
            showToast("Inicia el servidor primero", "error");
            return;
        }
        var sysEl = document.getElementById("mp-gp-system");
        var styleEl = document.getElementById("mp-gp-style");
        var designEl = document.getElementById("mp-gp-design");

        var body = {};
        if (sysEl) body.system = sysEl.value;
        if (styleEl) body.style = styleEl.value;
        if (designEl) body.design = designEl.value;

        motionPro._post("/api/prompts", body, function(err, result) {
            if (err || (result && result.error)) {
                showToast("Error al guardar: " + (err ? err.message : result.error), "error");
            } else {
                showToast("Prompts guardados. El servidor recargó las reglas.", "success");
            }
        });
    }

    function mpResetGenPrompts() {
        var extRoot = csInterface.getSystemPath(SystemPath.EXTENSION);
        var originals = [
            { central: "system.md", local: "SYSTEM_PROMPT.md" },
            { central: "style-guide.md", local: "STYLE_GUIDE.md" },
            { central: "design-fundamentals.md", local: "DESIGN_FUNDAMENTALS.md" }
        ];
        try {
            var promptsDir = path.join(extRoot, "Prompts", "MotionPro");
            var serverLib = path.join(extRoot, "motion-server", "lib");
            originals.forEach(function(o) {
                // Restore from the canonical source in Prompts/MotionPro → motion-server/lib
                var centralPath = path.join(promptsDir, o.central);
                var localPath = path.join(serverLib, o.local);
                if (fs.existsSync(centralPath)) {
                    fs.copyFileSync(centralPath, localPath);
                }
            });
            showToast("Prompts restaurados a los originales", "success");
            mpLoadGenPrompts();
        } catch(e) {
            showToast("Error al restaurar: " + e.message, "error");
        }
    }

    function mpMovePlayhead(timeSecs) {
        csInterface.evalScript('movePlayhead(' + parseFloat(timeSecs) + ')', function(res) {
            try {
                var r = JSON.parse(res);
                if (r.error) console.warn("[Motion-Pro] movePlayhead:", r.error);
            } catch(e) {}
        });
    }

    function mpStartAnalysis() {
        if (state.mpAnalyzing) {
            if (window.EPLogger) EPLogger.log("motion-pro", "analysis-cancel", "user cancelled");
            _mpAnalysisCancelled = true;
            aiAnalyzer.abort();
            mpClearMotionAnalysisHeartbeat();
            state.mpAnalyzing = false;
            hideElement("mp-analyze-progress");
            refreshMPHeaderProgressVisibility();
            mpSetMotionAnalyzeButtonMode(false);
            showToast("Análisis detenido", "info");
            return;
        }
        if (!state.transcript || state.transcript.trim().length === 0) {
            showToast("Carga una transcripción primero", "error");
            return;
        }
        if (!aiAnalyzer.isConfigured()) {
            showToast("Configura un proveedor de IA en Settings", "error");
            return;
        }

        if (window.EPLogger) EPLogger.log("motion-pro", "analysis-start", "transcriptLen=" + state.transcript.length);
        _mpTimers.totalStart = Date.now();
        _mpTimers.analysisStart = Date.now();
        _mpAnalysisCancelled = false;
        state.mpAnalyzing = true;
        mpSetMotionAnalyzeButtonMode(true);

        motionPro.proposals = [];
        motionPro.motions = [];
        motionPro.saveState();

        var proposalList = document.getElementById("mp-proposal-list");
        if (proposalList) proposalList.innerHTML = "";
        hideElement("mp-proposals-summary");
        var proposalsSection = document.getElementById("mp-proposals-section");
        if (proposalsSection) proposalsSection.style.display = "none";

        var motionsList = document.getElementById("mp-motions-list");
        if (motionsList) motionsList.innerHTML = "";
        hideElement("mp-motions-summary");
        var controlSection = document.getElementById("mp-control-section");
        if (controlSection) controlSection.style.display = "none";

        showElement("mp-analyze-progress");
        mpSetProgress("mp-analyze", 15, "Analizando transcripción… (puede tardar varios minutos en clases largas)");

        var tick = 0;
        mpClearMotionAnalysisHeartbeat();
        _mpAnalysisHeartbeat = setInterval(function() {
            tick++;
            var elapsed = tick * 15;
            var pct = Math.min(15 + tick * 3, 42);
            mpSetProgress("mp-analyze", pct, "Analizando… ~" + elapsed + "s — si tarda demasiado, prueba IA en la nube en Ajustes o pulsa Detener");
        }, 15000);

        var timedTranscript = buildTimedTranscript();

        // Enhance transcript with rhythm analysis
        if (state.transcriptJson && motionPro.serverRunning) {
            try {
                motionPro._post("/api/rhythm", { transcriptJson: state.transcriptJson }, function(err, rhythmResult) {
                    if (!err && rhythmResult && rhythmResult.promptText) {
                        timedTranscript += rhythmResult.promptText;
                        if (window.EPLogger) EPLogger.log("motion-pro", "rhythm-analysis",
                            (rhythmResult.summary.pauseCount || 0) + " pauses, " +
                            (rhythmResult.summary.topicChangeCount || 0) + " topic changes, " +
                            (rhythmResult.summary.emphasisCount || 0) + " emphasis points");
                    }
                    _mpRunAnalysis(timedTranscript);
                });
            } catch(e) {
                console.warn("[Motion-Pro] Rhythm analysis failed:", e.message);
                _mpRunAnalysis(timedTranscript);
            }
        } else {
            _mpRunAnalysis(timedTranscript);
        }

        function _mpRunAnalysis(transcript) {

        aiAnalyzer.analyzeMotionProposals(transcript, getPromptContext("mp"), function(result) {
            mpClearMotionAnalysisHeartbeat();
            if (_mpAnalysisCancelled) return;
            state.mpAnalyzing = false;
            mpSetMotionAnalyzeButtonMode(false);
            hideElement("mp-analyze-progress");
            refreshMPHeaderProgressVisibility();

            if (result && result.error) {
                if (window.EPLogger) EPLogger.error("motion-pro", "analysis-complete", result.error);
                showToast("Error en análisis: " + result.error, "error");
                return;
            }

            if (window.EPLogger) EPLogger.log("motion-pro", "analysis-complete", "parsing proposals — result type: " + typeof result + " length: " + (typeof result === "string" ? result.length : JSON.stringify(result).length));
            if (window.EPLogger) EPLogger.log("motion-pro", "raw-result-preview", (typeof result === "string" ? result.substring(0, 200) : JSON.stringify(result).substring(0, 200)));
            var analysisTime = ((Date.now() - _mpTimers.analysisStart) / 1000).toFixed(1);
            var proposals = [];
            try {
                var parsed = (typeof result === "string") ? JSON.parse(result) : result;
                var arr = parsed.proposals || parsed.moments || parsed;
                if (!Array.isArray(arr)) arr = [arr];

                var seqPrefix = _mpBuildSeqPrefix();

                for (var i = 0; i < arr.length; i++) {
                    var p = arr[i];
                    var pType = (p.type || p.tipo || "title").toLowerCase();
                    var clipNum = String(i + 1).length < 2 ? "0" + (i + 1) : String(i + 1);
                    var pId = clipNum + "-" + pType + "-" + seqPrefix;
                    proposals.push({
                        id: pId,
                        startTime: parseFloat(p.startTime || p.timestamp_start || p.start || 0),
                        endTime: parseFloat(p.endTime || p.timestamp_end || p.end || 0),
                        type: pType,
                        description: p.description || p.descripcion || "",
                        priority: p.priority || p.prioridad || "media",
                        selected: true,
                        transcriptSegment: p.transcriptSegment || p.segment || "",
                        group: p.group || p.grupo || ""
                    });
                }

                // Sort by time and fix overlaps (but DON'T force zero-gap)
                proposals.sort(function(a, b) { return a.startTime - b.startTime; });
                for (var ov = 1; ov < proposals.length; ov++) {
                    if (proposals[ov].startTime < proposals[ov - 1].endTime) {
                        proposals[ov - 1].endTime = proposals[ov].startTime;
                    }
                }

                // Simple gap fill: extend each clip's endTime to next clip's startTime
                for (var g = 0; g < proposals.length - 1; g++) {
                    var gapSize = proposals[g + 1].startTime - proposals[g].endTime;
                    if (gapSize > 0.2) {
                        // Extend previous clip to fill the gap
                        proposals[g].endTime = proposals[g + 1].startTime;
                    }
                }
            } catch(e) {
                showToast("ERROR PARSING: " + e.message, "error");
                if (window.EPLogger) EPLogger.error("motion-pro", "parse-error", e.message + " | " + e.stack);
                console.error("[Motion-Pro] PARSE ERROR:", e.message, e.stack);
                return;
            }

            // Post-process validation of proposals
            try { proposals.forEach(function(p, i) {
                // Fix 1: reveal with 1 item → callout
                if (p.type === 'reveal' && p.description && p.description.split(',').length <= 1) {
                    var wordCount = (p.transcriptSegment || '').split(' ').length;
                    if (wordCount < 20) {
                        p.type = 'callout';
                        var clipNum = String(i + 1).length < 2 ? "0" + (i + 1) : String(i + 1);
                        p.id = clipNum + "-callout-" + seqPrefix;
                    }
                }
                // Fix 2: gauge → metrics (gauge template removed)
                if (p.type === 'gauge') {
                    p.type = 'metrics';
                    var clipNum2 = String(i + 1).length < 2 ? "0" + (i + 1) : String(i + 1);
                    p.id = clipNum2 + "-metrics-" + seqPrefix;
                }
                // Fix 3: ui → cards (ui template inappropriate for educational content)
                if (p.type === 'ui') {
                    p.type = 'cards';
                    var clipNum3 = String(i + 1).length < 2 ? "0" + (i + 1) : String(i + 1);
                    p.id = clipNum3 + "-cards-" + seqPrefix;
                }
            }); } catch(valErr) {
                console.error("[Motion-Pro] Validation error:", valErr.message);
                if (window.EPLogger) EPLogger.error("motion-pro", "validation-error", valErr.message);
            }

            console.log("[Motion-Pro] Proposals parsed:", proposals.length, "after negotiation+validation");
            motionPro.proposals = proposals;
            motionPro.saveState();
            mpShowStep(2);
            if (window.EPLogger) EPLogger.log("motion-pro", "pre-render", "about to render " + proposals.length + " proposals");
            try {
                mpRenderProposals();
            } catch(renderErr) {
                if (window.EPLogger) EPLogger.error("motion-pro", "render-proposals-crash", renderErr.message + " | " + renderErr.stack);
                showToast("ERROR rendering proposals: " + renderErr.message, "error");
            }
            mpToggleStep("2");

            var hint = document.getElementById("mp-step-hint-1");
            if (hint) hint.textContent = proposals.length + " momentos (" + analysisTime + "s)";
            showToast(proposals.length + " momentos identificados para motions", "success");
        });
        } // end _mpRunAnalysis
    }

    // ─── Proposals rendering ──────────────────────────────────────

    var _mpTypeFilter = null;

    function mpRenderProposals() {
        var list = clearContainer(document.getElementById("mp-proposal-list"));
        if (!list) return;

        var proposals = motionPro.proposals;

        // Type counts + filter bar
        if (proposals.length > 0) {
            var typeCounts = {};
            var totalDuration = 0;
            var priorityCounts = { alta: 0, media: 0, baja: 0 };
            for (var t = 0; t < proposals.length; t++) {
                var tp = proposals[t].type || "title";
                typeCounts[tp] = (typeCounts[tp] || 0) + 1;
                totalDuration += (proposals[t].endTime - proposals[t].startTime) || 0;
                var pri = proposals[t].priority || "media";
                if (priorityCounts[pri] !== undefined) priorityCounts[pri]++;
            }

            var filterBar = document.createElement("div");
            filterBar.className = "es2-counts-bar st2-filter-bar mp-filter-bar";

            var typeKeys = Object.keys(MotionPro.TYPES);
            typeKeys.forEach(function(typeKey) {
                if (!typeCounts[typeKey]) return;
                var info = MotionPro.TYPES[typeKey] || { label: typeKey, color: "#888" };
                var tag = document.createElement("span");
                tag.className = "st2-filter-tag" + (_mpTypeFilter === typeKey ? " st2-filter-active" : "");
                tag.style.color = info.color;
                tag.style.borderColor = (_mpTypeFilter === typeKey) ? info.color + "66" : "transparent";
                tag.style.cursor = "pointer";
                tag.textContent = typeCounts[typeKey] + " " + info.label;
                (function(type) {
                    tag.addEventListener("click", function(e) {
                        e.stopPropagation();
                        _mpTypeFilter = (_mpTypeFilter === type) ? null : type;
                        mpRenderProposals();
                    });
                })(typeKey);
                filterBar.appendChild(tag);
            });

            if (_mpTypeFilter) {
                var clearTag = document.createElement("span");
                clearTag.className = "st2-filter-tag st2-filter-clear";
                clearTag.textContent = "✕ Todos";
                clearTag.style.cursor = "pointer";
                clearTag.addEventListener("click", function(e) {
                    e.stopPropagation();
                    _mpTypeFilter = null;
                    mpRenderProposals();
                });
                filterBar.appendChild(clearTag);
            }

            list.appendChild(filterBar);

            // Summary line
            var summaryLine = document.createElement("div");
            summaryLine.className = "mp-summary-line";
            summaryLine.innerHTML =
                '<span>' + proposals.length + ' momentos</span>' +
                '<span class="mp-summary-sep">·</span>' +
                '<span>' + Math.round(totalDuration) + 's de motions</span>' +
                '<span class="mp-summary-sep">·</span>' +
                '<span class="mp-priority-high">' + priorityCounts.alta + ' alta</span>' +
                '<span class="mp-priority-med">' + priorityCounts.media + ' media</span>' +
                '<span class="mp-priority-low">' + priorityCounts.baja + ' baja</span>';
            list.appendChild(summaryLine);
        }

        // Filter proposals
        var filtered = proposals;
        if (_mpTypeFilter) {
            filtered = [];
            for (var f = 0; f < proposals.length; f++) {
                if ((proposals[f].type || "title") === _mpTypeFilter) filtered.push(proposals[f]);
            }
        }

        // Group proposals by concept group
        var groups = {};
        var groupOrder = [];
        for (var gi = 0; gi < filtered.length; gi++) {
            var gp = filtered[gi];
            var groupName = gp.group || "Otros";
            if (!groups[groupName]) {
                groups[groupName] = [];
                groupOrder.push(groupName);
            }
            groups[groupName].push(gp);
        }

        // Render grouped cards
        for (var gIdx = 0; gIdx < groupOrder.length; gIdx++) {
            var grpName = groupOrder[gIdx];
            var grpItems = groups[grpName];

            // Group header with checkbox
            var groupHeader = document.createElement("div");
            groupHeader.className = "mp-group-header";
            groupHeader.innerHTML =
                '<label class="mp-group-check">' +
                    '<input type="checkbox" data-mp-group="' + escAttr(grpName) + '" checked>' +
                '</label>' +
                '<span class="mp-group-icon">📦</span>' +
                '<span class="mp-group-name">' + esc(grpName) + '</span>' +
                '<span class="mp-group-count">(' + grpItems.length + ')</span>';

            var groupCb = groupHeader.querySelector("input[type=checkbox]");
            (function(gName, items) {
                // Check if all items in group are selected
                var allSel = true;
                for (var ci = 0; ci < items.length; ci++) {
                    if (!items[ci].selected) { allSel = false; break; }
                }
                groupCb.checked = allSel;

                groupCb.addEventListener("change", function() {
                    var checked = this.checked;
                    for (var ci = 0; ci < items.length; ci++) {
                        var idx = proposals.indexOf(items[ci]);
                        if (idx >= 0) motionPro.proposals[idx].selected = checked;
                    }
                    motionPro.saveState();
                    mpRenderProposals();
                });
            })(grpName, grpItems);

            list.appendChild(groupHeader);

            // Render cards in this group
            for (var i = 0; i < grpItems.length; i++) {
                var p = grpItems[i];
                var origIdx = proposals.indexOf(p);

                var typeInfo = MotionPro.TYPES[p.type] || { label: p.type, color: "#818cf8" };
                var priorityClass = p.priority === "alta" ? "mp-priority-high" : p.priority === "baja" ? "mp-priority-low" : "mp-priority-med";

                var card = document.createElement("div");
                card.className = "mp-proposal-card mp-grouped-card";
                card.setAttribute("data-mp-idx", origIdx);
                card.setAttribute("data-mp-group", grpName);
                card.innerHTML =
                    '<label class="mp-proposal-check">' +
                        '<input type="checkbox" ' + (p.selected ? 'checked' : '') + ' data-mp-idx="' + origIdx + '">' +
                    '</label>' +
                    '<div class="mp-proposal-info">' +
                        '<div class="mp-proposal-top">' +
                            '<span class="mp-type-badge" data-type="' + esc(p.type) + '" style="background:' + typeInfo.color + '22;color:' + typeInfo.color + ';border:1px solid ' + typeInfo.color + '44">' + esc(typeInfo.label) + '</span>' +
                            '<span class="mp-clip-name">' + esc("Clip" + (String(origIdx+1).length < 2 ? "0"+(origIdx+1) : String(origIdx+1))) + '</span>' +
                            '<span class="mp-proposal-time">' + formatTimeFull(p.startTime) + ' — ' + formatTimeFull(p.endTime) + '</span>' +
                            '<span class="mp-proposal-dur">' + (p.endTime - p.startTime).toFixed(1) + 's</span>' +
                            '<span class="' + priorityClass + '">' + esc(p.priority) + '</span>' +
                        '</div>' +
                        '<div class="mp-proposal-desc">' + esc(p.description) + '</div>' +
                    '</div>';

                // Hide generated items from selection
                if (p.generated) {
                    card.style.display = 'none';
                }

                var cb = card.querySelector("input[type=checkbox]");
                (function(idx, startTime) {
                    cb.addEventListener("change", function() {
                        motionPro.proposals[idx].selected = this.checked;
                        mpUpdateSelectionCount();
                        motionPro.saveState();
                    });
                    var infoEl = card.querySelector(".mp-proposal-info");
                    if (infoEl) {
                        infoEl.style.cursor = "pointer";
                        infoEl.addEventListener("click", function() {
                            document.querySelectorAll(".mp-proposal-card.mp-card-active").forEach(function(c) {
                                c.classList.remove("mp-card-active");
                            });
                            infoEl.closest(".mp-proposal-card").classList.add("mp-card-active");
                            mpMovePlayhead(startTime);
                        });
                    }
                })(origIdx, p.startTime);

                list.appendChild(card);
            }
        }

        showElement("mp-proposals-summary");
        var countEl = document.getElementById("mp-proposal-count");
        if (countEl) countEl.textContent = proposals.length;
        mpUpdateSelectionCount();
        mpUpdateMotionProEmptyState();
    }

    function mpUpdateMotionProEmptyState() {
        var empty = document.getElementById("mp-empty");
        if (!empty || !motionPro) return;
        var has = (motionPro.proposals && motionPro.proposals.length > 0) ||
            (motionPro.motions && motionPro.motions.length > 0);
        empty.classList.toggle("hidden", !!has);
    }

    function mpUpdateSelectionCount() {
        var count = 0;
        for (var i = 0; i < motionPro.proposals.length; i++) {
            if (motionPro.proposals[i].selected) count++;
        }
        var el = document.getElementById("mp-selected-count");
        if (el) el.textContent = count;
        var btn = document.getElementById("btn-mp-generate");
        if (btn) btn.classList.toggle("btn-disabled", count === 0);
    }

    function mpToggleSelectAll() {
        var proposals = motionPro.proposals;
        var allSelected = true;
        for (var i = 0; i < proposals.length; i++) {
            if (!proposals[i].selected) { allSelected = false; break; }
        }
        var newVal = !allSelected;
        for (var j = 0; j < proposals.length; j++) {
            proposals[j].selected = newVal;
        }
        motionPro.saveState();
        mpRenderProposals();
    }

    // ─── Generation pipeline ──────────────────────────────────────

    var _mpOutputDir = "";
    var _mpSessionName = "";

    function _mpSanitizeName(name) {
        return (name || "unknown").replace(/[^a-zA-Z0-9_-]/g, "-").substring(0, 60);
    }

    function mpResolveOutputDir(callback) {
        csInterface.evalScript("getActiveSequenceInfo()", function(res) {
            try {
                var info = JSON.parse(res);
                if (info.projectPath && info.name) {
                    var projDir = path.dirname(info.projectPath);
                    var mpRoot = path.join(projDir, "Motion-Pro");
                    var sessionName = _mpSanitizeName(info.name);
                    var sessionDir = path.join(mpRoot, sessionName);

                    if (!fs.existsSync(sessionDir)) {
                        fs.mkdirSync(sessionDir, { recursive: true });
                    }

                    _mpOutputDir = sessionDir;
                    _mpSessionName = sessionName;

                    var sessionLabel = document.getElementById("mp-session-name");
                    if (sessionLabel) sessionLabel.textContent = info.name || sessionName;

                    // Switch session in motionPro if sequence changed (not during generation)
                    if (!state.mpGenerating && !state.mpAnalyzing) {
                        if (motionPro.switchSession(sessionName)) {
                            mpRenderFullUI();
                        }
                    }

                    callback(sessionDir);
                    return;
                }
            } catch(e) {}
            _mpOutputDir = "";
            callback("");
        });
    }

    function mpSwitchToSequence() {
        mpResolveOutputDir(function(dir) {
            if (dir) {
                mpRenderFullUI();
            }
        });
    }

    function mpRenderFullUI() {
        // Don't touch UI during active generation/analysis
        if (state.mpGenerating || state.mpAnalyzing) return;

        mpUpdateAnalyzeButton();
        if (motionPro.proposals.length > 0) {
            mpShowStep(2);
            mpRenderProposals();
        } else {
            var proposalsSection = document.getElementById("mp-proposals-section");
            if (proposalsSection) proposalsSection.style.display = "none";
        }
        if (motionPro.motions.length > 0) {
            mpShowStep(3);
            mpRenderControlPanel();
        } else {
            var controlSection = document.getElementById("mp-control-section");
            if (controlSection) controlSection.style.display = "none";
        }
        mpUpdateMotionProEmptyState();
    }

    function mpStartGeneration() {
        if (state.mpGenerating) return;
        if (!motionPro.serverRunning) {
            showToast("Inicia el servidor Motion-Pro primero", "error");
            return;
        }

        var selected = [];
        for (var i = 0; i < motionPro.proposals.length; i++) {
            if (motionPro.proposals[i].selected) selected.push(motionPro.proposals[i]);
        }
        if (selected.length === 0) {
            showToast("Selecciona al menos una propuesta", "error");
            return;
        }

        if (window.EPLogger) EPLogger.log("motion-pro", "generate-start", selected.length + " proposals selected");
        _mpTimers.generateStart = Date.now();
        state.mpGenerating = true;
        state.mpGenerateCancelRequested = false;
        // showElement("mp-generate-progress"); // removed — using inline bar in Step 2 only
        
        mpSetProgress("mp-generate", 5, "Preparando carpeta del proyecto...");

        // Get sequence FPS for Remotion
        var seqFps = 30;
        try {
            csInterface.evalScript('getSequenceFps()', function(fpsResult) {
                try {
                    var parsed = JSON.parse(fpsResult);
                    if (parsed.fps) seqFps = Math.round(parsed.fps);
                } catch(e) {}
            });
        } catch(e) {}

        mpResolveOutputDir(function(outputDir) {
            if (outputDir) {
                showToast("Archivos en: " + outputDir, "info");
            }
            _runGenerationPipeline(selected, outputDir);
        });
    }

    function mpCancelGeneration() {
        if (!state.mpGenerating) return;
        state.mpGenerateCancelRequested = true;
        showToast("Deteniendo… termina el clip en curso y se cancela el resto.", "info");
        var txt = document.getElementById("mp-generate-progress-text");
        if (txt) txt.textContent = "Deteniendo después del clip actual…";
    }

    function _runGenerationPipeline(selected, outputDir) {
        // Ensure custom palette is synced to motionPro before generation
        if (state.customPalette && motionPro) {
            motionPro.customPalette = state.customPalette;
        }

        var aiConfig = {
            provider: state.settings.aiProvider,
            model: state.settings.aiModel,
            apiKey: aiAnalyzer.getActiveKey(),
            brandfetchKey: mpGetBrandfetchKey()
        };

        var total = selected.length;
        var done = 0;
        var errors = [];

        mpShowStep(3);

        // Parallel generation with concurrency limit
        var CONCURRENCY = 1; // Serialize to avoid Root.tsx race conditions (was 2)
        var nextIndex = 0;
        var activeWorkers = 0;

        function _onAllComplete() {
            state.mpGenerateCancelRequested = false;
            state.mpGenerating = false;
            // hideElement("mp-generate-progress"); // removed — using inline bar in Step 2 only
            
            // Hide Step 2 header progress bar
            var step2Wrap = document.getElementById("mp-step2-progress");
            if (step2Wrap) step2Wrap.classList.add("hidden");
            refreshMPHeaderProgressVisibility();
            motionPro.saveState();
            mpRenderControlPanel();

            var totalTime = ((Date.now() - _mpTimers.totalStart) / 1000).toFixed(0);
            var genTime = ((Date.now() - _mpTimers.generateStart) / 1000).toFixed(0);
            var hint3 = document.getElementById("mp-step-hint-3");
            if (hint3) hint3.textContent = "Total: " + totalTime + "s (gen: " + genTime + "s)";

            var hint = document.getElementById("mp-step-hint-2");
            if (hint) hint.textContent = (total - errors.length) + "/" + total + " generados en " + totalTime + "s";

            if (errors.length > 0) {
                if (window.EPLogger) EPLogger.log("motion-pro", "generate-complete", done + "/" + total + " done, " + errors.length + " errors");
                showToast("✅ " + (total - errors.length) + " motions generados en " + totalTime + "s (" + errors.length + " errores)", "error");
            } else {
                if (window.EPLogger) EPLogger.log("motion-pro", "generate-complete", total + "/" + total + " done, 0 errors");
                showToast("✅ " + total + " motions generados en " + totalTime + "s", "success");
            }
        }

        function launchWorker() {
            if (state.mpGenerateCancelRequested) {
                if (activeWorkers === 0) {
                    state.mpGenerateCancelRequested = false;
                    state.mpGenerating = false;
                    // hideElement("mp-generate-progress"); // removed — using inline bar in Step 2 only
                    
                    // Hide Step 2 header progress bar on cancel
                    var step2WrapCancel = document.getElementById("mp-step2-progress");
                    if (step2WrapCancel) step2WrapCancel.classList.add("hidden");
                    refreshMPHeaderProgressVisibility();
                    motionPro.saveState();
                    mpRenderControlPanel();
                    var hint = document.getElementById("mp-step-hint-2");
                    if (hint) hint.textContent = done + "/" + total + " generados (detenido)";
                    showToast("Generación detenida: " + done + " de " + total + " completados.", "info");
                }
                return;
            }

            if (nextIndex >= total) {
                if (activeWorkers === 0) _onAllComplete();
                return;
            }

            var idx = nextIndex++;
            var proposal = selected[idx];
            activeWorkers++;
            _mpTimers.itemStarts[proposal.id] = Date.now();

            var elapsed = ((Date.now() - _mpTimers.generateStart) / 1000).toFixed(0);
            mpSetProgress("mp-generate", Math.round((done / total) * 100),
                "Generando " + done + " de " + total + " completados (" + elapsed + "s)");

            var segment = proposal.transcriptSegment || mpExtractSegment(proposal.startTime, proposal.endTime);

            motionPro.generateMotion(proposal, segment, aiConfig, function(err, result) {
                done++;
                activeWorkers--;

                if (err) {
                    var errMsg = err.message || '';
                    // Retry once on network errors
                    if ((errMsg.includes('ECONNRESET') || errMsg.includes('EPIPE') || errMsg.includes('ECONNREFUSED')) && !proposal._retried) {
                        proposal._retried = true;
                        console.log('[Motion-Pro] Retrying ' + proposal.id + ' after network error...');
                        if (window.EPLogger) EPLogger.log("motion-pro", "retry", proposal.id + " — " + errMsg);
                        done--; // Don't count as done yet
                        activeWorkers++;
                        setTimeout(function() {
                            _mpTimers.itemStarts[proposal.id] = Date.now();
                            motionPro.generateMotion(proposal, segment, aiConfig, function(err2, result2) {
                                done++;
                                activeWorkers--;
                                if (err2) {
                                    errors.push({ id: proposal.id, error: err2.message });
                                    if (window.EPLogger) EPLogger.error("motion-pro", "generate-item", proposal.id + ": " + err2.message + " (retry failed)");
                                    mpSetProgress("mp-generate", Math.round((done / total) * 100), "Error en " + proposal.id + " — continuando...");
                                    launchWorker();
                                } else {
                                    if (window.EPLogger) EPLogger.log("motion-pro", "render-complete", proposal.id + " → " + (result2.motionId || "?") + " (retry success)");
                                    mpSetProgress("mp-generate", Math.round((done / total) * 100), "Colocando " + done + "/" + total + " en timeline...");
                                    mpPlaceSingleInTimeline(result2.motionId, function() {
                                        proposal.generated = true;
                                        motionPro.saveState();
                                        mpRenderControlPanel();
                                        launchWorker();
                                    });
                                }
                            }, outputDir);
                        }, 3000);
                        return;
                    }
                    errors.push({ id: proposal.id, error: err.message });
                    if (window.EPLogger) EPLogger.error("motion-pro", "generate-item", proposal.id + ": " + err.message);
                    console.warn("[Motion-Pro] Generation error:", err.message);
                    mpSetProgress("mp-generate", Math.round((done / total) * 100), "Error en " + proposal.id + " — continuando...");
                    launchWorker(); // Launch next
                } else {
                    if (window.EPLogger) EPLogger.log("motion-pro", "render-complete", proposal.id + " → " + (result.motionId || "?"));
                    mpSetProgress("mp-generate", Math.round((done / total) * 100), "Colocando " + done + "/" + total + " en timeline...");
                    mpPlaceSingleInTimeline(result.motionId, function() {
                        proposal.generated = true;
                        motionPro.saveState();
                        mpRenderControlPanel();
                        launchWorker(); // Launch next
                    });
                }
            }, outputDir);
        }

        // Launch initial batch of workers
        for (var w = 0; w < Math.min(CONCURRENCY, total); w++) {
            launchWorker();
        }
    }

    function mpExtractSegment(startTime, endTime) {
        if (!state.segments || state.segments.length === 0) return state.transcript || "";
        var parts = [];
        for (var i = 0; i < state.segments.length; i++) {
            var seg = state.segments[i];
            var segStart = parseFloat(seg.startTime) || 0;
            var segEnd = parseFloat(seg.endTime) || 0;
            if (segEnd > startTime && segStart < endTime) {
                parts.push("[" + segStart.toFixed(1) + "s] " + (seg.text || ""));
            }
        }
        return parts.length > 0 ? parts.join("\n") : state.transcript || "";
    }

    // ─── Place in timeline ────────────────────────────────────────

    function mpNormalizeMediaPath(p) {
        if (!p || typeof p !== "string") return p;
        var s = p.replace(/^file:\/\//i, "");
        if (s.indexOf("%") !== -1) {
            try { s = decodeURIComponent(s); } catch(e) {}
        }
        return s;
    }

    /** Paths embedded in ExtendScript string literals — escape \\ and " */
    function mpEscapePathForEvalScript(p) {
        if (p === undefined || p === null) return "";
        return String(p).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }

    /** Duración del clip en timeline: no mayor que el vídeo real (evita franja rayada). Resta ~2 frames por redondeo contenedor/Premiere. */
    var MP_TIMELINE_FPS = 30;
    function mpComputeClipDurationSecs(motion, v) {
        var mpStart = Math.max(0, motion.startTime - MP_ANTICIPATION_SECS);
        var proposalDur = Math.max(0.1, motion.endTime - mpStart);
        if (v && typeof v.mediaDurationSec === "number" && v.mediaDurationSec > 0.05) {
            var safeMedia = Math.max(0.05, v.mediaDurationSec - 2 / MP_TIMELINE_FPS);
            return Math.min(proposalDur, safeMedia);
        }
        return proposalDur;
    }

    function mpPlaceSingleInTimeline(motionId, callback) {
        var motion = motionPro._findMotion(motionId);
        if (!motion) { if (callback) callback(); return; }
        var v = motionPro.getActiveVersion(motionId);
        if (!v || !v.mp4Path) { if (callback) callback(); return; }
        if (window.EPLogger) EPLogger.log("motion-pro", "timeline-place", motionId + " at " + motion.startTime.toFixed(1) + "s");

        var mpStart = Math.max(0, motion.startTime - MP_ANTICIPATION_SECS);
        var mpDuration = mpComputeClipDurationSecs(motion, v);
        var mediaPath = mpNormalizeMediaPath(v.mp4Path);

        var payload = {
            clips: [{
                mp4Path: mediaPath,
                startTimeSecs: mpStart,
                durationSecs: mpDuration,
                clipName: _mpBuildSeqPrefix() + "_Clip" + motion.id.split("-")[0] + "_" + (motion.type || "motion").charAt(0).toUpperCase() + (motion.type || "motion").slice(1),
                labelColor: _mpLabelColorForType(motion.type)
            }]
        };

        var tmpPath = _writeTempJson(payload, "mp_place");
        if (!tmpPath) { if (callback) callback(); return; }

        csInterface.evalScript('importAndPlaceMotions("' + mpEscapePathForEvalScript(tmpPath) + '")', function(res) {
            if (res === undefined || res === null || res === "undefined" || res === "null" || res === "EvalScript error." || (typeof res === "string" && res.trim() === "")) {
                console.warn("[Motion-Pro] Place: evalScript returned empty or error:", res);
                showToast("Motion-Pro: Premiere no respondió al colocar el clip. Activa la secuencia correcta y recarga el panel (Cmd+R en el panel).", "error");
                if (callback) callback();
                return;
            }
            try {
                var result = typeof res === "string" ? JSON.parse(res) : res;
                if (result.error) {
                    console.warn("[Motion-Pro] Place error:", result.error);
                    showToast("Motion-Pro: no se colocó en timeline — " + result.error, "error");
                } else {
                    var errList = result.errors && result.errors.length ? result.errors.join("; ") : "";
                    var ins = result.inserted;
                    var okInsert = errList ? false : (typeof ins === "number" ? ins >= 1 : true);
                    if (!okInsert) {
                        var msg = errList || (typeof ins === "number" && ins < 1 ? "Ningún clip insertado (¿archivo no visible para Premiere?)" : "Colocación incompleta");
                        console.warn("[Motion-Pro] Place failed:", msg, result);
                        showToast("Motion-Pro: " + msg, "error");
                    } else {
                        motion.placedInTimeline = true;
                        motion.baseTrackIndex = result.trackIndex != null ? result.trackIndex : -1;
                        // Lleva el playhead al inicio del motion (si no, parece “vacío” al estar el clip más adelante o arriba del todo en pistas)
                        mpMovePlayhead(mpStart);
                        var vn = result.videoTrackNumber;
                        if (typeof vn === "number" && vn > 0) {
                            console.log("[Motion-Pro] Clip en pista de video V" + vn + " (~" + Math.round(mpStart) + "s)");
                        }
                    }
                }
            } catch(e) {
                console.warn("[Motion-Pro] Place parse error:", e.message, res);
                showToast("Motion-Pro: respuesta inválida al colocar (¿ExtendScript?). " + e.message, "error");
            }
            if (callback) callback();
        });
    }

    function mpReplaceInTimeline(motionId, version) {
        var motion = motionPro._findMotion(motionId);
        if (!motion) return;
        var v = version;

        var mpStartRep = Math.max(0, motion.startTime - MP_ANTICIPATION_SECS);
        var payload = {
            mp4Path: mpNormalizeMediaPath(v.mp4Path),
            startTimeSecs: mpStartRep,
            durationSecs: mpComputeClipDurationSecs(motion, v),
            oldTrackIndex: motion.baseTrackIndex,
            newTrackIndex: motion.baseTrackIndex + (v.version - 1),
            clipName: _mpBuildSeqPrefix() + "_Clip" + motionId.split("-")[0] + "_" + (motion.type || "motion").charAt(0).toUpperCase() + (motion.type || "motion").slice(1),
            labelColor: _mpLabelColorForType(motion.type),
            oldClipPattern: _mpBuildSeqPrefix() + "_Clip" + motionId.split("-")[0]
        };

        var tmpPath = _writeTempJson(payload, "mp_replace");
        if (!tmpPath) return;

        csInterface.evalScript('replaceMotionOnTrack("' + mpEscapePathForEvalScript(tmpPath) + '")', function(res) {
            try {
                var result = JSON.parse(res);
                if (result.error) {
                    showToast("Error al reemplazar: " + result.error, "error");
                } else {
                    showToast("Clip actualizado a v" + v.version, "success");
                    motionPro.saveState();
                    mpRenderControlPanel();
                }
            } catch(e) {
                showToast("Error: " + e.message, "error");
            }
        });
    }

    function _writeTempJson(data, prefix) {
        try {
            var tmpDir = os ? os.tmpdir() : "/tmp";
            var filePath = path.join(tmpDir, (prefix || "mp") + "_" + Date.now() + ".json");
            fs.writeFileSync(filePath, JSON.stringify(data), "utf8");
            return filePath;
        } catch(e) {
            console.error("[Motion-Pro] Write temp JSON error:", e.message);
            return null;
        }
    }

    // ─── Control Panel rendering ──────────────────────────────────

    function _mpAddRefImage(preview, src, title) {
        var wrap = document.createElement("span");
        wrap.className = "mp-ref-wrap";
        var img = document.createElement("img");
        img.src = src;
        img.className = "mp-ref-thumb";
        img.title = title || "ref";
        var rm = document.createElement("span");
        rm.className = "mp-ref-remove";
        rm.textContent = "✕";
        rm.addEventListener("click", function() { wrap.remove(); });
        wrap.appendChild(img);
        wrap.appendChild(rm);
        preview.appendChild(wrap);
    }

    function mpRenderControlPanel() {
        var list = clearContainer(document.getElementById("mp-motions-list"));
        if (!list) return;

        // Do not clear mpGenerating here — this runs after each motion during batch generation
        // and would hide the progress bar and confuse state until the pipeline finishes.

        // Sort motions by startTime before rendering
        var motions = motionPro.motions.slice().sort(function(a, b) {
            return (a.startTime || 0) - (b.startTime || 0);
        });
        showElement("mp-motions-summary");
        var countEl = document.getElementById("mp-motions-count");
        if (countEl) countEl.textContent = motions.length;

        // Group motions by their group field
        var groups = {};
        var groupOrder = [];
        motions.forEach(function(m) {
            var grp = m.group || 'Sin grupo';
            if (!groups[grp]) { groups[grp] = []; groupOrder.push(grp); }
            groups[grp].push(m);
        });

        groupOrder.forEach(function(grpName) {
            var grpItems = groups[grpName];

            // Group header
            var header = document.createElement('div');
            header.className = 'mp-group-header';
            header.innerHTML =
                '<span class="mp-group-icon">📦</span>' +
                '<span class="mp-group-name">' + esc(grpName) + '</span>' +
                '<span class="mp-group-count">(' + grpItems.length + ')</span>';
            list.appendChild(header);

        for (var i = 0; i < grpItems.length; i++) {
            var m = grpItems[i];
            var activeV = motionPro.getActiveVersion(m.id);
            var typeInfo = MotionPro.TYPES[m.type] || { label: m.type, color: "#818cf8" };

            var card = document.createElement("div");
            card.className = "mp-motion-card";
            card.setAttribute("data-motion-id", m.id);

            var statusBadge = activeV ? (
                activeV.status === "placed" || m.placedInTimeline ?
                    '<span class="mp-status-badge mp-status-placed">En timeline</span>' :
                activeV.status === "rendered" ?
                    '<span class="mp-status-badge mp-status-rendered">Renderizado</span>' :
                activeV.status === "error" ?
                    '<span class="mp-status-badge mp-status-error">Error</span>' :
                    '<span class="mp-status-badge mp-status-generating">Generando...</span>'
            ) : '';

            var versionOptions = '';
            for (var v = 0; v < m.versions.length; v++) {
                var ver = m.versions[v];
                versionOptions += '<option value="' + ver.version + '"' +
                    (ver.version === m.activeVersion ? ' selected' : '') + '>v' + ver.version +
                    (ver.feedback ? ' (feedback)' : '') + '</option>';
            }

            card.innerHTML =
                '<div class="mp-motion-header mp-clickable-header">' +
                    '<span class="mp-type-badge" data-type="' + esc(m.type) + '" style="background:' + typeInfo.color + '22;color:' + typeInfo.color + ';border:1px solid ' + typeInfo.color + '44">' + esc(typeInfo.label) + '</span>' +
                    '<span class="mp-clip-name">' + esc("Clip" + m.id.split("-")[0]) + '</span>' +
                    '<span class="mp-motion-time">' + formatTimeFull(m.startTime) + ' — ' + formatTimeFull(m.endTime) + '</span>' +
                    statusBadge +
                '</div>' +
                '<div class="mp-motion-desc">' + esc(m.description) + '</div>' +
                '<div class="mp-motion-controls">' +
                    '<div class="mp-version-row">' +
                        '<label class="mp-version-label">Versión:</label>' +
                        '<select class="mp-version-select select-input" data-motion-id="' + m.id + '">' + versionOptions + '</select>' +
                    '</div>' +
                    '<div class="mp-action-row">' +
                        '<button class="btn btn-sm btn-ghost mp-btn-studio" data-motion-id="' + m.id + '" title="Abrir en Remotion Studio">🖥 Remotion</button>' +
                        '<button class="btn btn-sm btn-ghost mp-btn-regen" data-motion-id="' + m.id + '" title="Regenerar del todo">🔄 Regenerar</button>' +
                    '</div>' +
                    '<div class="mp-regen-progress hidden" data-motion-id="' + m.id + '">' +
                        '<div class="progress-track"><div class="progress-fill mp-regen-fill" style="width:0%"></div></div>' +
                        '<span class="progress-text mp-regen-text">Regenerando...</span>' +
                    '</div>' +
                    '<div class="mp-feedback-row">' +
                        '<textarea class="mp-feedback-input" data-motion-id="' + m.id + '" placeholder="Feedback: ej. Hazlo más sutil, cambia colores..." rows="2"></textarea>' +
                        '<div class="mp-feedback-actions">' +
                            '<button class="btn btn-sm btn-ghost mp-btn-ref-img" data-motion-id="' + m.id + '" title="Adjuntar imagen">📎 Imagen</button>' +
                            '<button class="btn btn-sm btn-ghost mp-btn-paste-img" data-motion-id="' + m.id + '" title="Pegar imagen del clipboard">📋 Pegar</button>' +
                            '<button class="btn btn-sm btn-ghost mp-btn-still" data-motion-id="' + m.id + '" title="Capturar frame actual de Premiere">📷 Still</button>' +
                            '<button class="btn btn-sm btn-success mp-btn-feedback" data-motion-id="' + m.id + '">Enviar</button>' +
                        '</div>' +
                        '<div class="mp-ref-preview" data-motion-id="' + m.id + '"></div>' +
                        '<div class="mp-feedback-progress hidden" data-motion-id="' + m.id + '">' +
                            '<div class="progress-track"><div class="progress-fill mp-fb-fill" style="width:0%"></div></div>' +
                            '<span class="progress-text mp-fb-text">Procesando feedback...</span>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            list.appendChild(card);

            (function(motionId, startTime) {
                // Click header to navigate
                var header = card.querySelector(".mp-clickable-header");
                if (header) {
                    header.style.cursor = "pointer";
                    header.addEventListener("click", function() { mpMovePlayhead(startTime); });
                }

                // Version dropdown
                var sel = card.querySelector(".mp-version-select");
                if (sel) sel.addEventListener("change", function() {
                    var newVer = parseInt(this.value);
                    motionPro.setActiveVersion(motionId, newVer);
                    var v = motionPro.getActiveVersion(motionId);
                    if (v && v.mp4Path) mpReplaceInTimeline(motionId, v);
                    motionPro.saveState();
                    mpRenderControlPanel();
                });

                // Remotion Studio
                var studioBtn = card.querySelector(".mp-btn-studio");
                if (studioBtn) studioBtn.addEventListener("click", function() {
                    var av = motionPro.getActiveVersion(motionId);
                    if (!av) return;
                    motionPro.startStudio(function(err) {
                        if (err) console.warn("[Motion-Pro] Studio error:", err.message);
                        motionPro.getStudioUrl(av.compositionId, function(err2, url) {
                            if (url) {
                                try { require("child_process").exec('open "' + url + '"'); } catch(e) {}
                                showToast("Abriendo Remotion Studio...", "info");
                            }
                        });
                    }, _mpOutputDir);
                });

                // Regenerate
                var regenBtn = card.querySelector(".mp-btn-regen");
                var regenProgress = card.querySelector('.mp-regen-progress[data-motion-id="' + motionId + '"]');
                if (regenBtn) regenBtn.addEventListener("click", function() {
                    if (!motionPro.serverRunning) { showToast("Inicia el servidor primero", "error"); return; }
                    if (state.mpGenerating) return;
                    state.mpGenerating = true;
                    regenBtn.disabled = true;
                    regenBtn.textContent = "Regenerando...";
                    if (regenProgress) {
                        regenProgress.classList.remove("hidden");
                        var rf = regenProgress.querySelector(".mp-regen-fill");
                        if (rf) rf.style.width = "40%";
                    }

                    var mot = motionPro._findMotion(motionId);
                    var segment = mot ? mpExtractSegment(mot.startTime, mot.endTime) : "";
                    var aiConfig = { provider: state.settings.aiProvider, model: state.settings.aiModel, apiKey: aiAnalyzer.getActiveKey() };

                    motionPro.regenerateFull(motionId, segment, aiConfig, function(err, result) {
                        state.mpGenerating = false;
                        if (err) {
                            showToast("Error al regenerar: " + err.message, "error");
                        } else {
                            showToast("Motion regenerado (v" + result.version + ")", "success");
                            if (result.mp4Path) {
                                var v = motionPro.getActiveVersion(motionId);
                                if (v) mpReplaceInTimeline(motionId, v);
                            }
                        }
                        motionPro.saveState();
                        mpRenderControlPanel();
                    }, _mpOutputDir || undefined);
                });

                // Helper: save base64 image to feedback dir
                function _saveImgToFeedback(b64Data, suffix) {
                    var fbDir = _mpGetFeedbackDir();
                    if (!fbDir || !fs) return "";
                    try {
                        var ts = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
                        var name = motionId + "_" + suffix + "_" + ts + ".png";
                        var filePath = path.join(fbDir, name);
                        var raw = b64Data.replace(/^data:image\/\w+;base64,/, "");
                        fs.writeFileSync(filePath, Buffer.from(raw, "base64"));
                        return name;
                    } catch(e) { return ""; }
                }

                // Image file picker
                var refBtn = card.querySelector(".mp-btn-ref-img");
                var preview = card.querySelector('.mp-ref-preview[data-motion-id="' + motionId + '"]');
                if (refBtn) refBtn.addEventListener("click", function() {
                    var input = document.createElement("input");
                    input.type = "file"; input.accept = "image/*";
                    input.addEventListener("change", function() {
                        if (!input.files || !input.files[0]) return;
                        var reader = new FileReader();
                        reader.onload = function(e) {
                            var saved = _saveImgToFeedback(e.target.result, "ref");
                            _mpAddRefImage(preview, e.target.result, saved || input.files[0].name);
                        };
                        reader.readAsDataURL(input.files[0]);
                    });
                    input.click();
                });

                // Paste from clipboard
                var pasteBtn = card.querySelector(".mp-btn-paste-img");
                if (pasteBtn) pasteBtn.addEventListener("click", function() {
                    if (!navigator.clipboard || !navigator.clipboard.read) {
                        showToast("Clipboard API no disponible", "info");
                        return;
                    }
                    navigator.clipboard.read().then(function(items) {
                        for (var ci = 0; ci < items.length; ci++) {
                            var types = items[ci].types;
                            for (var ti = 0; ti < types.length; ti++) {
                                if (types[ti].indexOf("image") === 0) {
                                    items[ci].getType(types[ti]).then(function(blob) {
                                        var reader = new FileReader();
                                        reader.onload = function(e) {
                                            var saved = _saveImgToFeedback(e.target.result, "paste");
                                            _mpAddRefImage(preview, e.target.result, saved || "clipboard");
                                        };
                                        reader.readAsDataURL(blob);
                                    });
                                    return;
                                }
                            }
                        }
                        showToast("No hay imagen en el clipboard", "info");
                    }).catch(function() { showToast("No se pudo leer el clipboard", "error"); });
                });

                // Still from Premiere (export current frame)
                var stillBtn = card.querySelector(".mp-btn-still");
                if (stillBtn) stillBtn.addEventListener("click", function() {
                    stillBtn.disabled = true;
                    stillBtn.textContent = "Capturando...";
                    csInterface.evalScript("exportCurrentFrame()", function(res) {
                        stillBtn.disabled = false;
                        stillBtn.textContent = "📷 Still";
                        try {
                            var r = JSON.parse(res);
                            if (r.path && fs) {
                                // Copy to feedback folder for persistence
                                var feedbackDir = _mpGetFeedbackDir();
                                var savedPath = "";
                                if (feedbackDir) {
                                    var timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
                                    var stillName = motionId + "_still_" + timestamp + ".png";
                                    savedPath = path.join(feedbackDir, stillName);
                                    try { fs.copyFileSync(r.path, savedPath); } catch(ec) { savedPath = ""; }
                                }

                                var imgData = fs.readFileSync(savedPath || r.path);
                                var b64 = "data:image/png;base64," + imgData.toString("base64");
                                _mpAddRefImage(preview, b64, savedPath ? path.basename(savedPath) : "premiere-still");
                                showToast("Still guardado" + (savedPath ? " en feedback/" : ""), "success");
                            } else if (r.error) {
                                showToast("Error: " + r.error, "error");
                            }
                        } catch(e) { showToast("Error al capturar still", "error"); }
                    });
                });

                // Feedback button
                var fbBtn = card.querySelector(".mp-btn-feedback");
                var textarea = card.querySelector(".mp-feedback-input");
                var fbProgress = card.querySelector('.mp-feedback-progress[data-motion-id="' + motionId + '"]');

                if (fbBtn) fbBtn.addEventListener("click", function() {
                    if (!motionPro.serverRunning) { showToast("Inicia el servidor primero", "error"); return; }
                    var feedback = textarea ? textarea.value.trim() : "";
                    if (!feedback) { showToast("Escribe feedback primero", "info"); return; }
                    if (state.mpGenerating) { showToast("Espera a que termine el proceso actual", "info"); return; }
                    state.mpGenerating = true;

                    fbBtn.disabled = true;
                    fbBtn.textContent = "Procesando...";
                    if (textarea) textarea.disabled = true;
                    if (fbProgress) {
                        fbProgress.classList.remove("hidden");
                        var fill = fbProgress.querySelector(".mp-fb-fill");
                        var txt = fbProgress.querySelector(".mp-fb-text");
                        if (fill) fill.style.width = "30%";
                        if (txt) txt.textContent = "Enviando feedback al LLM...";
                    }

                    var aiConfig = { provider: state.settings.aiProvider, model: state.settings.aiModel, apiKey: aiAnalyzer.getActiveKey() };

                    motionPro.regenerateWithFeedback(motionId, feedback, aiConfig, function(err, result) {
                        state.mpGenerating = false;
                        if (err) {
                            showToast("Error con feedback: " + err.message, "error");
                        } else {
                            showToast("Versión " + result.version + " creada con feedback", "success");
                            if (result.mp4Path) {
                                var v = motionPro.getActiveVersion(motionId);
                                if (v) mpReplaceInTimeline(motionId, v);
                            }
                        }
                        motionPro.saveState();
                        mpRenderControlPanel();
                    }, _mpOutputDir || undefined);
                });
            })(m.id, m.startTime);
        }
        }); // end groupOrder.forEach
        mpUpdateMotionProEmptyState();
    }

    function mpSetProgress(prefix, pct, text) {
        var fill = document.getElementById(prefix + "-progress-fill");
        var txt = document.getElementById(prefix + "-progress-text");
        if (fill) fill.style.width = pct + "%";
        if (txt) txt.textContent = text || "";
        setProgress("mp-progress-header-fill", "mp-progress-header-text", pct, text || "");
        // Also update inline progress bar in Step 2
        var fillInline = document.getElementById("mp-generate-progress-fill-inline");
        var textInline = document.getElementById("mp-generate-progress-text-inline");
        if (fillInline) fillInline.style.width = pct + "%";
        if (textInline) textInline.textContent = text || "";
        // Update Step 2 header progress (text + bar + stop button)
        var step2Fill = document.getElementById("mp-step2-progress-fill");
        var step2Wrap = document.getElementById("mp-step2-progress");
        var step2Text = document.getElementById("mp-step2-progress-text");
        if (step2Fill) step2Fill.style.width = pct + "%";
        if (step2Text) step2Text.textContent = text || "";
        if (step2Wrap && pct > 0) { step2Wrap.classList.remove("hidden"); step2Wrap.style.display = "inline-flex"; }
        refreshMPHeaderProgressVisibility();
    }

    function refreshMPHeaderProgressVisibility() {
        var analyzeBar = document.getElementById("mp-analyze-progress");
        var generateBar = document.getElementById("mp-generate-progress");
        var analyzeActive = analyzeBar && !analyzeBar.classList.contains("hidden");
        var generateActive = generateBar && !generateBar.classList.contains("hidden");
        var isActive = analyzeActive || generateActive;

        if (!isActive) {
            hideElement("mp-progress-header");
            return;
        }
        var mpBody = document.getElementById("motionpro-body");
        var collapsed = mpBody && mpBody.classList.contains("hidden");
        var header = document.getElementById("mp-progress-header");
        if (header) header.classList.toggle("hidden", !collapsed);
    }



    // ─── Expose to EditorProUI namespace ───────────────────────
    EP.motionPro = {
        init: mpInit,
        checkServerStatus: mpCheckServerStatus,
        toggleServer: mpToggleServer,
        startAnalysis: mpStartAnalysis,
        startGeneration: mpStartGeneration,
        cancelGeneration: mpCancelGeneration,
        renderProposals: mpRenderProposals,
        renderControlPanel: mpRenderControlPanel,
        renderFullUI: mpRenderFullUI,
        toggleSelectAll: mpToggleSelectAll,
        saveBrandfetchKey: mpSaveBrandfetchKey,
        loadBrandfetchKey: mpLoadBrandfetchKey,
        toggleGenPromptsPanel: mpToggleGenPromptsPanel,
        saveGenPrompts: mpSaveGenPrompts,
        resetGenPrompts: mpResetGenPrompts,
        bindGenPromptAccordions: mpBindGenPromptAccordions,
        setProgress: mpSetProgress,
        refreshHeaderProgressVisibility: refreshMPHeaderProgressVisibility,
        resolveOutputDir: mpResolveOutputDir,
        bindStepHeaders: mpBindStepHeaders,
        switchToSequence: mpSwitchToSequence,
        updateAnalyzeButton: mpUpdateAnalyzeButton
    };

})(window);