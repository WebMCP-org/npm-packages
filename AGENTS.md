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
apps/               # Deployed apps (landing-page, documentation-website)
e2e/                # E2E tests and test apps
docs/               # Technical documentation
.agents/skills/     # Agent skills and their bundled references/assets
.reference/         # Upstream reference repos (gitignored, shallow clones)
```

## Apps (`apps/*`)

Both apps are pnpm workspace members.

### `apps/landing-page` — `@mcp-b/landing-page`

Landing page at [mcp-b.ai](https://mcp-b.ai) (also `www.mcp-b.ai`). Astro 6
(`output: 'server'`) deployed to Cloudflare Workers via `@astrojs/cloudflare`
v13. Dev runs on real workerd (Vite Environment API).

- `pnpm dev` (`wrangler types` → `astro dev`), `pnpm build` (`wrangler types` → `astro check` → `astro build`), `pnpm preview`.
- Cloudflare runtime: env via `import { env } from 'cloudflare:workers'`; `Astro.request.cf`; execution context at `Astro.locals.cfContext`. Do NOT use `Astro.locals.runtime` (removed in v13).
- Secrets: `npx wrangler secret put <KEY>`; local secrets in `.dev.vars`.
- Config: `astro.config.mjs`, `wrangler.jsonc`. Excluded from root `pnpm build`/`check-all` via `--filter '!@mcp-b/landing-page'`.

### `apps/documentation-website` — `@mcp-b/documentation-website`

WebMCP docs at [docs.mcp-b.ai](https://docs.mcp-b.ai), built with Mintlify (its
own CLI runs dev/build; Vite+ only manages its dependencies). Authored following
the Diataxis framework.

- `pnpm dev:docs` from the root, or `pnpm dev` in the app dir (both run `mintlify dev` at http://localhost:3000). `pnpm build` runs `mintlify validate`.
- `docs.json` is the single source of truth for navigation. Do not modify without explicit request.
- Authoring rules (Diataxis, writing style, Mintlify components, source-of-truth boundaries) are in [.agents/skills/docs-authoring/SKILL.md](./.agents/skills/docs-authoring/SKILL.md). Read it before writing or editing docs pages.

## Key Files

| File                                                               | Purpose                                              |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| [CONTRIBUTING.md](./CONTRIBUTING.md)                               | Code quality requirements, commit format, PR process |
| [.agents/skills/release/SKILL.md](.agents/skills/release/SKILL.md) | Publishing workflow and troubleshooting              |
| [docs/TESTING.md](./docs/TESTING.md)                               | Testing documentation                                |
| [pnpm-workspace.yaml](./pnpm-workspace.yaml)                       | Workspace packages and dependency catalog            |
| [vite.config.ts](./vite.config.ts)                                 | Lint, format, staged, and task config (Vite+)        |

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

- `document.modelContext` is the canonical WebMCP v3 surface.
- `navigator.modelContext` is a deprecated compatibility alias.
- `navigator.modelContextTesting` is a compatibility surface for testing only.
- New examples and public documentation use `document.modelContext`.

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
│  Provides document.modelContext when the browser     │
│  doesn't have native support. Keeps the deprecated   │
│  navigator alias and testing shim for compatibility. │
│  no prompts, no resources.                           │
├─────────────────────────────────────────────────────┤
│  Native browser API (if available)                   │
│  document.modelContext provided by the browser.      │
└─────────────────────────────────────────────────────┘
```

### Initialization Flow (`@mcp-b/global`)

1. **Polyfill** — `initializeWebMCPPolyfill()` is called. If a native model context already exists, the polyfill returns early. Otherwise it installs `document.modelContext`, the deprecated navigator alias, and the optional testing shim.
2. **Capture native** — A reference to the current document-first context is saved as `native`.
3. **BrowserMcpServer** — Created with `{ native }`, so core tool operations (`registerTool`, `unregisterTool`, `clearContext`, `provideContext`) mirror down to the underlying context.
4. **Replace** — Both compatibility surfaces expose the `BrowserMcpServer` instance, which adds `registerPrompt`, `registerResource`, `listTools`, `callTool`, and other MCP-B extensions.
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
- `ModelContext` = `ModelContextCore` (the type for `document.modelContext`)
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
