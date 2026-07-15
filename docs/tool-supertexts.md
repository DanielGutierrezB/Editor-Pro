# 💡 Smart Supertexts

## Qué hace
Analiza la transcripción con IA y genera gráficos (Essential Graphics / MOGRT) directamente en la línea de tiempo. Cada supertexto se inserta como un clip de gráfico con el tipo, duración y posición exacta.

## Flujo Principal

```
Transcripción cargada
         │
         ▼
Click "Generar Supertextos"
         │
         ├─ Filtro por tracks (opcional): solo donde hay clips en V1-V8
         │
         ▼
AIAnalyzer.analyzeSupertexts(transcript, promptContext)
         │
         ├─ LLM analiza el transcript
         ├─ Identifica momentos clave
         ├─ Asigna tipo: title, bullet, step, definition, data, summary, highlight
         ├─ Calcula startTime y endTime basado en el transcript
         │
         ▼
┌─────────────────────────────────────────────┐
│              REVISIÓN EN UI                  │
│                                              │
│  ☑ [title]  "¿Qué es Machine Learning?"     │
│     0:15 - 0:20  │ Editar texto │ Cambiar tipo │
│                                              │
│  ☑ [bullet] "Supervisado vs No Supervisado" │
│     1:30 - 1:45  │ Editar texto │ Cambiar tipo │
│                                              │
│  ☐ [data]   "95% de precisión"              │
│     3:00 - 3:10  │ Editar texto │ Cambiar tipo │
│                                              │
│  [Seleccionar todos] [🎬 Crear Gráficos]    │
│  [Excluir pista V3]                          │
└─────────────────────────────────────────────┘
         │
         ▼
Click "🎬 Crear Gráficos"
         │
         ▼
Escribir JSON temporal con supertextos seleccionados
         │
         ▼
evalScript('insertSupertextMOGRTs(jsonPath)')
         │
         ├─ Para cada supertexto:
         │   ├─ seq.importMGT(mogrtPath) → importar MOGRT del tipo
         │   ├─ Setear texto del clip
         │   ├─ Setear duración (endTime - startTime)
         │   ├─ Setear nombre del clip = texto
         │   ├─ Setear color label por tipo
         │   └─ Ajustar posición Y (bullets en cascada)
         │
         └─ Resultado: clips MOGRT en la timeline
```

## Tipos y Colores

```
┌──────────────┬───────────┬──────────────────────────┐
│ Tipo         │ Color     │ Uso                      │
├──────────────┼───────────┼──────────────────────────┤
│ title        │ 🟠 Mango  │ Títulos de sección       │
│ bullet       │ 🔵 Cerulean│ Puntos clave (cascada)  │
│ step         │ 🟢 Forest │ Pasos de proceso         │
│ definition   │ 🟣 Iris   │ Definiciones técnicas    │
│ data         │ 🟡 Yellow │ Datos/estadísticas       │
│ summary      │ 🌸 Rose   │ Resúmenes               │
│ highlight    │ ⬜ Default │ Destacados generales     │
└──────────────┴───────────┴──────────────────────────┘
```

## Cascada de Bullets

```
Timeline:

Track V5 │                    ┌─── bullet 3 ───┐
Track V4 │          ┌─── bullet 2 ──────────────┤
Track V3 │ ┌─── bullet 1 ──────────────────────┤
          │ ▲                                    ▲
          │ startTime(bullet 1)          endTime(bullet 3)

- Bullets consecutivos forman un grupo
- Todos terminan al mismo tiempo (endTime del último)
- Cada bullet va en un track diferente (apilados)
- Posición Y: 0px, -70px, -140px (bottom-to-top)
```

## Filtro por Tracks

```
Antes de analizar:
┌─────────────────────────────────────┐
│ Solo donde hay clips en:            │
│ ☑ V1  ☐ V2  ☑ V3  ☐ V4-V8        │
└─────────────────────────────────────┘
         │
         ▼
Filtra el transcript ANTES de mandarlo a la IA:
- Solo incluye segmentos donde hay clips habilitados en V1 o V3
- Reduce tokens → mejora relevancia
```

## Batch Mode

```
Click "Batch Todas"
         │
         ▼
Escanear secuencias abiertas con transcript en cache
         │
         ├─ Mostrar lista con checkboxes
         │
         ▼
"Analizar Todas" (paralelo, concurrencia configurable)
         │
         ├─ Por cada secuencia: analizar con IA
         │
         ▼
Navegar entre secuencias ← →
         │
         ├─ Editar resultados por secuencia
         │
         ▼
"Crear Todas" (secuencial — requiere activar cada secuencia)
         │
         └─ Por cada secuencia: insertSupertextMOGRTs()
```

## Archivos

| Archivo | Rol |
|---------|-----|
| `ui-supertexts.js` | UI + batch + filtro por tracks |
| `batch-seq-runner.js` | Helpers de "modo batch" (compartidos con Edit Suggestions) |
| `host/supertexts.jsx` | insertSupertextMOGRTs, replaceMOGRTClip |
| `ai-analyzer.js` | analyzeSupertexts() — LLM call |
| `css/supertexts.css` | Estilos |

Ver también la referencia técnica de los MOGRT:
[Smart Supertext MOGRTs](./smart-supertext-mogrt.md).
