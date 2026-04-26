# 🎙️ Notas de Grabación

## Qué hace
Pipeline completo de 7 pasos para procesar grabaciones en bruto: desde el audio hasta el corte final con clasificación de vistas.

## Pipeline Visual

```
┌─────┐   ┌─────┐   ┌─────┐   ┌─────┐   ┌─────┐   ┌─────┐   ┌─────┐
│  1  │──►│  2  │──►│  3  │──►│  4  │──►│  5  │──►│  6  │──►│  7  │
│Audio│   │Trans│   │Tomas│   │ IA  │   │Mark.│   │Corte│   │Vista│
└─────┘   └─────┘   └─────┘   └─────┘   └─────┘   └─────┘   └─────┘
  │          │          │         │          │         │         │
  ▼          ▼          ▼         ▼          ▼         ▼         ▼
Cargar    Whisper    Detectar  Validar   Colocar   Backup+   Clasificar
o export  ElevenLabs IN/OUT    continui- IN/OUT    cortar    CAM vs PC
audio     Whisper    por       dad con   en la     la        con IA
          API/local  pausas    IA        secuencia secuencia de visión
```

## Paso 1: Audio

```
┌──────────────────────────┐
│    Cargar Audio           │
│                           │
│  [📁 Cargar Audio]        │◄── MP3, WAV, M4A, FLAC
│  [📤 Exportar de Secuencia]◄── exportSequenceAudio()
│  [✕ Limpiar]              │    → WAV desde Premiere
│                           │
│  Estado: test_25-04-26.wav│
│  Tamaño: 45.2 MB          │
└──────────────────────────┘
```

## Paso 2: Transcripción

```
Audio cargado
         │
         ▼
Click "Transcribir"
         │
    ┌────┴────┐
    ▼         ▼
ElevenLabs  Whisper
Scribe      (local o API)
    │         │
    └────┬────┘
         │
         ▼
SpeechToText.transcribe(audioPath)
         │
         ├─ Resultado: { words: [{text, start, end}], text, language }
         ├─ Generar SRT agrupado (~8 palabras/línea)
         ├─ Guardar en Transcribe/ junto al proyecto
         │
         ▼
Transcript preview (clickeable → navega en timeline)

Alternativas:
├─ "Cargar SRT" → archivo .srt existente
├─ "Traer de secuencia" → captions de Premiere
└─ "Cargar JSON" → export de Premiere Text Panel
```

## Paso 3: Detección de Tomas

```
Transcript cargado
         │
         ▼
RecordingNotes.detectTakes(sttResult)
         │
         ├─ Analiza el audio/transcript para detectar:
         │
         │   "IN" triggers (inicio de toma):
         │   └─ Pausa > 2s seguida de contenido
         │
         │   "OUT" triggers (fin de toma):
         │   ├─ Palabras clave: "corte", "corta", "alto", "para", "pausa"
         │   └─ Pausa larga > 3s
         │
         ▼
┌─────────────────────────────────┐
│  Mantener: 15:30 (8 bloques)   │
│  Eliminar: 4:20  (7 zonas)     │
│  Detecciones: 15 IN/OUT        │
│                                  │
│  ✅ Toma 1  [0:00 - 2:15]      │
│  ❌ Pausa   [2:15 - 2:45]      │
│  ✅ Toma 2  [2:45 - 5:30]      │
│  ❌ "corte" [5:30 - 5:35]      │
│  ...                             │
└─────────────────────────────────┘
```

## Paso 4: Revisión IA (Opcional)

```
Tomas detectadas
         │
         ▼
Click "Revisar con IA"
         │
         ▼
AIAnalyzer.analyzeSupplementary(activeSegments, inactiveSegments)
         │
         ├─ IA compara contenido de tomas activas vs inactivas
         ├─ Detecta: contenido único en zonas "eliminadas"
         ├─ Detecta: "tomas ocultas" fuera de los triggers
         │
         ▼
Sugerencias:
├─ "Toma 3 contiene definición única — no cortar"
├─ "Segmento 5:35-5:40 tiene contenido nuevo en zona OUT"
└─ [Aplicar ajustes IA] → modifica los marcadores IN/OUT
```

## Paso 5: Marcadores

```
Click "Colocar Marcadores"
         │
         ▼
Escribir JSON con marcadores → addMarkersFromFile(path, seqId)
         │
         ├─ Marcadores [RN] IN color verde (0)
         ├─ Marcadores [RN] OUT color rojo (3)
         ├─ Marcadores IA aceptados color azul (6)
         │
         ▼
Marcadores visibles en la timeline de Premiere
Re-colocar limpia los anteriores automáticamente
```

## Paso 6: Cortar Secuencia

```
Click "Cortar Secuencia"
         │
         ▼
openBackupAndCut(seqId, cutsFilePath)  ← host/recording.jsx
         │
         ├─ 1. Abrir secuencia por ID
         ├─ 2. Crear backup (copia de secuencia)
         ├─ 3. Ejecutar cortes (mismo engine que Cortes Automáticos)
         │
         ▼
Resultado + botón "Restaurar backup"
```

## Paso 7: Vistas (Clasificación CAM/PC)

```
Después de cortar
         │
         ▼
Click "Clasificar Vistas"
         │
         ▼
Para cada toma activa:
         │
         ├─ FFmpeg: extraer 3 frames (inicio, medio, final)
         ├─ Convertir a base64
         ├─ Enviar a Ollama con modelo de visión
         │   (moondream / llava / llama3.2-vision)
         ├─ Respuesta: "CAM" o "PC"
         │
         ▼
┌─────────────────────────────────┐
│  Resultados: 5 CAM, 3 PC       │
│                                  │
│  Toma 1: 📷 CAM  [cambiar]     │
│  Toma 2: 💻 PC   [cambiar]     │
│  Toma 3: 📷 CAM  [cambiar]     │
│                                  │
│  Track CAM: [V1 ▾]              │
│  Track PC:  [V2 ▾]              │
│  [Aplicar Vistas]                │
└─────────────────────────────────┘
         │
         ▼
Click "Aplicar Vistas"
         │
         ├─ Etiquetar marcadores: [RN] [CAM] Toma 1...
         ├─ Generar preset de vista para Cortes Automáticos
         └─ activateViews() → habilitar/deshabilitar clips por track
```

## Archivos

| Archivo | Rol |
|---------|-----|
| `ui-recording.js` | UI de los 7 pasos (2,550 líneas) |
| `recording-notes.js` | Detección de tomas IN/OUT (738 líneas) |
| `speech-to-text.js` | STT multi-proveedor (933 líneas) |
| `host/recording.jsx` | exportSequenceAudio, openBackupAndCut |
| `host/common.jsx` | activateViews, backupSequence |
| `css/recording.css` | Estilos (704 líneas) |
