---
'@mcp-b/smart-dom-reader-server': patch
---

Serialize browser connection and close requests so concurrent calls share one browser and reconnect only after cleanup finishes. Close the browser when the stdio session ends. Report unmatched explicit structure and interactive selectors as errors instead of extracting the whole page.
