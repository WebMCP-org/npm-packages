---
'@mcp-b/webmcp-polyfill': major
'@mcp-b/webmcp-types': major
'@mcp-b/webmcp-ts-sdk': major
'@mcp-b/global': major
'@mcp-b/webmcp-local-relay': patch
'usewebmcp': patch
---

Follow the WebMCP draft's `Tool` interface
([webmachinelearning/webmcp#348](https://github.com/webmachinelearning/webmcp/pull/348)) by
updating `@w3c/webmcp-polyfill` and `webmcp-types` to 0.2.0. On Chrome 160, MCP-B mirrors native
tools again.

Breaking changes from the draft, for pages that use the polyfill:

- `getTools()` returns `Tool` objects. `executeTool()` rejects any other object, including a
  spread copy, with `TypeError`.
- A `Tool` identifies one registration. After that registration is removed, executing the `Tool`
  rejects with `NotFoundError`, even if another tool has its name. Call `getTools()` again.
- `tool.window` is now `tool.source`, and it is null once the document is gone.
- An absent `inputSchema`, `outputSchema`, or `annotations` is null instead of undefined.
- Failed executions reject with the draft's `OperationError`, `DataError`, `NotFoundError`, or
  `InvalidStateError` instead of `UnknownError`.

Declarative tools no longer fire `toolactivated` and `toolcancel` themselves, because the
official polyfill now fires both for every tool.
