---
'@mcp-b/webmcp-local-relay': patch
---

fix: prevent zombie processes by detecting client disconnection

When MCP clients (like Qoder) close sessions without properly cleaning up child processes, the relay process becomes a zombie - stdio pipes are broken but the process keeps running, consuming memory and holding ports.

This fix adds multi-layer disconnection detection:

- stdin/stdout event listeners (primary mechanism)
- ppid monitoring for orphan detection (fallback, skipped on Windows)
- 5-second force-exit safety net to prevent hangs

The process now exits cleanly when the MCP client disconnects, preventing zombie accumulation.
