Analiza la siguiente transcripción de una clase educativa grabada en video (típicamente plano medio: presentador a la derecha, fondo limpio a la izquierda).

TRANSCRIPCIÓN COMPLETA (los tiempos entre corchetes están en SEGUNDOS, ej: [30.0s - 35.0s] significa segundo 30 al 35):
{TRANSCRIPT}

Tu tarea es proponer SUPERTEXTOS que acompañen al profesor **de forma casi continua**. Cada idea, concepto, dato, regla, ejemplo o conclusión que el profesor verbalice puede traducirse a un texto breve en pantalla que expanda, resuma o refuerce lo dicho. **No deben ser transcripciones literales, sino abstracciones de conceptos e ideas que refuercen la recepción visual del contenido para quien lo ve**. **No dejes tiempos vacíos**: si el profesor está hablando de algo que aporta al aprendizaje, debe haber un supertexto acompañándolo. Para seleccionar los destacados, filtra respondiendo a la pregunta: ¿Esto aporta al reforzamiento de la idea? Si la respuesta es sí, adelante. Si la respuesta es NO, omítelo.

COMPOSICIÓN Y LECTURA (MUY IMPORTANTE — encaja con MOGRT de 2 líneas y leading ~39px):
- El texto en pantalla suele ir en el **tercio izquierdo**; el presentador ocupa la zona derecha. **No escribas una sola línea muy larga** que se meta en la cara del presentador.
- Si una idea necesita más de **~40 caracteres** en una línea, divide en **dos líneas** usando salto explícito: en el JSON pon el carácter **\n** entre líneas (ej: `"línea corta\nsegunda línea"`). El MOGRT soporta hasta 2 líneas con salto `\n`. Al dividir líneas, evita **huérfanas** (conjunciones o preposiciones sueltas al final de una línea) y **viudas** (última palabra aislada en la segunda línea).
- Si puedes decir lo mismo en **menos palabras** sin perder sentido, hazlo. Ofrece **variante breve**; el aire visual importa tanto como la frase completa.
- Palabras clave del profesor (CTR, CPA, Meta, funnel…) pueden ir solas en una línea si ganan claridad.
- Máximo aproximado **~90 caracteres totales** por supertexto (en 1 o 2 líneas).

TIPOS DE SUPERTEXTO (usa SOLO estos 5 tipos):
- **title**: TÍTULOS DE TEMAS — nuevo bloque o sección. Tipografía más grande, otro color — marcan cambio de tema.
- **bullet**: IDEAS CLAVE — conceptos, reglas, datos, pasos, resúmenes. Aparecen uno a uno conforme el transcript va señalándolo. Este es el tipo más versátil: úsalo para todo lo que no encaje en los otros 4.
- **definition**: DEFINICIONES — términos nuevos o técnicos que el profesor explica por primera vez.
- **highlight**: FRASES MEMORABLES — reglas de oro, conclusiones impactantes, frases que el alumno debería recordar.
- **question**: PREGUNTAS DEL PROFESOR — cuando hace una pregunta retórica o directa a la audiencia (ej: "¿Qué pasaría si nos caemos?", "¿Cuál crees que es el error más común?"). Captura la pregunta tal como la formula. Incluye los signos ¿…? Ayuda a delimitar momentos de reflexión y recalcarlos visualmente.

NO uses otros tipos como "step", "data", "summary" — mapea todo a estos 5.

AGRUPACIÓN (campo 'group') — DETECCIÓN EXHAUSTIVA DE LISTAS:
- Usa 'group' cuando el profesor enumera una lista, ya sea:
  · Explícita con número: "hay tres cosas…", "cuatro pasos…", "cinco errores…"
  · Inline por comas: "contexto, hallazgo, interpretación y acción" → SON 4 BULLETS, no 2
  · Secuencial: "lo primero… lo segundo… lo tercero…"
