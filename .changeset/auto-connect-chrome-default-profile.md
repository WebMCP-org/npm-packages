---
"@mcp-b/chrome-devtools-mcp": patch
---

Auto-connect now checks Chrome's default profile directory for DevToolsActivePort before the MCP cache directory. This enables connecting to a user's existing Chrome instance when remote debugging is enabled via chrome://inspect/#remote-debugging (Chrome 144+), with no extra CLI flags needed.
