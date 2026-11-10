---
'@mcp-b/webmcp-ts-sdk': minor
'@mcp-b/react-webmcp': minor
---

Publish a tool descriptor's `_meta` as the MCP tool's `_meta` in `tools/list`, so MCP Apps tools can link their UI with `_meta.ui.resourceUri` through `registerTool()` and `useWebMCP()`. Previously the field was silently dropped. It is not mirrored to the browser's model context, and a non-object `_meta` rejects with `TypeError`.
