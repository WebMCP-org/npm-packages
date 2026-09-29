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

const server = new BrowserMcpServer({ name: 'catalog-app', version: '1.0.0' });

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

- WebMCP `registerTool()`, `getTools()`, `ontoolchange`, `ontoolactivated`, `ontoolcancel`, and descriptor-based `executeTool()`
- Native `document.modelContext` registration mirroring and tool reconciliation
- MCP-B `registerPrompt()`, `registerResource()`, and `listTools()` extensions
- MCP transport lifecycle through `connect()` and `close()`

The official `McpServer` owns MCP registration, validation, and protocol behavior. Access it through `server.mcpServer` for official SDK APIs. Register multi-round tools directly on `server.mcpServer`; WebMCP descriptor callbacks are single-round when exposed over MCP.

Prompt and resource discovery also belongs to MCP. Use a connected MCP client instead of adapter-side list, read, or get methods.

## Native integration

The constructor uses `document.modelContext` automatically and installs the bundled `@mcp-b/webmcp-polyfill` (about 28 KB minified) when needed. It delegates browser discovery, execution, and access checks to that context. The document property continues to expose the underlying context; `@mcp-b/global` installs the extended API and connects its default transport.

Without a WebMCP context, which is the case with no `document` (server-side module evaluation) or on an insecure page (the polyfill does not install), the constructor still succeeds and the server serves MCP only: `registerTool()`, `registerPrompt()`, `registerResource()`, `listTools()`, `connect()`, and `close()` work, tools are not mirrored to a browser context, `getTools()` and `executeTool()` reject with `InvalidStateError`, `syncNativeTools()` resolves without effect, and no `toolchange` events fire. For service workers or Node.js, use the official `McpServer` directly.

To select a context explicitly, pass it as `native`, then reconcile its current tools:

```ts
const native = document.modelContext;
if (!native) throw new Error('Install a WebMCP runtime first');
const server = new BrowserMcpServer({ name: 'catalog-app', version: '1.0.0' }, { native });

await server.syncNativeTools();
```

`syncNativeTools()` resolves after reconciliation. Later native `toolchange` events trigger another reconciliation. A top-level document mirrors its own tools and those of same-origin descendant frames; a framed document mirrors only its own tools. The native context must implement the upstream object-input `executeTool()` contract. Over MCP, a native result that parses to a JSON object becomes structured content; any other result (text, numbers, quoted strings, booleans, `null`, arrays) is returned as text unchanged. Direct `executeTool()` calls preserve the underlying context's result.

The adapter re-dispatches the context's `toolactivated` and `toolcancel` events on itself with the same `toolName`, next to its own `toolchange`.

## Schema boundary

`BrowserMcpServer` converts JSON Schema or Standard JSON Schema input metadata with the SDK schema adapter. When the supplied schema also has `~standard.validate()`, the adapter preserves that method for the official MCP server. For plain JSON Schema, the server uses the MCP SDK's `fromJsonSchema` adapter.

This validation runs on **MCP client calls**. Direct `executeTool()` calls and native WebMCP mirrors invoke the browser callback without passing through MCP validation. Validate in that callback when exposing tools through both paths, and pass plain JSON metadata so the MCP SDK does not also apply the vendor transforms. The [`@mcp-b/react-webmcp`](../react-webmcp/README.md) hook already does this for local and agent calls using the validator supplied in your schema.

`outputSchema` is likewise enforced by the MCP server on MCP calls, not on direct browser calls. See [schemas and structured output](https://docs.mcp-b.ai/how-to/use-schemas-and-structured-output) for examples and [the package reference](https://docs.mcp-b.ai/packages/webmcp-ts-sdk/reference#schema-boundary) for the contracts.

MCP requires an object-root tool input schema. An array-root WebMCP tool remains available through WebMCP but is omitted from MCP discovery. Direct registrations on `server.mcpServer` use the official SDK's schema APIs; Zod 4.2 or newer is supported, and Zod 3 is unsupported.

## Exports

- `BrowserMcpServer`, `BrowserMcpServerOptions`, `isBrowserMcpServer`
- `PromptDescriptor`, `ResourceDescriptor`, `RegistrationHandle`
- `ModelContext`, `ModelContextWithExtensions`, `RegisteredTool`, `ToolDescriptor`, `ToolDescriptorFromSchema`, `ToolListItem`, `InputSchema`, and the other MCP-B descriptor and inference types
- `CallToolResult`, `ContentBlock`, `TextContent`, `JsonObject`, `JsonValue`, re-exported from `@modelcontextprotocol/server`
- `WebMCP`, the upstream namespace re-exported through `@mcp-b/webmcp-polyfill`, which also brings the polyfill's `SubmitEvent` and `ModelContext` declarations into scope
- `@mcp-b/webmcp-ts-sdk/schema`: `normalizeInputSchema()`, `normalizeToolResponse()`, `isMcpStandardSchema()`, `ToolInputSchema`, `NormalizedInputSchema`

Import MCP clients, servers, schemas, transports, and validators from the official `@modelcontextprotocol/*` packages.

## Related documentation

- [Package reference](https://docs.mcp-b.ai/packages/webmcp-ts-sdk/reference)
- [MCP TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/)
- [WebMCP specification](https://webmachinelearning.github.io/webmcp/)
- [Chrome Model Context Tool Inspector](https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd)

## License

MIT. See [LICENSE](../../LICENSE).
