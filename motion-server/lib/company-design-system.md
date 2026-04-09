# Company Design System — Motion Graphics

> Este archivo se carga automáticamente como parte del system prompt de generación.
> Edítalo para ajustar las reglas de diseño corporativas.

ESTAS SON LAS REGLAS DE DISEÑO CORPORATIVAS. Tienen prioridad sobre cualquier otra regla de estilo.

## Fuente Corporativa
- **Font: 'DM Sans', sans-serif** — SIEMPRE usar DM Sans, NUNCA IBM Plex Sans ni otra fuente
- Pesos disponibles: 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold)
- Para código/datos técnicos: 'DM Sans', monospace (no hay fuente mono separada)

## Paleta de Colores Corporativa

| Token | Hex | Uso |
|---|---|---|
| bg-primary | #1a1d23 | Fondo principal de la composición |
| bg-card | #2d323a | Fondo de cards/contenedores |
| bg-sidebar | #22262e | Fondo secundario |
| accent | #0ae98d | Color accent principal (verde corporativo) |
| accent-glow | rgba(10,233,141,0.08) | Glow sutil del accent |
| text | #ffffff | Texto principal |
| text-muted | rgba(255,255,255,0.55) | Texto secundario |
| border | rgba(255,255,255,0.08) | Bordes de cards y elementos |
| shadow-card | 0px 8px 24px 0px rgba(10,233,141,0.08) | Sombra de cards |

REGLAS DE COLOR:
- Fondo de composición: SIEMPRE #1a1d23 (NO #060a14)
- Cards: SIEMPRE #2d323a (NO #0c1222)
- Accent: SIEMPRE #0ae98d (NO #00d4ff)
- Texto: #ffffff (NO #e4eaf4)
- Bordes: rgba(255,255,255,0.08) siempre

## Card Style
- border-radius: 12px
- border: 1px solid rgba(255,255,255,0.08)
- box-shadow: 0px 8px 24px 0px rgba(10,233,141,0.08)
- padding: 24px

## Layout Grid (1920×1080)
- Grid: 8 columnas × 4 filas
- 7 posiciones X: 360, 480, 600, 960, 1320, 1440, 1560
- Centro exacto: [960, 540]

### Zonas verticales:
- **Títulos** (Y: 180, 270) — Nombres, logos, títulos de sección
- **Supertextos** (Y: 360, 540, 720) — Textos principales, bullets, contenido central
- **Disclaimers** (Y: 810, 900) — Textos legales, créditos, notas al pie

## Animaciones

### Parámetros por defecto:
- Duration: 15 frames (0.5s a 30fps)
- Amount (desplazamiento): 200px
- Delay entre elementos: 2 frames
- Easing principal: cubic-bezier(.16, 1, .3, 1) — Ease Out

### Tipos de animación:
- **Supertextos**: Movimiento de abajo hacia arriba, con o sin opacidad
- **Scale In/Out**: 5 frames, cubic-bezier(.16,1,.3,1) para in, cubic-bezier(.7,0,.84,0) para out
- **Stroker**: Líneas de highlight responsivas, 3 alineaciones (arriba, centro, abajo)
- **Trim/Reveal**: Revelación de paths, 20 frames por defecto
- **Character Stagger**: Cada carácter entra con delay de 2 frames

### Curvas de Easing disponibles:
| Tipo | CSS | Uso |
|---|---|---|
| Ease Out | cubic-bezier(.16, 1, .3, 1) | PRINCIPAL — entradas suaves |
| Linear | linear | Solo para progress bars |
| Ease In | cubic-bezier(.7, 0, .84, 0) | Salidas |
| Ease In Out | cubic-bezier(.4, 0, .2, 1) | Transiciones intermedias |
| Bounce Out | cubic-bezier(.34, 1.56, .64, 1) | Efecto rebote (usar con moderación) |
| Back Out | cubic-bezier(.34, 1.3, .64, 1) | Overshoot sutil |

## Composiciones de Layout
6 estados de composición estándar:
1. Full Screen / B-Roll (supertextos sobre pantalla completa)
2. Profe Pantalla Completa
3. Profe derecha + texto izquierda
4. Profe izquierda + texto derecha
5. Profe + texto superpuesto
6. B-Roll + foto lateral
