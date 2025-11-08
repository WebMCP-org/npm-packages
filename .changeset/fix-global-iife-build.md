---
"@mcp-b/global": patch
---

fix: rebuild IIFE bundle with properly bundled dependencies

Republish the IIFE build with all dependencies properly bundled. The previous published version had external dependency references that caused "ReferenceError: __mcp_b_transports is not defined" when loaded via script tag.
