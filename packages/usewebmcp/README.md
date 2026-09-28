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
import { installWebMCP } from '@mcp-b/webmcp-polyfill';

installWebMCP();
```

Use [`@mcp-b/global`](../global/README.md) for MCP server features. Browser types come from the Community Group's [`webmcp-types`](https://github.com/webmachinelearning/webmcp-types).

## Performance comparison

Both hooks add no renders for successful registration. All four register once per description change and never on unrelated updates in this benchmark.
[Benchmark details and run commands](https://github.com/WebMCP-org/npm-packages/tree/main/benchmarks/react-hooks).

## Feature comparison

| Feature                         | `usewebmcp` | `@mcp-b/react-webmcp` | MCP Cat | Google    |
| ------------------------------- | ----------- | --------------------- | ------- | --------- |
| Hook bundle (gzip)              | 1.7 kB      | 2.1 kB                | 24.2 kB | 0.7 kB    |
| Runtime input validation        | Handler     | Standard Schema       | Zod     | Manual    |
| Registration errors             | Yes         | Yes                   | Yes     | Sync only |
| Running, result & error state   | Yes         | Yes                   | Yes     | No        |
| Call tools from React           | Yes         | Yes                   | Yes     | No        |
| Automatic MCP result formatting | No          | Yes                   | No      | Yes       |
| Prompt & resource hooks         | No          | Yes                   | No      | No        |

Bundle sizes exclude React and include built-in dependencies. App validators and runtimes are extra.

All four accept JSON Schema. Compared: our PR #329, [MCP Cat 1.1.0](https://www.npmjs.com/package/webmcp-react/v/1.1.0), and [Google 0.2.0](https://www.npmjs.com/package/use-webmcp-tool/v/0.2.0).

## Input schemas

`usewebmcp` accepts the JSON Schema object from the WebMCP API and infers TypeScript input types
from it. The schema is metadata; the hook does not validate arguments. Validate in your handler
when needed. Local calls to `execute()` are typed but do not run a validator.

For Standard Schema validation, output schemas, MCP annotations, or MCP result formatting, use
[`@mcp-b/react-webmcp`](../react-webmcp/README.md).

## State and lifecycle

- `state` exposes `isExecuting`, `lastResult`, `error`, and `executionCount`.
- `execute(input, options?)` calls the handler locally. `reset()` clears state without cancelling work.
- `isSupported` reports API availability; `registrationError` reports setup failures separately from `state.error`.
- `enabled: false` unregisters the tool while keeping local execution available.
- Local and agent failures reject; the browser handles registered tool results.
- Handlers receive `(input, { signal })` for cancellation, which always rejects.
- Both packages preserve `'use client'` and support React 18/19, SSR, and StrictMode.

See the [reference](https://docs.mcp-b.ai/packages/usewebmcp/reference) for metadata updates,
cancellation, late runtime discovery, and raw result handling.

## Migrating from the previous hook

The core hook returns raw results and uses upstream WebMCP types. To keep Standard Schema
validation, `outputSchema`, MCP annotations, `InferOutput`, and automatic MCP responses, change
your import:

```ts
import { useWebMCP } from '@mcp-b/react-webmcp';
```

Tool hooks expose `isSupported` and `registrationError`; use the runtime’s `getTools()` for confirmed discovery.
Prompt and resource hooks retain their registration status. Core failures reject; the MCP adapter
returns MCP error responses by default.

Core `WebMCPConfig` and `WebMCPReturn` take `TResult` as their second generic.
`InferToolInput` describes the JSON Schema input accepted by WebMCP.
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
