# Editor-Pro — Guía Completa de Instalación

> Esta guía asume que NO tienes experiencia con terminal/línea de comandos.
> Sigue cada paso exactamente como está escrito. Si algo falla, ve a la sección de **Problemas comunes** al final.

---

## 📋 Antes de empezar

Necesitas instalar 2 programas y crear 1 cuenta:

| Qué | Para qué | Costo |
|-----|----------|-------|
| Node.js | Motor que ejecuta el servidor de motion graphics | Gratis |
| Git | Descarga y actualiza la herramienta | Gratis |
| Cuenta OpenRouter | API de inteligencia artificial que genera los motions | ~$5-10/mes |

También necesitas:
- **Adobe Premiere Pro** versión 2023 o más reciente (v23.0+)
- **Conexión a internet** (para la API de IA)

---

## 🖥️ Paso 1: Instalar Node.js

### En Mac:
1. Abre Safari y ve a **https://nodejs.org/**
2. Descarga la versión **LTS** (el botón verde grande de la izquierda)
3. Abre el archivo `.pkg` descargado
4. Sigue el instalador: Next → Next → Install → Cierra
5. **Verificar**: Abre la app **Terminal** (búscala en Spotlight con Cmd+Espacio, escribe "Terminal") y escribe:
```bash
node --version
```
Debe mostrar algo como `v22.x.x`. Si dice "command not found", reinicia la Terminal.

### En Windows:
1. Abre Chrome/Edge y ve a **https://nodejs.org/**
2. Descarga la versión **LTS** (botón verde grande de la izquierda)
3. Abre el archivo `.msi` descargado
4. Sigue el instalador: Next → acepta licencia → Next → Next → Install
5. **IMPORTANTE**: En la pantalla "Tools for Native Modules", marca la casilla ☑️ si aparece
6. **Verificar**: Abre **PowerShell** (click derecho en el botón de Windows → "Terminal" o "Windows PowerShell") y escribe:
```bash
node --version
```
Debe mostrar algo como `v22.x.x`.

---

## 🔧 Paso 2: Instalar Git

### En Mac:
Git usualmente ya viene instalado. Verifica abriendo **Terminal** y escribiendo:
```bash
git --version
```
- Si muestra una versión → ya lo tienes, salta al paso 3
- Si te pide instalar "Command Line Developer Tools" → acepta y espera a que instale (~5 min)

### En Windows:
1. Ve a **https://git-scm.com/download/win**
2. Descarga el instalador (se descarga automáticamente)
3. Abre el `.exe` y sigue el instalador
4. **IMPORTANTE**: En todas las pantallas dale **Next** con las opciones por defecto. NO cambies nada.
5. **Verificar**: Cierra y vuelve a abrir PowerShell, escribe:
```bash
git --version
```
Debe mostrar algo como `git version 2.x.x`.

---

## 🔑 Paso 3: Crear cuenta en OpenRouter

1. Abre **https://openrouter.ai/** en tu navegador
2. Click en **Sign Up** (esquina superior derecha)
3. Puedes registrarte con tu cuenta de Google o con email
4. Una vez dentro, ve a **https://openrouter.ai/settings/keys**
5. Click en **Create Key**
6. Ponle un nombre (ej: "Editor-Pro") y click en **Create**
7. **COPIA LA KEY** — empieza con `sk-or-v1-...` 
   - ⚠️ Solo se muestra una vez. Si la pierdes, crea otra nueva.
   - Guárdala en un lugar seguro (notas, documento privado)
8. Ve a **https://openrouter.ai/settings/credits** y agrega crédito:
   - $5 es suficiente para empezar (~50-100 clips de motion graphics)
   - Puedes agregar más después

---

## 📥 Paso 4: Descargar Editor-Pro

### En Mac:
Abre **Terminal** y escribe estos comandos uno por uno (copia y pega cada línea):
```bash
cd ~/Movies
```
```bash
git clone https://github.com/DanielGutierrezB/Editor-Pro.git
```
Espera a que termine de descargar (~30 segundos).

> ⚠️ **IMPORTANTE**: NO clonar en Desktop ni Documents si usas iCloud. iCloud sincroniza esas carpetas y corrompe `node_modules`. Usa `~/Movies/` que no se sincroniza.

### En Windows:
Abre **PowerShell** y escribe estos comandos uno por uno:
```bash
cd ~\Desktop
```
```bash
git clone https://github.com/DanielGutierrezB/Editor-Pro.git
```
Espera a que termine de descargar (~30 segundos).

> 💡 Si te pide usuario/contraseña de GitHub, usa tu username de GitHub y un **Personal Access Token** como contraseña (no tu contraseña de GitHub). Pídele a Daniel que te ayude con esto.

