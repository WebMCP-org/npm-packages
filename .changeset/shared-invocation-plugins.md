---
'@mcp-b/webmcp-polyfill': minor
'@mcp-b/webmcp-ts-sdk': minor
'usewebmcp': minor
'@mcp-b/react-webmcp': minor
'@mcp-b/webmcp-types': patch
---

Add experimental framework-independent invocation middleware through explicit polyfill package
entry points. Standard Schema validation, consent decisions, OpenTelemetry instrumentation, and
execution state work with native WebMCP and the fallback. Required browser behavior remains in
the core; importing plugins does not initialize the browser API.

`useWebMCPTool` registers tools without an execution-state subscription. `useToolExecutionState`
subscribes a status component to an optional execution observer. Existing `useWebMCP` calls retain
their stateful return shape and automatically use the shared Standard Schema adapter.

Invocations snapshot plain data, arrays, Dates, Maps, and Sets, validate once before consent, prevent repeated
continuations, and propagate cancellation into pending decisions and tool callbacks. Non-JSON
transformed values require an explicit serializable approval binding when consent is used.
Verified consent requires application-side verification; no passkey backend is installed.

The MCP bridge moves validation and protocol formatting inside explicitly managed invocations.
MCP error responses now set execution error state and do not increase the successful execution
count. Local calls keep raw results as data and skip agent formatting. Polyfill and SDK callback
options now carry per-call cancellation signals.
