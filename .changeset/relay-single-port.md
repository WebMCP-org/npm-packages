---
'@mcp-b/webmcp-local-relay': patch
---

A relay now joins the relay that already owns the default port instead of starting a second
server on the port it used last time. Before, a stale `~/.webmcp/relay-port.json` could split
pages and MCP clients across two relays, so page tools never appeared. The relay no longer
reads or writes that file, and the `persistPath` option is ignored.
