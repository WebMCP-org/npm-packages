---
'@mcp-b/webmcp-local-relay': patch
---

Empty `--label`, `--workspace` and `--relay-id` values are ignored. They broke the relay's
handshake, so other relays treated it as a foreign service and started a second server.
