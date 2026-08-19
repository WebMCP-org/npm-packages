---
'@mcp-b/webmcp-local-relay': patch
---

Answer `relay/invoke` with an error result when the tool cannot be resolved or
its browser source has closed. The failure previously threw synchronously out of
the WebSocket message handler, so the relay client hung until the invoke timeout
and the relay process itself exited through its `uncaughtException` handler.
