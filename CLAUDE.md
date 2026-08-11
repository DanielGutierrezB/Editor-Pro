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
│       ├── claude-code.js   # Sesión de Claude vía CLI de Claude Code (login sin API key)
│       ├── ai-analyzer.js   # IA multi-proveedor (Ollama, Claude sesión/API, Gemini, GPT, OpenRouter)
│       ├── speech-to-text.js # STT multi-proveedor (ElevenLabs, Whisper local/API)
│       ├── recording-notes.js # Notas de grabación — detección IN/OUT, segmentos
│       ├── prompt-editor.js # Editor de prompts IA con versionado
│       ├── transcript-parser.js # Parseo de SRT/JSON/prtranscript/captions
│       ├── transcript-cache.js  # Pre-cache de transcripts por secuencia
│       ├── transcript-manager.js # Carga, búsqueda, y UI de transcripts
│       ├── transcript-edit.js # Alinea texto editado sobre words[] preservando timings (puro, testeable en Node)
│       ├── transcript-repeats.js # Detecta ideas repetidas (pickups) y aplica el corte en words[] (puro)
│       ├── cutter.js        # Cortes automáticos por marcadores
│       ├── cut-validator.js # Validador de cortes: pickups, snapping, reporte (puro, testeable en Node)
│       ├── marker-reviewer.js # Revisar Marcadores: parseo de pares, prompts LLM, clamp, transcript final (puro)
│       ├── marker-anchor.js # La frase y las órdenes que el CD escribió en el marcador, buscadas en el transcript (puro)
│       ├── audio-onset.js   # Mide en el WAV dónde arranca y termina el sonido: alinea el transcript y el frame de cada corte (puro + fs)
│       ├── marker-precision.js # Puntos de corte candidatos + prompt de elección para mover marcadores (puro)
│       ├── marker-verify.js # Revisión del resultado: verifica los marcadores puestos contra el transcript (puro)
│       ├── thecutter-core.js # The Cutter: zonas de corte, duraciones de bloque, vistas, transcript timed (puro)
│       ├── updater.js       # Auto-updater vía GitHub API (branch workspace-daniel)
│       ├── main.js          # Orquestador delgado: init, bindings, proxies
│       ├── ui-spellcheck.js # UI de SpellCheck
│       ├── ui-supertexts.js # UI de Smart Supertexts + MOGRT
│       ├── ui-edit-suggestions.js # UI de Sugerencias de Edición
│       ├── ui-recording.js  # UI de Notas de Grabación + STT + Vistas
│       ├── ui-validator.js  # UI del Validador de cortes (paso 5 de Notas de Grabación)
│       ├── ui-marker-reviewer.js # UI/orquestación de Revisar Marcadores
│       ├── ui-transcribe-batch.js # Transcribir secuencias (actual/batch) + biblioteca de transcripts editables
│       └── ui-thecutter.js  # The Cutter: pipeline de 11 pasos del primer corte automático
├── host/                    # ExtendScript — API de Premiere Pro (ES3)
│   ├── index.jsx            # Entry point (#include de módulos)
│   ├── common.jsx           # Helpers comunes, polyfills, JSON
│   ├── cutter.jsx           # Cortes, marcadores, backup/restore
│   ├── marker-reviewer.jsx  # Revisar Marcadores: mrMoveMarkers (mover = borrar + recrear)
│   ├── spellcheck.jsx       # Exportación XML para spellcheck
│   ├── supertexts.jsx       # MOGRT insertion, Smart Supertexts
│   └── recording.jsx        # Audio export, backup+cut, marcadores, vistas
├── tests/                   # Tests Node de módulos puros: `npm test`
│   └── run-node-tests.js    # Runner (cut-validator, marker-reviewer, marker-precision, marker-verify, mlx-parser, transcript-edit, transcript-repeats, thecutter-core)
├── Prompts/                 # Plantillas de prompts (.md) por herramienta
├── mogrts/                  # MOGRTs por defecto incluidos con Editor-Pro
├── CSXS/
│   └── manifest.xml         # Manifiesto CEP: com.codigo.editorpro
├── whisper/                 # STT local: setup-mlx.sh (MLX/Apple Silicon), setup-whisper.sh (whisper.cpp) + modelos .bin
├── VERSION                  # Versión actual (2.25.1)
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
Clase `AIAnalyzer`. Proveedores: `ollama`, `claude_code`, `google`, `anthropic`, `openai`, `openrouter`.
- `_send(systemMsg, prompt, callback)` — método genérico, sin timeout (espera lo que la IA necesite)
- `analyzeSpellCheck()`, `analyzeSupertexts()`, `analyzeEditSuggestions()`, `analyzeTakes()`
- Prompts por defecto en `SYSTEM_MSGS` y builders `_build*Prompt()`
- Soporta prompts custom editables por el usuario (versionados en localStorage)
- **Idle timeout**: `scheduleIdleTimeout` se reinicia con cada chunk de datos recibido. Solo dispara error si no llegan datos en 60 s.
- `fetchAnthropicModels(cb)` — `GET /v1/models` para llenar el dropdown con los modelos que Claude ofrece hoy (proveedor `anthropic`, botón ↻ en Ajustes)
- `verifyClaudeCode(cb)` — llamada mínima para probar la sesión de `claude_code`; devuelve el modelo que respondió

### claude-code.js — Claude con la cuenta del usuario (sin API key)
Proveedor `claude_code`: en vez de una API key usa la **sesión del CLI de Claude Code**
instalado en la Mac (`claude -p --output-format json`), así el panel consume el plan de
Claude del usuario.

- **Login de un botón**: `login()` abre Terminal.app con `claude auth login` (el OAuth
  necesita navegador + terminal interactiva) y `waitForLogin()` sondea `auth status`
  cada 3 s para que Ajustes se actualice solo al conectar. `logout()` cierra la sesión.
- `status()` → `claude auth status --json` → `{loggedIn, email, orgName, authMethod, apiKeySource}`.
  Ajustes muestra la cuenta conectada; `state.ccSession` guarda el resultado.
- `findBinary()` busca el CLI en `~/.local/bin`, `~/.claude/local`, Homebrew, `/usr/local/bin`
  y como último recurso pregunta al shell de login (CEP hereda un PATH mínimo).
  Override manual en `localStorage` (`editorpro_claude_binary`).
- `prompt({system, prompt, model, timeoutMs, onWait})`: prompt y system van **por archivo
  temporal** (`--system-prompt-file` + redirección `< archivo`) y la llamada se hace con
  `child_process.exec`, el mismo patrón que ya usan whisper/ffmpeg en este panel. Escribirle
  al stdin del hijo desde CEP dejaba la UI colgada sin que el callback llegara nunca, y una
  transcripción (200 KB+) tampoco cabe en un argumento. Los temporales se borran siempre.
  Flags: `--strict-mcp-config`, `--no-session-persistence`, `--disallowed-tools` (queremos
  texto, no un agente) y `cwd` neutro para no cargar el CLAUDE.md ni el .mcp.json de ningún
  proyecto. Devuelve `{abort}`.
- **Entorno del hijo saneado**: se borran `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` (si están
  vencidas el CLI las prefiere sobre la sesión y responde 401 aunque el login esté bien) y
  `ELECTRON_RUN_AS_NODE`/`NODE_OPTIONS`/`NODE_PATH` (heredadas del runtime del panel, cambian
  cómo arranca el node del CLI). Se garantizan `HOME` y un `PATH` con los directorios usuales.
- **Modelos**: alias `sonnet`/`opus`/`haiku` (+ `default`), que siempre resuelven al último
  modelo de cada familia, así la lista no envejece.
- **Nunca se espera en silencio**: `onWait(segundos)` corre cada segundo y la UI muestra el
  contador (Ajustes y paso 1 de The Cutter). Toda llamada tiene tope — 30 s en "Verificar",
  45 s en el pre-chequeo de The Cutter, 8 min por defecto — porque ante un 401 el CLI reintenta
  ~3 min en silencio; al vencer se mata el proceso y se sugiere volver a iniciar sesión.

### speech-to-text.js
Clase `SpeechToText`. Proveedores: `elevenlabs`, `whisper_local`, `whisper_api`.
- `transcribe(filePath, onProgress, callback)` — unifica proveedores
- `generateSRT(result, wordsPerLine)` — SRT agrupado (subtítulos de una línea, default 8 palabras)
- `saveSRT(result, folder, baseName, wordsPerLine)` — escribe un único `.srt`
- Resultado normalizado: `{ words: [{text, start, end, type}], text, language }`
- **`whisper_local` tiene 3 motores** (auto-detectados por `getWhisperLocalStatus()`, en orden de preferencia): `mlx` → `cpp` → `python`.
  - **MLX (v2.6.0, Apple Silicon)**: motor preferido en Macs M-series. CLI `mlx_whisper` en el venv del plugin (`~/.editorpro/mlx-whisper-venv/bin/mlx_whisper`, instalar con `whisper/setup-mlx.sh`) o en PATH/`--user`. Modelo por defecto `mlx-community/whisper-large-v3-turbo` (cache HuggingFace). Timestamps reales por palabra, ~15-27x tiempo real en M3. Overrides: `localStorage` `editorpro_mlx_binary` / `editorpro_mlx_model`.
  - **cpp**: whisper.cpp (`-ml 1 -sow` para word-level real; fallback a estimación ponderada si el build no los soporta).
  - **python**: openai-whisper (`--word_timestamps True`), modelos `.pt` en `~/.cache/whisper/`.
  - `parseWhisperSegmentsToWords(data)` (estático): parser compartido MLX/Python del JSON de Whisper (`segments[].words[]` → `words[]`).

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

**El panel vacío dice por qué lo está** (`loadPostCutMarkers`, v2.25.1). Los marcadores que quedan se leen desde un solo sitio: los tres flujos que los cargaban (corte suelto, abrir una secuencia del lote, refrescar tras borrar) hacían cada uno su llamada con un `if (result.markers)` **sin `else`**, así que un error del host o una secuencia que no llegó a activarse dejaban "Marcadores 0" y la Vista de Cámaras escondida, sin toast ni línea de log — indistinguible de una secuencia que de verdad se quedó sin marcadores. Ahora el fallo se dice, queda en el log y el panel trae un botón **Recargar marcadores** para reintentar sin repetir el corte. En el lote se mira además el `verified` de `openSequenceById`: si Premiere no cambió de secuencia (reintenta 8 s), leer los marcadores de la que esté activa es leer los de otra clase. Y si hay marcadores pero ninguno con nombre de vista, la Vista de Cámaras lo dice en vez de desaparecer.

### spellcheck-engine.js + context-rules.js
SpellCheck con Hunspell (typo-js) + reglas contextuales para español.

## Tool-cards en la UI (orden en index.html)

| # | ID data-tool | Título | Función |
|---|-------------|--------|---------|
| 00 | `thecutter` | The Cutter | Pipeline de primer corte: transcript → validar IN/OUT → leer la clase → cortar → vistas → marcadores → transcript → sugerencias |
| 0a | `markerreviewer` | Revisar Marcadores | Transcript + LLM validan cada IN/OUT y mueven los marcadores antes de cortar |
| 0 | `cutter` | Cortes Automáticos | Marcadores → IN/OUT → preview → cortar (QE extract in-place) |
| 1 | `transcript` | Transcripción | Cargar/exportar audio, transcribir, importar SRT/JSON |
| 2 | `spellcheck` | SpellCheck IA | Analizar clips de texto (Essential Graphics) |
| 3 | `supertexts2` | Smart Supertexts | Supertextos como gráficos MOGRT en timeline |
| 4 | `editsuggestions2` | Sugerencias de Edición | Analizar transcripción → cortes/highlights/errores |
| 5 | `recording` | Notas de Grabación | STT → IN/OUT → tomas → validación → marcadores → cortar → vistas |

## The Cutter (thecutter-core.js + ui-thecutter.js)

Orquestador del **primer corte** de una clase: encadena las herramientas que ya existen sobre la **secuencia activa** (v1 no hace batch). No implementa lógica de corte propia; llama a los mismos módulos que se usan a mano.

