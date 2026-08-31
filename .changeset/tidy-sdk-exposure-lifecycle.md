---
'@mcp-b/webmcp-ts-sdk': patch
---

Snapshot tool exposure allowlists at registration and compare their parsed origins, so caller mutations cannot change access and equivalent origin URLs match consistently. Reset peer identity when switching transports and detach origin callbacks on reconnect or close, preventing restricted tools from remaining exposed after reconnecting to an unidentified peer.

Reject duplicate connections before changing the active peer's permissions. Close failed connection attempts and clear their exposure state so a retry cannot inherit another peer's access.

Keep restricted tools hidden from opaque peers whose origin serializes as `null`, while preserving exact extension-origin allowlists when the current browser does not recognize their URL scheme.
