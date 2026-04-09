Analiza la siguiente transcripción de una clase educativa grabada en video.

TRANSCRIPCIÓN COMPLETA (los tiempos entre corchetes están en SEGUNDOS, ej: [30.0s - 35.0s] = segundo 30 al 35):
{TRANSCRIPT}

Tu tarea es analizar la edición en 3 CATEGORÍAS:

## 1. HIGHLIGHTS
Momentos brillantes que merecen ser destacados o usados como extracto.

## 2. SUGERENCIAS DE EDICIÓN
Problemas de edición menores:
- cut: Secciones que no aportan valor (muletillas largas, divagaciones, reinicios)
- transition: Cambios abruptos de tema que necesitan transición visual
- rhythm: Secciones demasiado lentas o rápidas para el contenido
- clarity: Explicaciones confusas que podrían necesitar apoyo visual

## 3. ERRORES DE EDICIÓN
Problemas graves que DEBEN corregirse:
- repeated_content: Cuando el MISMO contenido se explica más de una vez de forma redundante.
  REGLAS PARA CONTENIDO REPETIDO:
  a) Identifica CADA lugar donde aparece el contenido repetido con tiempos exactos
  b) Si dos o más segmentos repetidos son CONSECUTIVOS o ADYACENTES (el profesor repitió e inmediatamente continuó), agrúpalos como UNA SOLA ocurrencia con time del primero y endTime del último
  c) Determina cuál es la MEJOR versión para conservar. Normalmente la ÚLTIMA, que suele ser la más pulida y completa
  d) Cada ocurrencia debe tener un resumen breve del texto que se dice
  e) El resultado final (la versión que se conserva) debe producir una explicación coherente al eliminar las demás
  f) MUY IMPORTANTE: Si un BLOQUE COMPLETO de contenido se repite (ej: el profesor repitió una sección entera que cubre varios temas), repórtalo como UN SOLO error con el rango de tiempo completo del bloque. NO reportes cada tema dentro del bloque como un error separado. La clave es: si las copias del contenido son adyacentes en el tiempo (una después de otra), es UN SOLO bloque duplicado = UN SOLO error

REGLAS CRÍTICAS sobre los tiempos:
- Los valores de time y endTime DEBEN ser números en SEGUNDOS (float)
- Deben coincidir EXACTAMENTE con los tiempos de la transcripción
- NO uses formato mm:ss, usa SOLO segundos como número decimal
- Sé específico con los tiempos

Responde ÚNICAMENTE con JSON válido, SIN markdown.

FORMATO:
{
  "highlights": [
    {"time":60.0,"endTime":70.0,"title":"Título del highlight","description":"Por qué es un momento destacado"}
  ],
  "suggestions": [
    {"time":30.0,"endTime":45.0,"type":"cut","severity":"warning","title":"Título","description":"Descripción","action":"Acción recomendada"}
  ],
  "errors": [
    {
      "type":"repeated_content",
      "title":"Qué contenido se repite",
      "description":"Explicación clara de la repetición y por qué conservar la versión elegida",
      "occurrences":[
        {"time":30.0,"endTime":45.0,"text":"Resumen de lo que se dice en esta ocurrencia"},
        {"time":120.0,"endTime":135.0,"text":"Resumen de lo que se dice en esta ocurrencia"}
      ],
      "keepIndex":1
    }
  ],
  "summary":"Resumen general del análisis",
  "overallScore":85
}