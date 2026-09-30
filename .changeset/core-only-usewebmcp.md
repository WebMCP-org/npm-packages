---
'usewebmcp': major
---

**Breaking: `usewebmcp` now exposes only core WebMCP tools through React.**
It depends on `webmcp-types` and the React peer, with no MCP-B runtime or MCP SDK
dependency. Update installed MCP-B packages and `usewebmcp` together for this major
release.

### Keep MCP behavior by changing packages

If you use Standard Schema/Zod input, `outputSchema`, MCP annotations such as
`idempotentHint`, `InferOutput`, or automatic MCP result formatting, install
`@mcp-b/react-webmcp` and change your hook and type imports:

```diff
- import { useWebMCP, type WebMCPConfig, type InferOutput } from 'usewebmcp';
+ import { useWebMCP, type WebMCPConfig, type InferOutput } from '@mcp-b/react-webmcp';
```

Use `@mcp-b/global` in your browser entry to expose MCP metadata, prompts, resources,
and transports. `@mcp-b/react-webmcp` validates Standard Schema input before calling
your handler, and its default error response text is the error message alone, where
5.x returned `Error: <message>`. The core `usewebmcp` hook validates nothing.

### Stay on the core hook

Use a plain JSON Schema object and return your application's result directly:

```tsx
'use client';

import { useWebMCP } from 'usewebmcp';

export function SearchTool() {
  const tool = useWebMCP({
    name: 'search',
    description: 'Search documentation',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
    execute: ({ query }) => {
      if (typeof query !== 'string') throw new TypeError('query must be a string');
      return { query };
    },
  });
  return <output>{tool.state.lastResult?.query}</output>;
}
```

- Core input schemas provide inference and metadata only. Validate input in the
  handler; TypeScript types do not validate agent or JavaScript callers.
- Zod and other Standard Schema validators, which 5.x accepted, are rejected. Passing
  one is a type error, and at runtime the hook sets `registrationError` instead of
  registering the tool. Switch packages as shown above, or use JSON Schema:

  ```diff
  - inputSchema: z.object({ query: z.string() }),
  + inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  ```

- Local `execute()` and `state.lastResult` contain the raw handler result. Agent
  callbacks now also return that value, without an MCP `content`/`structuredContent`
  envelope. Browser `document.modelContext.executeTool()` still serializes it to
  JSON; consumers of that method must parse the returned string.
- Agents receive `null` when the handler returns `undefined`. Any other result must
  be JSON-serializable: a BigInt, function, or circular result fails the agent call,
  and `state.error` records the reason.
- Core failures reject instead of returning an MCP `isError` response. Handle
  rejections in callers. A returned `Error` is treated as a failed execution.
- `formatOutput` and `formatError` are extension-hook options, not core options.
  Core annotations come from `WebMCP.ToolAnnotations`.

Provide `document.modelContext` before mounting tools. With the compatibility
polyfill, install `@mcp-b/webmcp-polyfill` explicitly and call `installWebMCP()` in
your browser entry. The hook itself does not install a runtime, does not wait for one
installed later, and no longer reads `navigator.modelContext`.

### Update explicit generic arguments

Prefer inference from `inputSchema` and `execute`. If you specify types explicitly:

| 5.x type                                         | New core type                                               |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `WebMCPConfig<InputSchema, OutputSchema>`        | `WebMCPConfig<InputSchema, Result>`                         |
| `WebMCPReturn<OutputSchema, InputSchema>`        | `WebMCPReturn<InputSchema, Result>`                         |
| `ToolExecuteFunction<InputSchema, OutputSchema>` | `ToolExecuteFunction<InputSchema, Result>`                  |
| `InferOutput<OutputSchema>`                      | Import from `@mcp-b/react-webmcp`, or use your result type. |

`Result` is the TypeScript value returned by the handler, not its JSON Schema.
Input inference follows upstream `WebMCP.ModelContextToolFromSchema`. Preserve
schema literals with `as const` when declaring them separately; a widened schema
loses its literal types, so each declared property becomes an optional `unknown` field.

### Registration, cancellation, and fixes

- `isSupported` reports API availability, and `registrationError` reports setup
  failures separately from `state.error`. Neither confirms registration; use
  `await document.modelContext.getTools()` for discovery. Tool hooks do not expose
  `isRegistered`; prompt/resource hooks in the extension package still do.
- A missing `document.modelContext` no longer logs a warning; check `isSupported`.
  A rejected registration, such as a duplicate tool name, still logs one warning
  naming the tool and now also sets `registrationError`.
- Handlers receive `(input, { signal })`. Local calls accept
  `execute(input, { signal: controller.signal })`. Forward the signal to work such
  as `fetch`; cancellation rejects and cannot later publish a successful result.
- Schemas are memoized by object identity: replace a schema object when changing
  it instead of mutating it. Metadata changes refresh registration; equivalent
  serialized descriptors and unrelated renders reuse it. `deps` can force a refresh.
- Stale registration failures no longer overwrite a replacement registration.
- Production bundles preserve `'use client'`. The packed hooks are type-checked and
  server-rendered with React 18 and 19; browser tests, including StrictMode, run on
  React 19.
- The new `usewebmcp/internal` entry serves `@mcp-b/react-webmcp`. It is not a
  stable API and can change in any release.
