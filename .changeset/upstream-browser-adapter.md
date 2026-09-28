---
'@mcp-b/webmcp-ts-sdk': major
---

**Breaking: browser operations now delegate to the upstream WebMCP context.**
The existing constructor remains supported and installs the polyfill when needed:

```ts
import { BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';

const server = new BrowserMcpServer({ name: 'my-app', version: '1.0.0' });
```

`BrowserMcpServer`, `@mcp-b/global`, and `@mcp-b/transports` remain separate packages.
Keep your `connect()` and `close()` calls. The optional `{ native }` override also
remains supported, but supplied contexts must implement the upstream API. The
constructor alone leaves `document.modelContext` pointing at the underlying core;
use `@mcp-b/global` to install the extended document API and default transport.

### Migrate execution and non-browser servers

```diff
- const result = await server.executeTool(tool, JSON.stringify(input));
+ const result = await server.executeTool(tool, input);
```

Use a descriptor from `await server.getTools()`, and parse the JSON-string result.
Callbacks must return JSON-serializable values: the adapter no longer accepts
unquoted strings or bare `null` from old native contexts, parses string discovery
schemas, or falls back to stringifying unsupported callback results. Execution
errors and browser access checks now follow the supplied context. Older native
previews are preserved, not upgraded by polyfill installation.

The adapter no longer implements a standalone WebMCP runtime for environments
without a browser document. In service workers or Node.js, use
`McpServer` from `@modelcontextprotocol/server`; its registration API is
`server.registerTool(name, config, handler)`, with `RegisteredTool.remove()` for
cleanup. Browser tests should run in a secure browser page with the upstream
polyfill, or inject a conforming context.

Tool handlers now receive `(input, { signal })`; pass the signal to cancellable
operations. Use an invocation signal to cancel running work rather than relying on
unregistering a tool to cancel it. MCP schema validation still runs on MCP calls;
direct browser execution invokes the callback without that validation, so validate
there when serving untrusted browser input.

### Move types and helpers

```diff
- import type { ToolDescriptor, ModelContextWithExtensions } from '@mcp-b/webmcp-types';
- import { normalizeInputSchema, normalizeToolResponse } from '@mcp-b/webmcp-polyfill/schema';
+ import type { ToolDescriptor, ModelContextWithExtensions } from '@mcp-b/webmcp-ts-sdk';
+ import { normalizeInputSchema, normalizeToolResponse } from '@mcp-b/webmcp-ts-sdk/schema';
```

Standard browser types use `import type { WebMCP } from 'webmcp-types'`.
Replace `ChromeModelContext`/`ChromeModelContextExtensions` with
`WebMCP.ModelContext`, and execution options with
`WebMCP.ModelContextExecuteToolOptions`. Navigator and testing-shim types are removed.
Schema input inference now follows upstream; preserve literals with `as const`
when declaring schemas separately. `RegisteredTool.title` is required, and
`inputSchema` is an object when present; update mocks accordingly.

The new `/schema` entry retains MCP schema conversion and response helpers. Legacy
`parseChromeToolInput`, `serializeChromeToolResult`, `createUnknownError`,
`createToolInvocationFailedError`, and browser-origin/access validation helpers
are removed; use the context's execution API. `withAbortSignal(operation, signal)`
now requires a signal and rejects with its reason; remove its former third
`getAbortReason` argument, and skip the helper when you have no signal.

### Discovery and exposure

MCP mirroring now includes only the server's document and descendants, preventing
recursive ancestor imports through iframe bridges. Standard `getTools()` still
delegates to upstream frame discovery; identify a tool by its descriptor's
`window`/`origin` when names overlap. Keep using `listTools()` or MCP discovery for
MCP-specific metadata such as `outputSchema`.

The vendored polyfill rejects opaque and extension-scheme `exposedTo` entries before
publication. Use supported trusted web origins and retain explicit exposure
restrictions. MCP peer-origin restrictions remain enforced by the adapter.
