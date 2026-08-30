---
'@mcp-b/smart-dom-reader': patch
'@mcp-b/smart-dom-reader-server': patch
---

Generate selectors using the actual test attribute and require the preferred CSS selector to identify one element. Fix XPath paths beneath ID anchors and for quoted IDs. Respect zero traversal depth and include a scoped host's shadow root, using direct children instead of redundant descendant scans. Report missing structure selectors instead of silently extracting the whole document.

Refresh the server's embedded reader during workspace builds so both packages ship the same fixes.
