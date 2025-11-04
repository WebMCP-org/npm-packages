# @mcp-b/transports

## 1.1.0

### Minor Changes

- Add iframe transport implementations and server-ready handshake for Tab transports

  - Added IframeChildTransport for iframe child-side communication
  - Added IframeParentTransport for iframe parent-side communication
  - Implemented server-ready handshake protocol for Tab transports to ensure proper initialization
  - Enhanced transport reliability and connection management
