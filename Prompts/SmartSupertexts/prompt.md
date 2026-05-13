Analiza la siguiente transcripción de una clase educativa grabada en video (típicamente plano medio: presentador a la derecha, fondo limpio a la izquierda).

TRANSCRIPCIÓN COMPLETA (los tiempos entre corchetes están en SEGUNDOS, ej: [30.0s - 35.0s] significa segundo 30 al 35):
{TRANSCRIPT}

Tu tarea es proponer SUPERTEXTOS que acompañen al profesor **de forma casi continua**. Cada idea, concepto, dato, regla, ejemplo o conclusión que el profesor verbalice puede traducirse a un texto breve en pantalla que expanda, resuma o refuerce lo dicho. **No deben ser transcripciones literales, sino abstracciones de conceptos e ideas que refuercen la recepción visual del contenido para quien lo ve**. **No dejes tiempos vacíos**: si el profesor está hablando de algo que aporta al aprendizaje, debe haber un supertexto acompañándolo. Para seleccionar los destacados, filtra respondiendo a la pregunta: ¿Esto aporta al reforzamiento de la idea? Si la respuesta es sí, adelante. Si la respuesta es NO, omítelo.

COMPOSICIÓN Y LECTURA (MUY IMPORTANTE - encaja con MOGRT de 2 líneas y leading ~39px):
- El texto en pantalla suele ir en el **tercio izquierdo**; el presentador ocupa la zona derecha. **No escribas una sola línea muy larga** que se meta en la cara del presentador.
- Si una idea necesita más de **~40 caracteres** en una línea, divide en **dos líneas** usando salto explícito: en el JSON pon el carácter **\n** entre líneas (ej: `"línea corta\nsegunda línea"`). El MOGRT soporta hasta 2 líneas con salto `\n`. Al dividir líneas, evita **huérfanas** (conjunciones o preposiciones sueltas al final de una línea) y **viudas** (última palabra aislada en la segunda línea).
- Si puedes decir lo mismo en **menos palabras** sin perder sentido, hazlo. Ofrece **variante breve**; el aire visual importa tanto como la frase completa.
- Palabras clave del profesor (CTR, CPA, Meta, funnel...) pueden ir solas en una línea si ganan claridad.
- Máximo aproximado **~90 caracteres totales** por supertexto (en 1 o 2 líneas).

TIPOS DE SUPERTEXTO (usa SOLO estos 8 tipos):

- **title**: TÍTULO - Representa la idea central de un segmento. Es el tipo MÁS FRECUENTE: cada vez que el profesor cambia de subtema, introduce una nueva idea o abre un nuevo bloque, eso es un título. Cuando acompaña bullets, actúa como contenedor de la lista. Si los bullets están muy distanciados entre sí (con mucho desarrollo entre cada uno), NO son bullets: cada uno debe convertirse en su propio título. En caso de duda entre title y highlight, SIEMPRE elige title.

- **bullet**: BULLET - Elemento de una lista o enumeración corta y continua.
  REGLAS ABSOLUTAS:
  1. Un bullet NUNCA puede estar solo. Si un group tiene un solo bullet → cámbialo a title.
  2. Los bullets de un grupo deben estar CERCA en tiempo: máximo ~15 segundos entre el primero y el último. Si hay >15s de distancia o hay títulos de desarrollo entre medio, NO son bullets - cada concepto es un title independiente.
  3. NO inventes enumeración. Si el profesor NO dice explícitamente "primero... segundo..." o "hay tres cosas...", NO numeres ni agrupes. Si el profesor menciona un concepto, desarrolla durante 30 segundos, y luego menciona otro concepto, esos son dos títulos, no dos bullets de una lista.
  4. Un buen bullet es corto. Un bullet largo es un mal bullet.
  Revisa tu respuesta antes de enviarla: verifica que cada group tiene ≥2 bullets Y que todos están dentro de ~15s.

- **step**: STEP - SOLO para acciones procedimentales concretas donde el alumno debe hacer algo específico en una herramienta, software o interfaz. Ej: "Vamos a la carpeta X, en el directorio XXXX", "Abre Premiere y dale click en Exportar". Si el profesor enumera conceptos, consejos o ideas ("Describir quién es tu audiencia, qué decisión necesita tomar"), eso NO es step - es title+bullets o titles independientes. Step implica que el alumno EJECUTA una acción, no que ENTIENDE un concepto.

- **definition**: DEFINICIÓN - Complementa información sobre un concepto que el profesor introduce pero NO explica. Se usa ÚNICAMENTE cuando el profesor introduce un término sin explicarlo. Si el profesor ya lo explicó, NO se genera definition. Incluye un campo `"term"` con el nombre del concepto (desglose de siglas si aplica) y en `"text"` SOLO la definición (significado, forma común, traducción si es inglés). El `term` se mostrará como título visual y `text` como cuerpo — NO incluyas el término dentro de `text`. Estilo conciso, breve, sintetizado - NO es transcripción del profesor.

- **data**: DATO - Captura datos concretos y objetivos mencionados en clase. Información cuantitativa u objetiva, numérica o no numérica: porcentajes, estadísticas, fuentes, "datos duros". Debe estar sintetizada (NO transcripción literal) y debe leerse bien por sí solo.

