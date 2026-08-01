# @mcp-b/webmcp-polyfill

A browser polyfill for the current core WebMCP API on `document.modelContext`.
It implements tool registration, discovery, lifecycle events, and Chromium's
optional `executeTool()` extension. MCP features such as prompts, resources,
sampling, and elicitation belong to `@mcp-b/global`.

The current WebMCP draft is published at
[webmachinelearning.github.io/webmcp](https://webmachinelearning.github.io/webmcp/).

## Install

```bash
pnpm add @mcp-b/webmcp-polyfill
```

## Initialize

ES modules initialize explicitly:

```ts
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';

initializeWebMCPPolyfill();
```

The standalone IIFE initializes when loaded:

```html
<script src="https://unpkg.com/@mcp-b/webmcp-polyfill@latest/dist/index.iife.js"></script>
```

Set testing options before loading the IIFE only when a test harness needs the
deprecated Chromium testing surface:

```html
<script>
  window.__webMCPPolyfillOptions = { installTestingShim: true };
</script>
```

## Register a tool

```ts
const registration = new AbortController();

await document.modelContext.registerTool(
  {
    name: 'get-page-title',
    description: 'Return the current page title',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({ title: document.title }),
  },
  { signal: registration.signal }
);

// Remove the registration later.
registration.abort();
```

`registerTool()` resolves after the local `toolchange` notification. Duplicate
names, invalid descriptors, aborted registrations, and non-serializable schemas
reject the returned promise.

## Discover and execute

```ts
import type { ChromeModelContext } from '@mcp-b/webmcp-types';

const context = document.modelContext as ChromeModelContext;
const [tool] = await context.getTools();

if (tool && context.executeTool) {
  const result = await context.executeTool(tool, JSON.stringify({}));
  console.log(result);
}
```

`executeTool()` is a Chromium extension, not part of the core `ModelContext`
interface. Feature-detect it.

The local polyfill cannot securely implement cross-document discovery or
exposure. Non-empty `fromOrigins` and `exposedTo` arrays reject with
`NotSupportedError`; use native WebMCP for those capabilities. Where the host
browser exposes the `tools` Permissions Policy, the polyfill enforces it. In
browsers without that policy feature, cross-origin frames fail closed.

## API

### `initializeWebMCPPolyfill(options?)`

Installs `window.ModelContext` and `document.modelContext` when native WebMCP is
absent. It also keeps `navigator.modelContext` as the repository's deprecated
compatibility alias.

```ts
interface WebMCPPolyfillInitOptions {
  installTestingShim?: boolean; // default: false
}
```

Initialization is idempotent and does not replace an existing native context or
testing implementation.

### `cleanupWebMCPPolyfill()`

Removes registrations, detaches their abort listeners, and restores every
property descriptor changed by initialization.

## Testing shim

`installTestingShim: true` installs the deprecated, testing-only
`navigator.modelContextTesting` compatibility surface when it is absent:

- `listTools()`
- `executeTool(name, inputJson, options?)`
- `toolchange` events and `ontoolchange`

Prefer `getTools()` plus feature-detected `executeTool()` for native-browser
coverage.

## Schema helpers

The `@mcp-b/webmcp-polyfill/schema` entry owns shared browser-runtime adapters
used by MCP-B packages. `normalizeInputSchema()` accepts plain JSON Schema and
Standard Schema v1 implementations that expose `~standard.jsonSchema.input()`.
This conversion is an MCP-B adapter feature; the strict WebMCP registration
boundary itself accepts JSON Schema.

For literal-schema TypeScript inference, install `@mcp-b/webmcp-types` and use
`JsonSchemaForInference`. Runtime-defined schemas safely fall back to
object-or-array input.

## Compatibility boundary

- `document.modelContext` is canonical.
- `navigator.modelContext` is deprecated compatibility.
- Tool lifetime is owned by the `AbortSignal` passed to `registerTool()`.
- `unregisterTool()`, `provideContext()`, and `clearContext()` are not exposed.
- Importing the ESM entry has no initialization side effect.

## License

MIT
