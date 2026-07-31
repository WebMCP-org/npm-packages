# @mcp-b/react-webmcp

> React hooks for Model Context Protocol (MCP) - Let AI agents like Claude, ChatGPT, Cursor, and Copilot control your React components

[![npm version](https://img.shields.io/npm/v/@mcp-b/react-webmcp?style=flat-square)](https://www.npmjs.com/package/@mcp-b/react-webmcp)
[![npm downloads](https://img.shields.io/npm/dm/@mcp-b/react-webmcp?style=flat-square)](https://www.npmjs.com/package/@mcp-b/react-webmcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=flat-square)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat-square&logo=react)](https://reactjs.org/)

**[Reference](https://docs.mcp-b.ai/packages/react-webmcp/reference)** | **[React Tutorial](https://docs.mcp-b.ai/tutorials/first-react-tool)** | **[Framework Guides](https://docs.mcp-b.ai/how-to/frameworks)**

**@mcp-b/react-webmcp** provides React hooks that expose your components as AI-callable tools via the Model Context Protocol. Build AI-powered React applications where Claude, ChatGPT, Gemini, Cursor, and Copilot can interact with your app's functionality.

## Why Use @mcp-b/react-webmcp?

| Feature                      | Benefit                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------- |
| **React-First Design**       | Hooks follow React patterns with automatic cleanup and StrictMode support         |
| **Type-Safe Schemas**        | JSON Schema and Standard JSON Schema input typing, plus JSON Schema output typing |
| **Two-Way Integration**      | Both expose tools TO AI agents AND consume tools FROM MCP servers                 |
| **Execution State Tracking** | Built-in loading, success, and error states for UI feedback                       |
| **Works with Any AI**        | Compatible with Claude, ChatGPT, Gemini, Cursor, Copilot, and any MCP client      |

## Installation

```bash
pnpm add @mcp-b/global @mcp-b/react-webmcp
```

You can omit `@mcp-b/global` when you only consume an MCP server as a client, or when a native
WebMCP implementation supplies `document.modelContext` and you only use the core `useWebMCP` tool
hook. Prompt, resource, sampling, and elicitation hooks require the MCP-B extensions installed by
`@mcp-b/global`. If you only want strict core WebMCP hooks, install `usewebmcp` directly.

For client functionality, you'll also need:

```bash
pnpm add @mcp-b/transports @modelcontextprotocol/client
```

**Prerequisites:** Provider hooks require `document.modelContext`. Install `@mcp-b/global`, or use
a native WebMCP implementation for the core `useWebMCP` tool hook.

Provider hooks register tools with `document.modelContext.registerTool(tool, {
signal })` and abort the controller on unmount. The hooks retain a
`navigator.modelContext` fallback for older preview runtimes, but
`document.modelContext` is the canonical surface. Install `@mcp-b/global`
when you need a portable runtime with spec-aligned cleanup behavior.

`outputSchema` is MCP-B helper metadata for output typing and structured MCP
responses. Native Chrome WebMCP does not currently define or enforce it.

## Quick Start - Provider (Registering Tools)

```tsx
import '@mcp-b/global';
import { useWebMCP } from '@mcp-b/react-webmcp';

function PostsPage() {
  const likeTool = useWebMCP({
    name: 'posts_like',
    description: 'Like a post by ID. Increments the like count.',
    inputSchema: {
      type: 'object',
      properties: {
        postId: { type: 'string', description: 'The post ID to like' },
      },
      required: ['postId'],
    } as const,
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
import { TabClientTransport } from '@mcp-b/transports';
import { Client } from '@modelcontextprotocol/client';

const client = new Client(
  { name: 'MyApp', version: '1.0.0' },
  { versionNegotiation: { mode: 'auto' } }
);
const transport = new TabClientTransport({
  channelId: 'mcp',
  targetOrigin: window.location.origin,
});

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
      <button onClick={handleCallTool} disabled={!isConnected}>
        Call Tool
      </button>
    </div>
  );
}
```

`useMcpClient().reconnect()` retries tool and resource discovery while the client remains connected.
If a one-shot transport closes, construct a new transport and pass it to
`reconnect(newTransport)`; closed transport instances are not generally reusable.

## API Overview

### Provider Hooks

| Hook                                            | Description                                               |
| ----------------------------------------------- | --------------------------------------------------------- |
| `useWebMCP(config, deps?)`                      | Register a tool with full control over behavior and state |
| `useWebMCPContext(name, description, getValue)` | Simplified hook for read-only context exposure            |

### Client Hooks

| Hook / Component    | Description                                               |
| ------------------- | --------------------------------------------------------- |
| `McpClientProvider` | Provider component managing an MCP client connection      |
| `useMcpClient()`    | Access client, tools, connection status, and capabilities |

## Schema Compatibility

Inputs accept JSON Schema or Standard JSON Schema v1 implementations such as Zod 4.2+. Outputs use JSON Schema for typed `structuredContent`.

## Documentation

For full API reference, output schemas, memoization patterns, migration guide, best practices, and complete examples, see the [React WebMCP Guide](../../docs/react-webmcp-guide.md).

## Related Packages

- [`@mcp-b/global`](https://docs.mcp-b.ai/packages/global/reference) - Full MCP-B browser runtime (required for provider hooks)
- [`@mcp-b/transports`](https://docs.mcp-b.ai/packages/transports/reference) - Browser-specific MCP transports
- [`chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp) - Upstream Chrome DevTools MCP server
- [`usewebmcp`](../usewebmcp) - React hooks for strict core WebMCP API only

## Resources

- [WebMCP Documentation](https://docs.mcp-b.ai)
- [Model Context Protocol Spec](https://modelcontextprotocol.io)

## License

MIT - see [LICENSE](../../LICENSE) for details
