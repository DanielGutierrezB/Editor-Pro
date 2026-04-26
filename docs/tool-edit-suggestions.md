# ✂️ Sugerencias de Edición + 🎬 Propuesta de Reel

## Qué hace
**Sugerencias de Edición:** Analiza la transcripción y detecta highlights, sugiere cortes, e identifica errores (contenido repetido, tangentes, errores verbales).

**Propuesta de Reel:** Analiza el contenido y propone reels de alta retención para Instagram/YouTube/Facebook.

## Flujo: Sugerencias de Edición

```
Transcripción cargada
         │
         ▼
Click "Analizar Edición"
         │
         ▼
AIAnalyzer.analyzeEditSuggestions(transcript, promptContext)
         │
         ├─ LLM analiza el transcript completo
         │
         ▼
Respuesta categorizada en 3 tipos:
         │
         ├─ 🟢 HIGHLIGHTS — Momentos clave del contenido
         │   "Definición clara de ML en 2:15 - excelente ejemplo"
         │
         ├─ 🟡 SUGGESTIONS — Cortes sugeridos
         │   "Repetición en 5:30-5:45 - el profesor dice lo mismo"
         │
         └─ 🔴 ERRORS — Problemas detectados
             "Error factual en 8:20 - dato incorrecto sobre Python"
         │
         ▼
┌─────────────────────────────────────────────┐
│              RESULTADOS EN UI                │
│                                              │
│  Summary: 12 highlights, 5 sugerencias,     │
│           2 errores                          │
│                                              │
│  🟢 2:15 "Definición clara de ML"           │
│     [▶ Ir] [Colocar marcador]               │
│                                              │
│  🟡 5:30 "Repetición — cortar segmento"     │
│     [▶ Ir] [Colocar marcador]               │
│                                              │
│  🔴 8:20 "Error factual"                    │
│     [▶ Ir] [Colocar marcador]               │
│                                              │
│  [📋 Copiar]                                │
└─────────────────────────────────────────────┘
```

## Flujo: Propuesta de Reel

```
Transcripción cargada
         │
         ▼
Click "Analizar para Reels"
         │
         ▼
AIAnalyzer.analyzeReelProposal(transcript, promptContext)
         │
         ├─ LLM analiza retención y viralidad
         │
         ▼
┌─────────────────────────────────────────────┐
│           PROPUESTAS DE REEL                 │
│                                              │
│  Assessment: "Buen contenido para reels,    │
│  3 momentos con potencial viral"             │
│                                              │
│  📱 Reel 1: "¿Qué es realmente la IA?"     │
│     Hook: "La IA no es lo que crees..."     │
│     Segmento: 1:20 - 2:45 (1:25)           │
│     Retención estimada: ⭐⭐⭐⭐             │
│     [▶ Preview] [🎬 Crear secuencia 9:16]   │
│                                              │
│  📱 Reel 2: "3 errores que todos cometen"   │
│     Hook: "El 90% de la gente hace esto..."│
│     Segmento: 5:10 - 6:30 (1:20)           │
│     Retención estimada: ⭐⭐⭐⭐⭐            │
│     [▶ Preview] [🎬 Crear secuencia 9:16]   │
└─────────────────────────────────────────────┘
         │
         ▼
Click "🎬 Crear secuencia 9:16"
         │
         ▼
evalScript('createReelSequence(jsonPath)')
         │
         ├─ Crea nueva secuencia 1080x1920 (vertical)
         ├─ Copia clips del segmento seleccionado
         └─ Lista para exportar
```

## Batch Mode (Ambas herramientas)

```
Mismo patrón que Smart Supertexts:
1. Escanear secuencias abiertas con transcript
2. Seleccionar con checkboxes
3. Analizar todas en paralelo
4. Navegar resultados por secuencia ← →
```

## Archivos

| Archivo | Rol |
|---------|-----|
| `ui-edit-suggestions.js` | UI de ambas herramientas (1,318 líneas) |
| `ai-analyzer.js` | analyzeEditSuggestions(), analyzeReelProposal() |
| `host/recording.jsx` | createReelSequence() |
