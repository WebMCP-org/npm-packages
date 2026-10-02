---
'@mcp-b/global': major
---

**Breaking: the global MCP-B runtime now extends the upstream WebMCP context.**
It continues to install automatically from `import '@mcp-b/global'` or the existing
IIFE, and keeps its default tab/iframe transport setup. Update installed MCP-B
packages together for this major release.

### Migrate browser calls

```diff
- const context = navigator.modelContext;
+ const context = document.modelContext;
+ if (!context) throw new Error('WebMCP is unavailable');
- const result = await context.executeTool(tool, JSON.stringify(input));
+ const result = await context.executeTool(tool, input);
```

Feature-detect the context as before. `tool` must be a descriptor returned by
`await context.getTools()`. Imperative tools return JSON strings; native declarative
tools can return plain text. Direct calls preserve that result, while MCP calls
normalize both formats into MCP content. Bare `null` results and serialized
discovery schemas from older Chrome implementations are no longer adapted. Return
JSON-serializable callback results and catch execution rejections.

Remove `installTestingShim` from `initializeWebModelContext()` options and
`window.__webModelContextOptions`. `navigator.modelContextTesting` is removed;
tests should discover descriptors with `getTools()` and execute them through
`document.modelContext`. Native contexts are preserved, so older browser previews
must be upgraded to the current object-input contract.

### Extensions and TypeScript

The declarative API (`toolname`, `tooldescription`, and related attributes) and
`SubmitEvent.agentInvoked`/`respondWith()` remain available from the standalone
polyfill while upstream support is pending. MCP output schemas, prompts, and
resources belong to this package's runtime.

Core declarations now come from `webmcp-types`. The temporary
`@mcp-b/webmcp-types` alias only forwards the upstream `WebMCP` namespace. Import
MCP-B extension types and guards from `@mcp-b/webmcp-ts-sdk`:

```ts
import '@mcp-b/global';
import { isBrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';

const context = document.modelContext;
if (isBrowserMcpServer(context)) {
  const tools = context.listTools(); // MCP-B metadata, including outputSchema.
  console.log(tools);
}
```

Move schema/response helper imports from `@mcp-b/webmcp-polyfill/schema` to
`@mcp-b/webmcp-ts-sdk/schema`. Standard `getTools()` remains upstream discovery;
use MCP discovery or `listTools()` when you need MCP output metadata.

### Cleanup and frames

`cleanupWebModelContext()` closes the MCP server and transport, then restores
the underlying context. Closing the server aborts every registration made
through `document.modelContext` while the runtime was installed, so those tools
also disappear from the underlying context, and calling
`initializeWebModelContext()` again does not bring them back; register them
again after re-initializing. Tools registered directly on the underlying
context, including declarative tools, survive cleanup. The core polyfill and its
declarative layer stay installed for the document lifetime. Use registration
AbortControllers to remove your tools and invocation signals to cancel work.

The transport connects, and announces `mcp-server-ready`, only after the first
discovery of tools already registered on the underlying context, so a client's
first `tools/list` is complete. Upstream discovery waits up to 500 ms for frames
that do not answer, so a page embedding an iframe without WebMCP sees its first
ready message delayed by about that much.

Browser discovery and execution now use upstream frame and origin behavior.
Install the runtime in participating frames and configure `exposedTo`,
`getTools({ fromOrigins })`, and iframe `tools` permission for cross-origin use.
The vendored polyfill rejects opaque and extension-scheme exposure origins.
In a top-level document the MCP server mirrors its own tools and those of
same-origin descendant frames; a cross-origin child never appears over MCP even
when `getTools({ fromOrigins })` exposes it. In a non-top frame the server
mirrors only its own window's tools. Standard `getTools()` can still discover
exposed ancestor and sibling tools without importing them into the iframe MCP
bridge.
