<div align="center">

# MCP-B NPM Packages

**Official Model Context Protocol implementation for browsers**

[![npm version](https://img.shields.io/npm/v/@mcp-b/transports?style=flat-square)](https://www.npmjs.com/org/mcp-b)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue?style=flat-square)](https://www.typescriptlang.org/)
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
# Web Model Context API polyfill (recommended starting point)
pnpm add @mcp-b/global

# React integration (provider and client hooks)
pnpm add @mcp-b/react-webmcp zod

# Transport layer (for custom integrations)
pnpm add @mcp-b/transports

# Chrome Extension API tools
pnpm add @mcp-b/extension-tools

# DOM extraction for AI
pnpm add @mcp-b/smart-dom-reader
```

## Available Packages

| Package | Version | Description |
|---------|---------|-------------|
| [@mcp-b/global](./packages/global) | [![npm](https://img.shields.io/npm/v/@mcp-b/global)](https://www.npmjs.com/package/@mcp-b/global) | Navigator.modelContext polyfill - implements the Web Model Context API |
| [@mcp-b/webmcp-ts-sdk](./packages/webmcp-ts-sdk) | [![npm](https://img.shields.io/npm/v/@mcp-b/webmcp-ts-sdk)](https://www.npmjs.com/package/@mcp-b/webmcp-ts-sdk) | TypeScript SDK adapter for MCP with browser-specific features |
| [@mcp-b/transports](./packages/transports) | [![npm](https://img.shields.io/npm/v/@mcp-b/transports)](https://www.npmjs.com/package/@mcp-b/transports) | Browser transport implementations (Tab, Chrome Extension) |
| [@mcp-b/react-webmcp](./packages/react-webmcp) | [![npm](https://img.shields.io/npm/v/@mcp-b/react-webmcp)](https://www.npmjs.com/package/@mcp-b/react-webmcp) | React hooks for registering and consuming MCP tools |
| [@mcp-b/extension-tools](./packages/extension-tools) | [![npm](https://img.shields.io/npm/v/@mcp-b/extension-tools)](https://www.npmjs.com/package/@mcp-b/extension-tools) | Auto-generated MCP tools for Chrome Extension APIs |
| [@mcp-b/smart-dom-reader](./packages/smart-dom-reader) | [![npm](https://img.shields.io/npm/v/@mcp-b/smart-dom-reader)](https://www.npmjs.com/package/@mcp-b/smart-dom-reader) | Token-efficient DOM extraction for AI agents |
| [@mcp-b/chrome-devtools-mcp](./packages/chrome-devtools-mcp) | [![npm](https://img.shields.io/npm/v/@mcp-b/chrome-devtools-mcp)](https://www.npmjs.com/package/@mcp-b/chrome-devtools-mcp) | MCP server for Chrome DevTools with WebMCP integration |
| [@mcp-b/mcp-iframe](./packages/mcp-iframe) | [![npm](https://img.shields.io/npm/v/@mcp-b/mcp-iframe)](https://www.npmjs.com/package/@mcp-b/mcp-iframe) | Custom element for exposing iframe MCP tools to parent page |
| [@webmcp/helpers](./packages/webmcp-helpers) | [![npm](https://img.shields.io/npm/v/@webmcp/helpers)](https://www.npmjs.com/package/@webmcp/helpers) | DOM and response helpers for WebMCP userscript development |

### Alias Packages

| Package | Description |
|---------|-------------|
| [usewebmcp](./packages/usewebmcp) | Shorter alias for @mcp-b/react-webmcp |

### Deprecated Packages

| Package | Status | Migration |
|---------|--------|-----------|
| ~~@mcp-b/mcp-react-hooks~~ | Deprecated | Use [@mcp-b/react-webmcp](./packages/react-webmcp) instead |
| ~~@mcp-b/mcp-react-hook-form~~ | Removed | Use custom `useWebMCP` wrappers |

## Quick Start

### Using the Web Model Context API

The easiest way to get started is with the `@mcp-b/global` polyfill and `@mcp-b/react-webmcp` hooks:

```tsx
// App entry point - initialize the polyfill
import '@mcp-b/global';
import { useWebMCP } from '@mcp-b/react-webmcp';
import { z } from 'zod';

function TodoApp() {
  const [todos, setTodos] = useState([]);

  // Register a tool that AI agents can call
  useWebMCP({
    name: 'get_todos',
    description: 'Get all todo items',
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    handler: async () => {
      return { todos };
    },
  });

  useWebMCP({
    name: 'add_todo',
    description: 'Add a new todo item',
    inputSchema: {
      title: z.string().describe('Todo title'),
      description: z.string().optional().describe('Optional description'),
    },
    annotations: {
      readOnlyHint: false,
    },
    handler: async (input) => {
      const newTodo = { id: Date.now(), ...input };
      setTodos([...todos, newTodo]);
      return { success: true, todo: newTodo };
    },
  });

  return <div>{/* Your UI */}</div>;
}
```

### Consuming Tools as a Client

```tsx
import { McpClientProvider, useMcpClient } from '@mcp-b/react-webmcp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { TabClientTransport } from '@mcp-b/transports';

const client = new Client({ name: 'MyApp', version: '1.0.0' });
const transport = new TabClientTransport('mcp', { clientInstanceId: 'my-app' });

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
      name: 'get_todos',
      arguments: {}
    });
    console.log(result);
  };

  return (
    <div>
      <p>Connected: {isConnected ? 'Yes' : 'No'}</p>
      <p>Available tools: {tools.length}</p>
      <button onClick={callTool}>Call get_todos</button>
    </div>
  );
}
```

## Architecture

The MCP-B packages are organized into functional layers:

### Core Layer
- **@mcp-b/global** - Polyfill for `navigator.modelContext` (Web Model Context API)
- **@mcp-b/webmcp-ts-sdk** - TypeScript SDK adapter with browser-specific features

### Transport Layer
- **@mcp-b/transports** - Communication between MCP servers and clients
  - `TabClientTransport` / `TabServerTransport` - Same-page communication
  - `ExtensionClientTransport` / `ExtensionServerTransport` - Chrome extension messaging

### Integration Layer
- **@mcp-b/react-webmcp** - React hooks for tool registration and consumption

### Tools & Utilities
- **@mcp-b/extension-tools** - Pre-built tools for Chrome Extension APIs
- **@mcp-b/smart-dom-reader** - AI-friendly DOM extraction

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

- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines
- [CLAUDE.md](./CLAUDE.md) - Developer guidance for Claude Code
- [docs/TESTING.md](./docs/TESTING.md) - Testing documentation
- [docs/](./docs) - Additional technical documentation

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Create a feature branch
2. Make your changes
3. Run `pnpm check-all` to verify code quality
4. Create a changeset: `pnpm changeset`
5. Submit a pull request

## License

[MIT License](./LICENSE) - See LICENSE file for details.

## Links

- [GitHub Repository](https://github.com/WebMCP-org/npm-packages)
- [npm Organization](https://www.npmjs.com/org/mcp-b)
- [Issue Tracker](https://github.com/WebMCP-org/npm-packages/issues)
