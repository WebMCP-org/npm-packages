---
'@mcp-b/webmcp-local-relay': patch
---

A relay in client mode no longer stops reconnecting after 100 failed attempts. It kept running
with no tools and no way to recover; it now keeps retrying every 3 seconds.
