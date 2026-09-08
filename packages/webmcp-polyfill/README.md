# @mcp-b/webmcp-polyfill

Use native WebMCP when available, with a core fallback for other browsers:

```ts
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';

initializeWebMCPPolyfill();
const context = document.modelContext;
if (!context) throw new Error('WebMCP is unavailable');

await context.registerTool({
  name: 'get-page-title',
  description: 'Return the current page title',
  execute: () => ({ title: document.title }),
});
```

```bash
pnpm add @mcp-b/webmcp-polyfill
```

Initialization preserves an existing native context. The ESM import has no initialization
side effect. [WebMCP](https://webmachinelearning.github.io/webmcp/) is a Community Group
proposal; MCP prompts, resources, and transport belong to [`@mcp-b/global`](../global/README.md).

## Validation and plugins

[`@mcp-b/webmcp-plugins`](../webmcp-plugins/README.md) adds Standard Schema validation,
consent, execution state, and tracing to explicitly wrapped callbacks. It works with native
WebMCP and the fallback. Importing a plugin does not initialize this polyfill.

The old `/invocation`, `/standard-schema`, `/execution-state`, `/consent`, and `/otel` entries
are removed. Use the separate plugin package. `/schema` remains available for low-level metadata
and browser compatibility helpers; it does not install callback validation.

## Script tags and forms

The standalone script initializes on load:

```html
<script src="https://unpkg.com/@mcp-b/webmcp-polyfill@latest/dist/index.iife.js"></script>
```

When the fallback owns `document.modelContext`, it registers annotated forms in the document
and open shadow roots and keeps their metadata synchronized with DOM changes:

```html
<form toolname="search_catalog" tooldescription="Search the product catalog" toolautosubmit>
  <label>Query <input name="query" required /></label>
  <button type="submit">Search</button>
</form>
```

`toolautosubmit` applies browser form validation and calls `requestSubmit()`. Without it,
invocation fills the form and waits for a user submission. See the
[declarative reference](https://docs.mcp-b.ai/packages/webmcp-polyfill/reference#declarative-forms)
for responding to agent submissions and the supported subset of Chrome's declarative API.

## Compatibility

- `document.modelContext` is canonical; `navigator.modelContext` is a deprecated alias.
- Registration lifetime belongs to its `AbortSignal`; aborting removes the tool.
- The package's `executeTool()` compatibility path takes serialized JSON. The
  [live draft](https://webmachinelearning.github.io/webmcp/) specifies object input.
- Cross-document discovery and exposure require native WebMCP.
- Native CSS tool-state pseudo-classes, `toolcancel`, cross-navigation responses,
  file inputs, custom form-associated elements, and closed shadow roots are not emulated.
- `initializeWebMCPPolyfill({ installTestingShim: true })` enables the legacy testing shim.
- `cleanupWebMCPPolyfill()` removes fallback registrations and restores changed properties.

[API reference](https://docs.mcp-b.ai/packages/webmcp-polyfill/reference) ·
[Runtime layering](https://docs.mcp-b.ai/explanation/architecture/runtime-layering) ·
[Schema guide](https://docs.mcp-b.ai/how-to/use-schemas-and-structured-output)

## License

MIT
