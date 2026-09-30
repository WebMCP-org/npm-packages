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

Use a descriptor from `await server.getTools()`. Direct execution preserves the
underlying result: imperative tools return JSON strings, while native declarative
tools can return plain text. Over MCP, a native result that parses to a JSON object
becomes structured content (an MCP result envelope passes through unchanged); a
JSON string is returned as its content; any other native result, including
numbers, booleans, `null`, and arrays, is returned as text exactly as the context
produced it, so a native `null` is a success result whose text is `null`. A callback
result is passed through as an MCP result only when it is a valid `CallToolResult`
whose content items use the MCP content types; any other object, such as a rich-text
document with its own `type` and `content` fields, becomes text plus
`structuredContent`. Callbacks must return JSON-serializable values: direct execution
rejects any other result with `UnknownError` instead of stringifying it. The adapter
no longer parses string discovery schemas. Execution errors and browser access checks
now follow the supplied context. Older native previews are preserved, not upgraded
by polyfill installation.

Tool handlers now receive `(input, { signal })`; pass the signal to cancellable
operations. Use an invocation signal to cancel running work rather than relying on
unregistering a tool to cancel it. MCP schema validation still runs on MCP calls;
direct browser execution invokes the callback without that validation, so validate
there when serving untrusted browser input.

The adapter no longer implements a standalone WebMCP runtime. The constructor still
succeeds without a WebMCP context, that is with no `document` (server-side module
evaluation) or on an insecure page (the polyfill does not install), and the server
then serves MCP only: `registerTool()`, `registerPrompt()`, `registerResource()`,
`listTools()`, `connect()`, and `close()` work, no browser context receives the
tools, `getTools()` and `executeTool()` reject with `InvalidStateError`,
`syncNativeTools()` resolves without effect, and no `toolchange` events fire. In
service workers or Node.js, use `McpServer` from `@modelcontextprotocol/server`;
its registration API is `server.registerTool(name, config, handler)`, with
`RegisteredTool.remove()` for cleanup. Browser tests should run in a secure browser
page with the polyfill, or inject a conforming context. Every consumer of this
package now bundles `@mcp-b/webmcp-polyfill` (about 28 KB minified, 10 KB gzip) for
the constructor's install call.

### Lifecycle events

`BrowserMcpServer` exposes `ontoolactivated` and `ontoolcancel` next to
`ontoolchange`, and re-dispatches the underlying context's `toolactivated` and
`toolcancel` events on itself as plain `Event` objects that carry the same
`toolName`, so listeners on `document.modelContext` see them under `@mcp-b/global`.

### Move types and helpers

```diff
- import type { ToolDescriptor, ModelContextWithExtensions } from '@mcp-b/webmcp-types';
- import { normalizeInputSchema, normalizeToolResponse } from '@mcp-b/webmcp-polyfill/schema';
+ import type { ToolDescriptor, ModelContextWithExtensions } from '@mcp-b/webmcp-ts-sdk';
+ import { normalizeInputSchema, normalizeToolResponse } from '@mcp-b/webmcp-ts-sdk/schema';
```

Standard browser types use `import type { WebMCP } from 'webmcp-types'`. This
package re-exports `WebMCP` through `@mcp-b/webmcp-polyfill`, so importing it brings
the polyfill's `SubmitEvent` (`agentInvoked`, `respondWith()`) and global
`ModelContext` declarations into scope.
Replace `ChromeModelContext`/`ChromeModelContextExtensions` with
`WebMCP.ModelContext`, and execution options with
`WebMCP.ModelContextExecuteToolOptions`. Navigator and testing-shim types are removed.
Schema input inference now follows upstream; preserve literals with `as const`
when declaring schemas separately. `RegisteredTool.title` is required, and
`inputSchema` is an object when present; update mocks accordingly.

The `/schema` entry exports `normalizeInputSchema()`, `normalizeToolResponse()`,
`isMcpStandardSchema()`, and the `ToolInputSchema` and `NormalizedInputSchema` types.
The other `@mcp-b/webmcp-polyfill/schema` helpers are removed, including
`parseChromeToolInput()`, `serializeChromeToolResult()`, the error factories,
descriptor coercion and validation, `serializeInputSchema()`, `withAbortSignal()`,
and the browser-origin and access checks. Use the context's execution API and your
own abort handling.

### Discovery and exposure

MCP mirroring includes the server's own document. A top-level document also mirrors
its same-origin descendant frames; a framed document mirrors only its own tools, so
an embedder cannot reach a framed page's children through it. Duplicate-name checks
count only this document's registrations: a local `registerTool()` takes over a
name held by a mirrored child-frame tool once the underlying context accepts it,
and a child's same-named tool is mirrored after the local one is unregistered. When
a mirrored frame is removed, the first failed call to one of its tools drops the
stale mirrors. Standard `getTools()` still delegates to upstream frame discovery;
identify a tool by its descriptor's `window`/`origin` when names overlap. Keep
using `listTools()` or MCP discovery for MCP-specific metadata such as
`outputSchema`.

The vendored polyfill rejects opaque and extension-scheme `exposedTo` entries before
publication. Use supported trusted web origins and retain explicit exposure
restrictions. MCP peer-origin restrictions remain enforced by the adapter.
