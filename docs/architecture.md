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
│  └──────────┬───────────┘    └────────────────────────┘  │
│             │                                             │
└─────────────┼─────────────────────────────────────────────┘
              │ HTTP localhost:3847
              ▼
┌─────────────────────────────────┐
│      Motion Server (Node.js)    │
│                                 │
│  Express + LLM APIs + Remotion  │
│                                 │
│  ┌───────────┐  ┌────────────┐  │
│  │  LLM API  │  │  Remotion  │  │
│  │ (generate │  │  (render   │  │
│  │  TSX)     │  │   MP4)     │  │
│  └───────────┘  └────────────┘  │
└─────────────────────────────────┘
```

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
┌───────────────────────────────────────────────────────────────┐
│                       CAPA UI (9 módulos)                       │
│  ui-spellcheck │ ui-supertexts │ ui-edit-suggestions            │
│  ui-recording  │ ui-motion-pro │ cutter                         │
│  ui-broll-proposals │ ui-broll-clips │ ui-broll                 │
├───────────────────────────────────────────────────────────────┤
│                    CAPA ORQUESTADOR                             │
│  main.js — init, event binding, wiring entre módulos (~700 ln)  │
├───────────────────────────────────────────────────────────────┤
│                  CAPA MÓDULOS EXTRAÍDOS                         │
│  prompt-editor │ transcript-parser │ transcript-manager         │
│  settings │ sequence-controller │ batch-seq-runner              │
│  motion-server-client │ broll-styles │ broll-scenes │ updater   │
├───────────────────────────────────────────────────────────────┤
│                      CAPA SERVICIOS                             │
│  ai-analyzer │ speech-to-text │ spellcheck-engine               │
│  recording-notes │ motion-pro │ broll │ context-rules           │
├───────────────────────────────────────────────────────────────┤
│                       CAPA CORE                                 │
│  state.js │ utils.js │ event-bus.js │ logger.js                 │
│  CSInterface.js (Adobe bridge — no tocar)                       │
└───────────────────────────────────────────────────────────────┘
```

> Nota: `transcript-cache.js` y `modal.js` fueron eliminados en el refactor de
> calidad de código. La lógica de auto-load y cache por secuencia vive ahora en
> `transcript-manager.js`, y las utilidades de modal quedaron cubiertas por
> `utils.js`/`transcript-manager.js`.

## Orden de Carga (index.html)

```
1. Core:     logger → CSInterface → state → utils → event-bus
2. Services: settings → sequence-controller → spellcheck-engine →
             context-rules → ai-analyzer → speech-to-text →
             recording-notes → batch-seq-runner →
             motion-server-client → motion-pro →
             broll → broll-styles → broll-scenes
3. Modules:  prompt-editor → transcript-parser →
             transcript-manager → cutter → updater
4. Main:     main.js (orchestrator)
5. UI:       ui-spellcheck → ui-supertexts → ui-edit-suggestions →
             ui-recording → ui-motion-pro →
             ui-broll-proposals → ui-broll-clips → ui-broll
```

## EventBus (event-bus.js)

Pub/sub (`window._epBus`) que desacopla los módulos: en vez de que
`sequence-controller` llame a cada feature directamente, los módulos se suscriben
a eventos en su `init()`. Eventos principales:

| Evento | Payload | Significado |
|--------|---------|-------------|
| `sequence-changed` | `{ name }` | La secuencia activa cambió |
| `sequence-first-load` | `{ name }` | Primera secuencia detectada al abrir el panel |
| `transcript-changed` | `{}` | La transcripción se actualizó |
| `state-restored` | `{ sequenceName }` | State restaurado desde cache |

## Estado

```javascript
// state.js → window._epState
{
    sequenceName: "",       // Secuencia activa
    transcript: "",         // Texto de transcripción
    segments: [],           // Segmentos parseados [{startTime, endTime, text}]
    sttResult: null,        // Resultado STT normalizado {words[], text, language}
    settings: {
        aiProvider: "ollama",
        aiModel: "mistral-small3.1:latest",
        sttProvider: "elevenlabs",
        sttModel: "scribe_v1"
    },
    // ... resultados por herramienta:
    // clipResults (SpellCheck), supertexts2 (Smart Supertexts),
    // editSuggestions / editHighlights, detectionResult / takeResult
    // (Notas de Grabación), etc.
}
```

