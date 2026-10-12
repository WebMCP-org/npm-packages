---
'@mcp-b/webmcp-local-relay': patch
---

One malformed tool no longer hides every other tool on the page. The relay skips that tool
with a warning. An input schema without `type`, which WebMCP accepts, is relayed as an object
schema instead of being rejected.
