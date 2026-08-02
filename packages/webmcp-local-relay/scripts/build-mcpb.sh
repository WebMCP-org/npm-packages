#!/usr/bin/env bash
set -euo pipefail

# Build an MCPB (Desktop Extension) bundle for webmcp-local-relay.
#
# Uses the standard tsdown build, then stages the dist output alongside
# production node_modules for packaging with `mcpb pack`.
#
# Usage:  pnpm run build:mcpb
# Output: webmcp-local-relay-<version>.mcpb in the package root

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGING_DIR="$PKG_DIR/.mcpb-staging"
RUNTIME_DIR="$STAGING_DIR/runtime"

VERSION=$(node -e "console.log(require('$PKG_DIR/package.json').version)")
OUTPUT_NAME="webmcp-local-relay-${VERSION}.mcpb"

echo "[mcpb] Building webmcp-local-relay v${VERSION}"

# ── 1. Clean ──────────────────────────────────────────────────────────────────
rm -rf "$STAGING_DIR"
rm -f "$PKG_DIR/$OUTPUT_NAME"
mkdir -p "$STAGING_DIR/server"

# ── 2. Build with tsdown ─────────────────────────────────────────────────────
echo "[mcpb] Running tsdown build..."
cd "$PKG_DIR"
pnpm run build

# ── 3. Deploy locked production dependencies ─────────────────────────────────
echo "[mcpb] Deploying production dependencies..."
pnpm --filter @mcp-b/webmcp-local-relay deploy --legacy --prod --frozen-lockfile "$RUNTIME_DIR"
mv "$RUNTIME_DIR/node_modules" "$STAGING_DIR/node_modules"
# Legacy deploy links the workspace package back to the repository. It is not a
# runtime dependency, and leaving it in the archive makes pack recurse forever.
rm "$STAGING_DIR/node_modules/.pnpm/node_modules/@mcp-b/webmcp-local-relay"
rmdir "$STAGING_DIR/node_modules/.pnpm/node_modules/@mcp-b"

# ── 4. Copy server files (runtime JS only, no .d.ts or .map) ─────────────────
echo "[mcpb] Copying server files..."
for f in dist/*.mjs; do
  cp "$f" "$STAGING_DIR/server/"
done
rm -rf "$RUNTIME_DIR"

# ── 5. Manifest with version from package.json ───────────────────────────────
echo "[mcpb] Writing manifest..."
node -e "
  const fs = require('fs');
  const manifest = JSON.parse(fs.readFileSync('$PKG_DIR/manifest.json', 'utf8'));
  manifest.version = '$VERSION';
  fs.writeFileSync('$STAGING_DIR/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
"

# ── 6. Pack ───────────────────────────────────────────────────────────────────
echo "[mcpb] Validating manifest..."
pnpm exec mcpb validate "$STAGING_DIR/manifest.json"
echo "[mcpb] Packing .mcpb bundle..."
pnpm exec mcpb pack "$STAGING_DIR" "$PKG_DIR/$OUTPUT_NAME" 2>&1
rm -rf "$STAGING_DIR"

# ── 7. Report ─────────────────────────────────────────────────────────────────
BUNDLE_SIZE=$(du -sh "$PKG_DIR/$OUTPUT_NAME" | cut -f1)
echo ""
echo "[mcpb] Built: $OUTPUT_NAME ($BUNDLE_SIZE)"
echo ""
echo "Install in Claude Desktop by double-clicking the .mcpb file."