> El estado por herramienta y por secuencia se cachea con un LRU acotado a 20
> secuencias (`_seqCache`); al cambiar de secuencia se guarda el estado actual y se
> restaura el de la nueva (o se hace auto-load del transcript si no hay cache).
> B-Roll y Motion-Pro persisten su estado por sesión en `localStorage`
> (`editorpro_broll_state`, `editorpro_motionpro_state`).

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

`host/index.jsx` es el entry point que hace `#include` de los módulos. El
`#include` de ExtendScript es concatenación textual y las declaraciones de función
se hoisting-ean por todo el script, así que los módulos pueden llamarse entre sí
sin importar el orden de inclusión.

```
host/
├── index.jsx             ← Entry point (#include de los módulos)
├── common.jsx            ← Polyfill JSON (ES3) + TICKS_PER_SECOND
├── backup.jsx            ← backupSequence / restoreBackup / restoreBackupById
├── bin-utils.jsx         ← búsqueda/creación de bins en el project panel
├── sequence-info.jsx     ← getSequenceMarkers, getVideoClipPaths, activateViews, etc.
├── marker-ops.jsx        ← limpieza/colorización de marcadores post-corte
├── sequence-discovery.jsx← listado/navegación multi-secuencia del proyecto
├── cutter.jsx            ← executeCuts, trimZoneOnTrack
├── spellcheck.jsx        ← exportSequenceXML, addMarkersFromFile, clearMarkersByPrefix
├── supertexts.jsx        ← insertSupertextMOGRTs, replaceMOGRTClip
├── recording.jsx         ← exportSequenceAudio, openBackupAndCut, createReelSequence
├── motion.jsx            ← importAndPlaceMotions, replaceMotionOnTrack, importAndPlaceAbove
└── broll.jsx             ← importAndPlaceBroll, replaceBrollClip, importAndPlaceAudio
```

> El antiguo `common.jsx` (~1160 líneas) se dividió en `backup.jsx`, `bin-utils.jsx`,
> `sequence-info.jsx`, `marker-ops.jsx` y `sequence-discovery.jsx`; hoy `common.jsx`
> solo contiene el polyfill de JSON y `TICKS_PER_SECOND`.

## Motion Server (Node.js) + B-Roll

`motion-server/` es un servidor Express en el puerto **3847** que Motion-Pro y
B-Roll usan vía HTTP. `client/js/motion-server-client.js` (`createMotionServerClient`)
es el cliente HTTP compartido por `motion-pro.js` y `broll.js`.

```
motion-server/
├── server.js             ← Entry point Express (puerto 3847)
├── routes/               ← generate, render, feedback, propose, studio, broll
└── lib/                  ← llm, prompts (+ prompts/), remotion-manager,
                             tsx-sanitizer/validator, timing-validator,
                             image/video/audio-generator, render-queue, etc.

motion-render/            ← Proyecto Remotion (React/TSX → MP4)
```

## Proveedores

| Tipo | Proveedores | Uso |
|------|-------------|-----|
| **IA Texto** | Ollama, Gemini, Claude, GPT, OpenRouter | Análisis de transcript, supertexts, edición, motion, B-roll |
| **STT** | ElevenLabs Scribe, Whisper local, Whisper API | Transcripción de audio |
| **Visión** | moondream, llava, llama3.2-vision (Ollama) | Clasificación CAM/PC |
| **Imagen (B-Roll)** | placeholder, ComfyUI/Flux, AUTOMATIC1111, FAL.ai | Generación de imágenes |
| **Video (B-Roll)** | placeholder, LTX local, Kling, FAL.ai, Gemini Veo | Image-to-video |
| **Audio (B-Roll)** | placeholder, ElevenLabs SFX | Audio ambiental |
| **Render** | Remotion (local) | Motion graphics → MP4 |
