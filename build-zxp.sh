#!/bin/bash
# ─── Editor-Pro — ZXP Builder ───
# Usage: ./build-zxp.sh [channel]
#   channel: "main" (default, stable) or "workspace-daniel" (dev)
#   Example: ./build-zxp.sh workspace-daniel

set -e

CHANNEL="${1:-main}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Try local node_modules first, then AE-SpellCheck's
ZXPCMD="$SCRIPT_DIR/node_modules/zxp-provider/bin/4.1.1/osx/ZXPSignCmd"
if [ ! -f "$ZXPCMD" ]; then
    ZXPCMD="$(dirname "$SCRIPT_DIR")/AE-SpellCheck/node_modules/zxp-provider/bin/4.1.1/osx/ZXPSignCmd"
fi

OUTPUT_DIR="$SCRIPT_DIR/dist"
CERT_PASS="EditorPro2025"

BUILD="/tmp/_ep_zxp_build"
rm -rf "$BUILD"
mkdir -p "$BUILD/ext"

echo "╔══════════════════════════════════════════╗"
echo "║      Editor-Pro — ZXP Builder            ║"
echo "╚══════════════════════════════════════════╝"
echo ""

if [ ! -f "$ZXPCMD" ]; then
    echo "✗ ZXPSignCmd not found."
    echo "  Run: npm install zxp-sign-cmd (in this folder or AE-SpellCheck)"
    exit 1
fi
chmod +x "$ZXPCMD"

echo "→ Generating self-signed certificate..."
cd "$BUILD"
"$ZXPCMD" -selfSignedCert \
    CO Bogota Codigo EditorPro \
    "$CERT_PASS" \
    "$BUILD/cert.p12"
echo "  ✓ Certificate created"
echo ""

echo "→ Preparing extension files..."
cp -R "$SCRIPT_DIR/CSXS"   "$BUILD/ext/CSXS"
cp -R "$SCRIPT_DIR/client"  "$BUILD/ext/client"
cp -R "$SCRIPT_DIR/host"    "$BUILD/ext/host"
if [ -f "$SCRIPT_DIR/VERSION" ]; then
    cp "$SCRIPT_DIR/VERSION" "$BUILD/ext/VERSION"
    echo "  ✓ VERSION file included ($(cat "$SCRIPT_DIR/VERSION"))"
fi
if [ -d "$SCRIPT_DIR/mogrts" ]; then
    cp -R "$SCRIPT_DIR/mogrts" "$BUILD/ext/mogrts"
    echo "  ✓ MOGRTs bundled ($(ls "$SCRIPT_DIR/mogrts" | wc -l | tr -d ' ') files)"
fi
if [ -d "$SCRIPT_DIR/Prompts" ]; then
    cp -R "$SCRIPT_DIR/Prompts" "$BUILD/ext/Prompts"
fi

# Write current commit SHA so the updater knows what version is installed
CURRENT_SHA=$(git -C "$SCRIPT_DIR" rev-parse HEAD 2>/dev/null || echo "")
if [ -n "$CURRENT_SHA" ]; then
    echo "$CURRENT_SHA" > "$BUILD/ext/.update-sha"
    echo "  ✓ .update-sha written ($CURRENT_SHA)"
fi

# Write update channel so the updater pulls from the right branch
echo "$CHANNEL" > "$BUILD/ext/.update-channel"
echo "  ✓ .update-channel set to: $CHANNEL"

echo "  ✓ Files staged"

echo "→ Packaging ZXP..."
if [ "$CHANNEL" = "main" ]; then
    ZXP_NAME="EditorPro.zxp"
else
    ZXP_NAME="EditorPro-dev.zxp"
fi

"$ZXPCMD" -sign \
    "$BUILD/ext" \
    "$BUILD/$ZXP_NAME" \
    "$BUILD/cert.p12" \
    "$CERT_PASS"
echo "  ✓ ZXP signed"

mkdir -p "$OUTPUT_DIR"
cp "$BUILD/$ZXP_NAME" "$OUTPUT_DIR/$ZXP_NAME"
rm -rf "$BUILD"

SIZE=$(du -h "$OUTPUT_DIR/$ZXP_NAME" | cut -f1)
echo ""
echo "════════════════════════════════════════════"
echo "  Build complete! (channel: $CHANNEL)"
echo ""
echo "  Output: dist/$ZXP_NAME ($SIZE)"
echo ""
echo "  To install:"
echo "  1. Download ZXP Installer: aescripts.com/learn/zxp-installer/"
echo "  2. Drag EditorPro.zxp onto ZXP Installer"
echo "  3. Restart Premiere Pro"
echo "  4. Window → Extensions → Editor-Pro"
echo ""
echo "  If it doesn't appear, run in Terminal:"
echo "    defaults write com.adobe.CSXS.11 PlayerDebugMode 1"
echo "    defaults write com.adobe.CSXS.12 PlayerDebugMode 1"
echo "════════════════════════════════════════════"
