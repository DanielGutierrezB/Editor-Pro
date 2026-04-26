# 🎬 Motion-Pro

## Qué hace
Genera motion graphics animados automáticamente a partir de la transcripción usando Remotion (React → MP4). Pipeline completo: análisis → propuesta visual → generación TSX → preview → render → colocación en timeline.

## Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                    PREMIERE PRO                          │
│                                                          │
│  Panel CEP                         ExtendScript          │
│  ┌──────────────┐                  ┌──────────────────┐  │
│  │motion-pro.js │                  │ motion.jsx       │  │
│  │(lifecycle,   │                  │ importAndPlace-  │  │
│  │ polling)     │                  │ Motions()        │  │
│  │              │                  │ replaceMotion-   │  │
│  │ui-motion-    │                  │ OnTrack()        │  │
│  │pro.js (UI)   │                  │ getClipInfo-     │  │
│  └──────┬───────┘                  │ ByName()         │  │
│         │                          │ importAndPlace-  │  │
│         │ HTTP :3847               │ Above()          │  │
│         ▼                          └──────────────────┘  │
│  ┌──────────────────────────────┐                        │
│  │     Motion Server (Node.js)  │                        │
│  │                              │                        │
│  │  ┌────────┐  ┌───────────┐  │                        │
│  │  │LLM API │  │ Remotion  │  │                        │
│  │  │(Gemini,│  │ (render   │  │                        │
│  │  │Claude, │  │  TSX →    │  │                        │
│  │  │GPT,    │  │  MP4/PNG) │  │                        │
│  │  │Ollama) │  │           │  │                        │
│  │  └────────┘  └───────────┘  │                        │
│  └──────────────────────────────┘                        │
└──────────────────────────────────────────────────────────┘
```

## Pipeline Completo (3 Pasos)

```
PASO 1: ANÁLISIS           PASO 2: GENERACIÓN         PASO 3: CONTROL
━━━━━━━━━━━━━━━━           ━━━━━━━━━━━━━━━━━━         ━━━━━━━━━━━━━━━

Transcript               Seleccionar propuestas     Panel por motion:
    │                         │                        │
    ▼                         ▼                        ├─ Thumbnail
LLM analiza              Para cada una:               ├─ Versiones
    │                    ┌────┴─────┐                  ├─ Feedback
    ▼                    ▼          ▼                  ├─ Re-generar
Propuestas          💡 Proponer  🎬 Generar           ├─ Remotion Studio
con tipo,           (visual      (TSX → PNG           └─ Animar
prioridad,          description) preview)
timestamps              │          │
                        ▼          ▼
                   Generar TSX  Colocar PNG
                   libre o      en timeline
                   template     (preview)
                        │
                        ▼
                   🎬 Animar
                   (PNG → MP4)
                   Render video
                   Reemplazar
                   PNG con MP4
```

## Paso 1: Análisis

```
Transcripción cargada + servidor iniciado
         │
         ▼
Click "Analizar para Motions"
         │
         ├─ Opción: "Solo en marcadores de secuencia"
         │   (filtra transcript a zonas con marcadores)
         │
         ├─ Estilo Visual: paleta de colores del curso
         │   ├─ 📷 Capturar frame actual
         │   ├─ 📁 Importar imágenes de referencia
         │   └─ 🎨 Analizar paleta con IA (canvas + visión)
         │
         ▼
POST /api/generate → LLM analiza transcript
         │
         ▼
Propuestas: [{
    type: "comparison",
    title: "ML Supervisado vs No Supervisado",
    description: "Tabla comparativa con 4 criterios",
    startTime: 45.2,
    endTime: 52.8,
    priority: "high"
}]
```

## 20 Tipos de Motion

```
┌──────────────┬────────────────────────────────────────┐
│ Tipo         │ Descripción                            │
├──────────────┼────────────────────────────────────────┤
│ comparison   │ Tabla/columnas comparativas            │
│ steps        │ Proceso paso a paso                    │
│ icons        │ Iconos con labels                      │
│ chart        │ Gráficos animados (barras, líneas)     │
│ title        │ Título con subtítulo                   │
│ cards        │ Tarjetas con contenido                 │
│ diagram      │ Diagramas de flujo                     │
│ ui           │ Mockup de interfaz                     │
│ metrics      │ Métricas con odómetro                  │
│ gauge        │ Gauge circular animado                 │
│ reveal       │ Revelar contenido con scroll           │
│ list         │ Lista animada                          │
│ timeline     │ Línea de tiempo horizontal             │
│ funnel       │ Embudo de conversión                   │
│ callout      │ Callout con flecha                     │
│ beforeafter  │ Antes/después con slider               │
│ ... y más    │                                        │
└──────────────┴────────────────────────────────────────┘
```

## Paso 2: Proponer → Generar → Preview

```
Propuesta seleccionada
         │
         ▼
OPCIÓN A: Template-based (rápido)
    POST /api/generate/template
    ├─ Elige template predefinido según type
    ├─ LLM llena datos del template
    └─ TSX predecible, consistente

OPCIÓN B: Free-form (creativo)
    POST /api/generate/propose → descripción visual
    POST /api/generate → TSX Remotion original
    ├─ LLM genera código TSX desde cero
    ├─ Más creativo pero puede fallar
    └─ Sanitización automática:
        ├─ tsx-sanitizer.js: brandfetch, Trail, transitions
        ├─ tsx-validator.js: imports, syntax
        └─ Auto-fix para errores comunes
         │
         ▼
POST /api/render/preview → still PNG (~15 segundos)
         │
         ├─ Remotion renderiza frame 30 como PNG
         ├─ staticPreview: elementos a full opacity
         │
         ▼
