---
"@mcp-b/transports": patch
---

fix: add backwards compatibility for TabServerTransport handshake protocol

Fixes issue where new servers (with handshake protocol) couldn't communicate with old clients (without handshake support). The server now falls back to sending messages with targetOrigin '*' when the client origin is unknown, allowing old clients to connect while maintaining security for clients that support the handshake.
