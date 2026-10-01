# @mcp-b/webmcp-polyfill

This package is a temporary compatibility distribution of the upstream
[WebMCP polyfill](https://github.com/webmachinelearning/webmcp-polyfill), distributed
under the existing MCP-B package name with vendored upstream source.

**This package will eventually be removed.** There is no removal date yet. Sites
using declarative tools should keep this package until the upstream polyfill
supports them. For other sites, follow the
[upstream installation instructions](https://github.com/webmachinelearning/webmcp-polyfill#readme)
when its distribution is available.

Until then, this package bundles upstream revision
`439c6c341f1c632c63498ba206e2bd8471cb8efb`. It installs the standard
`document.modelContext` API when the browser does not provide one, plus a
temporary declarative tools layer. The upstream implementation and types are the
source of truth for the core runtime. Use [`@mcp-b/global`](../global/README.md)
for transports, prompts, resources, or MCP `outputSchema` support; MCP-B schema
helpers live in `@mcp-b/webmcp-ts-sdk/schema`.

The [package reference](https://docs.mcp-b.ai/packages/webmcp-polyfill/reference)
documents the installer, the declarative layer, and the browser baseline.

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
nothing when no browser document is available, on an insecure page, or on
engines older than Chrome 126, Firefox 126, or Safari 18, so
`if (!document.modelContext)` remains a valid feature check. The upstream
runtime has no uninstall operation and does not provide the deprecated
`navigator.modelContext` alias.

For a script tag, load the IIFE before registering tools:

```html
<script src="https://unpkg.com/@mcp-b/webmcp-polyfill@6/dist/index.iife.js"></script>
```

The IIFE calls `installWebMCP()` automatically and exposes it as
`WebMCPPolyfill.installWebMCP`.

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

## Declare a tool in HTML

The declarative layer registers a tool for each form with `toolname` and
`tooldescription` in the document and its open shadow roots. The input schema
comes from the form's named controls.

```html
<form toolname="search_catalog" tooldescription="Search the product catalog" toolautosubmit>
  <input name="query" required toolparamdescription="Words to match" />
  <button type="submit">Search</button>
</form>

<script>
  document.querySelector('form').addEventListener('submit', (event) => {
    if (!event.agentInvoked) return;

    event.preventDefault();
    event.respondWith(Promise.resolve({ matches: [] }));
  });
</script>
```

An invocation fills the controls and either submits the form (`toolautosubmit`)
or focuses its submit button for the user. The
[declarative tools reference](https://docs.mcp-b.ai/packages/webmcp-polyfill/reference#declarative-tools)
covers results, lifecycle events, cancellation, failures, and native browser
hooks.

## License

The package includes the upstream polyfill's MIT license notice.
