# usewebmcp

Standalone React hooks for strict core WebMCP tool registration via `navigator.modelContext`.

`usewebmcp` is intentionally separate from `@mcp-b/react-webmcp`:

- Use `usewebmcp` for strict core WebMCP workflows.
- Use `@mcp-b/react-webmcp` for full MCP-B runtime features (resources, prompts, client/provider flows, etc.).

## Type Safety First

`usewebmcp` is built for schema-driven types:

- `config.execute`/`config.handler` input is inferred from `inputSchema`
- Tool result type is inferred from `outputSchema`
- `state.lastResult` and returned `execute(input)` are typed from that same inferred output

## Package Selection

| Package                  | Use When                                                   |
| ------------------------ | ---------------------------------------------------------- |
| `usewebmcp`              | React hooks for strict core `navigator.modelContext` tools |
| `@mcp-b/react-webmcp`    | React hooks for full MCP-B runtime surface                 |
| `@mcp-b/webmcp-polyfill` | You need a strict core runtime polyfill                    |
| `@mcp-b/global`          | You need full MCP-B runtime (core + extensions)            |

## Install

```bash
pnpm add usewebmcp react
# or
npm install usewebmcp react
```

Optional (only if you want Standard Schema authoring such as Zod, Valibot, or ArkType):

```bash
pnpm add zod
```

## Runtime Prerequisite

`usewebmcp` expects `window.navigator.modelContext` to exist.

You can provide it via:

- Browser-native WebMCP implementation, or
- `@mcp-b/webmcp-polyfill`, or
- `@mcp-b/global`

If `navigator.modelContext` is missing, the hook logs a warning and skips registration.

## Quick Start

```tsx
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import { useWebMCP } from 'usewebmcp';

initializeWebMCPPolyfill();

const COUNTER_INPUT_SCHEMA = {
  type: 'object',
  properties: {},
} as const;

const COUNTER_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    count: { type: 'integer' },
  },
  required: ['count'],
  additionalProperties: false,
} as const;

export function CounterTool() {
  const counterTool = useWebMCP({
    name: 'counter_get',
    description: 'Get current count',
    inputSchema: COUNTER_INPUT_SCHEMA,
    outputSchema: COUNTER_OUTPUT_SCHEMA,
    execute: async () => ({ count: 42 }),
  });

  return (
    <div>
      <p>Executions: {counterTool.state.executionCount}</p>
      <p>Last count: {counterTool.state.lastResult?.count ?? 'none'}</p>
      {counterTool.state.error && <p>Error: {counterTool.state.error.message}</p>}
      <button
        onClick={async () => {
          await counterTool.execute({});
        }}
      >
        Run Tool Locally
      </button>
    </div>
  );
}
```

## How `useWebMCP` Works

- Registers a tool on mount with `navigator.modelContext.registerTool(...)`.
- Unregisters on unmount with `navigator.modelContext.unregisterTool(name)`.
- Exposes local execution state:
  - `state.isExecuting`
  - `state.lastResult`
  - `state.error`
  - `state.executionCount`
- Returns `execute(input)` for manual in-app invocation and `reset()` for state reset.

Current Chrome Beta 147 returns `undefined` from `registerTool(...)`, but MCP-B wrappers still expose a deprecated compatibility handle. This hook prefers the returned handle when present and falls back to `unregisterTool(name)`.

Your tool implementation (`config.execute` or `config.handler`) can be synchronous or asynchronous.

## `config.execute` vs returned `execute(...)`

- `config.execute`: preferred config field for tool logic.
- `config.handler`: backward-compatible alias for `config.execute`.
- returned `execute(input)`: hook return function for local manual invocation from your UI/tests.

If both `config.execute` and `config.handler` are provided, `config.execute` is used.

Both paths run the same underlying tool logic and update the hook state.

## Type Inference

### Input inference

`inputSchema` supports:

- JSON Schema literals (`as const`) via `InferArgsFromInputSchema`
- Standard Schema v1 input typing (for example Zod v4 / Valibot / ArkType) via `~standard.types.input`

Registration still flows through `navigator.modelContext.registerTool(...)`, so input schemas on MCP registration surfaces must remain JSON-exportable. Validator-only Standard Schema objects are rejected by the runtime unless JSON Schema metadata can be derived. When a schema exposes both `~standard.validate(...)` and JSON Schema export, the runtime validates through the JSON Schema path for parity with listing and transport metadata.

When you author object schemas as plain JSON Schema literals, TypeScript inference follows JSON Schema semantics:

