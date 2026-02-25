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

# ── 3. Copy server files (JS only, no .d.ts or .map) ─────────────────────────
echo "[mcpb] Copying server files..."
for f in dist/*.js; do
  cp "$f" "$STAGING_DIR/server/"
done

# ── 4. Manifest with version from package.json ───────────────────────────────
echo "[mcpb] Writing manifest..."
node -e "
  const fs = require('fs');
  const manifest = JSON.parse(fs.readFileSync('$PKG_DIR/manifest.json', 'utf8'));
  manifest.version = '$VERSION';
  fs.writeFileSync('$STAGING_DIR/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
"

# ── 5. Install production dependencies ────────────────────────────────────────
echo "[mcpb] Installing production dependencies..."

# Resolve catalog: references to real versions for standalone npm install
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('$PKG_DIR/package.json', 'utf8'));
  const catalog = {
    '@modelcontextprotocol/sdk': '1.26.0',
    'zod': '3.25.76'
  };
  const deps = {};
  for (const [name, ver] of Object.entries(pkg.dependencies || {})) {
    deps[name] = ver === 'catalog:' ? (catalog[name] || ver) : ver;
  }
  const minimal = {
    name: 'webmcp-local-relay-mcpb',
    version: '$VERSION',
    private: true,
    type: 'module',
    dependencies: deps
  };
  fs.writeFileSync('$STAGING_DIR/package.json', JSON.stringify(minimal, null, 2) + '\n');
"

cd "$STAGING_DIR"
npm install --production --ignore-scripts --no-audit --no-fund 2>&1 | tail -3
rm -f package-lock.json
cd "$PKG_DIR"

# ── 6. Pack ───────────────────────────────────────────────────────────────────
echo "[mcpb] Packing .mcpb bundle..."
npx --yes @anthropic-ai/mcpb@latest pack "$STAGING_DIR" "$PKG_DIR/$OUTPUT_NAME" 2>&1

# ── 7. Report ─────────────────────────────────────────────────────────────────
BUNDLE_SIZE=$(du -sh "$PKG_DIR/$OUTPUT_NAME" | cut -f1)
echo ""
echo "[mcpb] Built: $OUTPUT_NAME ($BUNDLE_SIZE)"
echo ""
echo "Install in Claude Desktop by double-clicking the .mcpb file."
