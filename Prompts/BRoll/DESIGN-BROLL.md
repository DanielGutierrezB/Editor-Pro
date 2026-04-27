# DESIGN-BROLL.md — B-Roll Cinematográfico con Storytelling

## Visión
Pasar de "imágenes sueltas decorativas" a **secuencias narrativas cinematográficas**.
El B-Roll no debe ser un adorno — debe contar una historia visual que amplifica lo que dice el narrador.

## Concepto: Escenas con Planos

### Antes (actual)
```
Momento 1: "Laptop con código"       → 1 imagen suelta
Momento 2: "Persona pensando"        → 1 imagen suelta  
Momento 3: "Diagrama de red"         → 1 imagen suelta
```
Resultado: imágenes inconexas, genéricas, sin relación entre sí.

### Después (propuesto)
```
Escena A: "El desarrollador depurando" (3 planos, 12s total)
  Plano 1: Wide — Oficina con múltiples monitores, luz azul (5s)
  Plano 2: Medium — Manos sobre teclado, terminal con código (4s)  
  Plano 3: Close-up — Pantalla mostrando el error resaltado (3s)

Escena B: "La arquitectura del sistema" (2 planos, 8s total)
  Plano 1: Wide — Datacenter con racks de servidores (5s)
  Plano 2: Detail — Cables de fibra óptica brillando (3s)
```
Resultado: secuencias coherentes que se sienten como cine, con continuidad visual.

---

## Lenguaje Cinematográfico para la IA

### Tipos de Plano
| Plano | Código | Uso | Ejemplo |
|-------|--------|-----|---------|
| Wide/Establishing | `WIDE` | Contexto, ubicación | Sala de servidores completa |
| Medium | `MED` | Acción, persona | Desarrollador frente a pantalla |
| Close-up | `CU` | Detalle, emoción | Línea de código con error |
| Detail/Insert | `DET` | Objeto específico | LED parpadeando en un server |
| Over-the-shoulder | `OTS` | Perspectiva, POV | Mirando la pantalla desde atrás |

### Progresiones Narrativas Clásicas
1. **Revelación**: Wide → Medium → Close-up (acercar al detalle)
2. **Contextualización**: Close-up → Wide (revelar el entorno)
3. **Causa-Efecto**: Acción (MED) → Resultado (CU)
4. **Comparación**: Plano A → Plano B (contraste visual)
5. **Secuencia temporal**: Estado 1 → Estado 2 → Estado 3

### Principios de Corte
- **Mínimo 2 planos por escena** (un solo plano no es una secuencia)
- **Máximo 5 planos por escena** (no abrumar)
- **Cada plano: 2-6 segundos** (ritmo de B-Roll educativo)
- **Cambio de escala entre planos** (no cortar de medium a medium)
- **Consistencia visual** dentro de la escena (misma paleta, mismo "mundo")

---

## Arquitectura Técnica

### Modelo de Datos

```
Análisis actual:
  proposals[] → clips[]

Análisis propuesto:
  scenes[] → shots[] → clips[]
```

#### Scene (Escena)
```javascript
{
  id: "scene_001",
  title: "El desarrollador depurando",      // Título descriptivo
  narrative: "Revelación",                    // Tipo de progresión
  startTime: "00:01:30.000",                 // Inicio en transcript
  endTime: "00:01:42.000",                   // Fin en transcript
  transcriptText: "...y cuando el bug aparece...",
  visualWorld: "Oficina moderna, iluminación azul-blanca, monitores, ambiente tech nocturno",
  shots: [/* ver abajo */]
}
```

#### Shot (Plano)
```javascript
{
  id: "shot_001_1",
  sceneId: "scene_001",
  shotType: "WIDE",                           // Tipo de plano
  order: 1,                                    // Posición en la secuencia
  startTime: "00:01:30.000",
  endTime: "00:01:35.000",
  durationSecs: 5,
  description: "Wide shot of modern office at night, multiple monitors glowing blue, a developer silhouetted against the screens",
  referenceImagePath: null,                    // null = primer plano (txt2img)
  // Para planos 2+: path de la imagen del plano anterior (img2img)
}
```

### Flujo de Generación

```
1. ANÁLISIS (LLM)
   Transcript → Escenas con planos
   
2. GENERACIÓN DE IMÁGENES
   Para cada escena:
     Plano 1: txt2img normal (genera el "mundo" visual)
     Plano 2+: img2img con referencia del Plano 1
               denoise 0.55-0.70 (mantiene paleta/estilo, cambia encuadre)
               
3. COLOCACIÓN EN TIMELINE
   Todos los planos de una escena van consecutivos
```

### Workflow img2img en ComfyUI

Para generar planos con referencia visual, se modifica el workflow:

**txt2img (primer plano):** workflow actual
```
EmptyLatentImage → KSampler → VAEDecode → SaveImage
```

**img2img (planos subsiguientes):**
```
LoadImage → VAEEncode → KSampler(denoise=0.6) → VAEDecode → SaveImage
```

