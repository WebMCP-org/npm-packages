# usewebmcp

Expose React state and actions as WebMCP tools. The hook registers on mount, uses your latest committed state, and unregisters on unmount.

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

An agent calling `get_count` receives `{ count: 0 }`. Click the button and the next call returns `{ count: 1 }`. Mount the component in a page with native WebMCP or an initialized runtime, as described below.

[API reference](https://docs.mcp-b.ai/packages/usewebmcp/reference) · [Framework setup](https://docs.mcp-b.ai/how-to/frameworks)

## Install and provide a runtime

In a React 18 or 19 application:

```bash
pnpm add usewebmcp
```

The hook uses `document.modelContext`. If your browser already provides it, no runtime package is needed. For other browsers, install the polyfill:

```bash
pnpm add @mcp-b/webmcp-polyfill
```

Initialize it once in your application's client entry:

```ts
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';

initializeWebMCPPolyfill();
```

Use [`@mcp-b/global`](../global/README.md) instead when you need an MCP server and transports. `usewebmcp` itself installs neither a polyfill nor an MCP SDK. Its browser types come from the Community Group's [`webmcp-types`](https://github.com/webmachinelearning/webmcp-types).

## React updates, measured

Write tool definitions inline, keep handlers current, and observe execution from your component.
Equivalent inline schemas stay registered across parent updates. Overlapping calls share pending
state, while each completed call publishes its result.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/WebMCP-org/npm-packages/b45d1e9e2e51b0b49f959b02960e37002d0a65bf/apps/documentation-website/images/react-hooks/performance-dark.png">
  <img src="https://raw.githubusercontent.com/WebMCP-org/npm-packages/b45d1e9e2e51b0b49f959b02960e37002d0a65bf/apps/documentation-website/images/react-hooks/performance-light.png" alt="Starting ten overlapping calls: usewebmcp and its MCP adapter each commit once; MCP Cat webmcp-react 1.1.0 commits ten times.">
</picture>

The fixture runs five times with StrictMode on and five with it off, using React 19.2.8 and
native Chrome WebMCP. All four hooks avoid re-registration for equivalent definitions.
Google's `use-webmcp-tool` exposes registration state only, so it is excluded from this
execution-state chart. These counts describe this scenario, not execution speed.
See the [full results, feature comparison, and reproduction steps](https://github.com/WebMCP-org/npm-packages/tree/b45d1e9e2e51b0b49f959b02960e37002d0a65bf/benchmarks/react-hooks),
including metadata updates and call completion.

## Validate input with your schema library

Pass a schema that provides both Standard JSON Schema conversion and Standard Schema validation. This example uses Zod 4.2 or newer (`pnpm add zod@^4.2`):

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

| Stage                                           | Value                     |
| ----------------------------------------------- | ------------------------- |
| Agent arguments or local `tool.execute()` input | `{ count: "2" }`          |
| Your handler's input after validation           | `{ count: 2, limit: 10 }` |
| Returned result                                 | `{ total: 12 }`           |

TypeScript follows the same path: callers supply a string, the handler receives numbers, and the return value is inferred. Failed validation never calls the handler. Async validation is awaited.

The hook calls methods supplied by your schema. It does not import Zod or ship its own validator:

| Interface                                                         | Method the hook calls                    | Purpose                                           |
| ----------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| [Standard JSON Schema v1](https://standardschema.dev/json-schema) | `schema['~standard'].jsonSchema.input()` | Describe accepted input to the browser and agent  |
| [Standard Schema v1](https://standardschema.dev/)                 | `schema['~standard'].validate(input)`    | Validate and transform arguments before execution |

Conversion tries `draft-2020-12`, then `draft-07`. A converter-only schema supplies metadata without runtime validation. A validator-only schema also needs a JSON Schema converter before it can be registered.

Plain JSON Schema objects are supported too, with inferred inputs. They describe inputs but do not make this hook validate them. Keep application validation in the handler when using plain JSON Schema.

## How the packages fit together

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/WebMCP-org/npm-packages/b45d1e9e2e51b0b49f959b02960e37002d0a65bf/apps/documentation-website/images/react-hooks/architecture-dark.png">
  <img src="https://raw.githubusercontent.com/WebMCP-org/npm-packages/b45d1e9e2e51b0b49f959b02960e37002d0a65bf/apps/documentation-website/images/react-hooks/architecture-light.png" alt="Your component uses usewebmcp for registration, validation, and execution state with a supplied runtime. Your schema library supplies validation; the MCP adapter adds protocol features.">
</picture>

Standard Schema support lives in this hook so it works with either native WebMCP or the polyfill. [`@mcp-b/react-webmcp`](../react-webmcp/README.md) reuses it and adds MCP features.

The polyfill's browser API accepts JSON Schema. Its optional [`@mcp-b/webmcp-polyfill/schema`](../webmcp-polyfill/README.md#schema-helpers) entry converts Standard JSON Schema, but conversion alone does not validate calls. Outside React, validate in your handler or use the MCP SDK's validation path. See [schemas and structured output](https://docs.mcp-b.ai/how-to/use-schemas-and-structured-output).

## Execution and registration state

The hook returns these fields:

| Field                      | Meaning                                                             |
| -------------------------- | ------------------------------------------------------------------- |
| `execute(input, options?)` | Call the same validated handler locally; returns `Promise<TResult>` |
| `state.isExecuting`        | At least one call is pending                                        |
| `state.lastResult`         | Latest successful handler result, initially `null`                  |
| `state.error`              | Latest execution error, initially `null`                            |
| `state.executionCount`     | Successful calls since the last reset                               |
| `reset()`                  | Clear observed execution state without cancelling pending calls     |
| `isSupported`              | A registration API is available                                     |
| `isRegistered`             | The current registration succeeded                                  |
| `registrationError`        | Schema conversion or registration error, initially `null`           |

Local calls and agent calls share validation and state. Local failures reject; agent failures return an `isError` response. Successful agent calls return your value, unless you supply `formatOutput(result)`.

## Lifecycle, cancellation, and server rendering

- Set `enabled: false` to unregister the tool while keeping local execution available.
- Changes to metadata such as the name, schema, or annotations update the registration. Equivalent inline objects do not cause registration churn. Optional `deps` can force a refresh.
- Handlers always receive `(input, { signal })`. Pass that signal to cancellable work such as `fetch`. Local callers can pass `{ signal }` as the second argument to `tool.execute()`. Runtimes that omit execution options get a fresh signal; their cancellation can propagate only if they forward a signal.
- Cancellation clears that call's pending state. Work that ignores cancellation cannot overwrite state when it eventually finishes. Unmounting aborts the registration's separate signal.
- Both published hook packages preserve `'use client'`, including minified builds. Server rendering does not register tools; keep browser-global reads in client effects or tool handlers.
- When the API is missing, discovery retries every 500 ms for up to 10 seconds. Older runtimes can use the deprecated `navigator.modelContext` fallback.

The [reference](https://docs.mcp-b.ai/packages/usewebmcp/reference) covers `exposedTo`, `formatOutput`, and all exported types.

## Migrating from the previous hook

Use `usewebmcp` for upstream WebMCP types and raw results. For `outputSchema`, MCP annotations, and automatic text/`structuredContent` formatting, change your import to:

```ts
import { useWebMCP } from '@mcp-b/react-webmcp';
```

The core types are now `WebMCPConfig<TInputSchema, TResult>` and `WebMCPReturn<TInputSchema, TResult>`. `TResult` is a result type, usually inferred from `execute`. The MCP-B package retains the previous output-schema generics and `InferOutput` helper.

`InferToolInput<T>` describes caller input; `InferValidatedToolInput<T>` describes the handler's input after validation. `@mcp-b/webmcp-types` supplies optional MCP-B extensions and legacy browser types alongside upstream types.

## Development

From the repository root after `pnpm build`:

```bash
pnpm test:hooks
CHROME_BIN=/path/to/chrome-canary pnpm --filter usewebmcp test:native
```

The [harness](../../docs/TESTING.md#react-hook-harness) covers StrictMode, suspended renders, registration races, validation, cancellation, published client directives, and isolated React 18/19 types and server rendering. Prior art: [GoogleChromeLabs/use-webmcp-tool](https://github.com/GoogleChromeLabs/use-webmcp-tool).

## License

[MIT](../../LICENSE)
