---
'@mcp-b/webmcp-local-relay': patch
---

Make the relay widget's per-request timeout configurable via a new `data-request-timeout` attribute on the embed script tag, and bump the default from 10s to 60s so long-running tools (e.g. those chaining several API calls) work out of the box. Closes #197.

Usage:

```html
<script
  src="https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay@latest/dist/browser/embed.js"
  data-request-timeout="120000"
></script>
```

Invalid values (non-positive integers) cause the widget to refuse to start and log an error, mirroring the existing `data-relay-port` validation behavior.
