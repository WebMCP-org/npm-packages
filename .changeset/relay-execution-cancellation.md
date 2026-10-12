---
'@mcp-b/webmcp-local-relay': patch
---

Forward MCP request cancellation through direct and shared relay connections to the browser's `executeTool()` signal. `RelayBridgeServer.invokeTool()` also accepts an optional `signal`. Timeouts and connection teardown cancel outstanding calls and clean up their listeners; cancellations are scoped to the requesting connection.

Stopping handler work requires a browser runtime that forwards execution signals and a handler that observes them.
