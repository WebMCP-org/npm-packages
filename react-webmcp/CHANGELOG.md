# @mcp-b/react-webmcp

## 0.2.1-beta.1

### Patch Changes

- b57ebab: Broaden React peer dependency to support React 17, 18, and 19

  Changed React peer dependency from `^19.1.0` to `^17.0.0 || ^18.0.0 || ^19.0.0` to allow usage in projects with older React versions. The hooks only use React 16.8+ compatible features (useState, useEffect, useCallback, useMemo, useRef, useContext), so this is a safe expansion of compatibility. Zod peer dependency set to `^3.25.0` to match MCP SDK requirements.

## 0.2.1-beta.0

### Patch Changes

- 057071a: fix: return structuredContent when outputSchema is defined

  When a tool is registered with an outputSchema, the MCP specification requires the execute result to include both content and structuredContent. This fix ensures compliance with the MCP spec by:

  - Returning structuredContent in the MCP response when outputSchema is provided
  - Passing through structuredContent in the @mcp-b/global bridge handler
  - Adding InferOutput utility type for better Zod schema type inference

- Updated dependencies [057071a]
  - @mcp-b/global@1.2.1-beta.0

## 0.2.0

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
  - @mcp-b/global@1.2.0
  - @mcp-b/webmcp-ts-sdk@1.1.0

## 0.1.6-beta.4

### Patch Changes

- Bump all packages to new beta release
- Updated dependencies
  - @mcp-b/transports@1.1.2-beta.4
  - @mcp-b/global@1.1.3-beta.4
  - @mcp-b/webmcp-ts-sdk@1.0.2-beta.3

## 0.1.6-beta.3

### Patch Changes

- Bump all packages to new beta release
- Updated dependencies
  - @mcp-b/transports@1.1.2-beta.3
  - @mcp-b/global@1.1.3-beta.3
  - @mcp-b/webmcp-ts-sdk@1.0.2-beta.2

## 0.1.6-beta.2

### Patch Changes

- Beta release bump
- Updated dependencies
  - @mcp-b/transports@1.1.2-beta.2
  - @mcp-b/global@1.1.3-beta.2
  - @mcp-b/webmcp-ts-sdk@1.0.2-beta.1

## 0.1.6-beta.1

### Patch Changes

- Updated dependencies
  - @mcp-b/transports@1.1.2-beta.1
  - @mcp-b/global@1.1.3-beta.1

## 0.1.6-beta.0

### Patch Changes

- Beta release for testing
- Updated dependencies
  - @mcp-b/transports@1.1.2-beta.0
  - @mcp-b/global@1.1.3-beta.0
  - @mcp-b/webmcp-ts-sdk@1.0.2-beta.0

## 0.1.5

### Patch Changes

- Updated dependencies [197fabb]
  - @mcp-b/global@1.1.2

## 0.1.4

### Patch Changes

- Updated dependencies [450e2fa]
- Updated dependencies [450e2fa]
  - @mcp-b/global@1.1.1
  - @mcp-b/transports@1.1.1

## 0.1.3

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @mcp-b/global@1.1.0
  - @mcp-b/transports@1.1.0

## 0.1.2

### Patch Changes

- Updated dependencies
  - @mcp-b/global@1.0.15

## 0.1.1

### Patch Changes

- Update documentation and publish packages:
  - @mcp-b/global: Add comprehensive IIFE script tag documentation with usage examples and comparison table
  - @mcp-b/webmcp-ts-sdk: Publish latest version
  - @mcp-b/react-webmcp: Publish latest version
- Updated dependencies
  - @mcp-b/global@1.0.14
  - @mcp-b/webmcp-ts-sdk@1.0.1
