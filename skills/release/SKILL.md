# Release Skill for @mcp-b Packages

Publish packages from this monorepo to npm. Covers manual publishing, changesets, beta releases, and the critical dependency ordering that prevents transitive version mismatches.

## When to Use This Skill

- Publishing new package versions to npm
- Creating changesets for version bumps
- Beta/canary/preview releases
- Troubleshooting failed publishes or dependency chain issues

## CRITICAL: Understanding workspace:* Resolution

**This is the #1 source of publishing bugs in this repo.**

All internal dependencies use `"workspace:*"` in package.json. When `pnpm publish` runs, it resolves `workspace:*` to the **current local version** of that dependency at publish time. This means:

- If `@mcp-b/transports` depends on `@mcp-b/webmcp-ts-sdk: "workspace:*"`, and ts-sdk is locally at version `2.0.2`, pnpm resolves it to `"@mcp-b/webmcp-ts-sdk": "2.0.2"` in the published package.
- **If you publish transports BEFORE publishing ts-sdk's new version**, transports will reference the OLD ts-sdk version on npm. Consumers will get a stale dependency chain.
- **This cannot be fixed retroactively** — you must republish the downstream package to update the resolved version.

**Rule: Always publish dependencies before dependents. Verify after each publish.**

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

## Mandatory Publish Order

Publish in exactly this order. **Do not skip steps. Do not reorder.**

```
Tier 0 (no internal deps — can publish in parallel):
  1. @mcp-b/webmcp-types
  2. @mcp-b/smart-dom-reader

Tier 1 (depends on Tier 0):
  3. @mcp-b/webmcp-polyfill       (← webmcp-types)

Tier 2 (depends on Tier 1):
  4. @mcp-b/webmcp-ts-sdk         (← webmcp-polyfill, webmcp-types)

Tier 3 (depends on Tier 2):
  5. @mcp-b/transports            (← webmcp-ts-sdk)

Tier 4 (depends on Tier 3):
  6. @mcp-b/extension-tools       (← smart-dom-reader, webmcp-ts-sdk)
  7. @mcp-b/mcp-iframe            (← transports, webmcp-ts-sdk, webmcp-types)
  8. @mcp-b/global                (← transports, webmcp-polyfill, webmcp-ts-sdk, webmcp-types)

Tier 5 (depends on Tier 4):
  9. @mcp-b/react-webmcp          (← global, transports, webmcp-polyfill, webmcp-ts-sdk, webmcp-types)
 10. usewebmcp                    (← webmcp-polyfill, webmcp-types)

Independent (publish anytime):
 11. @mcp-b/webmcp-local-relay    (no internal deps)
 12. @mcp-b/chrome-devtools-mcp   (no internal deps)
```

Packages within the same tier can be published in parallel if desired.

## Manual Publishing Workflow

### Step 1: Pre-Publish Validation

```bash
pnpm build && pnpm typecheck && pnpm check && pnpm test:unit
```

All four must pass. Do not publish if any fail.

### Step 2: Verify npm Login

```bash
npm whoami
```

If not logged in, run `npm login` (requires interactive terminal — the human must do this).

### Step 3: Load NPM Token

```bash
export $(grep -v '^#' /Users/alexmnahas/personalRepos/WebMCP-org/npm-packages/.env | xargs)
```

The `.env` file at the repo root contains `NPM_TOKEN=npm_...`. This must be exported for `pnpm publish` to authenticate.

### Step 4: Bump Versions

For each package being released, bump the version:

```bash
# From repo root — use absolute paths, never cd into package dirs
# (cd changes shell state and causes errors in subsequent commands)

# Patch bump (most common)
npm version patch --no-git-tag-version --prefix packages/<package-name>

# Or edit package.json directly
```

**Convention**: For packages in rapid development (0.x.x), bump patch. For stable packages (1.x+), follow semver properly.

### Step 5: Publish in Order

Publish each package using absolute paths from the repo root:

```bash
# Template for each package:
pnpm publish --filter @mcp-b/<package-name> --access public --no-git-checks
```

**IMPORTANT**: Always use `pnpm publish`, never `npm publish`. npm does not resolve `workspace:*` or `catalog:` protocols.

Follow the tier order from the Mandatory Publish Order section above. After EACH tier, verify the resolved dependencies before moving to the next tier.

### Step 6: Verify After Each Tier

After publishing each tier of packages, verify the dependency chain:

```bash
# Check that the package was published
npm view @mcp-b/<package> version

# Check that workspace:* resolved correctly
npm view @mcp-b/<package>@<new-version> dependencies --json
```

**Look for**: All internal dependency versions should reference the versions you JUST published in earlier tiers. If you see an old version number, STOP — you published out of order and need to republish.

