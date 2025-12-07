---
"@mcp-b/chrome-devtools-mcp": patch
---

fix(chrome-devtools-mcp): rename build/node_modules to build/vendor for pnpm publish

pnpm publish automatically strips out any directory named `node_modules`, even nested ones like `build/node_modules`. This caused the compiled chrome-devtools-frontend dependencies to be missing from published packages.

The fix renames `build/node_modules` to `build/vendor` after compilation and updates all import paths accordingly.