### Pipeline (11 pasos, secuencial y con estado por paso en la UI)
1. **Verificar el proveedor de IA** — consulta mínima a `aiAnalyzer._send` (`{"ok":1}`). Todo el pipeline depende de la IA: una API key vencida o un modelo mal escrito se ve acá y no después de media hora de transcripción
2. **Transcript completo** — reutiliza `Transcribe/<seq>.json` si existe (`EP.transcribeBatch.findSavedTranscript`) o transcribe con `transcribeActiveSequence` (mismo STT configurado)
3. **Marcadores + comentarios del CD** — `getSequenceMarkers()` → `EPMarkerReviewer.parsePairs` → `blocksFromPairs`; guarda cuántos bloques traen comentario del director de contenido
4. **Validar y mover IN/OUT** — `EP.markerReviewer.runHeadless({windowed: false})`: antes de tocar nada, **copia de la secuencia con `_Pre-marker` al final del nombre** (mover un marcador es borrarlo y recrearlo, así que es la única forma de volver a los marcadores del CD; una por secuencia y sesión del panel, para que el paso 5 no haga otra). Luego, primero **la frase que el CD escribió en el marcador** (`marker-anchor.js`) y, para lo que la nota no resuelve, la **estrategia de precisión** con IA (ver abajo). El punto elegido se **mide contra el WAV** antes de mover el marcador (`audio-onset.js`): el transcript dice qué palabras entran, el audio dice en qué frame cae el corte. Sin UI y **auto-aplicando** todas las propuestas. Si el LLM falla en alguna consulta el paso es fatal (cortar con marcadores a medio validar deja los cortes donde estaban). Si no se mueve nada, el paso queda en warning para que se vea. El detalle dice cuántos ajustes salieron de la nota y cuántos de la IA
5. **Revisar el resultado y reajustar** — `EP.markerReviewer.verifyAndFix()`: relee los marcadores **ya puestos** y los verifica de **sentido** (`marker-anchor.senseVerdicts`: ¿abre y cierra en las frases que declara el marcador?), de forma (`EPMarkerVerify`: frases a medias, palabras partidas, conteos, cues, solapes) y contra el **sonido** (`audio-onset.js`: ¿el corte cae donde arranca y termina el audio, con su colchón?). El paso **corrige lo que encuentra** (hasta 4 rondas, mecánicamente) y solo frena el pipeline si la estructura de algún bloque está mal. Lo que quede sin resolver **pero con un punto al que ir** sale como ajuste aplicable en la lista de abajo de la card (ver "Lo que el lazo no resuelve se ofrece")
6. **Leer la clase como quedaría cortada** — `EP.markerReviewer.readClassAndFix()`: arma el transcript proyectado con los marcadores **actuales** (no hace falta cortar para leerlo) y se lo da a la IA como revisor editorial. Lo que señale vuelve a la decisión del paso 4 y se relee. **No es fatal**: un chequeo de calidad caído no debe dejar la clase sin cortar (ver "Leer la clase antes de cortarla")
7. **Backup + cortar** — re-lee los marcadores (ya movidos y revisados), `buildRemoveZones` → `backupSequence()` + `executeCuts(json)`. Desde aquí la card muestra "Restaurar backup". **Si los pasos 5 y 6 dejaron ajustes por decidir, el pipeline espera aquí** hasta que se apliquen o se pida cortar sin ellos: después del corte, mover un marcador ya no cambia nada
8. **Vistas** — `buildViewPayload(mapeo, getPostCutMarkers(), duración nueva)` → `activateViews`. No fatal: sin pistas asignadas se omite
9. **Limpiar marcadores** — `deleteMarkersWithoutComments()` y a los que quedan se les asigna la **duración de su bloque IN→OUT original** (`computeBlockDurations` + `matchPostCutMarkers` → `setMarkerDurations`). No fatal
10. **Transcript del corte** — vuelve a transcribir la secuencia cortada y lo guarda como **`<seq>.cut.json`** (nunca pisa el `<seq>.json` de la secuencia completa: ver `checkCoverage`), y lo deja cargado en la card de Transcripción
11. **Sugerencias de edición** — `EP.editSuggestions.runWithTranscript(timed, notasDelCD)`: los comentarios del CD se anteponen al transcript como contexto del prompt. Los resultados quedan en la card de Sugerencias

### Vista de Cámaras (mapeo, no dropdown)
La card trae el mismo editor de mapeo que Cortes Automáticos: `getMarkerNamesAllSequences()` (una sola llamada al host, sin abrir ni cerrar pestañas) lista los nombres de vista de **todas las secuencias del proyecto**, `getVideoTrackNames()` las pistas de la activa, y cada fila es `vista → checkboxes de pistas`. Los presets se guardan en el **mismo** `localStorage` (`editorpro_view_presets`) que el Cutter, así que son intercambiables entre las dos herramientas. El escaneo corre al abrir la card y con "Releer marcadores".

`viewNameOf()` descarta dos clases de marcador para que no aparezcan como vistas: los nombres genéricos de Premiere ("Marcador 1", "marker"...) porque no identifican una cámara, y la **claqueta** (`claqueta`/`clapper`/`slate`/`K`, en nombre o nota) porque es solo una referencia de sincronía.

El resto de nombres se listan tal cual, así que también caen ahí las **notas de edición** que el editor escribe como marcador (p.ej. "⚠ Sin WAV"). No hay forma de distinguirlas de una vista real por el nombre (`PV` es vista, `Sin WAV` no), así que:
- Cada fila muestra **cuántas veces aparece** ese nombre en el proyecto (una cámara se repite decenas de veces; un recado, una o dos) y trae una **X para descartarlo**. Los descartes se recuerdan en `localStorage` (`editorpro_view_ignored`) y son reversibles con "Restaurar".
- **`buildViewPayload` solo genera segmento para nombres con pistas asignadas.** Esto no es cosmético: `activateViews` apaga *todo* clip que caiga en un segmento cuyo nombre no mapee a su pista, así que un marcador de nota generaba un segmento sin pistas y dejaba la zona **en negro** hasta el marcador siguiente.

### Paso a paso (`runSingleStep`)
Cada fila de la lista trae un botón **▶** que ejecuta **solo ese paso** y se detiene ahí, para revisar el resultado en Premiere antes de seguir. La lista se pinta al abrir la card (en `pending`), así que sirve de menú desde el arranque, no solo de reporte de un run.

- **Reintentar / devolverse**: en un paso ya ejecutado el botón es **↻**. Al reintentarlo, `invalidateAfter()` devuelve los pasos siguientes a `pending`: sus resultados quedaron viejos y la lista no debe darlos por buenos. Es el mismo camino para "devolverme a un paso anterior" mientras se valida uno a uno.
- `tc.single` marca el modo: no encadena con el siguiente paso y la barra de progreso es del paso, no del pipeline.
- **`tc.ctx` se conserva entre ejecuciones sueltas** (solo "Ejecutar pipeline" lo vacía), así que los pasos se pueden encadenar a mano en orden.
- Los pasos que necesitan datos de uno anterior lo declaran en `needs()` y avisan qué falta (p.ej. el paso 9 necesita las duraciones originales que calcula el paso 7). Los demás se resuelven solos: `ensureSeqInfo()` pide nombre/id/duración de la secuencia activa y `ensureBlocks()` relee los bloques para el contexto del CD; los pasos 5, 6 y 11 además caen al `<seq>.json` guardado si no hay transcript en memoria.
- El pre-chequeo del proveedor de IA solo aplica a los pasos marcados con `usesAi` (1, 4, 5, 6 y 11): cortar o activar vistas no necesita IA.
- Los números de paso que aparecen en los mensajes salen de `stepNum(id)`, así que agregar un paso no deja mintiendo el texto.

### Manejo de errores
- Pasos 1-5 y 7 son fatales: cortan el pipeline y dejan el error visible en el paso. El 5 (revisión) es el guardián del corte: si algún borde no pasa, no se corta.
- Corriendo un paso suelto no hay pipeline que frenar: el fallo se marca en rojo (o amarillo si el paso no es fatal) y ahí queda.
- Los pasos 6 y 8-11 no son fatales: quedan en amarillo (warning) y el pipeline sigue.
- Tras el paso 7 siempre queda disponible "Restaurar backup" (`restoreBackup()`).
- "Detener" marca `cancelled`, aborta el STT y la IA, y el pipeline para en la siguiente frontera de paso.

### thecutter-core.js (módulo puro, testeable en Node)
`parseInComment`, `blocksFromPairs`, `buildRemoveZones`, `totalRemoved`, `computeBlockDurations`, `matchPostCutMarkers` (empareja por texto de comentario, consumiendo cada bloque una vez), `viewNameOf`/`viewNamesOf`, `buildViewPayload`, `buildTimedFromWords`, `buildCdNotesContext`.

## La nota del CD manda (marker-anchor.js, v2.13.0)

**El marcador ya dice dónde va el corte.** La convención del CD escribe en el comentario la frase con la que el bloque abre y con la que cierra:

```
IN  → "<nota del editor> -  Del lado cualitativo podemos tener, qué tendencia"
OUT → "OUT: de un tipo de evidencia la que vamos a considerar."
```

(recortadas a ~50 caracteres: al IN le falta el final de su última palabra, al OUT el principio de la primera).

Ese dato estuvo ahí sin usarse hasta la v2.13.0, y su ausencia era **la causa de los marcadores sin sentido**. Sin la nota, el LLM tiene que adivinar cuál de las pausas de la ventana abre "la primera frase con sentido", y en una clase grabada por intentos eso es indecidible: el profesor dice la misma frase cinco veces. El caso que lo destapó — el LLM leyó el arranque de la toma buena como "esto ya se dijo", cortó 5s tarde y se comió la frase que el CD había escrito en el marcador.

Con la nota el problema deja de ser una elección y pasa a ser una búsqueda:

1. `cueTextFor(marker, kind)` — saca la frase del comentario (tras el último `" - "` para el IN, tras `OUT:` para el OUT). El guion manda **antes** que el prefijo: el recado del IN puede hablar del OUT del bloque y traer la frase detrás (`out: cortar antes que diga "nos vemos" -  Y ah`), y descartar ese comentario entero por empezar en `out:` dejaba al LLM sin saber con qué abría el bloque. Un nombre suelto (`"PV"`, `"Claqueta"`) no es frase.
2. `cueTokens` — normaliza y se queda con el **borde que importa**: la cabeza para el IN, la cola para el OUT. Descarta el comando al editor pegado al final (`"...un fenómeno. Pausa."`) y la palabra que el recorte del CD dejó a medias. Con menos de 3 palabras no se puede buscar (medio transcript coincidiría) y `cueSearchable` lo dice: esa frase **no ancla nada pero sí llega al LLM como pista**, marcada como recortada. El caso real: del comentario solo sobrevivió `"Y ah"`, se tiró, y el LLM descartó *"Y ahora sí,"* por parecerle una transición — abrió el bloque 0.6 s más tarde, donde además no cabía el colchón. Distinto es una frase que sí se pudo buscar y no aparece: eso es un recado del CD, no texto hablado, y al LLM no se le pasa.
3. `findMatches(words, cue, kind)` — barre el transcript comparando por LCS con ventana deslizante. El emparejamiento es **difuso a propósito**: el CD escribe de oído y el STT transcribe a su manera, así que dos palabras "son la misma" si coinciden, si una es prefijo de la otra (`tendencia`/`tendencias`, recortes) o si se diferencian en una letra. Devuelve todas las apariciones con su puntaje.
4. `anchorFor(...)` — de las apariciones fuertes elige la **más cercana al marcador** y decide si se puede aplicar sola:
   - `confident` (puntaje ≥ 85%, sin rival a menos de 30s, a menos de 90s del marcador) → **se mueve ahí sin consultar al LLM**.
   - `ambiguous` (la frase se grabó varias veces cerca) → decide el LLM, pero ya no entre pausas: entre **tomas de la misma frase**.
   - `tooFar` / puntaje flojo → el LLM decide con la nota como contexto.

Sobre una clase real de 66 minutos (5797 palabras, 22 bordes): 18 bordes anclados con puntaje 100% en 155ms, 4 escalados al LLM, y los dos errores gordos del run anterior corregidos (un IN 5.2s tarde y un OUT que arrastraba 18s de sobra).

