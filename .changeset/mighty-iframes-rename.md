---
'@mcp-b/mcp-iframe': major
---

Rename the `mcp-iframe-tools-changed` event to `mcp-iframe-items-changed`, since
it fires for every kind of item the frame exposes, not only tools. Listeners
registered under the old name stop firing silently — there is no deprecation
shim. Update `addEventListener('mcp-iframe-tools-changed', …)` to
`addEventListener('mcp-iframe-items-changed', …)`.
