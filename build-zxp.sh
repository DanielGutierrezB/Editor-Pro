#!/bin/bash
# ─── Editor-Pro — ZXP Builder ───

set -e

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
if [ -d "$SCRIPT_DIR/Prompts" ]; then
    cp -R "$SCRIPT_DIR/Prompts" "$BUILD/ext/Prompts"
fi

# Motion-Pro server (without node_modules — user runs npm install)
mkdir -p "$BUILD/ext/motion-server"
cp "$SCRIPT_DIR/motion-server/package.json" "$BUILD/ext/motion-server/"
cp "$SCRIPT_DIR/motion-server/server.js"    "$BUILD/ext/motion-server/"
cp -R "$SCRIPT_DIR/motion-server/routes"    "$BUILD/ext/motion-server/routes"
cp -R "$SCRIPT_DIR/motion-server/lib"       "$BUILD/ext/motion-server/lib"
if [ -d "$SCRIPT_DIR/motion-server/public" ]; then
    cp -R "$SCRIPT_DIR/motion-server/public" "$BUILD/ext/motion-server/public"
fi

# Motion-Pro Remotion project (without node_modules and generated files)
mkdir -p "$BUILD/ext/motion-render/src/components" "$BUILD/ext/motion-render/src/compositions"
cp "$SCRIPT_DIR/motion-render/package.json"      "$BUILD/ext/motion-render/"
cp "$SCRIPT_DIR/motion-render/tsconfig.json"      "$BUILD/ext/motion-render/"
cp "$SCRIPT_DIR/motion-render/remotion.config.ts" "$BUILD/ext/motion-render/"
cp "$SCRIPT_DIR/motion-render/src/index.ts"       "$BUILD/ext/motion-render/src/"
# Clean Root.tsx (no generated compositions)
cat > "$BUILD/ext/motion-render/src/Root.tsx" << 'ROOTEOF'
import React from 'react';
import { Composition } from 'remotion';
// === DYNAMIC IMPORTS START ===
// === DYNAMIC IMPORTS END ===

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* === DYNAMIC COMPOSITIONS START === */}
      {/* === DYNAMIC COMPOSITIONS END === */}
    </>
  );
};
ROOTEOF
cp "$SCRIPT_DIR/motion-render/src/components/"*.ts  "$BUILD/ext/motion-render/src/components/" 2>/dev/null || true
cp "$SCRIPT_DIR/motion-render/src/components/"*.tsx "$BUILD/ext/motion-render/src/components/" 2>/dev/null || true

# Write current commit SHA so the updater knows what version is installed
CURRENT_SHA=$(git -C "$SCRIPT_DIR" rev-parse HEAD 2>/dev/null || echo "")
if [ -n "$CURRENT_SHA" ]; then
    echo "$CURRENT_SHA" > "$BUILD/ext/.update-sha"
    echo "  ✓ .update-sha written ($CURRENT_SHA)"
fi

echo "  ✓ Files staged (including Motion-Pro)"

echo "→ Packaging ZXP..."
"$ZXPCMD" -sign \
    "$BUILD/ext" \
    "$BUILD/EditorPro.zxp" \
    "$BUILD/cert.p12" \
    "$CERT_PASS"
echo "  ✓ ZXP signed"

mkdir -p "$OUTPUT_DIR"
cp "$BUILD/EditorPro.zxp" "$OUTPUT_DIR/EditorPro.zxp"
rm -rf "$BUILD"

SIZE=$(du -h "$OUTPUT_DIR/EditorPro.zxp" | cut -f1)
echo ""
echo "════════════════════════════════════════════"
echo "  Build complete!"
echo ""
echo "  Output: dist/EditorPro.zxp ($SIZE)"
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