- **REGLA CRÍTICA**: si el profesor dice "A, B, C y D", TODOS los elementos (A, B, C, D) deben aparecer como bullets separados. NO omitas ninguno. Cuenta los elementos de la frase y verifica que tu JSON tiene exactamente esa cantidad de bullets en el grupo.
- Un title corto + cada elemento como bullet con el mismo 'group'
- Cada bullet del grupo es un item separado en el JSON (para que aparezca como clip independiente)
- El 'time' de cada bullet debe coincidir con el momento en que el profesor DICE ese elemento específico
- Items fuera de lista enumerada NO llevan 'group'

RITMO Y CANTIDAD (cobertura máxima, no cuota baja):
- **Filosofía: si el profesor lo dice y aporta, merece un supertexto.** No te limites a "momentos clave" aislados — acompaña el discurso de forma continua, como subtítulos pedagógicos enriquecidos.
- Los supertextos no son transcripciones literales, sino refuerzos visuales — equivalentes a un resaltado tipográfico en un impreso: resaltan ideas, no compiten con los subtítulos.
- El alumno debería poder seguir la clase SOLO con los supertextos y entender la estructura completa del contenido.
- Propón textos que **expandan** (añaden contexto visual a lo que se dice), **resuman** (sintetizan una explicación larga en una frase), o **refuercen** (repiten la palabra clave textualmente).
- **No dejes huecos mayores a ~15 s** sin supertexto, salvo que el profesor haga una pausa real o cuente una anécdota sin valor pedagógico.
- Si dos momentos consecutivos son casi el mismo mensaje, **fusiónalo** en un solo supertexto más largo.
- Listas tipo "A • B • C" en una frase: preferir **título + bullets** con `group` (cada bullet un item separado en el JSON), no todo en un solo texto.
- **Ejemplo concreto**: si el profesor dice "La estructura es contexto, hallazgo, interpretación y acción", debes generar: 1 title ("Estructura de análisis") + 4 bullets ("1. Contexto", "2. Hallazgo", "3. Interpretación", "4. Acción") todos con el mismo group. Si además el profesor luego explica cada uno con ejemplos, cada explicación merece su propio supertexto independiente.

REGLAS DE TIEMPO:
- 'time' y 'endTime' en SEGUNDOS (float), alineados con la transcripción
- 'time' = cuando el profesor enfatiza el concepto (el panel aplica anticipación)
- 'endTime' = hasta cuando sigue siendo relevante leer en pantalla
- Duración típica de un supertexto: **5–15 s** (el suficiente para leerlo cómodamente)
- Para grupos/listas: todos los bullets comparten el mismo endTime (salen juntos)

Responde ÚNICAMENTE con JSON válido, SIN markdown.

FORMATO:
{"supertexts":[{"time":10.0,"endTime":20.0,"text":"Configuración del agente","type":"title","importance":"high","reason":"Nuevo tema"},{"time":43.5,"endTime":55.0,"text":"3 escenarios en Meta","type":"title","importance":"high","reason":"Título de la lista","group":"escenarios-meta"},{"time":44.0,"endTime":55.0,"text":"No gasta","type":"bullet","importance":"high","reason":"Primer escenario","group":"escenarios-meta"},{"time":47.0,"endTime":55.0,"text":"Gasta sin convertir","type":"bullet","importance":"high","reason":"Segundo escenario","group":"escenarios-meta"},{"time":50.0,"endTime":55.0,"text":"Convierte caro","type":"bullet","importance":"high","reason":"Tercer escenario","group":"escenarios-meta"},{"time":62.0,"endTime":75.0,"text":"Creativo → CTR → CPC → CPA\nTodo empieza desde el creativo","type":"highlight","importance":"high","reason":"Cadena de métricas clave"},{"time":80.0,"endTime":90.0,"text":"¿Qué pasaría si la campaña\nno genera conversiones?","type":"question","importance":"high","reason":"Pregunta retórica del profesor"}],"summary":"","totalFound":0}
