# @mcp-b/global guide

`@mcp-b/global` installs the full MCP-B browser runtime. Use it when a page needs
the WebMCP `document.modelContext` surface plus MCP-B transport and extension
features such as prompts, resources, sampling, elicitation, or browser-to-MCP
bridges.

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
`unregisterTool(name)` remains only as deprecated MCP-B compatibility.

## Discover and execute tools

The document-first producer path is:

```ts
const tools = await document.modelContext.getTools();
const tool = tools.find((item) => item.name === 'counter_get');

if (!tool) {
  throw new Error('counter_get is not registered');
}

const resultJson = await document.modelContext.executeTool(tool, '{}');
const result = resultJson === null ? null : JSON.parse(resultJson);
```

`listTools()` and `callTool()` are MCP-B compatibility helpers. MCP clients that
connect through the MCP SDK still use the SDK's `client.listTools()` and
`client.callTool(...)` APIs.

## Configure initialization

```ts
import { initializeWebModelContext } from '@mcp-b/global';

initializeWebModelContext({
  transport: {
    tabServer: { allowedOrigins: ['https://app.example'] },
  },
  installTestingShim: 'if-missing',
});
```

Useful options:

| Option                       | Default        | Purpose                                                              |
| ---------------------------- | -------------- | -------------------------------------------------------------------- |
| `autoInitialize`             | `true`         | Disable when you want to call `initializeWebModelContext()` yourself |
| `transport.tabServer`        | auto           | Configure or disable the tab transport                               |
| `transport.iframeServer`     | auto           | Configure or disable iframe transport                                |
| `nativeModelContextBehavior` | `'preserve'`   | Wrap an existing native/polyfill context                             |
| `installTestingShim`         | `'if-missing'` | Install `navigator.modelContextTesting` for tests and tooling        |

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

Tool responses can include `structuredContent` that matches `outputSchema`.
`outputSchema` is MCP-B helper metadata, not part of the current W3C/Chrome
WebMCP tool dictionary. Native browser WebMCP does not enforce it. MCP
transport clients may still accept a narrower object-shaped `structuredContent`
boundary, so object outputs remain the safest cross-client shape until
downstream MCP clients fully adopt SEP-2106.

```ts
await document.modelContext.registerTool({
  name: 'tags_list',
  description: 'List tags on the current page',
  inputSchema: { type: 'object', properties: {} },
  outputSchema: {
    type: 'array',
    items: { type: 'string' },
  },
  async execute() {
    return ['webmcp', 'runtime'];
  },
});
```

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

Use `navigator.modelContextTesting` only for native preview/testing flows and
tool inspectors. It is not the author-facing runtime surface.
