# CLAUDE.md — Editor-Pro (Premiere Plugin)

## Qué es este proyecto

Plugin CEP para Adobe Premiere Pro. Herramientas de edición asistida por IA y transcripción para producción de clases educativas. Vanilla JS, sin frameworks, sin bundler.

## Arquitectura

```
Editor-Pro/
├── client/                  # Panel CEP (HTML + CSS + JS vanilla)
│   ├── index.html           # UI principal — tool-cards colapsables
│   ├── css/                 # CSS modular por feature
│   │   ├── base.css         # Variables, reset, layout, toast, cards
│   │   ├── cutter.css       # Estilos de Cortes Automáticos
│   │   ├── recording.css    # Estilos de Recording Notes
│   │   ├── spellcheck.css   # Estilos de SpellCheck
│   │   └── supertexts.css   # Estilos de Smart Supertexts
│   └── js/                  # Cargados en este orden desde index.html
│       ├── logger.js        # Logger central + captura de log descargable
│       ├── CSInterface.js   # Bridge oficial Adobe CEP (no tocar)
│       ├── state.js         # Estado central (window._epState)
│       ├── utils.js         # DOM helpers, formatters, escaping (window.EPUtils)
│       ├── event-bus.js     # Pub/sub para desacoplar módulos (window._epBus)
│       ├── modal.js         # Sistema de modales
│       ├── settings.js      # Carga/guardado de settings, provider UI
│       ├── sequence-controller.js # Polling de secuencia activa, dropdown
│       ├── spellcheck-engine.js # Hunspell (typo-js) + reglas ortográficas
│       ├── context-rules.js # Reglas de confusión español (haber/a ver, etc.)
│       ├── ai-analyzer.js   # IA multi-proveedor (Ollama, Gemini, Claude, GPT, OpenRouter)
│       ├── speech-to-text.js # STT multi-proveedor (ElevenLabs, Whisper local/API)
│       ├── recording-notes.js # Notas de grabación — detección IN/OUT, segmentos
│       ├── prompt-editor.js # Editor de prompts IA con versionado
│       ├── transcript-parser.js # Parseo de SRT/JSON/prtranscript/captions
│       ├── transcript-cache.js  # Pre-cache de transcripts por secuencia
│       ├── transcript-manager.js # Carga, búsqueda, y UI de transcripts
│       ├── cutter.js        # Cortes automáticos por marcadores
│       ├── cut-validator.js # Validador de cortes: pickups, snapping, reporte (puro, testeable en Node)
│       ├── marker-reviewer.js # Revisar Marcadores: parseo de pares, prompts LLM, clamp, transcript final (puro)
│       ├── updater.js       # Auto-updater vía GitHub API (branch workspace-daniel)
│       ├── main.js          # Orquestador delgado: init, bindings, proxies
│       ├── ui-spellcheck.js # UI de SpellCheck
│       ├── ui-supertexts.js # UI de Smart Supertexts + MOGRT
│       ├── ui-edit-suggestions.js # UI de Sugerencias de Edición
│       ├── ui-recording.js  # UI de Notas de Grabación + STT + Vistas
│       ├── ui-validator.js  # UI del Validador de cortes (paso 5 de Notas de Grabación)
│       └── ui-marker-reviewer.js # UI/orquestación de Revisar Marcadores
├── host/                    # ExtendScript — API de Premiere Pro (ES3)
│   ├── index.jsx            # Entry point (#include de módulos)
│   ├── common.jsx           # Helpers comunes, polyfills, JSON
│   ├── cutter.jsx           # Cortes, marcadores, backup/restore
│   ├── marker-reviewer.jsx  # Revisar Marcadores: mrMoveMarkers (mover = borrar + recrear)
│   ├── spellcheck.jsx       # Exportación XML para spellcheck
│   ├── supertexts.jsx       # MOGRT insertion, Smart Supertexts
│   └── recording.jsx        # Audio export, backup+cut, marcadores, vistas
├── tests/                   # Tests Node de módulos puros: `npm test`
│   └── run-node-tests.js    # Runner (cut-validator + marker-reviewer)
├── Prompts/                 # Plantillas de prompts (.md) por herramienta
├── mogrts/                  # MOGRTs por defecto incluidos con Editor-Pro
├── CSXS/
│   └── manifest.xml         # Manifiesto CEP: com.codigo.editorpro
├── whisper/                 # whisper.cpp: scripts de instalación + modelos .bin
├── VERSION                  # Versión actual (2.2.1)
├── dist/                    # ZXP empaquetado
├── build-zxp.sh             # Firma y empaqueta ZXP
└── install.sh               # Symlink para desarrollo + habilita debug mode
```

