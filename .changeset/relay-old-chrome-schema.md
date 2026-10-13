---
'@mcp-b/webmcp-local-relay': patch
---

The widget now says why it skips tools on native WebMCP before Chrome 155, which reports input
schemas as strings: update Chrome, or turn off the WebMCP testing flag to use the polyfill. It
used to call the schema malformed.
