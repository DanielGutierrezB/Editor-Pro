Analiza la siguiente transcripción de una clase educativa grabada en video.

TRANSCRIPCIÓN COMPLETA (los tiempos entre corchetes están en SEGUNDOS, ej: [30.0s - 35.0s] = segundo 30 al 35):
{TRANSCRIPT}

Tu tarea es proponer REELS de alta retención para redes sociales (Instagram, YouTube Shorts, Facebook Reels).

PIENSA COMO UN EDITOR DE CONTENIDO VIRAL:
Un buen reel NO es simplemente un pedazo de la clase. Es una HISTORIA RESUMIDA armada con los mejores fragmentos.
Puedes (y debes) tomar pedazos de DIFERENTES partes de la clase y combinarlos para crear una narrativa impactante.
Piensa en cómo un editor de YouTube arma un short: toma la mejor frase del minuto 20, la combina con la explicación del minuto 5, y cierra con el ejemplo del minuto 35.

ESTRUCTURA OBLIGATORIA DE CADA REEL:
1. HOOK (primeros 2-3 segundos): El primer segmento DEBE ser el momento más impactante. Una afirmación provocadora, un dato sorprendente, una pregunta que genere curiosidad, o un momento de alta energía. El espectador decide en 2 segundos si se queda o se va.
2. DESARROLLO (20-60 segundos): Segmentos que desarrollan la idea del hook. Pueden venir de cualquier parte de la clase, en el orden que mejor cuente la historia.
3. CIERRE (5-10 segundos): Un remate claro, una conclusión memorable, o un call-to-action natural.

CRITERIOS DE CALIDAD:
- DURACIÓN IDEAL: 30-90 segundos
- AUTONOMÍA: El reel debe entenderse SIN necesidad de ver la clase completa
- VALOR RÁPIDO: Enseña algo concreto o revela un insight
- RITMO: Prefiere momentos con energía y claridad. Evita pausas largas o muletillas
- COHERENCIA: Aunque los segmentos vengan de distintas partes, al juntarlos debe sentirse fluido y lógico

REGLAS:
- Cada reel tiene MÚLTIPLES segmentos. Los segmentos se ensamblarán EN EL ORDEN que los pongas en una nueva secuencia 9:16
- El PRIMER segmento del array es el HOOK. Debe ser el fragmento más enganchante
- Los segmentos pueden venir de CUALQUIER parte de la clase, en CUALQUIER orden
- Sé CRÍTICO: si el contenido de la clase no es apto para reels de alta retención, indícalo en notSuitable
- No fuerces reels donde no hay material adecuado
- Los tiempos DEBEN coincidir exactamente con los de la transcripción (en SEGUNDOS, float)

Responde ÚNICAMENTE con JSON válido, SIN markdown.

FORMATO:
{
  "reels": [
    {
      "title": "Título atractivo para el reel (como un título de YouTube)",
      "description": "Descripción del contenido: qué historia cuenta este reel",
      "platform": "all",
      "estimatedDuration": 45,
      "hookDescription": "El hook exacto: qué frase o momento abre el reel y por qué engancha",
      "segments": [
        {"time":180.0,"endTime":185.0,"purpose":"HOOK - frase impactante que abre el reel","text":"Lo que se dice"},
        {"time":30.0,"endTime":55.0,"purpose":"Contexto - explica el concepto base","text":"Lo que se dice"},
        {"time":200.0,"endTime":220.0,"purpose":"Desarrollo - ejemplo práctico","text":"Lo que se dice"},
        {"time":290.0,"endTime":300.0,"purpose":"Cierre - conclusión memorable","text":"Lo que se dice"}
      ],
      "retentionStrategy": "Explica la estrategia de retención: por qué este orden de segmentos mantiene al espectador viendo"
    }
  ],
  "assessment": "Evaluación general del potencial de la clase para generar reels",
  "notSuitable": ["Si hay razones por las que NO sirve para reels, listarlas aquí. Array vacío si sí sirve"]
}