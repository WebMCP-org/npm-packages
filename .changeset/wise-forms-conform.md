---
'@mcp-b/webmcp-polyfill': patch
'@mcp-b/webmcp-ts-sdk': patch
---

Align declarative form execution with Chromium and the upstream Web Platform
Tests. Autosubmit now preserves native event ordering, opaque documents report
their effective origin, and the composed runtime forwards behavior-only form
registration changes.
