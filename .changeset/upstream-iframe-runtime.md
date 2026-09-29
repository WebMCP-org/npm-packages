---
'@mcp-b/mcp-iframe': major
---

**Breaking: iframe tool bridging now uses only `document.modelContext`.**
The `navigator.modelContext` fallback is removed. Upgrade the host and child MCP-B
packages together, and initialize `@mcp-b/global` in pages using MCP tool, prompt,
and resource bridging. Existing `<mcp-iframe>` attributes and events remain usable.

For imperative browser calls, discover the tool with `getTools()` and call
`executeTool(tool, inputObject)` instead of passing JSON-string input. Parse the
returned JSON string. Move any MCP-B type imports from `@mcp-b/webmcp-types` to
`@mcp-b/webmcp-ts-sdk`; the old types package now only aliases upstream `WebMCP`.

The underlying polyfill supports standard frame discovery when installed in each
frame. Cross-origin WebMCP discovery requires the iframe's `tools` permission,
`exposedTo`, and `getTools({ fromOrigins })`; MCP transport origin settings still
apply separately. A cross-origin child inside `<mcp-iframe>` cannot register
tools under the polyfill, even with `allow="tools"`: the polyfill's permission
handshake identifies a child by its index in the parent's `window.frames`, and
the iframe inside the element's shadow root has no index there, so
`registerTool()` rejects with `NotAllowedError`. Native WebMCP does not have
this limitation. The MCP server mirrors only its document and same-origin
descendants, so parent registrations no longer get imported recursively through
child bridges, and a same-origin child's tools appear twice on the parent
server: unprefixed through that mirroring and prefixed through the element.
