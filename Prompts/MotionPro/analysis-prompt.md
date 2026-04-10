Analiza la siguiente transcripción de una clase/presentación educativa.
Los tiempos entre corchetes están en SEGUNDOS, ej: [30.0s - 35.0s] significa segundo 30 al 35.

TRANSCRIPCIÓN COMPLETA:
{TRANSCRIPT}

Tu objetivo es cubrir TODO el video con motion graphics. Analiza cada sección del transcript y propón una animación para cada concepto importante.

Para cada momento propuesto:
- startTime: tiempo de inicio en SEGUNDOS (float) — DEBE coincidir con los tiempos de la transcripción
- endTime: tiempo de fin en SEGUNDOS (float) — DEBE coincidir con los tiempos de la transcripción
- type: uno de los 12 tipos disponibles (ver abajo)
- description: qué visual se haría (2-3 líneas, en el idioma del transcript)
- priority: 'alta' | 'media' | 'baja'
- transcriptSegment: copia EXACTA del fragmento de transcripción (con los tiempos) que corresponde

REGLAS CRÍTICAS sobre tiempos:
- Los startTime y endTime DEBEN ser tiempos que aparecen en la transcripción
- NUNCA inventes tiempos que no existen en la transcripción
- La duración del motion DEBE cubrir TODO el segmento narrado
- NO usar duraciones fijas — cada motion dura lo que dure la explicación del narrador

REGLAS DE RITMO PEDAGÓGICO:
- El startTime debe ser el momento en que el profesor COMIENZA a hablar del concepto (el sistema anticipa automáticamente el clip ~0.8s antes para que la animación ya esté entrando cuando lo diga)
- El endTime debe incluir el cierre natural del concepto — NO cortarlo en seco al final de una frase
- Para conceptos densos, extiende el endTime 1-2 segundos extra para dar tiempo de absorción visual
- Piensa como diseñador instruccional: el motion graphic ACOMPAÑA al narrador, no compite con él

REGLA DE CLIPS LARGOS (MUY IMPORTANTE):
- PREFERIR clips LARGOS (10-30 segundos) sobre clips cortos (< 8 segundos)
- Un motion largo con múltiples secciones internas es MUCHO mejor que varios motions cortos
- Si el narrador habla de un tema durante 25 segundos, ESE ES UN SOLO MOTION con varias secciones internas (<Sequence> blocks)
- Piensa en cada motion como una "mini película" que acompaña al narrador durante todo un concepto
- Cada motion debe tener al menos 2-3 secciones internas que evolucionen con la narración

REGLA DE PROXIMIDAD:
- Si dos propuestas están separadas por MENOS DE 8 SEGUNDOS, FUSIÓNALAS en una sola
- Motions muy cercanos generan cortes bruscos al profesor que se ven golpeados
- Es mejor un motion largo y continuo que dos cortos con un corte entre ellos
- El video ideal tiene pocos motions largos, NO muchos motions cortos

REGLA DE COBERTURA:
- El objetivo es cubrir el 70-90% del video con motions
- Solo dejar al profesor sin motion en: saludos iniciales, anécdotas personales, pausas naturales
- Si el video dura 90 segundos, debería haber motions cubriendo al menos 60-70 segundos

CLASES MUY LARGAS (transcripciones de muchos minutos):
- Si el JSON de salida sería enorme, prioriza **bloques temáticos completos** (fusiona sub-bloques débiles) y mantén entre **~25 y 45 propuestas** como tope práctico — mejor menos motions sólidos que cientos de fragmentos
- Cada propuesta sigue siendo un motion **largo** con varias secciones internas cuando el tema lo merece

Tipos de visual y cuándo usar cada uno:
- Comparaciones (A vs B) → type: 'comparison'
- Procesos paso a paso → type: 'steps' (IDEAL para secciones de 15-30s con múltiples pasos)
- Datos/estadísticas → type: 'chart'
- Listados de conceptos (2-4 items visuales) → type: 'icons'
- Flujos causa-efecto → type: 'cards' (IDEAL para explicaciones de features)
- Diagramas técnicos, arquitectura → type: 'diagram' (IDEAL para workflows)
- Interfaces/formularios → type: 'ui'
- Intros de sección → type: 'title'
- Cronología/eventos secuenciales → type: 'timeline' (IDEAL para historias y procesos temporales)
- Revelación progresiva de un concepto → type: 'reveal' (IDEAL para cierres y conclusiones)
- Enumeraciones/listas largas (5+ items) → type: 'list'
- KPIs/números/métricas destacadas → type: 'metrics'

TIPS PARA CLIPS LARGOS:
- 'steps': cada paso es una sección interna → un motion de 20s con 3-4 pasos es perfecto
- 'diagram': mostrar elementos progresivamente → cada conexión es una sección
- 'timeline': cada nodo aparece con la narración → naturalmente largo
- 'comparison': mostrar lado A, luego lado B, luego ambos → 3 secciones
- 'cards': revelar cada card con stagger → se extiende con la narración

Campos adicionales POR PROPUESTA:
- brands: array de dominios de marcas mencionadas (ej: ["telegram.org"]). Array vacío si no hay.
- dataPoints: array de datos numéricos LITERALES mencionados (ej: ["73%", "$450"]). Array vacío si no hay.
- accentColor: color accent sugerido — "green" (default), "orange" (warning), "red" (danger), "purple" (secondary), "blue" (info)

Responde con JSON: {"proposals":[{startTime,endTime,type,description,priority,transcriptSegment,brands,dataPoints,accentColor}]}