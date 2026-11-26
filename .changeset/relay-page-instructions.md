---
'@mcp-b/webmcp-local-relay': minor
---

Expose page-authored Markdown instructions through the read-only `webmcp_list_sources_instructions` tool.

The relay embed reads `script[type="text/markdown"][data-source-type]` declarations. MCP clients can query instructions by source without adding page text to the server's global instructions.
