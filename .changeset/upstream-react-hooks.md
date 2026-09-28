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

**Behavior change:** a supplied Standard Schema validator now runs before both
local and agent execution. Async validation is awaited, invalid input never reaches
the handler, and the handler receives the transformed output. Callers still pass
the schema's input type. Schemas need the JSON Schema conversion interface to
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
handler if you need runtime checks on local or native calls. MCP calls through
`BrowserMcpServer` also receive the MCP server's schema validation. `outputSchema`
validation runs on MCP calls; local/native execution only checks that a result
with output metadata can produce JSON-serializable structured content.

### Results, state, and lifecycle

- Local `execute()` and `state.lastResult` retain the handler's value. Agent calls
  receive MCP responses by default. `formatOutput` and `formatError` can override
  agent formatting, and async formatters are awaited.
- The default agent error response has `isError: true`; local failures and
  cancellation reject. A returned `Error` is treated as a failure. Formatted errors
  do not increment `executionCount`.
- Handlers receive `(input, { signal })`. Local calls accept
  `execute(input, { signal: controller.signal })`; forward the signal to cancellable
  operations. Cancelled work cannot later publish a successful result.
- Inspect `registrationError` for setup failures and `state.error` for execution
  failures. `isSupported` only reports API availability; use the runtime's
  `getTools()` to confirm discovery. Tool hooks have no `isRegistered` field;
  prompt/resource hooks retain it.
- Treat schemas as immutable. Replace them to change metadata; equivalent
  serialized descriptors avoid re-registration, and callbacks read committed props.
  Missing runtimes are retried for up to ten seconds after mount. Install your
  runtime before mounting tools if it may take longer.
- Production bundles preserve `'use client'` and support React 18/19 SSR and
  StrictMode. Registration races no longer overwrite replacement registrations.
