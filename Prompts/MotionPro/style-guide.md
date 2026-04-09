# Motion-Pro — Style Guide & Best Practices

## ✅ Buenas Prácticas

### Layout
- **Safe area de 120px** en todos los lados (1680x840 usable de 1920x1080)
- **Un concepto por pantalla** — nunca competir elementos por atención
- **Centrar contenido** verticalmente y horizontalmente
- **Flexbox con gap** para distribuir elementos — nunca posición absoluta superpuesta
- **Máximo 3 elementos** horizontales por pantalla

### Animación
- **Spring con damping 13-15** para entradas naturales (ni muy bouncey ni rígido)
- **Fade transitions** entre secciones (fadeIn=12, fadeOut=12 frames)
- **Stagger de 12-15 frames** entre elementos que entran secuencialmente
- **La palabra define el momento visual** — animar cuando el narrador dice, no antes
- **Hard cuts** entre secciones — no solapar contenido de dos secciones

### Tipografía (IBM Plex Sans + Mono)
- **Regla de dos saltos** para contraste de peso:
  - Light (300) ↔ SemiBold (600)
  - Regular (400) ↔ Bold (700)
- **IBM Plex Mono** para datos, código, valores técnicos
- **IBM Plex Sans** para todo lo demás
- **Máximo 2 tamaños de fuente** por pantalla (título + body)

