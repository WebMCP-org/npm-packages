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

### Git Hooks
```bash
# Pre-commit hook runs automatically via Husky
# Manually run lint-staged
pnpm exec lint-staged
```

## Architecture Overview

This is a **pnpm workspace monorepo** containing the official NPM packages for MCP-B (Model Context Protocol for Browsers). The repository implements browser-specific transports and tools for the Model Context Protocol.

### Key Packages

1. **@mcp-b/transports** - Core browser transport implementations (postMessage, Chrome runtime messaging)
2. **@mcp-b/mcp-react-hooks** - React hooks for MCP integration  
3. **@mcp-b/extension-tools** - Auto-generated tools for Chrome Extension APIs
4. **@mcp-b/mcp-react-hook-form** - React Hook Form integration
5. **@mcp-b/global** - Shared type definitions (internal use)

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
- Package scopes: `transports`, `extension-tools`, `mcp-react-hooks`, `mcp-react-hook-form`, `global`
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
- **Publishing issues**: Verify NPM_TOKEN is set in GitHub secrets
- **Changeset issues**: Make sure you're on a feature branch, not main
- **Dependency conflicts**: Run `pnpm dedupe` to resolve duplicates
- **Catalog issues**: Use `pnpm update` to sync with catalog versions
- **Workspace linking**: Ensure package is listed in `pnpm-workspace.yaml`
- **Peer dependency warnings**: Check catalog version matches requirements