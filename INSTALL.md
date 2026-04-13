# Editor-Pro — Guía de Instalación

## Requisitos Previos

### Software necesario
- **Adobe Premiere Pro** v23.0 o superior (2023+)
- **Node.js** v18 o superior — [descargar](https://nodejs.org/)
- **Git** — [descargar](https://git-scm.com/downloads)
- **Cuenta OpenRouter** — [crear cuenta](https://openrouter.ai/) (para API key)

### Verificar instalación
Abre una terminal y ejecuta:
```bash
node --version    # Debe mostrar v18 o superior
git --version     # Debe mostrar cualquier versión
npm --version     # Debe mostrar cualquier versión
```

---

## Paso 1: Clonar el repositorio

```bash
cd ~/Desktop
git clone https://github.com/DanielGutierrezB/Editor-Pro.git
```

Esto crea la carpeta `~/Desktop/Editor-Pro` con todo el código.

---

## Paso 2: Instalar dependencias

```bash
# Dependencias del servidor de motion graphics
cd ~/Desktop/Editor-Pro/motion-server
npm install

# Dependencias del renderizador Remotion
cd ~/Desktop/Editor-Pro/motion-render
npm install
```

⏱️ La instalación de `motion-render` puede tomar 2-5 minutos.

---

## Paso 3: Habilitar extensiones CEP en Premiere Pro

Premiere Pro bloquea extensiones no firmadas por defecto. Para habilitarlo:

### macOS:
```bash
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
```

### Windows:
Abre **regedit** y crea el valor:
```
HKEY_CURRENT_USER\SOFTWARE\Adobe\CSXS.11
Nombre: PlayerDebugMode
Tipo: String
Valor: 1
```

Repetir para `CSXS.12` si usas Premiere 2025+.

**Reinicia Premiere Pro** después de este cambio.

---

## Paso 4: Crear symlink de la extensión

Premiere Pro busca extensiones en una carpeta específica. Creamos un enlace simbólico:

### macOS:
```bash
ln -s ~/Desktop/Editor-Pro ~/Library/Application\ Support/Adobe/CEP/extensions/com.codigo.editorpro
```

### Windows:
```cmd
mklink /D "C:\Users\TU_USUARIO\AppData\Roaming\Adobe\CEP\extensions\com.codigo.editorpro" "C:\Users\TU_USUARIO\Desktop\Editor-Pro"
```

---

## Paso 5: Abrir en Premiere Pro

1. Abre **Adobe Premiere Pro**
2. Ve a **Ventana → Extensiones → Editor-Pro**
3. El panel debería aparecer en el lado derecho

Si no aparece, verifica:
- Que hiciste el paso 3 (PlayerDebugMode)
- Que reiniciaste Premiere Pro
- Que el symlink está correcto (paso 4)

---

## Paso 6: Configurar API Key

1. En el panel de Editor-Pro, haz click en el ícono de ⚙️ (configuración)
2. Selecciona **Proveedor**: OpenRouter
3. Pega tu **API Key** de OpenRouter (`sk-or-...`)
4. Selecciona **Modelo**: Claude Sonnet 4 (recomendado) o Claude Opus 4 (mejor calidad, más caro)
5. Cierra la configuración

### Obtener tu API Key de OpenRouter:
1. Ve a [openrouter.ai](https://openrouter.ai/)
2. Crea una cuenta
3. Ve a **Keys** → **Create Key**
4. Copia la key (`sk-or-v1-...`)
5. Agrega crédito ($5-10 para empezar)

---

## Paso 7: Verificar funcionamiento

1. Abre un proyecto en Premiere con una secuencia activa
2. En el panel Editor-Pro, la secuencia debería detectarse automáticamente
3. Prueba cargar un transcript (JSON) en la sección de Motion-Pro
4. Si el panel muestra el transcript, ¡todo funciona!

---

## Uso diario

### Actualizar la herramienta
Cuando haya actualizaciones:
```bash
cd ~/Desktop/Editor-Pro
git pull origin main
```
Luego recarga el panel en Premiere (botón 🔄 en la esquina superior derecha).

### Si algo falla
1. **Panel en blanco**: Recarga con el botón 🔄 o cierra/abre Premiere
2. **Servidor no arranca**: El panel lo levanta automáticamente al recargar
3. **Errores de render**: Verifica que `npm install` se hizo en `motion-render/`
4. **API no responde**: Verifica tu key en ⚙️ y que tienes crédito en OpenRouter

---

## Estructura del proyecto

```
Editor-Pro/
├── client/          → Interfaz del panel (HTML/CSS/JS)
├── host/            → Scripts de ExtendScript (Premiere API)
├── motion-server/   → Servidor Node.js para generación de motions
├── motion-render/   → Proyecto Remotion para renderizar videos
├── Prompts/         → Prompts de IA para análisis y generación
├── dist/            → ZXP empaquetado (alternativa de instalación)
└── CSXS/            → Manifiesto de la extensión CEP
```

---

## Costos estimados (OpenRouter)

| Modelo | Costo por clip (~1min video) | Calidad |
|--------|------------------------------|---------|
| Claude Sonnet 4 | ~$0.02-0.05 | Buena |
| Claude Opus 4 | ~$0.10-0.20 | Excelente |
| Gemini 2.5 Pro | ~$0.01-0.03 | Variable |

Un video de 2 minutos con 15 clips ≈ $0.30-3.00 dependiendo del modelo.

---

## Soporte

¿Problemas con la instalación? Contacta a Daniel (@DanielGutierrezBo).
