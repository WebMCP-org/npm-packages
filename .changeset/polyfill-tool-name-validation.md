---
'@mcp-b/webmcp-polyfill': patch
---

Validate `registerTool()` tool names per WebMCP §4.2 and throw `InvalidStateError` for invalid names and descriptions (fixes #224).
