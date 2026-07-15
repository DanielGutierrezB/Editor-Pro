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

## 16 Tipos de Motion

Definidos en `motion-server/lib/prompts/type-instructions.js` (`TYPE_INSTRUCTIONS`):

```
┌──────────────┬────────────────────────────────────────┐
│ Tipo         │ Descripción                            │
├──────────────┼────────────────────────────────────────┤
│ comparison   │ Tabla/columnas comparativas (A vs B)   │
│ steps        │ Proceso paso a paso                    │
│ icons        │ Reveal de iconos con labels            │
│ chart        │ Gráficos animados (barras, líneas)     │
│ title        │ Título/intro con subtítulo             │
│ cards        │ Tarjetas en flujo horizontal           │
│ diagram      │ Diagrama de flujo                      │
│ ui           │ Mockup de interfaz                     │
│ timeline     │ Línea de tiempo (eventos secuenciales) │
│ reveal       │ Revelar / draw-on                      │
│ list         │ Lista animada (items verticales)       │
│ metrics      │ Dashboard de KPIs/métricas             │
│ beforeafter  │ Antes/después (split screen)           │
│ funnel       │ Embudo/pipeline con flujo              │
│ gauge        │ Gauge/benchmark (métrica vs objetivo)  │
│ callout      │ Callout / frase clave                  │
└──────────────┴────────────────────────────────────────┘
```

## Paso 2: Context Pass → Generación (Static Layout) → Preview

El pipeline de generación por defecto (el que dispara "Generar") es el **motor de
Static Layout**: el LLM diseña solo el layout + estilo estáticos y el **Anim
wrapper** inyecta toda la animación automáticamente. El antiguo subsistema de
templates (`template-manager.js`, `template-prompt.js`, `templates/*.tsx`) fue
eliminado — la ruta `POST /api/generate/template` hoy es el motor de static-layout.

```
Context Pass (una sola llamada para todo el batch)
    POST /api/generate/context
    ├─ Analiza el transcript completo + lista de segmentos marcados
    └─ Genera notas de contexto + plan de timing por segmento
         │
         ▼
Por cada propuesta seleccionada:
    POST /api/generate/template  (motor Static Layout)
    ├─ getStaticLayoutPrompt(): el LLM diseña SOLO layout + estilo (sin animación)
    ├─ injectAnimWrapper(): inyecta la implementación de Anim/Section (motion)
    └─ Sanitización + validación automática:
        ├─ tsx-sanitizer.js: brandfetch, Trail, transitions, staticPreview
        ├─ tsx-validator.js: imports permitidos, syntax + auto-fix
        └─ timing-validator.js: gaps + persistencia de elementos hasta el frame final
         │
         ▼
POST /api/render/preview → still PNG
         │
         ├─ Remotion renderiza un frame como PNG
         ├─ staticPreview: elementos a full opacity
         │
         ▼
PNG colocado en timeline como preview
         │
         ├─ Usuario revisa visualmente
         ├─ Puede dar feedback → regenerar (POST /api/feedback)
         └─ Cuando está OK → Animar
```

> También existe una ruta de generación free-form (`POST /api/generate`) que genera
> TSX Remotion desde cero, pero el flujo estándar de la UI usa el motor de
> Static Layout descrito arriba.

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
         ├─ Render: Remotion → ProRes 422, 1920×1080, 30fps
         │   (ProRes 4444 con alpha en modo transparente)
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
timing-validator.js:
├─ detectar gaps de timing
└─ verificar que los elementos persisten hasta el frame final
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
| POST | `/api/rhythm` | Análisis de ritmo del transcript |
| GET/POST | `/api/prompts` | Obtener / actualizar prompts |
| POST | `/api/palette` | Generar/analizar paleta de colores |
| POST | `/api/generate/propose` | Propuesta visual (art director) |
| POST | `/api/generate` | Generar TSX free-form desde transcript |
| POST | `/api/generate/template` | Motor Static Layout (layout + Anim wrapper) |
| POST | `/api/generate/context` | Context Pass del batch completo |
| POST | `/api/render` | Encolar render → jobId |
| GET | `/api/render/status/:id` | Estado del job |
| POST | `/api/render/preview` | Render still PNG |
| POST | `/api/feedback` | Regenerar con feedback |
| GET | `/api/studio/sync` | Sincronizar sesión |
| GET | `/api/studio/start` | Abrir Remotion Studio |
| GET | `/api/studio/url[/:id]` | URL de Remotion Studio |
| POST/GET | `/api/broll/*` | Rutas de B-Roll (ver [B-Roll](./tool-broll.md)) |

## Archivos

| Archivo | Rol |
|---------|-----|
| `ui-motion-pro.js` | UI completa: paleta, propuestas, generación, animación, control panel |
| `motion-pro.js` | Server lifecycle, versionado, sesión; delega HTTP en `motion-server-client.js` |
| `motion-server-client.js` | Cliente HTTP compartido (`createMotionServerClient`) — usado por Motion-Pro y B-Roll |
| `motion-server/server.js` | Express entry point (puerto 3847) |
| `motion-server/lib/remotion-manager.js` | Composition writing, Root.tsx, render |
| `motion-server/lib/tsx-sanitizer.js` | Sanitización de TSX |
| `motion-server/lib/tsx-validator.js` | Validación de imports/syntax + auto-fix |
| `motion-server/lib/timing-validator.js` | Validación de timing (gaps, persistencia) |
| `motion-server/lib/anim-wrapper.js` | Inyecta implementación de Anim/Section (motion) |
| `motion-server/lib/static-layout-prompt.js` | Prompt del motor Static Layout |
| `motion-server/lib/prompts.js` | Orquestador de prompts (~349 ln); contenido en `lib/prompts/` |
| `motion-server/lib/prompts/` | system-prompt, palette-prompt, composition-defs, type-instructions |
| `motion-server/lib/llm.js` | Abstracción multi-proveedor LLM (`_httpJson` unificado) |
| `motion-server/lib/render-queue.js` | Cola async de renders (1 a la vez, `fireOnce`) |
| `motion-server/lib/rhythm-analyzer.js` | Análisis de ritmo del transcript |
| `motion-server/lib/color-extractor.js` | Extracción de colores de marca |
| `host/motion.jsx` | importAndPlaceMotions, replaceMotionOnTrack, importAndPlaceAbove |
| `css/motion-pro.css` | Estilos |
