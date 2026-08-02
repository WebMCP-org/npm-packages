# @mcp-b/global guide

`@mcp-b/global` installs the full MCP-B browser runtime. Use it when a page needs
the WebMCP `document.modelContext` surface plus MCP-B transport and extension
features such as prompts, resources, browser-to-MCP bridges, or direct access to
the composed official MCP server.

For the public docs site, see:

- [@mcp-b/global reference](../apps/documentation-website/packages/global/reference.mdx)
- [WebMCP standard API](../apps/documentation-website/reference/webmcp/standard-api.mdx)
- [Strict core vs MCP-B extensions](../apps/documentation-website/explanation/strict-core-vs-mcp-b-extensions.mdx)

First-party upstream sources:

- [W3C WebMCP draft](https://webmachinelearning.github.io/webmcp/)
- [Chrome WebMCP imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [Chrome WebMCP declarative API](https://developer.chrome.com/docs/ai/webmcp/declarative-api)
- [MCP SEP-2106](https://modelcontextprotocol.io/seps/2106-json-schema-2020-12)

## Install

```bash
pnpm add @mcp-b/global
```

ESM:

```ts
import '@mcp-b/global';
```

IIFE:

```html
<script src="https://unpkg.com/@mcp-b/global@latest/dist/index.iife.js"></script>
```

Both paths auto-initialize in browser environments unless
`window.__webModelContextOptions.autoInitialize` is set to `false` before load.

## Register tools

New code registers tools on `document.modelContext`. Pass an `AbortSignal` when
the tool has a lifecycle.

```ts
const controller = new AbortController();

await document.modelContext.registerTool(
  {
    name: 'counter_get',
    description: 'Get the current counter value',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      return {
        content: [{ type: 'text', text: '0' }],
        structuredContent: { count: 0 },
      };
    },
  },
  { signal: controller.signal }
);

controller.abort();
```

`registerTool()` resolves `undefined`. Do not depend on a registration handle.
Abort the registration signal to remove a tool. There is no name-based
`unregisterTool()` method.

## Discover and execute tools

Discovery stays on the document surface. Chromium's execution method is
optional, so feature-detect it there as well:

```ts
import type { ChromeModelContext } from '@mcp-b/webmcp-types';

const modelContext = document.modelContext as ChromeModelContext;
if (typeof modelContext.executeTool !== 'function') {
  throw new Error('Tool execution is unavailable');
}

const tools = await modelContext.getTools();
const tool = tools.find((item) => item.name === 'counter_get');

if (!tool) {
  throw new Error('counter_get is not registered');
}

const resultJson = await modelContext.executeTool(tool, '{}');
const result = resultJson === null ? null : JSON.parse(resultJson);
```

`executeTool()` is a Chromium-compatible extension, not a strict WebMCP member.
`listTools()` is an MCP-B metadata helper. MCP clients that connect through the
MCP SDK use the client's `listTools()` and `callTool(...)` protocol APIs.

## Configure initialization

```ts
window.__webModelContextOptions = { autoInitialize: false };

const { initializeWebModelContext } = await import('@mcp-b/global');

initializeWebModelContext({
  transport: {
    tabServer: { allowedOrigins: ['https://app.example'] },
  },
  installTestingShim: true,
});
```

Set `autoInitialize` before the package loads. A static import runs package
initialization before the module body can configure it.

Useful options:

| Option                   | Default | Purpose                                                               |
| ------------------------ | ------- | --------------------------------------------------------------------- |
| `autoInitialize`         | `true`  | Disable when you want to call `initializeWebModelContext()` yourself  |
| `transport.tabServer`    | auto    | Configure or disable the tab transport                                |
| `transport.iframeServer` | auto    | Configure or disable iframe transport                                 |
| `installTestingShim`     | `true`  | Install `navigator.modelContextTesting` when no implementation exists |

The initializer is side-effect-only. Repeated and cross-bundle calls are no-ops;
application code continues through `document.modelContext`.

## Runtime layering

Initialization does four things:

1. Installs `@mcp-b/webmcp-polyfill` if no native `document.modelContext` exists.
2. Captures the current strict core context as `native`.
3. Creates a `BrowserMcpServer` with `{ native }`.
4. Replaces `document.modelContext` with that server so strict core calls mirror
   down while MCP-B extensions remain available.

`navigator.modelContext` is kept as a deprecated alias for older preview
runtimes. New code should use `document.modelContext`.

## Output schemas

`outputSchema` is MCP-B helper metadata, not part of the current WebMCP tool
dictionary. See [Use schemas and structured output](../apps/documentation-website/how-to/use-schemas-and-structured-output.mdx)
for the canonical guidance.

## Testing

For browser-native and polyfill coverage, use the maintained test docs:

- [docs/TESTING.md](./TESTING.md)
- [e2e/tests/CHROMIUM_TESTING.md](../e2e/tests/CHROMIUM_TESTING.md)

Quick console checks:

```ts
console.log(Boolean(document.modelContext));
console.log(Boolean(navigator.modelContextTesting));

const tools = await document.modelContext.getTools();
console.log(tools.map((tool) => tool.name));
```

Use `navigator.modelContextTesting` only for MCP-B compatibility tests and
older tooling. Current native Chrome tests use `getTools()` and feature-detect
the descriptor-based `executeTool()` extension.