## Comunicación Panel ↔ Premiere

```
client/js/*.js  →  csInterface.evalScript("functionName(args)")  →  host/index.jsx  →  return JSON string
```

- El host (`index.jsx`) es ES3 entry point que `#include`s modular .jsx files (common, cutter, spellcheck, supertexts, recording).
- `TICKS_PER_SECOND = 254016000000` para convertir tiempo de Premiere.
- Incluye polyfill JSON propio para ES3.

## Estado central (state.js)

```javascript
state = {
    // Transcripción
    transcript,              // texto crudo del textarea
    segments,                // parseSRT() → [{index, startTime, endTime, text}]
    sequenceName,

    // Audio y STT
    audioPath, audioFileName, transcribing, exporting,
    sttResult,               // resultado STT normalizado {words[], text, language}
    lastWhisperResult,       // último resultado para "Traer transcripción"
    transcriptionBaseName,   // baseName compartido para .wav y .srt
    transcribeFolder,

    // Análisis IA
    analyzing,               // true mientras IA procesa (edit suggestions, etc.)
    textClips, clipResults,  // SpellCheck
    supertexts2,             // Smart Supertexts (MOGRT)
    editSuggestions,         // Edit Suggestions
    editHighlights,          // Highlights detectados
    detectionResult,         // Segmentos IN/OUT
    takeResult,              // Análisis de tomas

    // Notas de grabación
    supplementaryPairs,      // pares IN/OUT de tomas ocultas detectadas por IA
    markersPlaced,           // true si ya se colocaron marcadores

    // Configuración
    settings: { aiProvider, aiModel, sttProvider, sttModel },
    customDictionary,
    ollamaConnected
}
```

## Módulos JS — responsabilidades

### main.js (~3950 líneas)
Controlador central. Todo el wiring de eventos, UI, y flujo entre módulos.
- `init()` — crea instancias de módulos, carga settings, bindings
- `onTranscriptChange()` — parsea SRT, actualiza state.segments
- `startTranscription()` — llama a `stt.transcribe()`, alimenta Recording Notes
- `startEditSuggestions()` — llama a `aiAnalyzer.analyzeEditSuggestions()`
- `applySttResultToRecordingNotes()` — conecta STT con detección de segmentos
- `saveSRTFiles()` — guarda `.srt` usando `stt.saveSRT()`
- `bindCollapsibles()` — maneja colapso de tool-cards + barras de progreso en header
- `placeRecordingMarkers()` — coloca marcadores IN/OUT en la secuencia activa
- `executeRecCuts()` — ejecuta cortes basados en las zonas de remove calculadas
- `restoreRecCutBackup()` — restaura el backup de la secuencia

### ai-analyzer.js
Clase `AIAnalyzer`. Proveedores: `ollama`, `google`, `anthropic`, `openai`.
- `_send(systemMsg, prompt, callback)` — método genérico, sin timeout (espera lo que la IA necesite)
- `analyzeSpellCheck()`, `analyzeSupertexts()`, `analyzeEditSuggestions()`, `analyzeTakes()`
- Prompts por defecto en `SYSTEM_MSGS` y builders `_build*Prompt()`
- Soporta prompts custom editables por el usuario (versionados en localStorage)
- **Idle timeout**: `scheduleIdleTimeout` se reinicia con cada chunk de datos recibido. Solo dispara error si no llegan datos en 60 s.

