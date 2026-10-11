---
'@mcp-b/webmcp-local-relay': patch
---

The relay drops a page that stopped answering heartbeats at once, instead of keeping its tools
listed for another 30 seconds. Shutdown no longer waits for such pages, so the CLI exits cleanly
instead of hitting its 5-second forced exit.
