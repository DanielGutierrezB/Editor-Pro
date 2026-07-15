# 📝 Transcripción

## Qué hace
Sistema unificado para cargar, parsear, cachear y mostrar transcripts de múltiples fuentes. Alimenta a las demás herramientas.

## Fuentes de Transcript

```
┌─────────────────────────────────────────────────────┐
│                 FUENTES DE TRANSCRIPT                │
│                                                      │
│  🎵 Whisper    📄 SRT     📋 Clipboard              │
│  (STT API)    (archivo)  (pegar)                    │
│       │           │          │                       │
│  📄 JSON       🎬 Secuencia  📂 .prtranscript       │
│  (Premiere    (captions    (junto a                  │
│   Text Panel)  embebidas)   media files)             │
│       │           │          │                       │
│       └───────────┼──────────┘                       │
│                   ▼                                  │
│         ┌─────────────────┐                          │
│         │ transcript-     │                          │
│         │ parser.js       │                          │
│         │                 │                          │
│         │ Parsea todos    │                          │
│         │ los formatos    │                          │
│         │ → segments[]    │                          │
│         └────────┬────────┘                          │
│                  ▼                                   │
│         ┌─────────────────┐                          │
│         │ state.segments  │                          │
│         │ state.transcript│──► Todas las herramientas│
│         └─────────────────┘                          │
└─────────────────────────────────────────────────────┘
```

## Flujo: Auto-Load al Cambiar de Secuencia

```
Secuencia cambia (polling cada 2s)
         │
         ▼
¿Hay cache para esta secuencia?
    │              │
    SÍ             NO
    │              │
    ▼              ▼
Restaurar      transcript-manager.js:
estado         autoLoadTranscriptForSequence()
cacheado           │
                   ├─ 1. Buscar en carpetas conocidas
                   │     (último import, Transcribe/)
                   │
                   ├─ 2. Buscar .prtranscript junto a media
                   │
                   ├─ 3. Buscar .json/.srt cerca del proyecto
                   │
                   ├─ 4. Leer transcript embebido en .prproj
                   │     (segmentList, SyntheticCaption)
                   │
                   └─ 5. Nada encontrado → mostrar instrucciones
```

## Flujo: "Traer de Secuencia"

```
Click "🎬 Traer de secuencia"
         │
         ▼
evalScript("getSequenceTranscriptInfo()")
         │
         ├─ projectPath, mediaPaths, sequenceName
         │
         ▼
Prioridad 1: Carpetas conocidas
         │ (transcript-manager)
         │
Prioridad 2: Archivos cerca del proyecto
         │ (.prtranscript > .json > .srt)
         │
Prioridad 3: Transcript embebido en .prproj
         │ (segmentList / base64)
         │
Prioridad 4: Captions de Premiere
         │ (SyntheticCaption binary decode)
         │
         ▼
Cargar → parseSRT() → state.segments
```

## Cache de Secuencias

```
Sequence Cache (LRU, max 20 secuencias)
┌────────────────────────────────────────┐
│ _seqCache = {                          │
│   "Clase 1": {                         │
│     transcript: "...",                  │
│     segments: [...],                   │
│     sttResult: {...},                  │
│     supertexts2: [...],               │
│     es2Highlights: [...],             │
│     clipResults: {...},               │
│     ...                               │
│   },                                   │
│   "Clase 2": { ... },                 │
│ }                                      │
└────────────────────────────────────────┘

Al cambiar de secuencia:
1. Guardar estado actual en cache
2. Restaurar estado de nueva secuencia (si hay cache)
3. Si no hay cache → auto-load transcript
```

## Formatos Soportados

| Formato | Ejemplo | Parser |
|---------|---------|--------|
| SRT estándar | `1\n00:00:01,000 --> 00:00:05,000\nTexto` | `parseSRT()` |
| Timestamps | `[0:30] Texto del segmento` | `parseSRT()` (fallback) |
| Texto plano | Líneas de texto sin timestamps | `parseSRT()` (5s/línea) |
| JSON Premiere | `{ segments: [{ start, duration, words }] }` | `parsePremiereTextPanelJson()` |
| .prtranscript | `{ segmentList: [{ transcript, items }] }` | `parsePrTranscript()` |
| Captions .prproj | Binary SyntheticCaption blocks | `readCaptionsFromProjectFile()` |

## Archivos

| Archivo | Rol |
|---------|-----|
| `transcript-parser.js` | Parseo de todos los formatos (SRT, JSON, .prtranscript, captions) |
| `transcript-manager.js` | Carga, búsqueda, cache por secuencia, auto-load y UI |

> `transcript-cache.js` fue eliminado en el refactor de calidad de código; sus
> funciones públicas (auto-load y cache por secuencia) las expone ahora
> `transcript-manager.js`.