### speech-to-text.js
Clase `SpeechToText`. Proveedores: `elevenlabs`, `whisper_local`, `whisper_api`.
- `transcribe(filePath, onProgress, callback)` — unifica proveedores
- `generateSRT(result, wordsPerLine)` — SRT agrupado (subtítulos de una línea, default 8 palabras)
- `saveSRT(result, folder, baseName, wordsPerLine)` — escribe un único `.srt`
- Resultado normalizado: `{ words: [{text, start, end, type}], text, language }`

### recording-notes.js
Clase `RecordingNotes`.
- Detecta segmentos por comandos de voz **literales**: IN → "retomemos"/"retoma" o conteo descendente ("3,2,1" / "3,2..."); OUT → "pausa", "corte", "corta", "alto", "para" (estricto, sin falsos positivos)
- `detectSegments()` — analiza `words[]` y devuelve `{inPoints, outPoints, segments, takeGroups, filteredCount, retakeGroupCount}`
- **Conteos**: se detectan en Pass 1; el IN se coloca al **final** del último número del conteo (después de "1"/"uno")
- **OUT timing**: el marcador OUT se coloca al **final de la última palabra de contenido** (antes del trigger "pausa"/"corte"/etc.)
- **Post-procesamiento inteligente**:
  - `_postProcessSegments()`: filtra segmentos cortos (< 5s), vacíos, incompletos (palabras con "--"/...) y autocorrecciones
  - `_groupRetakes()`: agrupa re-tomas por similitud Jaccard de primeras frases (umbral ≥ 0.4); recomienda la última toma de cada grupo
  - Cada segmento tiene flags: `filtered`, `filterReason`, `retakeGroup`, `retakeNum`, `retakeTotal`, `recommended`
  - `_userOverride`: flag manual del usuario para activar/desactivar tomas individualmente
  - `_isActive(seg)`: método que resuelve el estado final (override > filtered > recommended)
- `generateSimpleMarkers()`: genera marcadores para segmentos **activos**. Valida que no haya INs consecutivos sin OUT. Etiqueta "[mejor de N]" en re-tomas
- `getRecommendedSegments()`: devuelve solo segmentos activos para corte y marcadores

### cutter.js
Módulo auto-contenido. DOM IDs prefijados `cutter-*`.
- Lee marcadores de la secuencia, parsea bloques IN/OUT (identificados por `OUT:` con dos puntos)
- Preview de zonas de corte, ejecución de cortes
- **Modo batch**: analiza y corta todas las secuencias del proyecto
- **Detección de warnings**: marcadores IN/OUT huérfanos (sin par)
- **Stop button**: modo single y batch permiten detener
- **Persistencia de sesión**: al volver al inicio, la sesión se conserva
- **Progress en header**: barra de progreso visible cuando la card está colapsada
- Backup y restore de secuencia (individual y masivo)
- **Vista de Cámaras**: mapeo de marcadores a tracks de video (multi-track con checkboxes)
- **Presets de vista**: sistema de presets guardados en localStorage
- **Marcadores post-corte**: panel con marcadores restantes, selección múltiple
- **Colorización de marcadores**: colores por tipo (IN verde, OUT rojo, PV, R, etc.)

### spellcheck-engine.js + context-rules.js
SpellCheck con Hunspell (typo-js) + reglas contextuales para español.

## Tool-cards en la UI (orden en index.html)

| # | ID data-tool | Título | Función |
|---|-------------|--------|---------|
| 0a | `markerreviewer` | Revisar Marcadores | Transcript + LLM validan cada IN/OUT y mueven los marcadores antes de cortar |
| 0 | `cutter` | Cortes Automáticos | Marcadores → IN/OUT → preview → cortar (QE extract in-place) |
| 1 | `transcript` | Transcripción | Cargar/exportar audio, transcribir, importar SRT/JSON |
| 2 | `spellcheck` | SpellCheck IA | Analizar clips de texto (Essential Graphics) |
| 3 | `supertexts2` | Smart Supertexts | Supertextos como gráficos MOGRT en timeline |
| 4 | `editsuggestions2` | Sugerencias de Edición | Analizar transcripción → cortes/highlights/errores |
| 5 | `recording` | Notas de Grabación | STT → IN/OUT → tomas → validación → marcadores → cortar → vistas |

