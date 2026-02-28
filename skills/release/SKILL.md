---
name: release
description: This skill should be used when the user wants to publish a package to npm, bump a version, release a new version, or mentions "npm publish", "pnpm publish", "version bump", "release", or "publish". Handles changesets, pnpm publish -r, NPM_TOKEN authentication, and topological dependency ordering for the @mcp-b monorepo.
---

# Release Skill for @mcp-b Packages

Publish packages from this monorepo to npm using **changesets** and `pnpm publish -r`.

## CRITICAL: Always Use Changesets

**NEVER manually edit package.json versions.** Manual bumps skip CHANGELOG generation,
which means published versions have no record of what changed. This has happened before
and must not happen again.

The ONLY exception is beta/canary releases (see below), which use throwaway versions.

## Release Flow (Step by Step)

Follow these steps in order. Do not skip steps.

### Step 1: Validate

```bash
pnpm build && pnpm typecheck && pnpm check && pnpm test:unit
```

Stop if anything fails. Fix it first.

### Step 2: Create Changeset

```bash
pnpm changeset
```

This is interactive. It will ask:
1. Which packages changed? Select only the ones with actual code changes.
2. What kind of bump? (patch / minor / major)
3. Summary of changes? Write a clear description.

This creates a `.changeset/<random-name>.md` file. You can create multiple changesets
for different changes before releasing.

**Fixed versioning note:** You only select packages that actually changed. Changesets
automatically bumps ALL packages in the fixed group to the same new version. This is
configured in `.changeset/config.json`.

### Step 3: Apply Version Bumps

```bash
pnpm changeset version
```

This does three things:
1. Bumps `version` in all `package.json` files (fixed — all get the same version)
2. Generates `CHANGELOG.md` entries from the changeset summaries
3. Deletes the consumed `.changeset/*.md` files

### Step 4: Review

```bash
# Check version bumps
git diff packages/*/package.json

# Check generated changelogs
git diff packages/*/CHANGELOG.md
```

Verify the CHANGELOGs look correct before proceeding.

### Step 5: Load NPM Auth

```bash
export $(grep -v '^#' .env | xargs)
```

The NPM_TOKEN is stored in `.env` at the repo root (gitignored). If you see
"Access token expired or revoked", the user needs to regenerate their npm token
at https://www.npmjs.com/settings/tokens.

### Step 6: Publish

```bash
pnpm publish -r --access public --no-git-checks
```

This publishes ALL packages whose local version doesn't yet exist on npm, in
topological order (dependencies before dependents).

**Never use `npm publish`** — only pnpm resolves `workspace:*` and `catalog:` protocols.

### Step 7: Verify

```bash
# Quick check: all published versions match local
for pkg in webmcp-types webmcp-polyfill webmcp-ts-sdk transports global mcp-iframe extension-tools react-webmcp smart-dom-reader webmcp-local-relay chrome-devtools-mcp agent-skills; do
  LOCAL=$(node -p "require('./packages/$pkg/package.json').version" 2>/dev/null)
  NPM=$(npm view @mcp-b/$pkg version 2>/dev/null)
  echo "@mcp-b/$pkg: local=$LOCAL npm=$NPM"
done
echo "usewebmcp: local=$(node -p "require('./packages/usewebmcp/package.json').version") npm=$(npm view usewebmcp version 2>/dev/null)"
echo "agent-skills-ts-sdk: local=$(node -p "require('./packages/agent-skills/package.json').version") npm=$(npm view agent-skills-ts-sdk version 2>/dev/null)"
```

With fixed versioning, ALL versions should be the SAME number.

### Step 8: Commit and Push

```bash
git add .
git commit -m "chore(release): version packages"
git push origin main
```

### Step 9: Create GitHub Release (Optional)

```bash
VERSION=$(node -p "require('./packages/global/package.json').version")
gh release create "v$VERSION" --title "v$VERSION" --generate-notes --target main
```

To attach an MCPB bundle for webmcp-local-relay:

```bash
cd packages/webmcp-local-relay && pnpm run build:mcpb && cd ../..
gh release upload "v$VERSION" packages/webmcp-local-relay/webmcp-local-relay-$VERSION.mcpb
```

## Alternative: CI-Driven Release (Fully Automated)

Instead of publishing locally, let CI handle it:

1. `pnpm changeset` — create changeset locally
2. `git add .changeset/ && git commit -m "chore: add changeset" && git push`
3. CI creates a "Version Packages" PR with bumped versions and changelogs
4. Merge the PR — CI runs `pnpm ci:publish` (`pnpm publish -r --access public`) automatically
5. CI also builds MCPB bundles, creates GitHub releases, and signs with sigstore

## Beta / Preview Releases

Beta releases use throwaway versions and do NOT go through changesets. Do NOT commit
the version change — revert it after publishing.

