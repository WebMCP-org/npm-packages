---
'@mcp-b/global': minor
'@mcp-b/webmcp-ts-sdk': minor
'@mcp-b/webmcp-polyfill': major
'@mcp-b/webmcp-types': minor
---

Vendor the official WebMCP polyfill source and use upstream WebMCP types as the core API. Keep `initializeWebMCPPolyfill()` as a deprecated alias to the upstream installer; move MCP-B declarative forms, compatibility aliases, testing helpers, and output-schema behavior into `@mcp-b/global`. The standalone core polyfill no longer provides cleanup or MCP-B extensions.

Keep each MCP server's native-tool mirrors scoped to its document and descendants so iframe bridges do not import their ancestor registrations recursively. The standard WebMCP discovery surface continues to expose the frame tree.