## Revisar Marcadores (marker-reviewer.js + ui-marker-reviewer.jsx/js)

Herramienta previa a Cortes Automáticos: valida cada marcador IN/OUT contra el transcript con el LLM configurado y **mueve los marcadores** a donde la frase tiene sentido. El corte sigue siendo el del Cutter clásico (la vía CA2 de reconstrucción XML fue retirada en v2.2.0 porque el reimport duplicaba las anidaciones).

### Flujo (por secuencia: activa o todas las abiertas)
1. Leer marcadores (`getSequenceMarkers` / `getMarkersForSequence(seqId)`) y parsear pares IN/OUT — misma convención del Cutter, claqueta reconocida por nombre/comentario (`clapper`/`claqueta`) o primer marcador como fallback
2. Conseguir `words[]`: transcript ya guardado en `Transcribe/<seq>.json|.srt` (cache) o exportar audio + STT (pipeline existente). El resultado se guarda como JSON normalizado `{words, text, language}` para no re-transcribir
3. Pre-pase determinístico con `EPCutValidator` (pickups + snapping) como *hints* para el LLM
4. **Una llamada al LLM por unidad** (pares + 1): primer IN ("¿dónde arranca la frase con sentido?"), cada transición OUT→IN (valida ambos y detecta si el bloque siguiente **repite** la frase final del anterior → retrocede el OUT), y último OUT. Cada prompt lleva solo ~60 palabras de contexto con timestamps `(12.3)palabra`, nunca el transcript completo
5. Los tiempos del LLM se **clampan a gaps de silencio** (`clampToWordGap`): nunca se corta a mitad de palabra; una palabra a medias se incluye en el bloque. Movimientos > 30s o deltas < 0.12s se descartan
6. UI de revisión: propuestas con checkbox (razón del LLM, frase repetida, snippet del punto de corte) → "Aplicar seleccionados" mueve los marcadores vía `mrMoveMarkers()` (Premiere no permite cambiar `marker.start`: se borra y recrea conservando nombre/comentario/color/duración)
7. **Transcript final**: concatena las palabras dentro de los bloques ajustados (`buildFinalTranscript`) → texto de la clase como quedaría cortada (guardable como `_final.txt` en Transcribe/, copiable) + **chequeo de coherencia** con el LLM (fluidez entre bloques, frases cortadas, repeticiones, saltos de tema)

### marker-reviewer.js (módulo puro, testeable en Node)
`parsePairs`, `buildBoundaryUnits`, `contextForTime`/`formatContext`, `clampToWordGap`, `buildUnitPrompt`, `resolveUnitResponse` (valida/clampa la respuesta del LLM), `buildFinalTranscript`, `buildCoherencePrompt`.

### Whisper Local — detección ampliada (v2.2.0)
- Modelos ggml/gguf con cualquier nombre en: `<plugin>/whisper/`, `~/.cache/whisper/`, `~/.whisper`, `~/models`, `~/whisper.cpp/models`, Homebrew share, Application Support de MacWhisper y cache de Hugging Face (`models--*whisper*/snapshots/`). Se elige el de mayor calidad (large-v3 > turbo > medium > ...)
- Binarios: `whisper-cli`/`whisper-cpp`/`main` en plugin, Homebrew, `~/whisper.cpp/build/bin/` y PATH
- **Búsqueda profunda automática (v2.2.1)**: si el escaneo de carpetas no encuentra modelo, `deepSearchWhisperModel()` busca ggml/gguf en todo el disco con Spotlight (`mdfind`, macOS) y persiste el resultado en `editorpro_whisper_model_auto`. Se dispara sola al refrescar el estado en Ajustes y antes de transcribir
- **Backend Python (openai-whisper)**: si no hay whisper.cpp pero existe el comando `whisper` con modelos `.pt` en `~/.cache/whisper/`, se transcribe con `whisper <wav> --output_format json --word_timestamps True` (timestamps reales por palabra)
- **Override manual en Ajustes**: "Elegir modelo..." / "Elegir binario..." persistidos en localStorage (`editorpro_whisper_model`/`_binary`), botón "✕ auto" para volver a detección automática

