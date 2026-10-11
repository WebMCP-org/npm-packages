---
'@mcp-b/webmcp-local-relay': patch
---

A page that loads before the relay starts now finds it. Chrome delays new WebSockets after
failed ones, so the widget's 1.2 s probe timeout expired before each socket opened and the
page never connected. The timeout now starts once the socket opens.
