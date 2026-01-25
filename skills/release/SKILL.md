# Release Skill for @mcp-b Packages

Release and publish packages in this monorepo. Handles changesets, manual publishing, and troubleshooting common issues.

## When to Use This Skill

- Publishing new package versions to npm
- Creating changesets for version bumps
- Troubleshooting failed CI publishes
- Manual emergency releases
- Canary/preview releases

## Quick Reference

```bash
# Pre-publish validation (ALWAYS run first)
pnpm build && pnpm typecheck && pnpm check && pnpm test:unit

# Create a changeset (interactive)
pnpm changeset

# Apply changeset versions locally
pnpm changeset version

# Manual publish all packages
pnpm publish:all

# Manual publish single package
cd packages/<package-name>
pnpm publish --access public --no-git-checks

# Canary release (from CI or manually)
pnpm changeset version --snapshot canary
pnpm publish -r --access public --tag canary --no-git-checks
```

## Standard Release Workflow (Recommended)

### 1. Create Changeset

```bash
pnpm changeset
```

This prompts you to:
1. Select affected packages
2. Choose version bump type (patch/minor/major)
3. Write a description

Creates a file in `.changeset/` like `funny-dragons-jump.md`.

### 2. Commit and Push

```bash
git add .changeset/
git commit -m "chore(release): add changeset for <feature>"
git push
```

### 3. CI Creates Release PR

The `changesets.yml` workflow automatically:
1. Detects changeset files
2. Creates/updates a "Version Packages" PR
3. Aggregates all changesets into CHANGELOG entries

### 4. Merge Release PR

When ready to release:
1. Review the "Version Packages" PR
2. Merge to main
3. CI automatically publishes to npm

## Manual Publishing

### Single Package

```bash
# Load NPM_TOKEN from .env
export $(grep -v '^#' .env | xargs)

# Build and publish
cd packages/<package-name>
pnpm build
pnpm publish --access public --no-git-checks
```

### All Packages

```bash
export $(grep -v '^#' .env | xargs)
pnpm publish:all
```

### Publishing Order (if manual)

Dependencies flow downward - publish in this order:

```
1. @mcp-b/webmcp-ts-sdk        (no @mcp-b deps)
2. @mcp-b/smart-dom-reader     (no @mcp-b deps)
3. @mcp-b/transports           (← webmcp-ts-sdk)
4. @mcp-b/global               (← transports, webmcp-ts-sdk)
5. @mcp-b/mcp-iframe           (← transports)
6. @mcp-b/extension-tools      (← smart-dom-reader, webmcp-ts-sdk)
7. @mcp-b/react-webmcp         (← global, transports, webmcp-ts-sdk)
8. usewebmcp                   (← react-webmcp)
9. @mcp-b/chrome-devtools-mcp  (independent - can publish anytime)
```

## Common Issues & Fixes

### Issue: "Access token expired or revoked" / 404 Not Found

**Symptom**: CI publish fails with npm auth error

**Fix**:
```bash
# 1. Get new token from .env or generate new one at npmjs.com
# 2. Update GitHub secret
gh secret set NPM_TOKEN --body "npm_YOUR_NEW_TOKEN"

# 3. Re-run failed workflow or publish manually
```

### Issue: "Cannot publish with npm when package.json contains pnpm protocols"

**Symptom**: Error about `workspace:*` or `catalog:` not resolved

**Cause**: Used `npm publish` instead of `pnpm publish`

**Fix**: Always use pnpm:
```bash
# Wrong
npm publish

# Correct
pnpm publish --access public --no-git-checks
```

### Issue: chrome-devtools-mcp Missing vendor/mcp.js

**Symptom**: `Cannot find module '.../build/vendor/chrome-devtools-frontend/mcp/mcp.js'`

**Cause**: Incremental TypeScript build didn't regenerate `build/node_modules`

**Fix**:
```bash
cd packages/chrome-devtools-mcp

# Clean and rebuild
rm -rf build/
pnpm build

# Verify vendor exists
ls build/vendor/chrome-devtools-frontend/
```

**Why this happens**: The build script must:
1. Delete `build/tsconfig.tsbuildinfo` to force full rebuild
2. Run `tsc` to generate `build/node_modules/`
3. Run post-build script to rename `node_modules` → `vendor`

pnpm strips any `node_modules` directories during publish, so the rename is critical.

### Issue: "Unclean working tree"

**Symptom**: `ERR_PNPM_GIT_UNCLEAN`

**Fix**: Add `--no-git-checks` flag:
```bash
pnpm publish --access public --no-git-checks
```

