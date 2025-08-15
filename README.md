# MCP-B NPM Packages 📦

[![npm version](https://img.shields.io/npm/v/@mcp-b/transports?style=flat-square)](https://www.npmjs.com/org/mcp-b)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=flat-square)](https://www.typescriptlang.org/)

This monorepo contains the official NPM packages for MCP-B (Model Context Protocol for Browsers). These packages provide the core functionality for implementing MCP in browser environments.

## 📥 Installation

Install the packages you need via npm, yarn, or pnpm:

```bash
# Core transport layer (required)
npm install @mcp-b/transports

# React integration
npm install @mcp-b/mcp-react-hooks

# Chrome Extension API tools
npm install @mcp-b/extension-tools
```

## 📦 Available Packages

| Package | NPM | Description | Documentation |
|---------|-----|-------------|---------------|
| [@mcp-b/transports](./transports) | [![npm](https://img.shields.io/npm/v/@mcp-b/transports)](https://www.npmjs.com/package/@mcp-b/transports) | Browser-specific MCP transport implementations | [Docs](./transports/README.md) |
| [@mcp-b/mcp-react-hooks](./mcp-react-hooks) | [![npm](https://img.shields.io/npm/v/@mcp-b/mcp-react-hooks)](https://www.npmjs.com/package/@mcp-b/mcp-react-hooks) | React hooks for MCP integration | [Docs](./mcp-react-hooks/README.md) |
| [@mcp-b/extension-tools](./extension-tools) | [![npm](https://img.shields.io/npm/v/@mcp-b/extension-tools)](https://www.npmjs.com/package/@mcp-b/extension-tools) | MCP tools for Chrome Extension APIs | [Docs](./extension-tools/README.md) |
| [@mcp-b/mcp-react-hook-form](./mcp-react-hook-form) | [![npm](https://img.shields.io/npm/v/@mcp-b/mcp-react-hook-form)](https://www.npmjs.com/package/@mcp-b/mcp-react-hook-form) | React Hook Form integration for MCP | [Docs](./mcp-react-hook-form/README.md) |
| [@mcp-b/global](./global) | Internal | Global type definitions | Internal use |

## 🚀 Quick Start

### Basic Usage with Vanilla JavaScript

```typescript
import { TabServerTransport } from "@mcp-b/transports";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Create MCP server
const server = new McpServer({
  name: "my-website",
  version: "1.0.0",
});

// Add tools
server.tool("getTodos", "Get all todos", {}, async () => {
  // Your tool implementation
  return { content: [{ type: "text", text: "Todo items..." }] };
});

// Connect transport
await server.connect(new TabServerTransport({ allowedOrigins: ["*"] }));
```

### React Integration

```tsx
import { useMcpClient } from "@mcp-b/mcp-react-hooks";

function MyComponent() {
  const { client, connected, tools } = useMcpClient();
  
  // Use MCP tools in your React app
  const handleClick = async () => {
    const result = await client.callTool("getTodos", {});
    console.log(result);
  };
  
  return <button onClick={handleClick}>Get Todos</button>;
}
```

## 🏗️ Architecture

These packages implement the Model Context Protocol for browser environments:

- **Transports**: Handle communication between MCP servers and clients using browser-specific mechanisms (postMessage, Chrome runtime messaging)
- **React Hooks**: Provide React-friendly APIs for MCP integration
- **Extension Tools**: Auto-generated tools for Chrome Extension APIs
- **React Hook Form**: Integration with React Hook Form for form handling

## 🔧 Development

This is a pnpm workspace monorepo using Turbo for build orchestration.

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

# Development mode with watch
pnpm dev
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm build` | Build all packages |
| `pnpm dev` | Start development mode with watch |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm check` | Run Biome linting and formatting (with fixes) |
| `pnpm check:ci` | Run Biome checks (CI mode) |
| `pnpm changeset` | Create a new changeset |
| `pnpm changeset:version` | Update versions based on changesets |
| `pnpm changeset:publish` | Build and publish packages to npm |

### Code Quality

- **Linting & Formatting**: We use [Biome](https://biomejs.dev/) for fast, unified linting and formatting
- **Pre-commit Hooks**: Automatic formatting via Husky and lint-staged
- **Type Safety**: Full TypeScript with strict mode enabled
- **CI/CD**: GitHub Actions for automated testing and publishing

### Publishing

We use [changesets](https://github.com/changesets/changesets) for version management:

```bash
# 1. Create a changeset for your changes
pnpm changeset

# 2. Commit the changeset file
git add .changeset/*.md
git commit -m "Add changeset"

# 3. Push to main branch
git push origin main

# GitHub Actions will automatically:
# - Create a Version PR
# - Update versions when merged
# - Publish to npm
```

## 📚 Documentation

- [Main MCP-B Documentation](https://mcp-b.ai)
- [Examples Repository](https://github.com/WebMCP-org/examples)
- [Main WebMCP Repository](https://github.com/WebMCP-org/WebMCP)
- [Model Context Protocol Spec](https://modelcontextprotocol.io/)

## 🤝 Contributing

Contributions are welcome! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

## 📄 License

MIT - see [LICENSE](./LICENSE) for details.

## 🔗 Links

- [NPM Organization](https://www.npmjs.com/org/mcp-b)
- [GitHub Organization](https://github.com/WebMCP-org)
- [Discord Community](https://discord.gg/a9fBR6Bw)