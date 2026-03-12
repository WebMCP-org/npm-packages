# @mcp-b/webmcp-ts-sdk

## 2.1.1

### Patch Changes

- 2540527: Align MCP-B with the latest WebMCP compatibility direction by deprecating removed context APIs, accepting tool-object unregistration, and keeping the legacy unregister handle available as a deprecated compatibility path in MCP-B wrappers.
- Updated dependencies [2540527]
  - @mcp-b/webmcp-types@2.1.1
  - @mcp-b/webmcp-polyfill@2.1.1

## 2.1.0

### Patch Changes

- @mcp-b/webmcp-types@2.1.0
- @mcp-b/webmcp-polyfill@2.1.0

## 2.0.13

### Patch Changes

- @mcp-b/webmcp-types@2.0.13
- @mcp-b/webmcp-polyfill@2.0.13

## 2.0.12

### Patch Changes

- @mcp-b/webmcp-types@2.0.12
- @mcp-b/webmcp-polyfill@2.0.12

## 2.0.11

### Patch Changes

- @mcp-b/webmcp-types@2.0.11
- @mcp-b/webmcp-polyfill@2.0.11

## 2.0.10

### Patch Changes

- Remove noisy console.warn from toTransportSchema for empty schemas and schemas without root type. The normalization behavior is correct — no need to warn consumers.
  - @mcp-b/webmcp-types@2.0.10
  - @mcp-b/webmcp-polyfill@2.0.10

## 2.0.9

### Patch Changes

- Fix duplicate tool invocations when multiple bundles import @mcp-b/global in the same window
  - @mcp-b/webmcp-types@2.0.9
  - @mcp-b/webmcp-polyfill@2.0.9

## 2.0.8

### Patch Changes

- Updated dependencies
  - @mcp-b/webmcp-types@2.0.8
  - @mcp-b/webmcp-polyfill@2.0.8

## 2.0.7

### Patch Changes

- Updated dependencies
  - @mcp-b/webmcp-types@2.0.7
  - @mcp-b/webmcp-polyfill@2.0.7

## 1.1.0

### Minor Changes

- Stable release of all packages with backwards-compatible improvements.

### Patch Changes

- 02833d3: Bump all packages to new beta release
- 1f26978: Beta release for testing
- 7239bb5: Bump all packages to new beta release
- b8c2ea5: Beta release bump

## 1.0.2-beta.3

### Patch Changes

- Bump all packages to new beta release

## 1.0.2-beta.2

### Patch Changes

- Bump all packages to new beta release

## 1.0.2-beta.1

### Patch Changes

- Beta release bump

## 1.0.2-beta.0

### Patch Changes

- Beta release for testing

## 1.0.1

### Patch Changes

- Update documentation and publish packages:
  - @mcp-b/global: Add comprehensive IIFE script tag documentation with usage examples and comparison table
  - @mcp-b/webmcp-ts-sdk: Publish latest version
  - @mcp-b/react-webmcp: Publish latest version
