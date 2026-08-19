---
'@mcp-b/global': patch
'@mcp-b/mcp-iframe': patch
'@mcp-b/react-webmcp': patch
'@mcp-b/smart-dom-reader': patch
'@mcp-b/transports': patch
'@mcp-b/webmcp-local-relay': patch
'@mcp-b/webmcp-polyfill': patch
'@mcp-b/webmcp-ts-sdk': patch
'usewebmcp': patch
---

Stop emitting declaration source maps, and ship the MIT `LICENSE` text these
packages already declared. Each package shipped `dist` without `src`, so every
published `.d.ts.map` pointed at a file that was not in the tarball; editors
already fall back to the `.d.ts` itself. `@mcp-b/webmcp-types` keeps its maps —
it is the one package that ships `src`, so its maps resolve.
