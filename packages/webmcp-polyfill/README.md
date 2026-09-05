# @mcp-b/webmcp-polyfill

A browser polyfill for the current core WebMCP API on `document.modelContext`.
It implements tool registration, discovery, lifecycle events, and Chromium's
optional `executeTool()` extension. MCP features such as prompts, resources,
browser transport, and a composed MCP server belong to the MCP-B runtime built
by `@mcp-b/global`.

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

## Declare a form tool

When the polyfill owns `document.modelContext`, it observes annotated forms in
the document and its open shadow roots and registers them as tools. It derives
input schemas from native named controls and keeps registrations synchronized
with DOM changes.

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

Without `toolautosubmit`, invocation fills the form and waits for the user to
submit it. With `toolautosubmit`, the polyfill validates the form and calls
`requestSubmit()`. Agent submissions expose `SubmitEvent.agentInvoked` and
`SubmitEvent.respondWith()`.

CI checks the standalone polyfill against the upstream
[declarative Web Platform Tests](https://github.com/web-platform-tests/wpt/tree/master/webmcp/declarative).
Repository-specific browser tests cover the polyfill and composed MCP-B runtime.
See Chrome's
[declarative API documentation](https://developer.chrome.com/docs/ai/webmcp/declarative-api)
for the evolving API. The Community Group draft's
[declarative section](https://webmachinelearning.github.io/webmcp/#declarative-webmcp)
is still incomplete.

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

`@mcp-b/webmcp-polyfill/schema` is an optional adapter entry. Use `normalizeInputSchema()` to convert a Standard JSON Schema implementation, then call its supplied validator in your handler:

```ts
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import { normalizeInputSchema } from '@mcp-b/webmcp-polyfill/schema';
import { z } from 'zod';

const totalInput = z.object({
  count: z.string().regex(/^\d+$/).transform(Number),
  limit: z.number().default(10),
});

export async function registerTotalTool() {
  initializeWebMCPPolyfill();
  const context = document.modelContext;
  if (!context) throw new Error('WebMCP is unavailable');
  const registration = new AbortController();

  await context.registerTool(
    {
      name: 'calculate_total',
      description: 'Add a numeric count to a limit, which defaults to 10',
      // Keep vendor validation in this handler, including when called through MCP.
      inputSchema: { ...normalizeInputSchema(totalInput).inputSchema },
      async execute(input) {
        const result = await totalInput['~standard'].validate(input);
        if (result.issues) {
          throw new TypeError(result.issues.map((issue) => issue.message).join('; '));
        }
        return { total: result.value.count + result.value.limit };
      },
    },
    { signal: registration.signal }
  );

  return () => registration.abort();
}
```

The spread copies only JSON metadata, leaving the supplied validator in the callback. This avoids applying vendor transforms twice if the same tool is later registered through the MCP-B runtime.

This example uses Zod 4.2 or newer (`pnpm add zod@^4.2`). Call `registerTotalTool()` in browser setup and retain the returned cleanup function. The validation method belongs to your schema; the polyfill does not ship a schema validator.

[Standard JSON Schema](https://standardschema.dev/json-schema) supplies `~standard.jsonSchema.input()` for metadata conversion. [Standard Schema](https://standardschema.dev/) supplies `~standard.validate()` for validation and transforms. An object can implement either or both.

`normalizeInputSchema()` converts metadata and preserves a supplied validator for the MCP SDK. It does not call the validator or wrap your handler. The standalone polyfill's `registerTool()` accepts JSON Schema, and its imperative execution path does not validate arguments against that schema. Declarative forms separately use browser form constraints.

In React, [`usewebmcp`](../usewebmcp/README.md) performs conversion and validation for you on both native and polyfill paths. [`@mcp-b/react-webmcp`](../react-webmcp/README.md) shares that implementation. Outside React, [`BrowserMcpServer`](../webmcp-ts-sdk/README.md#schema-boundary) delegates validation to the official MCP server for MCP calls. Direct browser calls still need validation in the handler.

The [schema guide](https://docs.mcp-b.ai/how-to/use-schemas-and-structured-output) covers each path. Browser-facing declarations come from upstream `webmcp-types`; use `@mcp-b/webmcp-types` when you also need MCP-B extension or legacy compatibility types.

## Compatibility boundary

- `document.modelContext` is canonical.
- `navigator.modelContext` is deprecated compatibility.
- Tool lifetime is owned by the `AbortSignal` passed to `registerTool()`.
- `unregisterTool()`, `provideContext()`, and `clearContext()` are not exposed.
- Importing the ESM entry has no initialization side effect.
- Declarative forms do not emulate native CSS tool-state pseudo-classes,
  `toolcancel`, cross-navigation responses, file inputs, or custom
  form-associated elements.
- Closed shadow roots cannot be inspected.

## License

MIT