## Validador de cortes (cut-validator.js + ui-validator.js)

Módulo puro NLE-agnóstico que opera sobre `words[]` del STT + segmentos de Notas de Grabación. UI en el paso 5 (antes de colocar marcadores): botón "Validar cortes", propuestas con aceptar/rechazar individual y "Aplicar todos". Los ajustes aceptados modifican `seg.inTime/outTime` (y recalculan `lastPhrase`) antes de `generateSimpleMarkers()`.

- `detectPickups(words, segments)` — detecta cuando una toma re-entra repitiendo la frase final de la anterior (pickup): match contiguo de tokens normalizados (sin acentos/puntuación, mínimo 3 palabras / 12 chars) entre la cola de la toma N y la cabeza de la N+1. Propone retroceder el OUT de N al inicio de la frase repetida para que la frase completa quede en la toma nueva. Si la repetición cubre casi toda la toma previa → warning de re-toma en vez de ajuste
- `snapBoundaries(words, segments)` — propone IN/OUT en los gaps reales de silencio entre palabras (reemplaza los PRE_ROLL/POST_ROLL fijos), sin invadir la palabra trigger
- `validateBoundaries(words, segments)` — reporte por toma: fronteras a mitad de palabra, márgenes justos, contexto de frases antes/después de cada IN/OUT

## Tests (`npm test`)

`tests/run-node-tests.js` corre en Node las suites de `cut-validator` y `marker-reviewer` (transcripts y marcadores sintéticos; el LLM se valida a nivel de prompts/respuestas mockeadas). Los módulos puros exponen `module.exports` además de `window.*`.

## Workflow: Notas de Grabación (7 pasos)

1. **Audio** — Cargar archivo WAV/MP3 o exportar audio de la secuencia activa
2. **Transcripción** — Transcribir con ElevenLabs/Whisper. Produce `{words[], text, language}`
3. **Detección de tomas** — `detectSegments()` identifica IN/OUT, filtra, agrupa retomas. Toggle manual por toma
4. **Revisión con IA** — Compara tomas activas vs inactivas (contenido único faltante) y busca "tomas ocultas" en el transcript fuera de las tomas detectadas
5. **Colocar marcadores** — Antes de colocar: **Validador de cortes** (opcional, botón "Validar cortes") detecta pickups (frases repetidas entre tomas) y ajusta IN/OUT a silencios reales. Luego genera y coloca marcadores `[RN]` IN/OUT en la secuencia. Incluye marcadores IA aceptados (color 6 azul). Re-colocar limpia los anteriores
6. **Cortar secuencia** — Backup + extract de zonas no activas. Restore disponible
7. **Vistas** — Clasifica cada toma como CAM/PC usando Ollama con modelo de visión. Requiere FFmpeg para extraer 3 frames por toma. Etiqueta marcadores con `[CAM]`/`[PC]` y genera preset de vista para Cortes Automáticos

### Step 7 Vistas — Detalles
- **FFmpeg**: se verifica disponibilidad (`ffmpeg` o `/opt/homebrew/bin/ffmpeg`). Sin FFmpeg no funciona
- **Extracción de frames**: 3 frames por toma (inicio+1s, medio, final-1s). Se convierten a base64 para envío a Ollama
- **Conversión de tiempo**: timeline → source usando `clip.inPoint.seconds` + `(takeTime - clip.start.seconds)`
- **Modelos de visión**: `moondream` (ligero), `llava`, `llama3.2-vision`. Se configuran en `PROVIDERS.ollama.visionModels`
- **_send() con imágenes**: 4to parámetro opcional `images` (array de base64). Solo soportado en Ollama
- **Marcadores**: `[RN] [CAM] Toma 1 - ...` o `[RN] [PC] Toma 1 - ...`. El `_viewTag` se almacena en `seg._viewTag`
- **Preset de Cutter**: se guarda en `localStorage` bajo `editorpro_view_presets` como preset "Auto (Notas de Grabación)"

