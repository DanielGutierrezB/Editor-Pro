# ✂️ Sugerencias de Edición

## Qué hace
Analiza la transcripción y detecta highlights, sugiere cortes, e identifica errores (contenido repetido, tangentes, errores verbales). Cada categoría tiene marcadores independientes.

## Flujo

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

## Batch Mode

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
| `ui-edit-suggestions.js` | UI de Sugerencias de Edición |
| `ai-analyzer.js` | analyzeEditSuggestions() |
