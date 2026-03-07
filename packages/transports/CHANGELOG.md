# @mcp-b/transports

## 2.1.0

### Patch Changes

- @mcp-b/webmcp-ts-sdk@2.1.0

## 2.0.13

### Patch Changes

- Default targetOrigin to '\*' in TabClientTransport and IframeParentTransport instead of throwing when not set. Fix relay schema backwards compatibility by making sources and toolSourceMap optional with empty defaults in RelayServerToolsSchema.
  - @mcp-b/webmcp-ts-sdk@2.0.13

## 2.0.12

### Patch Changes

- @mcp-b/webmcp-ts-sdk@2.0.12

## 2.0.11

### Patch Changes

- @mcp-b/webmcp-ts-sdk@2.0.11

## 2.0.10

### Patch Changes

- Updated dependencies
  - @mcp-b/webmcp-ts-sdk@2.0.10

## 2.0.9

### Patch Changes

- Updated dependencies
  - @mcp-b/webmcp-ts-sdk@2.0.9

## 2.0.8

### Patch Changes

- @mcp-b/webmcp-ts-sdk@2.0.8

## 2.0.7

### Patch Changes

- @mcp-b/webmcp-ts-sdk@2.0.7

## 0.0.0

### Major Changes

- BREAKING CHANGE: Migrate from window.webMCP to navigator.modelContext API

  This release migrates the WebMCP API from the legacy `window.webMCP` interface to the W3C-aligned `navigator.modelContext` API.

  ### Migration Guide

  **Before (v1.x):**

  ```javascript
  window.webMCP.registerTool({
    name: "my_tool",
    // ...
  });
  ```

  **After (v2.x):**

  ```javascript
  navigator.modelContext.registerTool({
    name: "my_tool",
    // ...
  });
  ```

  The IIFE build (`@mcp-b/global/dist/index.iife.js`) now auto-initializes `navigator.modelContext` when loaded via script tag.

## 0.0.0-beta-20260109203913

### Minor Changes

- Add comprehensive request timeout handling and improved documentation to TabClientTransport

  **New Features:**
  - Request timeout mechanism (default 10s) to prevent infinite hangs during page navigation or server unresponsiveness
  - Server ready detection via handshake protocol
  - Active request tracking with timeout management

  **Improvements:**
  - Extensive JSDoc documentation with examples and architecture diagrams
  - Better error messages for timeout scenarios
  - Improved type safety with readonly configuration fields
  - Enhanced lifecycle management for cleanup

  **Bug Fixes:**
  - Prevent memory leaks by properly clearing timeout handlers
  - Handle edge cases during page navigation and server crashes

## 1.2.0

### Minor Changes

- Stable release of all packages with backwards-compatible improvements.

### Patch Changes

- 02833d3: Bump all packages to new beta release
- 1f26978: Beta release for testing
- 7239bb5: Bump all packages to new beta release
- 1f26978: Add dedicated @mcp-b/mcp-iframe package for MCPIframeElement custom element
- b8c2ea5: Beta release bump

## 1.1.2-beta.4

### Patch Changes

- Bump all packages to new beta release

## 1.1.2-beta.3

### Patch Changes

- Bump all packages to new beta release

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
