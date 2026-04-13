Analiza la siguiente transcripción de una clase/presentación educativa.
Los tiempos entre corchetes están en SEGUNDOS, ej: [30.0s - 35.0s] significa segundo 30 al 35.

TRANSCRIPCIÓN COMPLETA:
{TRANSCRIPT}

Tu objetivo es identificar TODOS los momentos donde un motion graphic aportaría valor visual. Analiza cada concepto, dato, proceso o idea y propón una animación individual para cada uno.

ANTES de elegir un tipo, piensa: "¿Qué visual haría que un estudiante entienda este concepto MEJOR que solo escucharlo?" 
No categorices mecánicamente — diseña visualmente. Tu descripción es un brief para un diseñador motion.

Para cada momento propuesto:
- startTime: tiempo de inicio en SEGUNDOS (float) — DEBE coincidir con los tiempos de la transcripción
- endTime: tiempo de fin en SEGUNDOS (float) — DEBE coincidir con los tiempos de la transcripción
- type: uno de los 15 tipos disponibles (ver abajo)
- description: qué visual se haría (1-2 líneas, en el idioma del transcript)
- priority: 'alta' | 'media' | 'baja'
- transcriptSegment: copia EXACTA del fragmento de transcripción (con los tiempos) que corresponde

REGLAS CRÍTICAS sobre tiempos:
- Los startTime y endTime DEBEN ser tiempos que aparecen en la transcripción
- NUNCA inventes tiempos que no existen en la transcripción
- La duración debe cubrir el segmento narrado del concepto

REGLAS DE PROPUESTAS:
- Propón UN motion por cada concepto, dato o idea visual — NO los fusiones
- Preferir MUCHAS propuestas cortas (5-15 segundos) sobre pocas largas
- Cada propuesta = UN concepto visual claro
- Si el narrador menciona 5 conceptos en 60 segundos, eso son 5 propuestas separadas
- NO hay límite de propuestas — si el video tiene 30 conceptos, propón 30 motions
- Los cortes entre motions están bien — el sistema agrega fades automáticamente

REGLAS DE COHERENCIA NARRATIVA:
- Si el narrador enumera items dentro de una misma oración o idea (ej: "segmentación, presupuesto, objetivo, campaña"), eso es UN solo clip, NO 2 o 3 clips separados
- Si el narrador dice "hay tres cosas:" seguido de una lista, eso es UN clip tipo 'list' o 'icons' con los 3 items
- NUNCA separar una enumeración en un clip de 2 items + otro clip con los demás items
- La unidad de corte es el CONCEPTO completo, no la oración individual

REGLAS DE TIMING:
- El startTime debe ser cuando el profesor COMIENZA a hablar del concepto
- El endTime debe incluir el cierre natural del concepto
- Duración típica: 5-15 segundos por motion
- Solo hacer motions más largos (15-30s) cuando el concepto genuinamente lo requiere (un proceso de muchos pasos, una comparación elaborada)

REGLAS DE COBERTURA:
- Cubrir el 100% del video con motions — SIN GAPS entre clips
- El endTime de una propuesta debe ser IGUAL al startTime de la siguiente (cobertura continua)
- El profesor SIEMPRE debe tener apoyo visual en cada segundo del video
- Solo dejar sin motion: silencios largos (>5s) al inicio o final
- Preferir más motions de menor duración que pocos motions largos
- Para un video de 1-2 minutos, mínimo 14-18 propuestas (un motion cada 7-10 segundos)
- Para un video de 3-5 minutos, mínimo 20-30 propuestas
- REGLA: divide el video en segmentos de 7-10 segundos. Cada segmento = 1 propuesta.

Tipos de visual y cuándo usar cada uno:
- Comparaciones (A vs B) → type: 'comparison'
- Procesos paso a paso → type: 'steps'
- Datos/estadísticas → type: 'chart'
  En la descripción del chart, especifica el tipo: "bar chart de X" o "line chart con tendencia de X" o "progress bars comparando X"
- Listados de conceptos (2-4 items visuales) → type: 'icons'
- Flujos causa-efecto → type: 'cards'
- Diagramas técnicos, arquitectura → type: 'diagram'
- Intros de sección → type: 'title'
- Cronología/eventos secuenciales → type: 'timeline'
- Revelación progresiva de un concepto → type: 'reveal'
- Enumeraciones/listas largas (5+ items) → type: 'list'
- KPIs/números/métricas destacadas → type: 'metrics'
- Antes/después, transformación de un mismo concepto → type: 'beforeafter'
- Funnel/pipeline de etapas con flujo → type: 'funnel'
- Frase clave o tesis del narrador destacada → type: 'callout'

CALIDAD DE LA DESCRIPCIÓN (CRÍTICO):
- NO escribas "Mostrar texto con las 3 ventajas" — eso es literal y aburrido
- SÍ escribe "3 cards con accent border lateral que revelan progresivamente con stagger, cada una con número grande (CountUp) y descripción corta"
- La descripción debe ser un BRIEF VISUAL específico, no un resumen del contenido
- Incluye detalles de: layout (horizontal/vertical/centrado/split), elementos (cards/icons/gauge/funnel), animación (reveal/stagger/counter/draw-on)
- Piensa en qué haría al visual MEMORABLE, no solo funcional

Campos adicionales POR PROPUESTA:
- brands: array de dominios de marcas mencionadas (ej: ["telegram.org"]). Array vacío si no hay.
- dataPoints: array de datos numéricos LITERALES mencionados (ej: ["73%", "$450"]). Array vacío si no hay.
- accentColor: color accent sugerido — "green" (default), "orange" (warning), "red" (danger), "purple" (secondary), "blue" (info)
- visualComplexity: 'simple' | 'medium' | 'rich' — qué tan elaborado debe ser el visual
  - simple: título + icono (conceptos rápidos, 5-8s)
  - medium: cards + elementos interactivos (explicaciones, 8-15s)
  - rich: diagrama/funnel/chart con múltiples capas (conceptos clave, 15-30s)

AGRUPACIÓN POR CONCEPTO:
- Cada propuesta debe tener un campo `group` con el nombre del concepto/tema al que pertenece
- Varios motions pueden pertenecer al mismo grupo si son parte del mismo concepto
- El nombre del grupo debe ser corto (3-6 palabras) y descriptivo
- Ejemplo: si el narrador habla de "tipos de campañas" durante 30 segundos y mencionas 3 motions sobre ese tema, los 3 llevan group: "Tipos de campañas"

VALIDACIÓN FINAL (aplica antes de responder):
1. ¿Hay algún reveal con solo 1 item? → Cámbialo a callout
2. ¿Hay algún concepto que se separó en 2 clips pero debería ser 1? → Fúndelos
3. ¿Hay gaps entre los endTime de un clip y startTime del siguiente? → Ajusta para cobertura 100%
4. ¿Cada tipo elegido tiene sentido para el contenido? → Una lista de conceptos NO es un reveal, es un list o icons
5. ¿Hay mínimo 14 propuestas? → Si no, busca más momentos visualizables
6. ¿Los títulos son frases del transcript? → No inventes texto que el profesor no dijo

Responde con JSON: {"proposals":[{startTime,endTime,type,description,priority,transcriptSegment,brands,dataPoints,accentColor,visualComplexity,group}]}
