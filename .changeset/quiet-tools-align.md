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
'@mcp-b/smart-dom-reader-server': minor
---

Move the browser stack to the MCP TypeScript SDK v2 packages and the current
document-first WebMCP surface. Protocol validation now belongs to the upstream
SDK; MCP-B keeps only the browser/native adapter behavior that MCP does not
provide.

Remove deprecated name-based tool execution, legacy native and userscript
transports, Zod 3-specific schema handling, and duplicated React/runtime
contracts. Remove the retired extension-tools package and local Chrome DevTools
MCP fork; consumers should use the upstream Chrome DevTools MCP package.
Extension port disconnects now close the MCP connection instead of reconnecting
the transport beneath a stale protocol session; reconnect with a new transport
so the client and restarted service worker repeat MCP initialization.

The v2-backed packages now require Node.js 20 or newer, matching the upstream
MCP SDK engine requirement.
