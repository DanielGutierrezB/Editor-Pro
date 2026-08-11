#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Editor-Pro — Whisper MLX (Apple Silicon) Setup
# Crea un venv dedicado e instala mlx-whisper para transcripción
# local acelerada en Metal (Macs M-series). Produce timestamps por
# palabra reales, ~15-20x tiempo real en un M3.
#
# El plugin detecta automáticamente el binario en:
#   ~/.editorpro/mlx-whisper-venv/bin/mlx_whisper
# ──────────────────────────────────────────────────────────────

set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

VENV="$HOME/.editorpro/mlx-whisper-venv"
MODEL="mlx-community/whisper-large-v3-turbo"

echo ""
echo "═══════════════════════════════════════════════"
echo "  Editor-Pro — Whisper MLX Setup (Apple Silicon)"
echo "═══════════════════════════════════════════════"
echo ""

# ─── Verificar Apple Silicon ─────────────────────────────────
if [ "$(uname -s)" != "Darwin" ] || [ "$(uname -m)" != "arm64" ]; then
    echo -e "${RED}✗${NC} MLX solo funciona en Mac con Apple Silicon (arm64)."
    echo "   Usa whisper/setup-whisper.sh (whisper.cpp) en su lugar."
    exit 1
fi

# ─── Elegir Python (3.12 recomendado para wheels de mlx) ─────
PY=""
for cand in python3.12 python3.11 python3.13 /opt/homebrew/bin/python3.12 python3; do
    if command -v "$cand" &>/dev/null; then PY="$cand"; break; fi
done
if [ -z "$PY" ]; then
    echo -e "${RED}✗${NC} No se encontró Python 3. Instala con: brew install python@3.12"
    exit 1
fi
echo -e "${GREEN}✓${NC} Python: $($PY --version) ($PY)"

# ─── Crear venv ──────────────────────────────────────────────
mkdir -p "$HOME/.editorpro"
if [ ! -d "$VENV" ]; then
    echo "Creando venv en $VENV ..."
    "$PY" -m venv "$VENV"
fi

# ─── Instalar mlx-whisper ────────────────────────────────────
echo "Instalando mlx-whisper (puede tardar la primera vez)..."
"$VENV/bin/pip" install --upgrade pip -q
"$VENV/bin/pip" install -q mlx-whisper

VER=$("$VENV/bin/pip" show mlx-whisper | awk '/^Version/{print $2}')
echo -e "${GREEN}✓${NC} mlx-whisper $VER instalado"

# ─── Pre-descargar el modelo (opcional pero recomendado) ─────
echo ""
echo "Pre-descargando modelo $MODEL (~1.5 GB, solo la primera vez)..."
"$VENV/bin/python" - <<PY || echo -e "${YELLOW}!${NC} El modelo se descargará en el primer uso."
from huggingface_hub import snapshot_download
snapshot_download("$MODEL")
print("modelo en cache")
PY

echo ""
echo "═══════════════════════════════════════════════"
echo -e "  ${GREEN}Setup completo${NC}"
echo ""
echo "  Binario: $VENV/bin/mlx_whisper"
echo "  Modelo:  $MODEL"
echo ""
echo "  En el panel: Ajustes → Speech-to-Text → \"Whisper Local\"."
echo "  Editor-Pro usará MLX automáticamente en este Mac."
echo "═══════════════════════════════════════════════"
echo ""
