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
│   └── prompt.md          ← Instrucciones para generar supertextos
├── EditSuggestions/
│   ├── system.md          ← Personalidad para sugerencias de edición
│   └── prompt.md          ← Instrucciones de análisis de edición
└── RecordingNotes/
    ├── system-takeAnalysis.md      ← Análisis de tomas
    └── system-supplementReview.md  ← Revisión de contenido faltante
```

## Cómo funcionan

1. Al iniciar el panel, `ai-analyzer.js` carga los `system.md` (y `prompt.md`) de cada carpeta
2. Los prompts de usuario (prompt builders) usan los system/prompt messages de aquí
3. Si un archivo no existe, se usa el fallback hardcodeado en el código

## Cómo editar

- Edita el .md directamente y recarga el panel de Premiere
- Los cambios son inmediatos — no necesitas reconstruir el ZXP

## Tips

- Los system messages definen la PERSONALIDAD de la IA (quién es, cómo responde)
- Los prompts de usuario definen las INSTRUCCIONES (qué hacer con los datos)
- Si una herramienta da malos resultados, empieza editando su system.md
- Mantén "Responde ÚNICAMENTE con JSON válido" al final de cada system message
