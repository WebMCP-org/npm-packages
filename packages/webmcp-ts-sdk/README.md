# @mcp-b/webmcp-ts-sdk

> Browser-first MCP package for `navigator.modelContext`, dynamic tool registration, and browser transports.

[![npm version](https://img.shields.io/npm/v/@mcp-b/webmcp-ts-sdk?style=flat-square)](https://www.npmjs.com/package/@mcp-b/webmcp-ts-sdk)
[![npm downloads](https://img.shields.io/npm/dm/@mcp-b/webmcp-ts-sdk?style=flat-square)](https://www.npmjs.com/package/@mcp-b/webmcp-ts-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

**[Full Documentation](https://docs.mcp-b.ai/packages/webmcp-ts-sdk)** | **[Quick Start](https://docs.mcp-b.ai/quickstart)**

`@mcp-b/webmcp-ts-sdk` is the browser server package in the MCP-B stack. It wraps the upstream MCP runtime with browser-specific behavior required by WebMCP, especially dynamic tool registration after transport connection.

## What This Package Is

- `BrowserMcpServer` for browser runtimes
- `McpServer` as the ergonomic alias used in examples
- browser-facing transport and protocol types used by the MCP-B browser packages
- JSON Schema validators for browser-safe operation

## What This Package Is Not

This package is no longer positioned as a full mirror of `@modelcontextprotocol/sdk`.

If you need the full upstream SDK surface, import it directly:

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
```

`@mcp-b/webmcp-ts-sdk` keeps the browser-facing subset that MCP-B itself uses, and in v2 it re-exports the shared client/protocol symbols MCP-B packages need from the root barrel.

## Why It Exists

Browser WebMCP tooling needs a server that can accept new tools after the transport is already connected. The upstream SDK does not make that the primary path. `BrowserMcpServer` adapts the runtime for the browser case:

- tools can be registered dynamically
- `navigator.modelContext` can be wrapped directly
- native/polyfill tool state can be mirrored and backfilled
- browser-safe JSON Schema validation is used instead of Node-oriented defaults

Compatibility note:

- `BrowserMcpServer.registerTool(...)` still returns a deprecated compatibility handle with `unregister()` so existing MCP-B integrations do not break, even though current Chrome Beta 147 and Chromium `main` return `undefined`
- Chromium currently exposes `unregisterTool(name)` as a string-name API

## Installation

```bash
pnpm add @mcp-b/webmcp-ts-sdk
```

## Usage

```ts
import { McpServer } from '@mcp-b/webmcp-ts-sdk';
import { TabServerTransport } from '@mcp-b/transports';

const server = new McpServer({
  name: 'my-web-app',
  version: '1.0.0',
});

const transport = new TabServerTransport({ allowedOrigins: ['*'] });
await server.connect(transport);

server.registerTool(
  {
    name: 'echo',
    description: 'Echo a message back to the caller',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        echoed: { type: 'string' },
      },
      required: ['echoed'],
    },
    execute: async ({ message }) => ({
      content: [{ type: 'text', text: `Echo: ${message}` }],
      structuredContent: { echoed: `Echo: ${message}` },
    }),
  }
);
```

## Root Exports

The root export includes the browser-first MCP-B surface:

- `BrowserMcpServer`
- `McpServer`
- `Client`
- `SERVER_MARKER_PROPERTY`
- `Transport`
- `TransportSendOptions`
- `JSONRPCMessage`
- `JSONRPCMessageSchema`
- `PromptMessage`
- `ResourceContents`
- `SamplingRequestParams`
- `SamplingResult`
- `CallToolResult`
- `Prompt`
- `Resource`
- `Tool`
- `RequestOptions`
- `ResourceListChangedNotificationSchema`
- `ToolListChangedNotificationSchema`
- `NoOpJsonSchemaValidator`
- `PolyfillJsonSchemaValidator`

These are the symbols currently used by MCP-B browser packages and examples. Broad upstream SDK re-exports that MCP-B does not use are still intentionally excluded.

## Schema Support

`BrowserMcpServer` expects transport-ready JSON Schema at registration boundaries.

- JSON Schema: supported
- Standard Schema / Zod v4: should be normalized before reaching this package
- Zod v3 map conversion: owned by `@mcp-b/react-webmcp`, not this package

That keeps the browser server package focused and avoids leaking `zod-to-json-schema` as a transitive runtime requirement.
