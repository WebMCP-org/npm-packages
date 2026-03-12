---
'@mcp-b/react-webmcp': patch
'@mcp-b/webmcp-ts-sdk': patch
---

Fix `McpClientProvider` transport switches by closing the previous client connection before reconnecting and ignoring stale tool/resource updates from the old transport.

Make `BrowserMcpServer` preserve `provideContext()` and `clearContext()` semantics when a native WebMCP implementation omits `clearContext()`, as seen in the Chrome Beta native API lane.
