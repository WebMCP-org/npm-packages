<div align="center">

# MCP-B WebMCP packages

**MCP-B (`@mcp-b`) is a polyfill and MCP bridge for the [Web Model Context API](https://webmachinelearning.github.io/webmcp/) (`document.modelContext`).**

<p>
  <a href="https://webmachinelearning.github.io/webmcp/"><img src="https://img.shields.io/badge/W3C-WebMCP%20Spec-005A9C?style=flat-square" alt="W3C WebMCP Spec"></a>
  <a href="https://www.npmjs.com/org/mcp-b"><img src="https://img.shields.io/npm/v/@mcp-b/global?style=flat-square&label=latest" alt="npm version"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License: MIT"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.8+-blue?style=flat-square" alt="TypeScript"></a>
</p>

<p>
  <a href="https://github.com/WebMCP-org/npm-packages/actions/workflows/ci.yml"><img src="https://github.com/WebMCP-org/npm-packages/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://codecov.io/gh/WebMCP-org/npm-packages"><img src="https://codecov.io/gh/WebMCP-org/npm-packages/branch/main/graph/badge.svg" alt="codecov"></a>
  <a href="https://github.com/WebMCP-org/npm-packages/actions/workflows/e2e.yml"><img src="https://github.com/WebMCP-org/npm-packages/actions/workflows/e2e.yml/badge.svg" alt="E2E Tests"></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/WebMCP-org/npm-packages"><img src="https://img.shields.io/ossf-scorecard/github.com/WebMCP-org/npm-packages?label=openssf%20scorecard" alt="OpenSSF Scorecard"></a>
</p>

</div>

---

## The Web Standard

The [Web Model Context API](https://webmachinelearning.github.io/webmcp/) is a [W3C Community Group](https://www.w3.org/community/webmachinelearning/) draft spec. It makes every browser tab a **tool source** — web pages register tools that AI agents can discover and call:

```
document.modelContext
├── .registerTool(tool, { signal })  Register a tool for AI agents
└── .getTools()                      Discover registered tools

Chrome preview extension
└── .executeTool(tool, inputJson)    Execute a discovered tool
```

MCP-B **polyfills** that API for all browsers today, and **bridges** it to the full [Model Context Protocol](https://modelcontextprotocol.io/) — turning that tool source into a complete MCP server with prompts, resources, and browser transports.

> Built by [MCP-B](https://mcp-b.ai/) with [implementation guides and package documentation](https://docs.mcp-b.ai/). Not an official W3C or MCP project.

## Getting Started

### 1. Use the web standard directly

If you're running Chrome with [`--enable-experimental-web-platform-features`](./e2e/web-standards-showcase/CHROMIUM_FLAGS.md), `document.modelContext` is already there. Just use it:

Add `@mcp-b/webmcp-types` (`pnpm add -D @mcp-b/webmcp-types`) for input schema inference:

```ts
await document.modelContext.registerTool({
  name: 'add_todo',
  description: 'Add a new todo item',
  inputSchema: {
    type: 'object',
    properties: { title: { type: 'string' }, done: { type: 'boolean' } },
    required: ['title'],
  } as const, // ← args inferred: { title: string; done?: boolean }
  execute: async (args) => ({ id: Date.now(), title: args.title }),
});
```

### 2. Polyfill it

Want it to work in **any browser** without the Chrome flag? Add the polyfill — same API, same code:

```ts
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill'; // pnpm add @mcp-b/webmcp-polyfill

initializeWebMCPPolyfill(); // no-op if native support exists

await document.modelContext.registerTool({
  name: 'get_page_title',
  description: 'Returns the current page title',
  inputSchema: { type: 'object', properties: {} },
  execute: async () => ({
    content: [{ type: 'text', text: document.title }],
  }),
});
```

Or with React: `pnpm add usewebmcp`

```tsx
import { useWebMCP } from 'usewebmcp';

function PageTitle() {
  useWebMCP({
    name: 'get_page_title',
    description: 'Returns the current page title',
    execute: async () => ({ title: document.title }),
  });
  // ...
}
```

### 3. Full MCP server

Need the full [Model Context Protocol](https://modelcontextprotocol.io/) — prompts, resources, transports, and interop with Claude Desktop, Cursor, or another MCP client? Use `@mcp-b/global`:

```ts
import '@mcp-b/global'; // pnpm add @mcp-b/global

// Same registerTool API — now backed by a full MCP server
await document.modelContext.registerTool({
  name: 'add_todo',
  description: 'Add a new todo item',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Todo title' },
    },
    required: ['title'],
  },
  execute: async (args) => {
    const todo = { id: Date.now(), ...args };
    return { content: [{ type: 'text', text: JSON.stringify(todo) }] };
  },
});
```

Or as a script tag (zero build step):

```html
<script src="https://unpkg.com/@mcp-b/global/dist/index.iife.js"></script>
<script type="module">
  await document.modelContext.registerTool({
    /* ... */
  });
</script>
```

Or with React: `pnpm add @mcp-b/global @mcp-b/react-webmcp`

```tsx
import '@mcp-b/global';
import { useWebMCP } from '@mcp-b/react-webmcp';

function TodoApp({ todos, addTodo }) {
  useWebMCP({
    name: 'add_todo',
    description: 'Add a new todo item',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Todo title' },
      },
      required: ['title'],
    } as const,
    execute: async ({ title }) => {
      addTodo(title);
      return { success: true };
    },
  });

  return (
    <ul>
      {todos.map((t) => (
        <li key={t.id}>{t.title}</li>
      ))}
    </ul>
  );
}
```

## Call Those Tools

Three ways for AI agents to discover and call your tools:

```
┌─────────────────────────────────────────────────────────┐
│  Your website                                           │
│  document.modelContext.registerTool({ ... })             │
└────────┬────────────────────┬───────────────────┬───────┘
         │                    │                   │
    ┌────▼─────┐    ┌────────▼────────┐   ┌─────▼──────┐
    │  MCP-B   │    │  Chrome Native  │   │   Local    │
    │Extension │    │  (experimental) │   │   Relay    │
    └────┬─────┘    └────────┬────────┘   └─────┬──────┘
         │                   │                   │
         ▼                   ▼                   ▼
    AI agent in         Browser's            Claude Desktop
    browser             built-in agent       Cursor, VS Code
```

**Rook** — [Install it from the Chrome Web Store](https://chromewebstore.google.com/detail/opojeelojlkcinlhkbahpcekdolfjmhi). It discovers tools exposed by pages and connects them to extension-side agent experiences.

**Chrome Native** — Enable at `chrome://flags` → _Experimental Web Platform features_, or:

```bash
google-chrome --enable-experimental-web-platform-features
```

See [Chromium flags reference](./e2e/web-standards-showcase/CHROMIUM_FLAGS.md) for macOS / Windows / Linux commands.

**Local Relay** — Add to your MCP client config (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "webmcp-local-relay": {
      "command": "npx",
      "args": ["-y", "@mcp-b/webmcp-local-relay@latest"]
    }
  }
}
```

Any website running `@mcp-b/global` becomes callable from your desktop AI agent. See the [relay README](./packages/webmcp-local-relay) for details.

## Which Package?

| I want to…                       | Package                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------ |
| Add tools to my site (simplest)  | [`@mcp-b/global`](./packages/global)                                           |
| Just the polyfill, no MCP bridge | [`@mcp-b/webmcp-polyfill`](./packages/webmcp-polyfill)                         |
| Register tools from React        | [`@mcp-b/react-webmcp`](./packages/react-webmcp)                               |
| Add WebMCP from an extension     | [`@mcp-b/webmcp-extension`](./packages/webmcp-extension)                       |
| Forward tools to local AI agents | [`@mcp-b/webmcp-local-relay`](./packages/webmcp-local-relay)                   |
| Control Chrome from an AI agent  | [`chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp) |
| Just the TypeScript types        | [`@mcp-b/webmcp-types`](./packages/webmcp-types)                               |

Chrome DevTools integration now lives entirely upstream; its WebMCP changes have all landed there.

---

## Installation

```bash
# Full runtime: polyfill + MCP bridge (most users start here)
pnpm add @mcp-b/global

# Strict WebMCP core polyfill only (no MCP extensions)
pnpm add @mcp-b/webmcp-polyfill

# TypeScript definitions (dev dependency)
pnpm add -D @mcp-b/webmcp-types

# React hooks for full runtime
pnpm add @mcp-b/react-webmcp

# React hooks for strict WebMCP core only
pnpm add usewebmcp

# Transport layer (custom integrations)
pnpm add @mcp-b/transports

# Chromium extension template and content-script client
pnpm add @mcp-b/global @mcp-b/webmcp-extension

# DOM extraction for AI
pnpm add @mcp-b/smart-dom-reader
```

## All Packages

### Core

| Package                                              | Version                                                                                                             | Description                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [@mcp-b/webmcp-polyfill](./packages/webmcp-polyfill) | [![npm](https://img.shields.io/npm/v/@mcp-b/webmcp-polyfill)](https://www.npmjs.com/package/@mcp-b/webmcp-polyfill) | `document.modelContext` polyfill, with a deprecated navigator alias  |
| [@mcp-b/webmcp-types](./packages/webmcp-types)       | [![npm](https://img.shields.io/npm/v/@mcp-b/webmcp-types)](https://www.npmjs.com/package/@mcp-b/webmcp-types)       | TypeScript definitions for the WebMCP core API                       |
| [@mcp-b/global](./packages/global)                   | [![npm](https://img.shields.io/npm/v/@mcp-b/global)](https://www.npmjs.com/package/@mcp-b/global)                   | Full runtime — polyfill + MCP bridge (prompts, resources, transport) |
| [@mcp-b/webmcp-ts-sdk](./packages/webmcp-ts-sdk)     | [![npm](https://img.shields.io/npm/v/@mcp-b/webmcp-ts-sdk)](https://www.npmjs.com/package/@mcp-b/webmcp-ts-sdk)     | Browser-adapted MCP TypeScript SDK with dynamic tool registration    |

### Transports & Composition

| Package                                                    | Version                                                                                                                   | Description                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [@mcp-b/transports](./packages/transports)                 | [![npm](https://img.shields.io/npm/v/@mcp-b/transports)](https://www.npmjs.com/package/@mcp-b/transports)                 | `postMessage`, iframe, and Chrome extension transports                   |
| [@mcp-b/webmcp-extension](./packages/webmcp-extension)     | [![npm](https://img.shields.io/npm/v/@mcp-b/webmcp-extension)](https://www.npmjs.com/package/@mcp-b/webmcp-extension)     | MV3 template and isolated content-script client for page tools           |
| [@mcp-b/mcp-iframe](./packages/mcp-iframe)                 | [![npm](https://img.shields.io/npm/v/@mcp-b/mcp-iframe)](https://www.npmjs.com/package/@mcp-b/mcp-iframe)                 | Web component for exposing iframe tools, resources, and prompts          |
| [@mcp-b/webmcp-local-relay](./packages/webmcp-local-relay) | [![npm](https://img.shields.io/npm/v/@mcp-b/webmcp-local-relay)](https://www.npmjs.com/package/@mcp-b/webmcp-local-relay) | Localhost relay — forwards website tools to Claude Desktop, Cursor, etc. |

### React

| Package                                        | Version                                                                                                       | Description                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [@mcp-b/react-webmcp](./packages/react-webmcp) | [![npm](https://img.shields.io/npm/v/@mcp-b/react-webmcp)](https://www.npmjs.com/package/@mcp-b/react-webmcp) | React hooks for full runtime (register tools + consume MCP servers) |
| [usewebmcp](./packages/usewebmcp)              | [![npm](https://img.shields.io/npm/v/usewebmcp)](https://www.npmjs.com/package/usewebmcp)                     | React hooks for strict WebMCP core only                             |

### Browser Tooling

| Package                                                | Version                                                                                                               | Description                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| [@mcp-b/smart-dom-reader](./packages/smart-dom-reader) | [![npm](https://img.shields.io/npm/v/@mcp-b/smart-dom-reader)](https://www.npmjs.com/package/@mcp-b/smart-dom-reader) | Token-efficient DOM extraction for AI agents |

<details>
<summary>Deprecated packages</summary>

| Package                        | Status     | Migration                                                                                                                                                   |
| ------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~@mcp-b/mcp-react-hooks~~     | Deprecated | Use [@mcp-b/react-webmcp](./packages/react-webmcp) instead                                                                                                  |
| ~~@mcp-b/mcp-react-hook-form~~ | Removed    | Use custom `useWebMCP` wrappers                                                                                                                             |
| ~~@mcp-b/codemode~~            | Removed    | Use [Cloudflare Code Mode](https://github.com/cloudflare/agents/tree/main/packages/codemode); browser APIs are exported from `@cloudflare/codemode/browser` |

</details>

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Your web app                                            │
│  document.modelContext.registerTool({ ... })              │
├────────────── @mcp-b/global ─────────────────────────────┤
│  MCP bridge: prompts, resources, browser transports      │
├────────────── @mcp-b/webmcp-ts-sdk ──────────────────────┤
│  BrowserMcpServer — wraps native/polyfill context        │
├────────────── @mcp-b/webmcp-polyfill ────────────────────┤
│  WebMCP core + optional Chrome executeTool extension    │
├──────────────────────────────────────────────────────────┤
│  Native browser API (when available)                     │
└──────────────────────────────────────────────────────────┘
         ▲                              ▲
         │ postMessage / extension      │ WebSocket
         ▼                              ▼
   AI agent in browser            Local AI agent
   (extension, tab)          (Claude Desktop, Cursor)
```

### Dependency Graph

```
webmcp-types          (canonical type definitions)
└── webmcp-polyfill   (canonical runtime polyfill)
    ├── webmcp-ts-sdk (TypeScript SDK adapter)
    │   ├── global    (full runtime; also uses transports)
    │   ├── mcp-iframe (iframe element; also uses transports)
    │   └── react-webmcp (also uses usewebmcp; pair with global at app level)
    └── usewebmcp     (React hooks for strict core)

transports            (browser transports shared by integrations)
└── webmcp-extension  (MV3 template and isolated content-script client)
```

Standalone packages: `smart-dom-reader`, `webmcp-local-relay`.

## Development

```bash
git clone https://github.com/WebMCP-org/npm-packages.git
cd npm-packages
pnpm install
pnpm build
```

| Command                     | What it does                      |
| --------------------------- | --------------------------------- |
| `pnpm build`                | Build all packages                |
| `pnpm typecheck`            | Type-check all packages           |
| `pnpm check`                | Lint + format (Oxlint + Oxfmt)    |
| `pnpm test:unit`            | Unit tests                        |
| `pnpm test:e2e`             | E2E tests (Playwright)            |
| `pnpm test`                 | All tests                         |
| `pnpm --filter <pkg> build` | Build a single package            |
| `pnpm --filter <pkg> test`  | Test a single package             |
| `pnpm changeset`            | Create a changeset for versioning |

**Prerequisites:** Node.js >= 22.12 (see `.nvmrc`), pnpm >= 10

## Documentation

| Document                                                         | Purpose                                             |
| ---------------------------------------------------------------- | --------------------------------------------------- |
| [CONTRIBUTING.md](./CONTRIBUTING.md)                             | How to contribute: setup, PR process, commit format |
| [AGENTS.md](./AGENTS.md)                                         | Quick reference for AI agents working in this repo  |
| [Package Philosophy](./docs/MCPB_PACKAGE_PHILOSOPHY.md)          | Package boundaries and layering model               |
| [Testing Philosophy](./docs/TESTING_PHILOSOPHY.md)               | Test layers, mocking policy, coverage expectations  |
| [E2E Testing](./docs/TESTING.md)                                 | Playwright setup, test apps, debugging              |
| [@mcp-b/global guide](./docs/global-guide.md)                    | Advanced usage for the full runtime                 |
| [AI Contribution Manifesto](./docs/AI_CONTRIBUTION_MANIFESTO.md) | Safety rules and code quality bar                   |
| [Relevant Links](./docs/RELEVANT_LINKS.md)                       | Curated external best practices for contributors    |

## Contributing

Contributions welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

[MIT](./LICENSE)

## Links

- [What is WebMCP?](https://docs.mcp-b.ai/explanation/what-is-webmcp)
- [MCP-b Documentation](https://docs.mcp-b.ai)
- [Rook browser extension](https://chromewebstore.google.com/detail/opojeelojlkcinlhkbahpcekdolfjmhi)
- [W3C WebMCP Spec](https://webmachinelearning.github.io/webmcp/)
- [W3C Web Machine Learning Community Group](https://www.w3.org/community/webmachinelearning/)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Chromium WebMCP Implementation](./e2e/web-standards-showcase/CHROMIUM_FLAGS.md)
- [npm: @mcp-b](https://www.npmjs.com/org/mcp-b)
- [GitHub Repository](https://github.com/WebMCP-org/npm-packages)
- [Issue Tracker](https://github.com/WebMCP-org/npm-packages/issues)