- **highlight**: HIGHLIGHT - TIPO ESCASO (máximo 2-4 por clase de 5 min). Solo para la regla de oro, la frase definitoria o la conclusión que el profesor repite textualmente o martilla con énfasis excepcional. NO es lo mismo que una idea central de segmento (eso es title). Un highlight debe pasar este filtro: ¿El profesor literalmente repite esta frase, o la marca como "la regla más importante"? Si no, es title. Formato: una palabra o una oración, NUNCA un párrafo. Validación: si se juntaran todos los highlights de una clase, deberían ser las 2-4 frases que el alumno recordaría al día siguiente.

- **summary**: RESUMEN - Resumen sintetizado del aprendizaje de la clase. Solo aplica si la clase tiene un cierre y el profesor lo menciona. NO es transcripción directa del cierre. Debe representar, de forma sintetizada, lo que el alumno debió aprender en la clase.

- **question**: PREGUNTA - Cualquier frase formulada como pregunta directa por el profesor (con signos ¿...?). Incluye preguntas retóricas, transicionales, de reflexión o interpelación. Si el profesor lo dice como pregunta, es question. Máximo 3-5 por clase. El texto debe incluir siempre los signos ¿...? Ej: "¿Cuándo fue la última vez que deployaste?", "¿Cómo saber qué quiere\nmi audiencia?"

NO uses otros tipos fuera de estos 8.

AGRUPACIÓN (campo 'group') — DETECCIÓN EXHAUSTIVA DE LISTAS:
- Usa 'group' SOLO cuando el profesor enumera una lista REAL, ya sea:
  · Explícita con número: “hay tres cosas…”, “cuatro pasos…”, “cinco errores…”
  · Inline por comas: “contexto, hallazgo, interpretación y acción” → SON 4 BULLETS, no 2
  · Secuencial: “lo primero… lo segundo… lo tercero…”
- **REGLA CRÍTICA DE DISTANCIA**: los bullets de un grupo deben estar CERCA en tiempo. Si entre un bullet y el siguiente hay >15 segundos o hay títulos de desarrollo entre medio, NO son bullets. Cada uno debe ser un title independiente.
- **NO INVENTES ENUMERACIÓN**: solo numera si el profesor lo hace explícitamente. Si el profesor habla de un tema, lo desarrolla durante 30 segundos, y luego habla de otro tema, esos son DOS TITLES, no dos bullets de una lista inventada. No fabriques estructura de lista donde no existe.
- Si el profesor dice “A, B, C y D” de corrido, TODOS los elementos deben aparecer como bullets separados.
- Un title corto + cada elemento como bullet con el mismo 'group'
- Cada bullet del grupo es un item separado en el JSON
- El 'time' de cada bullet debe coincidir con el momento en que el profesor DICE ese elemento
- Items fuera de lista enumerada NO llevan 'group'

RITMO Y CANTIDAD (cobertura máxima, no cuota baja):
- **Filosofía: si el profesor lo dice y aporta, merece un supertexto.** No te limites a "momentos clave" aislados - acompaña el discurso de forma continua, como subtítulos pedagógicos enriquecidos.
- Los supertextos no son transcripciones literales, sino refuerzos visuales - equivalentes a un resaltado tipográfico en un impreso: resaltan ideas, no compiten con los subtítulos.
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
- Duración típica de un supertexto: **5-15 s** (el suficiente para leerlo cómodamente)
- Para grupos/listas: todos los bullets comparten el mismo endTime (salen juntos)

Responde ÚNICAMENTE con JSON válido, SIN markdown.

FORMATO:
{"supertexts":[{"time":10.0,"endTime":20.0,"text":"Configuración del agente","type":"title","importance":"high","reason":"Nuevo tema"},{"time":25.0,"endTime":35.0,"term":"API","text":"Application Programming\nInterface \u2014 interfaz de programaci\u00f3n","type":"definition","importance":"high","reason":"T\u00e9rmino t\u00e9cnico nuevo"},{"time":43.5,"endTime":55.0,"text":"3 escenarios en Meta","type":"title","importance":"high","reason":"Título de la lista","group":"escenarios-meta"},{"time":44.0,"endTime":55.0,"text":"No gasta","type":"bullet","importance":"high","reason":"Primer escenario","group":"escenarios-meta"},{"time":47.0,"endTime":55.0,"text":"Gasta sin convertir","type":"bullet","importance":"high","reason":"Segundo escenario","group":"escenarios-meta"},{"time":50.0,"endTime":55.0,"text":"Convierte caro","type":"bullet","importance":"high","reason":"Tercer escenario","group":"escenarios-meta"},{"time":62.0,"endTime":75.0,"text":"Creativo → CTR → CPC → CPA\nTodo empieza desde el creativo","type":"highlight","importance":"high","reason":"Cadena de métricas clave"},{"time":80.0,"endTime":90.0,"text":"¿Qué pasaría si la campaña\nno genera conversiones?","type":"question","importance":"high","reason":"Pregunta formulada por el profesor"},{"time":95.0,"endTime":105.0,"text":"1. Abrir el dashboard","type":"step","importance":"medium","reason":"Primer paso del procedimiento"},{"time":110.0,"endTime":118.0,"text":"openclose.ai","type":"data","importance":"high","reason":"URL oficial"},{"time":120.0,"endTime":130.0,"text":"Tu agente trabaja por ti\nmientras duermes","type":"summary","importance":"high","reason":"Cierre del bloque"}],"summary":"","totalFound":0}