- properties are optional unless they appear in `required`
- objects stay open unless you set `additionalProperties: false`

If you want exact object inference instead of a widened object type, define both `required` and `additionalProperties: false`.

```tsx
const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    limit: { type: 'integer' },
  },
  required: ['query'],
  additionalProperties: false,
} as const;

useWebMCP({
  name: 'search',
  description: 'Search docs',
  inputSchema: INPUT_SCHEMA,
  execute(input) {
    // input is inferred as { query: string; limit?: number }
    return { total: 1 };
  },
});
```

### Output inference

When `outputSchema` is provided as JSON Schema or Standard JSON Schema:

- implementation return type is inferred from `outputSchema`
- `state.lastResult` is inferred to the same type
- MCP response includes `structuredContent`

For plain JSON Schema object literals, loose schemas produce loose inferred types. For example, omitting `required` makes properties optional, and omitting `additionalProperties: false` keeps the result open to extra keys. If you want a precise output type, prefer:

- `as const satisfies ToolOutputSchema`
- `required` for every guaranteed property
- `additionalProperties: false` for closed object shapes

```tsx
import type { ToolOutputSchema } from '@mcp-b/webmcp-types';

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    total: { type: 'integer' },
  },
  required: ['total'],
  additionalProperties: false,
} as const satisfies ToolOutputSchema;

const tool = useWebMCP({
  name: 'count_items',
  description: 'Count items',
  outputSchema: OUTPUT_SCHEMA,
  execute: () => ({ total: 3 }),
});

// tool.state.lastResult is inferred as { total: number } | null
```

## Manual `execute(...)` Calls

You can call the returned `execute(...)` function directly from your component.

```tsx
function SearchToolPanel() {
  const searchTool = useWebMCP({
    name: 'search_local',
    description: 'Run local search',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    } as const,
    execute: async ({ query }) => ({ query, total: query.length }),
  });

  return (
    <button
      onClick={async () => {
        await searchTool.execute({ query: 'webmcp' });
      }}
    >
      Run Search
    </button>
  );
}
```

## Output Schema Contract

If `outputSchema` is defined, your tool implementation must return a JSON-serializable object result.

Returning a non-object value (`string`, `null`, array, etc.) causes an error response from the registered MCP tool.

If you intentionally return something that violates the declared schema in a test, add `@ts-expect-error` and explain it. That keeps the inference contract strict while still documenting the negative runtime case you are exercising.

## Conditional Registration

Use the `enabled` option to conditionally skip tool registration:

```tsx
const { isAuthenticated } = useAuth();

useWebMCP({
  name: 'admin_action',
  description: 'Perform admin action',
  enabled: isAuthenticated, // only register when authenticated
  execute: async () => {
    /* ... */
  },
});
```

When `enabled` is `false`, the tool is not registered and the effect is a no-op. Switching to `true` registers the tool; switching back unregisters it.

## Re-Registration and Performance

The tool re-registers when any of these change:

- `name`
- `description`
- `inputSchema` (structurally for plain JSON data; function-bearing schemas fall back to identity)
- `outputSchema` (structurally for plain JSON data; function-bearing schemas fall back to identity)
- `annotations` (structurally when JSON-serializable)
- `enabled`
- values in `deps`

Inline JSON schema literals are safe — structurally identical JSON values do not trigger re-registration. Function-bearing schemas such as Standard Schema objects should still be hoisted or memoized so identity stays stable.

The hook avoids re-registration when only callback references change:

- `execute`
- `handler`
- `onStart`
- `onSuccess`
- `onError`
- `formatOutput`

Latest callback versions are still used at execution time.

## API

### `useWebMCP(config, deps?)`

`config` fields:

- `name: string`
- `description: string`
- `inputSchema?`
- `outputSchema?`
- `annotations?`
- `enabled?: boolean` — skip registration when `false` (default: `true`)
- `execute(input)` (preferred)
- `handler(input)` (backward-compatible alias)
- `formatOutput?(output)` (deprecated)
- `onStart?(input)` — called before execution begins
- `onSuccess?(result, input)`
- `onError?(error, input)`

Return value:

- `state`
- `execute(input)`
- `reset()`

`execute(input)` is a local direct call to your configured tool implementation for in-app control/testing.
Tool calls coming from MCP clients still go through `navigator.modelContext`.

## Important Notes

- This is a client-side hook package (`'use client'`).
- `formatOutput` is deprecated; prefer `outputSchema` + structured output.
- When tool output is not a string, default text content is pretty-printed JSON.

## License

MIT
