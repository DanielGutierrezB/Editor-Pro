#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Editor-Pro — Instalar Whisper Large v3
# Descarga el modelo Large v3 (o la versión cuantizada q5_0) para
# máxima calidad de transcripción en español.
# ──────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODEL_DIR="$SCRIPT_DIR"
BASE_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Por defecto: versión cuantizada q5_0 (~1.5 GB), buena calidad y más rápida
# Usa --full para descargar el modelo completo (~3 GB)
USE_FULL=false
if [ "$1" = "--full" ]; then
    USE_FULL=true
fi

if [ "$USE_FULL" = true ]; then
    MODEL_NAME="ggml-large-v3.bin"
    MODEL_SIZE="~3 GB"
else
    MODEL_NAME="ggml-large-v3-q5_0.bin"
    MODEL_SIZE="~1.5 GB"
fi

MODEL_URL="$BASE_URL/$MODEL_NAME"

echo ""
echo "═══════════════════════════════════════════════"
echo "  Editor-Pro — Whisper Large v3"
echo "═══════════════════════════════════════════════"
echo ""

if [ -f "$MODEL_DIR/$MODEL_NAME" ]; then
    SIZE=$(du -h "$MODEL_DIR/$MODEL_NAME" | cut -f1)
    echo -e "${GREEN}✓${NC} $MODEL_NAME ya está instalado ($SIZE)"
    echo ""
    echo "  Editor-Pro usará este modelo en la próxima transcripción."
    echo "═══════════════════════════════════════════════"
    echo ""
    exit 0
fi

echo "Descargando $MODEL_NAME ($MODEL_SIZE)..."
echo "  Fuente: $MODEL_URL"
echo ""

if command -v curl &>/dev/null; then
    curl -L --progress-bar -o "$MODEL_DIR/$MODEL_NAME" "$MODEL_URL"
elif command -v wget &>/dev/null; then
    wget --show-progress -O "$MODEL_DIR/$MODEL_NAME" "$MODEL_URL"
else
    echo -e "${RED}✗${NC} Se necesita curl o wget para descargar."
    exit 1
fi

if [ -f "$MODEL_DIR/$MODEL_NAME" ]; then
    SIZE=$(du -h "$MODEL_DIR/$MODEL_NAME" | cut -f1)
    echo ""
    echo -e "${GREEN}✓${NC} $MODEL_NAME descargado ($SIZE)"
    echo ""
    echo "  Editor-Pro detectará Large v3 automáticamente."
    echo "  Reinicia la extensión o haz clic en actualizar en Ajustes."
    echo "═══════════════════════════════════════════════"
    echo ""
else
    echo -e "${RED}✗${NC} Error al descargar. Comprueba la conexión."
    exit 1
fi
