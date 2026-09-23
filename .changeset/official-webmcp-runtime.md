---
'@mcp-b/global': minor
'@mcp-b/webmcp-ts-sdk': minor
'@mcp-b/webmcp-polyfill': patch
'@mcp-b/webmcp-types': minor
---

Use the official WebMCP polyfill as the default global runtime, bundled from a pinned upstream revision while its npm publication is pending. Track webmcp-types 0.1.9, support object-input execution and callback cancellation, and retain MCP-B declarative forms and legacy string-input compatibility. Existing native contexts take precedence; older Chrome contexts can select `nativeExecuteToolInput: 'json'`.
