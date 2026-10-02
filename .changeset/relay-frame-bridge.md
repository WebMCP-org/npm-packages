---
'@mcp-b/webmcp-local-relay': patch
---

The relay widget now lists and runs the page's tools through WebMCP itself instead of
asking the embed over `postMessage`. The page still needs native WebMCP or the upstream
polyfill. A custom `document.modelContext` object on the page is no longer seen. Slow
tools now fail with `Tool execution timed out` and receive an abort signal. Reconnect
and reload controls still use `postMessage`.
