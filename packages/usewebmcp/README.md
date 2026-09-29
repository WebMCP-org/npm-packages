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

The hook reads `document.modelContext` when it registers and does not wait for a runtime installed
later. For browsers without it, install and initialize the polyfill before rendering tools:

```bash
pnpm add @mcp-b/webmcp-polyfill
```

```ts
import { installWebMCP } from '@mcp-b/webmcp-polyfill';

installWebMCP();
```

Use [`@mcp-b/global`](../global/README.md) for MCP server features. Browser types come from the Community Group's [`webmcp-types`](https://github.com/webmachinelearning/webmcp-types).

## Input schemas

`usewebmcp` accepts the JSON Schema object from the WebMCP API and infers TypeScript input types
from it. The schema is metadata; the hook does not validate arguments. Validate in your handler
when needed. Local calls to `execute()` are typed but do not run a validator.

Zod and other Standard Schema validators are rejected. Passing one is a type error, and at runtime
the hook sets `registrationError` without registering the tool. For Standard Schema validation,
output schemas, MCP annotations, MCP result formatting, or prompt and resource hooks, use
[`@mcp-b/react-webmcp`](../react-webmcp/README.md).

## State and lifecycle

- `state` exposes `isExecuting`, `lastResult`, `error`, and `executionCount`.
- `execute(input, options?)` calls the handler locally. `reset()` clears state without cancelling work.
- `isSupported` reports API availability; `registrationError` reports setup failures separately from `state.error`.
- A rejected registration, such as a duplicate tool name, also logs one `console.warn` naming the tool.
- `enabled: false` unregisters the tool while keeping local execution available.
- Local and agent failures reject. Agents receive `null` when the handler returns `undefined`; any
  other result must be JSON-serializable, or the agent call fails and `state.error` records why.
- Handlers receive `(input, { signal })` for cancellation, which always rejects.
- The hook commits once after mount when `isSupported` becomes true. Later successful registrations
  and unrelated renders add no commits.
- Both packages preserve `'use client'` and support React 18/19, SSR, and StrictMode.

See the [reference](https://docs.mcp-b.ai/packages/usewebmcp/reference) for metadata updates,
cancellation, and raw result handling. The `usewebmcp/internal` entry exists for
`@mcp-b/react-webmcp` and can change in any release.

## Migrating from the previous hook

The core hook returns raw results and uses upstream WebMCP types. To keep Standard Schema
validation, `outputSchema`, MCP annotations, `InferOutput`, and automatic MCP responses, change
your import:

```ts
import { useWebMCP } from '@mcp-b/react-webmcp';
```

Tool hooks expose `isSupported` and `registrationError`; use the runtime’s `getTools()` for confirmed discovery.
Prompt and resource hooks retain their registration status. Core failures reject; the MCP adapter
returns MCP error responses by default, with the error message as text (5.x prefixed `Error: `).

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
