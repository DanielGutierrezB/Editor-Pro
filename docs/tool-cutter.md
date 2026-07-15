# ✂️ Cortes Automáticos

## Qué hace
Lee los marcadores de la secuencia activa, identifica bloques de contenido (IN/OUT), y ejecuta cortes automáticos con backup.

## Flujo Principal

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
│  Usuario │     │   Leer       │     │   Revisar    │     │  Ejecutar│
│  click   │────►│  Marcadores  │────►│   Bloques    │────►│  Cortes  │
│          │     │              │     │              │     │          │
└──────────┘     └──────┬───────┘     └──────┬───────┘     └────┬─────┘
                        │                     │                  │
                        ▼                     ▼                  ▼
                 getSequenceMarkers()   UI: bloques keep/    backup →
                 → host/sequence-info  remove con tiempos   executeCuts()
                   .jsx                 + estadísticas       → host/cutter.jsx
```

## Flujo Detallado

```
1. LECTURA DE MARCADORES
   │
   ├─ evalScript("getSequenceMarkers()")
   ├─ Parsear marcadores: detectar pares IN/OUT
   ├─ "OUT:" en comentario = fin de bloque
   ├─ Opción: ignorar primer marcador (claqueta)
   │
   ▼
2. VISUALIZACIÓN
   │
   ├─ Summary bar: duración keep / duración remove / comentarios
   ├─ Block list: cada bloque con tiempo, tipo (keep/remove), color
   ├─ Click en bloque → navega al punto en timeline
   ├─ Warnings: bloques muy cortos, overlaps, etc.
   │
   ▼
3. EJECUCIÓN
   │
   ├─ Diálogo de confirmación
   ├─ backupSequence() → copia de seguridad
   ├─ executeCuts(jsonPath) → procesa de FIN a INICIO
   │   ├─ Método 1: Set In/Out + QE extractEdit()
   │   ├─ Fallback: QE player methods
   │   ├─ Fallback: DOM sequence methods
   │   └─ Fallback: Razor + trim manual
   ├─ Sleep 800ms entre operaciones (estabilidad Premiere)
   │
   ▼
4. POST-CORTE
   │
   ├─ Resultado: zonas cortadas, duración eliminada
   ├─ Botón "Restaurar Backup" disponible
   └─ Marker Manager: editar/eliminar marcadores restantes
```

## Batch Mode

```
┌────────────┐     ┌───────────────┐     ┌───────────────┐
│ Analizar   │     │  Seleccionar  │     │  Cortar       │
│ Todas      │────►│  secuencias   │────►│  secuencias   │
└────────────┘     └───────────────┘     └───────┬───────┘
                                                  │
      ┌───────────────────────────────────────────┘
      │
      ▼  Para cada secuencia:
      ├─ openSequenceById()
      ├─ getSequenceMarkers()
      ├─ Mostrar bloques en UI
      ├─ backupSequence()
      ├─ executeCuts()
      ├─ Log de resultado
      └─ Siguiente secuencia...

Post-batch:
├─ Resumen de todas las secuencias
├─ "Restaurar todas" disponible
└─ Log copiable
```

## View Mapping (Activar/Desactivar Clips)

```
POST-CORTE → Marker Manager → View Mapping

1. Asignar marcadores como CAM o PC
2. Seleccionar track CAM (ej: V1) y track PC (ej: V2)
3. activateViews(jsonPath) → host/sequence-info.jsx
   ├─ Habilita clips en el track correcto
   └─ Deshabilita clips en el track incorrecto
```

## Presets de Vista

- Las vistas mapeadas se guardan como presets en `localStorage`
  (`editorpro_view_presets`).
- Notas de Grabación (Paso 7) genera automáticamente el preset
  "Auto (Notas de Grabación)" a partir de la clasificación CAM/PC.

## Archivos

| Archivo | Rol |
|---------|-----|
| `client/js/cutter.js` | UI + lógica completa (marcadores, batch, vistas, presets) |
| `host/cutter.jsx` | executeCuts, trimZoneOnTrack |
| `host/sequence-info.jsx` | getSequenceMarkers, getVideoTrackNames, getVideoClipPaths, activateViews |
| `host/backup.jsx` | backupSequence, restoreBackup, restoreBackupById |
| `host/marker-ops.jsx` | limpieza/colorización de marcadores post-corte |
| `host/sequence-discovery.jsx` | listado/navegación multi-secuencia (batch) |
| `client/css/cutter.css` | Estilos |
