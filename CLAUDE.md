# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Development
```bash
# Install dependencies (use pnpm)
pnpm install

# Development mode with watch
pnpm dev

# Build all packages
pnpm build

# Build only NPM packages (in ./packages/*)
pnpm build:packages
```

### Code Quality
```bash
# Lint and format code (auto-fix)
pnpm check

# Type checking
pnpm typecheck

# Run all checks (typecheck + biome)
pnpm check-all

# Run tests (when implemented)
pnpm test
```

### Publishing
```bash
# Create a changeset for version management
pnpm changeset

# Version packages using changesets
pnpm changeset:version

# Build and publish to npm
pnpm changeset:publish

# CI publish command (used by GitHub Actions)
pnpm ci:publish
```

**See [.claude/PUBLISHING.md](.claude/PUBLISHING.md) for detailed publishing documentation**, including:
- Manual publishing workflow
- Common issues and fixes (missing build files, Zod compatibility, etc.)
- Package-specific build notes
- Troubleshooting checklist

### Git Hooks
```bash
# Pre-commit hook runs automatically via Husky
# Manually run lint-staged
pnpm exec lint-staged
```

## Architecture Overview

This is a **pnpm workspace monorepo** containing the official NPM packages for MCP-B (Model Context Protocol for Browsers). The repository implements browser-specific transports and tools for the Model Context Protocol.

### Key Packages

1. **@mcp-b/webmcp-ts-sdk** - Core TypeScript SDK with Zod schemas for WebMCP (leaf dependency)
2. **@mcp-b/transports** - Browser transport implementations (postMessage, Chrome runtime, iframe)
3. **@mcp-b/global** - W3C Web Model Context API polyfill (`navigator.modelContext`)
4. **@mcp-b/react-webmcp** - React hooks for WebMCP integration (`useWebMCP`, `useWebMCPPrompt`)
5. **@mcp-b/chrome-devtools-mcp** - Chrome DevTools MCP server for browser automation
6. **@mcp-b/extension-tools** - Auto-generated tools for Chrome Extension APIs

**Note:** All packages require **Zod 4.x** (not Zod 3.x)

### Build System

- Uses **Turbo** for monorepo task orchestration
- **tsup** for TypeScript bundling in packages
- **Biome** for linting and formatting (not ESLint/Prettier)
- **Changesets** for version management and publishing

### Important Technical Details

- All packages use ES modules (`"type": "module"`)
- Minimum Node version: 22.12
- TypeScript 5.8+ required
- Packages depend on `@modelcontextprotocol/sdk` as a peer dependency
- Chrome Extension API tools are auto-generated from Chrome types

## pnpm Workspace Configuration

This monorepo uses pnpm's advanced features for optimal dependency management and publishing:

### Workspace Protocol
- Internal package dependencies use `workspace:*` protocol
- Automatically converted to actual versions during publishing
- Example: `"@mcp-b/transports": "workspace:*"`
- Packages list in pnpm-workspace.yaml must match actual package directories

### Catalog Protocol
All shared dependencies are managed through the pnpm catalog in `pnpm-workspace.yaml`:
- TypeScript, build tools, and types use `catalog:` protocol
- Single source of truth for dependency versions
- Reduces merge conflicts and simplifies upgrades
- Example: `"typescript": "catalog:"` resolves to version in catalog

### pnpm Settings (.npmrc)
Key configurations for optimal monorepo performance:
- `catalog-mode=prefer` - Automatically use catalog versions when adding deps
- `link-workspace-packages=true` - Auto-link workspace packages
- `prefer-workspace-packages=true` - Prioritize workspace packages
- `node-linker=isolated` - Better module isolation
- `engine-strict=true` - Enforce Node version requirements
- `publish-branch=main` - Restrict publishing to main branch

### Publishing Configuration
- All packages have `publishConfig` with public access
- Workspace and catalog protocols are automatically replaced during publish
- Changesets handle version management and changelogs
- GitHub Actions automate the entire publish process

### Publishing Safety

**IMPORTANT:** Never use `npm publish` directly - it does NOT resolve `workspace:*` or `catalog:` protocols.

All packages have a `prepublishOnly` hook that validates protocols are resolved before publishing:

```bash
# This will FAIL if protocols aren't resolved:
npm publish  # DON'T DO THIS

# This will work - pnpm resolves protocols before packing:
pnpm --filter @mcp-b/react-webmcp publish --access public

# Best option - use CI/changesets workflow:
pnpm changeset
# Then merge the version PR to trigger automated publish
```

The validation script (`scripts/validate-publish.js`) runs automatically and blocks publishing if it finds unresolved `workspace:*` or `catalog:` protocols.

### Manual Publishing (Local Development)

When publishing manually from your local machine, you need to set up NPM_TOKEN:

1. **Store your NPM token in `.env`** (already gitignored):
   ```bash
   # .env file (DO NOT COMMIT)
   NPM_TOKEN=npm_xxxxxxxxxxxxxxxxxxxx
   ```

