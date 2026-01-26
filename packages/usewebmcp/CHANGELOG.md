# usewebmcp

## 0.1.0

### Minor Changes

- 96eb3ad: Add Zod 3.25+ and Zod 4 dual version support for React packages

  - `@mcp-b/react-webmcp` and `usewebmcp` now accept `zod@^3.25.0 || ^4.0.0` as peer dependency
  - Users on Zod 3.25+ can use `import { z } from "zod/v4"` for Zod 4 APIs
  - `@mcp-b/global` improved schema detection to recognize both Zod 3 (`_def`) and Zod 4 (`_zod`) schemas
  - Note: Using Zod schemas directly with `@mcp-b/global` (web standard polyfill) still requires Zod 4 APIs (`z.toJSONSchema`, `z.fromJSONSchema`)

### Patch Changes

- Updated dependencies [96eb3ad]
  - @mcp-b/react-webmcp@1.1.0

## 0.0.2

### Patch Changes

- Updated dependencies
  - @mcp-b/react-webmcp@1.0.0

## 0.0.1

### Patch Changes

- @mcp-b/react-webmcp@0.0.0

## 0.0.0

### Patch Changes

- @mcp-b/react-webmcp@0.0.0

## 0.0.0-beta-20260109203913

### Patch Changes

- Updated dependencies
  - @mcp-b/react-webmcp@0.0.0-beta-20260109203913

## 0.2.3

### Patch Changes

- Updated dependencies [2a873d8]
  - @mcp-b/react-webmcp@0.3.0

## 0.2.3-beta.0

### Patch Changes

- Updated dependencies [334f371]
  - @mcp-b/react-webmcp@0.3.0-beta.0

## 0.2.2

### Patch Changes

- Updated dependencies [14234a8]
  - @mcp-b/react-webmcp@0.2.2

## 0.2.1

### Patch Changes

- b57ebab: Broaden React peer dependency to support React 17, 18, and 19

  Changed React peer dependency from `^19.1.0` to `^17.0.0 || ^18.0.0 || ^19.0.0` to allow usage in projects with older React versions. The hooks only use React 16.8+ compatible features (useState, useEffect, useCallback, useMemo, useRef, useContext), so this is a safe expansion of compatibility. Zod peer dependency set to `^3.25.0` to match MCP SDK requirements.

- Updated dependencies [b57ebab]
- Updated dependencies [b57ebab]
  - @mcp-b/react-webmcp@0.2.1

## 0.2.1-beta.1

### Patch Changes

- b57ebab: Broaden React peer dependency to support React 17, 18, and 19

  Changed React peer dependency from `^19.1.0` to `^17.0.0 || ^18.0.0 || ^19.0.0` to allow usage in projects with older React versions. The hooks only use React 16.8+ compatible features (useState, useEffect, useCallback, useMemo, useRef, useContext), so this is a safe expansion of compatibility. Zod peer dependency set to `^3.25.0` to match MCP SDK requirements.

- Updated dependencies [b57ebab]
  - @mcp-b/react-webmcp@0.2.1-beta.1

## 0.2.1-beta.0

### Patch Changes

- Updated dependencies [057071a]
  - @mcp-b/react-webmcp@0.2.1-beta.0

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
- Updated dependencies [b8c2ea5]
- Updated dependencies
  - @mcp-b/react-webmcp@0.2.0

## 0.1.6-beta.4

### Patch Changes

- Bump all packages to new beta release
- Updated dependencies
  - @mcp-b/react-webmcp@0.1.6-beta.4

## 0.1.6-beta.3

### Patch Changes

- Bump all packages to new beta release
- Updated dependencies
  - @mcp-b/react-webmcp@0.1.6-beta.3

## 0.1.6-beta.2

### Patch Changes

- Beta release bump
- Updated dependencies
  - @mcp-b/react-webmcp@0.1.6-beta.2

## 0.1.6-beta.1

### Patch Changes

- @mcp-b/react-webmcp@0.1.6-beta.1

## 0.1.6-beta.0

### Patch Changes

- Beta release for testing
- Updated dependencies
  - @mcp-b/react-webmcp@0.1.6-beta.0
