# Editor-Pro

Plugin **CEP para Adobe Premiere Pro** con herramientas de edición asistida por IA
y transcripción para producción de clases educativas. Vanilla JS, sin frameworks ni
bundler.

## ¿Qué incluye?

El panel agrupa 9 herramientas colapsables:

| Herramienta | Qué hace |
|-------------|----------|
| **Cortes Automáticos** | Lee marcadores IN/OUT → preview → corta (con backup, batch y vistas) |
| **Transcripción** | Cargar/exportar audio, transcribir (ElevenLabs/Whisper), importar SRT/JSON/captions |
| **SpellCheck IA** | Revisión ortográfica y de estilo en clips de texto (Essential Graphics) |
| **Smart Supertexts** | Genera supertextos como gráficos MOGRT en la timeline |
| **Sugerencias de Edición** | Analiza el transcript → highlights, cortes y errores |
| **Propuesta de Reel** | Propone reels verticales (9:16) de alta retención |
| **Notas de Grabación** | Pipeline de 7 pasos: audio → transcripción → tomas → marcadores → corte → vistas |
| **Motion-Pro** | Motion graphics automáticos con Remotion (transcript → IA → MP4 en timeline) |
| **B-Roll** | Imágenes y video generados por IA (image-to-video) colocados en la timeline |

Proveedores de IA de texto soportados: **Ollama** (local), **Gemini**, **Claude**,
**GPT** y **OpenRouter**. Motion-Pro y B-Roll usan además un servidor local
(`motion-server/`, puerto 3847) y el proyecto Remotion de `motion-render/`.

> 📖 Documentación técnica completa (arquitectura y por herramienta) en
> [`docs/`](./docs/README.md). Guía de prompts editables en
> [`Prompts/`](./Prompts/README.md).

---

## Instalación

## 1. Descargar el ZXP

Descarga la última versión desde GitHub Releases:

👉 **[Descargar EditorPro.zxp](https://github.com/DanielGutierrezB/Editor-Pro/releases/latest)**

Click en **EditorPro.zxp** en la sección "Assets" para descargar el archivo.

## 2. Instalar ZXP Installer

Necesitas una herramienta para instalar archivos `.zxp`. Descarga **ZXP Installer**:

👉 **[Descargar ZXP Installer](https://aescripts.com/learn/zxp-installer/)**

> También puedes usar [Anastasiy's Extension Manager](https://install.anastasiy.com/) como alternativa.

## 3. Instalar la extensión

1. Abre **ZXP Installer**
2. Arrastra el archivo **EditorPro.zxp** sobre la ventana de ZXP Installer
3. Espera a que diga "Installation Complete"

## 4. Habilitar extensiones en Premiere Pro

Premiere Pro bloquea extensiones externas por defecto. Hay que habilitarlas:

**En Mac** — Abre Terminal y ejecuta:
```bash
defaults write com.adobe.CSXS.9 PlayerDebugMode 1
defaults write com.adobe.CSXS.10 PlayerDebugMode 1
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
```

**En Windows** — Abre `regedit` y en cada una de estas rutas:
- `HKEY_CURRENT_USER\SOFTWARE\Adobe\CSXS.9`
- `HKEY_CURRENT_USER\SOFTWARE\Adobe\CSXS.10`
- `HKEY_CURRENT_USER\SOFTWARE\Adobe\CSXS.11`
- `HKEY_CURRENT_USER\SOFTWARE\Adobe\CSXS.12`

Crea un **String Value** llamado `PlayerDebugMode` con valor `1`.

## 5. Abrir en Premiere Pro

1. **Cierra Premiere Pro** si estaba abierto
2. Ábrelo de nuevo
3. Ve a **Ventana → Extensiones → Editor-Pro**
4. ¡Listo! 🎉

## ⚙️ Configurar tu API Key

1. En el panel de Editor-Pro, busca el ícono de ⚙️ engranaje (esquina superior derecha)
2. Click en ⚙️ para abrir la configuración
3. En **Proveedor IA**: selecciona **OpenRouter (Multi-modelo)**
4. En **API Key**: pega tu key de OpenRouter (`sk-or-v1-...`)
5. En **Modelo**: selecciona uno:
   - **Claude Sonnet 4** — recomendado (buena calidad, precio moderado)
   - **Claude Opus 4** — mejor calidad pero más caro
6. Cierra la configuración

> 💡 Necesitas una cuenta en [OpenRouter](https://openrouter.ai/) con crédito. $5 es suficiente para empezar.

---

## 🔄 Actualizar

Cuando haya una nueva versión:
1. Descarga el nuevo `.zxp` desde [Releases](https://github.com/DanielGutierrezB/Editor-Pro/releases/latest)
2. Instálalo con ZXP Installer (sobrescribe la versión anterior automáticamente)
3. Reinicia Premiere Pro

---

## 🔧 Problemas comunes

### "No aparece Editor-Pro en el menú Extensiones"
- ¿Hiciste el paso 4 (PlayerDebugMode)?
- ¿Reiniciaste Premiere después?
- Verifica que la extensión se instaló:
  - Mac: `ls ~/Library/Application\ Support/Adobe/CEP/extensions/com.codigo.editorpro/`
  - Windows: `ls "$env:APPDATA\Adobe\CEP\extensions\com.codigo.editorpro"`

### "El panel aparece en blanco"
- Click en el botón 🔄 (recargar) en la esquina superior derecha del panel
- Si sigue en blanco, cierra y abre Premiere de nuevo

### "Error al analizar / generar motions"
- Verifica tu API key en ⚙️
- Verifica que tienes crédito en [OpenRouter](https://openrouter.ai/settings/credits)
- Verifica tu conexión a internet

### "Premiere dice que la extensión no es compatible"
- Necesitas Adobe Premiere Pro versión 23.0 (2023) o superior

---

## 🆘 ¿Necesitas ayuda?

Contacta a Daniel Gutiérrez (@DanielGutierrezBo en Telegram).
