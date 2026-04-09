# Editor-Pro — Prompts

Todos los prompts que usan las herramientas de Editor-Pro. Edita cualquier archivo .md y los cambios se reflejan al recargar el panel.

## Estructura

```
Prompts/
├── SpellCheck/
│   ├── system.md          ← Personalidad de la IA para corrección
│   └── prompt.md          ← Instrucciones de análisis ortográfico
├── SmartSupertexts/
│   └── system.md          ← Personalidad para identificar supertextos
├── EditSuggestions/
│   └── system.md          ← Personalidad para sugerencias de edición
├── ReelProposal/
│   └── system.md          ← Personalidad para propuestas de reels
├── RecordingNotes/
│   ├── system-takeAnalysis.md      ← Análisis de tomas
│   └── system-supplementReview.md  ← Revisión de contenido faltante
└── MotionPro/
    ├── system.md              ← Reglas maestras de generación (componentes, paleta, tipos)
    ├── style-guide.md         ← Tamaños 1080p, spacing, charts
    ├── design-fundamentals.md ← 12 principios Disney, Gestalt, color
    └── analysis-system.md     ← Personalidad para análisis de momentos
```

## Cómo funcionan

1. Al iniciar el panel, `ai-analyzer.js` carga todos los `system.md` de cada carpeta
2. Al generar motions, `motion-server` carga los 3 docs grandes de `MotionPro/`
3. Los prompts de usuario (prompt builders) están en el código JS pero usan los system messages de aquí
4. Si un archivo no existe, se usa el fallback hardcodeado en el código

## Cómo editar

- Edita el .md directamente y recarga el panel de Premiere
- Para Motion-Pro: edita y dale "Guardar Prompts" en el panel, o reinicia el servidor
- Los cambios son inmediatos — no necesitas reconstruir el ZXP

## Tips

- Los system messages definen la PERSONALIDAD de la IA (quién es, cómo responde)
- Los prompts de usuario definen las INSTRUCCIONES (qué hacer con los datos)
- Si una herramienta da malos resultados, empieza editando su system.md
- Mantén "Responde ÚNICAMENTE con JSON válido" al final de cada system message