### Step 7: Commit and Push

```bash
git add packages/*/package.json
git commit -m "chore(release): publish <packages>"
git push origin main
```

## Full Release Script (All Packages)

When releasing all packages at once, use this sequential script. Run each tier and verify before proceeding.

```bash
# Setup
export $(grep -v '^#' .env | xargs)

# Tier 0
pnpm publish --filter @mcp-b/webmcp-types --access public --no-git-checks
pnpm publish --filter @mcp-b/smart-dom-reader --access public --no-git-checks
# Verify: npm view @mcp-b/webmcp-types version && npm view @mcp-b/smart-dom-reader version

# Tier 1
pnpm publish --filter @mcp-b/webmcp-polyfill --access public --no-git-checks
# Verify: npm view @mcp-b/webmcp-polyfill dependencies --json (should show new types version)

# Tier 2
pnpm publish --filter @mcp-b/webmcp-ts-sdk --access public --no-git-checks
# Verify: npm view @mcp-b/webmcp-ts-sdk dependencies --json

# Tier 3
pnpm publish --filter @mcp-b/transports --access public --no-git-checks
# Verify: npm view @mcp-b/transports dependencies --json (should show new ts-sdk version)

# Tier 4 (can be parallel)
pnpm publish --filter @mcp-b/extension-tools --access public --no-git-checks
pnpm publish --filter @mcp-b/mcp-iframe --access public --no-git-checks
pnpm publish --filter @mcp-b/global --access public --no-git-checks
# Verify: npm view @mcp-b/global dependencies --json (should show new transports version)

# Tier 5 (can be parallel)
pnpm publish --filter @mcp-b/react-webmcp --access public --no-git-checks
pnpm publish --filter usewebmcp --access public --no-git-checks
# Verify: npm view @mcp-b/react-webmcp dependencies --json

# Independent (anytime)
pnpm publish --filter @mcp-b/webmcp-local-relay --access public --no-git-checks
pnpm publish --filter @mcp-b/chrome-devtools-mcp --access public --no-git-checks
```

**Note**: npm registry propagation can take 15-60 seconds. If `npm view` shows an old version immediately after publish, wait and retry. Do NOT republish — that will fail with "version already exists".

## Beta / Preview Releases

For testing unreleased changes without affecting the `latest` tag:

```bash
# Generate timestamp-based version
TIMESTAMP=$(date +%Y%m%d%H%M%S)

# Bump to beta version (in package dir)
npm version 0.0.0-beta-$TIMESTAMP --no-git-tag-version --prefix packages/<package-name>

# Build
pnpm --filter @mcp-b/<package-name> build

# Publish with beta tag
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

## Changeset Workflow (CI-Driven)

For coordinated releases via CI:

1. **Create changeset**: `pnpm changeset` (interactive — select packages, bump type, description)
2. **Commit**: `git add .changeset/ && git commit -m "chore(release): add changeset"`
3. **Push**: CI creates a "Version Packages" PR automatically
4. **Merge**: Merging the PR triggers CI publish in correct order

## Package-Specific Notes

### @mcp-b/webmcp-types
Foundational types package. Almost everything depends on this. Publish first.

### @mcp-b/webmcp-polyfill
Provides `navigator.modelContext` + `navigator.modelContextTesting` when the browser lacks native support. Depends only on types.

### @mcp-b/webmcp-ts-sdk
The `BrowserMcpServer` class. Wraps modelContext with MCP extensions. Core package that most others depend on.

### @mcp-b/transports
Browser MCP transports (Tab, Iframe, Extension). Depends on ts-sdk.

### @mcp-b/global
**Dual build output**: ESM (`dist/index.js`) + IIFE (`dist/index.iife.js`) for `<script>` tags. Has the MOST internal dependencies (transports, polyfill, ts-sdk, types). **Most vulnerable to transitive chain issues** — if any upstream dep is stale, consumers of global get broken chains.

### @mcp-b/extension-tools
Chrome Extension API tools. Depends on smart-dom-reader and ts-sdk.

### @mcp-b/mcp-iframe
Custom element for iframe MCP tools. Depends on transports, ts-sdk, types.

### @mcp-b/react-webmcp
React hooks for MCP. The heaviest downstream package — depends on global, transports, polyfill, ts-sdk, types. Zod is an optional peer dependency (`^3.25 || ^4.0`).

### usewebmcp
**Standalone** React hooks package for direct `navigator.modelContext` tool registration. Depends on polyfill and types. **NOT an alias for react-webmcp** — it is its own package with its own `useWebMCP` hook.

### @mcp-b/webmcp-local-relay
No internal dependencies. Can be published independently at any time.

### @mcp-b/chrome-devtools-mcp
No internal dependencies. Complex build process — always clean build:
```bash
cd packages/chrome-devtools-mcp && rm -rf build/ && pnpm build
```
Post-build renames `build/node_modules` → `build/vendor` (pnpm strips node_modules during publish).

## Transitive Dependency Chain: What Can Go Wrong

### The Problem

```
Scenario: You need to publish ts-sdk@2.0.2 and transports@2.0.3

