/**
 * state.js — Central state manager for Editor-Pro
 * Defines the canonical state object and typed accessors.
 * Exposes: window._epState (raw object, backward compat) and window.EPState
 */
(function(global) {
    "use strict";

    var state = {
        transcript: "",
        segments: [],
        sequenceName: "",
        analyzing: false,
        ollamaConnected: false,
        textClips: [],
        clipResults: {},
        supertexts2: [],
        supertexts2Inserted: false,
        mogrtPaths: { title: "", bullet: "", step: "", definition: "", data: "", summary: "", highlight: "" },
        mogrtTrackIndex: "auto",
        es2Highlights: [],
        es2Suggestions: [],
        es2Errors: [],
        reelProposals: [],
        customDictionary: [],
        // Recording Notes
        audioPath: "",
        audioFileName: "",
        audioFileSize: 0,
        transcribing: false,
        exporting: false,
        sttResult: null,
        detectionResult: null,
        takeResult: null,
        supplementaryPairs: [],
        aiAdjustments: [],
        aiSuggestionStates: {},
        markersPlaced: false,
        transcribeFolder: (function() {
            try { return localStorage.getItem("editorpro_transcript_folder") || ""; } catch(_e) { return ""; }
        })(),
        lastWhisperResult: null,
        transcriptCache: {},
        // Motion-Pro
        mpAnalyzing: false,
        mpGenerating: false,
        mpGenerateCancelRequested: false,
        settings: {
            aiProvider: "ollama",
            aiModel: "mistral-small3.1:latest",
            sttProvider: "elevenlabs",
            sttModel: "scribe_v1"
        }
    };

    function getState(key) {
        return state[key];
    }

    function setState(key, value) {
        state[key] = value;
    }

    global.EPState = {
        get: getState,
        set: setState,
        raw: state
    };

    // Backward compat: UI modules and main.js access window._epState directly
    global._epState = state;

})(window);
