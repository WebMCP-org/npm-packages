# usewebmcp

Expose React state and actions as WebMCP tools, with automatic registration and cleanup.

```tsx
'use client';

import { useState } from 'react';
import { useWebMCPTool } from 'usewebmcp';

export function Counter() {
  const [count, setCount] = useState(0);

  useWebMCPTool({
    name: 'get_count',
    description: 'Get the current counter value',
    annotations: { readOnlyHint: true },
    execute: () => ({ count }),
  });

  return (
    <button type="button" onClick={() => setCount((value) => value + 1)}>
      Count: {count}
    </button>
  );
}
```

Each agent call reads the latest committed `count`.

[API reference](https://docs.mcp-b.ai/packages/usewebmcp/reference) · [Framework setup](https://docs.mcp-b.ai/how-to/frameworks)

## Install and provide a runtime

In a React 18 or 19 application:

```bash
pnpm add usewebmcp
```

The hook uses `document.modelContext`. For browsers without it, install and initialize the polyfill:

```bash
pnpm add @mcp-b/webmcp-polyfill
```

```ts
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';

initializeWebMCPPolyfill();
```

Use [`@mcp-b/global`](../global/README.md) for MCP server features. Browser types come from the Community Group's [`webmcp-types`](https://github.com/webmachinelearning/webmcp-types).

## Performance comparison

`useWebMCPTool` has no execution-state subscription. `useWebMCP` includes pending,
result, and error updates. The [comparison harness](https://github.com/WebMCP-org/npm-packages/tree/alex/invocation-runtime/benchmarks/react-hooks)
measures both modes, registration changes, Google, and MCP Cat using the same workloads.

## Feature comparison

| Feature                         | `usewebmcp`     | `@mcp-b/react-webmcp` | MCP Cat | Google    |
| ------------------------------- | --------------- | --------------------- | ------- | --------- |
| Schema validation               | Standard Schema | Standard Schema       | Zod     | Manual    |
| Registration errors             | Yes             | Yes                   | Yes     | Sync only |
| Running, result & error state   | Yes             | Yes                   | Yes     | No        |
| Call tools from React           | Yes             | Yes                   | Yes     | No        |
| Automatic MCP result formatting | No              | Yes                   | No      | Yes       |
| Prompt & resource hooks         | No              | Yes                   | No      | No        |

All four accept JSON Schema. Compared against pinned versions: [MCP Cat 1.1.0](https://www.npmjs.com/package/webmcp-react/v/1.1.0), and [Google 0.2.0](https://www.npmjs.com/package/use-webmcp-tool/v/0.2.0).

## Validate input with your schema library

Pass a schema with Standard JSON Schema conversion and Standard Schema validation. This example uses Zod 4.2+:

```ts
'use client';

import { useWebMCP } from 'usewebmcp';
import { z } from 'zod';

const totalInput = z.object({
  count: z.string().regex(/^\d+$/, 'Use digits for count').transform(Number),
  limit: z.number().default(10),
});

export function useTotalTool() {
  return useWebMCP({
    name: 'calculate_total',
    description: 'Add a numeric count to a limit, which defaults to 10',
    inputSchema: totalInput,
    execute: ({ count, limit }) => ({ total: count + limit }),
  });
}
```

Arguments `{ count: "2" }` become `{ count: 2, limit: 10 }`, producing `{ total: 12 }`.
TypeScript infers the caller input, validated input, and result.

The hook calls your schema's converter and validator, including async validation, defaults,
and transforms. It ships no validation engine. Plain JSON Schema provides metadata and
inference only; validate in your handler when using it. Reuse immutable schema objects to cache
conversion and serialization; replace the object when the schema changes.
[Schema details](https://docs.mcp-b.ai/packages/usewebmcp/reference#schemas-and-inference).

## Choose where execution state lives

`useWebMCPTool` registers a tool without subscribing the component to calls.
`useWebMCP` includes `state` and `reset()` when the same component needs them.
To keep updates in a status child, attach an execution observer once:

```tsx
'use client';

import { useState } from 'react';
import { useWebMCPTool, useToolExecutionState } from 'usewebmcp';
import { createExecutionState, type ExecutionState } from '@mcp-b/webmcp-polyfill/execution-state';

export function ToolPanel() {
  const [execution] = useState(() => createExecutionState<string>());
  useWebMCPTool({
    name: 'get_status',
    description: 'Get the application status',
    annotations: { readOnlyHint: true },
    execute: () => 'ready',
    middleware: [execution.aroundInvoke],
  });
  return <ToolStatus execution={execution} />;
}

function ToolStatus({ execution }: { execution: ExecutionState<string> }) {
  const state = useToolExecutionState(execution);
  return <output>{state.isExecuting ? 'Running' : (state.lastResult ?? 'Not called yet')}</output>;
}
```

The observer records calls even before `ToolStatus` mounts. Removing its subscription
keeps the recorded state; omitting the observer removes state tracking entirely.

## Optional invocation middleware

Both hooks accept `middleware: [tracing, consent]`. The first middleware is outermost.
Validation runs once before consent; observers include validation, approval wait, execution,
and formatting. `next()` cannot repeat an operation within the same call.

Use `checkBinding()` to recheck current permission immediately before execution. React uses
the latest committed checker while retaining the approved handler and arguments. Include an
authority version in `deps` when permission changes should revoke the registration. Protected
server operations must still authorize the exact approved operation.

The shared runtime lives in explicit `@mcp-b/webmcp-polyfill` entry points:
[`/invocation`, `/standard-schema`, `/execution-state`, `/consent`, and `/otel`](../webmcp-polyfill/README.md#invocation-plugins).
These experimental APIs work with native WebMCP and the fallback. Importing them does not
install `document.modelContext`, a validator engine, or an OpenTelemetry SDK.

## State and lifecycle

- `state` exposes `isExecuting`, `lastResult`, `error`, and `executionCount`.
- `execute(input, options?)` calls the validated handler locally. `reset()` clears state without cancelling work.
- `isSupported` reports API availability; `registrationError` reports setup failures separately from `state.error`.
- `enabled: false` unregisters the tool while keeping local execution available.
- Local and agent failures reject by default. `formatOutput` and `formatError` customize agent responses and await async formatters.
- Handlers receive `(input, { signal })` for cancellation, which always rejects.
- Both packages preserve `'use client'` and support React 18/19, SSR, and StrictMode.

See the [reference](https://docs.mcp-b.ai/packages/usewebmcp/reference) for metadata updates,
cancellation, late runtime discovery, and response formatting.

## Migrating from the previous hook

Existing `useWebMCP` calls retain their stateful return shape. Use `useWebMCPTool` to opt out
of call-driven renders. Standard Schema validation now delegates to the shared input adapter.
Raw inputs are snapshotted as plain data, arrays, Dates, Maps, or Sets. Custom class inputs
and accessors are rejected. Vendor outputs remain unrestricted without consent preparation;
prepared outputs must support the same snapshot rules. Dates, Maps, and Sets need an explicit
serializable `binding` for consent.

The core hook now returns raw results and uses upstream WebMCP types. To keep `outputSchema`,
MCP annotations, `InferOutput`, and automatic MCP responses, change your import:

```ts
import { useWebMCP } from '@mcp-b/react-webmcp';
```

Both tool hooks remove `isRegistered`; use the runtime’s `getTools()` for confirmed discovery.
Prompt and resource hooks retain their registration status. Core failures now reject unless
`formatError` is supplied; the MCP adapter keeps MCP error responses by default.

Core `WebMCPConfig` and `WebMCPReturn` now take `TResult` as their second generic.
`InferToolInput` describes caller input; `InferValidatedToolInput` describes validated input.
[Type reference](https://docs.mcp-b.ai/packages/usewebmcp/reference#exported-types).

## Development

From the repository root after `pnpm build`:

```bash
pnpm test:hooks
CHROME_BIN=/path/to/chrome-canary pnpm --filter usewebmcp test:native
```

[Harness details](../../docs/TESTING.md#react-hook-harness). Prior art: [GoogleChromeLabs/use-webmcp-tool](https://github.com/GoogleChromeLabs/use-webmcp-tool).

## License

[MIT](../../LICENSE)
