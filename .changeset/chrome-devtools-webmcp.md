---
"@mcp-b/chrome-devtools-mcp": minor
---

Add WebMCP integration to connect to MCP tools registered on webpages

This adds four new tools for interacting with website-specific MCP functionality:
- `connect_webmcp`: Connect to MCP tools on the current webpage
- `list_webmcp_tools`: List available website tools
- `call_webmcp_tool`: Call a website tool
- `disconnect_webmcp`: Disconnect from website tools

Websites can register tools using @mcp-b/global, and AI agents can now interact
with those tools through chrome-devtools-mcp using the Chrome DevTools Protocol.
