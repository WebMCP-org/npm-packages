# Release Skill for @mcp-b Packages

Publish packages from this monorepo to npm. Uses `pnpm publish -r` for automatic topological ordering so dependencies are always published before dependents.

## When to Use This Skill

- Publishing new package versions to npm
- Creating changesets for version bumps
- Beta/canary/preview releases
- Troubleshooting failed publishes or dependency chain issues

## How Publishing Works in This Monorepo

All internal dependencies use `"workspace:*"` in package.json. When `pnpm publish` runs, it resolves `workspace:*` to the **current local version** of that dependency. This means:

- Versions must be bumped locally BEFORE publishing
- `pnpm publish -r` publishes in **topological order** automatically (dependencies before dependents)
- Since all local versions are already bumped, every `workspace:*` resolves to the correct new version

**The key insight**: Changesets bumps all versions locally, then `pnpm publish -r` handles the correct publish order. These two tools are designed to work together.

**Never use `npm publish`** — only pnpm resolves `workspace:*` and `catalog:` protocols.

## Standard Release Workflow (Recommended)

### Option A: Changesets + Recursive Publish (Preferred)

```bash
# 1. Validate everything passes
pnpm build && pnpm typecheck && pnpm check && pnpm test:unit

# 2. Create changesets (interactive — select packages, bump type, description)
pnpm changeset

# 3. Apply version bumps to all affected packages (including dependents)
pnpm changeset version

# 4. Review what changed
git diff packages/*/package.json

# 5. Ensure npm auth is available
npm whoami  # Must be logged in
export $(grep -v '^#' .env | xargs)  # Load NPM_TOKEN

# 6. Publish ALL changed packages in topological order
pnpm publish -r --access public --no-git-checks

# 7. Verify the dependency chain
pnpm run verify:published  # Or use manual verification commands below

# 8. Commit and push
git add .
git commit -m "chore(release): publish packages"
git push origin main
```

### Option B: CI-Driven (Fully Automated)

1. `pnpm changeset` — create changeset locally
2. `git add .changeset/ && git commit && git push`
3. CI creates a "Version Packages" PR with bumped versions and changelogs
4. Merge the PR — CI runs `pnpm publish -r` automatically

### Option C: Manual Version Bump + Recursive Publish

When you need to bypass changesets (hotfix, emergency release):

```bash
# 1. Validate
pnpm build && pnpm typecheck && pnpm check && pnpm test:unit

# 2. Bump versions manually (edit package.json files directly)
# Bump ALL packages that changed, PLUS any downstream dependents

# 3. Auth
npm whoami
export $(grep -v '^#' .env | xargs)

# 4. Publish in topological order
pnpm publish -r --access public --no-git-checks

# 5. Verify and commit
git add packages/*/package.json
git commit -m "chore(release): publish <packages>"
git push origin main
```

## Publishing a Single Package

If only ONE package changed and it has NO downstream dependents that need updating:

```bash
export $(grep -v '^#' .env | xargs)
pnpm publish --filter @mcp-b/<package-name> --access public --no-git-checks
```

**WARNING**: If the package is a dependency of other packages (check the dependency graph below), you MUST also republish the dependents or their `workspace:*` references will be stale. In most cases, just use `pnpm publish -r` instead — it only publishes packages whose versions aren't yet on npm.

## Complete Dependency Graph

```
@mcp-b/webmcp-types          (no internal deps)
@mcp-b/smart-dom-reader      (no internal deps)
@mcp-b/webmcp-local-relay    (no internal deps)
@mcp-b/chrome-devtools-mcp   (no internal deps)

@mcp-b/webmcp-polyfill       → webmcp-types
@mcp-b/webmcp-ts-sdk         → webmcp-polyfill, webmcp-types
@mcp-b/transports            → webmcp-ts-sdk
@mcp-b/extension-tools       → smart-dom-reader, webmcp-ts-sdk
@mcp-b/mcp-iframe            → transports, webmcp-ts-sdk, webmcp-types
@mcp-b/global                → transports, webmcp-polyfill, webmcp-ts-sdk, webmcp-types
@mcp-b/react-webmcp          → global, transports, webmcp-polyfill, webmcp-ts-sdk, webmcp-types
usewebmcp                    → webmcp-polyfill, webmcp-types
```

