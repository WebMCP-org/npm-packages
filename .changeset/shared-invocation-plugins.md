---
'@mcp-b/webmcp-plugins': major
'@mcp-b/webmcp-polyfill': minor
'@mcp-b/webmcp-ts-sdk': minor
'usewebmcp': major
'@mcp-b/react-webmcp': major
'@mcp-b/webmcp-types': patch
---

Make `useWebMCP` the single registration hook. It returns execution and registration controls,
without implicit execution state or `reset()`. Attach `executionState()` through `plugins` and
subscribe with `useToolExecutionState()` only where status is displayed.

Move the shared invocation runtime into `@mcp-b/webmcp-plugins`. Named plugin factories provide
consent, OpenTelemetry, and execution observation. Standard Schema remains a typed preparation
adapter that validates and transforms once before approval. React selects it from `inputSchema`.

This is a hard cutover: remove `useWebMCPTool`, raw `middleware` arrays, the old factory names,
and the experimental polyfill plugin entry points. No compatibility aliases are retained.
Protected-operation verification stays on the application's server. Browser-required behavior
remains in the polyfill; importing plugins never installs a fallback or telemetry SDK.
