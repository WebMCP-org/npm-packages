---
'@mcp-b/react-webmcp': patch
'usewebmcp': patch
---

Declare `sideEffects: false` and a top-level `types` entry. Both packages are
pure re-exports, so bundlers can now tree-shake unused hooks, and consumers on
`moduleResolution: "node"` resolve types without reading the `exports` map.
