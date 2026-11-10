---
'@mcp-b/webmcp-local-relay': patch
---

Relay tools from pages that use Chrome's native WebMCP again. Chrome 158 reports a tool's
absent `inputSchema` and `annotations` as `null`, which made the relay drop every tool that
did not declare both.
