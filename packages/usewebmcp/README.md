# usewebmcp

Expose React state and actions as WebMCP tools. Registration follows the component lifecycle;
execution state is opt-in.

```tsx
'use client';

import { useState } from 'react';
import { useWebMCP } from 'usewebmcp';

export function Counter() {
  const [count, setCount] = useState(0);

  useWebMCP({
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

Each call reads the latest committed `count`. Calling the tool does not subscribe this
component to execution updates.

[API reference](https://docs.mcp-b.ai/packages/usewebmcp/reference) · [Framework setup](https://docs.mcp-b.ai/how-to/frameworks)

## Install

```bash
pnpm add usewebmcp
```

React 18 and 19 are supported. The package preserves `'use client'` and supports SSR and StrictMode.
Provide `document.modelContext` through native WebMCP, the
[polyfill](../webmcp-polyfill/README.md), or [`@mcp-b/global`](../global/README.md).
The hook does not initialize a browser runtime. Browser types come from the Community Group's
[`webmcp-types`](https://github.com/webmachinelearning/webmcp-types).

For browsers without native support:

```ts
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';

initializeWebMCPPolyfill();
```

Install `@mcp-b/webmcp-polyfill` separately when using this fallback.

## Validate input with your schema library

Pass a schema with Standard JSON Schema conversion and Standard Schema validation.
This example uses Zod 4.2 or newer:

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

`{ count: "2" }` becomes `{ count: 2, limit: 10 }`, producing `{ total: 12 }`.
TypeScript infers caller input, validated input, and the result. The hook delegates to
[`@mcp-b/webmcp-plugins`](../webmcp-plugins/README.md), which calls your supplied converter
and validator. Async validation, defaults, and transforms run before execution and consent.
No validation engine is bundled.

Plain JSON Schema supplies metadata and inference only. Treat schemas as immutable; replace
the object when its contents change. Stable objects avoid repeated conversion and serialization.
[Schema details](https://docs.mcp-b.ai/packages/usewebmcp/reference#schemas-and-inference).

## Subscribe only where state is displayed

Install `@mcp-b/webmcp-plugins`, create one `executionState()` store, and attach it through
`plugins`. `useToolExecutionState()` subscribes the component that displays its state:

```tsx
'use client';

import { useState } from 'react';
import { useWebMCP, useToolExecutionState } from 'usewebmcp';
import { executionState, type ExecutionState } from '@mcp-b/webmcp-plugins/execution-state';

export function ToolPanel() {
  const [execution] = useState(() => executionState<string>());
  useWebMCP({
    name: 'get_status',
    description: 'Get the application status',
    annotations: { readOnlyHint: true },
    execute: () => 'ready',
    plugins: [execution],
  });
  return <ToolStatus execution={execution} />;
}

function ToolStatus({ execution }: { execution: ExecutionState<string> }) {
  const state = useToolExecutionState(execution);
  return <output>{state.isExecuting ? 'Running' : (state.lastResult ?? 'Not called yet')}</output>;
}
```

The store records calls without subscribers. Removing a subscription keeps the recorded state.
Omitting the plugin allocates no execution store. Its snapshot exposes `isExecuting`,
`lastResult`, `error`, and `executionCount`; `execution.reset()` clears observations without
cancelling work.

## Add plugins

Use `plugins: [tracing, execution, consent({ broker })]` to compose named plugins.
The first plugin is outermost. Tracing and state placed before consent observe validation,
approval waiting, execution, and response formatting. Consent receives an immutable snapshot
of validated arguments; plugin order cannot move validation after approval.

[Plugin API and examples](../webmcp-plugins/README.md) cover consent, OpenTelemetry, custom
`{ name, aroundInvoke }` plugins, and framework-independent invocation.

## Return value and lifecycle

| Return                     | Purpose                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `execute(input, options?)` | Call locally and receive the raw result                       |
| `isSupported`              | A registration API is available                               |
| `registrationError`        | Metadata conversion or registration failure, otherwise `null` |

- Handlers receive `(input, { signal })`; cancellation always rejects.
- Local and agent failures reject by default. `formatOutput` and `formatError` customize agent responses.
- `enabled: false` unregisters the tool and keeps local execution available.
- Handler changes use the latest committed callback. Metadata changes refresh registration.
- `checkBinding()` rechecks current authority immediately before execution. Include an authority
  version in `deps` when a change should revoke the registration.

Use the runtime's `getTools()` for confirmed discovery. For MCP output schemas, automatic
MCP responses, prompts, resources, and clients, use [`@mcp-b/react-webmcp`](../react-webmcp/README.md).

## Migration

This is a breaking API change:

- Use `useWebMCP`; `useWebMCPTool` is removed.
- The hook no longer returns `state`, `reset`, or `isRegistered`. Add `executionState()` and
  `useToolExecutionState()` where needed; reset through the store.
- Replace `middleware: [fn]` with `plugins: [{ name: 'my-plugin', aroundInvoke: fn }]`.
- Import invocation helpers from `@mcp-b/webmcp-plugins`. Its `/standard-schema`,
  `/execution-state`, `/consent`, and `/otel` entries replace the removed polyfill entries.
- Replace `createExecutionState()` with `executionState()`, `createOtelMiddleware()` with
  `otel()`, and `broker.aroundInvoke` with `consent({ broker })`.

`inputSchema: vendorSchema` remains supported. Core results are raw values; MCP output metadata
and formatting belong to `@mcp-b/react-webmcp`. Core `WebMCPConfig` and `WebMCPReturn` use
`TResult` as their second generic. [Type reference](https://docs.mcp-b.ai/packages/usewebmcp/reference#exported-types).

## Development

After `pnpm build`, run `pnpm test:hooks` from the repository root.
[Harness](../../docs/TESTING.md#react-hook-harness) ·
[Production comparison](../../benchmarks/react-hooks/README.md) ·
[Google prior art](https://github.com/GoogleChromeLabs/use-webmcp-tool)

## License

[MIT](../../LICENSE)
