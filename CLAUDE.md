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
- **Zod version**: 3.25.76+ required (3.x only, not 4.x)
- **Commit format**: `<type>(<scope>): <subject>` (enforced by hook)

### Commit Scopes

Package scopes: `chrome-devtools-mcp`, `extension-tools`, `global`, `mcp-iframe`, `react-webmcp`, `smart-dom-reader`, `transports`, `usewebmcp`, `webmcp-polyfill`, `webmcp-ts-sdk`, `webmcp-types`

Repo scopes: `root`, `deps`, `release`, `ci`, `docs`, `*`

## WebMCP Architecture

### Web Standard APIs

`navigator.modelContext` and `navigator.modelContextTesting` are **web standard APIs** (Chromium). They are not internal to this project. Browsers that support them provide both together.

- `navigator.modelContext` — the core API: `provideContext()`, `registerTool()`, `unregisterTool()`, `clearContext()`
- `navigator.modelContextTesting` — the testing API: `listTools()`, `executeTool()`, `registerToolsChangedCallback()`

### Package Layering

```
┌─────────────────────────────────────────────────────┐
│  @mcp-b/global                                      │
│  Entry point. Orchestrates polyfill + server setup.  │
│  Auto-initializes in browser environments.           │
├─────────────────────────────────────────────────────┤
│  @mcp-b/webmcp-ts-sdk (BrowserMcpServer)            │
│  Wraps the underlying modelContext. Extends it with  │
│  MCP capabilities: registerPrompt, registerResource, │
│  elicitation, sampling. Mirrors core tool ops down   │
│  to the native/polyfill context.                     │
├─────────────────────────────────────────────────────┤
│  @mcp-b/webmcp-polyfill                             │
│  Provides navigator.modelContext +                   │
│  navigator.modelContextTesting when the browser      │
│  doesn't have native support. Strict core only —     │
│  no prompts, no resources.                           │
├─────────────────────────────────────────────────────┤
│  Native browser API (if available)                   │
│  navigator.modelContext + modelContextTesting        │
│  provided by the browser itself.                     │
└─────────────────────────────────────────────────────┘
```

### Initialization Flow (`@mcp-b/global`)

1. **Polyfill** — `initializeWebMCPPolyfill()` is called. If native `modelContext` already exists, the polyfill returns early (no-op). If not, it installs both `modelContext` and `modelContextTesting`.
2. **Capture native** — A reference to the current `navigator.modelContext` (either native or polyfill) is saved as `native`.
3. **BrowserMcpServer** — Created with `{ native }`, so core tool operations (`registerTool`, `unregisterTool`, `clearContext`, `provideContext`) mirror down to the underlying context.
4. **Replace** — `navigator.modelContext` is replaced with the `BrowserMcpServer` instance, which adds `registerPrompt`, `registerResource`, `listTools`, `callTool`, and other MCP extensions.
5. **Cleanup** — `cleanupWebModelContext()` restores the original native/polyfill context.

### What Lives Where

| Method | Web Standard | Polyfill | BrowserMcpServer |
|--------|:---:|:---:|:---:|
| `provideContext()` | Y | Y | Y (mirrors to native) |
| `registerTool()` | Y | Y | Y (mirrors to native) |
| `unregisterTool()` | Y | Y | Y (mirrors to native) |
| `clearContext()` | Y | Y | Y (mirrors to native) |
| `registerPrompt()` | - | - | Y |
| `registerResource()` | - | - | Y |
| `listTools()` | - | - | Y |
| `callTool()` | - | - | Y |
| `createMessage()` | - | - | Y |
| `elicitInput()` | - | - | Y |

### Key Type Interfaces (`@mcp-b/webmcp-types`)

- `ModelContextCore` — the strict web standard surface (provideContext, registerTool, unregisterTool, clearContext)
- `ModelContextExtensions` — MCPB extensions (listTools, callTool, events)
- `ModelContext` = `ModelContextCore` (the type for `navigator.modelContext`)
- `ModelContextWithExtensions` = `ModelContextCore & ModelContextExtensions`

## Before Committing

All code must pass:
```bash
pnpm build && pnpm typecheck && pnpm check && pnpm test:unit
```
