# usewebmcp

React hook for registering strict-core WebMCP tools with `document.modelContext`.

Use `usewebmcp` when an app only needs standard tool registration. Use
`@mcp-b/react-webmcp` for prompts, resources, or MCP client/provider flows.

## Install

```bash
pnpm add usewebmcp react
```

The hook expects `document.modelContext` to exist before it is enabled. Provide it through
native browser support, `@mcp-b/webmcp-polyfill`, or `@mcp-b/global`. Older
`navigator.modelContext` runtimes remain a fallback.

## Quick start

```tsx
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import { useWebMCP } from 'usewebmcp';

initializeWebMCPPolyfill();

const INPUT_SCHEMA = {
  type: 'object',
  properties: { query: { type: 'string' } },
  required: ['query'],
} as const;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: { total: { type: 'integer' } },
  required: ['total'],
} as const;

export function SearchTool() {
  const search = useWebMCP({
    name: 'search',
    description: 'Search indexed documents',
    inputSchema: INPUT_SCHEMA,
    outputSchema: OUTPUT_SCHEMA,
    execute: async ({ query }) => ({ total: await countMatches(query) }),
  });

  return (
    <button disabled={search.state.isExecuting} onClick={() => search.execute({ query: 'webmcp' })}>
      Run search ({search.state.executionCount})
    </button>
  );
}
```

JSON Schema literals infer the `execute` input, output, returned `execute(input)`, and
`state.lastResult` types. Standard JSON Schema v1 inputs such as Zod 4.2+ are also supported.

## API

```ts
const { state, execute, reset } = useWebMCP(config, deps?);
```

`config` contains:

- `name` and `description`
- optional `enabled`, which defaults to `true`
- optional `inputSchema`, `outputSchema`, and `annotations`
- `execute(input)`, which may return synchronously or asynchronously

`state` contains `isExecuting`, `lastResult`, `error`, and `executionCount`. The returned
`execute(input)` invokes the same implementation locally. `reset()` clears observed state; it does
not cancel work already running.

## Conditional registration

Pass `enabled: false` to keep the tool unregistered. Changing it to `true` registers the latest
committed configuration; changing it back to `false` unregisters the tool. Call the hook
unconditionally and pass your condition as `enabled`.

Disabling preserves execution state and the local `execute` and `reset` controls. It does not
cancel your `execute` implementation. An in-flight MCP request may still be rejected by the
runtime when its registration is removed. `enabled` controls exposure, not authorization.

## Tool responses

Raw return values use the same normalization as the MCP-B runtime:

- Existing MCP responses with a `content` array pass through unchanged.
- Strings become text content.
- JSON values become text content plus `structuredContent`.
- Other values receive a safe text representation.

When `outputSchema` is present, a non-JSON-serializable result rejects local execution and becomes
an MCP error response. Native Chrome WebMCP does not advertise `outputSchema`; it is MCP-B metadata
for output inference and compatible runtimes.

## Re-registration

While enabled, the tool re-registers when `name`, `description`, or a value in `deps` changes. Implementations,
schemas, and annotations use their latest committed values without reference-driven churn. Include
a primitive schema or annotation revision in `deps` when registered metadata must change.

Registration is aborted on unmount or when disabled. If the runtime is missing while enabled, the hook warns and skips
registration; initialize the runtime first rather than polling once per hook.

## Exports

- `useWebMCP`
- `WebMCPConfig`
- `WebMCPReturn`
- `ToolExecutionState`
- `ToolExecuteFunction`
- `InferToolInput`
- `InferOutput`

## License

MIT
