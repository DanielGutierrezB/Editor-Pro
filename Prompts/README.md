# Editor-Pro — Prompts

Todos los prompts que usan las herramientas de Editor-Pro. Edita cualquier archivo .md y los cambios se reflejan al recargar el panel.

## Estructura

```
Prompts/
├── SpellCheck/
│   ├── system.md          ← Personalidad de la IA para corrección
│   └── prompt.md          ← Instrucciones de análisis ortográfico
├── SmartSupertexts/
│   ├── system.md          ← Personalidad para identificar supertextos
│   └── prompt.md          ← Instrucciones de generación de supertextos
├── EditSuggestions/
│   ├── system.md          ← Personalidad para sugerencias de edición
│   └── prompt.md          ← Instrucciones de análisis de edición
├── ReelProposal/
│   ├── system.md          ← Personalidad para propuestas de reels
│   └── prompt.md          ← Instrucciones de análisis de reels
├── RecordingNotes/
│   ├── system-takeAnalysis.md      ← Análisis de tomas
│   └── system-supplementReview.md  ← Revisión de contenido faltante
├── MotionPro/
│   ├── system.md            ← Reglas maestras de generación (componentes, paleta, tipos)
│   ├── available-packages.md← Paquetes/imports permitidos en el TSX
│   ├── DESIGN.md            ← Design system (colores, spacing, layout 1080p)
│   ├── quality-rules.md     ← Reglas de calidad de la animación
│   ├── analysis-system.md   ← Personalidad para análisis de momentos
│   └── analysis-prompt.md   ← Instrucciones del análisis de momentos
└── BRoll/
    ├── analysis.md          ← System prompt para detección de momentos B-roll
    └── DESIGN-BROLL.md      ← Notas de diseño de B-Roll
```

## Cómo funcionan

1. Al iniciar el panel, `ai-analyzer.js` (cliente) carga los `system.md` y
   `prompt.md` de SpellCheck, SmartSupertexts, EditSuggestions, ReelProposal,
   RecordingNotes y `MotionPro/analysis-*.md`
2. Al generar motions, `motion-server/lib/prompts/system-prompt.js` carga los docs
   grandes de `MotionPro/` (`system.md`, `available-packages.md`, `DESIGN.md`,
   `quality-rules.md`)
3. Al analizar B-roll, `motion-server/lib/broll-prompts.js` carga `BRoll/analysis.md`
4. Los prompts de usuario (prompt builders) están en el código JS pero usan los
   system messages de aquí
5. Si un archivo no existe, se usa el fallback hardcodeado en el código

## Cómo editar

- Edita el .md directamente y recarga el panel de Premiere
- Para Motion-Pro: edita y dale "Guardar Prompts" en el panel, o reinicia el servidor
- Los cambios son inmediatos — no necesitas reconstruir el ZXP

## Tips

- Los system messages definen la PERSONALIDAD de la IA (quién es, cómo responde)
- Los prompts de usuario definen las INSTRUCCIONES (qué hacer con los datos)
- Si una herramienta da malos resultados, empieza editando su system.md
- Mantén "Responde ÚNICAMENTE con JSON válido" al final de cada system message
