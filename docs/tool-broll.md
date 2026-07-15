# 🎞️ B-Roll — Image-to-Video Pipeline

## Qué hace
Genera B-roll visual (imágenes + videos animados + audio ambiental opcional) a
partir de la transcripción usando APIs de generación de imagen/video. La IA
identifica momentos donde un B-roll ayuda, genera una imagen por momento, la anima
a video y la coloca en la timeline de Premiere.

## Arquitectura

```
┌───────────────────────────────────────────────────────────┐
│                     PREMIERE PRO                            │
│                                                             │
│  Panel CEP                          ExtendScript            │
│  ┌────────────────────────┐         ┌────────────────────┐  │
│  │ broll.js (core)         │         │ broll.jsx          │  │
│  │ broll-styles.js         │         │ importAndPlaceBroll│  │
│  │ broll-scenes.js         │         │ replaceBrollClip   │  │
│  │ ui-broll-proposals.js   │         │ importAndPlaceAudio│  │
│  │ ui-broll-clips.js       │         │ getBrollTrackInfo  │  │
│  │ ui-broll.js             │         └────────────────────┘  │
│  └───────────┬────────────┘                                 │
│              │ HTTP :3847                                    │
│              ▼                                               │
│  ┌──────────────────────────────────────────────┐           │
│  │            Motion Server (Node.js)             │           │
│  │  routes/broll.js                               │           │
│  │  ├─ image-generator.js  (PNG)                  │           │
│  │  ├─ video-generator.js  (MP4)                  │           │
│  │  ├─ audio-generator.js  (audio ambiental)      │           │
│  │  └─ anim-wrapper.js     (fallback estático→MP4)│           │
│  └──────────────────────────────────────────────┘           │
└───────────────────────────────────────────────────────────┘
```

`broll.js` comparte el cliente HTTP (`createMotionServerClient`) con Motion-Pro
vía `client/js/motion-server-client.js`.

## Flujo (4 pasos)

```
PASO 1: ANÁLISIS      PASO 2: IMAGEN         PASO 3: ANIMAR      PASO 4: FEEDBACK
━━━━━━━━━━━━━━━━      ━━━━━━━━━━━━━━         ━━━━━━━━━━━━━        ━━━━━━━━━━━━━━━

Transcript           Seleccionar props      🎬 Animar (clip     Textarea por clip
    │                     │                 o "Animar Todos")        │
    ▼                     ▼                      │                    ▼
POST /api/broll/     Por cada una:          POST /api/broll/    Regenerar:
analyze              POST /api/broll/       animate             ├─ imagen →
    │                generate-image             │                  regenerateImage
    ▼                     │                     ▼                  (/generate-image)
Propuestas:          PNG colocado en        MP4 reemplaza el    └─ video →
[{startTime,         timeline (preview)     PNG en timeline        regenerateVideo
  endTime,                                                          (/animate)
  description,
  rationale}]
```

## Paso 1: Análisis

```
Transcripción cargada + servidor iniciado
         │
         ▼
POST /api/broll/analyze  (broll-prompts.js + Prompts/BRoll/analysis.md)
         │
         ├─ El LLM identifica momentos con potencial de B-roll
         ├─ Se le informa la duración máxima del proveedor de video activo
         │   para que planifique los shots
         │
         ▼
Propuestas: [{ startTime, endTime, description, rationale }]
         │
         ▼
splitOversizedShots() (broll-scenes.js)
         ├─ Si un shot excede el máximo del proveedor, se divide en 2+ sub-shots
         └─ Los sub-shots alternan tipo (WIDE → MED → CU) + hints de composición
```

## Paso 2: Generación de Imagen

```
Propuesta seleccionada
         │
         ▼
POST /api/broll/generate-image  (image-generator.js)
         │
         ├─ Proveedor configurable (ver tabla)
         │
         ▼
PNG → importAndPlaceBroll(jsonPath) → host/broll.jsx
         ├─ Importa el PNG, crea/usa bin "B-Roll"
         └─ Coloca en el track de video configurado
```

## Paso 3: Animación (Image-to-Video)

```
Click "🎬 Animar" (por clip) o "🎬 Animar Todos"
         │
         ▼
POST /api/broll/animate  (video-generator.js)
         ├─ Toma el PNG generado como input
         ├─ Genera MP4 (o fallback estático vía anim-wrapper.js)
         │
         ▼
replaceBrollClip(jsonPath) → reemplaza el PNG por el MP4 en la timeline
```

## Paso 4: Feedback / Regenerar

