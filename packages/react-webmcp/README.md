# @mcp-b/react-webmcp

> React hooks for Model Context Protocol (MCP) - Let AI agents like Claude, ChatGPT, Cursor, and Copilot control your React components

[![npm version](https://img.shields.io/npm/v/@mcp-b/react-webmcp?style=flat-square)](https://www.npmjs.com/package/@mcp-b/react-webmcp)
[![npm downloads](https://img.shields.io/npm/dm/@mcp-b/react-webmcp?style=flat-square)](https://www.npmjs.com/package/@mcp-b/react-webmcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=flat-square)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat-square&logo=react)](https://reactjs.org/)

**[Full Documentation](https://docs.mcp-b.ai/packages/react-webmcp)** | **[Quick Start](https://docs.mcp-b.ai/quickstart)** | **[AI Framework Integration](https://docs.mcp-b.ai/ai-frameworks)**

**@mcp-b/react-webmcp** provides React hooks that expose your components as AI-callable tools via the Model Context Protocol. Build AI-powered React applications where Claude, ChatGPT, Gemini, Cursor, and Copilot can interact with your app's functionality.

## Why Use @mcp-b/react-webmcp?

| Feature | Benefit |
|---------|---------|
| **React-First Design** | Hooks follow React patterns with automatic cleanup and StrictMode support |
| **Type-Safe with Zod** | Full TypeScript support with Zod schema validation for inputs/outputs |
| **Two-Way Integration** | Both expose tools TO AI agents AND consume tools FROM MCP servers |
| **Execution State Tracking** | Built-in loading, success, and error states for UI feedback |
| **Works with Any AI** | Compatible with Claude, ChatGPT, Gemini, Cursor, Copilot, and any MCP client |

## Installation

```bash
pnpm add @mcp-b/react-webmcp zod
```

If you only want strict core WebMCP hooks (without MCP-B extension APIs like prompts/resources/sampling/elicitation), use `usewebmcp` instead.

For client functionality, you'll also need:
```bash
pnpm add @mcp-b/transports @modelcontextprotocol/sdk
```

**Prerequisites:** Provider hooks require the `navigator.modelContext` API. Install `@mcp-b/global` or use a browser that implements the Web Model Context API.

## Quick Start - Provider (Registering Tools)

```tsx
import { useWebMCP } from '@mcp-b/react-webmcp';
import { z } from 'zod';

function PostsPage() {
  const likeTool = useWebMCP({
    name: 'posts_like',
    description: 'Like a post by ID. Increments the like count.',
    inputSchema: {
      postId: z.string().uuid().describe('The post ID to like'),
    },
    annotations: {
      title: 'Like Post',
      readOnlyHint: false,
      idempotentHint: true,
    },
    handler: async (input) => {
      await api.posts.like(input.postId);
      return { success: true, postId: input.postId };
    },
    formatOutput: (result) => `Post ${result.postId} liked successfully!`,
  });

  return (
    <div>
      {likeTool.state.isExecuting && <Spinner />}
      {likeTool.state.error && <ErrorAlert error={likeTool.state.error} />}
    </div>
  );
}
```

## Quick Start - Client (Consuming Tools)

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

  const handleCallTool = async () => {
    const result = await client.callTool({ name: 'posts_like', arguments: { postId: '123' } });
    console.log('Result:', result.content[0].text);
  };

  return (
    <div>
      <p>Connected: {isConnected ? 'Yes' : 'No'}</p>
      <p>Available Tools: {tools.length}</p>
      <button onClick={handleCallTool} disabled={!isConnected}>Call Tool</button>
    </div>
  );
}
```

## API Overview

### Provider Hooks

| Hook | Description |
|------|-------------|
| `useWebMCP(config, deps?)` | Register a tool with full control over behavior and state |
| `useWebMCPContext(name, description, getValue)` | Simplified hook for read-only context exposure |

### Client Hooks

| Hook / Component | Description |
|-------------------|-------------|
| `McpClientProvider` | Provider component managing an MCP client connection |
| `useMcpClient()` | Access client, tools, connection status, and capabilities |

## Zod Version Compatibility

This package supports **Zod 3.25.76+** (3.x only).

## Documentation

For full API reference, output schemas, memoization patterns, migration guide, best practices, and complete examples, see the [React WebMCP Guide](../../docs/react-webmcp-guide.md).

## Related Packages

- [`@mcp-b/global`](https://docs.mcp-b.ai/packages/global) - W3C Web Model Context API polyfill (required for provider hooks)
- [`@mcp-b/transports`](https://docs.mcp-b.ai/packages/transports) - Browser-specific MCP transports
- [`@mcp-b/chrome-devtools-mcp`](https://docs.mcp-b.ai/packages/chrome-devtools-mcp) - Connect desktop AI agents to browser tools
- [`usewebmcp`](../usewebmcp) - React hooks for strict core WebMCP API only

## Resources

- [WebMCP Documentation](https://docs.mcp-b.ai)
- [Model Context Protocol Spec](https://modelcontextprotocol.io)

## License

MIT - see [LICENSE](../../LICENSE) for details
