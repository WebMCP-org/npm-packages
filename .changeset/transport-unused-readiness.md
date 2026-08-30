---
'@mcp-b/transports': patch
---

Prevent unhandled readiness promise rejections when closing a tab or iframe client before anyone waits for the server. Readiness consumers still receive the original close error.