**Cuando la nota no decide, el log dice por qué** (`noteMissReason`, v2.13.1): "el marcador no trae escrita la frase del bloque", "la frase se grabó 3 veces por aquí", "la frase aparece a 101s del marcador (probablemente otra toma)". Sin esa línea, un borde que acaba en manos del LLM era indistinguible de un borde sin nota, y con 22 bordes eso es imposible de auditar leyendo el log. Ese último caso es el diseño funcionando: la frase de la nota existía a 101s, pero en una toma que el bloque ya no incluye — el guardia de distancia evita saltar a una toma descartada y le pasa la decisión al LLM, que arrancó el bloque donde empieza la toma que sobrevive.

### El CD también escribe órdenes, no solo frases (v2.20.0)

A veces el comentario no dice **con qué** abre o cierra el bloque, sino **qué hacer** con el borde, y lo deja en el marcador que tiene a mano — casi siempre el IN, delante de la frase de apertura:

```
IN → 'out antes de "ya que está esa cadena," -  Ahora lo que vamos a hacer es vamos a ir a cloud,'
```

Es el dato más completo que existe: nombra el borde (`out`), el lado (`antes`) y la frase (entre comillas). Hasta la v2.19.0 se tiraba entero —`cueFromText` solo miraba lo que hay tras el último `" - "`— y con él se perdía lo único que resolvía este caso: en la clase 15 el profesor **arrancó dos veces** con *"ya que está esa cadena"*, el OUT cerró después de la primera (1061.1s, con *"…va a ser un wave frame."* dentro) y el bloque siguiente abría con la retoma, así que la idea quedaba dicha a los dos lados del corte. Con la orden leída, el OUT cierra en *"…cómo lo está construyendo."* (1057.2s) y la repetición se queda fuera.

- `directivesFrom(texto)` → `[{kind, side, phrase}]`. **Las comillas son lo que la convierte en orden**: sin ellas no se sabe dónde acaba la frase y se ignora. Entiende `out`/`in`, `antes`/`después` y las variantes con palabras en medio (`out: cortar antes que diga "nos vemos"`).
- `stripDirectives` la saca del texto antes de buscar la frase del bloque, así que la orden no se cuela como frase hablada.
- `directiveAnchor(words, directiva, kind, tiempoActual, opts)` busca la frase con el mismo emparejamiento difuso, **dentro del territorio del bloque**, y devuelve la frontera de palabra donde va el corte: `antes de X` → fin de la palabra anterior a X (para un OUT) o inicio de X (para un IN); `después de X`, al revés. El colchón lo pone `marker-precision`, como con el ancla normal.
- En el paso 4 es la **primera propuesta** (`fromDirective`, antes de `fromAnchor`) y manda sobre la frase del bloque, pero sigue pasando por la revisión con contexto (ver abajo). En el paso 5 protege el borde igual que la nota: `confirmedByNote` acepta la orden y las reglas mecánicas (`take-start`, `pickup`, `mid-phrase`) se callan donde el CD ya decidió.
- Si la frase de la orden aparece **dos veces dentro del mismo bloque**, no se aplica: se dice en el log y decide el camino normal.

Los límites del bloque hacen buena parte del trabajo aquí: la retoma de la frase cae en el bloque siguiente, así que dentro del territorio del OUT queda **una sola** aparición y la orden se aplica sin dudas.

**La orden también cuenta sin comillas y desde el bloque de al lado** (v2.23.0). Dos huecos de la v2.20.0, y los dos por lo mismo: el CD escribe donde tiene el ratón, no donde toca.

- `retakeDirectiveFrom` lee *"retomamos desde (donde dice) X"* **sin comillas** (`RETAKE_RE`). Es la forma natural de decirlo, y sin comillas no se sabe dónde acaba la frase, así que se toma como orden **de cerrar antes** (equivale a `flagsBoundary` para el OUT) y, si trae texto suficiente, además como frase de búsqueda. `BOUNDARY_RE` reconoce ya `retom\w*` como señal de borde.
- `blockDirective` (ui-marker-reviewer.js): para un OUT, si su propio bloque no trae orden, **lee la del IN del bloque siguiente**. Ahí es donde el CD apunta lo que se rehace —*"retomamos desde donde dice X"* en el IN habla del OUT **anterior**—, y hasta ahora esa orden se leía solo dentro del mismo bloque, o sea nunca donde estaba escrita. La guarda que evita aplicarla al bloque equivocado es la de siempre: la frase citada tiene que **resolverse dentro del territorio de este bloque**.

### El corte se decide con el contexto completo, no con una regla fija (v2.22.0)

Aplicar la orden del CD al pie de la letra dejaba la repetición dentro del bloque. `out antes de "ya que está esa cadena,"` **cita la frase con la que abre el bloque siguiente**: no señala un punto de la cola, dice *"esto se grabó dos veces, quítame la primera"*. Y el intento que sobra **empieza antes** que la repetición literal — clase 15, bloque 4:

```
… definiciones están en el CSV.                          ← aquí va el OUT (1050.6s)
   Entonces, el paso uno va a ser resolver en voz alta esta cadena.   ⎫ intento
   Entonces, te va a explicar cómo lo está construyendo.              ⎬ abandonado
   Ya que está esa cadena, va a ser un wave frame.                    ⎭
[bloque 5] Entonces, ya que está esa cadena, lo que va a hacer es va a dividir en pasos…
```

Cortar antes de la frase citada (1057.1s) deja las dos primeras frases dentro y el bloque 5 las vuelve a decir. Nada determinístico las separa: la repetición literal empieza en la tercera y los silencios delante de cada frase son iguales (0.73s y 0.61s). Lo único que las distingue es **lo que se está diciendo**, así que el borde se decide leyendo: el comentario del CD tal como está escrito y el transcript de los dos lados del corte.

El flujo de cada borde (`decide` en ui-marker-reviewer.js) es **propuesta → revisión con contexto → guardas**:

1. **Propuesta determinística.** La orden del CD (`fromDirective`), la frase del bloque (`fromAnchor`) o el arranque de la toma (`takeStartPoint`), en ese orden. Ninguna de las tres es ya la última palabra: son la mejor lectura mecánica de lo que el CD escribió, y es lo que se aplica si la consulta no llega o no convence.
2. **¿Hace falta preguntar?** (`retakeCheck`). Dos señales, y **basta con una si es fuerte** (v2.23.0):
   - **El CD señaló el borde**, con sus palabras: `noteFromText` saca el recado del comentario (quitando la orden y las etiquetas de vista) y `flagsBoundary` reconoce si habla de este corte (*"revisar out"*, `out antes de "…"`, *"sobra el cierre"*). Con recado, cualquier repetición medible pregunta.
   - **Hay repetición medible** (`MV.pickupOverlap`) entre lo que este bloque **grabó** —no lo que la propuesta ya dejó fuera— y lo que el vecino vuelve a decir. **Sin recado también pregunta si la repetición es larga** (`STRONG_RETAKE_TOKENS`, 6 tokens contiguos): que el vecino repita seis palabras seguidas es evidencia por sí sola, y antes eso se iba entero al editor como aviso `repeat-hint`. Lo que cambia es el techo, no el disparo: sin recado del CD la consulta no puede quitar más de `NO_NOTE_MAX_CUT_SEC` (**4s**), porque tirar clase sin que nadie lo haya pedido es una decisión que se paga caro. Con 6 tokens y ese techo, las dos clases no ganan ni un falso movimiento; con 5, el modelo local empieza a recortar frases que son contenido.
   - **`retakeCheck` ya no vive dentro del `if (proposal)`**: un borde donde el CD no escribió nada también puede tener repetición que resolver, y antes esos ni se miraban.
3. **La consulta** (`askRetake` + `MP.buildRetakePrompt`). Con todo delante: los comentarios del CD **literales** (los dos marcadores del bloque y el del bloque de al lado, que es donde el CD apunta qué se rehace), lo que dice el bloque vecino, lo que este bloque deja dentro con el corte propuesto, y las frases del bloque numeradas como opciones — elegir la N cierra el bloque al final de la N-1. El **`0` es "está bien así"** y se le dice que es la respuesta normal: preguntar en abierto *"elige el mejor de estos 14 puntos"* se midió contra el modelo local y movía bordes que la nota del CD ya tenía bien. También hay que avisarle de que *el intento empieza varias frases antes de la repetición literal*: sin eso elige la última.
4. **Guardas** (`retakeReject`): el punto tiene que caber en el territorio del bloque, ir en la dirección que quita el intento, y **no llevarse más clase de la que dura la toma que lo sustituye**. Si algo falla, se aplica la propuesta del paso 1 y en el log queda por qué.

Sin recado o sin repetición medible el borde no se consulta: se aplica la propuesta. Y si no hubo propuesta —el CD no escribió nada de este borde— decide el LLM en abierto con `buildChoicePrompt`, que también lleva ahora los comentarios literales y el bloque vecino como contexto.

Medido con el modelo local sobre las dos clases: 20/20 bordes en la clase 15 con **una sola** consulta (el OUT del bloque 4, de 1057.2s a 1050.6s), y 20/20 en la clase 14 sin ninguna consulta. El banco (`EP_MODE=flow`) puntúa el flujo entero por clase —bordes en su sitio, consultas al modelo y bordes movidos de más— porque es el número que dice si la precisión sube, no el borde suelto. En la clase 14, uno de esos 20 es el IN que el CD dejó **1.6s antes** de la frase que él mismo anotó: moverlo es el arreglo que pidió el editor (*"inicia sobre nada"*), no una desviación.

**Los 10s de duración del IN son un prior blando, no una pinza** (`markerBand`/`bandVerdict`, v2.23.0). El CD pone los IN con 10s de duración para verlos en la timeline, así que ese `endSeconds` —que `getSequenceMarkers` ya devolvía y `parsePairs` tiraba— dice hasta dónde creía él que llegaba el arranque del bloque. Se usa de dos formas y ninguna es un veto: como **techo** de la búsqueda del IN (`limitsFor`, si cae antes que el OUT del bloque) y como **señal de log** cuando el punto elegido se sale de la banda, que es la forma de enterarse de que el marcador estaba mal puesto de origen sin obligar al corte a respetar un error. Solo se toma en cuenta si la duración es creíble (entre 0.5s y `maxBandSeconds`): un marcador de 1 frame o de tres minutos no dice nada.

Ojo con lo que cuenta el paso 3 del pipeline: **la frase del bloque y la nota del editor son dos cosas distintas**. `" -  Del lado cualitativo..."` trae frase pero no nota (`hasComment: false`, la parte antes del guion está vacía); la nota es el recado suelto del CD (`"Cortar aquí - ..."`) y solo se usa como contexto de las sugerencias de edición del paso 8. El log informa las dos.

## El frame lo decide el audio (audio-onset.js, v2.14.0)

**Los tiempos del transcript no sirven para elegir el frame del corte.** Whisper estira la primera palabra de cada toma hacia atrás, hacia el silencio: dice que la frase empieza donde su ventana de análisis empieza, no donde suena. Medido sobre una clase real (28 fronteras con silencio medible), el sonido arranca **0.47 s después** de lo que dice el transcript — mediana; p25 0.32 s, p75 0.59 s, máximo 1.8 s. En el bloque que lo destapó, el transcript ponía *"Y"* en 181.44 s y el audio arranca en 181.99 (550 ms, **14 frames**).

Con ese error el colchón de 10 frames no significa nada: o el corte abre con un segundo de silencio muerto, o cae encima del ataque de la palabra. Es lo que el editor ve al instante en el waveform — *"aún está pisando el waveform cuando inicia la frase"* — y no hay ajuste de colchón que lo arregle, porque el error está en la referencia.

**Reparto de responsabilidades**: el transcript y la nota del CD dicen **qué palabras** entran al bloque; el audio dice **dónde cae el corte**. Por eso los verdictos de audio van al final de `failures` (detrás de los de sentido) y los chequeos de milisegundos del transcript (`mid-word`, `no-air`, `tight-air`) **se descartan en los bordes que el audio pudo medir**: están calculados sobre una rejilla corrida medio segundo y pelearse con la medida del WAV mandaría el marcador de ida y vuelta en cada ronda.

