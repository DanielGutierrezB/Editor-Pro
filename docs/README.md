# 📖 Editor-Pro — Documentación

## Índice

| Doc | Descripción |
|-----|-------------|
| [Arquitectura](./architecture.md) | Capas del sistema, comunicación, estado |
| [Cortes Automáticos](./tool-cutter.md) | Lectura de marcadores, cortes, batch, vistas |
| [Transcripción](./tool-transcript.md) | Parseo multi-formato, cache, auto-load |
| [SpellCheck IA](./tool-spellcheck.md) | Revisión ortográfica en clips de texto |
| [Smart Supertexts](./tool-supertexts.md) | Generación de MOGRT desde transcript |
| [Sugerencias de Edición](./tool-edit-suggestions.md) | Análisis de edición + Reel Proposals |
| [Notas de Grabación](./tool-recording.md) | Pipeline de 7 pasos para grabaciones |
| [Motion-Pro](./tool-motion-pro.md) | Motion graphics automáticos con Remotion |
| [B-Roll](./tool-broll.md) | Imágenes y video generados por IA (image-to-video) |
| [Smart Supertext MOGRTs](./smart-supertext-mogrt.md) | Referencia técnica de los MOGRT de supertextos |

## Quick Start

```bash
# Desarrollo (symlink al directorio de extensiones CEP + habilita debug mode)
./install.sh

# Build ZXP firmado para distribución
./build-zxp.sh
```

Para instalar el plugin como usuario final (descargar el ZXP, instalarlo con ZXP
Installer y habilitar extensiones en Premiere), ver el [README raíz](../README.md).

## Motion Server + B-Roll

Motion-Pro y B-Roll dependen de un servidor Node.js local (Express, puerto 3847)
que corre bajo `motion-server/` y renderiza motion graphics con el proyecto Remotion
de `motion-render/`. El panel lo arranca/detiene automáticamente desde la UI de
Motion-Pro. Ver [Arquitectura](./architecture.md), [Motion-Pro](./tool-motion-pro.md)
y [B-Roll](./tool-broll.md).

## Versión actual: v1.14.6
