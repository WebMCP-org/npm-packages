# @mcp-b/transports

## 1.1.2-beta.2

### Patch Changes

- Beta release bump

## 1.1.2-beta.1

### Patch Changes

- Add dedicated @mcp-b/mcp-iframe package for MCPIframeElement custom element

## 1.1.2-beta.0

### Patch Changes

- Beta release for testing

## 1.1.1

### Patch Changes

- 450e2fa: fix: add backwards compatibility for TabServerTransport handshake protocol

  Fixes issue where new servers (with handshake protocol) couldn't communicate with old clients (without handshake support). The server now falls back to sending messages with targetOrigin '\*' when the client origin is unknown, allowing old clients to connect while maintaining security for clients that support the handshake.

## 1.1.0

### Minor Changes

- Add iframe transport implementations and server-ready handshake for Tab transports

  - Added IframeChildTransport for iframe child-side communication
  - Added IframeParentTransport for iframe parent-side communication
  - Implemented server-ready handshake protocol for Tab transports to ensure proper initialization
  - Enhanced transport reliability and connection management