Cómo mide (`measure(wav, tiempo, kind, opts)`):
1. **Lee el WAV directo con `fs`, sin ffmpeg** — es PCM, así que basta la cabecera (se recorren los chunks porque Premiere mete un `bext`) y un seek al byte de la ventana: ±2.3 s alrededor del corte, unos cientos de KB. 22 bordes cuestan ~115 ms de disco.
2. Envolvente RMS a hops de 5 ms (1/8 de frame), canales combinados por RMS — con el micro del profesor en un solo canal, mirar solo el izquierdo daría silencio donde hay voz.
3. Umbral anclado a los dos lados: sobre el piso de ruido (`overFloorDb` 18) pero sin acercarse a la voz (`underPeakDb` 10). Los arranques detectados salen **idénticos al milisegundo** entre peak-6 dB y peak-15 dB (el ataque es abrupto); lo que cambia es cuántas fronteras se pueden medir, y con este par una respiración deja de contar como voz (28 → 43 de 60).
4. `refine` toma el borde **más cercano al corte** exigiendo silencio de verdad al otro lado (200 ms), y respeta **dos límites distintos**: el del contenido del bloque (`minTime`/`maxTime`, que pone `marker-anchor.outerBound` — el corte no lo cruza ni buscando el borde ni al poner el colchón) y el de **credibilidad de la medida** (`edgeMinTime`/`edgeMaxTime`, la palabra propia ±0.4 s: solo limita la búsqueda, nunca recorta el aire). Lo de "más cercano" no basta: cuando la frase y el *"pausa"* dicho al editor van pegados —menos de 200 ms en medio, así que son un solo tramo de voz— el único borde medible es el final del cue, y el OUT se abría hasta ahí. Con el techo puesto no cabe ningún borde, `measure` devuelve `null` y **manda el transcript**: el OUT se queda a un frame del final real de la frase. El audio ajusta el frame de una decisión ya tomada, no elige contenido. Cuando no hay borde medible, `levelAt` responde lo único que se puede saber —si en el corte todavía suena algo— y lo deja en el log.
5. `evaluate` calcula el aire real en frames y a dónde ir. El snap a frame va **siempre hacia el silencio** (el IN al frame anterior, el OUT al siguiente) y el colchón se recorta al silencio medido **y al límite del bloque**, dejando un frame de margen: así el aire nunca se mete en el sonido vecino ni se lleva una palabra que el bloque deja fuera.

Dos códigos, ambos con arreglo mecánico (`applyTime`, sin LLM):

| code | Qué detecta | Severidad |
|------|-------------|-----------|
| `audio-clip` | el corte cae dentro del sonido (aire < `hardAirFrames`, 2) | frena |
| `audio-air` | el aire se sale de la banda del colchón (`[pad-6, pad+12]`) | **avisa** |

El riesgo no es simétrico y la banda lo refleja: quedarse corto de aire se oye, pasarse solo deja silencio muerto. Y donde el silencio disponible es corto, el objetivo es el colchón que **cabe**, no los 10 frames ideales — si no, el aviso quedaría puesto para siempre.

**El borde es el último hop con sonido antes del silencio, no el final del tramo de voz sostenido** (v2.14.3). Las palabras se apagan a saltos: tras el tramo sostenido quedan chispazos demasiado cortos para contar como voz (`voiceMs`, 60 ms). Tomando el final del tramo, el corte caía hasta 200 ms antes de que la frase acabara de sonar —encima de la onda, que es exactamente lo que el editor ve— y, peor, el chequeo de silencio sí veía esos chispazos y **descartaba el borde entero**: los tres OUT que se quedaban "sin medida" en la clase real eran esto, no cues pegados. Con el borde bien puesto se miden **las 22 fronteras** de la clase (antes 19) y las tres pasan a tener entre 1 y 12 frames de aire medidos de verdad. El silencio disponible (`quietSpan`) se sigue midiendo contra los tramos de voz: un chispazo aislado no acorta el colchón.

**Un ruido en el silencio no es el ataque de la frase** (`edgeMinTime`/`edgeMaxTime`, v2.17.0). El sonido más cercano al corte no siempre es la frase: en la clase 14, bloque 3, un golpe de 0.15 s a 274.0 s (silla, boca, nada audible como habla) se midió como el arranque de una frase que no suena hasta 276.2 s, y el IN se fue **2 s antes de que hablara nadie** — el "inicia sobre nada" que se ve en la timeline. El límite sale de la propia palabra del transcript ±0.4 s: Whisper **adelanta** el principio de la primera palabra de cada toma (de eso va todo este módulo), nunca lo retrasa segundos, así que un borde muy anterior a la palabra no puede ser su ataque. Es un límite de **búsqueda**, separado del `minTime`/`maxTime` del contenido: no recorta el colchón, que sale del silencio medido. Con él las 20 fronteras de esa clase quedan a ~10 frames del sonido y estables al revisar.

**La palabra propia es la que el corte parte, si parte alguna** (`marker-anchor.holdingWord`, v2.25.0). El techo de credibilidad se calculaba con la palabra de la **frontera**, y eso hacía que medir un borde **diera distinto antes y después de mover el marcador**: cuando el audio deja el cierre dentro de una palabra que el transcript alarga sobre el silencio, la frontera pasa a ser la palabra ANTERIOR y su ventana ya no contiene el sonido. El mismo borde que el paso 4 acababa de medir se volvía **inmedible** en el paso 5, así que volvían a hablar los chequeos de milisegundos del transcript y la revisión denunciaba para siempre un corte que ella misma había puesto bien (clase 15: 19 de 20 bordes medibles; con la palabra propia, 20 de 20). Medir tiene que ser repetible o el paso 5 no puede confirmar lo que decidió el paso 4.

**Cuándo se calla**: sin WAV de la secuencia, sin contraste en la ventana, con habla continua a los dos lados o con el borde a más de 2 s del corte, `measure` devuelve `null` y manda el transcript. Cuando eso pasa, `levelAt` deja dicho en el log si el corte cae sobre el sonido — sin borde limpio no se puede decir a dónde moverlo, pero sí que está mal.

### El transcript se guarda ya alineado al audio (`alignWords`, v2.18.0)

**Cuánto se puede fiar uno del STT, medido.** Frontera por frontera contra el WAV, en cuatro clases del mismo proyecto (whisper large-v3-turbo por MLX), con el silencio como referencia:

| Frontera | Sesgo mediano | Error mediano | Dentro de ±5 frames |
|----------|---------------|---------------|---------------------|
| **Final** de palabra antes del silencio | 0 frames | 2.2 frames | 86% |
| **Arranque** de palabra tras el silencio | **+8.5 frames** (340 ms) | 9.0 frames | 27% |

El signo no varía nunca: en los arranques **el sonido llega después** de lo que dice el transcript, y el sesgo **crece con el silencio previo** (+5 frames tras 1 s, +9 tras 2 s, +12 tras más de 8 s; peor caso medido, 43 frames). Las otras tres clases dan +4.9, +5.9 y +7.8 de mediana en los arranques y entre −0.5 y +1.1 en los finales: es estructural del modelo —le atribuye a la primera palabra el silencio que la precede—, no ruido, y no lo arregla re-transcribir ni un modelo más grande. Con eso, un IN colocado desde el transcript deja de mediana **18 frames de aire** (los 10 del colchón más el sesgo) y en el peor caso arranca dos segundos antes de que hable nadie; el OUT sale bien casi siempre. Es exactamente lo que se veía en la timeline.

Por eso el transcript se corrige **una vez, al guardarlo** (`ui-transcribe-batch` y `ui-marker-reviewer`, campo `alignedToAudio`), en vez de solo en los 20 bordes que mira Revisar Marcadores: de los tiempos guardados viven también el buscador de repeticiones, el editor al saltar a una palabra, las sugerencias de edición y los SRT. Una clase de 26 min son ~220 tramos y cuesta **~1 s**. Después de alinear, esa clase pasa de +8.5 a **0 frames** de sesgo y del 7% al 65% de fronteras clavadas a un frame; las que quedan (5 de 147, más 6 sin borde medible) son sitios donde en el punto del transcript **sí suena algo** y moverse se comería un ataque audible.

Se trabaja por **tramos** (palabras seguidas, cortando donde hay ≥ 0.35 s de silencio), no palabra a palabra: se miden los dos bordes del tramo y **la corrección la absorbe la palabra del borde** —la primera y la última—, que es donde vive el error del STT. Las de en medio no se tocan: repartir la corrección por todo el tramo, que fue el segundo intento, movía medio segundo palabras interiores que ya estaban bien (corrigiendo el cierre de un tramo, el `que` de tres palabras antes se iba 0.75 s). Solo si la palabra del borde se quedaría sin duración se reparte entre todas, que es la salida que garantiza que ninguna palabra queda invertida ni pisando a la vecina. Empujando la cadena hacia adelante, que fue el primer intento, se corrompían finales que estaban bien.

Dos límites, los mismos de siempre: el borde no puede confundirse con la palabra del tramo vecino, y la búsqueda es **asimétrica hacia donde está el error**. En el arranque no se busca más de 0.4 s antes de lo que dice el transcript (por ahí solo hay ruido de sala) y sí bastante después, hasta 3.5 s si en el sitio del transcript **no suena nada** por encima del nivel de habla de la clase. En el final, al revés: hasta 0.4 s después (colas que se apagan) y hasta 3.5 s antes si en el último tramo de la palabra ya no suena nadie. Ese caso es el de la última palabra de cada toma —la voz se apaga y el STT alarga la palabra sobre el silencio— y es justo la que decide dónde cierra un bloque: en la clase 15 `"conecte."` acababa 0.7 s después del sonido, y el OUT del bloque 3, aun estando bien puesto, aparecía como corte a mitad de palabra.

#### Una pasada no basta (v2.25.0)

La ventana de búsqueda se abre **alrededor de los tiempos que trae el transcript**, así que un error más grande que la ventana solo se corrige en parte: la palabra queda más cerca del sonido y es la pasada siguiente la que ya ve el borde de verdad. Además, los tramos se cortan por los huecos del transcript, y acortar una palabra estirada **abre un hueco que antes no existía**: dos tomas que se leían como un solo tramo pasan a ser dos, con dos bordes nuevos que medir (clase 14: 228 tramos en la primera pasada, 220 en la segunda).

Por eso `alignWords` **se repite hasta que una pasada no mueve nada** (tope `alignPasses`, 3). Las stats se cuentan contra los tiempos que entraron, no contra la última pasada. Lo que costaba ~1 s cuesta 2-3 s, una vez, al guardar.

Esto no era un detalle: `"conecte."` seguía acabando 0.78 s después del sonido en un transcript que **ya constaba como alineado**, y con ese final de más el cierre correcto del bloque 3 se leía a la vez como *corte a mitad de palabra* y como *no cierra en la frase de la nota del CD*. La revisión denunciaba un corte que estaba bien puesto y no tenía nada que aplicar, que es lo que el editor ve como "encontró cosas y no hizo nada".

**Las palabras que el STT oyó donde no suena nada** se descartan (`dropSilentWords`): Whisper alucina frases sueltas en los silencios —cinco *"Gracias."* en la clase 14, uno en el segundo 0 y otro en el 30—. Solo caen las **aisladas** (≥ 2 s de silencio a los dos lados) cuyo nivel no llega al del habla de la clase. El umbral tiene que ser el de la clase y no el de la ventana: en un silencio de medio minuto no hay contraste, el umbral local se pega al ruido de sala y con él se descartaban *"Voy."*, *"Va."* y *"Ok."*, que son cues reales del profesor. En un transcript por ventanas no se descarta nada (casi toda palabra queda "aislada" porque el silencio de fuera de la ventana no es silencio de la clase).

Los transcripts hechos antes de la v2.18.0 llevan los tiempos crudos: la biblioteca de Transcripción les pone un botón **"Alinear al audio"** que los mide contra el WAV sin volver a transcribir (el WAV se busca exigiendo que la duración cuadre, que es lo que evita medir contra el audio de la secuencia ya cortada). En los ya alineados el botón dice **"Volver a alinear"**.

Y **el transcript que se saca de `Transcribe/` se vuelve a medir antes de usarlo** (`realignCached`, v2.25.0), no solo el que se acaba de transcribir. Si ya está bien no cuesta nada —la primera pasada no mueve nada y se corta—, y si vino de una alineación de una sola pasada se arregla en el sitio y se reescribe (conservando `savedBy` y `pipelineVersion`: reescribir un transcript ajeno para medirle los tiempos no lo convierte en uno nuestro). Sin esto, la mejora de arriba solo llegaba a las clases que se volvieran a transcribir enteras.

