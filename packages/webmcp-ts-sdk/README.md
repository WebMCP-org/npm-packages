# @mcp-b/webmcp-ts-sdk

> Browser-adapted MCP TypeScript SDK - Dynamic tool registration for AI agents like Claude, ChatGPT, and Gemini

[![npm version](https://img.shields.io/npm/v/@mcp-b/webmcp-ts-sdk?style=flat-square)](https://www.npmjs.com/package/@mcp-b/webmcp-ts-sdk)
[![npm downloads](https://img.shields.io/npm/dm/@mcp-b/webmcp-ts-sdk?style=flat-square)](https://www.npmjs.com/package/@mcp-b/webmcp-ts-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=flat-square)](https://www.typescriptlang.org/)
[![Minimal Code](https://img.shields.io/badge/Custom_Code-~50_lines-green?style=flat-square)](https://github.com/WebMCP-org/npm-packages)

**[Full Documentation](https://docs.mcp-b.ai/packages/webmcp-ts-sdk)** | **[Quick Start](https://docs.mcp-b.ai/quickstart)**

**@mcp-b/webmcp-ts-sdk** adapts the official MCP TypeScript SDK for browser environments, enabling dynamic tool registration required by the W3C Web Model Context API. This allows AI agents like Claude, ChatGPT, Gemini, Cursor, and Copilot to interact with browser-based applications.

## Why Use @mcp-b/webmcp-ts-sdk?

| Feature | Benefit |
|---------|---------|
| **Dynamic Tool Registration** | Register tools after transport connection - required for browser apps |
| **Minimal Overhead** | Only ~50 lines of custom code on top of official SDK |
| **Full SDK Compatibility** | Re-exports all types, classes, and utilities from official SDK |
| **Type-Safe** | No prototype hacks - clean TypeScript extension |
| **Auto-Updates** | Types and protocol follow official SDK automatically |

## Overview

This package adapts the official [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) for browser environments with modifications to support dynamic tool registration required by the [W3C Web Model Context API](https://github.com/nicolo-ribaudo/model-context-protocol-api) (`window.navigator.modelContext`).

## Why This Package Exists

The official MCP TypeScript SDK has a restriction that prevents registering server capabilities (like tools) after a transport connection is established. This is enforced by this check in the `Server` class:

```typescript
public registerCapabilities(capabilities: ServerCapabilities): void {
    if (this.transport) {
        throw new Error('Cannot register capabilities after connecting to transport');
    }
    ...
}
```

For the Web Model Context API, this restriction is incompatible because:

1. **Tools arrive dynamically** - Web pages call `window.navigator.modelContext.provideContext({ tools: [...] })` at any time
2. **Transport must be ready immediately** - The MCP server/transport needs to be connected when the page loads
3. **Asynchronous registration** - Tools are registered as the page's JavaScript executes, potentially long after initialization

This package solves the problem by **pre-registering tool capabilities** before the transport connects, allowing dynamic tool registration to work seamlessly.

## Modifications from Official SDK

### BrowserMcpServer Class

The `BrowserMcpServer` extends `McpServer` with these changes:

```typescript
export class BrowserMcpServer extends BaseMcpServer {
  constructor(serverInfo, options?) {
    // Pre-register tool capabilities in constructor
    const enhancedOptions = {
      ...options,
      capabilities: mergeCapabilities(options?.capabilities || {}, {
        tools: { listChanged: true }
      })
    };
    super(serverInfo, enhancedOptions);
  }

  async connect(transport: Transport) {
    // Ensure capabilities are set before connecting
    // This bypasses the "cannot register after connect" restriction
    return super.connect(transport);
  }
}
```

**Key Difference**: Capabilities are registered **before** connecting, allowing tools to be added dynamically afterward.

## What's Re-Exported

This package re-exports almost everything from the official SDK:

### Types
- All MCP protocol types (`Tool`, `Resource`, `Prompt`, etc.)
- Request/response schemas
- Client and server capabilities
- Error codes and constants

### Classes
- `Server` - Base server class (unchanged)
- `McpServer` - Aliased to `BrowserMcpServer` with our modifications

### Utilities
- `Transport` interface
- `mergeCapabilities` helper
- Protocol version constants

## Installation

```bash
npm install @mcp-b/webmcp-ts-sdk
# or
pnpm add @mcp-b/webmcp-ts-sdk
```

## Usage

Use it exactly like the official SDK:

```typescript
import { McpServer } from '@mcp-b/webmcp-ts-sdk';
import { TabServerTransport } from '@mcp-b/transports';

const server = new McpServer({
  name: 'my-web-app',
  version: '1.0.0'
});

// Connect transport first
const transport = new TabServerTransport({ allowedOrigins: ['*'] });
await server.connect(transport);

// Now you can register tools dynamically (this would fail with official SDK)
server.registerTool('my-tool', {
  description: 'A dynamically registered tool',
  inputSchema: { message: z.string() },
  // Output schemas enable structured, type-safe AI responses
  outputSchema: { result: z.string() }
}, async ({ message }) => {
  return {
    content: [{ type: 'text', text: `Echo: ${message}` }],
    // structuredContent must match the outputSchema
    structuredContent: { result: `Echo: ${message}` }
  };
});

// Example with complex output schema
server.registerTool('analyze-data', {
  description: 'Analyze data and return structured results',
  inputSchema: {
    data: z.array(z.number()),
    operation: z.enum(['sum', 'average', 'stats'])
  },
  outputSchema: {
    result: z.number(),
    operation: z.string(),
    metadata: z.object({
      count: z.number(),
      min: z.number().optional(),
      max: z.number().optional()
    })
  }
}, async ({ data, operation }) => {
  const stats = calculateStats(data, operation);
  return {
    content: [{ type: 'text', text: `Result: ${stats.result}` }],
    structuredContent: stats
  };
});
```

## Architecture

```
┌─────────────────────────────────┐
│  @mcp-b/webmcp-ts-sdk           │
│                                 │
│  ┌───────────────────────────┐  │
│  │ BrowserMcpServer          │  │
│  │ (Modified behavior)        │  │
│  └───────────┬───────────────┘  │
│              │ extends          │
│              ▼                  │
│  ┌───────────────────────────┐  │
│  │ @modelcontextprotocol/sdk │  │
│  │ (Official SDK)             │  │
│  │ - Types                    │  │
│  │ - Protocol                 │  │
│  │ - Validation               │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

## Maintenance Strategy

This package is designed for **minimal maintenance**:

- **~50 lines** of custom code
- **Automatic updates** for types, protocol, validation via official SDK dependency
- **Single modification point** - only capability registration behavior
- **Type-safe** - no prototype hacks or unsafe casts

### Syncing with Upstream

When the official SDK updates:

1. Update the catalog version in `pnpm-workspace.yaml`
2. Run `pnpm install` to get latest SDK
3. Test that capability registration still works
4. Update this README if SDK behavior changes

The modification is minimal and unlikely to conflict with upstream changes.

## Frequently Asked Questions

### Why can't I use the official SDK directly?

The official SDK throws an error if you try to register tools after connecting a transport. Browsers need dynamic registration because tools arrive asynchronously as the page loads.

### Is this a fork of the official SDK?

No - it's a thin adapter (~50 lines) that extends the official SDK. All types, protocol handling, and validation come from the upstream package.

### Will this break when the official SDK updates?

Unlikely. The modification is minimal and isolated. When upstream updates, just update your dependencies - the wrapper adapts automatically.

### When should I use this vs `@mcp-b/global`?

Use `@mcp-b/global` for the standard `navigator.modelContext` API. Use this package directly only if you need low-level control over the MCP server.

## Related Packages

- [`@mcp-b/global`](https://docs.mcp-b.ai/packages/global) - W3C Web Model Context API polyfill (uses this package internally)
- [`@mcp-b/transports`](https://docs.mcp-b.ai/packages/transports) - Browser-specific MCP transports
- [`@mcp-b/react-webmcp`](https://docs.mcp-b.ai/packages/react-webmcp) - React hooks for MCP
- [`@mcp-b/chrome-devtools-mcp`](https://docs.mcp-b.ai/packages/chrome-devtools-mcp) - Connect desktop AI agents to browser tools
- [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) - Official MCP SDK

## Resources

- [WebMCP Documentation](https://docs.mcp-b.ai)
- [Web Model Context API Explainer](https://github.com/nicolo-ribaudo/model-context-protocol-api)
- [Model Context Protocol Spec](https://modelcontextprotocol.io/)
- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP GitHub Repository](https://github.com/modelcontextprotocol)

## License

MIT - see [LICENSE](../../LICENSE) for details

## Support

- [GitHub Issues](https://github.com/WebMCP-org/npm-packages/issues)
- [Documentation](https://docs.mcp-b.ai)
- [Discord Community](https://discord.gg/a9fBR6Bw)
