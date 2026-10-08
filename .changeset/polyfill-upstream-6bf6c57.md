---
'@mcp-b/webmcp-polyfill': patch
---

Vendor upstream revision `6bf6c57`. `registerTool()`, `getTools()` and `executeTool()`
no longer throw `SecurityError` in Firefox and Safari on pages without an
`Origin-Agent-Cluster: ?1` header.

A declarative tool submitted by a real click or Enter now returns the value the page
passes to `respondWith()`. Previously it settled before the form's own `submit`
listener ran.

Removing a declarative form after its page called `respondWith()` no longer rejects the
pending call; it resolves with the response, as in Chrome.