El WAV se busca en las mismas carpetas que el transcript (`findWav`), por nombre base y **exigiendo que la duración cuadre con la secuencia** (1%): los WAV llevan la hora del export en el nombre, así que sin ese filtro se colaría el de la secuencia ya cortada — la misma trampa que con los transcripts.

Se aplica en los dos sitios: al **colocar** los marcadores (paso 4, `audioSnap` en el único embudo de propuestas) para que queden bien de primeras, y al **revisar** (paso 5, `measureBlocks`) para lo que llegue torcido. Los arreglos mecánicos también pasan por el audio (`anchorFor` → `snapToAudio`): un arreglo que cae en la rejilla del transcript lo movería otra vez la ronda siguiente.

### Qué palabras entran al bloque se decide por los FINALES de palabra (v2.14.2)

Medir el audio no bastaba: **los chequeos de contenido leían el tiempo del marcador sobre la rejilla de Whisper** y cantaban fallos fantasma que el audio deshacía en la ronda siguiente. Un log real: 22 bordes, 16 movimientos, 9 fallos, y el marcador acabando donde había empezado.

La regla que lo cierra es una sola, y sale de para qué sirve cada dato del STT: **los finales de palabra de Whisper son de fiar, los principios no** (estira la primera palabra de cada toma medio segundo hacia el silencio y pega el *"pausa"* del profesor al final de la última frase). Así que `frontierAt` mira solo finales:

- el bloque **abre** con la primera palabra que todavía suena después del corte (`end > t`) → un IN puesto 10 frames antes del sonido ya no parece saltarse su primera palabra;
- y **cierra** con la última que acabó antes (`end <= t`) → un OUT con su colchón ya no parece llevarse el cue del editor, que termina un segundo más tarde.

`outerBound` (el límite que el audio no puede cruzar) usa el final de la palabra anterior para el IN, pero para el OUT el **punto medio** de la siguiente: con su principio, un OUT no podía ni salir del sonido de su propia última palabra —el *"pausa"* figuraba empezando 2 centésimas antes de que la frase acabara de sonar— y se quedaba clavado encima de la onda. El punto medio deja sitio al colchón y sigue frenando el caso que importa (el cue pegado, sin silencio en medio).

Los tiempos del bloque **no se tocan** con lo medido: el contenido lo decide el transcript y el frame el audio. Sustituir el tiempo del bloque por el borde del sonido (v2.14.1) arreglaba un lado y rompía el otro — un OUT puesto justo después del cue del editor pasaba como si cerrara limpio.

Los códigos acústicos del transcript (`mid-word`, `no-air`, `tight-air`) se siguen descartando en los bordes que el audio midió. Sobre el log real: de 9 fallos y 16 movimientos a **3 movimientos y ninguna falla, en una ronda**, con todos los bordes medibles entre +8 y +17 frames de aire (ninguno pisando el sonido).

### El arranque de toma se resuelve antes de preguntar (v2.14.2)

Si el bloque abre a mitad de una toma que empezó tras un silencio largo, dónde arranca no es una decisión editorial: es mecánica, y `takeStartWord` ya la sabía. El paso 4 la aplica ahora **antes** de llamar al LLM (`takeStartAt`, misma regla y mismas guardas: manda la nota del CD si ubica el corte, se calla si la frase se grabó varias veces).

El caso que lo pidió: tras 24,5 s de silencio el profesor dice *"Ninguna de estas subpreguntas te da la respuesta por sí sola"* y Whisper lo transcribe como *"¿Qué es la respuesta?"* con palabras de 1,4 s. El LLM leyó eso como un arranque a medias y abrió el bloque 4,4 s más tarde — tirando justo la frase que el CD había escrito en el marcador. El paso 5 lo reparaba, pero el editor que va paso a paso veía el marcador mal puesto.

## Estrategia de precisión de marcadores (marker-precision.js)

Módulo puro que usan The Cutter (pasos 4 y 5) y la card manual **cuando la nota del CD no alcanza** (no hay nota, la frase se grabó varias veces o queda lejos). Nace de que **pedirle un timecode al LLM no funciona**: inventa números, cae a mitad de palabra o repite el tiempo actual con ruido, y todo eso lo descartan los filtros → el marcador no se mueve.

Aquí el LLM no propone un tiempo, **elige entre puntos de corte reales**:
1. `buildCandidates(words, tiempoActual, "IN"|"OUT")` — calcula las fronteras entre palabras de una ventana de ±18s (nunca dentro de una palabra: el IN queda antes de la palabra que abre, el OUT después de la que cierra). De todas, ofrece hasta 12: las **pausas más largas** (donde suele estar el corte bueno) + las más cercanas a la marca actual (ajuste fino). Marca cuál es el punto donde está hoy el marcador.
2. `buildMarkedText` — pinta esos puntos dentro del propio transcript: `...hola clase [1] hoy vamos [2] a ver...`
3. `buildChoicePrompt` — el LLM solo responde `{"choice": n, "reason": "..."}`. Si el marcador ya está bien, responde el número del punto actual. Al prompt se le suman las pistas de los detectores determinísticos (retoma repetida del bloque siguiente, conteo "3,2,1") como contexto, no como movimiento impuesto.
4. `resolveChoice` — valida el número contra la lista. Por construcción el movimiento resultante no puede alucinar un tiempo, no puede partir una palabra y está acotado a la ventana.

Cuando hay nota del CD, el prompt la lleva y las apariciones de la frase entran a la lista **marcadas con ★** (`opts.forceTimes` las mete aunque caigan fuera de la ventana de ±18s; `opts.cueTimes` las marca). Ahí la instrucción es explícita: *la nota manda sobre la impresión de "esto ya se dijo"*, porque la clase repite frases por diseño. `boundaryAt(words, frontera, kind)` es la vía para aplicar un tiempo decidido fuera del módulo (el ancla) sin perder el colchón ni el snap a frame.

El módulo también arma la **revisión del borde ya propuesto** cuando el bloque de al lado rehace lo mismo (`sentenceStarts`, `headText`/`tailText`, `buildRetakePrompt`, `resolveRetake`, v2.22.0 — ver "El corte se decide con el contexto completo"): ahí las opciones no son fronteras finas sino **frases enteras**, porque lo que se decide es desde dónde sobra el intento, no en qué frame cortar. `buildChoicePrompt` lleva los mismos datos de contexto (`unit.notes` con los comentarios literales del CD, `unit.neighbour` con lo que dice el bloque vecino) cuando el borde llega sin propuesta.

**Si la frase de la nota se grabó varias veces, esas tomas son las ÚNICAS opciones** (`opts.onlyForced`, v2.17.0). Con la ventana entera delante, el LLM se va a otro sitio: en la clase 14, bloque 1, la frase estaba en 1:21 y en 1:38 y eligió 1:41 —justo después de ella— dejando el bloque abriendo con la frase siguiente y el arranque escrito por el CD tirado, y explicándolo como *"es donde empieza la frase completa y mejor dicha"*. Cuando el ancla es ambigua, la pregunta ya no es dónde cortar, es **cuál de las tomas**, así que la lista se reduce a las apariciones y una respuesta fuera de la frase deja de ser posible. Con una sola aparición a la vista se le devuelve la ventana completa (algo tiene que poder ajustar).

### Colchón del corte (v2.11.0)

Cortar pegado a la palabra suena abrupto y se come el ataque de la primera sílaba (los timestamps del STT no son exactos al milisegundo). Cada punto de corte lleva **10 frames de aire** hacia el silencio: el IN abre antes de la primera palabra y el OUT cierra después de la última.

- `padFrames` (10 por defecto) + `fps` (el real de la secuencia, vía `getActiveSequenceInfo().frameRate`). Ajustable en la UI de The Cutter, persistido en `localStorage` (`editorpro_cut_pad_frames`) y leído por `EP.markerReviewer.getPadFrames/setPadFrames`, que es quien arma los candidatos.
- **El silencio disponible manda**: si el hueco entre palabras es más corto que el colchón se toma todo el hueco y ni un frame más. Con palabras pegadas el corte queda en la frontera exacta. Nunca se invade la palabra vecina.
- Los puntos se **alinean al frame** (el IN hacia atrás, el OUT hacia adelante), así que el aire real es de 10 frames o un pelo más, nunca menos.
- `resolveChoice` devuelve el tiempo del punto **incluso cuando el LLM confirma la posición actual**: si el marcador venía pegado a la palabra, ese "no mover" es justo el caso que necesita el colchón. `MIN_CHANGE` (0.12s) decide si vale la pena mover; la propuesta se explica como "Mismo punto, con el colchón de N frames".
- `candidate.frontier` guarda la frontera sin colchón. Se usa para reconocer "el marcador ya está en este punto" — comparar solo contra el tiempo con colchón haría que ningún marcador se reconociera en su sitio.

## Revisión del resultado (marker-verify.js + verifyAndFix)

Mover el marcador es una **propuesta**; lo que se corta es lo que quedó en la secuencia. Entre lo uno y lo otro se cuela de todo: el LLM eligió un punto flojo, el movimiento se recreó en otro frame, el bloque quedó arrancando en un conteo. El paso 5 de The Cutter cierra ese hueco: **relee los marcadores reales, los verifica contra el transcript y reajusta lo que no pasa**. Solo con la revisión en verde se corta.

### El transcript tiene que ser de ESTA secuencia (`checkCoverage`)
Antes que cualquier otra cosa: **un transcript de la secuencia ya cortada tiene las mismas palabras con otros tiempos**. Usarlo para mover marcadores los manda a puntos que "leen" perfecto y quedan a minutos de donde se habla — el fallo es enorme y silencioso, porque nada en el texto se ve mal.

`EPMarkerVerify.checkCoverage(words, {sequenceDuration, savedDuration, markerTimes})` rechaza el transcript cuando:
- `duration-changed` — la secuencia dura distinto que cuando se guardó el transcript (cortaron, pegaron, restauraron un backup).
- `markers-outside` — hay marcadores más allá de donde llega el transcript: no hay palabras con las que decidir ese corte.
- `span-short` — el transcript cubre menos de la mitad de la secuencia.

Se aplica en los tres sitios donde entra un transcript de disco: `stepTranscript` de The Cutter (si no pasa, re-transcribe), `ensureWords` (si no pasa, falla con el motivo) y `loadWordsFromDisk` del revisor (si no pasa, ignora el archivo y transcribe). Los parciales por ventanas (`.review.json`) se saltan el chequeo: tienen el suyo (`windowsCoverPairs`).

Tres detalles que sostienen esto y son fáciles de romper:
- **El transcript del corte se guarda aparte** (`<seq>.cut.json`, `stage:"cut"`). Sobrescribir el canónico fue exactamente lo que provocó el fallo: el paso del transcript post-corte pisaba el de la secuencia completa, y la siguiente validación de marcadores usaba tiempos del corte.
- El transcript del corte **no entra en `state.transcriptCache`**: de ahí lo saca la validación de marcadores.
- `exportSequenceAudio` sella `durationSeconds` con `parseFloat(seq.end) / TICKS_PER_SECOND`. `seq.end` es un **string de ticks**: `seq.end.seconds` es `undefined` y dejaba la duración en 0, justo el dato con el que se detecta el desajuste.

### `marker-verify.js` (módulo puro)
`verifyBlocks(words, blocks, opts)` devuelve un verdict por borde: `{pairIdx, kind, time, ok, code, message, airFrames, targetTime}`. La revisión es **determinística a propósito**: es un chequeo, no una elección — lo que decide con IA es el reajuste. Códigos:

