# Motion-Pro — Design Fundamentals

Reference document for creating educational motion graphics. These principles inform every design decision.

---

## 1. The 12 Principles of Animation (Disney)

Applied to motion graphics for education:

### Usamos activamente:

**Squash & Stretch** — Buttons that compress on click and bounce back. Spring animations with overshoot. Da sensación de peso y vida a los elementos.
- En Remotion: `spring({damping: 8})` para bounce, `scale(0.93) → scale(1)` para clicks

**Anticipation** — Antes de que aparezca un elemento importante, una pausa o un elemento menor prepara al espectador. 
- Ejemplo: los dots de la órbita aparecen antes del número grande

**Staging** — Una sola idea clara por pantalla. El ojo debe ir directo a lo importante.
- Regla: NUNCA más de un concepto compitiendo por atención
- El elemento principal es el más grande y brillante, todo lo demás es secundario

**Slow In & Slow Out** — Los movimientos empiezan lentos, aceleran, y frenan suavemente.
- En Remotion: `spring()` hace esto automáticamente. NUNCA usar `linear`.

**Follow Through** — Después de que un elemento llega a su posición, sigue moviéndose ligeramente.
- En Remotion: `spring({damping: 10-14})` con overshoot natural

**Timing** — La velocidad de las animaciones comunica peso e importancia.
- Elementos grandes: 15-20 frames para entrar (sensación de peso)
- Elementos pequeños: 8-12 frames (ligeros, rápidos)
- Stagger entre elementos: 10-15 frames

**Secondary Action** — Elementos de fondo que acompañan sin distraer.
- Grid sutil moviéndose, partículas, scan lines
- Opacity siempre < 0.1 para que no compitan

**Appeal** — El diseño debe ser atractivo y agradable de ver.
- Consistencia en colores, tipografía, espaciado
- Bordes redondeados, sombras sutiles, colores armónicos

### No aplicamos (no relevantes para motion graphics estáticos):
- Straight Ahead vs Pose to Pose (es para animación frame-by-frame)
- Arcs (es para movimiento de personajes)
- Exaggeration (nuestro estilo es minimalista)
- Solid Drawing (es para dibujo 3D)

---

## 2. Principios Gestalt de Percepción Visual

### Proximidad
Elementos cercanos se perciben como grupo. 
- Cards con gap: elementos dentro de una card son un grupo
- Separar grupos distintos con gap mínimo de 50px a 1080p

### Similitud
Elementos que se ven iguales se perciben como relacionados.
- Usar el MISMO estilo de card/ícono para elementos del mismo tipo
- Color consistente: phishing SIEMPRE rojo, ransomware SIEMPRE naranja

### Cierre (Closure)
El cerebro completa formas incompletas.
- Las líneas placeholder (barras de 5px) se leen como "texto" sin necesidad de texto real
- Íconos SVG con trazos abiertos siguen siendo reconocibles

### Continuidad
El ojo sigue líneas y curvas naturalmente.
- Las flechas entre cards guían el flujo de lectura
- El line chart dibujándose progresivamente aprovecha esto

