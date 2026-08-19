---
'@mcp-b/smart-dom-reader': major
'@mcp-b/smart-dom-reader-server': minor
---

Move DOM extraction to the module-owned reader, traverse open shadow roots, and
remove the undocumented constructor-injection path. The server now ships the
same reader implementation and reports its package version at runtime.