PNG colocado en timeline como preview
         │
         ├─ Usuario revisa visualmente
         ├─ Puede dar feedback → regenerar
         └─ Cuando está OK → Animar
```

## Paso 2b: Feedback → Regenerar

```
Preview visible en timeline
         │
         ▼
Escribir feedback:
"El texto es muy pequeño, usar colores más vivos"
         │
         ▼
POST /api/feedback → LLM ajusta el TSX
         │
         ├─ Re-renderiza preview
         ├─ Nueva versión aparece en panel
         └─ Historial de versiones disponible
```

## Paso 3: Animar

```
Click "🎬 Animar" (individual o todos)
         │
         ▼
Leer duración del clip PNG en Premiere
         │
         ├─ getClipInfoByName(namePattern)
         ├─ → trackIndex, startSecs, endSecs, durationSecs
         │
         ▼
POST /api/render (con durationFrames override)
         │
         ├─ Render queue: 1 job a la vez
         ├─ Polling: GET /api/render/status/:jobId (cada 3s)
         ├─ Render: H.264, 1920×1080, 30fps, CRF 15
         │
         ▼
MP4 listo
         │
         ├─ importAndPlaceAbove(jsonPath) → host/motion.jsx
         │   ├─ Importar MP4 al proyecto
         │   ├─ Colocar en track+1 encima del clip PNG
         │   └─ Remover clip PNG original
         │
         ▼
Motion graphic animado en la timeline ✅
```

## Render Queue (Async)

```
┌─────────────────────────────────────────┐
│           RENDER QUEUE                   │
│                                          │
│  POST /api/render → jobId (inmediato)   │
│                                          │
│  GET /api/render/status/:jobId          │
│  ├─ "queued"    → esperando              │
│  ├─ "rendering" → en proceso             │
│  ├─ "complete"  → { mp4Path }           │
│  └─ "error"     → { error }            │
│                                          │
│  Cola serial: 1 render a la vez          │
│  Auto-limpieza: jobs > 30 min           │
│  Poll cada 3s, max 140 polls (7 min)    │
└─────────────────────────────────────────┘
```

## Versionado

```
Cada motion tiene un array de versiones:

motion.versions = [
    { version: 1, compositionId: "comp-abc", tsxPath, mp4Path, status: "rendered" },
    { version: 2, compositionId: "comp-abc-v2", tsxPath, mp4Path, status: "preview", feedback: "..." },
]

- Dropdown para cambiar versión activa
- Cada versión se coloca en track superior (stacking)
```

## TSX Sanitización Pipeline

```
TSX generado por LLM
         │
         ▼
tsx-sanitizer.js:
├─ stripBrandfetch() → reemplazar URLs brandfetch con icons locales
├─ stripTrail() → remover @remotion/motion-blur (crash prevention)
├─ stripFadeTransitions() → reemplazar TransitionSeries con Sequence
├─ injectStaticPreview() → agregar _static check para stills
└─ replaceBrandIcons() → lucide icons → SVG logos locales
         │
         ▼
tsx-validator.js:
├─ validateImports() → check contra paquetes permitidos
├─ validateSyntax() → strings, brackets balance
└─ autoFixSyntax() → cerrar strings abiertas
         │
         ▼
TSX limpio → writeComposition() → Root.tsx → render
```

## Sesiones (Persistencia)

```
Cada secuencia tiene una carpeta de sesión:

motion-render/out/{session-name}/
├── renders/          → Videos renderizados (MP4)
├── previews/         → Still previews (PNG)
├── src/              → Código fuente TSX (editable)
├── feedback/         → Imágenes de referencia capturadas
├── FEEDBACK.md       → Log de feedback enviado
└── README.txt        → Instrucciones

Al cambiar de secuencia:
├─ syncFromSession() → cargar TSX + Root.tsx
└─ saveToSession()   → guardar composición actual
```

## Server Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/status` | Estado del servidor |
| POST | `/api/generate` | Generar TSX desde transcript |
| POST | `/api/generate/template` | Generar con template |
| POST | `/api/generate/propose` | Propuesta visual (art director) |
| POST | `/api/render` | Encolar render → jobId |
| GET | `/api/render/status/:id` | Estado del job |
| POST | `/api/render/preview` | Render still PNG |
| POST | `/api/feedback` | Regenerar con feedback |
| GET | `/api/studio/sync` | Sincronizar sesión |
| GET | `/api/studio/start` | Abrir Remotion Studio |
| POST | `/api/rhythm` | Análisis de ritmo del transcript |
| GET | `/api/prompts` | Obtener prompts actuales |
| POST | `/api/prompts` | Actualizar prompts |

## Archivos

| Archivo | Rol | Líneas |
|---------|-----|--------|
| `ui-motion-pro.js` | UI completa: paleta, propuestas, generación, animación, control panel | 2,793 |
| `motion-pro.js` | Server lifecycle, HTTP client, polling | 893 |
| `motion-server/server.js` | Express entry point (puerto 3847) | 230 |
| `motion-server/lib/remotion-manager.js` | Composition writing, Root.tsx, render | 391 |
| `motion-server/lib/tsx-sanitizer.js` | Sanitización de TSX | 232 |
| `motion-server/lib/tsx-validator.js` | Validación + auto-fix | 166 |
| `motion-server/lib/prompts.js` | System prompt + type instructions | 898 |
| `motion-server/lib/llm.js` | Abstracción multi-proveedor LLM | 475 |
| `motion-server/lib/render-queue.js` | Cola async de renders | 138 |
| `motion-server/lib/rhythm-analyzer.js` | Análisis de ritmo | 215 |
| `host/motion.jsx` | importAndPlaceMotions, replaceMotionOnTrack | 564 |
| `css/motion-pro.css` | Estilos | 550 |