---

## 📦 Paso 5: Instalar dependencias

### En Mac:
```bash
cd ~/Movies/Editor-Pro/motion-server
```
```bash
npm install
```
Espera a que termine (~30 segundos). Luego:
```bash
cd ~/Movies/Editor-Pro/motion-render
```
```bash
npm install
```
⏱️ Este tarda más (~2-5 minutos). Espera a que vuelva a aparecer el cursor de la terminal.

### En Windows:
```bash
cd ~\Movies\Editor-Pro\motion-server
```
```bash
npm install
```
Espera. Luego:
```bash
cd ~\Movies\Editor-Pro\motion-render
```
```bash
npm install
```
⏱️ Este tarda más (~2-5 minutos).

> ⚠️ Si ves errores en rojo mencionando "python" o "node-gyp", ignóralos si al final dice "added X packages". Solo preocúpate si dice "npm ERR!" al final.

---

## 🔓 Paso 6: Habilitar extensiones en Premiere Pro

Premiere Pro bloquea extensiones externas por seguridad. Necesitamos decirle que las permita.

### En Mac:
Abre **Terminal** y copia/pega TODAS estas líneas (una por una):
```bash
defaults write com.adobe.CSXS.9 PlayerDebugMode 1
```
```bash
defaults write com.adobe.CSXS.10 PlayerDebugMode 1
```
```bash
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
```
```bash
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
```

### En Windows:
1. Presiona **Win + R**, escribe `regedit` y presiona Enter
2. Navega a: `HKEY_CURRENT_USER\SOFTWARE\Adobe\CSXS.11`
   - Si no existe la carpeta `CSXS.11`, click derecho en `Adobe` → New → Key → nombra `CSXS.11`
3. Click derecho en el panel derecho → New → String Value
4. Nombre: `PlayerDebugMode`
5. Doble click en él → Value data: `1` → OK
6. Repite los pasos 2-5 para `CSXS.9`, `CSXS.10`, y `CSXS.12`

**⚠️ IMPORTANTE: Cierra Premiere Pro completamente si estaba abierto.**

---

## 🔗 Paso 7: Conectar Editor-Pro con Premiere Pro

Premiere Pro busca extensiones en una carpeta específica. Creamos un "acceso directo" (symlink) para que la encuentre.

### En Mac:
Copia y pega este comando COMPLETO en Terminal (es una sola línea):
```bash
mkdir -p ~/Library/Application\ Support/Adobe/CEP/extensions
```
```bash
ln -s ~/Movies/Editor-Pro ~/Library/Application\ Support/Adobe/CEP/extensions/com.codigo.editorpro
```

Para verificar que funcionó:
```bash
ls ~/Library/Application\ Support/Adobe/CEP/extensions/
```
Debe mostrar `com.codigo.editorpro`.

### En Windows:
Abre **PowerShell como Administrador** (click derecho en PowerShell → "Ejecutar como administrador"):
```bash
New-Item -ItemType Directory -Force -Path "$env:APPDATA\Adobe\CEP\extensions"
```
```bash
New-Item -ItemType Junction -Path "$env:APPDATA\Adobe\CEP\extensions\com.codigo.editorpro" -Target "$HOME\Desktop\Editor-Pro"
```

Para verificar:
```bash
ls "$env:APPDATA\Adobe\CEP\extensions"
```
Debe mostrar `com.codigo.editorpro`.

---

## 🎬 Paso 8: Abrir Editor-Pro en Premiere

1. **Abre Adobe Premiere Pro** (o reinícialo si estaba abierto)
2. Abre cualquier proyecto (o crea uno nuevo)
3. Ve al menú: **Ventana → Extensiones → Editor-Pro**
4. El panel aparece a un costado

### ¿No aparece "Editor-Pro" en Extensiones?
- Verifica que hiciste el paso 6 (PlayerDebugMode)
- Verifica que hiciste el paso 7 (symlink)
- Cierra Premiere completamente y ábrelo de nuevo
- En Mac, verifica con: `ls ~/Library/Application\ Support/Adobe/CEP/extensions/com.codigo.editorpro/client/index.html` — debe mostrar el archivo

---

## ⚙️ Paso 9: Configurar tu API Key

1. En el panel de Editor-Pro (dentro de Premiere), busca el ícono de ⚙️ engranaje (esquina superior derecha)
2. Click en ⚙️ para abrir la configuración
3. En **Proveedor IA**: selecciona **OpenRouter (Multi-modelo)**
4. En **API Key**: pega tu key de OpenRouter (la que copiaste en el paso 3)
   - Empieza con `sk-or-v1-...`
