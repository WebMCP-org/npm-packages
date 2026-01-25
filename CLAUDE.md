# CLAUDE.md

Guidance for Claude Code when working with this repository.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm typecheck        # Type checking
pnpm check            # Lint and format (Biome)
pnpm check-all        # All checks (typecheck + lint)
pnpm test             # Run tests
pnpm test:unit        # Unit tests only
pnpm test:e2e         # E2E tests only
pnpm changeset        # Create a changeset for versioning
```

## Structure

```
packages/           # All NPM packages (@mcp-b/*)
e2e/                # E2E tests and test apps
docs/               # Technical documentation
skills/             # Claude Code skills
templates/          # Project templates
```

## Key Files

| File | Purpose |
|------|---------|
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Code quality requirements, commit format, PR process |
| [.claude/PUBLISHING.md](.claude/PUBLISHING.md) | Publishing workflow and troubleshooting |
| [docs/TESTING.md](./docs/TESTING.md) | Testing documentation |
| [pnpm-workspace.yaml](./pnpm-workspace.yaml) | Workspace packages and dependency catalog |
| [biome.json](./biome.json) | Linting and formatting rules |

## Quick Reference

- **Node**: >= 22.12 (see `.nvmrc`)
- **Package manager**: pnpm (not npm/yarn)
- **Linter**: Biome (not ESLint/Prettier)
- **Zod version**: 4.x required (not 3.x)
- **Commit format**: `<type>(<scope>): <subject>` (enforced by hook)

### Commit Scopes

Package scopes: `chrome-devtools-mcp`, `extension-tools`, `global`, `mcp-iframe`, `react-webmcp`, `smart-dom-reader`, `transports`, `usewebmcp`, `webmcp-helpers`, `webmcp-ts-sdk`

Repo scopes: `root`, `deps`, `release`, `ci`, `docs`, `*`

## Before Committing

All code must pass:
```bash
pnpm build && pnpm typecheck && pnpm check && pnpm test:unit
```
