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
and transports. The extension hook now validates Standard Schema input for both
local and agent calls, including async validation and transforms. Check handlers
that previously expected unvalidated input; they now receive the validator's output.

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
- Local `execute()` and `state.lastResult` contain the raw handler result. Agent
  callbacks now also return that value, without an MCP `content`/`structuredContent`
  envelope. Browser `document.modelContext.executeTool()` still serializes it to
  JSON; consumers of that method must parse the returned string.
- Core failures reject instead of returning an MCP `isError` response. Handle
  rejections in callers. A returned `Error` is treated as a failed execution.
- `formatOutput` and `formatError` are extension-hook options, not core options.
  Core annotations come from `WebMCP.ToolAnnotations`.

Provide `document.modelContext` before mounting tools. With the compatibility
polyfill, install `@mcp-b/webmcp-polyfill` explicitly and call `installWebMCP()` in
your browser entry. The hook itself does not install a runtime and no longer reads
`navigator.modelContext`.

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
falls back to `Record<string, unknown>`.

### Registration, cancellation, and fixes

- `isSupported` reports API availability, and `registrationError` reports setup
  failures separately from `state.error`. Neither confirms registration; use
  `await document.modelContext.getTools()` for discovery. Tool hooks do not expose
  `isRegistered`; prompt/resource hooks in the extension package still do.
- Handlers receive `(input, { signal })`. Local calls accept
  `execute(input, { signal: controller.signal })`. Forward the signal to work such
  as `fetch`; cancellation rejects and cannot later publish a successful result.
- Schemas are memoized by object identity: replace a schema object when changing
  it instead of mutating it. Metadata changes refresh registration; equivalent
  serialized descriptors and unrelated renders reuse it. `deps` can force a refresh.
- Missing APIs are retried for up to ten seconds after mount. Install the runtime
  before mounting if it may load later than that. Stale registration failures no
  longer overwrite a replacement registration.
- Production bundles preserve `'use client'`; React 18/19 SSR and StrictMode are
  covered by the package checks.