5. En **Modelo**: selecciona uno:
   - **Claude Sonnet 4** — recomendado (buena calidad, precio moderado)
   - **Claude Opus 4** — mejor calidad pero más caro
6. Cierra la configuración haciendo click fuera del panel

---

## ✅ Paso 10: Verificar que todo funciona

1. Asegúrate de tener una **secuencia activa** en Premiere (con al menos un clip de video)
2. En el panel Editor-Pro, deberías ver el nombre de tu secuencia arriba
3. Abre la sección **Motion-Pro** (click en el desplegable)
4. Carga un archivo de transcript (JSON) con el botón "Cargar JSON"
5. Click en **Analizar para Motions**
6. Si aparecen propuestas de motion graphics → ¡todo funciona! 🎉

---

## 📱 Uso diario

### Flujo de trabajo:
1. Abre tu proyecto en Premiere
2. Abre el panel Editor-Pro
3. Carga el transcript de la clase
4. Click "Analizar para Motions" → espera ~90 segundos
5. Selecciona las propuestas que quieras generar
6. Click "Generar Seleccionados" → espera ~5-10 minutos
7. Los clips se colocan automáticamente en la línea de tiempo

### Actualizar la herramienta:
Cuando Daniel avise que hay una actualización:
```bash
cd ~/Movies/Editor-Pro
git pull origin main
```
Luego recarga el panel en Premiere (botón 🔄 en la esquina superior derecha del panel).

---

## 💰 Costos estimados (OpenRouter)

Cada clip de motion graphics cuesta entre $0.02 y $0.20 dependiendo del modelo:

| Modelo | Costo por clip | Video de 2 min (~15 clips) | Calidad |
|--------|---------------|---------------------------|---------|
| Claude Sonnet 4 | ~$0.03 | ~$0.45 | Buena |
| Claude Opus 4 | ~$0.15 | ~$2.25 | Excelente |
| Gemini 2.5 Pro | ~$0.02 | ~$0.30 | Variable |

💡 **Recomendación**: Empieza con Sonnet 4 para pruebas rápidas, usa Opus 4 para entregas finales.

---

## 🔧 Problemas comunes

### "No aparece Editor-Pro en el menú Extensiones"
- ¿Hiciste el PlayerDebugMode? (Paso 6)
- ¿Creaste el symlink? (Paso 7)
- ¿Reiniciaste Premiere después del paso 6?
- Verifica que la carpeta existe:
  - Mac: `ls ~/Library/Application\ Support/Adobe/CEP/extensions/com.codigo.editorpro/`
  - Windows: `ls "$env:APPDATA\Adobe\CEP\extensions\com.codigo.editorpro"`

### "El panel aparece en blanco"
- Haz click en el botón 🔄 (recargar) en la esquina superior derecha del panel
- Si sigue en blanco, cierra y abre Premiere de nuevo

### "Error al analizar / generar motions"
- Verifica tu API key en ⚙️
- Verifica que tienes crédito en OpenRouter (https://openrouter.ai/settings/credits)
- Verifica tu conexión a internet

### "npm install falla"
- ¿Tienes Node.js instalado? Verifica con `node --version`
- Intenta borrar la carpeta `node_modules` y volver a instalar:
  ```bash
  rm -rf node_modules
  npm install
  ```

### "git clone pide contraseña"
- Necesitas un **Personal Access Token** de GitHub
- Ve a GitHub → Settings → Developer Settings → Personal Access Tokens → Generate new token
- Usa el token como contraseña cuando git te la pida

### "Premiere dice que la extensión no es compatible"
- Verifica tu versión de Premiere: Help → About Adobe Premiere Pro
- Necesitas versión 23.0 (2023) o superior

### "Los motions no se generan / se quedan en 0%"
- Abre la terminal y navega a `~/Movies/Editor-Pro/motion-server`
- Ejecuta `npm install` de nuevo
- Recarga el panel en Premiere

### "Los clips tienen frames corruptos"
- Esto puede pasar ocasionalmente
- Regenera el clip específico desde el panel de control de Motion-Pro

---

## 📂 Estructura del proyecto (referencia)

```
Editor-Pro/
├── client/          → Interfaz del panel (lo que ves en Premiere)
├── host/            → Scripts que hablan con Premiere Pro
├── motion-server/   → Servidor que genera el código de los motions
├── motion-render/   → Remotion: convierte el código en video MP4
├── Prompts/         → Las instrucciones de IA para generar motions
├── CSXS/            → Configuración de la extensión de Premiere
├── dist/            → Versión empaquetada (ZXP)
└── INSTALL.md       → Este documento
```

---

## 🆘 ¿Necesitas ayuda?

Contacta a Daniel Gutiérrez (@DanielGutierrezBo en Telegram).
