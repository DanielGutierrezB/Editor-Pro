# 🏗️ Arquitectura — Editor-Pro

## Visión General

```
┌─────────────────────────────────────────────────────────┐
│                    PREMIERE PRO                          │
│                                                          │
│  ┌──────────────────────┐    ┌────────────────────────┐  │
│  │   Panel CEP (HTML)   │    │   ExtendScript (ES3)   │  │
│  │                      │◄──►│                        │  │
│  │  client/js/*.js      │    │  host/*.jsx             │  │
│  │  client/css/*.css    │    │                        │  │
│  │  client/index.html   │    │  Acceso directo a:     │  │
│  │                      │    │  - Secuencias          │  │
│  │  Vanilla JS (IIFEs)  │    │  - Marcadores          │  │
│  │  Sin frameworks      │    │  - Clips de video      │  │
│  │  Sin bundler         │    │  - Essential Graphics  │  │
│  │                      │    │  - Audio export        │  │
│  └──────────────────────┘    └────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Las llamadas a proveedores de IA/STT se hacen directamente desde el panel JS
(vía HTTP a las APIs de cada proveedor, o a Ollama/whisper.cpp locales). No hay
servidor Node.js intermedio.

## Comunicación Panel ↔ Premiere

```
Panel JS                              ExtendScript (ES3)
────────                              ──────────────────
csInterface.evalScript(               function getActiveSequenceInfo() {
  "getActiveSequenceInfo()"               var seq = app.project.activeSequence;
, function(result) {          ◄────       return JSON.stringify({
    var data = JSON.parse(result);            name: seq.name,
    // usar data                              markerCount: seq.markers.numMarkers
  });                                     });
                                      }
```

- Host es **ES3 puro**: sin let/const, sin arrow functions, sin template literals
- Comunicación es **sincrónica por llamada** pero el callback es async
- `TICKS_PER_SECOND = 254016000000` para conversión de tiempo Premiere

## Capas del Sistema

```
┌─────────────────────────────────────────────────────┐
│                    CAPA UI (4 módulos + cutter)      │
│  ui-spellcheck │ ui-supertexts │ ui-edit-suggestions │
│  ui-recording  │ cutter (auto-contenido)             │
├─────────────────────────────────────────────────────┤
│              CAPA ORQUESTADOR                        │
│  main.js — init, event binding, proxies             │
├─────────────────────────────────────────────────────┤
│               CAPA MÓDULOS EXTRAÍDOS                 │
│  prompt-editor │ transcript-parser │ transcript-cache │
│  transcript-manager │ settings │ sequence-controller  │
│  updater (auto-actualización vía GitHub API)         │
├─────────────────────────────────────────────────────┤
│                 CAPA SERVICIOS                        │
│  ai-analyzer │ speech-to-text │ spellcheck-engine    │
│  recording-notes │ context-rules                     │
├─────────────────────────────────────────────────────┤
│                  CAPA CORE                            │
│  state.js │ utils.js │ modal.js │ logger.js          │
│  event-bus.js │ CSInterface.js (Adobe bridge — no tocar) │
└─────────────────────────────────────────────────────┘
```

## Orden de Carga (index.html)

```
1. Core:     logger → CSInterface → state → utils → event-bus → modal
2. Services: settings → sequence-controller → spellcheck-engine →
             context-rules → ai-analyzer → speech-to-text →
             recording-notes
3. Modules:  prompt-editor → transcript-parser → transcript-cache →
             transcript-manager → cutter
4. Updater:  updater
5. Main:     main.js (orchestrator)
6. UI:       ui-spellcheck → ui-supertexts → ui-edit-suggestions →
             ui-recording
```

## Estado

```javascript
// state.js → window._epState
{
    sequenceName: "",       // Secuencia activa
    transcript: "",         // Texto de transcripción
    segments: [],           // Segmentos parseados [{startTime, endTime, text}]
    transcriptJson: null,   // JSON original del transcript
    settings: {
        aiProvider: "ollama",
        aiModel: "mistral-small3.1:latest",
        sttProvider: "elevenlabs",
        sttModel: "scribe_v1"
    },
    // ... resultados por herramienta
}
```

## Patrón de Módulos

Todos los módulos JS siguen el patrón IIFE:

```javascript
(function(global) {
    "use strict";
    
    // Variables locales del closure
    var state, csInterface, showToast;
    
    function _initRefs() {
        state = global._epState;
        csInterface = global._epCSInterface;
        showToast = global._epShowToast;
    }
    
    // ... funciones del módulo
    
    // Exponer API
    global.EditorProUI = global.EditorProUI || {};
    global.EditorProUI.myModule = {
        init: _initRefs,
        doSomething: doSomething
    };
})(window);
```

## Host ExtendScript (ES3)

```
host/
├── index.jsx        ← Entry point (#include de módulos)
├── common.jsx       ← 32 funciones compartidas
├── cutter.jsx       ← executeCuts, trimZoneOnTrack
├── spellcheck.jsx   ← exportSequenceXML, addMarkersFromFile
├── supertexts.jsx   ← insertSupertextMOGRTs, replaceMOGRTClip
└── recording.jsx    ← exportSequenceAudio, openBackupAndCut, marcadores, vistas
```

## Proveedores

| Tipo | Proveedores | Uso |
|------|-------------|-----|
| **IA Texto** | Ollama, Gemini, Claude, GPT, OpenRouter | Análisis de transcript, supertexts, edición |
| **STT** | ElevenLabs Scribe, Whisper local, Whisper API | Transcripción de audio |
| **Visión** | moondream, llava, llama3.2-vision | Clasificación CAM/PC (Vistas) |
