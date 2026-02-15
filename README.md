<div align="center">

# MCP-B NPM Packages

**Official Model Context Protocol implementation for browsers**

[![CI](https://github.com/WebMCP-org/npm-packages/actions/workflows/ci.yml/badge.svg)](https://github.com/WebMCP-org/npm-packages/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/WebMCP-org/npm-packages/graph/badge.svg)](https://codecov.io/gh/WebMCP-org/npm-packages)
[![CodeQL](https://github.com/WebMCP-org/npm-packages/actions/workflows/codeql.yml/badge.svg)](https://github.com/WebMCP-org/npm-packages/actions/workflows/codeql.yml)
[![E2E Tests](https://github.com/WebMCP-org/npm-packages/actions/workflows/e2e.yml/badge.svg)](https://github.com/WebMCP-org/npm-packages/actions/workflows/e2e.yml)
[![OpenSSF Scorecard](https://img.shields.io/ossf-scorecard/github.com/WebMCP-org/npm-packages?label=openssf%20scorecard)](https://scorecard.dev/viewer/?uri=github.com/WebMCP-org/npm-packages)

[![npm version](https://img.shields.io/npm/v/@mcp-b/transports?style=flat-square)](https://www.npmjs.com/org/mcp-b)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue?style=flat-square)](https://www.typescriptlang.org/)
[![TypeScript: Strict](https://img.shields.io/badge/TypeScript-Strict-blue?style=flat-square)](https://www.typescriptlang.org/tsconfig#strict)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg?style=flat-square)](https://pnpm.io/)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Available Packages](#available-packages)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Development](#development)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)
- [Links](#links)

## Overview

This monorepo contains the official NPM packages for MCP-B (Model Context Protocol for Browsers). These packages provide browser-native implementations of the Model Context Protocol, including transports, React integrations, and a polyfill for the emerging Web Model Context API standard.

### Core Capabilities

MCP-B enables bidirectional communication between AI assistants and web applications running in browsers, allowing:

- **Tool Registration**: Web applications can expose tools that AI assistants can discover and invoke
- **Dynamic Integration**: Embedded applications (iframes) can register tools at runtime
- **Browser Transports**: Native browser communication patterns (postMessage, Chrome extension messaging)
- **React Integration**: First-class React hooks for seamless MCP integration
- **Chrome Extension APIs**: Auto-generated tools for browser automation

## Installation

Install packages via npm, pnpm, or yarn:

```bash
# Strict WebMCP core runtime polyfill (spec-aligned surface)
pnpm add @mcp-b/webmcp-polyfill

# Full MCPB runtime (core + MCP bridge extensions)
pnpm add @mcp-b/global

# Strict WebMCP core TypeScript definitions
pnpm add -D @mcp-b/webmcp-types

# React integration (provider and client hooks)
pnpm add @mcp-b/react-webmcp zod

# React hooks for strict core WebMCP API only
pnpm add usewebmcp zod

# Transport layer (for custom integrations)
pnpm add @mcp-b/transports

# Chrome Extension API tools
pnpm add @mcp-b/extension-tools

# DOM extraction for AI
pnpm add @mcp-b/smart-dom-reader
```

## Available Packages

| Package                                                      | Version                                                                                                                     | Description                                                   |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [@mcp-b/webmcp-polyfill](./packages/webmcp-polyfill)         | [![npm](https://img.shields.io/npm/v/@mcp-b/webmcp-polyfill)](https://www.npmjs.com/package/@mcp-b/webmcp-polyfill)         | Strict `navigator.modelContext` WebMCP core polyfill          |
| [@mcp-b/webmcp-types](./packages/webmcp-types)               | [![npm](https://img.shields.io/npm/v/@mcp-b/webmcp-types)](https://www.npmjs.com/package/@mcp-b/webmcp-types)               | Strict WebMCP core TypeScript definitions                     |
| [@mcp-b/global](./packages/global)                           | [![npm](https://img.shields.io/npm/v/@mcp-b/global)](https://www.npmjs.com/package/@mcp-b/global)                           | Full MCPB runtime (WebMCP core + MCP bridge extensions)       |
| [@mcp-b/webmcp-ts-sdk](./packages/webmcp-ts-sdk)             | [![npm](https://img.shields.io/npm/v/@mcp-b/webmcp-ts-sdk)](https://www.npmjs.com/package/@mcp-b/webmcp-ts-sdk)             | TypeScript SDK adapter for MCP with browser-specific features |
| [@mcp-b/transports](./packages/transports)                   | [![npm](https://img.shields.io/npm/v/@mcp-b/transports)](https://www.npmjs.com/package/@mcp-b/transports)                   | Browser transport implementations (Tab, Chrome Extension)     |
| [@mcp-b/react-webmcp](./packages/react-webmcp)               | [![npm](https://img.shields.io/npm/v/@mcp-b/react-webmcp)](https://www.npmjs.com/package/@mcp-b/react-webmcp)               | React hooks for full MCP-B runtime (core + extensions)        |
| [usewebmcp](./packages/usewebmcp)                            | [![npm](https://img.shields.io/npm/v/usewebmcp)](https://www.npmjs.com/package/usewebmcp)                                   | React hooks for strict WebMCP core API only                   |
| [@mcp-b/extension-tools](./packages/extension-tools)         | [![npm](https://img.shields.io/npm/v/@mcp-b/extension-tools)](https://www.npmjs.com/package/@mcp-b/extension-tools)         | Auto-generated MCP tools for Chrome Extension APIs            |
| [@mcp-b/smart-dom-reader](./packages/smart-dom-reader)       | [![npm](https://img.shields.io/npm/v/@mcp-b/smart-dom-reader)](https://www.npmjs.com/package/@mcp-b/smart-dom-reader)       | Token-efficient DOM extraction for AI agents                  |
| [@mcp-b/chrome-devtools-mcp](./packages/chrome-devtools-mcp) | [![npm](https://img.shields.io/npm/v/@mcp-b/chrome-devtools-mcp)](https://www.npmjs.com/package/@mcp-b/chrome-devtools-mcp) | MCP server for Chrome DevTools with WebMCP integration        |
| [@mcp-b/mcp-iframe](./packages/mcp-iframe)                   | [![npm](https://img.shields.io/npm/v/@mcp-b/mcp-iframe)](https://www.npmjs.com/package/@mcp-b/mcp-iframe)                   | Custom element for exposing iframe MCP tools to parent page   |

### Deprecated Packages

| Package                        | Status     | Migration                                                  |
| ------------------------------ | ---------- | ---------------------------------------------------------- |
| ~~@mcp-b/mcp-react-hooks~~     | Deprecated | Use [@mcp-b/react-webmcp](./packages/react-webmcp) instead |
| ~~@mcp-b/mcp-react-hook-form~~ | Removed    | Use custom `useWebMCP` wrappers                            |

## Quick Start

### Using the Web Model Context API

Register tools on `navigator.modelContext` so AI agents can discover and call them:

```ts
import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";

// Initialize the polyfill (skipped automatically when native browser support is available)
initializeWebMCPPolyfill();

const todos: Array<{ id: number; title: string; description?: string }> = [];

// Register a read-only tool
navigator.modelContext.registerTool({
  name: "get_todos",
  description: "Get all todo items",
  inputSchema: {
    type: "object",
    properties: {},
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  execute: async () => ({
    content: [{ type: "text", text: JSON.stringify(todos) }],
  }),
});

// Register a tool with input parameters
navigator.modelContext.registerTool({
  name: "add_todo",
  description: "Add a new todo item",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Todo title" },
      description: { type: "string", description: "Optional description" },
    },
    required: ["title"],
  },
  execute: async (args) => {
    const newTodo = { id: Date.now(), ...args };
    todos.push(newTodo);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, todo: newTodo }),
        },
      ],
    };
  },
});
```

### Consuming Tools as a Client

```tsx
import { McpClientProvider, useMcpClient } from "@mcp-b/react-webmcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { TabClientTransport } from "@mcp-b/transports";

const client = new Client({ name: "MyApp", version: "1.0.0" });
const transport = new TabClientTransport("mcp", { clientInstanceId: "my-app" });

function App() {
  return (
    <McpClientProvider client={client} transport={transport}>
      <ToolConsumer />
    </McpClientProvider>
  );
}

function ToolConsumer() {
  const { client, tools, isConnected } = useMcpClient();

  const callTool = async () => {
    const result = await client.callTool({
      name: "get_todos",
      arguments: {},
    });
    console.log(result);
  };

  return (
    <div>
      <p>Connected: {isConnected ? "Yes" : "No"}</p>
      <p>Available tools: {tools.length}</p>
      <button onClick={callTool}>Call get_todos</button>
    </div>
  );
}
```

## Architecture

The MCP-B packages are organized into functional layers:

### Core Layer

- **@mcp-b/webmcp-polyfill** - Strict WebMCP core polyfill for `navigator.modelContext`
- **@mcp-b/webmcp-types** - Strict WebMCP core TypeScript definitions
- **@mcp-b/global** - Full MCPB runtime with bridge-oriented extension APIs
- **@mcp-b/webmcp-ts-sdk** - TypeScript SDK adapter with browser-specific features

### Transport Layer

- **@mcp-b/transports** - Communication between MCP servers and clients
  - `TabClientTransport` / `TabServerTransport` - Same-page communication
  - `ExtensionClientTransport` / `ExtensionServerTransport` - Chrome extension messaging

### Integration Layer

- **@mcp-b/react-webmcp** - React hooks for MCP-B runtime (core + extensions)
- **usewebmcp** - React hooks for strict WebMCP core only

### Tools & Utilities

- **@mcp-b/extension-tools** - Pre-built tools for Chrome Extension APIs
- **@mcp-b/smart-dom-reader** - AI-friendly DOM extraction

### Dependency Graph

```
webmcp-types          (canonical type definitions)
├── webmcp-polyfill   (canonical runtime polyfill)
├── webmcp-ts-sdk     (TypeScript SDK adapter)
├── transports        (browser transports)
│   ├── mcp-iframe    (iframe custom element)
│   └── global        (full MCP-B runtime)
│       └── react-webmcp (React hooks for MCP-B)
└── usewebmcp         (React hooks for strict core)
```

Standalone packages: `extension-tools`, `smart-dom-reader`, `chrome-devtools-mcp`.

## Development

This monorepo uses pnpm workspaces with Turbo for build orchestration and Changesets for version management.

### Prerequisites

- Node.js >= 22.12 (see `.nvmrc`)
- pnpm >= 10.0.0

### Getting Started

```bash
# Clone the repository
git clone https://github.com/WebMCP-org/npm-packages.git
cd npm-packages

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run type checking
pnpm typecheck

# Run linting and formatting
pnpm check

# Run tests
pnpm test
```

### Workspace Commands

```bash
# Build specific package
pnpm --filter @mcp-b/transports build

# Run tests for specific package
pnpm --filter mcp-e2e-tests test

# Add dependency to a package
pnpm --filter @mcp-b/react-webmcp add zod
```

## Documentation

| Document                                                           | Purpose                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------- |
| [CONTRIBUTING.md](./CONTRIBUTING.md)                               | How to contribute: setup, PR process, commit format     |
| [CLAUDE.md](./CLAUDE.md)                                           | Quick reference for AI agents working in this repo      |
| [AI Contribution Manifesto](./docs/AI_CONTRIBUTION_MANIFESTO.md)   | Safety rules and code quality bar                       |
| [Package Philosophy](./docs/MCPB_PACKAGE_PHILOSOPHY.md)            | Package boundaries and layering model                   |
| [Testing Philosophy](./docs/TESTING_PHILOSOPHY.md)                 | Test layers, mocking policy, coverage expectations      |
| [E2E Testing](./docs/TESTING.md)                                   | Playwright setup, test apps, debugging                  |
| [Relevant Links](./docs/RELEVANT_LINKS.md)                         | Curated external best practices for contributors        |
| [Global Package Guide](./docs/global-guide.md)                     | Advanced usage for @mcp-b/global                        |
| [React WebMCP Guide](./docs/react-webmcp-guide.md)                 | Advanced usage for @mcp-b/react-webmcp                  |
| [Framework Examples](./examples/frameworks/README.md)              | Minimal WebMCP API usage in popular frontend frameworks |
| [WebMCP Alignment Matrix](./docs/plans/WEBMCP_ALIGNMENT_MATRIX.md) | Spec vs native vs polyfill parity tracking              |

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

[MIT License](./LICENSE) - See LICENSE file for details.

## Links

- [WebMCP Documentation](https://docs.mcp-b.ai)
- [W3C WebMCP Proposal](https://github.com/webmachinelearning/webmcp)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [GitHub Repository](https://github.com/WebMCP-org/npm-packages)
- [npm Organization](https://www.npmjs.com/org/mcp-b)
- [Issue Tracker](https://github.com/WebMCP-org/npm-packages/issues)
