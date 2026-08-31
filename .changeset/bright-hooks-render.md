---
'usewebmcp': minor
'@mcp-b/react-webmcp': minor
---

Add an optional `enabled` flag, defaulting to `true`, to tool, prompt, and resource hook configs.
`useWebMCPContext` accepts it in an optional fourth options argument. Disabling unregisters the
item, and re-enabling registers the latest committed configuration. Tool execution state and
local `execute`/`reset` controls remain available while disabled.

Avoid allocating new execution state for no-op resets and overlapping starts with no state
change. Add Chromium browser regression suites using React Profiler to cover render budgets,
registration changes, stable callbacks, and client consumers in normal and StrictMode renders.