| code | Qué detecta | Severidad |
|------|-------------|-----------|
| `sense-in` / `sense-out` | el bloque no abre/cierra en la frase que el CD escribió en el marcador | frena |
| `mid-word` | el corte parte una palabra | frena |
| `mid-phrase` | el IN abre con la frase empezada / el OUT la corta a medias | frena (IN) / **avisa** (OUT) |
| `no-air` | el aire es tan corto que se come el ataque (< `hardAirFrames`, 2) habiendo silencio | frena |
| `tight-air` | hay menos aire que el colchón, pero se oye bien | **avisa** |
| `lead-in` | el bloque arranca en un conteo de verdad ("3, 2, 1"), un cue de producción o un anuncio de retoma ("retomamos") | frena |
| `take-start` | el IN abre a mitad de la toma: se come el arranque de la frase | frena |
| `editor-cue` | el bloque cierra con un comando al editor ("pausa", "corte") o con un intento abortado ("me equivoqué", "perdón") | frena |
| `pickup` | el bloque siguiente repite el final de este y detrás no queda contenido | frena |
| `repeat-hint` | lo mismo dicho a los dos lados del corte, con contenido detrás: decide la orden del CD o el editor | **avisa** |
| `overlap` | el OUT se pasa del IN del bloque siguiente | frena |
| `audio-clip` / `audio-air` | el corte no cae donde arranca o termina el sonido (los mide `audio-onset.js` en el WAV) | frena / **avisa** |
| `audio-unmeasured` | no hay silencio limpio que medir y en el corte suena algo: a repasar a mano | **avisa** |
| `note-conflict` | un chequeo quería mover el borde y la nota del CD dice que ahí va | **avisa** |
| `inverted` / `empty` / `too-short` / `overlap` | la estructura del bloque está mal, no el borde | **frena el corte** |

**"Frena" es una prioridad, no un veto** (v2.16.0). Lo único que impide cortar es la **estructura** (`STRUCTURAL`/`isStructural`: OUT antes del IN, bloque vacío o demasiado corto, bloques que se pisan): ahí las zonas de corte saldrían mal y no hay reajuste que lo salve. Los demás códigos ordenan el trabajo del lazo —las fallas se atienden antes que los avisos— pero si alguno sobrevive a las rondas, queda anotado borde por borde y **la clase se corta igual**: dejarla sin cortar por un borde discutible sale más caro que cortarla y repasar ese borde.

**La revisión de SENTIDO (`sense-in`/`sense-out`) la produce `marker-anchor.js`, no este módulo** (`senseVerdicts(words, blocks, opts)`, con `blocks` llevando `inCue`/`outCue`), y `verifyAndFix` la mezcla al principio de `failures`: pesa más que cualquier chequeo mecánico, porque los demás no saben de qué habla la clase. Se compara la **frontera de palabra** con la que el bloque abre o cierra contra el ancla — no el tiempo del marcador, que trae el colchón de aire y daría falsos positivos. Con el ancla `confident`, el borde va donde ella diga. Con la frase **grabada varias veces** no se puede afirmar cuál toma es la buena, pero sí que el borde tiene que caer **en alguna** (`senseTakeToleranceSec`, 2 s, v2.17.0): si está lejos de todas, el bloque no abre ni cierra con lo que el CD escribió y se apunta a la toma más cercana. Es la red del caso de la clase 14 —frase en 1:21 y 1:38, borde en 1:41— por si el LLM llegara a fallarlo de otra forma. Si la frase no aparece, se calla. Los códigos tienen nombre en claro en `CODE_LABELS` (el resumen lo lee el editor, no el programador).

**Un número suelto no es un conteo** (v2.13.1). `leadInWord` exige dos números seguidos ("tres, dos, uno") o un número con un cue de producción al lado ("listo, tres, va"), y `"una"` salió de la lista de números — nadie cuenta "tres, dos, una", y en cambio abre frases de contenido a todas horas. El falso positivo frenaba el pipeline en un bloque que arrancaba exactamente donde el CD pedía: *"Una pregunta de negocio sonaría más o menos así"*. Misma regla en `detectLeadIns` (marker-reviewer.js), que alimenta las pistas del LLM.

**El profesor también anuncia la retoma, y también la aborta** (v2.23.0). Las dos listas de borde estaban a medias, y lo que faltaba es justo lo que más dice un profesor grabando solo:

- **Al abrir**: `retomemos, retomamos, retomo, retoma, retomando, volvemos, repetimos, repito` cuentan como preámbulo igual que un conteo. Con una guarda que los otros cues no necesitan: son palabras que también son contenido (*"repito que el brief…"*), así que solo valen **abriendo frase** (`opensSentence`: puntuación delante o pausa de ≥1s). Sin ella, un *"repetimos"* en medio de una explicación abriría el bloque una frase más tarde.
- **Al cerrar**: los intentos abortados (`me equivoqué, perdón, otra vez, espérate, no no`) se pelan como el *"pausa"*, y detrás de ellos las muletillas sueltas (`bueno, no, eh, este, pues, ok, ajá`). Se pelan **en capas** (`peelTail`), porque en la vida real vienen en racimo — *"…y eso es todo. Bueno, no, espérate."*—: la capa de muletilla sola no cuenta como sobra, pero destapa el aborto que hay detrás y ese sí cierra el bloque antes.

Lo caro de estas listas es el falso positivo, así que valen **solo pegadas al borde** (nunca en medio del bloque) y se midieron en las dos clases antes de darlas por buenas: 20/20 bordes siguen donde el editor los quiere.

**El IN tiene que abrir donde arranca la toma** (`takeStartWord`, v2.13.3). Tras un silencio muy largo la grabación se paró y volvió a arrancar, así que lo primero que se habla después es cómo el profesor decidió abrir la toma nueva; si el IN cae unas palabras más adelante, el corte se come ese arranque. Es el defecto que el editor ve como *"el marcador empieza después de donde habla"*, y ni el aire ni la nota lo detectaban: el punto era una frontera de palabra limpia, con su colchón, y la nota del CD no servía porque el profesor cambió la frase al repetir la toma.

Todo depende del umbral (`takeGapSec`, **12s**), que separa **parar la grabación** de **pausar entre intentos**. Medido sobre una clase real, tras las pausas cortas venía basura que el IN hacía bien en dejar fuera — 4,6s → *"Ay... Perdón."*; 5,5s → *"¿Ahí estoy bien centrada, sí, verdad?"* (al equipo); 6,3s → *"OK, va."* — mientras que tras 24,5s venía *"¿Qué es la respuesta?"*, el arranque legítimo que el corte estaba tirando. Con 12s, de 22 bordes de esa clase (38 tomas nuevas) el chequeo habla en uno solo, el correcto. Guardas: el arranque tiene que estar a ≤15s y ≤30 palabras, no se cruza el OUT del bloque anterior (ahí las palabras ya son de ese bloque), y conteos, cues y disculpas del arranque no cuentan como contenido (`RESTART_CUES`).

**El IN abre una frase y el OUT la cierra** (`phraseStartWord` / `phraseEndWord`, v2.16.0). Es el defecto que más se ve en la timeline y el que ninguna regla veía: el marcador cae **dentro de una frase seguida**. Caso real (clase del 10-ago, bloque 4): la toma arrancaba en *"Por lo tanto, una cadena de evidencia muestra…"* y el IN entró dentro de *"una"*, 1.3s después. El silencio previo (6.4s) no llegaba a `takeGapSec`, así que `take-start` se callaba, y `mid-word` solo lo empujaba al principio de *"cadena"* — igual de a mitad de frase. El LLM lo había elegido diciendo que era *"donde arranca la frase completa"*.

Qué cuenta como principio de frase: la palabra anterior termina en `.`/`?`/`!`/`...`, o hay una pausa de `phraseGapSec` (**1s**) — la puntuación de Whisper es buena en español, y la pausa cubre los tramos donde falta. Guardas para no arrastrar el corte a ciegas: la frase tiene que empezar cerca (≤8s, ≤14 palabras), sin cruzar el OUT del bloque anterior, y sin conteos ni cues por medio (de eso hablan `lead-in` y `take-start`). Para el OUT, además, habla seguida hasta el punto y sin pasar del IN siguiente — alargar el bloque **añade** palabras, así que solo se avisa. `snapToPhrase` aplica la misma regla en el paso 4, en cuanto el LLM elige, en vez de dejarlo para la revisión.

**La nota del CD está por encima de las reglas que MUEVEN el borde** (`NOTE_BEATS`: `take-start`, `pickup`, `mid-phrase`). Vale tanto la frase del bloque como la orden escrita (`out antes de "…"`, v2.20.0). Si el CD escribió que el bloque abre o cierra justo donde está el marcador, ahí va — habrá descartado a mano un falso arranque o una frase que se repite. `dropAgainstNote` (ui-marker-reviewer.js) convierte el verdicto en aviso `note-conflict`, con las dos versiones a la vista. Sin esa salvedad los dos chequeos se pelean y el marcador va y vuelve en cada ronda: eso fue lo que rompió el pipeline el 10-ago (un OUT a 135.1s → 129.9s → 135.1s hasta agotar las rondas). El chequeo compara la frontera de palabra con el ancla, y hasta la v2.16.0 **comparaba un objeto con un número**, así que nunca daba `true` y la salvedad no existía en la práctica.

**Una frase repetida solo se RECORTA si es con lo que el bloque ACABA** (v2.16.0). `pickupOverlap` buscaba la coincidencia en cualquier parte de la cola, y una clase repite frases porque de eso habla: el bloque cerraba con *"…un brief de mercado **selecciona la evidencia relevante y formula implicaciones concretas.**"* y el siguiente abría con *"**Un brief de mercado** sólido sigue…"* — cuatro palabras iguales y ningún pickup. Recortar ahí se llevaba la frase de cierre entera, justo la que el CD había escrito en el marcador. Para recortar, detrás de lo repetido solo pueden quedar cues, conteos o muletillas: un pickup es una toma que se cortó ahí.

**Pero callarse tampoco vale: sale como aviso** (`repeat-hint`, v2.20.0). Las dos situaciones son idénticas por fuera —dos frases completas que empiezan igual y siguen distinto— y ninguna regla las separa: la de la clase 14 son dos frases de la clase, la de la clase 15 es una re-toma (*"Ya que está esa cadena, va a ser un wave frame."* contra *"Entonces, ya que está esa cadena, lo que va a hacer es…"*). Quién decide es la orden del CD o el editor leyendo el reporte, así que el aviso dice qué se repite y desde dónde, **no mueve nada** (`targetTime` vacío, fuera de `FIXABLE_CODES`) y no frena el corte. `leadOffsets` permite que la repetición empiece detrás del conector con el que se retoma (*"Entonces,"*): sin eso la de la clase 15 era invisible.

**El aire se juzga contra lo que existe, no contra el colchón ideal** (`airVerdict`, tres reglas en orden):
1. Si no hay nada que ganar — el silencio disponible ya está casi todo tomado, o la ganancia no llega a `airSlackFrames` (3, lo mínimo que vale la pena mover) — **pasa**. Exigir 10 frames de colchón donde solo hay 7 es pedir algo imposible.
2. Si el aire baja de `hardAirFrames` (2) **frena**: eso sí se oye.
3. Si no, **avisa** (`tight-air`): el corte sigue, el paso queda en amarillo y el detalle en el log. Frenar el pipeline por unos frames de estética es peor que el defecto — fue exactamente el fallo de la v2.12.1, que paraba todo por 1.4 frames.

Dos tipos de arreglo se hacen **sin consultar al LLM**: los `tight-air` (ganar aire no cambia qué palabras entran al bloque) y los `sense-*` (la nota del CD ya dice dónde va el corte y el ancla es una frontera de palabra verificada). El resto de las fallas sí pasan por el LLM, y cuando un mismo borde acumula varias solo se atiende una por ronda: dos movimientos del mismo marcador en el mismo lote se pisarían.

`targetTime` siempre cae en una **frontera de palabra del tipo correcto** (los IN en inicios, los OUT en finales), porque de ahí sale el arreglo mecánico. Ojo con esto al tocar el módulo: un `targetTime` que no sea frontera deja al lazo sin fallback (hay un test que lo vigila para los cinco códigos arreglables).

### El lazo (`verifyAndFix` en ui-marker-reviewer.js)
Por ronda: leer marcadores → `verifyBlocks` + `senseVerdicts` + los veredictos del audio → mover cada borde que falla al punto que el detector señala (`MP.boundaryAt(targetTime)` en la rejilla de palabras, o `applyTime` si lo midió el audio) → `mrMoveMarkers` → volver a verificar. Máximo **4 rondas** (un borde con dos cosas que corregir necesita dos); para si una ronda no mueve nada, porque otra daría lo mismo.

**Ningún arreglo devuelve un marcador a un sitio donde ya estuvo** (v2.16.0). El lazo recuerda por dónde pasó cada borde (media frame de tolerancia) y descarta el movimiento que lo devolvería allí, dejándolo dicho en el log. Es la red que hace que las rondas se agoten solas por muchas reglas que haya: dos chequeos con opiniones distintas empatan una vez, no infinitas. Con eso se pudo subir el máximo de rondas sin miedo a terminar a medias.