### Funciones JSX para Notas de Grabación
- `addMarkersFromFile(filePath, seqId)` — Coloca marcadores directamente en una secuencia por ID (no requiere que sea la activa)
- `clearMarkersByPrefix(prefix, seqId)` — Limpia marcadores por prefijo en una secuencia específica
- `openBackupAndCut(seqId, cutsFilePath)` — Abre secuencia + backup + ejecuta cortes en una sola llamada atómica
- `getSequenceDurationById(seqId)` — Obtiene duración sin necesitar secuencia activa
- `getVideoClipPaths()` — Retorna rutas de archivo, posición en timeline e inPoint de clips de video

## Smart Supertext 2 — MOGRT Graphics

Inserta supertextos como clips de Essential Graphics (MOGRT) en la línea de tiempo. Soporta un MOGRT diferente por tipo, colores por tipo, nombre de clip = texto, y lógica de cascada para bullets.

### Tipos y MOGRTs
- Un MOGRT distinto por tipo: `title`, `bullet`, `step`, `definition`, `data`, `summary`
- Configurados en `state.mogrtPaths` (objeto), persistido como `edupro_mogrt_paths` en localStorage
- Cada tipo tiene un color de label: title=Mango(7), bullet=Cerulean(4), step=Forest(5), definition=Iris(1), data=Yellow(15), summary=Rose(6)
- Constantes: `ST2_TYPES`, `ST2_TYPE_COLORS`, `ST2_BULLET_SPACING` en main.js

### Flujo
1. Usuario configura un MOGRT por tipo (grid en la UI)
2. Análisis IA (reutiliza `aiAnalyzer.analyzeSupertexts()`)
3. Revisión con checkboxes + dropdown de tipo editable por fila
4. `buildST2Payload()` agrupa bullets consecutivos (cascada) y asigna mogrtPath, bulletTrackOffset, bulletPositionY, colorLabel
5. Inserción: escribe JSON temporal → `insertSupertextMOGRTs()` en ExtendScript
6. Por cada supertexto: `seq.importMGT()` → set texto → set duración → set nombre → set color → ajustar posición Y (bullets)
7. Post-inserción: botón "Reemplazar" visible por fila para cambiar tipo de un clip ya insertado

### Lógica de Bullets en Cascada
- Bullets consecutivos forman un grupo
- Todos terminan al mismo tiempo (endTime del último bullet)
- Cada bullet va en un track diferente (apilados en paralelo)
- Posición Y offset: primer bullet = base (0px), segundo = -70px, tercero = -140px (bottom-to-top)
- `bulletTrackOffset`: 0, 1, 2... relativo al track base
- `bulletPositionY`: 0, -70, -140... aplicado via Motion > Position en ExtendScript

### Reemplazo de clips
- `replaceSingleSupertext(idx)` en main.js → escribe JSON → `replaceMOGRTClip()` en ExtendScript
- Busca clip existente cerca del tiempo objetivo (tolerancia 0.5s), lo elimina, inserta nuevo con MOGRT del tipo actual

### Estado
- `state.supertexts2[]` — resultados con campo `type` editable
- `state.supertexts2Inserted` — true después de crear gráficos (muestra botones Reemplazar)
- `state.mogrtPaths` — objeto `{title: "/path", bullet: "/path", ...}`
- `state.mogrtTrackIndex` — pista base ("auto" o índice numérico)

