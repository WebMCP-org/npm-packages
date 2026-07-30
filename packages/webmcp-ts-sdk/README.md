# @mcp-b/webmcp-ts-sdk

A thin WebMCP adapter over the official MCP TypeScript SDK v2.

[![npm version](https://img.shields.io/npm/v/@mcp-b/webmcp-ts-sdk?style=flat-square)](https://www.npmjs.com/package/@mcp-b/webmcp-ts-sdk)
[![npm downloads](https://img.shields.io/npm/dm/@mcp-b/webmcp-ts-sdk?style=flat-square)](https://www.npmjs.com/package/@mcp-b/webmcp-ts-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

[`BrowserMcpServer`](https://docs.mcp-b.ai/packages/webmcp-ts-sdk/reference) composes the official v2 `McpServer`. It does not subclass or fork it.

## Why this package still exists

MCP TypeScript SDK v2 removed the original need for a modified server. The upstream server now owns:

- Dynamic tool, prompt, and resource registrations
- MCP transport and protocol behavior
- Standard Schema validation, including Zod 4.2 or newer
- Raw JSON Schema conversion through `fromJsonSchema`

`BrowserMcpServer` only adds the browser boundary:

- The WebMCP `registerTool(tool, options?)`, `getTools()`, and `toolchange` surface
- Mirroring registrations to an existing `document.modelContext`
- Backfilling tools already registered in native Chrome or a compatibility runtime
- MCP-B resource, prompt, sampling, and elicitation helpers

Use the official [`@modelcontextprotocol/server`](https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/server/) directly when you only need an MCP server. Use `@mcp-b/global` for the normal browser setup.

Protocol-version limit: `BrowserMcpServer.connect(customTransport)` uses SDK v2's legacy 2025-era route. Installing v2 does not make tab, iframe, or other custom transports speak MCP 2026-07-28. Instance-level sampling and elicitation helpers are legacy-only and throw on modern-era v2 instances. See [Supporting protocol revision 2026-07-28](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28).

Schema-shape limit: WebMCP can register an array-root input schema because arrays are JavaScript objects. MCP requires tool input schemas to have an object root. Those tools remain available through WebMCP but are omitted from the MCP tool list with a warning.

## Installation

```bash
pnpm add @mcp-b/webmcp-ts-sdk @mcp-b/transports
```

## Quick start

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
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
      additionalProperties: false,
    },
    async execute({ message }) {
      return {
        content: [{ type: 'text', text: `Echo: ${String(message)}` }],
      };
    },
  },
  { signal: controller.signal }
);

controller.abort();
```

`BrowserMcpServer.registerTool` takes a WebMCP descriptor and options. The upstream v2 `McpServer.registerTool` keeps its MCP signature: `registerTool(name, config, handler)`.

## Schema ownership

The browser-facing API remains JSON Schema-first. `BrowserMcpServer` normalizes it to the
`StandardSchemaWithJSON` contract accepted by MCP SDK v2. Plain JSON Schema uses the browser-safe
runtime-selected validator provided by `fromJsonSchema`; Standard Schema inputs keep their own
validator, refinements, and transforms. The official v2 server owns MCP-call validation in both
cases.

For direct upstream registrations, v2 accepts Standard Schema implementations that can emit JSON Schema. Use Zod 4.2 or newer; Zod 3 is unsupported. Existing raw JSON Schema can be wrapped without Zod:

```ts
import { fromJsonSchema, McpServer } from '@modelcontextprotocol/server';

const server = new McpServer({ name: 'catalog-api', version: '1.0.0' });

server.registerTool(
  'lookup-product',
  {
    inputSchema: fromJsonSchema<{ sku: string }>({
      type: 'object',
      properties: { sku: { type: 'string' } },
      required: ['sku'],
    }),
  },
  async ({ sku }) => ({
    content: [{ type: 'text', text: `Looking up ${sku}` }],
  })
);
```

See the official [schema library guide](https://ts.sdk.modelcontextprotocol.io/v2/advanced/schema-libraries) for Standard Schema and validator details.

## Native Chrome integration

Pass the existing browser context as `native` to mirror registrations:

```ts
const server = new BrowserMcpServer(
  { name: 'catalog-app', version: '1.0.0' },
  { native: document.modelContext }
);

const added = await server.syncNativeTools();
```

The adapter forwards `signal` and `exposedTo` when it registers a native tool. Aborting the signal removes both the MCP registration and its native mirror.

`syncNativeTools()` performs an initial reconciliation and resolves to the number of native tools added to the MCP registry. It then listens for native `toolchange` events so later reconciliations add new tools and remove previously backfilled tools that are no longer exposed.

Native synchronization uses `getTools()` and the optional `executeTool()` extension described in [Chrome's imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api).

Use Chrome's [Model Context Tool Inspector](https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd) to inspect mirrored tools.

## Exports

This package exports only what it owns:

- `BrowserMcpServer`
- `BrowserMcpServerOptions`
- `PromptDescriptor`
- `ResourceDescriptor`
- `SERVER_MARKER_PROPERTY`

Import clients, servers, protocol schemas, transports, and validators directly from the official
`@modelcontextprotocol/client`, `@modelcontextprotocol/server`, and `@modelcontextprotocol/core`
packages. `BrowserMcpServer.callTool()` and the name-based `executeTool()` overload no longer exist;
use an MCP `Client` for MCP calls or Chrome's descriptor-based `executeTool(tool, inputJson)`.

## Related packages

- [`@mcp-b/global`](https://docs.mcp-b.ai/packages/global/reference) initializes the full browser runtime.
- [`@mcp-b/transports`](https://docs.mcp-b.ai/packages/transports/reference) provides browser MCP transports.
- [`@mcp-b/webmcp-types`](https://docs.mcp-b.ai/packages/webmcp-types/reference) defines the strict WebMCP and MCP-B extension types.
- [MCP TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/) documents the upstream server, client, and core packages.
- [WebMCP specification](https://webmachinelearning.github.io/webmcp/) defines the authoritative browser API.

## License

MIT. See [LICENSE](../../LICENSE).
