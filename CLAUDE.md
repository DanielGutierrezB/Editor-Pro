# CLAUDE.md — Editor-Pro (Premiere Plugin)

## Qué es este proyecto

Plugin CEP para Adobe Premiere Pro. Herramientas de edición asistida por IA y transcripción para producción de clases educativas. Vanilla JS, sin frameworks, sin bundler.

## Arquitectura

```
Editor-Pro/
├── client/                  # Panel CEP (HTML + CSS + JS vanilla)
│   ├── index.html           # UI principal — tool-cards colapsables
│   ├── css/styles.css       # Un solo archivo CSS, tema oscuro, variables CSS
│   └── js/
│       ├── CSInterface.js   # Bridge oficial Adobe CEP (no tocar)
│       ├── main.js          # Controlador central — state, bindings, flujo
│       ├── ai-analyzer.js   # IA multi-proveedor (Ollama, Gemini, Claude, GPT)
│       ├── speech-to-text.js # STT multi-proveedor (ElevenLabs, Whisper local/API)
│       ├── recording-notes.js # Notas de grabación — detección IN/OUT, segmentos
│       ├── cutter.js        # Cortes automáticos por marcadores
│       ├── motion-pro.js    # Motion-Pro — server lifecycle, generación, versionado
│       ├── spellcheck-engine.js # Hunspell (typo-js) + reglas ortográficas
│       └── context-rules.js # Reglas de confusión español (haber/a ver, etc.)
├── host/
│   └── index.jsx            # ExtendScript — API de Premiere Pro (ES3)
├── motion-server/           # Node.js Express server para Motion-Pro (puerto 3847)
│   ├── server.js            # Entry point Express
│   ├── routes/              # generate, render, feedback, studio
│   └── lib/                 # llm.js, remotion-manager.js, prompts.js
├── motion-render/           # Proyecto Remotion (React/TSX → MP4)
│   ├── src/components/      # Safe, E, Fd, theme (reusables)
│   ├── src/compositions/    # TSX generados por LLM (auto)
│   └── src/Root.tsx         # Registro de composiciones (auto-actualizado)
├── CSXS/
│   └── manifest.xml         # Manifiesto CEP: com.codigo.editorpro
├── whisper/                 # whisper.cpp: scripts de instalación + modelos .bin
├── dist/                    # ZXP empaquetado
├── build-zxp.sh             # Firma y empaqueta ZXP
└── install.sh               # Symlink para desarrollo + habilita debug mode
```

## Comunicación Panel ↔ Premiere

```
client/js/*.js  →  csInterface.evalScript("functionName(args)")  →  host/index.jsx  →  return JSON string
```

- El host (`index.jsx`) es ExtendScript **ES3**: no hay let/const, no hay arrow functions, no hay template literals.
- `TICKS_PER_SECOND = 254016000000` para convertir tiempo de Premiere.
- Incluye polyfill JSON propio para ES3.

## Estado central (main.js)

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
| 0 | `cutter` | Cortes Automáticos | Marcadores → IN/OUT → preview → cortar |
| 1 | `transcript` | Transcripción | Cargar/exportar audio, transcribir, importar SRT |
| 2 | `spellcheck` | SpellCheck IA | Analizar clips de texto (Essential Graphics) |
| 3 | `supertexts2` | Smart Supertexts | Supertextos como gráficos MOGRT en timeline |
| 4 | `editsuggestions` | Sugerencias de Edición | Analizar transcripción → cortes/highlights |
| 5 | `reelproposal` | Propuesta de Reel | Analizar transcripción → proponer reels virales |
| 6 | `recording` | Notas de Grabación | STT → IN/OUT → tomas → marcadores → cortar |
| 7 | `motionpro` | Motion-Pro | Transcript → IA analiza → genera motion graphics con Remotion → timeline |

## Workflow: Notas de Grabación (7 pasos)

1. **Audio** — Cargar archivo WAV/MP3 o exportar audio de la secuencia activa
2. **Transcripción** — Transcribir con ElevenLabs/Whisper. Produce `{words[], text, language}`
3. **Detección de tomas** — `detectSegments()` identifica IN/OUT, filtra, agrupa retomas. Toggle manual por toma
4. **Revisión con IA** — Compara tomas activas vs inactivas (contenido único faltante) y busca "tomas ocultas" en el transcript fuera de las tomas detectadas
5. **Colocar marcadores** — Genera y coloca marcadores `[RN]` IN/OUT en la secuencia. Incluye marcadores IA aceptados (color 6 azul). Re-colocar limpia los anteriores
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

