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
apply separately. The MCP server mirrors only its document and descendants, so
parent registrations no longer get imported recursively through child bridges.
