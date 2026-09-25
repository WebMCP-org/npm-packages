# @mcp-b/webmcp-polyfill

`@mcp-b/webmcp-polyfill` bundles the upstream WebMCP polyfill from
[webmachinelearning/webmcp-polyfill](https://github.com/webmachinelearning/webmcp-polyfill)
at revision `439c6c341f1c632c63498ba206e2bd8471cb8efb`. It installs the standard
`document.modelContext` API when the browser does not provide one. The upstream
implementation and types are the source of truth for this core runtime.

Use [`@mcp-b/global`](../global/README.md) when you need MCP-B features such as
transports, prompts, resources, declarative forms, compatibility shims, or MCP
`outputSchema` support.

## Install

```bash
pnpm add @mcp-b/webmcp-polyfill
```

## Install the polyfill

Call `installWebMCP()` before your app registers tools:

```ts
import { installWebMCP } from '@mcp-b/webmcp-polyfill';

installWebMCP();

const context = document.modelContext;
if (!context) throw new Error('WebMCP is unavailable');
```

The call is idempotent and preserves an existing native context. It does
nothing when no browser document is available.

`initializeWebMCPPolyfill()` remains as a deprecated alias for compatibility:

```ts
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';

initializeWebMCPPolyfill();
```

For a script tag, load the IIFE before registering tools:

```html
<script src="https://unpkg.com/@mcp-b/webmcp-polyfill@latest/dist/index.iife.js"></script>
```

The IIFE calls `installWebMCP()` automatically.

## Register a tool

Tool registrations follow the upstream WebMCP API. Pass an `AbortSignal` when
the registration has a lifecycle:

```ts
const registration = new AbortController();

await context.registerTool(
  {
    name: 'page-title',
    description: 'Get the title of this page',
    execute() {
      return { title: document.title };
    },
  },
  { signal: registration.signal }
);

const tools = await context.getTools();
const tool = tools.find((item) => item.name === 'page-title');
if (tool) {
  const result = await context.executeTool(tool);
  console.log(result);
}

registration.abort();
```

See the [WebMCP draft](https://webmachinelearning.github.io/webmcp/) and the
[upstream polyfill](https://github.com/webmachinelearning/webmcp-polyfill) for
the standard API and implementation details.

## MCP-B schema helpers

The `@mcp-b/webmcp-polyfill/schema` entry remains available for MCP-B schema
normalization and response helpers. It is separate from the upstream runtime.
Use [`@mcp-b/global`](../global/README.md) when you need MCP `outputSchema`
metadata and structured MCP responses. See the
[schemas and structured output guide](https://docs.mcp-b.ai/how-to/use-schemas-and-structured-output).

## Runtime boundary

The core polyfill provides the upstream WebMCP runtime only. It does not provide:

- `cleanupWebMCPPolyfill()`; the upstream runtime has no uninstall operation.
- The deprecated `navigator.modelContext` alias or
  `navigator.modelContextTesting` shim.
- Declarative forms or `SubmitEvent` extensions.
- MCP-B `outputSchema` metadata.

`@mcp-b/global` owns MCP-B runtime extensions and their cleanup. The
polyfill's upstream context remains installed for the document lifetime.

## License

The package includes the upstream polyfill's MIT license notice.