### Figura/Fondo
Lo que destaca vs lo que es fondo.
- Fondo oscuro (#060a14) con grid sutil = fondo claro
- Cards con fondo ligeramente más claro (#0c1222) = figura
- Color accent (#00d4ff) = punto focal

### Región Común
Elementos dentro de un área cerrada se perciben como grupo.
- Cards con borde y padding crean regiones visuales claras
- El browser chrome agrupa la URL y el contenido

---

## 3. Teoría del Color para Dark UI

### Nuestra paleta y por qué:

| Color | Hex | Uso | Psicología |
|---|---|---|---|
| Background | #060a14 | Fondo principal | Profundidad, enfoque |
| Card | #0c1222 | Contenedores | Separación sutil |
| Cyan | #00d4ff | Accent principal | Tecnología, claridad |
| Green | #34d399 | Éxito, positivo | Seguridad, correcto |
| Orange | #fb923c | Advertencia | Atención, precaución |
| Purple | #a78bfa | Secundario | Creatividad, distinción |
| Red | #f87171 | Peligro, error | Urgencia, alerta |
| Text | #e4eaf4 | Texto principal | Alta legibilidad |
| Dim | #6b7fa0 | Texto secundario | Jerarquía, contexto |

### Reglas de color:
1. **Un accent por sección** — no mezclar todos los colores
2. **Contraste mínimo 4.5:1** para texto sobre fondo (WCAG AA)
3. **Dim text (#6b7fa0) es el mínimo** — nunca más oscuro
4. **Bordes: color + 33 opacity** — suficiente para separar sin gritar
5. **Glow/shadow: color + 22 opacity** — brillo sutil, no cegador
6. **Nunca blanco puro (#fff)** — usar #e4eaf4 para reducir fatiga visual

### Contraste verificado:
- #e4eaf4 sobre #060a14 = ratio 14.2:1 ✅ (AAA)
- #6b7fa0 sobre #060a14 = ratio 4.8:1 ✅ (AA)
- #00d4ff sobre #060a14 = ratio 8.7:1 ✅ (AAA)

---

## 4. Tipografía

### Jerarquía tipográfica:
La regla fundamental: **dos saltos de peso** para crear contraste visible.
- 400 (Regular) ↔ 700 (Bold) — para texto/énfasis
- Nunca usar pesos adyacentes (400 vs 500 es invisible)

### Escala tipográfica para 1080p:

| Nivel | Tamaño | Peso | Uso |
|---|---|---|---|
| Display | 72-110px | 700 | Números grandes, títulos de welcome |
| H1 | 48-60px | 700 | Títulos de sección |
| H2 | 30-38px | 700 | Subtítulos, nombres de pasos |
| Body | 22-26px | 400 | Texto descriptivo |
| Label | 18-20px | 700 | Etiquetas de campos, ejes |
| Caption | 16-18px | 400 | Info secundaria, tooltips |
| Mono | 18-24px | 400/700 | Datos, código, valores |

### Espaciado:
- Letter-spacing en labels uppercase: 3-4px
- Letter-spacing en subtítulos: 8-12px
- Line-height: 1.2 para títulos, 1.6 para body

---

## 5. Espacio y Composición

### Safe Area (1080p):
```
80px padding all sides → 1760×920 usable
```
**Nada puede salir de esta área. Nunca.**

### Principio: el espacio es un elemento de diseño
- Los elementos deben "respirar" — nunca amontonados
- Gap mínimo entre elementos: 40px
- Gap entre grupos/secciones: 60-80px
- Margen alrededor de charts: 30-40px

### Llenar la pantalla vs dejar espacio:
- **Charts**: deben usar 70-85% del ancho disponible
- **Títulos**: centrados, con espacio arriba y abajo
- **Cards**: máximo 2-3 horizontales con gap generoso
- **Íconos**: máximo 3-4 horizontales con gap 120-160px
- **Un solo elemento focal**: puede ser grande (40-50% de la pantalla)

### Regla de tercios (simplificada):
- Elemento principal: centro de la pantalla
- Elementos secundarios: a los lados con gap claro
- Info de soporte (badge, caption): esquinas con opacity reducida

---

## 6. Timing y Ritmo

### El audio es la guía maestra
Cada visual aparece cuando el narrador lo menciona. Nunca antes.

### Velocidad de lectura:
- Un espectador necesita ~2 segundos para leer un título
- ~3-4 segundos para procesar un chart simple
- ~5-6 segundos para entender un chart con datos
- Las animaciones de entrada deben completarse en 0.5s para no bloquear lectura

### Ritmo de secciones:
- Alternar entre secciones densas (charts) y simples (título, éxito)
- No hacer 3 charts seguidos — intercalar con visuales simples
- La última sección siempre simple (cierre limpio)

---

## Checklist antes de renderizar

1. ☐ ¿Todos los elementos dentro del safe area?
2. ☐ ¿Un solo concepto por pantalla?
3. ☐ ¿Los charts llenan el espacio disponible?
4. ☐ ¿El texto es legible en un celular?
5. ☐ ¿Los colores tienen contraste suficiente?
6. ☐ ¿Las animaciones están sincronizadas al audio?
7. ☐ ¿No hay pantalla vacía al final?
8. ☐ ¿Los pesos tipográficos tienen contraste de dos saltos?
9. ☐ ¿Los elementos respiran con gap suficiente?
10. ☐ ¿Se usa un solo color accent por sección?

---

## 7. Regla de Llenado de Pantalla (1080p)

**Los elementos deben llenar al menos 70% del espacio usable (1760×920).**

### Escala tipográfica REAL para 1080p:
No diseñar con tamaños que se "ven bien en preview a 360p". Estos son los tamaños mínimos que funcionan a 1080p en un celular:

| Nivel | Tamaño MÍNIMO | Uso |
|---|---|---|
| Display | 72-110px | Números grandes, welcome |
| H1 | 60-80px | Títulos de sección |
| H2 | 40-52px | Subtítulos, nombres de pasos |
| Body | 30-34px | Texto descriptivo |
| Label | 26-30px | Etiquetas, ejes, labels |
| Mono data | 28-44px | Valores dentro de cajas |
| Mínimo absoluto | 24px | Nada menor que esto |

### Tamaños de elementos REALES para 1080p:
| Elemento | Tamaño mínimo |
|---|---|
| Flow boxes | 480-560px ancho |
| Variable boxes | 380px ancho × 170px alto |
| Function boxes | 400-520px ancho |
| Code blocks | 900-1100px ancho |
| Condition diamonds | 480px ancho |
| Card layout | 600px ancho por card |
| Icon circles | 200px diámetro |
| Summary circles | 100px diámetro |
| Semáforo circles | 80px diámetro |
| Processing items | 300px ancho |

### Gaps entre elementos:
| Contexto | Gap mínimo |
|---|---|
| Entre cards/boxes horizontales | 120-160px |
| Entre items en lista vertical | 20-28px |
| Stagger items | 14-18px |
| Entre secciones (título-contenido) | 40-50px |
| Branch gap (if/else) | 200-240px |

### Proceso de verificación:
1. Renderizar still a 1080p de CADA sección
2. Ver el still en un celular
3. Si el texto cuesta leerlo → demasiado pequeño
4. Si hay más de 30% de espacio vacío → elementos muy pequeños
5. Los elementos deben "sentirse grandes" no "caber justo"

---

## 8. Reglas de Espacio para Charts

### Títulos de charts:
- marginBottom mínimo: **60px** entre título y el chart
- Esto evita que los valores encima de las barras se solapen con el título

### Ancho máximo de charts:
- Line charts: **1300px** máximo (no 1500px)
- Esto deja espacio para que el último label del eje X no se corte
- Con safe area de 60px, el ancho usable es 1800px. Un chart de 1300px + marginLeft de 70px = 1370px, dejando 430px de margen derecho

### Bar charts:
- Altura máxima de barras: **480px** (no 560px)
- Esto deja espacio para: título + 60px gap + valor encima de barra + barra + label debajo
- Total vertical: 36px título + 60px gap + 28px valor + 480px barra + 26px label = 630px de 960px usable

### Checklist para charts antes de renderizar:
1. ☐ ¿El título tiene marginBottom ≥ 60px?
2. ☐ ¿Los valores encima de barras no se solapan con el título?
3. ☐ ¿El último label del eje X es visible?
4. ☐ ¿El chart + margins cabe en 1800px de ancho?
5. ☐ ¿Hay espacio para la anotación debajo del chart?

---

## 9. Dinamismo Visual — Anti-Estático

Los motion graphics educativos deben sentirse VIVOS, no como presentaciones de PowerPoint. Estas técnicas previenen que el video se sienta estático.

### 9.1 Zoom Sutil (Slow Zoom / Ken Burns)
Mientras un visual está en pantalla por varios segundos, aplicar un zoom lento (scale 1.0 → 1.05) para evitar que se sienta estático.

**Reglas:**
- Scale: de 1.0 a 1.03-1.05 máximo (MUY sutil)
- Duración: toda la sección (no abrupto)
- Usar `interpolate` con extrapolateRight:'clamp'
- Aplicar al wrapper del contenido, NO al fondo
- Alternar: zoom in en una sección, zoom out en la siguiente
- NO usar en charts (distorsiona la lectura de datos)

**Ejemplo en Remotion:**
```tsx
// Subtle zoom wrapper for a section
const ZoomWrap:React.FC<{children:React.ReactNode;dur:number;from?:number;to?:number}> = ({children,dur,from=1.0,to=1.04}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, dur], [from, to], {extrapolateRight:'clamp'});
  return <div style={{transform:`scale(${scale})`,transformOrigin:'center center',position:'absolute',inset:0}}>{children}</div>;
};
```

### 9.3 Cambios Visuales Frecuentes
Dentro de secciones largas (>150 frames / 5 segundos), el visual DEBE cambiar para mantener la atención. Técnicas:

**Sub-secciones dentro de una Sequence:**
- Si un concepto dura 10+ segundos, dividir en 2-3 sub-visuales
- Cada sub-visual entra con su propia animación E()
- Los sub-visuales pueden ser: nuevo icono, nuevo dato, nueva card, texto de énfasis

**Regla de los 4 segundos:**
- Ningún frame debe verse EXACTAMENTE igual por más de 120 frames (4 segundos)
- Algo debe cambiar: un nuevo elemento entra, un texto de énfasis aparece, un zoom se mueve
- Si no hay nuevo contenido visual, usar texto de énfasis del narrador

**Transiciones dentro de sección:**
- Cross-fade entre sub-elementos (opacity de uno baja mientras otro sube)
- Elementos que se mueven ligeramente (translateY de 0 a -10px en 90 frames)
- Progress indicators que avanzan (dots, barras, contadores)

### 9.4 Distribución de Espacio — Llenar la Pantalla
**PROBLEMA:** Elementos pequeños centrados con mucho espacio vacío alrededor.
**SOLUCIÓN:** Los elementos deben ocupar el 70-85% del espacio usable.

**Técnicas para llenar espacio:**
1. **Usar el ancho completo** — cards y charts deben llegar cerca de los bordes del safe area
2. **Layout horizontal** — poner elementos lado a lado en vez de apilados verticalmente
3. **Elementos de contexto** — agregar labels, badges, separadores decorativos
4. **Texto de soporte** — subtítulos, descripciones cortas que ocupen espacio
5. **Múltiples niveles** — título arriba, contenido al centro, detail/caption abajo

**Layout recomendado para secciones de contenido:**
```
┌─────────────────────────────────────┐
│  [Badge/Step]        [Title 60-80px]│  ← Zona superior
│                                     │
│  [Visual principal que ocupa 60%+]  │  ← Zona central (la más grande)
│  [Cards, icons, charts, etc.]       │
│                                     │
│  [Texto de énfasis / detail]        │  ← Zona inferior
│  [Caption o dato complementario]    │
└─────────────────────────────────────┘
```

**Anti-pattern: el elemento solitario**
```
┌─────────────────────────────────────┐
│                                     │
│                                     │
│           [Ícono pequeño]           │  ← MAL: 80% del espacio está vacío
│           [Label]                   │
│                                     │
│                                     │
└─────────────────────────────────────┘
```