**Important**: `usewebmcp` is a standalone package with its own `useWebMCP` hook. It depends on the polyfill directly. It is NOT an alias for `@mcp-b/react-webmcp`.

### Topological Publish Order (for reference)

`pnpm publish -r` handles this automatically. This is documented here only so you understand the order and can debug issues.

```
Tier 0 (no internal deps):
  @mcp-b/webmcp-types, @mcp-b/smart-dom-reader

Tier 1 (← Tier 0):
  @mcp-b/webmcp-polyfill

Tier 2 (← Tier 1):
  @mcp-b/webmcp-ts-sdk

Tier 3 (← Tier 2):
  @mcp-b/transports

Tier 4 (← Tier 3):
  @mcp-b/extension-tools, @mcp-b/mcp-iframe, @mcp-b/global

Tier 5 (← Tier 4):
  @mcp-b/react-webmcp, usewebmcp

Independent (no internal deps):
  @mcp-b/webmcp-local-relay, @mcp-b/chrome-devtools-mcp
```

## Why `pnpm publish -r` Prevents Stale Chains

When publishing manually one-by-one with `--filter`, you risk publishing a dependent before its dependency's new version is live. The dependent's `workspace:*` resolves to the LOCAL version (which is correct), but if an earlier package in the chain wasn't published yet, consumers pulling from npm get a mix of old and new versions.

`pnpm publish -r` solves this because:
1. It topologically sorts packages by dependency graph
2. It publishes dependencies before dependents
3. `workspace:*` resolves to local versions, which are already bumped by changesets
4. It skips packages whose current version already exists on npm

The combination means every package publishes with the correct resolved dependency versions, in the correct order, automatically.

## Beta / Preview Releases

For testing unreleased changes without affecting the `latest` tag:

```bash
# Generate timestamp-based version
TIMESTAMP=$(date +%Y%m%d%H%M%S)

# Bump to beta version
npm version 0.0.0-beta-$TIMESTAMP --no-git-tag-version --prefix packages/<package-name>

# Build
pnpm --filter @mcp-b/<package-name> build

# Publish with beta tag
export $(grep -v '^#' .env | xargs)
pnpm publish --filter @mcp-b/<package-name> --access public --no-git-checks --tag beta
```

Install beta versions:
```bash
pnpm add @mcp-b/<package-name>@beta
```

The `--tag beta` flag ensures `pnpm add @mcp-b/<package>` (without tag) still installs the stable version.

## Canary Releases (via Changesets)

```bash
pnpm changeset version --snapshot canary
pnpm publish -r --access public --tag canary --no-git-checks
```

## Post-Publish Verification

After any publish, verify the dependency chain is correct:

```bash
# Check a specific package's resolved deps
npm view @mcp-b/<package>@<version> dependencies --json

# Quick check: all published versions
for pkg in webmcp-types webmcp-polyfill webmcp-ts-sdk transports global mcp-iframe extension-tools react-webmcp smart-dom-reader webmcp-local-relay chrome-devtools-mcp; do
  LOCAL=$(node -p "require('./packages/$pkg/package.json').version" 2>/dev/null)
  NPM=$(npm view @mcp-b/$pkg version 2>/dev/null)
  echo "@mcp-b/$pkg: local=$LOCAL npm=$NPM"
done
echo "usewebmcp: local=$(node -p "require('./packages/usewebmcp/package.json').version") npm=$(npm view usewebmcp version 2>/dev/null)"

# Deep chain verification (most critical path)
echo "--- Verifying global → transports → ts-sdk chain ---"
GLOBAL_V=$(npm view @mcp-b/global version)
GLOBAL_TRANSPORTS=$(npm view @mcp-b/global@$GLOBAL_V dependencies --json 2>/dev/null | node -p "JSON.parse(require('fs').readFileSync(0,'utf8'))['@mcp-b/transports']")
TRANSPORTS_SDK=$(npm view @mcp-b/transports@$GLOBAL_TRANSPORTS dependencies --json 2>/dev/null | node -p "JSON.parse(require('fs').readFileSync(0,'utf8'))['@mcp-b/webmcp-ts-sdk']")
echo "global@$GLOBAL_V → transports@$GLOBAL_TRANSPORTS → ts-sdk@$TRANSPORTS_SDK"
```

