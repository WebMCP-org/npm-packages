---
'@mcp-b/transports': major
---

Remove legacy native and userscript transports. Browser transports now require
an explicit target origin, use MCP request options for cancellation and
timeouts, and close stale extension sessions when their port disconnects.