Cambios en el workflow JSON para img2img:
- Reemplazar nodo `EmptyLatentImage` (27) por `LoadImage` + `VAEEncode`
- Agregar `denoise: 0.6` al KSampler (nodo 13)
- El prompt del plano 2+ describe el nuevo encuadre pero mantiene el estilo

### Niveles de Denoise Recomendados
| Escenario | Denoise | Resultado |
|-----------|---------|-----------|
| 0.45-0.55 | Mismo lugar, ángulo diferente | Very close to reference |
| 0.55-0.65 | Mismo mundo, elemento diferente | Similar palette/style |
| 0.65-0.75 | Mismo estilo, contenido diferente | Loose reference |

---

## Prompt de Análisis (para la IA)

```
Eres un DIRECTOR DE FOTOGRAFÍA analizando el guión de un video educativo.

Tu trabajo: identificar momentos donde B-Roll visual amplificaría el mensaje,
y proponer SECUENCIAS CINEMATOGRÁFICAS (no imágenes sueltas).

REGLAS DE DIRECCIÓN:
1. Agrupa los momentos en ESCENAS (2-5 planos consecutivos que cuentan una mini-historia)
2. Cada escena tiene un "mundo visual" consistente (misma locación, paleta, estilo)
3. Varía el tipo de plano dentro de cada escena (WIDE → MEDIUM → CLOSE-UP)
4. El primer plano de cada escena establece el contexto (establishing shot)
5. Los planos siguientes profundizan en detalles
6. Piensa en progresiones narrativas: revelación, causa-efecto, zoom-in

TIPOS DE PLANO:
- WIDE: Vista general, establece el lugar (5-6s)
- MED: Acción principal, persona u objeto en contexto (3-5s)  
- CU: Detalle importante, texto en pantalla, emoción (2-4s)
- DET: Insert de objeto pequeño, textura, dato (2-3s)

Devuelve JSON:
{
  "scenes": [
    {
      "title": "Título descriptivo de la escena",
      "narrative": "revelación|causa-efecto|comparación|secuencia",
      "visualWorld": "Descripción del estilo visual consistente para toda la escena",
      "shots": [
        {
          "shotType": "WIDE|MED|CU|DET|OTS",
          "startTime": "HH:MM:SS.mmm",
          "endTime": "HH:MM:SS.mmm",  
          "description": "Prompt detallado para generar esta imagen",
          "rationale": "Por qué este plano en este momento"
        }
      ]
    }
  ]
}
```

---

## Cambios en UI

### Vista de Escenas (Step 2)
```
┌─────────────────────────────────────────┐
│ Escena 1: "El desarrollador depurando"  │
│ 🎬 Revelación · 3 planos · 12s         │
│ ┌─────┐ ┌─────┐ ┌─────┐                │
│ │WIDE │→│ MED │→│ CU  │                │
│ │ 5s  │ │ 4s  │ │ 3s  │                │
│ └─────┘ └─────┘ └─────┘                │
│ 🎙 "...y cuando el bug aparece en..."   │
├─────────────────────────────────────────┤
│ Escena 2: "La arquitectura del sistema" │
│ 🎬 Contextualización · 2 planos · 8s   │
│ ┌─────┐ ┌─────┐                        │
│ │WIDE │→│ DET │                        │
│ │ 5s  │ │ 3s  │                        │
│ └─────┘ └─────┘                        │
│ 🎙 "El sistema tiene tres capas..."     │
└─────────────────────────────────────────┘
```

### Generación Visual
- Cada escena se genera secuencialmente
- Plano 1: txt2img normal
- Planos 2+: img2img con referencia del plano 1 (denoise ~0.6)
- Thumbnail de cada plano aparece en la card
- Badge con tipo de plano (WIDE, MED, CU)

### Timeline
- Todos los planos de una escena van en el mismo track, consecutivos
- Se colocan en el tiempo que indica el transcript

---

## Migración / Compatibilidad

El flujo actual (propuestas individuales) sigue funcionando:
- Si la IA devuelve `proposals[]` (formato viejo) → comportamiento actual
- Si devuelve `scenes[]` (formato nuevo) → comportamiento cinematográfico
- Toggle en UI: "Modo cinematográfico" vs "Imágenes individuales"

---

## Fases de Implementación

### Fase 1: Análisis cinematográfico
- Nuevo prompt de análisis que devuelve scenes/shots
- Parser que soporta ambos formatos
- UI de escenas con planos agrupados
- Generación txt2img para todos los planos (sin referencia aún)

### Fase 2: Referencia img2img
- Workflow img2img en ComfyUI
- El plano 1 de cada escena usa txt2img
- Planos 2+ usan img2img con la imagen del plano 1
- Parámetro de denoise configurable

### Fase 3: Refinamiento
- Regenerar un plano manteniendo la referencia de la escena
- Drag & drop para reordenar planos
- Previsualización de la secuencia completa

---

## Preguntas para Daniel
1. ¿Cuántas escenas típicas por video? (para calibrar el análisis)
2. ¿Preferís que siempre agrupe en escenas, o que también pueda sugerir planos sueltos cuando tiene sentido?
3. ¿El toggle "Modo cinematográfico" vs "Individual" es útil, o siempre cinematográfico?
