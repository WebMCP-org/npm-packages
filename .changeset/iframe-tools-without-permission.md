---
'@mcp-b/webmcp-ts-sdk': patch
---

A tool registered in a frame that WebMCP's `tools` Permissions Policy blocks, such as a
cross-origin iframe without `allow="tools"` or with a host page that has no WebMCP,
stays available over MCP and logs a warning. Previously the registration rejected and
the frame exposed no tools at all.
