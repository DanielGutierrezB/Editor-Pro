# ✍️ SpellCheck IA

## Qué hace
Analiza los clips de texto (Essential Graphics / captions) en la secuencia activa. Detecta errores ortográficos, gramaticales y de estilo con IA.

## Flujo

```
Click "Analizar Textos de Secuencia"
         │
         ▼
evalScript("exportSequenceXML()")
         │
         ├─ Exporta FCP XML temporal de la secuencia
         │
         ▼
parseTextClipsFromXML(xmlPath)
         │
         ├─ Extrae clips con GraphicAndType (Essential Graphics)
         ├─ Para cada clip: texto, startTime, endTime, trackIndex
         │
         ▼
SpellCheckEngine.check(text)
         │
         ├─ Hunspell (typo-js) → errores ortográficos
         ├─ context-rules.js → confusiones español
         │   (haber/a ver, ahí/hay/ay, etc.)
         │
         ▼
AIAnalyzer.analyzeSpellcheck(clips)
         │
         ├─ LLM revisa contexto completo
         ├─ Detecta errores que Hunspell no puede:
         │   - Concordancia de género/número
         │   - Uso incorrecto de preposiciones
         │   - Errores de estilo
         │
         ▼
┌─────────────────────────────────┐
│      RESULTADOS EN UI           │
│                                  │
│  Clip: "Bienvenidos al curzo"   │
│  ├─ ❌ "curzo" → "curso"        │
│  ├─ Sugerencia IA: concordancia │
│  └─ [Corregir] [Ignorar]        │
│                                  │
│  Click en clip → navega al      │
│  punto en la timeline            │
└─────────────────────────────────┘
```

## Diccionario Personal

```
Agregar palabra → localStorage("edupro_dictionary")
         │
         ▼
SpellCheckEngine.addToDict(word)
         │
         └─ Palabra ya no se marca como error
```

## Archivos

| Archivo | Rol |
|---------|-----|
| `ui-spellcheck.js` | UI de resultados (429 líneas) |
| `spellcheck-engine.js` | Hunspell + análisis (781 líneas) |
| `context-rules.js` | Reglas de confusión español (467 líneas) |
| `host/spellcheck.jsx` | exportSequenceXML, getSequenceCaptions |
| `css/spellcheck.css` | Estilos (400 líneas) |