### Funciones JSX
- `insertSupertextMOGRTs(jsonPath)` — Lee JSON con baseTrackIndex, supertexts[] (cada uno con mogrtPath, bulletTrackOffset, bulletPositionY, colorLabel)
- `replaceMOGRTClip(jsonPath)` — Reemplaza un clip individual en la timeline
- `_setClipPositionY(trackItem, offsetPx, errors, idx)` — Ajusta Motion > Position Y
- `selectMOGRTFile()` — Diálogo nativo para seleccionar .mogrt
- `validateMOGRT(mogrtPath)` / `getAvailableVideoTrackCount()`

## Host ExtendScript — funciones clave (host/*.jsx)

| Función | Uso |
|---------|-----|
| `getActiveSequenceInfo()` | Info de secuencia activa |
| `getSequenceMarkers()` | Leer marcadores para Cutter |
| `executeCuts(filePath)` | Ejecutar cortes desde JSON (In/Out + Extract, con fallbacks) |
| `mrMoveMarkers(jsonPath, seqId?)` | Revisar Marcadores: mover marcadores (borrar + recrear conservando nombre/comentario/color/duración) |
| `addMarkersFromFile(path, seqId)` | Colocar marcadores (por ID o secuencia activa) |
| `clearMarkersByPrefix(prefix, seqId)` | Limpiar marcadores por prefijo |
| `exportSequenceAudio()` | Exportar audio WAV de la secuencia |
| `backupSequence()` / `restoreBackup()` | Backup antes de cortes |
| `restoreBackupById(seqId)` | Restaurar backup de una secuencia específica |
| `openBackupAndCut(seqId, cutsFilePath)` | Abrir + backup + cortar atómicamente |
| `getSequenceDurationById(seqId)` | Duración por ID |
| `findSequenceById(seqId)` | Helper para encontrar secuencia por ID |
| `openSequenceById(seqId)` | Abrir secuencia con verificación y reintentos |
| `getAllProjectSequences()` | Listar secuencias del proyecto |
| `getVideoTrackNames()` | Lista de tracks de video con clips |
| `getVideoClipPaths()` | Rutas de archivo + posición timeline de clips de video |
| `activateViews(jsonPath)` | Activa/desactiva clips por mapeo de vistas |
| `insertSupertextMOGRTs(jsonPath)` | Insertar gráficos MOGRT en la línea de tiempo (ST2, multi-tipo) |
| `replaceMOGRTClip(jsonPath)` | Reemplazar un clip MOGRT individual en la timeline |
| `selectMOGRTFile()` | Diálogo nativo para seleccionar archivo .mogrt |
| `validateMOGRT(mogrtPath)` | Validar existencia y tipo de archivo MOGRT |

## Estrategia de cortes (executeCuts)

1. **Método principal**: Set In/Out points (ticks) + QE `extractEdit()` (ripple delete)
2. **Fallback 1**: QE player methods (`extract`, `rippleDelete`, etc.)
3. **Fallback 2**: DOM sequence methods (`extractEdit`, `extract`)
4. **Fallback 3**: Razor + manual trim/delete por clips
- Zonas se procesan de FIN a INICIO para que los shifts de tiempo no afecten zonas anteriores
- Sleep 800ms entre setInPoint/setOutPoint y extract, 1000ms entre zonas
- QE sequence reference se re-obtiene antes de cada zona

## Convención de nombres de archivo (audio/SRT)

`baseName = nombreSecuencia_AA-MM-DD_HH-MM-SS`

- WAV: `baseName.wav`
- SRT: `baseName.srt` (formato agrupado por línea, ~8 palabras)
- `state.transcriptionBaseName` se resetea en `clearAudio()`

## Patrones importantes

