# Editor-Pro — Guía de Instalación

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

### "Error al analizar / transcribir"
- Verifica tu API key en ⚙️
- Verifica que tienes crédito en [OpenRouter](https://openrouter.ai/settings/credits)
- Verifica tu conexión a internet

### "Premiere dice que la extensión no es compatible"
- Necesitas Adobe Premiere Pro versión 23.0 (2023) o superior

---

## 🆘 ¿Necesitas ayuda?

Contacta a Daniel Gutiérrez (@DanielGutierrezBo en Telegram).
