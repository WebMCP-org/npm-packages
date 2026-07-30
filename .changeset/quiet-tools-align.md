---
'@mcp-b/codemode': major
'@mcp-b/global': major
'@mcp-b/mcp-iframe': major
'@mcp-b/react-webmcp': major
'@mcp-b/smart-dom-reader': major
'@mcp-b/transports': major
'@mcp-b/webmcp-local-relay': major
'@mcp-b/webmcp-polyfill': major
'@mcp-b/webmcp-ts-sdk': major
'@mcp-b/webmcp-types': major
'usewebmcp': major
'@mcp-b/smart-dom-reader-server': patch
---

Move the browser stack to the MCP TypeScript SDK v2 packages and the current
document-first WebMCP surface. Protocol validation now belongs to the upstream
SDK; MCP-B keeps only the browser/native adapter behavior that MCP does not
provide.

Remove deprecated name-based tool execution, legacy native and userscript
transports, Zod 3-specific schema handling, and duplicated React/runtime
contracts. Remove the retired extension-tools package and local Chrome DevTools
MCP fork; consumers should use the upstream Chrome DevTools MCP package.
