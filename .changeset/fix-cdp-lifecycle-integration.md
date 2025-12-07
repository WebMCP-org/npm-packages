---
"@mcp-b/chrome-devtools-mcp": minor
---

Add per-page WebMCP connection support and improve CDP lifecycle handling

- Support per-page WebMCP connections instead of global state
- Move WebMCP state from module-level to McpContext for proper isolation
- Handle browser close/reopen scenarios for WebMCP transport
- Detect and recover from stale CDP connections after page reload
