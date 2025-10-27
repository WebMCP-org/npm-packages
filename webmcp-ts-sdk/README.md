# @mcp-b/webmcp-ts-sdk

> Browser-adapted Model Context Protocol TypeScript SDK

[![npm version](https://img.shields.io/npm/v/@mcp-b/webmcp-ts-sdk?style=flat-square)](https://www.npmjs.com/package/@mcp-b/webmcp-ts-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

## Overview

This package adapts the official [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) for browser environments with modifications to support dynamic tool registration required by the [W3C Web Model Context API](https://github.com/webmachinelearning/webmcp) (`window.navigator.modelContext`).

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
  outputSchema: { result: z.string() }
}, async ({ message }) => {
  return {
    content: [{ type: 'text', text: `Echo: ${message}` }],
    structuredContent: { result: `Echo: ${message}` }
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

- ✅ **~50 lines** of custom code
- ✅ **Automatic updates** for types, protocol, validation via official SDK dependency
- ✅ **Single modification point** - only capability registration behavior
- ✅ **Type-safe** - no prototype hacks or unsafe casts

### Syncing with Upstream

When the official SDK updates:

1. Update the catalog version in `pnpm-workspace.yaml`
2. Run `pnpm install` to get latest SDK
3. Test that capability registration still works
4. Update this README if SDK behavior changes

The modification is minimal and unlikely to conflict with upstream changes.

## Related Packages

- [`@mcp-b/global`](../global) - W3C Web Model Context API implementation (uses this package)
- [`@mcp-b/transports`](../transports) - Browser-specific MCP transports
- [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) - Official MCP SDK

## Resources

- [Web Model Context API Explainer](https://github.com/webmachinelearning/webmcp)
- [Model Context Protocol Spec](https://modelcontextprotocol.io/)
- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## License

MIT - see [LICENSE](../../LICENSE) for details

## Support

- [GitHub Issues](https://github.com/WebMCP-org/npm-packages/issues)
- [Documentation](https://docs.mcp-b.ai)
