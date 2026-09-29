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
nothing when no browser document is available, on an insecure page, or below
the [browser baseline](#browser-baseline).

For a script tag, load the IIFE before registering tools:

```html
<script src="https://unpkg.com/@mcp-b/webmcp-polyfill@latest/dist/index.iife.js"></script>
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

MCP-B schema conversion and response helpers live in
`@mcp-b/webmcp-ts-sdk/schema`.
Use [`@mcp-b/global`](../global/README.md) for MCP `outputSchema` metadata and
structured MCP responses.

## Declare a form tool

The package observes forms with `toolname` and `tooldescription` in the
document and its open shadow roots and registers each one as a tool.
`tooltitle` sets the tool title. The input schema comes from the form's named
controls; `toolparamdescription` on a control or its fieldset describes the
parameter.

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

An invocation fills the controls and dispatches `input` and `change` events.
Without `toolautosubmit`, it focuses the first enabled submit button and waits
for the user to submit; a form with no submit button rejects. With
`toolautosubmit`, it runs constraint validation and calls `requestSubmit()`.

`document.modelContext` fires `toolactivated` once the form is filled (after
`requestSubmit()` for autosubmit). The agent-invoked submit event reports
`agentInvoked` as `true`; call `preventDefault()` and `respondWith(promise)`
to answer. A submission without `respondWith()` resolves to `null`. Results are
JSON strings like every `executeTool()` result: `respondWith(Promise.resolve('sent'))`
resolves as `"sent"`.

Aborting the `executeTool()` signal rejects the call with the abort reason,
fires `toolcancel` on `document.modelContext`, and clears the agent
attribution, so a later user submission reports `agentInvoked` as `false`.
Resetting the form, changing its registration attributes or schema, removing
it, or starting another invocation also rejects a pending call. Both lifecycle
events are plain `Event` instances with a `toolName` property.

Every failed invocation (validation, unknown or invalid parameters, a missing
submit button, a rejected response) rejects with the upstream core's generic
`UnknownError: Tool execution failed`. Resolve `respondWith()` with an error
description when agents need the reason.

When the browser provides `document.modelContext` but `SubmitEvent.prototype`
lacks `agentInvoked` and `respondWith`, the layer installs the hooks and
registers forms on that context. A native context that already has the hooks
keeps declarative forms to itself. The layer does not emulate the
`:tool-form-active` and `:tool-submit-active` pseudo-classes and skips closed
shadow roots, file inputs, and form-associated custom elements.

## Browser baseline

`installWebMCP()` installs only when the engine provides every API the
vendored core calls. Otherwise it returns without defining
`document.modelContext`, so `if (!document.modelContext)` remains a valid
feature check.

| API                             | Chrome | Firefox | Safari |
| ------------------------------- | ------ | ------- | ------ |
| `String.prototype.toWellFormed` | 111    | 119     | 16.4   |
| `AbortSignal.any()`             | 116    | 124     | 17.4   |
| `Promise.withResolvers()`       | 119    | 121     | 17.4   |
| `URL.parse()`                   | 126    | 126     | 18     |

The resulting floor is Chrome 126, Firefox 126, and Safari 18.

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