**What to look for**: All internal dep versions in the `dependencies --json` output should match the versions you just published. If any are stale, see "Fixing a Stale Chain" below.

## Fixing a Stale Dependency Chain

If you discover a stale dependency after publishing (e.g., global@1.6.2 points to transports@2.0.2 which points to ts-sdk@1.6.1):

1. You cannot unpublish — npm prevents this after 72 hours
2. Bump the version of the broken downstream package (e.g., global 1.6.2 → 1.6.3)
3. Run `pnpm publish -r --access public --no-git-checks` — it will only publish the bumped package
4. Verify the resolved chain is now correct
5. Consumers must update to the new version

**Prevention**: Always use `pnpm publish -r` instead of publishing individual packages with `--filter`. The recursive publish handles topological ordering automatically.

## Package-Specific Notes

### @mcp-b/webmcp-types
Foundational types package. Almost everything depends on this.

### @mcp-b/webmcp-polyfill
Provides `navigator.modelContext` + `navigator.modelContextTesting` when the browser lacks native support.

### @mcp-b/webmcp-ts-sdk
The `BrowserMcpServer` class. Wraps modelContext with MCP extensions. Core package that most others depend on.

### @mcp-b/transports
Browser MCP transports (Tab, Iframe, Extension).

### @mcp-b/global
**Dual build output**: ESM (`dist/index.js`) + IIFE (`dist/index.iife.js`). Has the MOST internal dependencies. Most vulnerable to transitive chain issues.

### @mcp-b/extension-tools
Chrome Extension API tools.

### @mcp-b/mcp-iframe
Custom element for iframe MCP tools.

### @mcp-b/react-webmcp
React hooks for MCP. Zod is an optional peer dependency (`^3.25 || ^4.0`).

### usewebmcp
**Standalone** React hooks package for direct `navigator.modelContext` tool registration. **NOT an alias for react-webmcp.**

### @mcp-b/webmcp-local-relay
No internal dependencies. Can be published independently at any time.

### @mcp-b/chrome-devtools-mcp
No internal dependencies. Complex build — always clean build first:
```bash
cd packages/chrome-devtools-mcp && rm -rf build/ && pnpm build
```

## NPM Authentication

### Local (.env)
```
# In repo root .env (gitignored)
NPM_TOKEN=npm_YOUR_TOKEN_HERE
```

Load before publishing:
```bash
export $(grep -v '^#' .env | xargs)
```

### CI (GitHub Secret)
```bash
gh secret set NPM_TOKEN --body "npm_YOUR_TOKEN_HERE"
```

## Common Issues

### "Cannot publish with pnpm protocols"
Used `npm publish` instead of `pnpm publish`. Always use pnpm.

### "Unclean working tree"
Add `--no-git-checks` flag.

### Package missing build files after publish
Check `prepublishOnly` script includes build step. Check `files` field in package.json.

### Version already exists on npm
The package was already published at this version. Bump to the next patch.

### npm view shows old version after publish
Registry propagation takes 15-60 seconds. Wait and retry. Do NOT republish.

## Pre-Release Checklist

1. [ ] All checks pass: `pnpm build && pnpm typecheck && pnpm check && pnpm test:unit`
2. [ ] npm login valid: `npm whoami`
3. [ ] NPM_TOKEN exported
4. [ ] Versions bumped (via `pnpm changeset version` or manually)
5. [ ] Using `pnpm publish -r` (not individual `--filter` publishes)
6. [ ] After publish: verified dependency chain with `npm view ... dependencies --json`

## Files Reference

| File | Purpose |
|------|---------|
| `.changeset/config.json` | Changesets configuration |
| `.npmrc` | pnpm registry & auth config |
| `.env` | Local NPM_TOKEN (gitignored) |
| `scripts/validate-publish.js` | Prevents accidental npm (non-pnpm) publish |
| `.github/workflows/changesets.yml` | CI release workflow |
