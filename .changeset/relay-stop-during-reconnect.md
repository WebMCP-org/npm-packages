---
'@mcp-b/webmcp-local-relay': patch
---

`RelayBridgeServer.stop()` now holds when it runs during a reconnect. Before, the reconnect
could finish afterwards and leave the bridge listening.
