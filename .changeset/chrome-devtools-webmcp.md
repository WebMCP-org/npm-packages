---
"@mcp-b/chrome-devtools-mcp": minor
---

Add WebMCP integration to connect to MCP tools registered on webpages

This adds two new tools for interacting with website-specific MCP functionality:
- `list_webmcp_tools`: List available website tools (auto-connects to WebMCP)
- `call_webmcp_tool`: Call a website tool (auto-connects to WebMCP)

The tools automatically handle connection management - no explicit connect/disconnect
calls needed. WebMCP auto-reconnects when navigating between pages.

Websites can register tools using @mcp-b/global, and AI agents can now interact
with those tools through chrome-devtools-mcp using the Chrome DevTools Protocol.