**El resultado no es un veto.** `report` separa `blocking` (los códigos estructurales) del resto; The Cutter solo frena el paso con `blocking`, y lo demás lo escribe borde por borde y sigue al corte (paso amarillo).

**Una queja cuyo arreglo apunta a donde el marcador ya está se retira** (`settle`, v2.25.0). Si la reparación —con su colchón y el frame que dice el audio— cae en el mismo frame en el que está el corte, el veredicto se refuta solo: la queja se calculó sobre la rejilla del transcript y la corrección vuelve al punto de partida. Antes eso se saltaba **en silencio** y la falla seguía en el informe ronda tras ronda, sin nada que aplicar ni que ofrecer: el editor leía *"2 de 20 bordes no pasan"* sobre dos cortes bien puestos. Se retiran de una vez todos los veredictos del mismo borde que reparen ahí (a cada borde se le atiende uno por ronda, y dejar los otros repetiría la misma queja con otro código) y queda dicho en el log. Es la red que hace que un fallo de rejilla no se convierta en una denuncia permanente; las causas de esta clase de fallo se arreglan arriba, en la alineación y en la repetibilidad de la medida.

### Lo que el lazo no resuelve se ofrece, no se tira (v2.24.0)

El reporte decía *"2 de 20 bordes no pasan"* y ahí acababa, aunque el sistema **supiera el punto exacto** al que había que mover el corte: "el bloque 3 debe cerrar en 11:32.8 y cierra en 11:31.6". Ese punto se calculaba, se rechazaba y se perdía en una línea de log.

Y el motivo del rechazo casi nunca es ignorancia, es un **empate**: el chequeo de sentido quiere un sitio, la medida del WAV quiere otro, y la memoria de posiciones frena el vaivén dejando el marcador donde estaba. Eso lo rompe una persona en dos segundos mirando la onda; lo que no puede es romperlo si nadie se lo enseña.

`pendingAdjustments(pairs, result)` reparte lo que queda en dos:

- **Ajustes** — el borde sigue fallando **y** hay un sitio al que ir (`anchorFor`, ya con colchón, clamp al bloque y medida de audio, a más de `MIN_CHANGE_SEC` de donde está). Traen el punto, el snippet de cómo quedaría y **por qué no se aplicó solo** (`refused`, que guarda el motivo de cada guarda que dijo no: *"otro chequeo lo devuelve a 11:31.6, el marcador entraría en bucle"*, *"se acabaron las rondas"*). Un borde con dos verdictos se queda con el que sabe a dónde ir, que es el único con el que se puede hacer algo.
- **Observaciones** — no hay punto al que mover: `audio-unmeasured`, `note-conflict`, `repeat-hint` y lo que la lectura de la clase señaló sin que el transcript lo confirme (`coherenceObservations`). Se enseñan sin botón, porque ofrecer un botón sería inventarse el corte.

`applyAdjustments(items, opts, cb)` mueve los aceptados y **no vuelve a decidir nada**: el punto ya venía validado, solo faltaba el sí. Va con su copia `_Pre-marker` como cualquier otro movimiento.

**El pipeline espera justo antes de cortar** (`pauseForPending`), que es el último momento en que mover un marcador sirve para algo. Solo espera si hay ajustes con punto: sin nada que decidir, la clase sale cortada sin intervención, que es de lo que va The Cutter. Al aplicar o al pulsar "Cortar sin aplicar" el pipeline sigue donde lo dejó (`resumePending`), y `pendingResolved` evita que vuelva a parar por lo mismo — se resetea al reintentar cualquier paso anterior al corte, porque volver a revisar produce otra lista. Pidiendo el corte a mano (▶ en ese paso) no se frena nada: es una decisión explícita, y solo queda avisado en el toast y en el log lo que se está dejando dentro.

**Este paso repara, no vuelve a decidir** (v2.13.2). Todos los verdictos traen `targetTime`, que ya es la frontera exacta donde debe caer el corte, así que el arreglo es mecánico y no gasta LLM. Antes se le daba al LLM una **ventana de candidatos** para arreglar la falla, y con eso podía relocalizar el corte a segundos de distancia: arreglando una palabra partida movió un IN de *"¿Qué es la respuesta?"* (arranque de la toma, elegido bien en el paso 4) a *"juntas te ayudan..."*, **5.4s adentro**, dejando el bloque abriendo a mitad de frase. `resolvesIssue` no lo frenaba porque el punto nuevo, efectivamente, ya no partía ninguna palabra.

Los arreglos son **conservadores por construcción**: el `targetTime` de una palabra partida es la propia palabra completa (`word.start` para el IN, `word.end` para el OUT), así que reparar nunca tira contenido que nadie pidió tirar. Hay un test que lo vigila para los cinco códigos arreglables (el arreglo cae en la frontera del detector, la resuelve, y no queda más adentro del bloque que ella).

- **Al LLM solo se le pregunta cuando no hay punto al que reparar** (`targetTime == null`): una retoma que repite el bloque entero. Sin punto tampoco hay red: si la IA no resuelve, el borde se queda como está y la falla se reporta.
- **`resolvesIssue(verdict, newTime, opts)`**: un arreglo tiene que mover el borde en la dirección del problema (si arrancaba en un conteo, el IN va después; si cerraba con "pausa", el OUT va antes). Sigue vigilando el camino del LLM.
- Un borde con dos fallas se arregla una por ronda: dos movimientos del mismo marcador en el mismo lote se pisarían.
- **Cada movimiento queda en el log** con su antes → después y el motivo en claro ("IN del bloque 10: 3719.8s → 3719.3s por corte a mitad de palabra"). Sin eso, el paso solo decía "1 marcador(es) movido(s)" y era imposible saber qué se había tocado.

`analyzeSessionPrecise` (en `ui-marker-reviewer.js`) recorre los bordes en dos tiempos: primero `tryAnchor` (la nota del CD, sin LLM) y **solo si la nota no alcanza** una consulta al LLM con la frase y sus apariciones marcadas (`numPredict: 300`). Devuelve las propuestas con el mismo formato que la card manual, más `session.anchoredCount` (cuántas salieron de la nota, que The Cutter muestra en el detalle del paso). Si alguna consulta falla, el error se propaga (`session.analysisError`) para que quien automatiza no corte a ciegas.

### Cada borde se decide dentro de su bloque (v2.19.0)

El territorio de un borde es el bloque de al lado: el OUT del bloque N no puede pasar del IN del N+1, y al revés. Suena obvio, pero el caso que lo rompía no lo es: el profesor **rehace la frase con la que el bloque cierra** y el bloque siguiente abre con la retoma, así que la frase que el CD escribió en el marcador aparece dos veces, una a cada lado de la frontera. En la clase 15 la IA eligió la segunda —"la frase se dice completa y mejor dicha", y tenía razón— y mandó el OUT 3.4 s dentro del bloque 5.

El límite se pone **antes de decidir**, en los tres caminos, y no después:

- `anchorFor(..., {minTime, maxTime})` descarta las apariciones que caen en el bloque vecino. Con eso la toma que sí es de este bloque suele quedarse sola y el borde se resuelve **sin preguntarle a nadie**; si todas eran del vecino, dice que la frase no aparece en su territorio y no ancla.
- `boundaryPool(..., {minTime, maxTime})` deja fuera esos puntos de la lista que ve el LLM — también los forzados por la nota: una toma en el bloque de al lado no es una opción.
- `clampToBlock`, en el embudo único de propuestas, retrocede a la última frontera de palabra que cabe si el colchón se pasó unos frames, y si no cabe ninguna deja el marcador como estaba.
- `senseVerdicts` (paso 5) usa los mismos límites, para que la revisión no reclame lo que el paso 4 tiene prohibido hacer.

`dropOverlaps` cierra por detrás: lo que aun así quede pisándose **se descarta**, no se recorta. Recortar el OUT al tiempo del IN siguiente —lo que hacía `resolveOverlaps`, retirado en esta versión— es lo que dejaba los dos marcadores en el mismo frame, que no es un bloque de duración cero sino un bloque que al releer los marcadores ya no se puede emparejar ("el OUT quedó antes del IN"). Los marcadores del CD vienen bien ordenados, así que deshacer movimientos siempre devuelve a un estado válido.

Una nota que **no se encuentra** en el transcript no se le pasa al LLM como si fuera texto hablado: suele ser un recado del CD (`"Sin WAV - verificar sync"`, `"revisar out"`), y presentarlo como "el bloque debe abrir con esto" lo mandaría a cortar en cualquier parte.

## Leer la clase antes de cortarla (`readClassAndFix`, v2.23.0)

Todo lo anterior mira **un borde a la vez**: la frase de su marcador, sus palabras vecinas, su bloque de al lado. Un borde puede pasar los quince chequeos y aun así dejar la clase diciendo dos veces lo mismo, porque el defecto no está en el corte sino en **lo que queda al pegar los bloques** — y eso solo se ve leyendo la clase entera. Las piezas existían (`buildFinalTranscript` + `buildCoherencePrompt`) pero como botón manual que informaba y ahí moría; el pipeline iba de la revisión al corte directo.

El paso nuevo (6 de The Cutter, `stepCoherence` → `EP.markerReviewer.readClassAndFix`) va **antes de cortar** y no hace falta cortar para leerlo: se arma el transcript proyectado con los marcadores **actuales** (`buildFinalTranscript`), una consulta lo lee de corrido, y lo que señale vuelve a la cola de reajuste:

1. `buildCoherencePrompt` → `issues[{block, type, detail}]` con `type` en `corte-frase | repeticion | salto-tema | otro`.
2. `coherenceTargets(issues, nBloques, proof)` traduce cada issue a un borde concreto: `corte-frase` → el borde del bloque que quedó a medias (el IN si habla del arranque, el OUT si del cierre, los dos si no lo dice); `repeticion` → el OUT del bloque citado, o el del **anterior** si el detalle dice que eso ya se había dicho (`SAYS_EARLIER`).
3. Esos bordes vuelven a `analyzeSessionPrecise` con `session.only` (solo ellos), `session.extraHints` (el detalle del revisor como contexto, literal) y `session.recheck`, que hace que `retakeCheck` pregunte **aunque no haya repetición medible**: si el revisor lo leyó, hay algo que mirar. Se reverifica y se relee, con el tope de rondas y la memoria de posiciones de `verifyAndFix`.

**Lo que dice el revisor no se aplica sin corroborar** (`transcriptProof`). Es lo único que hace este paso utilizable: el modelo local llegó a decir que 17 de 20 bloques repetían explicaciones, y con eso el paso movía la clase entera. Así que antes de traducir un issue a un movimiento se mide en el transcript si el defecto **existe**: `verifyBlocks` para los cortes a medias (`mid-phrase`/`mid-word`) y `pickupOverlap` para la repetición. Sin prueba, el issue se queda en el log y no mueve nada. La numeración de bloques del LLM tampoco es de fiar —leyendo cinco veces la misma clase citó el bloque bueno una vez y el de al lado tres—, y la prueba es también lo que la ancla: un issue del bloque 7 solo actúa si el borde del 7 está efectivamente mal.

**Es una red, no un detector.** Medido con el modelo local, leyendo cinco veces cada clase: en las dos clases bien cortadas produce observaciones (falta de introducción, saltos de tema) y **ninguna vez mueve un marcador**, que es la mitad importante — un paso de calidad que estropea clases buenas no vale nada. En la clase con la repetición dejada dentro a propósito, 4 de 5 lecturas la ven y **2 de 5 aterrizan en el borde corroborado** (`OUT:3`, el cierre que tiene que irse antes). O sea: pesca a veces lo que las reglas no pescan nunca, y cuando no pesca, deja el corte como estaba. Por eso va después de la revisión mecánica y no en su lugar.

`salto-tema` y `otro` no se traducen a ningún borde: un salto de tema es un problema de estructura de la clase —el CD grabó las cosas en ese orden— y moverle el corte no lo arregla, lo empeora. Quedan en el log para el editor.

**El paso no es fatal.** Si el proveedor falla, si no devuelve JSON, o si nada se corrobora, se sigue al corte y queda dicho en el log: un chequeo de calidad caído no puede dejar la clase sin cortar.

