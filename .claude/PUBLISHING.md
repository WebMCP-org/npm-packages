# Publishing @mcp-b Packages

This document covers the publishing workflow, common issues, and fixes for the @mcp-b npm packages.

## Quick Reference

### Publish a Single Package

```bash
cd packages/<package-name>

# Bump version
pnpm version patch --no-git-tag-version  # or minor/major

# Load npm token and publish
export $(grep -v '^#' ../../.env | xargs)
pnpm publish --access public --no-git-checks
```

### Current Package Versions

| Package | Description |
|---------|-------------|
| `@mcp-b/global` | W3C Web Model Context API polyfill |
| `@mcp-b/transports` | Browser MCP transports (Tab, Iframe, Extension) |
| `@mcp-b/react-webmcp` | React hooks for MCP |
| `@mcp-b/chrome-devtools-mcp` | Chrome DevTools MCP server |
| `@mcp-b/extension-tools` | Chrome Extension API tools |
| `usewebmcp` | Alias for @mcp-b/react-webmcp |

## NPM Authentication

The NPM_TOKEN is stored in `.env` at the repo root. To use it:

```bash
# From any package directory
export $(grep -v '^#' ../../.env | xargs)
pnpm publish --access public --no-git-checks
```

If you see "Access token expired or revoked", the user needs to regenerate their npm token.

## Common Issues & Fixes

### Issue: Published Package Missing Build Files

**Symptom:** Package installs but fails at runtime with "Cannot find module" errors.

**Cause:** The `prepublishOnly` script didn't include the build step.

**Fix:** Ensure `prepublishOnly` includes the build:
```json
"prepublishOnly": "node ../../scripts/validate-publish.js && pnpm run build"
```

### Issue: chrome-devtools-mcp Missing `mcp.js`

**Symptom:**
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../build/vendor/chrome-devtools-frontend/mcp/mcp.js'
```

**Cause:** TypeScript incremental builds don't regenerate `build/node_modules` when files haven't changed, but the build script was deleting `build/vendor` (the renamed version).

**Fix:** The build script must delete the tsbuildinfo file to force full rebuild:
```json
"build": "rm -rf build/vendor build/node_modules build/tsconfig.tsbuildinfo && tsc && node --experimental-strip-types --no-warnings=ExperimentalWarning scripts/post-build.ts"
```

### Issue: `workspace:*` or `catalog:` Not Resolved

**Symptom:** Published package.json contains `"dependency": "workspace:*"` instead of actual version.

**Cause:** Used `npm publish` instead of `pnpm publish`. npm doesn't resolve pnpm protocols.

**Fix:** Always use `pnpm publish`:
```bash
pnpm publish --access public --no-git-checks
```

### Issue: Unclean Git Working Tree

**Symptom:** `ERR_PNPM_GIT_UNCLEAN Unclean working tree`

**Fix:** Use `--no-git-checks` flag:
```bash
pnpm publish --access public --no-git-checks
```

## Zod Version Compatibility

### Version 2.x Packages (Current)

All 2.x versions of @mcp-b packages require **Zod 4**:
- Import from `'zod/v4'`
- Use built-in `z.toJSONSchema()` and `z.fromJSONSchema()`
- Detect Zod schemas via `'_zod' in schema`

### Version 1.x Packages (Legacy)

For users with Zod 3 projects:
- `@mcp-b/global@1.x` - Works with Zod 3
- `@mcp-b/react-webmcp@0.x` - Works with Zod 3

### Why Not Support Both?

Supporting both Zod 3 and 4 would require:
1. Runtime version detection
2. External packages for Zod 3 JSON schema conversion (`zod-to-json-schema`)
3. Different APIs for schema detection (`_def` vs `_zod`)
4. Conditional imports (can't use `zod/v4` with Zod 3)

**Decision:** Keep 1.x for Zod 3 users, 2.x for Zod 4. Users can also use JSON schemas directly (works with any Zod version).

## Package-Specific Notes

### @mcp-b/chrome-devtools-mcp

This package has a complex build process:

1. **TypeScript compiles** `src/` and `node_modules/chrome-devtools-frontend/` to `build/`
2. **Post-build script** (`scripts/post-build.ts`):
   - Creates mock files for i18n, codemirror, Runtime
   - Copies LICENSE files
   - Copies issue description markdown files
   - Renames `build/node_modules` to `build/vendor` (pnpm strips `node_modules` directories)
   - Updates import paths in compiled JS files

**Critical:** The build MUST delete `build/tsconfig.tsbuildinfo` to force full TypeScript rebuild. Otherwise, incremental builds won't regenerate the `build/node_modules` directory that gets renamed to `build/vendor`.

### @mcp-b/global

Provides both ESM and IIFE builds:
- ESM: `dist/index.js`
- IIFE: `dist/index.iife.js` (self-contained, for `<script>` tags)

### usewebmcp

This is just an alias package that re-exports from `@mcp-b/react-webmcp`. When publishing, ensure the underlying package is published first.

## Changesets (Preferred Method)

For coordinated releases across multiple packages:

```bash
# Create a changeset
pnpm changeset

# Apply versions
pnpm changeset version

# Publish all changed packages
pnpm changeset publish
```

## Verifying a Published Package

```bash
# Check what's in the tarball
npm view @mcp-b/<package>@<version> dist.tarball | xargs curl -sL | tar -tzf - | head -30

# Check specific file exists
npm view @mcp-b/<package>@<version> dist.tarball | xargs curl -sL | tar -tzf - | grep "some-file.js"

# Test the package works
npx @mcp-b/chrome-devtools-mcp@latest --help
```

## Troubleshooting Checklist

1. **Build files missing?** Check `prepublishOnly` includes build step
2. **Module not found?** Check if incremental build is stale (delete tsbuildinfo)
3. **Protocol not resolved?** Use `pnpm publish`, not `npm publish`
4. **Auth error?** Export NPM_TOKEN from .env
5. **Version not showing on npm?** Wait 30-60 seconds for propagation
