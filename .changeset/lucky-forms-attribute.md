---
'@mcp-b/webmcp-polyfill': patch
---

Report `SubmitEvent.agentInvoked` only for submissions a declarative tool call
started. Ordinary user submissions no longer claim agent attribution, so
`respondWith()` throws `InvalidStateError` outside a running tool call. Submit
listeners now share the per-root lifecycle that already owns reset listeners.