```
Textarea de feedback por clip
         │
         ├─ Si el clip aún es imagen → BRoll.regenerateImage()
         │   (POST /api/broll/generate-image con description + feedback)
         │
         └─ Si el clip ya es video → BRoll.regenerateVideo()
             (POST /api/broll/animate con la misma imagen + feedback)
             └─ Empuja una nueva versión a clip.versions[]
```

## Audio Ambiental (opcional)

```
POST /api/broll/generate-audio  (audio-generator.js)
         │
         ▼
importAndPlaceAudio(jsonPath) → host/broll.jsx
         ├─ Crea un nuevo track de audio
         └─ Coloca los clips de audio ambiental
```

## Proveedores

### Imagen

| Proveedor | Descripción | Config |
|-----------|-------------|--------|
| placeholder | ffmpeg solid color + text overlay (sin API) | — |
| comfyui | ComfyUI + Flux (local, Apple Silicon MPS) | endpointUrl (default `http://localhost:8188`) |
| flux_local | AUTOMATIC1111 txt2img API | endpointUrl (default `http://localhost:7860`) |
| fal | FAL.ai API (Flux, SDXL, etc.) | apiKey, model (default `fal-ai/flux/schnell`) |

### Video

| Proveedor | Descripción | Config | Máx |
|-----------|-------------|--------|-----|
| placeholder | ffmpeg PNG→MP4 estático | — | 30s |
| ltx_local | LTX Video API local | endpointUrl (default `http://localhost:7861`) | 10s |
| kling | Kling API cloud (image2video) | apiKey | 10s |
| fal | FAL.ai queue API (Kling 2.0/3.0 vía FAL) | apiKey, model | 10s |
| gemini_video | Gemini Veo (Google AI) | apiKey | 8s |

`video-generator.js` exporta `VIDEO_PROVIDER_MAX_DURATION` con estos límites, y el
shot splitting (paso 1) los usa para dividir shots que excedan el máximo.

### Audio Ambiental

| Proveedor | Descripción | Config |
|-----------|-------------|--------|
| placeholder | ffmpeg silent audio (sin API) | — |
| elevenlabs | ElevenLabs Sound Effects API | apiKey (xi-api-key) |

## Persistencia

| localStorage key | Contenido |
|------------------|-----------|
| `editorpro_broll_state` | Propuestas y clips por sesión |
| `editorpro_broll_settings` | Configuración de proveedores y tracks |

## Server Endpoints (`/api/broll/*`)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/broll/analyze` | Detectar momentos B-roll desde el transcript |
| POST | `/api/broll/generate-image` | Generar PNG para una propuesta |
| POST | `/api/broll/animate` | Image-to-video (PNG → MP4) |
| POST | `/api/broll/generate-audio` | Generar audio ambiental |
| GET | `/api/broll/status/:jobId` | Estado de un job |
| GET | `/api/broll/check-comfyui` | Verificar disponibilidad de ComfyUI |
| GET | `/api/broll/comfyui-debug` | Debug de ComfyUI |
| GET | `/api/broll/fal-models` | Listar modelos disponibles en FAL |

## Archivos

| Archivo | Rol |
|---------|-----|
| `client/js/broll.js` | Core: constructor, settings, state, server comms, gen/animate/place |
| `client/js/broll-styles.js` | Definiciones de estilos B-Roll (single source of truth) |
| `client/js/broll-scenes.js` | Parseo de escenas, utilidades de tiempo, shot splitting |
| `client/js/ui-broll-proposals.js` | UI Steps 1-2 (análisis, cards de propuestas, generación) |
| `client/js/ui-broll-clips.js` | UI Step 3 (cards de clips, animar, place, regen) |
| `client/js/ui-broll.js` | Orquestador de la UI (init, settings, accordion, session switch) |
| `motion-server/routes/broll.js` | Rutas Express `/api/broll/*` |
| `motion-server/lib/image-generator.js` | Generación de imágenes |
| `motion-server/lib/video-generator.js` | Generación de video (image-to-video) |
| `motion-server/lib/audio-generator.js` | Generación de audio ambiental |
| `motion-server/lib/anim-wrapper.js` | Fallback de animación estática → video |
| `motion-server/lib/broll-prompts.js` | Builder del prompt de análisis |
| `motion-server/lib/media-utils.js` | Helpers compartidos (findFfmpeg, downloadToFile) |
| `host/broll.jsx` | importAndPlaceBroll, replaceBrollClip, importAndPlaceAudio, getBrollTrackInfo |
| `Prompts/BRoll/analysis.md` | System prompt para detección de momentos B-roll |
| `client/css/broll.css` | Estilos |
