# usewebmcp

## 2.2.0

### Patch Changes

- 2540527: Align MCP-B with the latest WebMCP compatibility direction by deprecating removed context APIs, accepting tool-object unregistration, and keeping the legacy unregister handle available as a deprecated compatibility path in MCP-B wrappers.
- Updated dependencies [2540527]
  - @mcp-b/webmcp-types@2.2.0
  - @mcp-b/webmcp-polyfill@2.2.0

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

- fix(react-webmcp, usewebmcp): guard InferOutput so that `InferOutput<undefined>` resolves to the fallback type instead of never
  - @mcp-b/webmcp-types@2.0.12
  - @mcp-b/webmcp-polyfill@2.0.12

## 2.0.11

### Patch Changes

- @mcp-b/webmcp-types@2.0.11
- @mcp-b/webmcp-polyfill@2.0.11

## 2.0.10

### Patch Changes

- @mcp-b/webmcp-types@2.0.10
- @mcp-b/webmcp-polyfill@2.0.10

## 2.0.9

### Patch Changes

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
