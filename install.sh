#!/bin/bash
# ─── Editor-Pro — Installer for Premiere Pro ───

set -e

EXTENSION_ID="com.codigo.editorpro"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ "$OSTYPE" == "darwin"* ]]; then
    TARGET="$HOME/Library/Application Support/Adobe/CEP/extensions/$EXTENSION_ID"
    for v in 9 10 11 12; do
        defaults write com.adobe.CSXS.$v PlayerDebugMode 1 2>/dev/null || true
    done
    echo "✓ PlayerDebugMode habilitado"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    TARGET="$APPDATA/Adobe/CEP/extensions/$EXTENSION_ID"
    for v in 9 10 11 12; do
        reg add "HKCU\Software\Adobe\CSXS.$v" /v PlayerDebugMode /t REG_SZ /d 1 /f 2>/dev/null || true
    done
    echo "✓ PlayerDebugMode habilitado"
else
    echo "✗ Sistema operativo no soportado: $OSTYPE"
    exit 1
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║        Editor-Pro — Installer            ║"
echo "╚══════════════════════════════════════════╝"
echo ""

if [ -d "$TARGET" ]; then
    rm -rf "$TARGET"
    echo "  ✓ Instalación anterior eliminada"
fi

ln -s "$SCRIPT_DIR" "$TARGET"
echo "  ✓ Extension vinculada: $TARGET"
echo ""
echo "  Reinicia Premiere Pro y busca:"
echo "  Window → Extensions → Editor-Pro"
echo ""
