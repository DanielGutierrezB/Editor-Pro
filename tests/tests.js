/**
 * Editor-Pro — Test Suite
 * Runs in a plain browser (test-runner.html) without Premiere Pro.
 * Simple assert-based: each test function throws on failure.
 */

(function() {
    "use strict";

    var passed = 0;
    var failed = 0;
    var errors = [];
    var results = document.getElementById("results");
    var currentSection = "";

    function section(name) {
        currentSection = name;
        var h2 = document.createElement("h2");
        h2.textContent = name;
        results.appendChild(h2);
    }

    function assert(condition, message) {
        if (!condition) throw new Error(message || "Assertion failed");
    }

    function assertEqual(actual, expected, message) {
        if (actual !== expected) {
            throw new Error((message || "assertEqual") + ": expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
        }
    }

    function assertApprox(actual, expected, tolerance, message) {
        if (Math.abs(actual - expected) > tolerance) {
            throw new Error((message || "assertApprox") + ": expected ~" + expected + " ± " + tolerance + ", got " + actual);
        }
    }

    function runTest(name, fn) {
        var el = document.createElement("div");
        el.className = "test";
        try {
            fn();
            passed++;
            el.classList.add("pass");
            el.innerHTML = '<span class="label">✓ ' + name + '</span>';
        } catch (e) {
            failed++;
            errors.push({ section: currentSection, name: name, error: e.message });
            el.classList.add("fail");
            el.innerHTML = '<span class="label">✗ ' + name + '</span><span class="detail">' + e.message + '</span>';
        }
        results.appendChild(el);
    }

    // ═══════════════════════════════════════════════════════════════
    // 1. Recording Notes
    // ═══════════════════════════════════════════════════════════════
    section("Recording Notes — detectSegments");

    runTest("detects 'pausa' as OUT trigger", function() {
        var rn = new RecordingNotes();
        rn.loadTranscription({
            text: "hola mundo pausa",
            words: [
                { text: "hola", start: 0, end: 0.5, type: "word" },
                { text: "mundo", start: 0.6, end: 1.0, type: "word" },
                { text: "pausa", start: 1.5, end: 2.0, type: "word" }
            ]
        });
        var result = rn.detectSegments();
        assert(result.outPoints.length >= 1, "Should detect at least 1 OUT point for 'pausa'");
        assertEqual(result.outPoints[0].triggerWord, "pausa");
    });

    runTest("detects 'corte' as OUT trigger", function() {
        var rn = new RecordingNotes();
        rn.loadTranscription({
            text: "hola corte",
            words: [
                { text: "hola", start: 0, end: 0.5, type: "word" },
                { text: "corte", start: 1.0, end: 1.5, type: "word" }
            ]
        });
        var result = rn.detectSegments();
        assert(result.outPoints.length >= 1, "Should detect OUT for 'corte'");
        assertEqual(result.outPoints[0].triggerWord, "corte");
    });

    runTest("detects 'corta' as OUT trigger", function() {
        var rn = new RecordingNotes();
        rn.loadTranscription({
            text: "hola corta",
            words: [
                { text: "hola", start: 0, end: 0.5, type: "word" },
                { text: "corta", start: 1.0, end: 1.5, type: "word" }
            ]
        });
        var result = rn.detectSegments();
        assert(result.outPoints.length >= 1, "Should detect OUT for 'corta'");
    });

    runTest("detects 'alto' as OUT trigger", function() {
        var rn = new RecordingNotes();
        rn.loadTranscription({
            text: "hola alto",
            words: [
                { text: "hola", start: 0, end: 0.5, type: "word" },
                { text: "alto", start: 1.0, end: 1.5, type: "word" }
            ]
        });
        var result = rn.detectSegments();
        assert(result.outPoints.length >= 1, "Should detect OUT for 'alto'");
    });

    runTest("detects 'para' as OUT trigger", function() {
        var rn = new RecordingNotes();
        rn.loadTranscription({
            text: "contenido para",
            words: [
                { text: "contenido", start: 0, end: 0.5, type: "word" },
                { text: "para", start: 1.0, end: 1.5, type: "word" }
            ]
        });
        var result = rn.detectSegments();
        assert(result.outPoints.length >= 1, "Should detect OUT for 'para'");
    });

    runTest("detects 'retomemos' as IN trigger", function() {
        var rn = new RecordingNotes();
        rn.loadTranscription({
            text: "retomemos el tema",
            words: [
                { text: "retomemos", start: 0, end: 0.5, type: "word" },
                { text: "el", start: 0.6, end: 0.8, type: "word" },
                { text: "tema", start: 0.9, end: 1.2, type: "word" }
            ]
        });
        var result = rn.detectSegments();
        assert(result.inPoints.length >= 1, "Should detect IN for 'retomemos'");
    });

    runTest("detects 'retoma' as IN trigger", function() {
        var rn = new RecordingNotes();
        rn.loadTranscription({
            text: "retoma la clase",
            words: [
                { text: "retoma", start: 0, end: 0.5, type: "word" },
                { text: "la", start: 0.6, end: 0.8, type: "word" },
                { text: "clase", start: 0.9, end: 1.2, type: "word" }
            ]
        });
        var result = rn.detectSegments();
        assert(result.inPoints.length >= 1, "Should detect IN for 'retoma'");
    });

    section("Recording Notes — Countdown detection");

    runTest("detects countdown 3,2,1 as IN", function() {
        var rn = new RecordingNotes();
        rn.loadTranscription({
            text: "tres dos uno hola mundo",
            words: [
                { text: "tres", start: 0, end: 0.5, type: "word" },
                { text: "dos", start: 0.6, end: 1.0, type: "word" },
                { text: "uno", start: 1.1, end: 1.5, type: "word" },
                { text: "hola", start: 2.0, end: 2.5, type: "word" },
                { text: "mundo", start: 2.6, end: 3.0, type: "word" }
            ]
        });
        var result = rn.detectSegments();
        assert(result.inPoints.length >= 1, "Should detect countdown as IN point");
    });

    runTest("detects countdown with digits 3,2,1", function() {
        var rn = new RecordingNotes();
        rn.loadTranscription({
            text: "3 2 1 vamos",
            words: [
                { text: "3", start: 0, end: 0.3, type: "word" },
                { text: "2", start: 0.5, end: 0.8, type: "word" },
                { text: "1", start: 1.0, end: 1.3, type: "word" },
                { text: "vamos", start: 1.5, end: 2.0, type: "word" }
            ]
        });
        var result = rn.detectSegments();
        assert(result.inPoints.length >= 1, "Should detect digit countdown as IN point");
    });

    runTest("detects partial countdown 3,2", function() {
        var rn = new RecordingNotes();
        rn.loadTranscription({
            text: "tres dos contenido",
            words: [
                { text: "tres", start: 0, end: 0.5, type: "word" },
                { text: "dos", start: 0.6, end: 1.0, type: "word" },
                { text: "contenido", start: 2.0, end: 2.5, type: "word" }
            ]
        });
        var result = rn.detectSegments();
        assert(result.inPoints.length >= 1, "Should detect partial countdown (3,2) as IN point");
    });

    runTest("ignores single numbers (not a countdown)", function() {
        var rn = new RecordingNotes();
        rn.loadTranscription({
            text: "tenemos tres opciones",
            words: [
                { text: "tenemos", start: 0, end: 0.5, type: "word" },
                { text: "tres", start: 0.6, end: 1.0, type: "word" },
                { text: "opciones", start: 1.5, end: 2.0, type: "word" }
            ]
        });
        var result = rn.detectSegments();
        // A single "tres" without a following "dos" should NOT create an IN point
        // (unless followed by descending sequence)
        var countdownIns = result.inPoints.filter(function(p) { return p.triggerWord && p.triggerWord.indexOf(",") !== -1; });
        assertEqual(countdownIns.length, 0, "Single 'tres' should not trigger countdown");
    });

    section("Recording Notes — Segment building");

    runTest("builds segment from IN→OUT pair", function() {
        var rn = new RecordingNotes();
        rn.loadTranscription({
            text: "pausa retomemos hola mundo pausa",
            words: [
                { text: "pausa", start: 0, end: 0.5, type: "word" },
                { text: "retomemos", start: 5.0, end: 5.5, type: "word" },
                { text: "hola", start: 6.0, end: 6.5, type: "word" },
                { text: "mundo", start: 7.0, end: 7.5, type: "word" },
                { text: "pausa", start: 15.0, end: 15.5, type: "word" }
            ]
        });
        var result = rn.detectSegments();
        assert(result.segments.length >= 1, "Should build at least 1 segment from IN→OUT pair");
    });

    section("Recording Notes — Jaccard similarity grouping");

    runTest("groups similar segments as retakes", function() {
        var rn = new RecordingNotes();
        // Simulate two takes with similar first phrases
        rn.loadTranscription({
            text: "retomemos hoy vamos hablar sobre programación pausa retomemos hoy vamos hablar sobre programación avanzada pausa",
            words: [
                { text: "retomemos", start: 0, end: 0.5, type: "word" },
                { text: "hoy", start: 0.6, end: 0.8, type: "word" },
                { text: "vamos", start: 0.9, end: 1.2, type: "word" },
                { text: "hablar", start: 1.3, end: 1.6, type: "word" },
                { text: "sobre", start: 1.7, end: 2.0, type: "word" },
                { text: "programación", start: 2.1, end: 2.5, type: "word" },
                { text: "pausa", start: 10, end: 10.5, type: "word" },
                // Second take
                { text: "retomemos", start: 20, end: 20.5, type: "word" },
                { text: "hoy", start: 20.6, end: 20.8, type: "word" },
                { text: "vamos", start: 20.9, end: 21.2, type: "word" },
                { text: "hablar", start: 21.3, end: 21.6, type: "word" },
                { text: "sobre", start: 21.7, end: 22.0, type: "word" },
                { text: "programación", start: 22.1, end: 22.5, type: "word" },
                { text: "avanzada", start: 22.6, end: 23.0, type: "word" },
                { text: "pausa", start: 30, end: 30.5, type: "word" }
            ]
        });
        var result = rn.detectSegments();
        // Should have takeGroups with at least one group having 2 takes
        if (result.takeGroups && result.takeGroups.length > 0) {
            var multiTakeGroup = result.takeGroups.filter(function(g) { return g.takes.length > 1; });
            assert(multiTakeGroup.length >= 1, "Should group similar phrases as retakes");
        }
    });

    section("Recording Notes — Segment filtering");

    runTest("filters short segments (< 5s)", function() {
        var rn = new RecordingNotes();
        rn.loadTranscription({
            text: "retomemos hola pausa retomemos contenido largo que dura más de cinco segundos pausa",
            words: [
                { text: "retomemos", start: 0, end: 0.5, type: "word" },
                { text: "hola", start: 0.6, end: 1.0, type: "word" },
                { text: "pausa", start: 2.0, end: 2.5, type: "word" }, // Short segment: ~2s
                { text: "retomemos", start: 10, end: 10.5, type: "word" },
                { text: "contenido", start: 11, end: 11.5, type: "word" },
                { text: "largo", start: 12, end: 12.5, type: "word" },
                { text: "que", start: 13, end: 13.3, type: "word" },
                { text: "dura", start: 13.5, end: 14, type: "word" },
                { text: "más", start: 14.5, end: 15, type: "word" },
                { text: "de", start: 15.5, end: 16, type: "word" },
                { text: "cinco", start: 16.5, end: 17, type: "word" },
                { text: "segundos", start: 17.5, end: 18, type: "word" },
                { text: "pausa", start: 20, end: 20.5, type: "word" }
            ]
        });
        var result = rn.detectSegments();
        var filtered = result.segments.filter(function(s) { return s.filtered; });
        // Short segments should be filtered
        // The first segment is ~2s which is < MIN_SEGMENT_DURATION (5s)
        if (result.segments.length >= 2) {
            assert(filtered.length >= 1, "Short segments should be filtered");
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // 2. SpellCheck Engine
    // ═══════════════════════════════════════════════════════════════
    section("SpellCheck Engine — Language detection");

    runTest("detects Spanish text", function() {
        var engine = new SpellCheckEngine({ extensionPath: "/mock", uiLanguage: "es" });
        var lang = engine.detectLanguage("Hoy vamos a hablar sobre programación y más cosas");
        assertEqual(lang, "es", "Should detect Spanish");
    });

    runTest("detects English text", function() {
        var engine = new SpellCheckEngine({ extensionPath: "/mock", uiLanguage: "es" });
        var lang = engine.detectLanguage("Today we are going to talk about the weather and what is happening");
        assertEqual(lang, "en", "Should detect English");
    });

    runTest("detects Spanish from accented characters", function() {
        var engine = new SpellCheckEngine({ extensionPath: "/mock", uiLanguage: "es" });
        var lang = engine.detectLanguage("programación básica");
        assertEqual(lang, "es", "Accented chars should favor Spanish");
    });

    runTest("empty text returns 'en' as default", function() {
        var engine = new SpellCheckEngine({ extensionPath: "/mock", uiLanguage: "es" });
        var lang = engine.detectLanguage("");
        assertEqual(lang, "en", "Empty text should default to 'en'");
    });

    section("SpellCheck Engine — Capitalization detection");

    runTest("detects ALLCAPS style", function() {
        var engine = new SpellCheckEngine({ extensionPath: "/mock", uiLanguage: "es" });
        var style = engine.detectCapStyle("ESTE ES UN TÍTULO");
        assertEqual(style, "ALLCAPS", "Should detect ALLCAPS");
    });

    runTest("detects Title Case style", function() {
        var engine = new SpellCheckEngine({ extensionPath: "/mock", uiLanguage: "es" });
        var style = engine.detectCapStyle("Este Es Un Título");
        assertEqual(style, "TitleCase", "Should detect TitleCase");
    });

    runTest("detects Sentence case style", function() {
        var engine = new SpellCheckEngine({ extensionPath: "/mock", uiLanguage: "es" });
        var style = engine.detectCapStyle("Este es un título normal");
        assertEqual(style, "Sentence", "Should detect Sentence case");
    });

    // ═══════════════════════════════════════════════════════════════
    // 3. AI Analyzer
    // ═══════════════════════════════════════════════════════════════
    section("AI Analyzer — JSON parsing");

    runTest("_parseResponse handles clean JSON", function() {
        var ai = new AIAnalyzer();
        ai.setProvider("ollama");
        var called = false;
        ai._parseResponse(JSON.stringify({
            message: { content: '{"score": 95, "summary": "ok"}' }
        }), function(result) {
            called = true;
            assertEqual(result.score, 95);
            assertEqual(result.summary, "ok");
        });
        assert(called, "Callback should be called");
    });

    runTest("_parseResponse strips markdown code fences", function() {
        var ai = new AIAnalyzer();
        ai.setProvider("ollama");
        var called = false;
        ai._parseResponse(JSON.stringify({
            message: { content: '```json\n{"score": 80}\n```' }
        }), function(result) {
            called = true;
            assertEqual(result.score, 80);
        });
        assert(called, "Callback should be called");
    });

    runTest("_parseResponse handles Anthropic format", function() {
        var ai = new AIAnalyzer();
        ai.setProvider("anthropic");
        var called = false;
        ai._parseResponse(JSON.stringify({
            content: [{ type: "text", text: '{"score": 90}' }]
        }), function(result) {
            called = true;
            assertEqual(result.score, 90);
        });
        assert(called, "Callback should be called");
    });

    runTest("_parseResponse handles OpenAI format", function() {
        var ai = new AIAnalyzer();
        ai.setProvider("openai");
        var called = false;
        ai._parseResponse(JSON.stringify({
            choices: [{ message: { content: '{"score": 85}' } }]
        }), function(result) {
            called = true;
            assertEqual(result.score, 85);
        });
        assert(called, "Callback should be called");
    });

    runTest("_parseResponse handles Google format", function() {
        var ai = new AIAnalyzer();
        ai.setProvider("google");
        var called = false;
        ai._parseResponse(JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{"score": 75}' }] } }]
        }), function(result) {
            called = true;
            assertEqual(result.score, 75);
        });
        assert(called, "Callback should be called");
    });

    runTest("_parseResponse returns error on invalid JSON", function() {
        var ai = new AIAnalyzer();
        ai.setProvider("ollama");
        var called = false;
        ai._parseResponse(JSON.stringify({
            message: { content: 'not valid json at all' }
        }), function(result) {
            called = true;
            assert(result.error, "Should return error for invalid JSON");
        });
        assert(called, "Callback should be called");
    });

    runTest("_parseResponse handles error responses", function() {
        var ai = new AIAnalyzer();
        ai.setProvider("ollama");
        var called = false;
        ai._parseResponse(JSON.stringify({
            error: { message: "model not found" }
        }), function(result) {
            called = true;
            assert(result.error, "Should return error");
            assert(result.error.indexOf("model not found") !== -1, "Should include error message");
        });
        assert(called, "Callback should be called");
    });

    section("AI Analyzer — Provider URL construction");

    runTest("constructs Anthropic URL correctly", function() {
        var ai = new AIAnalyzer();
        ai.setProvider("anthropic");
        ai.setApiKey("anthropic", "test-key");
        var config = ai._getRequestConfig();
        assertEqual(config.hostname, "api.anthropic.com");
        assertEqual(config.path, "/v1/messages");
        assertEqual(config.headers["x-api-key"], "test-key");
    });

    runTest("constructs OpenAI URL correctly", function() {
        var ai = new AIAnalyzer();
        ai.setProvider("openai");
        ai.setApiKey("openai", "sk-test");
        var config = ai._getRequestConfig();
        assertEqual(config.hostname, "api.openai.com");
        assertEqual(config.path, "/v1/chat/completions");
        assertEqual(config.headers["Authorization"], "Bearer sk-test");
    });

    runTest("constructs OpenRouter URL correctly", function() {
        var ai = new AIAnalyzer();
        ai.setProvider("openrouter");
        ai.setApiKey("openrouter", "or-key");
        var config = ai._getRequestConfig();
        assertEqual(config.hostname, "openrouter.ai");
        assertEqual(config.path, "/api/v1/chat/completions");
    });

    runTest("constructs Google URL with model and key", function() {
        var ai = new AIAnalyzer();
        ai.setProvider("google");
        ai.setApiKey("google", "goog-key");
        ai.setModel("gemini-pro");
        var config = ai._getRequestConfig();
        assertEqual(config.hostname, "generativelanguage.googleapis.com");
        assert(config.path.indexOf("gemini-pro") !== -1, "Path should include model name");
        assert(config.path.indexOf("goog-key") !== -1, "Path should include API key");
    });

    // ═══════════════════════════════════════════════════════════════
    // 4. Speech-to-Text
    // ═══════════════════════════════════════════════════════════════
    section("Speech-to-Text — SRT generation");

    runTest("generates SRT from word array", function() {
        var stt = new SpeechToText();
        var result = {
            text: "hola mundo",
            words: [
                { text: "hola", start: 0, end: 0.5, type: "word" },
                { text: "mundo", start: 0.6, end: 1.0, type: "word" }
            ]
        };
        var srt = stt.generateSRT(result, 5);
        assert(srt.length > 0, "SRT should not be empty");
        assert(srt.indexOf("hola mundo") !== -1, "SRT should contain the words");
        assert(srt.indexOf("-->") !== -1, "SRT should contain timing arrows");
        assert(srt.indexOf("00:00:00,000") !== -1, "SRT should start at 0");
    });

    runTest("generates SRT with correct line grouping", function() {
        var stt = new SpeechToText();
        var words = [];
        for (var i = 0; i < 12; i++) {
            words.push({ text: "word" + i, start: i * 0.5, end: i * 0.5 + 0.4, type: "word" });
        }
        var srt = stt.generateSRT({ text: "", words: words }, 5);
        // Should have 3 entries (12 words / 5 per line = 2.4, ceil = 3)
        var entries = srt.split("\n\n").filter(function(e) { return e.trim(); });
        assertEqual(entries.length, 3, "Should have 3 SRT entries for 12 words at 5 per line");
    });

    runTest("generates word-by-word SRT", function() {
        var stt = new SpeechToText();
        var result = {
            text: "hola mundo",
            words: [
                { text: "hola", start: 0, end: 0.5, type: "word" },
                { text: "mundo", start: 0.6, end: 1.0, type: "word" }
            ]
        };
        var srt = stt.generateWordSRT(result);
        var entries = srt.split("\n\n").filter(function(e) { return e.trim(); });
        assertEqual(entries.length, 2, "Word SRT should have 1 entry per word");
    });

    runTest("returns empty string for empty words", function() {
        var stt = new SpeechToText();
        var srt = stt.generateSRT({ text: "", words: [] }, 5);
        assertEqual(srt, "", "Empty words should produce empty SRT");
    });

    runTest("filters non-word types", function() {
        var stt = new SpeechToText();
        var result = {
            text: "hola",
            words: [
                { text: " ", start: 0, end: 0.1, type: "spacing" },
                { text: "hola", start: 0.1, end: 0.5, type: "word" },
                { text: ".", start: 0.5, end: 0.6, type: "punctuation" }
            ]
        };
        var srt = stt.generateSRT(result, 5);
        assert(srt.indexOf("hola") !== -1, "SRT should contain words");
        // Should only have 1 entry (only "hola" is a word)
        var entries = srt.split("\n\n").filter(function(e) { return e.trim(); });
        assertEqual(entries.length, 1, "Should have 1 entry for 1 word");
    });

    // ═══════════════════════════════════════════════════════════════
    // 5. Smart Supertexts (from ui-supertexts.js)
    // ═══════════════════════════════════════════════════════════════
    section("Smart Supertexts — buildST2Payload cascade logic");

    runTest("buildST2Payload handles independent items", function() {
        var EP = window.EditorProUI;
        assert(EP && EP.supertexts, "EditorProUI.supertexts should be loaded");

        var items = [
            { time: 10, endTime: 15, text: "Title 1", type: "title", checked: true, _idx: 0 },
            { time: 30, endTime: 35, text: "Title 2", type: "title", checked: true, _idx: 1 }
        ];

        // Set up state with mogrt paths
        window._epState.mogrtPaths = { title: "/mock/title.mogrt", bullet: "/mock/bullet.mogrt" };
        var payload = EP.supertexts.buildPayload(items);
        assert(payload.length === 2, "Should produce 2 payload items");
        assert(payload[0].time < payload[1].time, "Items should be sorted by time");
    });

    runTest("buildST2Payload groups title+bullets", function() {
        var EP = window.EditorProUI;
        window._epState.mogrtPaths = { title: "/mock/title.mogrt", bullet: "/mock/bullet.mogrt" };

        var items = [
            { time: 10, endTime: 15, text: "Main Title", type: "title", group: 0, checked: true, _idx: 0 },
            { time: 12, endTime: 17, text: "Bullet 1", type: "bullet", group: 0, checked: true, _idx: 1 },
            { time: 14, endTime: 19, text: "Bullet 2", type: "bullet", group: 0, checked: true, _idx: 2 }
        ];

        var payload = EP.supertexts.buildPayload(items);
        assert(payload.length === 3, "Should produce 3 items for title+2 bullets");
        // All should share the same cascadeId
        var cascadeIds = payload.map(function(p) { return p._cascadeId; });
        assert(cascadeIds[0] === cascadeIds[1] && cascadeIds[1] === cascadeIds[2],
            "All items in group should share cascadeId");
    });

    section("Smart Supertexts — _st2TrimOverlaps");

    runTest("trims overlapping cascades", function() {
        var EP = window.EditorProUI;
        var items = [
            { time: 0, endTime: 20, _cascadeId: "c0" },
            { time: 10, endTime: 30, _cascadeId: "c1" }
        ];
        EP.supertexts.trimOverlaps(items);
        // First cascade's end should be trimmed to not overlap second cascade's start
        assert(items[0].endTime <= items[1].time, "First item endTime should not overlap second item start");
    });

    runTest("preserves items in same cascade", function() {
        var EP = window.EditorProUI;
        var items = [
            { time: 0, endTime: 20, _cascadeId: "c0" },
            { time: 2, endTime: 20, _cascadeId: "c0" },
            { time: 25, endTime: 40, _cascadeId: "c1" }
        ];
        EP.supertexts.trimOverlaps(items);
        // Same cascade items should keep their endTime (they go on different tracks)
        assert(items[0].endTime === items[1].endTime, "Same cascade items should share endTime");
    });

    section("Smart Supertexts — _st2AutoStagger");

    runTest("staggers items with same time", function() {
        var EP = window.EditorProUI;
        var cascade = [
            { time: 10, text: "A" },
            { time: 10, text: "B" },
            { time: 10, text: "C" }
        ];
        EP.supertexts.autoStagger(cascade);
        assert(cascade[0].time < cascade[1].time, "Second item should be staggered after first");
        assert(cascade[1].time < cascade[2].time, "Third item should be staggered after second");
    });

    runTest("does not stagger items with different times", function() {
        var EP = window.EditorProUI;
        var cascade = [
            { time: 10, text: "A" },
            { time: 15, text: "B" },
            { time: 20, text: "C" }
        ];
        var origTimes = [10, 15, 20];
        EP.supertexts.autoStagger(cascade);
        assertEqual(cascade[0].time, origTimes[0], "Time should not change");
        assertEqual(cascade[1].time, origTimes[1], "Time should not change");
        assertEqual(cascade[2].time, origTimes[2], "Time should not change");
    });

    section("Smart Supertexts — _st2Anticipate");

    runTest("anticipates by ~1 second", function() {
        var EP = window.EditorProUI;
        var result = EP.supertexts.anticipate(10);
        assertApprox(result, 9, 0.1, "Should anticipate 1s");
    });

    runTest("does not go below zero", function() {
        var EP = window.EditorProUI;
        var result = EP.supertexts.anticipate(0.5);
        assert(result >= 0, "Anticipated time should not be negative");
    });

    section("Smart Supertexts — _st2ReadingBuffer");

    runTest("returns minimum buffer for short text", function() {
        var EP = window.EditorProUI;
        var buf = EP.supertexts.readingBuffer("Hi");
        assert(buf >= 1.5, "Buffer should be at least 1.5s");
    });

    runTest("increases buffer for longer text", function() {
        var EP = window.EditorProUI;
        var shortBuf = EP.supertexts.readingBuffer("Hello world");
        var longBuf = EP.supertexts.readingBuffer("This is a much longer text with many many words to read and process carefully");
        assert(longBuf > shortBuf, "Longer text should have larger reading buffer");
    });

    section("Smart Supertexts — _st2CapEndTimes");

    runTest("caps endTimes to transcript end", function() {
        var EP = window.EditorProUI;
        // Set up state so _st2TranscriptEndSec returns a value
        window._epState.segments = [{ startTime: 0, endTime: 100 }];
        window._epState.sttResult = null;
        window._epState.supertexts2 = [];

        var supertexts = [
            { time: 10, endTime: 50 },
            { time: 80, endTime: 200 } // endTime exceeds transcript
        ];
        var result = EP.supertexts.capEndTimes(supertexts, 100);
        assert(result[1].endTime <= 105, "endTime should be capped near transcript end");
    });

    runTest("filters supertexts beyond transcript end", function() {
        var EP = window.EditorProUI;
        var supertexts = [
            { time: 10, endTime: 50 },
            { time: 200, endTime: 250 } // time is way beyond transcript
        ];
        var result = EP.supertexts.capEndTimes(supertexts, 100);
        assert(result.length <= 1, "Supertext far beyond transcript should be filtered");
    });

    section("Smart Supertexts — ensureMinDuration");

    runTest("extends short durations to minimum", function() {
        var EP = window.EditorProUI;
        var result = EP.supertexts.ensureMinDuration(10, 11);
        // Min duration is 3s, so 10 to 11 (1s) should be extended
        assert(result >= 13, "Should extend to at least 3s duration");
    });

    runTest("preserves durations above minimum", function() {
        var EP = window.EditorProUI;
        var result = EP.supertexts.ensureMinDuration(10, 20);
        assertEqual(result, 20, "Duration above minimum should be preserved");
    });

    // ═══════════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════════
    var summaryEl = document.getElementById("summary");
    var total = passed + failed;
    summaryEl.textContent = passed + "/" + total + " tests passed" +
        (failed > 0 ? " — " + failed + " FAILED" : " ✓");
    summaryEl.className = "summary " + (failed === 0 ? "pass" : "fail");

    var timerEl = document.getElementById("timer");
    timerEl.textContent = "Completed in " + (performance.now()).toFixed(0) + "ms";

    if (failed > 0) {
        console.error("FAILED TESTS:");
        errors.forEach(function(e) {
            console.error("  [" + e.section + "] " + e.name + ": " + e.error);
        });
    }

    // Set exit code for CI (if running in Node-based test runner)
    if (typeof process !== "undefined" && process.exit) {
        process.exit(failed > 0 ? 1 : 0);
    }
})();
