# CLAUDE.md

Guidance for Claude Code when working with this repository.

## Commands

```bash
vp install            # Install dependencies
pnpm build            # Build all packages
pnpm typecheck        # Type checking
vp check --fix        # Lint, format, and fix (Oxlint + Oxfmt)
vp check              # Check without fixing (CI)
pnpm check-all        # All checks (typecheck + lint)
pnpm test:unit        # Unit tests only
pnpm test:e2e         # E2E tests only
vp test run           # Run tests in current package
vp pack               # Build current library package
pnpm changeset        # Create a changeset for versioning
```

## Structure

```
packages/           # All NPM packages (@mcp-b/*)
e2e/                # E2E tests and test apps
docs/               # Technical documentation
skills/             # Claude Code skills
templates/          # Project templates
.reference/         # Upstream reference repos (gitignored, shallow clones)
```

## Key Files

| File                                           | Purpose                                              |
| ---------------------------------------------- | ---------------------------------------------------- |
| [CONTRIBUTING.md](./CONTRIBUTING.md)           | Code quality requirements, commit format, PR process |
| [.claude/PUBLISHING.md](.claude/PUBLISHING.md) | Publishing workflow and troubleshooting              |
| [docs/TESTING.md](./docs/TESTING.md)           | Testing documentation                                |
| [pnpm-workspace.yaml](./pnpm-workspace.yaml)   | Workspace packages and dependency catalog            |
| [vite.config.ts](./vite.config.ts)             | Lint, format, staged, and task config (Vite+)        |

## Quick Reference

- **Node**: >= 22.12
- **Package manager**: pnpm (not npm/yarn)
- **Toolchain**: Vite+ (`vp` CLI) — unified dev/build/test/lint/format
- **Linter**: Oxlint (via `vp lint` / `vp check`)
- **Formatter**: Oxfmt (via `vp fmt` / `vp check`)
- **Bundler**: tsdown via `vp pack` (config in each package's `vite.config.ts` `pack` block)
- **Test runner**: Vitest via `vp test` (config in each package's `vite.config.ts` `test` block)
- **Zod version**: Optional peer dep. Supports ^3.25 || ^4.0 when present
- **Commit format**: `<type>(<scope>): <subject>` (enforced by hook)

### Commit Scopes

Package scopes: `agent-skills`, `chrome-devtools-mcp`, `codemode`, `extension-tools`, `global`, `mcp-iframe`, `react-webmcp`, `smart-dom-reader`, `transports`, `usewebmcp`, `webmcp-local-relay`, `webmcp-polyfill`, `webmcp-ts-sdk`, `webmcp-types`

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

| Method               | Web Standard | Polyfill |   BrowserMcpServer    |
| -------------------- | :----------: | :------: | :-------------------: |
| `provideContext()`   |      Y       |    Y     | Y (mirrors to native) |
| `registerTool()`     |      Y       |    Y     | Y (mirrors to native) |
| `unregisterTool()`   |      Y       |    Y     | Y (mirrors to native) |
| `clearContext()`     |      Y       |    Y     | Y (mirrors to native) |
| `registerPrompt()`   |      -       |    -     |           Y           |
| `registerResource()` |      -       |    -     |           Y           |
| `listTools()`        |      -       |    -     |           Y           |
| `callTool()`         |      -       |    -     |           Y           |
| `createMessage()`    |      -       |    -     |           Y           |
| `elicitInput()`      |      -       |    -     |           Y           |

### Key Type Interfaces (`@mcp-b/webmcp-types`)

- `ModelContextCore` — the strict web standard surface (provideContext, registerTool, unregisterTool, clearContext)
- `ModelContextExtensions` — MCPB extensions (listTools, callTool, events)
- `ModelContext` = `ModelContextCore` (the type for `navigator.modelContext`)
- `ModelContextWithExtensions` = `ModelContextCore & ModelContextExtensions`

## Reference Repos (`.reference/`)

The `.reference/` directory (gitignored) holds shallow clones of upstream repos we track for sync. These are NOT dependencies — they are for human/AI reference when syncing with upstream changes.

| Directory            | Upstream                                                                                      | Tracked By            |
| -------------------- | --------------------------------------------------------------------------------------------- | --------------------- |
| `cloudflare-agents/` | [cloudflare/agents](https://github.com/cloudflare/agents)                                     | `@mcp-b/codemode`     |
| `standard-schema/`   | [standard-schema/standard-schema](https://github.com/standard-schema/standard-schema)         | `@mcp-b/webmcp-types` |
| `typescript-sdk/`    | [anthropics/anthropic-sdk-typescript](https://github.com/anthropics/anthropic-sdk-typescript) | General reference     |

To clone or refresh:

```bash
cd .reference
git clone --depth 1 https://github.com/cloudflare/agents.git cloudflare-agents
```

### Codemode Upstream Sync

`@mcp-b/codemode` is a browser-native port of `@cloudflare/codemode`. The file structure mirrors upstream for easy diffing:

| Our file               | Upstream equivalent    | Notes                                                |
| ---------------------- | ---------------------- | ---------------------------------------------------- |
| `utils.ts`             | `utils.ts`             | Direct port                                          |
| `json-schema-types.ts` | `json-schema-types.ts` | Direct port                                          |
| `normalize.ts`         | `normalize.ts`         | Direct port                                          |
| `tool-types.ts`        | `tool-types.ts`        | Direct port (AI SDK schema introspection)            |
| `tool.ts`              | `tool.ts`              | Direct port (createCodeTool)                         |
| `ai.ts`                | `ai.ts`                | Re-exports (matches upstream)                        |
| `types.ts`             | `executor.ts`          | Executor/ExecuteResult interfaces only               |
| `iframe-executor.ts`   | —                      | Browser-native (replaces CF's DynamicWorkerExecutor) |
| `worker-executor.ts`   | —                      | Browser-native fallback                              |
| `messages.ts`          | —                      | Typed postMessage protocol                           |
| `webmcp.ts`            | —                      | WebMCP bridge                                        |

When upstream adds features, diff with:

```bash
diff -r .reference/cloudflare-agents/packages/codemode/src packages/codemode/src
```

## Before Committing

All code must pass:

```bash
pnpm build && pnpm typecheck && vp check && pnpm test:unit
```
