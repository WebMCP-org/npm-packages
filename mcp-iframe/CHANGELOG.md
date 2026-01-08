# @mcp-b/mcp-iframe

## 0.2.0-beta.0

### Minor Changes

- a262b42: Enforce MCP name validation for tool and prompt prefixes

  **BREAKING CHANGE**: Default prefix separator changed from `:` to `_` to comply with MCP schema requirements.

  Tool and prompt names must match the pattern `^[a-zA-Z0-9_-]{1,128}# @mcp-b/mcp-iframe. The previous default separator `:` was invalid according to this schema.

  Changes:

  - Changed default `prefix-separator` from `:` to `_`
  - Added runtime validation for prefix separator (warns and sanitizes invalid characters)
  - Added validation for element ID/name (warns and sanitizes invalid characters)
  - Added validation before tool/prompt registration (skips registration with error if final name is invalid)
  - Names exceeding 128 characters will not be registered

  If you were relying on the `:` separator, you can either:

  1. Accept the new `_` separator (recommended for MCP compatibility)
  2. Explicitly set `prefix-separator=":"` attribute (not recommended as it may cause MCP validation errors)

## 0.1.0

### Minor Changes

- 1f26978: Add dedicated @mcp-b/mcp-iframe package for MCPIframeElement custom element
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

## 0.1.0-beta.3

### Patch Changes

- Bump all packages to new beta release
- Updated dependencies
  - @mcp-b/transports@1.1.2-beta.4

## 0.1.0-beta.2

### Patch Changes

- Bump all packages to new beta release
- Updated dependencies
  - @mcp-b/transports@1.1.2-beta.3

## 0.1.0-beta.1

### Patch Changes

- Beta release bump
- Updated dependencies
  - @mcp-b/transports@1.1.2-beta.2

## 0.1.0-beta.0

### Minor Changes

- Add dedicated @mcp-b/mcp-iframe package for MCPIframeElement custom element

### Patch Changes

- Updated dependencies
  - @mcp-b/transports@1.1.2-beta.1
