# Publishing @mcp-b Packages

This document covers the publishing workflow, common issues, and fixes for the @mcp-b npm packages.

Follow the changeset-first release flow in `../SKILL.md` for normal releases. Use the
direct publish commands below only for troubleshooting or an explicitly approved one-off
publish.

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

| Package                     | Description                                                            |
| --------------------------- | ---------------------------------------------------------------------- |
| `@mcp-b/global`             | W3C Web Model Context API polyfill                                     |
| `@mcp-b/transports`         | Browser MCP transports (Tab, Iframe, Extension)                        |
| `@mcp-b/react-webmcp`       | React hooks for MCP                                                    |
| `@mcp-b/webmcp-local-relay` | Local MCP relay for browser WebMCP tools                               |
| `usewebmcp`                 | Standalone React hooks for document.modelContext (depends on polyfill) |

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

### Version 4.x Packages (Current)

Current packages use MCP TypeScript SDK v2 and support Standard Schema
implementations such as Zod 4.2 or newer. Zod 3 is unsupported. Raw JSON Schema
does not require Zod.

Legacy release lines remain available from npm but are not maintained by the
current workspace.

## Package-Specific Notes

### @mcp-b/global

Provides both ESM and IIFE builds:

- ESM: `dist/index.js`
- IIFE: `dist/index.iife.js` (self-contained, for `<script>` tags)

### usewebmcp

Standalone React hooks package for the Web Model Context Protocol. Registers
tools with `document.modelContext` via the polyfill, with a deprecated
`navigator.modelContext` fallback for older runtimes. This is NOT an alias for
`@mcp-b/react-webmcp` — it is its own package with its own hooks (`useWebMCP`)
that depends on `@mcp-b/webmcp-polyfill`.

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

```

## MCPB Bundles (Claude Desktop Extensions)

Some packages ship as `.mcpb` bundles for one-click Claude Desktop installation. These are ZIP archives built with `@anthropic-ai/mcpb`.

### Which packages have MCPB bundles?

| Package                     | Bundle                              |
| --------------------------- | ----------------------------------- |
| `@mcp-b/webmcp-local-relay` | `webmcp-local-relay-<version>.mcpb` |

### Automated (CI)

MCPB bundles are built and uploaded automatically in the Release workflow (`.github/workflows/changesets.yml`). When changesets publishes a package that has `build:mcpb` script, CI:

1. Runs `pnpm run build:mcpb` in the package directory
2. Uploads the `.mcpb` file to the GitHub release created by changesets

Users download from the [Releases](https://github.com/WebMCP-org/npm-packages/releases) page.

### Manual (Local)

```bash
cd packages/webmcp-local-relay
pnpm run build:mcpb
# Output: webmcp-local-relay-<version>.mcpb

# Upload to an existing release
gh release upload "@mcp-b/webmcp-local-relay@<version>" webmcp-local-relay-<version>.mcpb
```

### Adding MCPB to a new package

1. Create `manifest.json` (see `packages/webmcp-local-relay/manifest.json` for reference)
2. Create `scripts/build-mcpb.sh` build script
3. Create `.mcpbignore` to exclude dev files
4. Add `"build:mcpb": "bash scripts/build-mcpb.sh"` to package.json scripts
5. Add the package name to the `MCPB_PACKAGES` array in `.github/workflows/changesets.yml`

### Key files

| File                    | Purpose                                                      |
| ----------------------- | ------------------------------------------------------------ |
| `manifest.json`         | MCPB extension metadata, server config, user-facing settings |
| `scripts/build-mcpb.sh` | Stages files, resolves catalog deps, packs with `mcpb` CLI   |
| `.mcpbignore`           | Excludes dev files from bundle (like `.npmignore`)           |

### Catalog dependency resolution

The MCPB build resolves pnpm `catalog:` references to real versions before `npm install` in the staging directory. If you add a new `catalog:` dependency, update the catalog map in `scripts/build-mcpb.sh`.

## Troubleshooting Checklist

1. **Build files missing?** Check `prepublishOnly` includes build step
2. **Module not found?** Check if incremental build is stale (delete tsbuildinfo)
3. **Protocol not resolved?** Use `pnpm publish`, not `npm publish`
4. **Auth error?** Export NPM_TOKEN from .env
5. **Version not showing on npm?** Wait 30-60 seconds for propagation