### Issue: Package Published But Missing Files

**Symptom**: Package installs but imports fail with "Cannot find module"

**Diagnosis**:
```bash
# Check what's in the published tarball
npm view @mcp-b/<package>@<version> dist.tarball | xargs curl -sL | tar -tzf -
```

**Common causes**:
1. `files` field in package.json too restrictive
2. Build step didn't run (missing `dist/` or `build/`)
3. prepublishOnly hook failed silently

**Fix**: Check package.json `files` field and ensure build runs:
```json
{
  "files": ["dist", "LICENSE"],
  "scripts": {
    "prepublishOnly": "node ../../scripts/validate-publish.js && pnpm run build"
  }
}
```

### Issue: Dependency Version Mismatch

**Symptom**: Consumer gets wrong version of internal dependency

**Cause**: `workspace:*` resolved to old version

**Fix**: Ensure all packages are built and published together:
```bash
pnpm build
pnpm publish -r --access public --no-git-checks
```

### Issue: CI Workflow Not Triggering

**Symptom**: Merged PR but no publish happened

**Check**:
1. Are there changeset files? `ls .changeset/*.md`
2. Is the workflow enabled? Check Actions tab
3. Does PAT_TOKEN have workflow permissions?

**Fix**: If changesets exist but weren't consumed:
```bash
# Manually trigger version + publish
pnpm changeset version
git add .
git commit -m "chore(release): version packages"
git push
# CI should now publish
```

## Canary Releases

For testing unreleased changes:

```bash
# Create snapshot versions
pnpm changeset version --snapshot canary

# Publish with canary tag
pnpm publish -r --access public --tag canary --no-git-checks
```

Install canary versions:
```bash
npm install @mcp-b/transports@canary
```

## Verification Commands

```bash
# Check published package contents
npm view @mcp-b/<package> dist.tarball | xargs curl -sL | tar -tzf - | head -30

# Check specific version
npm view @mcp-b/<package>@1.2.3

# Test CLI tool
npx @mcp-b/chrome-devtools-mcp@latest --help

# Check all package versions
pnpm -r exec -- node -p "require('./package.json').name + '@' + require('./package.json').version"
```

## Package-Specific Notes

### @mcp-b/chrome-devtools-mcp

**Most complex build process**. Post-build script (`scripts/post-build.ts`):
1. Creates mock files for DevTools dependencies
2. Patches protocol client
3. Copies LICENSE files
4. Renames `build/node_modules` → `build/vendor`

**Always clean build**:
```bash
cd packages/chrome-devtools-mcp
rm -rf build/
pnpm build
```

### @mcp-b/global

**Dual build**: ESM + IIFE (browser script tag)
```json
"exports": {
  ".": "./dist/index.js",
  "./iife": "./dist/index.iife.js"
}
```

### usewebmcp

**Alias package** for `@mcp-b/react-webmcp`. Just re-exports everything.

## Zod Version Compatibility

**Current packages (2.x)**: Require Zod 4
- Uses `zod/v4` imports
- Built-in JSON schema conversion

**Legacy packages (1.x)**: For Zod 3 users
- `@mcp-b/global@1.x`
- `@mcp-b/react-webmcp@0.x`

## NPM Token Setup

### Local Development

Create `.env` in repo root:
```
NPM_TOKEN=npm_YOUR_TOKEN_HERE
```

### CI/CD

Update GitHub secret:
```bash
gh secret set NPM_TOKEN --body "npm_YOUR_TOKEN_HERE"
```

### Generate New Token

1. Go to https://www.npmjs.com/settings/tokens
2. Create "Automation" token with publish access
3. Ensure token has access to `@mcp-b` scope

## Pre-Release Checklist

1. [ ] All tests pass: `pnpm test:unit`
2. [ ] Build succeeds: `pnpm build`
3. [ ] Types check: `pnpm typecheck`
4. [ ] Lint passes: `pnpm check`
5. [ ] Changeset exists: `ls .changeset/*.md`
6. [ ] CHANGELOG updated (automatic with changesets)
7. [ ] NPM_TOKEN is valid

## Files Reference

| File | Purpose |
|------|---------|
| `.changeset/config.json` | Changesets configuration |
| `.npmrc` | pnpm registry & auth config |
| `.env` | Local NPM_TOKEN (gitignored) |
| `scripts/validate-publish.js` | Prevents npm publish mishaps |
| `.github/workflows/changesets.yml` | CI release workflow |
| `.github/workflows/release-canary.yml` | Canary release workflow |