### Color
- **Fondo sólido oscuro** (#060a14) — nunca transparencia que dificulte lectura
- **Cards con fondo sólido** (#0c1222) — opacas, legibles
- **Un color accent por concepto** — no mezclar todos los colores en una pantalla
- **Bordes sutiles** (color + 33 opacity) — no gruesos ni brillantes

### Cards/Elementos
- **Líneas como placeholder** de texto largo (3-4px height, degradando width)
- **Cards compactas** — reducir texto, priorizar lo visual
- **Máximo 280-340px** de ancho por card
- **Gap mínimo 30px** entre cards

## ❌ Malas Prácticas

### Layout
- ❌ Elementos que salen de pantalla
- ❌ Posición absoluta sin safe area
- ❌ Muchos elementos compitiendo por atención
- ❌ Solapar secciones (usar hard cuts)

### Animación
- ❌ Transparencias que hacen ilegible el texto debajo
- ❌ Emojis como estética principal (SVG geométrico es mejor)
- ❌ Animaciones que entran sobre las anteriores sin limpiar
- ❌ Pantalla vacía al final (última animación debe cubrir todo el audio)

### Tipografía
- ❌ Muchos tamaños de fuente en una pantalla
- ❌ Texto largo en motion graphics (usar líneas placeholder)
- ❌ Pesos similares sin contraste (400 vs 500 no se distingue)

### Color
- ❌ Fondos semitransparentes sobre otros elementos
- ❌ Todos los colores accent a la vez
- ❌ Texto claro sobre fondo claro

## Estructura de Componentes

```tsx
// Safe area wrapper - SIEMPRE usar
<SafeArea style={{flexDirection:'row', gap:30}}>
  <E d={0} from="left">  // Elemento 1
  <E d={15} from="pop">  // Elemento 2  
  <E d={30} from="right"> // Elemento 3
</SafeArea>

// Fade wrapper para cada sección
<Fade dur={180} fadeIn={12} fadeOut={12}>
  <SafeArea>...</SafeArea>
</Fade>

// Última sección: fadeOut=1 (casi sin fade, se queda visible)
<Fade dur={270} fadeIn={12} fadeOut={1}>
```

## Timing (30fps)
- Sección corta: 75-105 frames (2.5-3.5s)
- Sección media: 150-180 frames (5-6s)
- Sección larga: 210-270 frames (7-9s)
- Fade transition: 12 frames (0.4s)
- Stagger entre elementos: 12-15 frames
- Spring config: {damping:14, mass:0.4}

## Por Tipo de Animación

### Bar Charts
- **Ancho máximo por barra:** 60-90px
- **Gap entre barras:** 20px
- **Spring stagger:** 8-10 frames entre cada barra
- **Mostrar valor encima** de cada barra (aparece después del spring)
- **Label debajo** de cada barra (fontSize 10-11)
- **Título arriba:** fontSize 15-16, fontWeight 600
- **Eje Y implícito** por los valores sobre las barras
- **borderRadius en barras:** 4-5px

### Line Charts
- **Ancho máximo:** 520px (dejar espacio para labels Y)
- **Agregar siempre** etiqueta de eje X y eje Y
- **Eje Y:** rotado -90°, a la izquierda del chart
- **Eje X:** centrado debajo de los labels
- **Draw animation:** 120-150 frames (4-5s)
- **Puntos:** r=3.5, aparecen progresivamente
- **Grid lines:** dashed, opacity 0.2
- **Area fill:** color con 06 opacity máximo
- **marginLeft:40** para dar espacio al eje Y
- **Valores de referencia** en eje Y (0, 250, 500 etc.)

### Donut Charts
- **Tamaño:** 180-200px
- **strokeWidth:** 20-22px
- **Valor total** centrado dentro
- **Legend** horizontal debajo con dots de color
- **Spring con damping 18** para draw suave

### Step/Progress Animations
- **Un paso por pantalla** — centrado con su ícono grande
- **Progress dots** a un lado mostrando todos los pasos
- **Activo:** borde + boxShadow, fontWeight 700
- **Completado:** dot relleno, color dim
- **Pendiente:** dot vacío, color muy dim

### Intro/Title Screens
- **Ícono SVG** arriba (60-100px)
- **Título** fontSize 32, fontWeight 700
- **Subtítulo** fontSize 14, fontWeight 400, color dim
- **Separador** línea de 50px, height 2px, color accent

## Safe Zones (1080p)
- **All sides:** 80px
- **Total usable:** 1760×920 de 1920×1080

## 1080p Native Sizes
- **Display titles:** 96-200px
- **Section titles:** 56-64px
- **Chart titles:** 30-42px
- **Body text:** 22-26px
- **Labels:** 20-24px
- **SVG icons:** 100-140px (inside circles of 180-220px)
- **Cards:** 500-620px ancho
- **Form width:** 540-600px
- **Charts:** 70-85% del ancho usable (1200-1500px)
- **Bar width:** 100-140px, height: 450-550px
- **Line chart dots:** r=7-8
- **Input heights:** 58-62px
- **Button padding:** 16-18px vertical
- **Gap between cards:** 50-60px
- **Gap between icons:** 140-160px

## Íconos y Elementos Visuales

### Regla: Formas y líneas primero, emojis como acento

**Preferir siempre:**
- SVG geométrico con strokes (líneas, formas, paths)
- strokeWidth: 2-3px a 1080p
- strokeLinecap: "round"
- ViewBox proporcional al tamaño de render
- Color del stroke = accent de la sección

**Emojis permitidos cuando:**
- Son decorativos, no el elemento principal (ej: 🏦 dentro de una card)
- No hay un equivalente SVG simple (ej: 💰 para dinero)
- Se usan máximo 1-2 por sección
- Nunca como el ícono principal de un concepto

**Emojis NO permitidos cuando:**
- Son el único visual de la sección (diseñar SVG en su lugar)
- Se usan más de 3 en una misma pantalla
- Reemplazan lo que debería ser un gráfico o diagrama
- Son el centro de un círculo/badge grande (usar SVG geométrico)

### Ejemplo correcto:
```
[Círculo con SVG hook geométrico]  ← ícono principal
    "Phishing"                      ← label
```

### Ejemplo incorrecto:
```
[Círculo con 🎣 emoji gigante]     ← NO, usar SVG
    "Phishing"
```

### Referencia de SVGs creados:
- **Hook** (phishing): línea vertical + curva + punto
- **Lock** (seguridad): rectángulo + arco + punto
- **Key** (acceso): círculo + línea + dientes
- **CPU** (procesador): rectángulo + pines
- **Check** (éxito): path de checkmark

## Reglas de Charts (actualizado)

### Espaciado vertical en charts:
- **marginBottom del título: 60px mínimo** — evita solapamiento con valores de barras
- **Altura máxima de barras: 480px** — deja espacio para título + valores + labels

### Ancho máximo:
- **Line charts: 1300px** (no 1500) — respeta safe area con labels
- **Bar charts: ancho total = (barWidth + gap) × numBars** — verificar que quepa en 1800px

### Verificación obligatoria:
Siempre renderizar un still del chart y verificar que:
- Último label del eje X sea visible
- Valores encima de barras no se solapen con título
- Anotaciones debajo del chart no se corten

### Valores sobre puntos en Line Charts:
- El último punto NO debe estar al borde del chart — dejar **60px de margen derecho** después del último punto
- Reducir ancho del chart o dejar el último punto más adentro
- Los value labels sobre los puntos necesitan espacio (28px font ≈ 40px de ancho para "90")

### Line Chart — Regla anti-cutoff (ACTUALIZADA):
- Ancho máximo: **1100px** (no 1200 ni 1300)
- marginLeft: **100px** (espacio para eje Y + valores)
- marginRight implícito: el SVG debe quedar centrado en el safe area
- Value labels: mostrar ENCIMA del punto, NO a la derecha
- Primer punto: el value label no debe chocar con el eje Y
- Último punto: el value label no debe salir del frame

## REGLAS CRÍTICAS (actualizado 2026-03-23)

### Fondo:
- **SÓLIDO PLANO siempre** — NO grid, NO retícula, NO pattern
- backgroundColor: '#13161C' y NADA MÁS en el fondo
- ELIMINAR cualquier div con backgroundImage de grid/lines

### Colores de charts:
- USAR SOLO colores de la paleta definida en const C
- NO inventar colores como azul cielo (#60a5fa) o rosa (#ec4899)
- Bar charts: usar accent, blue, orange, purple, teal de la paleta

### Nombres genéricos:
- SIEMPRE "John" (no "Daniel", no nombres reales)
