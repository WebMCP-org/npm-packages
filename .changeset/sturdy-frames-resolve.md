---
'@mcp-b/smart-dom-reader': patch
'@mcp-b/smart-dom-reader-server': patch
---

Resolve iframe documents across realms so `frameSelector` works for
extractStructure, extractInteractive, and extractFull. `instanceof Document`
tests the calling realm's constructor, so a document reached through an iframe
never matched it and those three methods threw instead of reading the frame.
