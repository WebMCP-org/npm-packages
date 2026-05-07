---
'@mcp-b/webmcp-types': minor
'@mcp-b/webmcp-polyfill': minor
'@mcp-b/webmcp-ts-sdk': minor
'@mcp-b/global': minor
'@mcp-b/react-webmcp': patch
'@mcp-b/usewebmcp': patch
---

Track the April 23, 2026 WebMCP draft.

- `registerTool(tool, options?)` accepts `ModelContextRegisterToolOptions { signal?: AbortSignal }`. Aborting the signal unregisters the tool. Pre-aborted signals short-circuit registration with a console warning.
- `unregisterTool(name)` is `@deprecated` (removed from the spec on April 23, 2026). It still works against current Chrome Beta 147 and emits a one-time runtime deprecation warning. It will be removed in the next major version.
- `ToolAnnotations` adds `untrustedContentHint` per the April 23 draft.
- `@mcp-b/react-webmcp` and `@mcp-b/usewebmcp` use a per-effect `AbortController` for cleanup. On runtimes that ignore the second arg (Chrome Beta 147 native), aborting cannot remove the tool. Install `@mcp-b/global` or `@mcp-b/webmcp-polyfill` to mitigate this.
- `BrowserMcpServer.registerTool(tool, options?)` forwards `options.signal` to the underlying native context when supported. The deprecated `{ unregister }` return handle is preserved for back-compat and will be removed in the next major version.

Closes #188.
