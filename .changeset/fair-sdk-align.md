---
'@mcp-b/webmcp-ts-sdk': major
'@mcp-b/global': major
---

Move protocol behavior to the official MCP TypeScript SDK v2. The browser
adapter exposes its composed `McpServer`, removes legacy helper APIs, and keeps
global initialization side-effect-only through `document.modelContext`.