## Host ExtendScript — funciones clave (host/index.jsx)

| Función | Uso |
|---------|-----|
| `getActiveSequenceInfo()` | Info de secuencia activa |
| `getSequenceMarkers()` | Leer marcadores para Cutter |
| `executeCuts(filePath)` | Ejecutar cortes desde JSON (In/Out + Extract, con fallbacks) |
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
- **Motion-Pro pipeline timeout**: configurable (default 5 min), stored in `localStorage` key `editorpro_mp_pipeline_timeout`.
- **Backup persistence**: `_batchBackups` se persisten a `editorpro_backups.json` junto al `.prproj`; se restauran al cargar el host.
- **OUT triggers**: además de "pausa", ahora "corte", "corta", "alto" y "para" disparan OUT en Recording Notes.

## Motion-Pro — Motion Graphics Automáticos

Genera motion graphics animados a partir de la transcripción usando Remotion.

### Arquitectura

```
Panel CEP (client/js/motion-pro.js)
    ↕ HTTP localhost:3847
motion-server/ (Express, Node.js)
    ↕ LLM API + Remotion CLI
motion-render/ (Remotion project, React/TSX)
    → MP4 output
    ↕ evalScript()
host/index.jsx (importAndPlaceMotions, replaceMotionOnTrack)
```

### Flujo (3 pasos)

1. **Análisis** — Envía transcript al LLM via `ai-analyzer.js:analyzeMotionProposals()`. Devuelve propuestas con tipo, timestamps, descripción, prioridad.
2. **Selección y Generación** — Usuario selecciona propuestas con checkboxes. Por cada una: LLM genera TSX → Remotion renderiza MP4 → se coloca en timeline.
3. **Panel de Control** — Fichas por motion generado con: dropdown de versión, botón Remotion Studio, textarea de feedback, regenerar con/sin feedback.

### Directorios nuevos

- `motion-server/` — Express en puerto 3847. Endpoints: `/api/generate`, `/api/render`, `/api/feedback`, `/api/studio`
- `motion-render/` — Proyecto Remotion. Componentes base en `src/components/` (Safe, E, Fd, theme). Composiciones generadas en `src/compositions/`. Root.tsx se actualiza automáticamente.

### Módulo JS (motion-pro.js)

Clase `MotionPro`. Maneja:
- `startServer()/stopServer()/checkServer()` — lifecycle del servidor Express (spawn via child_process)
- `generateMotion()` — pipeline: POST /api/generate → POST /api/render → callback con mp4Path
- `regenerateWithFeedback()` — POST /api/feedback → POST /api/render
- `regenerateFull()` — nueva generación completa
- `getStudioUrl()/startStudio()` — abre Remotion Studio en browser
- `saveState()/loadState()` — persistencia en localStorage (`editorpro_motionpro_state`)

### Versionado

Cada motion tiene array `versions[]` con `{version, compositionId, tsxPath, mp4Path, status, feedback}`. Dropdown en UI para cambiar versión activa. Cada nueva versión se coloca en el track inmediatamente superior (stacking).

### Funciones JSX

| Función | Uso |
|---------|-----|
| `importAndPlaceMotions(jsonPath)` | Importa MP4s al proyecto, crea bin "Motion-Pro", inserta en track auto (último + 1) |
| `replaceMotionOnTrack(jsonPath)` | Importa nueva versión, coloca en track especificado (stacking) |
| `getNextAvailableTrack()` | Retorna índice del siguiente track disponible |

### Tipos de motion

| Tipo | Label | Color |
|------|-------|-------|
| comparison | Comparación | #00d4ff |
| steps | Pasos | #34d399 |
| icons | Iconos | #a78bfa |
| chart | Gráfico | #fb923c |
| title | Título | #818cf8 |
| cards | Cards | #2dd4bf |
| diagram | Diagrama | #f87171 |
| ui | UI Mockup | #fbbf24 |
