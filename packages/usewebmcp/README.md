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

## React updates, measured

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/WebMCP-org/npm-packages/0ec463b7d622a35b8df1d70d0ba3323f5e65aa8b/apps/documentation-website/images/react-hooks/performance-dark.png">
  <img src="https://raw.githubusercontent.com/WebMCP-org/npm-packages/0ec463b7d622a35b8df1d70d0ba3323f5e65aa8b/apps/documentation-website/images/react-hooks/performance-light.png" alt="All four hooks make zero re-registrations on parent updates and ten registrations on metadata edits. Google and our hooks produce twenty metadata commits; MCP Cat ten. Starting calls: our hooks one commit, MCP Cat ten; Google has no execution state.">
</picture>

Registration calls and React commits are measured separately for all four hooks.
[Full results and methodology](https://github.com/WebMCP-org/npm-packages/tree/0ec463b7d622a35b8df1d70d0ba3323f5e65aa8b/benchmarks/react-hooks).

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

## How the packages fit together

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/WebMCP-org/npm-packages/01afe21437ce4fe429c3d57162edf10f61cbe38e/apps/documentation-website/images/react-hooks/architecture-dark.png">
  <img src="https://raw.githubusercontent.com/WebMCP-org/npm-packages/01afe21437ce4fe429c3d57162edf10f61cbe38e/apps/documentation-website/images/react-hooks/architecture-light.png" alt="Choose usewebmcp for raw browser tools or @mcp-b/react-webmcp for MCP features. Both use your schema library and runtime.">
</picture>

Both hooks share Standard Schema support. Outside React, the optional
[polyfill schema helper](../webmcp-polyfill/README.md#schema-helpers) converts metadata only;
see the [schema guide](https://docs.mcp-b.ai/how-to/use-schemas-and-structured-output) for validation.

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
