#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Editor-Pro — Whisper.cpp Local Setup
# Downloads/installs whisper-cli and a GGML model for local
# speech-to-text transcription without needing an API key.
# ──────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODEL_DIR="$SCRIPT_DIR"
MODEL_NAME="ggml-base.bin"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$MODEL_NAME"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "═══════════════════════════════════════════════"
echo "  Editor-Pro — Whisper.cpp Local Setup"
echo "═══════════════════════════════════════════════"
echo ""

# ─── Step 1: Check / Install whisper-cli binary ──────────────

WHISPER_BIN=""

if [ -x "$SCRIPT_DIR/whisper-cli" ]; then
    WHISPER_BIN="$SCRIPT_DIR/whisper-cli"
    echo -e "${GREEN}✓${NC} whisper-cli encontrado en el plugin: $WHISPER_BIN"
elif command -v whisper-cli &>/dev/null; then
    WHISPER_BIN="$(command -v whisper-cli)"
    echo -e "${GREEN}✓${NC} whisper-cli encontrado en el sistema: $WHISPER_BIN"
else
    echo -e "${YELLOW}!${NC} whisper-cli no encontrado."
    echo ""

    if command -v brew &>/dev/null; then
        echo "Homebrew detectado. Instalando whisper-cpp..."
        echo ""
        brew install whisper-cpp
        if command -v whisper-cli &>/dev/null; then
            WHISPER_BIN="$(command -v whisper-cli)"
            echo ""
            echo -e "${GREEN}✓${NC} whisper-cli instalado: $WHISPER_BIN"
        else
            echo -e "${RED}✗${NC} La instalación con brew no generó whisper-cli."
            echo "  Intenta: brew reinstall whisper-cpp"
            exit 1
        fi
    else
        echo "Homebrew no encontrado. Compilando desde fuente..."
        echo ""

        if ! command -v git &>/dev/null || ! command -v cmake &>/dev/null; then
            echo -e "${RED}✗${NC} Se necesita git y cmake para compilar."
            echo "  Instala Xcode CLI tools: xcode-select --install"
            echo "  O instala Homebrew: https://brew.sh"
            exit 1
        fi

        BUILD_DIR="$SCRIPT_DIR/_build"
        mkdir -p "$BUILD_DIR"
        cd "$BUILD_DIR"

        if [ ! -d "whisper.cpp" ]; then
            git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git
        fi

        cd whisper.cpp
        cmake -B build \
            -DWHISPER_BUILD_EXAMPLES=ON \
            -DWHISPER_BUILD_TESTS=OFF \
            -DWHISPER_BUILD_SERVER=OFF \
            -DGGML_METAL=ON \
            -DCMAKE_BUILD_TYPE=Release
        cmake --build build --config Release -j "$(sysctl -n hw.ncpu)"

        cp build/bin/whisper-cli "$SCRIPT_DIR/whisper-cli"
        chmod +x "$SCRIPT_DIR/whisper-cli"
        WHISPER_BIN="$SCRIPT_DIR/whisper-cli"

        cd "$SCRIPT_DIR"
        rm -rf "$BUILD_DIR"

        echo ""
        echo -e "${GREEN}✓${NC} whisper-cli compilado: $WHISPER_BIN"
    fi
fi

# ─── Step 2: Download model ──────────────────────────────────

echo ""

if [ -f "$MODEL_DIR/$MODEL_NAME" ]; then
    SIZE=$(du -h "$MODEL_DIR/$MODEL_NAME" | cut -f1)
    echo -e "${GREEN}✓${NC} Modelo encontrado: $MODEL_NAME ($SIZE)"
else
    echo "Descargando modelo $MODEL_NAME (~142 MB)..."
    echo "  Fuente: $MODEL_URL"
    echo ""

    if command -v curl &>/dev/null; then
        curl -L --progress-bar -o "$MODEL_DIR/$MODEL_NAME" "$MODEL_URL"
    elif command -v wget &>/dev/null; then
        wget --show-progress -O "$MODEL_DIR/$MODEL_NAME" "$MODEL_URL"
    else
        echo -e "${RED}✗${NC} Se necesita curl o wget para descargar el modelo."
        exit 1
    fi

    if [ -f "$MODEL_DIR/$MODEL_NAME" ]; then
        SIZE=$(du -h "$MODEL_DIR/$MODEL_NAME" | cut -f1)
        echo ""
        echo -e "${GREEN}✓${NC} Modelo descargado: $MODEL_NAME ($SIZE)"
    else
        echo -e "${RED}✗${NC} Error al descargar el modelo."
        exit 1
    fi
fi

# ─── Step 3: Quick test ──────────────────────────────────────

echo ""
echo "Verificando instalación..."
"$WHISPER_BIN" --help &>/dev/null && echo -e "${GREEN}✓${NC} whisper-cli funciona correctamente" || echo -e "${YELLOW}!${NC} whisper-cli no respondió al --help"

# ─── Done ─────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════"
echo -e "  ${GREEN}Setup completo${NC}"
echo ""
echo "  Binario: $WHISPER_BIN"
echo "  Modelo:  $MODEL_DIR/$MODEL_NAME"
echo ""
echo "  Editor-Pro detectará whisper.cpp"
echo "  automáticamente la próxima vez que transcribas."
echo ""
echo "  Para mejor calidad, instala Whisper Large v3:"
echo "  bash '$SCRIPT_DIR/install-whisper-large-v3.sh'"
echo "═══════════════════════════════════════════════"
echo ""
