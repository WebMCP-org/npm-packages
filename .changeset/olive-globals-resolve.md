---
'@mcp-b/global': patch
---

Point the `browser` export condition at the ESM build instead of the IIFE. The
IIFE bundle has no named exports, so bundlers that honor the `browser` field
(webpack 4, browserify, parcel 1, metro) resolved every named import to
`undefined` and inlined a second copy of the transports, polyfill and SDK. The
IIFE is still reachable through the `./iife` export and by direct path.