## Revisar Marcadores (marker-reviewer.js + ui-marker-reviewer.jsx/js)

Herramienta previa a Cortes Automáticos: valida cada marcador IN/OUT contra el transcript con el LLM configurado y **mueve los marcadores** a donde la frase tiene sentido. Usa la misma estrategia de precisión que The Cutter (el modo determinístico se retiró en v2.9.1 porque colocaba mal los bordes). El corte sigue siendo el del Cutter clásico (la vía CA2 de reconstrucción XML fue retirada en v2.2.0 porque el reimport duplicaba las anidaciones).

### Flujo (por secuencia: activa o todas las abiertas)
1. Leer marcadores (`getSequenceMarkers` / `getMarkersForSequence(seqId)`) y parsear pares IN/OUT — misma convención del Cutter, claqueta reconocida por nombre/comentario (`clapper`/`claqueta`) o primer marcador como fallback
2. Conseguir `words[]`: transcript ya guardado en `Transcribe/<seq>.json|.srt` (cache) o exportar audio + STT (pipeline existente). El resultado se guarda como JSON normalizado `{words, text, language}` para no re-transcribir
3. Pre-pase determinístico con `EPCutValidator.detectPickups` + `detectLeadIns`: retomas y conteos "3,2,1" se pasan al LLM como *pistas* (`buildPreciseHints`), no como movimiento impuesto
4. **La nota del CD primero** (`marker-anchor.js`, ver sección propia): si el comentario del marcador trae la frase del bloque y se ubica en el transcript sin ambigüedad, el corte va ahí y no se consulta al LLM. Lo que queda pasa a la **estrategia de precisión** (`analyzeSessionPrecise` + `marker-precision.js`): una consulta por borde donde el LLM **elige un punto de corte numerado** —con las apariciones de la frase marcadas ★— en vez de proponer un timecode. `think:false` y `numPredict: 300` para respuestas en segundos
5. Los puntos candidatos ya son fronteras de palabra, así que nunca se corta a mitad de palabra, y el movimiento está acotado a la ventana y **al bloque** (ver "Cada borde se decide dentro de su bloque"); deltas < 0.12s se descartan. Si el LLM falla en alguna consulta, el error queda en `session.analysisError` (toast en la card, fatal para The Cutter)
6. UI de revisión: propuestas con checkbox (razón del LLM, frase repetida, snippet del punto de corte) → "Aplicar seleccionados" mueve los marcadores vía `mrMoveMarkers()` (Premiere no permite cambiar `marker.start`: se borra y recrea conservando nombre/comentario/color/duración)
7. **Transcript final**: concatena las palabras dentro de los bloques ajustados (`buildFinalTranscript`) → texto de la clase como quedaría cortada (guardable como `_final.txt` en Transcribe/, copiable) + **chequeo de coherencia** con el LLM (fluidez entre bloques, frases cortadas, repeticiones, saltos de tema)

### Transcripción por ventanas (modo rápido, v2.3.0)
Checkbox "Transcribir solo alrededor de los cortes" (por defecto ON): en vez de transcribir toda la clase, `computeAudioWindows()` genera ventanas `[in - margin, out + margin]` (margen 120s, fusionando solapes) y `stt.transcribeRegions()` corta el WAV con ffmpeg por ventana, transcribe cada trozo y desplaza los timestamps a tiempo de secuencia. El transcript resultante es parcial (`partial: true`, con `windows`); se guarda como `<seq>.review.json` si ya existe un `<seq>.json` completo, y solo se reutiliza de cache si sus ventanas cubren las fronteras actuales (`windowsCoverPairs`). Sin ffmpeg cae a transcribir todo.

### marker-reviewer.js (módulo puro, testeable en Node)
`parsePairs`, `contextForTime`/`snippetAround`, `clampToWordGap`, `detectLeadIns`, `computeAudioWindows`/`windowsCoverPairs`, `markerBand`/`bandVerdict` (los ~10s que el CD le da al IN), `buildFinalTranscript`, `buildCoherencePrompt`, `coherenceTargets` (de lo que dice el revisor a qué borde arreglar). Los prompts de la validación viven en `marker-precision.js`.

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

`tests/run-node-tests.js` corre en Node las suites de `cut-validator`, `marker-reviewer`, `marker-precision`, `marker-anchor`, `audio-onset`, `marker-verify`, `mlx-parser`, `transcript-edit`, `transcript-repeats` y `thecutter-core` (746 asserts sobre transcripts y marcadores sintéticos; el LLM se valida a nivel de prompts/respuestas mockeadas). Los módulos puros exponen `module.exports` además de `window.*`.

La suite de `audio-onset` escribe un WAV PCM de verdad en un temporal y lo mide de punta a punta (cabecera, ventana, envolvente, borde, colchón), además de los casos que dieron forma al módulo: el OUT que quería abrirse hasta el *"pausa"* del editor, la cola de la palabra que se apaga a saltos, el golpe en el silencio que no es el ataque de la frase, el colchón que no cabe en el silencio disponible, la alineación del transcript entero (el arranque que el STT adelanta, el tramo que se reparte sin invertir palabras, y que **alinear dos veces no mueva nada la segunda** — si no fuera estable, un transcript guardado seguiría teniendo bordes que la medida siguiente cambia), y el WAV de la secuencia ya cortada que no debe colarse por tener el mismo nombre base.

La suite de `marker-anchor` reproduce el caso que originó el módulo: la misma frase grabada dos veces, el marcador puesto tarde dentro de la toma buena, y la comprobación de que el ancla cae en el arranque de esa toma y no en la fallida. También vigila que el **colchón de aire no se confunda con un error de sentido** (un IN 10 frames antes de su palabra está bien puesto), que con dos tomas igual de buenas el módulo **no decida solo** y que, aun así, cante si el borde acabó **fuera de todas** las tomas de la frase.

**Lo que los tests no pueden medir es la precisión**, porque para eso hacen falta una clase de verdad y un modelo de verdad. Eso lo hace un banco aparte, fuera del repo (`/tmp/ep-boundary-bench.js`), que corre los bordes de una clase real contra el proveedor configurado y compara con dónde los quiere el editor. Con `EP_MODE=flow` puntúa el **flujo entero por clase** —bordes en su sitio, consultas al modelo, bordes movidos de más—, que es la cifra que dice si un cambio mejora o no; y con `EP_DUMP=IN:3` escupe el prompt de un borde para leerlo. Es la herramienta con la que se fijaron los umbrales de este flujo (`STRONG_RETAKE_TOKENS`, `NO_NOTE_MAX_CUT_SEC`, el vocabulario de bordes): cada término nuevo se midió antes de darlo por bueno.

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
| `setMarkerDurations(jsonPath, seqId?)` | The Cutter: asigna duración (`endTime`) a marcadores existentes — in-place, con fallback a borrar + recrear |
| `addMarkersFromFile(path, seqId)` | Colocar marcadores (por ID o secuencia activa) |
| `clearMarkersByPrefix(prefix, seqId)` | Limpiar marcadores por prefijo |
| `exportSequenceAudio()` | Exportar audio WAV de la secuencia |
| `backupSequence(suffix?, seqId?)` / `restoreBackup()` | Backup antes de cortes. `suffix` se pega al final del nombre (`_Pre-marker`) y `seqId` permite copiar una secuencia que no es la activa |
| `restoreBackupById(seqId)` | Restaurar backup de una secuencia específica |
| `openBackupAndCut(seqId, cutsFilePath)` | Abrir + backup + cortar atómicamente |
| `getSequenceDurationById(seqId)` | Duración por ID |
| `findSequenceById(seqId)` | Helper para encontrar secuencia por ID |
| `openSequenceById(seqId)` | Abrir secuencia con verificación y reintentos |
| `getAllProjectSequences()` | Listar secuencias del proyecto |
| `getVideoTrackNames()` | Lista de tracks de video con clips |
| `getMarkerNamesAllSequences()` | Nombres/notas distintos de marcadores de todas las secuencias (para el mapeo de vistas, sin abrir pestañas) |
| `getVideoClipPaths()` | Rutas de archivo + posición timeline de clips de video |
| `activateViews(jsonPath)` | Activa/desactiva clips por mapeo de vistas |
| `insertSupertextMOGRTs(jsonPath)` | Insertar gráficos MOGRT en la línea de tiempo (ST2, multi-tipo) |
| `replaceMOGRTClip(jsonPath)` | Reemplazar un clip MOGRT individual en la timeline |
| `selectMOGRTFile()` | Diálogo nativo para seleccionar archivo .mogrt |
| `validateMOGRT(mogrtPath)` | Validar existencia y tipo de archivo MOGRT |

## Marcadores: lo que la API de Premiere permite y lo que no

Validado contra la [Premiere Pro Scripting Guide](https://ppro-scripting.docsforadobe.dev/general/marker/) (objeto Marker):

| Operación | ¿Se puede? | Cómo |
|---|---|---|
| Reposicionar (`marker.start`) | **No** | La doc lo lista como read/write, pero asignarle un `Time` lanza "Illegal Parameter type" y mutar `marker.start.ticks` no hace nada (el getter devuelve una copia). Se **borra y se recrea**: `epRecreateMarker()` |
| Cambiar duración (`marker.end`) | Sí | Solo con un valor en **segundos** (la doc lo aclara: "pass a Seconds value, not a complete replacement `Time`"), nunca con un objeto `Time` |
| Cambiar tipo (`marker.type`) | No (read-only) | `setTypeAsComment()` / `setTypeAsChapter()` / `setTypeAsSegmentation()` / `setTypeAsWebLink()`. `createMarker()` siempre crea uno de comentario |
| Nombre y comentario | Sí | `marker.name` / `marker.comments`, read/write |
| Color | Sí | `setColorByIndex(colorIndex)` con **un solo argumento**: el segundo parámetro documentado (`markerIndex`) apunta a otro marcador de la colección y colorearía el equivocado. Colores: 0 verde · 1 rojo · 2 morado · 3 naranja · 4 amarillo · 5 blanco · 6 azul · 7 cian |
| Identidad estable | Sí | `marker.guid` (read-only). Es la forma fiable de volver a encontrar un marcador cuando el proceso está creando y borrando otros |

### Helpers en `host/common.jsx`
- `epRecreateMarker(markers, target, newStart, endSecs)` — borra y recrea conservando nombre, comentario, color, tipo y duración. `endSecs = null` conserva la duración original. Único camino para "mover".
- `epFindMarkerByGuid(markers, guid)` — identidad estable durante un lote de cambios.
- `epGetMarkerColor(marker)` / `epSetMarkerColor(marker, idx)` — lectura tolerante (la doc describe `getColorByIndex(index)` como "índice del marcador a leer", los scripts reales la llaman sin argumentos) y escritura con un solo argumento.
- `epApplyMarkerType(marker, typeStr)` — restituye el tipo tras recrear.

`mrMoveMarkers` aplica los movimientos en **dos fases**: primero resuelve qué marcador corresponde a cada movimiento y reserva su `guid`, después borra y recrea. Buscar por tiempo mientras se recrean marcadores puede agarrar el equivocado (p.ej. un OUT que retrocede justo a donde estaba otro marcador).

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
2. **Recargar / Actualizar** — recarga el panel y verifica actualizaciones vía GitHub API. Muestra la versión actual (`v2.25.1`); cuando hay una actualización disponible muestra la transición pulsante (p.ej. `v2.25.0 → v2.25.1`).
3. **Ajustes** — abre el panel de configuración (proveedor STT, proveedor de IA, API keys, modelo). Con el proveedor "Claude — mi cuenta" aparece el bloque de sesión: **Iniciar sesión** (abre Terminal con `claude auth login`), **Verificar** (llamada real de prueba) y **Cerrar sesión**. Con "Claude (API key)" el botón ↻ junto al modelo trae la lista actual desde `GET /v1/models`.

> Nota histórica: los botones de debug de MOGRT (🔍/🔬) fueron removidos.

## Versión y auto-actualización

- La versión vive en el archivo `VERSION` (actual: **2.25.1**) y en `CSXS/manifest.xml`.
- `updater.js` implementa un auto-updater basado en la GitHub API (no requiere git instalado) que descarga desde la rama **`workspace-daniel`**.
