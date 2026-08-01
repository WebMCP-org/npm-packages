# @mcp-b/webmcp-ts-sdk

A thin WebMCP adapter over the official MCP TypeScript SDK v2.

[![npm version](https://img.shields.io/npm/v/@mcp-b/webmcp-ts-sdk?style=flat-square)](https://www.npmjs.com/package/@mcp-b/webmcp-ts-sdk)
[![npm downloads](https://img.shields.io/npm/dm/@mcp-b/webmcp-ts-sdk?style=flat-square)](https://www.npmjs.com/package/@mcp-b/webmcp-ts-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

[`BrowserMcpServer`](https://docs.mcp-b.ai/packages/webmcp-ts-sdk/reference) composes and exposes the official v2 `McpServer`. Use this package when you need direct control over the browser adapter. Most applications should use [`@mcp-b/global`](https://docs.mcp-b.ai/packages/global/overview).

## Installation

```bash
pnpm add @mcp-b/webmcp-ts-sdk @mcp-b/transports
```

## Example

```ts
import { TabServerTransport } from '@mcp-b/transports';
import { BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';

const server = new BrowserMcpServer({
  name: 'catalog-app',
  version: '1.0.0',
});

await server.connect(
  new TabServerTransport({
    allowedOrigins: ['https://shop.example'],
  })
);

const controller = new AbortController();

await server.registerTool(
  {
    name: 'echo',
    description: 'Echo a message',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
    async execute({ message }) {
      return { content: [{ type: 'text', text: `Echo: ${String(message)}` }] };
    },
  },
  { signal: controller.signal }
);

controller.abort();
```

An `AbortSignal` owns each WebMCP tool registration. Aborting it removes the local MCP registration and its native mirror.

## What the adapter owns

- WebMCP `registerTool()`, `getTools()`, `ontoolchange`, and descriptor-based `executeTool()`
- Native `document.modelContext` registration mirroring and tool reconciliation
- MCP-B `registerPrompt()`, `registerResource()`, and `listTools()` extensions
- MCP transport lifecycle through `connect()` and `close()`

The official `McpServer` owns MCP registration, validation, and protocol behavior. Access it through `server.mcpServer` for official SDK APIs. Register multi-round tools directly on `server.mcpServer`; WebMCP descriptor callbacks are single-round when exposed over MCP.

Prompt and resource discovery also belongs to MCP. Use a connected MCP client instead of adapter-side list, read, or get methods.

## Native integration

Pass an existing context as `native`, then reconcile its current tools:

```ts
const server = new BrowserMcpServer(
  { name: 'catalog-app', version: '1.0.0' },
  { native: document.modelContext }
);

await server.syncNativeTools();
```

`syncNativeTools()` resolves after reconciliation. Later native `toolchange` events trigger another reconciliation. Backfill requires Chrome's optional descriptor-based `executeTool()` extension.

## Schema boundary

The browser-facing API accepts JSON Schema and Standard Schema inputs. The adapter converts them to the MCP SDK v2 contract. Direct upstream registrations can use Zod 4.2 or newer or the official `fromJsonSchema` helper; Zod 3 is unsupported.

MCP requires an object-root tool input schema. An array-root WebMCP tool remains available through WebMCP but is omitted from MCP discovery.

## Exports

- `BrowserMcpServer`
- `BrowserMcpServerOptions`
- `PromptDescriptor`
- `ResourceDescriptor`
- `SERVER_MARKER_PROPERTY`

Import MCP clients, servers, schemas, transports, and validators from the official `@modelcontextprotocol/*` packages.

## Related documentation

- [Package reference](https://docs.mcp-b.ai/packages/webmcp-ts-sdk/reference)
- [MCP TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/)
- [WebMCP specification](https://webmachinelearning.github.io/webmcp/)
- [Chrome Model Context Tool Inspector](https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd)

## License

MIT. See [LICENSE](../../LICENSE).
