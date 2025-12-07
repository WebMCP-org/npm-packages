# @mcp-b/global

## 1.2.1-beta.0

### Patch Changes

- 057071a: fix: return structuredContent when outputSchema is defined

  When a tool is registered with an outputSchema, the MCP specification requires the execute result to include both content and structuredContent. This fix ensures compliance with the MCP spec by:

  - Returning structuredContent in the MCP response when outputSchema is provided
  - Passing through structuredContent in the @mcp-b/global bridge handler
  - Adding InferOutput utility type for better Zod schema type inference

## 1.2.0

### Minor Changes

- Stable release of all packages with backwards-compatible improvements.

### Patch Changes

- 02833d3: Bump all packages to new beta release
- 1f26978: Beta release for testing
- 7239bb5: Bump all packages to new beta release
- b8c2ea5: Beta release bump
- Updated dependencies [02833d3]
- Updated dependencies [1f26978]
- Updated dependencies [7239bb5]
- Updated dependencies [1f26978]
- Updated dependencies [b8c2ea5]
- Updated dependencies
  - @mcp-b/transports@1.2.0
  - @mcp-b/webmcp-ts-sdk@1.1.0

## 1.1.3-beta.4

### Patch Changes

- Bump all packages to new beta release
- Updated dependencies
  - @mcp-b/transports@1.1.2-beta.4
  - @mcp-b/webmcp-ts-sdk@1.0.2-beta.3

## 1.1.3-beta.3

### Patch Changes

- Bump all packages to new beta release
- Updated dependencies
  - @mcp-b/transports@1.1.2-beta.3
  - @mcp-b/webmcp-ts-sdk@1.0.2-beta.2

## 1.1.3-beta.2

### Patch Changes

- Beta release bump
- Updated dependencies
  - @mcp-b/transports@1.1.2-beta.2
  - @mcp-b/webmcp-ts-sdk@1.0.2-beta.1

## 1.1.3-beta.1

### Patch Changes

- Updated dependencies
  - @mcp-b/transports@1.1.2-beta.1

## 1.1.3-beta.0

### Patch Changes

- Beta release for testing
- Updated dependencies
  - @mcp-b/transports@1.1.2-beta.0
  - @mcp-b/webmcp-ts-sdk@1.0.2-beta.0

## 1.1.2

### Patch Changes

- 197fabb: fix: clean rebuild of IIFE bundle to remove stale build artifacts

  The previous 1.1.1 release had a stale build with external dependency references. This release includes a clean rebuild that properly bundles all dependencies.

## 1.1.1

### Patch Changes

- 450e2fa: fix: rebuild IIFE bundle with properly bundled dependencies

  Republish the IIFE build with all dependencies properly bundled. The previous published version had external dependency references that caused "ReferenceError: \_\_mcp_b_transports is not defined" when loaded via script tag.

- Updated dependencies [450e2fa]
  - @mcp-b/transports@1.1.1

## 1.1.0

### Minor Changes

- Add dual-server mode with iframe support

  - Implemented dual-server mode allowing multiple MCP server instances
  - Added iframe-based server communication support
  - Enhanced navigator.modelContext polyfill with multi-server capabilities
  - Improved tool registration and management for complex multi-server scenarios

### Patch Changes

- Updated dependencies
  - @mcp-b/transports@1.1.0

## 1.0.15

### Patch Changes

- Fix IIFE build bundling issue - ensure all dependencies are properly bundled

## 1.0.14

### Patch Changes

- Update documentation and publish packages:
  - @mcp-b/global: Add comprehensive IIFE script tag documentation with usage examples and comparison table
  - @mcp-b/webmcp-ts-sdk: Publish latest version
  - @mcp-b/react-webmcp: Publish latest version
- Updated dependencies
  - @mcp-b/webmcp-ts-sdk@1.0.1
