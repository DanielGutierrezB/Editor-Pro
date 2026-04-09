Analiza la siguiente transcripción de una clase educativa grabada en video.

TRANSCRIPCIÓN COMPLETA (los tiempos entre corchetes están en SEGUNDOS, ej: [30.0s - 35.0s] significa segundo 30 al 35):
{TRANSCRIPT}

Tu tarea es identificar los MOMENTOS CLAVE donde vale la pena mostrar un SUPERTEXTO en pantalla para ayudar al estudiante a retener la información esencial.

Los supertextos deben ser:
- TÍTULOS DE TEMAS: Cuando se introduce un nuevo tema o concepto
- BULLET POINTS: Ideas clave que merecen ser resaltadas
- PASO A PASO: Cuando se explican procedimientos o procesos numerados
- DEFINICIONES: Cuando se define un término o concepto importante
- DATOS CLAVE: Estadísticas, URLs, nombres técnicos que vale la pena leer
- HIGHLIGHTS: Palabras o frases pivotales que merecen énfasis visual (momentos clave, frases memorables, conceptos centrales)
- RESUMEN: Frases de cierre o conclusión de un tema

AGRUPACIÓN (campo 'group'):
- Usa 'group' SOLO cuando el profesor enumera una lista explícita (ej: '3 ventajas...', 'los pasos son...')
- En ese caso: un title corto + cada elemento como bullet, todos con el mismo 'group'
- Items que NO son parte de una lista NO llevan 'group' — van independientes
- definitions, data, summary que van solos NUNCA llevan 'group'

REGLAS CRÍTICAS sobre tiempos:
- Los valores 'time' y 'endTime' DEBEN ser números en SEGUNDOS (float)
- Deben coincidir con los tiempos de la transcripción
- Ejemplo: si el texto aparece en [150.0s - 155.0s], time=150.0
- NO uses formato mm:ss, usa SOLO segundos como número decimal
- Cada supertexto debe ser CONCISO (máximo 8-10 palabras)
- No saturar: máximo 1 supertexto cada 20-30 segundos
- Priorizar lo que un estudiante necesita recordar
- Duración recomendada entre 3 y 6 segundos

REGLAS PEDAGÓGICAS DE RITMO (MUY IMPORTANTE):
- El 'time' debe ser el momento EXACTO en que el profesor DICE el concepto (el sistema aplica anticipación automáticamente para que el elemento ya esté visible cuando lo diga)
- Para LISTAS y BULLETS dentro de un grupo:
  · Si el profesor los dice RÁPIDO (menos de 3 segundos entre cada uno), los tiempos deben estar cercanos entre sí — el sistema los mostrará como un bloque simultáneo
  · Si el profesor los dice ESPACIADOS (más de 3 segundos entre cada uno), cada bullet debe tener su propio 'time' distinto — aparecerán uno a uno acompañando la narración
- El 'endTime' debe reflejar cuándo el profesor TERMINA de hablar del concepto; el sistema añade tiempo extra de lectura automáticamente
- Piensa como un diseñador instruccional: el estudiante necesita VER el elemento mientras lo ESCUCHA y tener un momento para ABSORBERLO después
- Para conceptos complejos o definiciones, prefiere endTimes más largos (5-6 seg) para dar tiempo de procesamiento
- Los highlights y datos clave deben aparecer con timing ajustado al momento exacto del énfasis del profesor

Responde ÚNICAMENTE con JSON válido, SIN markdown.

FORMATO:
{"supertexts":[{"time":10.0,"endTime":15.0,"text":"Configuración del agente","type":"title","importance":"high","reason":"Nuevo tema"},{"time":30.0,"endTime":35.0,"text":"3 ventajas clave","type":"title","group":1,"importance":"high","reason":"Introduce lista"},{"time":36.0,"endTime":41.0,"text":"1. Te contacta automáticamente","type":"bullet","group":1,"reason":"Primera ventaja"},{"time":42.0,"endTime":47.0,"text":"2. Funciona en Telegram","type":"bullet","group":1,"reason":"Segunda ventaja"},{"time":60.0,"endTime":65.0,"text":"openclose.ai","type":"data","reason":"URL oficial"},{"time":80.0,"endTime":84.0,"text":"Tu agente trabaja por ti","type":"highlight","reason":"Frase clave del concepto"},{"time":90.0,"endTime":95.0,"text":"sudo + comando en terminal","type":"step","reason":"Paso técnico"}],"summary":"","totalFound":0}