- **IIFE** en todos los módulos: `(function(global) { ... })(window);`
- **No hay módulos ES6**: todo se expone como constructores globales (`window.AIAnalyzer`, etc.)
- **Node.js disponible** en CEP: `require("fs")`, `require("https")`, `require("child_process")`
- **localStorage** para persistir settings, API keys, prompts custom, diccionario, presets de vista
- **Prompts versionables**: el usuario puede editar y guardar versiones de los prompts de IA
- **Callbacks everywhere**: no se usan Promises (compatibilidad con CEP antiguo)
- **EventBus** (`event-bus.js`): pub/sub para desacoplar módulos. Los módulos se suscriben a eventos en su `init()` en vez de ser llamados directamente desde sequence-controller. Eventos:
  - `sequence-changed` → `{ name }` — secuencia activa cambió
  - `sequence-first-load` → `{ name }` — primera secuencia detectada al abrir panel
  - `transcript-changed` → `{}` — transcripción actualizada
  - `state-restored` → `{ sequenceName }` — state restaurado desde cache
  - **Para agregar features nuevos**: suscribirse al EventBus en init(), NO agregar calls manuales en sequence-controller

## Cosas a tener en cuenta

- **No tocar CSInterface.js** — es el bridge oficial de Adobe.
- **host/index.jsx es ES3**: sin let, const, arrow, template literals, destructuring.
- **Todo es callback-based**: no hay async/await ni Promises.
- **El CSS usa variables**: cambiar colores en las variables `:root`.
- **Cada tool-card es independiente** pero comparten state a través de main.js.
- **Whisper local** requiere instalación previa (`whisper/setup-whisper.sh`).
- **Las peticiones a la IA no tienen timeout**: la IA se tarda lo que necesite.
- **`state.analyzing`** bloquea la UI; se usa try-finally en callbacks de IA para asegurar que siempre se resetea. `clearAllToolState()` también lo resetea.
- **Operaciones por seqId**: `addMarkersFromFile` y `clearMarkersByPrefix` pueden operar directamente en una secuencia por ID sin necesidad de que sea la activa. Los cortes (`openBackupAndCut`) sí requieren abrir la secuencia pero lo hacen atómicamente en una sola llamada JSX.
- **`clearContainer(el)`**: utility en main.js que clona un DOM node sin children/listeners antes de re-rendering, preventing memory leaks in dynamic lists.
- **`safeCallback(fn)`**: wraps any callback in try-catch that shows errors via `showToast`. Use for callback consumers where errors should be visible to the user.
- **Sequence cache is LRU-bounded**: `_seqCache` evicts entries beyond 20 using `_seqCacheTouch()`.
- **Polling unificado**: solo main.js tiene `setInterval` para `refreshSequenceInfo` (cada 2s). `cutter.js` ya no tiene su propio timer.
- **Clapperboard skip configurable**: checkbox en la UI del Cutter, persistido en `localStorage` key `editorpro_skip_clapperboard`.
- **ElevenLabs streaming**: para archivos > 100MB, `_transcribeElevenLabsStreaming()` usa `fs.createReadStream()` en lugar de `readFileSync`.
- **Backup persistence**: `_batchBackups` se persisten a `editorpro_backups.json` junto al `.prproj`; se restauran al cargar el host.
- **OUT triggers**: además de "pausa", ahora "corte", "corta", "alto" y "para" disparan OUT en Recording Notes.
- **Creación de carpetas lazy**: no se crean carpetas por secuencia de forma anticipada. La carpeta de transcripción (`state.transcribeFolder`) se crea solo en la primera escritura real (exportar audio, guardar transcript, o exportar SRT/JSON).

## Header del panel

El header tiene 3 botones (además del dropdown de secuencia activa):

1. **Log** (icono de descarga) — descarga el log de la sesión a la carpeta de Descargas.
2. **Recargar / Actualizar** — recarga el panel y verifica actualizaciones vía GitHub API. Muestra la versión actual (`v2.2.1`); cuando hay una actualización disponible muestra la transición pulsante (p.ej. `v2.2.0 → v2.2.1`).
3. **Ajustes** — abre el panel de configuración (proveedor STT, proveedor de IA, API keys, modelo).

> Nota histórica: los botones de debug de MOGRT (🔍/🔬) fueron removidos.

## Versión y auto-actualización

- La versión vive en el archivo `VERSION` (actual: **2.2.1**) y en `CSXS/manifest.xml`.
- `updater.js` implementa un auto-updater basado en la GitHub API (no requiere git instalado) que descarga desde la rama **`workspace-daniel`**.
