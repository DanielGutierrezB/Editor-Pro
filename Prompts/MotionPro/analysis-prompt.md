Analiza la siguiente transcripción de una clase/presentación educativa.
Los tiempos entre corchetes están en SEGUNDOS, ej: [30.0s - 35.0s] significa segundo 30 al 35.

TRANSCRIPCIÓN COMPLETA:
{TRANSCRIPT}

Tu objetivo es identificar TODOS los momentos donde un motion graphic aportaría valor visual. Analiza cada concepto, dato, proceso o idea y propón una animación individual para cada uno.

Para cada momento propuesto:
- startTime: tiempo de inicio en SEGUNDOS (float) — DEBE coincidir con los tiempos de la transcripción
- endTime: tiempo de fin en SEGUNDOS (float) — DEBE coincidir con los tiempos de la transcripción
- type: uno de los 12 tipos disponibles (ver abajo)
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

REGLAS DE TIMING:
- El startTime debe ser cuando el profesor COMIENZA a hablar del concepto
- El endTime debe incluir el cierre natural del concepto
- Duración típica: 5-15 segundos por motion
- Solo hacer motions más largos (15-30s) cuando el concepto genuinamente lo requiere (un proceso de muchos pasos, una comparación elaborada)

REGLAS DE COBERTURA:
- Cubrir el 70-90% del video con motions
- Solo dejar al profesor sin motion en: saludos iniciales, anécdotas personales, pausas naturales

Tipos de visual y cuándo usar cada uno:
- Comparaciones (A vs B) → type: 'comparison'
- Procesos paso a paso → type: 'steps'
- Datos/estadísticas → type: 'chart'
- Listados de conceptos (2-4 items visuales) → type: 'icons'
- Flujos causa-efecto → type: 'cards'
- Diagramas técnicos, arquitectura → type: 'diagram'
- Interfaces/formularios → type: 'ui'
- Intros de sección → type: 'title'
- Cronología/eventos secuenciales → type: 'timeline'
- Revelación progresiva de un concepto → type: 'reveal'
- Enumeraciones/listas largas (5+ items) → type: 'list'
- KPIs/números/métricas destacadas → type: 'metrics'

Campos adicionales POR PROPUESTA:
- brands: array de dominios de marcas mencionadas (ej: ["telegram.org"]). Array vacío si no hay.
- dataPoints: array de datos numéricos LITERALES mencionados (ej: ["73%", "$450"]). Array vacío si no hay.
- accentColor: color accent sugerido — "green" (default), "orange" (warning), "red" (danger), "purple" (secondary), "blue" (info)

AGRUPACIÓN POR CONCEPTO:
- Cada propuesta debe tener un campo `group` con el nombre del concepto/tema al que pertenece
- Varios motions pueden pertenecer al mismo grupo si son parte del mismo concepto
- El nombre del grupo debe ser corto (3-6 palabras) y descriptivo
- Ejemplo: si el narrador habla de "tipos de campañas" durante 30 segundos y mencionas 3 motions sobre ese tema, los 3 llevan group: "Tipos de campañas"

Responde con JSON: {"proposals":[{startTime,endTime,type,description,priority,transcriptSegment,brands,dataPoints,accentColor,group}]}
