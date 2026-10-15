---
'@mcp-b/webmcp-plugins': minor
'@mcp-b/react-webmcp': minor
---

Add `@mcp-b/webmcp-plugins`: plugins that run around every tool execution, local or agent-initiated. `withPlugins(tool, plugins)` wraps any `registerTool()` descriptor. The package ships `consent` (a `ConsentGuard` approval queue with session approval, WebAuthn user presence, and lockout after repeated failed ceremonies) and `otel` (one OpenTelemetry span per call, without payloads).

`@mcp-b/react-webmcp` accepts `plugins` on `useWebMCP` and adds `useGuardedWebMCP`, `ConsentProvider`, `useConsentGuard`, and `usePendingConsentRequests`. Refused calls reject with a `NotAllowedError` locally and reach agents as MCP errors.
