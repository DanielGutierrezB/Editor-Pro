/**
 * state.js — Central state manager for Editor-Pro
 * Defines the canonical state object, shared across all modules as window._epState.
 */
(function(global) {
    "use strict";

    var state = {
        transcript: "",
        segments: [],
        sequenceName: "",
        analyzing: false,
        st2Analyzing: false,
        es2Analyzing: false,
        recAnalyzing: false,
        spellChecking: false,
        ollamaConnected: false,
        textClips: [],
        clipResults: {},
        supertexts2: [],
        supertexts2Inserted: false,
        mogrtPaths: { title: "", bullet: "", step: "", definition: "", data: "", summary: "", highlight: "", question: "" },
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
        // B-Roll
        brAnalyzing: false,
        brGenerating: false,
        settings: {
            aiProvider: "ollama",
            aiModel: "mistral-small3.1:latest",
            sttProvider: "elevenlabs",
            sttModel: "scribe_v1"
        }
    };

    global._epState = state;

})(window);
