---
'@mcp-b/react-webmcp': major
---

**Use this package for the React hook's MCP extensions.** `useWebMCP` now composes
the core `usewebmcp` lifecycle with Standard Schema validation, output schemas,
MCP annotations, and MCP result formatting. Update installed MCP-B packages and
`usewebmcp` together for this major release.

### Imports and runtime

Existing imports from `@mcp-b/react-webmcp` continue to select the MCP hook. If you
previously imported the MCP-capable hook from `usewebmcp`, change that import:

```diff
- import { useWebMCP, type InferOutput } from 'usewebmcp';
+ import { useWebMCP, type InferOutput } from '@mcp-b/react-webmcp';
```

Initialize `@mcp-b/global` once in your browser entry when using MCP metadata,
prompts, resources, or the default transports. The hook reads
`document.modelContext`; the `navigator.modelContext` fallback is removed. The
standalone polyfill can run tool callbacks, but does not advertise `outputSchema`
to MCP clients. Client-provider hooks still use the MCP client/transport you supply.

This package keeps `WebMCPConfig<InputSchema, OutputSchema>`,
`WebMCPReturn<OutputSchema, InputSchema>`, and `InferOutput<OutputSchema>`.
The new core package's result-value generics do not apply to these extension types.
Move direct schema-helper imports from `@mcp-b/webmcp-polyfill/schema` to
`@mcp-b/webmcp-ts-sdk/schema`, and MCP-B type imports from
`@mcp-b/webmcp-types` to `@mcp-b/webmcp-ts-sdk`.

### Check input validation and transforms

**Behavior change:** a supplied Standard Schema validator now runs before the
handler on every path: local `execute()`, `document.modelContext.executeTool()`,
and MCP calls. Async validation is awaited, invalid input never reaches the
handler, and the handler receives the validated, transformed output. Callers still
pass the schema's input type. Schemas need the JSON Schema conversion interface to
publish their metadata; with Zod, use 4.2 or newer.

```tsx
'use client';

import { useWebMCP } from '@mcp-b/react-webmcp';
import { z } from 'zod';

const inputSchema = z.object({ query: z.string().trim().min(1) });

export function SearchTool() {
  const tool = useWebMCP({
    name: 'search',
    description: 'Search documentation',
    inputSchema,
    execute: ({ query }) => ({ query }), // Receives the trimmed string.
  });
  return <button onClick={() => void tool.execute({ query: ' docs ' })}>Search</button>;
}
```

Remove duplicate parsing/transforms from the handler when the hook already runs
that validator. Plain JSON Schema remains metadata and inference: validate in the
handler if you need runtime checks on local or native calls. The hook registers
the converted JSON Schema without the validator, so MCP calls through
`BrowserMcpServer` are checked by the MCP server against that JSON Schema first
(with the MCP server's error text) and by your validator once. `outputSchema`
validation runs on MCP calls; local/native execution only checks that a result
with output metadata can produce JSON-serializable structured content.

### Results, state, and lifecycle

- Local `execute()` and `state.lastResult` retain the handler's value. Agent calls
  receive MCP responses by default. `formatOutput` and `formatError` can override
  agent formatting, and async formatters are awaited.
- A handler that returns `undefined` reaches agents as a success response whose
  text is `undefined` and that has no `structuredContent`, as in 5.x. Return a
  value, or supply `formatOutput`, to send something else.
- The default agent error response has `isError: true` and its text is
  `error.message`; 5.x prefixed the text with `Error: `. Local failures and
  cancellation reject. A returned `Error` is treated as a failure. Formatted errors
  do not increment `executionCount`. To keep the 5.x text, pass `formatError`:

  ```ts
  formatError: (error) => ({
    content: [{ type: 'text', text: `Error: ${error.message}` }],
    isError: true,
  }),
  ```

- Handlers receive `(input, { signal })`. Local calls accept
  `execute(input, { signal: controller.signal })`; forward the signal to cancellable
  operations. Cancelled work cannot later publish a successful result.
- Inspect `registrationError` for setup failures and `state.error` for execution
  failures. `isSupported` only reports API availability; use the runtime's
  `getTools()` to confirm discovery. Tool hooks have no `isRegistered` field;
  prompt/resource hooks retain it.
- Treat schemas as immutable. Replace them to change metadata; equivalent
  serialized descriptors avoid re-registration, and callbacks read committed props.
  Hooks read `document.modelContext` when they register and do not wait for a
  runtime installed later; install the runtime before mounting tools.
- Production bundles preserve `'use client'`. Server rendering and StrictMode are
  tested on React 19; React 18 stays in the peer range. Registration races no
  longer overwrite replacement registrations.
- This package composes the core hook through the `usewebmcp/internal` subpath.
  That subpath exists for this package and is not a public `usewebmcp` API; keep
  `usewebmcp` and `@mcp-b/react-webmcp` on the same version.
