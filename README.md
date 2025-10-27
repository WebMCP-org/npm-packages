# MCP-B NPM Packages 📦

[![npm version](https://img.shields.io/npm/v/@mcp-b/transports?style=flat-square)](https://www.npmjs.com/org/mcp-b)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=flat-square)](https://www.typescriptlang.org/)

This monorepo contains the official NPM packages for MCP-B (Model Context Protocol for Browsers). These packages provide the core functionality for implementing MCP in browser environments, including a polyfill for the emerging Web Model Context API standard.

## 📥 Installation

Install the packages you need via npm, yarn, or pnpm:

```bash
# Navigator.modelContext polyfill (recommended starting point)
pnpm add @mcp-b/global

# React integration (provider & client hooks)
pnpm add @mcp-b/react-webmcp zod

# Transport layer (if building custom integrations)
pnpm add @mcp-b/transports

# Chrome Extension API tools
pnpm add @mcp-b/extension-tools

# DOM extraction for AI
pnpm add @mcp-b/smart-dom-reader
```

## 📦 Available Packages

| Package | Version | Description |
|---------|---------|-------------|
| [@mcp-b/global](./global) | [![npm](https://img.shields.io/npm/v/@mcp-b/global)](https://www.npmjs.com/package/@mcp-b/global) | Navigator.modelContext polyfill - implements the Web Model Context API |
| [@mcp-b/webmcp-ts-sdk](./webmcp-ts-sdk) | [![npm](https://img.shields.io/npm/v/@mcp-b/webmcp-ts-sdk)](https://www.npmjs.com/package/@mcp-b/webmcp-ts-sdk) | TypeScript SDK adapter for MCP with browser-specific features |
| [@mcp-b/transports](./transports) | [![npm](https://img.shields.io/npm/v/@mcp-b/transports)](https://www.npmjs.com/package/@mcp-b/transports) | Browser transport implementations (Tab, Chrome Extension) |
| [@mcp-b/react-webmcp](./react-webmcp) | [![npm](https://img.shields.io/npm/v/@mcp-b/react-webmcp)](https://www.npmjs.com/package/@mcp-b/react-webmcp) | React hooks for registering and consuming MCP tools |
| [@mcp-b/extension-tools](./extension-tools) | [![npm](https://img.shields.io/npm/v/@mcp-b/extension-tools)](https://www.npmjs.com/package/@mcp-b/extension-tools) | Auto-generated MCP tools for Chrome Extension APIs |
| [@mcp-b/smart-dom-reader](./smart-dom-reader) | [![npm](https://img.shields.io/npm/v/@mcp-b/smart-dom-reader)](https://www.npmjs.com/package/@mcp-b/smart-dom-reader) | Token-efficient DOM extraction for AI agents |

### Deprecated Packages

| Package | Status | Migration |
|---------|--------|-----------|
| ~~@mcp-b/mcp-react-hooks~~ | ⚠️ Deprecated | Use [@mcp-b/react-webmcp](./react-webmcp) instead |
| ~~@mcp-b/mcp-react-hook-form~~ | ⚠️ Removed | Use custom `useWebMCP` wrappers |

## 🚀 Quick Start

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

## 🏗️ Architecture

The MCP-B packages are organized into layers:

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

## 🔧 Development

This is a pnpm workspace monorepo using Turbo for build orchestration.

### Prerequisites

- Node.js >= 22.12 (see `.nvmrc`)
- pnpm >= 10.0.0

### Getting Started

```bash
# Clone the repository
git clone https://github.com/WebMCP-org/WebMCP.git
cd WebMCP/npm-packages

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

## 📚 Documentation

- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines
- [CLAUDE.md](./CLAUDE.md) - Developer guidance for Claude Code
- [TESTING.md](./TESTING.md) - Testing documentation

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Create a feature branch
2. Make your changes
3. Run `pnpm check-all` to verify code quality
4. Create a changeset: `pnpm changeset`
5. Submit a pull request

## 📄 License

MIT © WebMCP Team

## 🔗 Links

- [GitHub Repository](https://github.com/WebMCP-org/WebMCP)
- [npm Organization](https://www.npmjs.com/org/mcp-b)
- [Issue Tracker](https://github.com/WebMCP-org/WebMCP/issues)
