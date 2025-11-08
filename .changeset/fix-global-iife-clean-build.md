---
"@mcp-b/global": patch
---

fix: clean rebuild of IIFE bundle to remove stale build artifacts

The previous 1.1.1 release had a stale build with external dependency references. This release includes a clean rebuild that properly bundles all dependencies.
