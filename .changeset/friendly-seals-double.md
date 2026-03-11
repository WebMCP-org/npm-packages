---
'@mcp-b/react-webmcp': patch
---

Fix `McpClientProvider` transport switches by closing the previous client connection before reconnecting and ignoring stale tool/resource updates from the old transport.
