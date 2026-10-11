---
'@mcp-b/webmcp-local-relay': patch
---

The relay widget now lists and runs the page's tools by reading the host page's
`document.modelContext` directly instead of asking the embed over `postMessage`. Native
WebMCP, the polyfill, and `@mcp-b/global` all work. Slow tools now fail with
`Tool execution timed out` and receive an abort signal. Reconnect and reload controls
still use `postMessage`.