2. **Load the token and publish**:
   ```bash
   # Load NPM_TOKEN from .env and publish all packages
   export $(grep NPM_TOKEN .env | xargs) && pnpm publish:all
   ```

3. **Or publish individual packages**:
   ```bash
   export $(grep NPM_TOKEN .env | xargs) && pnpm --filter @mcp-b/global publish --access public --no-git-checks
   ```

### Package Dependency Graph & Publish Order

**CRITICAL:** Packages must be published in topological order (dependencies first):

```
@mcp-b/webmcp-ts-sdk     (no internal deps - publish FIRST)
       ↓
@mcp-b/transports        (depends on webmcp-ts-sdk)
       ↓
@mcp-b/global            (depends on transports, webmcp-ts-sdk)
       ↓
@mcp-b/react-webmcp      (depends on global, transports, webmcp-ts-sdk)
       ↓
@mcp-b/chrome-devtools-mcp (depends on transports)
```

**Why this matters:** The `workspace:*` protocol resolves to the **current version in the workspace** at publish time. If you publish a dependent package before its dependency is updated, it will reference the OLD version.

**Example of what goes wrong:**
1. `transports` is at 1.0.0, you bump it to 2.0.0
2. You publish `global` BEFORE publishing `transports`
3. `global` gets published with `"@mcp-b/transports": "1.0.0"` (the old version!)
4. Now you have to bump and republish `global` again

**Correct workflow:**
```bash
# 1. Bump all versions first
pnpm changeset version

# 2. Build all packages
pnpm build

# 3. Publish in order (or use publish:all which does -r for recursive)
export $(grep NPM_TOKEN .env | xargs)
pnpm --filter @mcp-b/webmcp-ts-sdk publish --access public --no-git-checks
pnpm --filter @mcp-b/transports publish --access public --no-git-checks
pnpm --filter @mcp-b/global publish --access public --no-git-checks
pnpm --filter @mcp-b/react-webmcp publish --access public --no-git-checks
pnpm --filter @mcp-b/chrome-devtools-mcp publish --access public --no-git-checks
```

## Development Workflow

### Making Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow existing code patterns and conventions
   - Ensure TypeScript types are properly defined
   - Update documentation if needed

3. **Test your changes**
   ```bash
   pnpm build
   pnpm typecheck
   pnpm check
   ```

4. **Create a changeset**
   ```bash
   pnpm changeset
   # Select packages that changed
   # Choose version bump type (patch/minor/major)
   # Write a brief description of changes
   ```

5. **Commit and push**
   ```bash
   git add .
   # IMPORTANT: Use proper commit format with package scope!
   # Format: <type>(<scope>): <subject>
   # Examples:
   git commit -m "feat(transports): add timeout option"
   git commit -m "fix(extension-tools): handle chrome runtime errors"
   git commit -m "chore(deps): update dependencies"
   git push origin feature/your-feature-name
   ```

### Commit Message Format

**All commits must follow this format:** `<type>(<scope>): <subject>`

Valid scopes:
- Package scopes: `chrome-devtools-mcp`, `extension-tools`, `global`, `mcp-iframe`, `react-webmcp`, `smart-dom-reader`, `transports`, `usewebmcp`, `webmcp-helpers`, `webmcp-ts-sdk`
- Repo scopes: `root`, `deps`, `release`, `ci`, `docs`, `*` (multiple packages)

Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`

The commit-msg hook will reject commits that don't follow this format!

### CI/CD Pipeline

- **Pull Requests**: Automatically run linting, type checking, and builds
- **Main branch**: Automatically creates version PRs via changesets
- **Version PRs**: When merged, automatically publish to npm

### Code Style Guidelines

- Use **Biome** for formatting and linting (configured in `biome.json`)
- No manual prettier or ESLint configuration needed
- Pre-commit hooks automatically format staged files
- Follow TypeScript strict mode requirements
- Use explicit return types for public APIs

### Package Conventions

- Each package should have:
  - `README.md` with usage examples
  - Proper TypeScript exports in `src/index.ts`
  - Build configuration via `tsup.config.ts` or `vite.config.ts`
  - `package.json` with correct exports field

### Troubleshooting

- **Build errors**: Check that all packages are using correct tsconfig extends
- **Type errors**: Ensure peer dependencies are installed
- **Publishing issues**: Verify NPM_TOKEN is set in `.env` (local) or GitHub secrets (CI)
- **Changeset issues**: Make sure you're on a feature branch, not main
- **Dependency conflicts**: Run `pnpm dedupe` to resolve duplicates
- **Catalog issues**: Use `pnpm update` to sync with catalog versions
- **Workspace linking**: Ensure package is listed in `pnpm-workspace.yaml`
- **Peer dependency warnings**: Check catalog version matches requirements
- **Zod errors** (`Cannot read properties of undefined (reading 'def')`): Consumer app needs Zod 4.x, not Zod 3.x
- **Wrong dependency versions after publish**: You published out of order - see "Package Dependency Graph & Publish Order" above