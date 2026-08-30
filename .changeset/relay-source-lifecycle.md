---
'@mcp-b/webmcp-local-relay': patch
---

Remove disconnected sources and tools from the registry when the relay stops, so restarting cannot advertise stale tools. Keep tool names and invocation routing synchronized when a connected source updates its tab identity.
