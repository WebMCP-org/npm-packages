# @mcp-b/webmcp-polyfill

This package is a temporary compatibility distribution of the upstream
[WebMCP polyfill](https://github.com/webmachinelearning/webmcp-polyfill), distributed
under the existing MCP-B package name with vendored upstream source.

**This package will eventually be removed.** There is no removal date yet. Sites
using declarative forms should keep this package until the upstream polyfill
supports them. For other sites, follow the
[upstream installation instructions](https://github.com/webmachinelearning/webmcp-polyfill#readme)
when its distribution is available.

Until then, this package bundles upstream revision
`439c6c341f1c632c63498ba206e2bd8471cb8efb`. It installs the standard
`document.modelContext` API when the browser does not provide one. The upstream
implementation and types are the source of truth for this core runtime.

This package temporarily retains MCP-B declarative forms and `SubmitEvent`
extensions alongside the vendored upstream core, pending upstream support.
Existing browser contexts and native form hooks are preserved; missing form
hooks are filled in. Use [`@mcp-b/global`](../global/README.md) when you need
MCP-B features such as transports, prompts, resources, or MCP
`outputSchema` support.

## Use the compatibility package

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

MCP-B schema conversion and response helpers live in
`@mcp-b/webmcp-ts-sdk/schema`.
Use [`@mcp-b/global`](../global/README.md) for MCP `outputSchema` metadata and
structured MCP responses.

## Runtime boundary

The package provides the upstream core plus the temporary declarative form layer.
It does not provide:

- `cleanupWebMCPPolyfill()`; the upstream runtime has no uninstall operation.
- The deprecated `navigator.modelContext` alias or
  `navigator.modelContextTesting` shim.
- MCP-B `outputSchema` metadata.
- MCP prompts, resources, or transports.

`@mcp-b/global` owns the MCP adapter and its cleanup. The polyfill and its form
layer remain installed for the document lifetime.

## License

The package includes the upstream polyfill's MIT license notice.
