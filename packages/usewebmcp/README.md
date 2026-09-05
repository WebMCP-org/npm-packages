# usewebmcp

Expose React state and actions as WebMCP tools, with automatic registration and cleanup.

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

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/WebMCP-org/npm-packages/b6f59f720d7be452e239ceb18bc25394f0823e38/apps/documentation-website/images/react-hooks/performance-dark.png">
  <img src="https://raw.githubusercontent.com/WebMCP-org/npm-packages/b6f59f720d7be452e239ceb18bc25394f0823e38/apps/documentation-website/images/react-hooks/performance-light.png" alt="Re-renders for 10 description changes: usewebmcp 20, MCP-B React 20, MCP Cat 10, Google 20. For 10 overlapping calls, start to finish: 11, 11, 20; Google exposes no execution state.">
</picture>

Registration is a tie: all four make 0 registrations on 10 unrelated re-renders, and 10 registrations on 10 description changes.
[Benchmark details](https://github.com/WebMCP-org/npm-packages/tree/b6f59f720d7be452e239ceb18bc25394f0823e38/benchmarks/react-hooks).

## Feature comparison

| Feature                         | `usewebmcp`     | `@mcp-b/react-webmcp` | MCP Cat | Google |
| ------------------------------- | --------------- | --------------------- | ------- | ------ |
| Schema validation               | Standard Schema | Standard Schema       | Zod     | Manual |
| Registration status             | Yes             | Yes                   | No      | Yes    |
| Running, result & error state   | Yes             | Yes                   | Yes     | No     |
| Call tools from React           | Yes             | Yes                   | Yes     | No     |
| Automatic MCP result formatting | No              | Yes                   | No      | Yes    |
| Prompt & resource hooks         | No              | Yes                   | No      | No     |

All four accept JSON Schema. Compared: our PR #329, [MCP Cat 1.1.0](https://www.npmjs.com/package/webmcp-react/v/1.1.0), and [Google 0.2.0](https://www.npmjs.com/package/use-webmcp-tool/v/0.2.0).

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
inference only; validate in your handler when using it.
[Schema details](https://docs.mcp-b.ai/packages/usewebmcp/reference#schemas-and-inference).

## State and lifecycle

- `state` exposes `isExecuting`, `lastResult`, `error`, and `executionCount`.
- `execute(input, options?)` calls the validated handler locally. `reset()` clears state without cancelling work.
- `isSupported`, `isRegistered`, and `registrationError` report registration status.
- `enabled: false` unregisters the tool while keeping local execution available.
- Handlers receive `(input, { signal })` for cancellation.
- Both packages preserve `'use client'` and support React 18/19, SSR, and StrictMode.

See the [reference](https://docs.mcp-b.ai/packages/usewebmcp/reference) for metadata updates,
cancellation, late runtime discovery, and response formatting.

## Migrating from the previous hook

The core hook now returns raw results and uses upstream WebMCP types. To keep `outputSchema`,
MCP annotations, `InferOutput`, and automatic MCP responses, change your import:

```ts
import { useWebMCP } from '@mcp-b/react-webmcp';
```

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
