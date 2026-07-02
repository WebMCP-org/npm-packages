# @mcp-b/webmcp-polyfill

Strict WebMCP core runtime polyfill for `document.modelContext` (with a
backward-compatible `navigator.modelContext` alias).

> **Heads up - WebMCP spec migration.** The `modelContext` getter moved from
> `Navigator` to `Document` in
> [webmachinelearning/webmcp#184](https://github.com/webmachinelearning/webmcp/pull/184)
> and Chrome 150 deprecates `navigator.modelContext`. The polyfill installs on
> both surfaces today: `document.modelContext` is the canonical install
> location, and `navigator.modelContext` remains as a deprecated alias that
> resolves to the same instance and logs a one-time console warning on first
> access. Prefer `document.modelContext` for new code.

```js
const modelContext = document.modelContext;
if (modelContext) {
  // Register tools...
}
```

`@mcp-b/webmcp-polyfill` installs only the strict core API:

- `registerTool(tool, options?)` - pass `options.signal` (`AbortSignal`) to unregister when aborted
- `getTools()` - async Chromium producer-preview discovery API
- `executeTool(toolFromGetTools, inputArgsJson, options?)` - Chromium producer-preview execution API
- `unregisterTool(nameOrTool)` (deprecated compatibility API)

It does not install MCP bridge extensions like `callTool`, resources, or prompts.

Important:

- `document.modelContext` is the canonical install location. `navigator.modelContext` is kept as a backward-compatible alias that returns the same instance and logs a one-time deprecation warning on first access. The upstream WebMCP draft moved the getter from Navigator to Document on May 27, 2026 ([webmachinelearning/webmcp#184](https://github.com/webmachinelearning/webmcp/pull/184)) and Chrome 150 deprecates `navigator.modelContext`. The polyfill will remove the Navigator alias in the next major version.
- `document.modelContext` in this package does not provide `listTools()` or `callTool(...)`; producer discovery/execution uses `getTools()` and `executeTool(...)`.
- For list/execute test flows, use `navigator.modelContextTesting` (when `installTestingShim` is enabled).
- `provideContext()` and `clearContext()` were removed from the upstream WebMCP spec on March 5, 2026 and are not exposed by this polyfill.
- `unregisterTool(name)` was removed from the WebMCP draft on April 23, 2026 in favor of `AbortSignal`-driven unregistration. The polyfill keeps it functional with a one-time deprecation warning; it will be removed in the next major version.

## Type Safety First

`@mcp-b/webmcp-polyfill` is runtime-focused. For compile-time safety, pair it with
`@mcp-b/webmcp-types`.

Recommended setup:

- `@mcp-b/webmcp-polyfill` for strict runtime behavior
- `@mcp-b/webmcp-types` for schema-driven TypeScript inference

## Package Selection

| Package                  | Use When                                                  |
| ------------------------ | --------------------------------------------------------- |
| `@mcp-b/webmcp-types`    | You only need compile-time types (no runtime)             |
| `@mcp-b/webmcp-polyfill` | You need strict `document.modelContext` core runtime only |
| `@mcp-b/global`          | You want full MCPB runtime (core + bridge extensions)     |

## Install

```bash
pnpm add @mcp-b/webmcp-polyfill
# or
npm install @mcp-b/webmcp-polyfill
```

## Quick Start (ESM)

```ts
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';

initializeWebMCPPolyfill();

document.modelContext.registerTool({
  name: 'get-page-title',
  description: 'Get the current page title',
  inputSchema: { type: 'object', properties: {} },
  async execute() {
    return {
      content: [{ type: 'text', text: document.title }],
    };
  },
});
```

## Quick Start (Script Tag / IIFE)

```html
<script>
  window.__webMCPPolyfillOptions = {
    installTestingShim: 'if-missing',
  };
</script>
<script src="https://unpkg.com/@mcp-b/webmcp-polyfill@latest/dist/index.iife.js"></script>
```

The IIFE auto-initializes by default.

## Type Inference (with `@mcp-b/webmcp-types`)

The polyfill provides runtime behavior. For strict compile-time inference, pair it with `@mcp-b/webmcp-types`.

```ts
import type { JsonSchemaForInference } from '@mcp-b/webmcp-types';
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';

initializeWebMCPPolyfill();

const inputSchema = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    limit: { type: 'integer', minimum: 1, maximum: 50 },
  },
  required: ['query'],
  additionalProperties: false,
} as const satisfies JsonSchemaForInference;

document.modelContext.registerTool({
  name: 'search',
  description: 'Search indexed docs',
  inputSchema,
  async execute(args) {
    // Inferred type:
    // { query: string; limit?: number }
    return {
      content: [{ type: 'text', text: `Searching for ${args.query} (${args.limit ?? 10})` }],
    };
  },
});
```

Inference notes:

- Best results come from literal schemas (`as const satisfies JsonSchemaForInference`).
- Widened/runtime schemas fall back to `Record<string, unknown>` for safety.

## API

### `initializeWebMCPPolyfill(options?)`

Installs the strict core polyfill on `document.modelContext` (canonical) and `navigator.modelContext` (deprecated alias to the same instance).

| Option                            | Type                                  | Default        | Notes                                                                                                        |
| --------------------------------- | ------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------ |
| `autoInitialize`                  | `boolean`                             | `true`         | Used by auto-init flows (IIFE/import side effect). Set `false` to disable auto-init and initialize manually. |
| `installTestingShim`              | `boolean \| 'always' \| 'if-missing'` | `'if-missing'` | Controls whether `navigator.modelContextTesting` is installed.                                               |
| `disableIframeTransportByDefault` | `boolean`                             | n/a            | Deprecated no-op, kept for compatibility.                                                                    |

Behavior:

- No-op in non-browser environments.
- Non-destructive by default: if either `document.modelContext` or `navigator.modelContext` already exists (e.g. native Chromium support), initialization is skipped.
- Safe to call repeatedly.

### `initializeWebModelContextPolyfill(options?)`

Alias of `initializeWebMCPPolyfill`.

### `cleanupWebMCPPolyfill()`

Restores previous `document.modelContext`, `navigator.modelContext`, and `navigator.modelContextTesting` descriptors and resets polyfill install state.

## Strict Core Behavior

### `registerTool(tool, options?)`

- Requires a non-empty `name`, non-empty `description`, and `execute` function.
- Throws on duplicate tool names.
- If `inputSchema` is omitted, runtime defaults to `{ type: 'object', properties: {} }`.
- `options.signal` (optional `AbortSignal`) - when the signal aborts, the tool is unregistered. If the signal is already aborted at registration time, the polyfill skips the registration and logs a warning (matching the April 23, 2026 spec step).

```ts
const ac = new AbortController();
document.modelContext.registerTool(
  {
    name: 'search',
    description: 'Search docs',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      return { content: [{ type: 'text', text: 'ok' }] };
    },
  },
  { signal: ac.signal }
);

// Later - unregister cleanly:
ac.abort();
```

### `unregisterTool(nameOrTool)` (deprecated)

- Removes a tool by name. MCP-B compatibility runtimes also accept the originally registered tool object.
- Unknown names are a no-op.
- Logs a one-time deprecation warning. Prefer the `AbortSignal` form on `registerTool(tool, options)`.

## Listing and Executing Tools

In `@mcp-b/webmcp-polyfill`, listing and execution helpers are exposed on
`navigator.modelContextTesting` (not `document.modelContext`) when the testing shim is enabled.

```ts
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';

initializeWebMCPPolyfill({ installTestingShim: true });

const tools = navigator.modelContextTesting?.listTools();
const result = await navigator.modelContextTesting?.executeTool(
  'search',
  JSON.stringify({ query: 'webmcp' })
);

void tools;
void result;
```

If you want `callTool(...)` / extension-style runtime methods on `document.modelContext`, use
`@mcp-b/global`.

## Input Schema Support

`inputSchema` accepts:

- Plain JSON Schema objects (`InputSchema`)
- Standard Schema v1 validator objects (`~standard.validate(...)`)
- Standard JSON Schema v1 objects (`~standard.jsonSchema.input(...)`)

Notes:

- Standard JSON Schema conversion is attempted with targets `draft-2020-12`, then `draft-07`.
- When both Standard validator and Standard JSON Schema are present, JSON conversion is preferred for validation parity.

## Optional Testing Shim

When enabled via `installTestingShim`, the polyfill can install a compatibility `navigator.modelContextTesting` with:

- `listTools()`
- `executeTool(toolName, inputArgsJson, options?)`
- `registerToolsChangedCallback(callback)`
- `getCrossDocumentScriptToolResult()`

Older native previews also exposed `navigator.modelContextTesting.ontoolchange`; the polyfill keeps the callback-based compatibility API for now.

`executeTool(...)` accepts JSON-string arguments and returns a serialized result string or `null` (for navigation-style responses).

## Interop with `@mcp-b/global`

- If this polyfill is installed first, `@mcp-b/global` can attach bridge features without replacing the existing core object identity.
- Use `@mcp-b/global` directly when you need extension APIs such as `callTool`, resources, or prompts.

## Migration Notes

- `forceOverride` was removed from initialization options.
- Existing code passing `forceOverride` should remove it.

## License

MIT
