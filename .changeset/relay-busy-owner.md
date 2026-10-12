---
'@mcp-b/webmcp-local-relay': patch
---

A relay now waits up to 5 seconds, instead of 750 ms, for the relay that owns its port to
answer. A busy relay was mistaken for another service, so a second relay started on the next
port, or failed to start when `--port` was set.
