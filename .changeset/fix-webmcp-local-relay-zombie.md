---
'@mcp-b/webmcp-local-relay': patch
---

Exit when the parent MCP client disconnects. Stdio and parent-process detection,
plus a five-second fallback, prevent orphaned relay processes from retaining
memory and loopback ports.