WRONG ORDER:
1. Publish transports@2.0.3 (workspace:* resolves ts-sdk to OLD 2.0.1)
2. Publish ts-sdk@2.0.2

Result: transports@2.0.3 on npm depends on ts-sdk@2.0.1 (stale!)
Consumers install transports → get ts-sdk@2.0.1 → missing the fix they need.

CORRECT ORDER:
1. Publish ts-sdk@2.0.2 first
2. Publish transports@2.0.3 (workspace:* resolves ts-sdk to NEW 2.0.2)

Result: transports@2.0.3 on npm depends on ts-sdk@2.0.2 ✓
```

### Deep Chain Example

The most dangerous chain in this repo:

```
@mcp-b/global → @mcp-b/transports → @mcp-b/webmcp-ts-sdk → @mcp-b/webmcp-polyfill → @mcp-b/webmcp-types
```

If you publish `global` before `transports` has been updated, `global` will reference the old `transports` version, which references the old `ts-sdk`, and so on. **The entire chain becomes stale.**

### How to Fix a Stale Chain

If you discover a stale dependency after publishing:

1. **You cannot unpublish** (npm prevents unpublish after 72 hours, and consumers may already have cached it)
2. **Bump the version** of the downstream package (e.g., global 1.6.2 → 1.6.3)
3. **Republish** — the new version will resolve `workspace:*` to the correct upstream versions
4. **Consumers must update** to the new version to get the fix

### Prevention Checklist

Before publishing any package, verify:
- [ ] All upstream dependencies in the chain have been published FIRST
- [ ] `npm view @mcp-b/<upstream-dep> version` shows the expected new version
- [ ] After publishing, run `npm view @mcp-b/<this-package>@<new-version> dependencies --json` and confirm all internal dep versions are correct

## NPM Authentication

### Local (.env)
```
# In repo root .env (gitignored)
NPM_TOKEN=npm_YOUR_TOKEN_HERE
```

### CI (GitHub Secret)
```bash
gh secret set NPM_TOKEN --body "npm_YOUR_TOKEN_HERE"
```

### Generate New Token
1. Go to npmjs.com → Settings → Access Tokens
2. Create "Automation" token with publish access to `@mcp-b` scope

## Verification Commands

```bash
# Check what version is live on npm
npm view @mcp-b/<package> version

# Check resolved dependencies of a published version
npm view @mcp-b/<package>@<version> dependencies --json

# Check tarball contents
npm view @mcp-b/<package>@<version> dist.tarball | xargs curl -sL | tar -tzf -

# Check all local package versions
pnpm -r exec -- node -p "require('./package.json').name + '@' + require('./package.json').version"

# Compare local vs npm versions
for pkg in webmcp-types webmcp-polyfill webmcp-ts-sdk transports global mcp-iframe extension-tools react-webmcp smart-dom-reader webmcp-local-relay chrome-devtools-mcp; do
  LOCAL=$(node -p "require('./packages/$pkg/package.json').version" 2>/dev/null)
  NPM=$(npm view @mcp-b/$pkg version 2>/dev/null)
  echo "@mcp-b/$pkg: local=$LOCAL npm=$NPM"
done
# Also check usewebmcp (unscoped)
echo "usewebmcp: local=$(node -p "require('./packages/usewebmcp/package.json').version") npm=$(npm view usewebmcp version 2>/dev/null)"
```

## Pre-Release Checklist

1. [ ] All tests pass: `pnpm test:unit`
2. [ ] Build succeeds: `pnpm build`
3. [ ] Types check: `pnpm typecheck`
4. [ ] Lint passes: `pnpm check`
5. [ ] npm login valid: `npm whoami`
6. [ ] NPM_TOKEN exported: `echo $NPM_TOKEN | head -c 10`
7. [ ] Versions bumped in correct packages
8. [ ] Publishing order follows the tier system above
9. [ ] After each tier: verified resolved dependencies on npm

## Files Reference

| File | Purpose |
|------|---------|
| `.changeset/config.json` | Changesets configuration |
| `.npmrc` | pnpm registry & auth config |
| `.env` | Local NPM_TOKEN (gitignored) |
| `scripts/validate-publish.js` | Prevents accidental npm (non-pnpm) publish |
| `.github/workflows/changesets.yml` | CI release workflow |