```bash
# 1. Generate timestamp version
TIMESTAMP=$(date +%Y%m%d%H%M%S)

# 2. Bump to beta version (do NOT commit this)
npm version 0.0.0-beta-$TIMESTAMP --no-git-tag-version --prefix packages/<package-name>

# 3. Build
pnpm --filter @mcp-b/<package-name> build

# 4. Publish with beta tag
export $(grep -v '^#' .env | xargs)
pnpm publish --filter @mcp-b/<package-name> --access public --no-git-checks --tag beta

# 5. REVERT the version change
git checkout packages/<package-name>/package.json
```

Install beta versions: `pnpm add @mcp-b/<package-name>@beta`

## Canary Releases (via Changesets Snapshots)

```bash
pnpm changeset version --snapshot canary
pnpm publish -r --access public --tag canary --no-git-checks
# Revert: git checkout .
```

## Fixed Versioning Strategy

**All packages share the same version number.** This is enforced by the `"fixed"` setting
in `.changeset/config.json`. When any package changes, ALL packages bump together.

Benefits:
- **No stale transitive chains** — every package depends on the same version of its siblings
- **Instant mismatch detection** — if `global@2.0.5` depends on `transports@2.0.4`, something's wrong
- **Simple for consumers** — "I'm on WebMCP 2.0.5" instead of juggling 12 different version numbers

## How `pnpm publish -r` Works

All internal dependencies use `"workspace:*"` in package.json. When `pnpm publish` runs,
it resolves `workspace:*` to the current local version. `pnpm publish -r` publishes in
topological order automatically and skips versions that already exist on npm.

### Topological Publish Order

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
  @mcp-b/webmcp-local-relay, @mcp-b/chrome-devtools-mcp, agent-skills-ts-sdk
```

## Complete Dependency Graph

```
@mcp-b/webmcp-types          (no internal deps)
@mcp-b/smart-dom-reader      (no internal deps)
@mcp-b/webmcp-local-relay    (no internal deps)
@mcp-b/chrome-devtools-mcp   (no internal deps)
agent-skills-ts-sdk           (no internal deps)

@mcp-b/webmcp-polyfill       → webmcp-types
@mcp-b/webmcp-ts-sdk         → webmcp-polyfill, webmcp-types
@mcp-b/transports            → webmcp-ts-sdk
@mcp-b/extension-tools       → smart-dom-reader, webmcp-ts-sdk
@mcp-b/mcp-iframe            → transports, webmcp-ts-sdk, webmcp-types
@mcp-b/global                → transports, webmcp-polyfill, webmcp-ts-sdk, webmcp-types
@mcp-b/react-webmcp          → global, transports, webmcp-polyfill, webmcp-ts-sdk, webmcp-types
usewebmcp                    → webmcp-polyfill, webmcp-types
```

## Fixing a Stale Dependency Chain

If you discover a stale dependency after publishing:

1. You cannot unpublish — npm prevents this after 72 hours
2. Create a changeset for the broken package: `pnpm changeset`
3. `pnpm changeset version` to bump
4. `pnpm publish -r --access public --no-git-checks`
5. Verify the resolved chain is now correct

## Package Notes

| Package | Notes |
|---------|-------|
| `@mcp-b/webmcp-types` | Foundational types. Almost everything depends on this. |
| `@mcp-b/global` | Dual build (ESM + IIFE). Most internal deps. Most vulnerable to chain issues. |
| `@mcp-b/chrome-devtools-mcp` | Complex build — always `rm -rf build/` before building. |
| `usewebmcp` | Standalone package. NOT an alias for react-webmcp. |
| `agent-skills-ts-sdk` | Published as `agent-skills-ts-sdk` (NOT `@mcp-b/agent-skills`). |

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
Set via `gh secret set NPM_TOKEN`.

## Common Issues

| Issue | Fix |
|-------|-----|
| `workspace:*` or `catalog:` in published package.json | Use `pnpm publish`, not `npm publish` |
| `ERR_PNPM_GIT_UNCLEAN` | Add `--no-git-checks` flag |
| Build files missing from tarball | Check `prepublishOnly` includes build step |
| Version already exists on npm | Bump to the next patch via `pnpm changeset` |
| npm view shows old version | Wait 30-60 seconds for propagation |
| No CHANGELOG entries for a version | Version was bumped manually — use changesets next time |

## Files Reference

| File | Purpose |
|------|---------|
| `.changeset/config.json` | Changesets config (includes fixed versioning groups) |
| `.npmrc` | pnpm registry & auth config |
| `.env` | Local NPM_TOKEN (gitignored) |
| `scripts/validate-publish.js` | Prevents accidental npm (non-pnpm) publish |
| `.github/workflows/changesets.yml` | CI release workflow |
| `.github/workflows/release-canary.yml` | CI canary release workflow |
