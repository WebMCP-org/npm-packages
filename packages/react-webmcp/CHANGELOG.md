# @mcp-b/react-webmcp

## 1.0.0

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

### Patch Changes

- Updated dependencies
  - @mcp-b/global@2.0.0
  - @mcp-b/transports@0.0.0

## 0.0.0

### Patch Changes

- Updated dependencies
  - @mcp-b/global@0.0.0

## 0.0.0

### Patch Changes

- Updated dependencies
  - @mcp-b/global@0.0.0

## 0.0.0-beta-20260109203913

### Minor Changes

- Improve useWebMCP hook lifecycle management and add development warnings

  **New Features:**
  - Development-mode warnings for unstable dependencies that cause unnecessary re-registrations
  - Memoization recommendations for inputSchema, outputSchema, and annotations
  - Warning system for non-primitive deps array values

  **Bug Fixes:**
  - Prevent state updates on unmounted components to avoid memory leaks
  - Fix race condition where callbacks could update after component unmount
  - Use useEffect instead of useLayoutEffect for ref updates (correct lifecycle)

  **Improvements:**
  - Better development experience with actionable warnings
  - Reduced re-registration frequency through stable config detection
  - Enhanced error reporting for common configuration mistakes

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @mcp-b/global@0.0.0-beta-20260109203913
  - @mcp-b/transports@0.0.0-beta-20260109203913

## 0.3.0

### Minor Changes

- 2a873d8: Add `deps` argument to useWebMCP hook for automatic tool re-registration

  The new `deps` argument (second parameter) allows you to specify a dependency array that triggers tool re-registration when values change. This follows the idiomatic React pattern used by `useEffect`, `useMemo`, and `useCallback`.

  Example usage:

  ```tsx
  useWebMCP(
    {
      name: "sites_query",
      description: `Query sites. Current count: ${sites.length}`,
      handler: async () => ({ sites }),
    },
    [sites], // Re-register when sites changes
  );
  ```

  Previously, you would need getter functions like `getSiteCount: () => sites.length` to access current state. Now you can reference values directly and the tool will automatically re-register when dependencies change.

  ## Performance Optimizations

  The hook is optimized to minimize unnecessary JSON-RPC tool update calls:
  - **Memoized JSON conversion**: Zod-to-JSON schema conversions are memoized to avoid recomputation on every render.
  - **Ref-based callbacks**: `handler`, `onSuccess`, `onError`, and `formatOutput` changes don't trigger re-registration.
  - **Single useLayoutEffect**: All callback refs are updated synchronously in a single effect for better performance.

  ## IMPORTANT: Memoize Your Schemas

  Following standard React practices (like React Hook Form and React Query), `inputSchema`, `outputSchema`, and `annotations` use **reference equality** for dependency tracking. You must memoize these values to prevent unnecessary re-registration:

  ```tsx
  // ✅ Good: Memoized schema (recommended)
  const outputSchema = useMemo(() => ({
    count: z.number(),
    items: z.array(z.string()),
  }), []);

  useWebMCP({ name: 'query', outputSchema, handler: ... });

  // ✅ Good: Static schema outside component
  const OUTPUT_SCHEMA = {
    count: z.number(),
    items: z.array(z.string()),
  };

  function MyComponent() {
    useWebMCP({ name: 'query', outputSchema: OUTPUT_SCHEMA, handler: ... });
  }

  // ❌ Bad: Inline schema (re-registers every render!)
  useWebMCP({
    name: 'query',
    outputSchema: { count: z.number() }, // Creates new object every render
    handler: ...
  });
  ```

  **Best practice for deps**: Use primitive values instead of objects/arrays when possible:

  ```tsx
  // Better: derived primitives minimize re-registrations
  const siteIds = sites.map((s) => s.id).join(",");
  const siteCount = sites.length;

  useWebMCP(
    {
      name: "sites_query",
      description: "...",
      handler: async () => ({ sites }),
    },
    [siteCount, siteIds], // Only re-register when these primitives change
  );
  ```

  ## New Demo Application

  Added comprehensive demo app at `e2e/mcp-ui-with-webmcp/apps/webmcp-demo` showcasing:
  - All `useWebMCP` features with proper memoization patterns
  - Integration with React 19 and Tailwind v4
  - Five working MCP tools with structured outputs
  - Real-world examples of the `deps` parameter

## 0.3.0-beta.0

### Minor Changes

- 334f371: Add `deps` argument to useWebMCP hook for automatic tool re-registration

  The new `deps` argument (second parameter) allows you to specify a dependency array that triggers tool re-registration when values change. This follows the idiomatic React pattern used by `useEffect`, `useMemo`, and `useCallback`.

  Example usage:

  ```tsx
  useWebMCP(
    {
      name: "sites_query",
      description: `Query sites. Current count: ${sites.length}`,
      handler: async () => ({ sites }),
    },
    [sites], // Re-register when sites changes
  );
  ```

  Previously, you would need getter functions like `getSiteCount: () => sites.length` to access current state. Now you can reference values directly and the tool will automatically re-register when dependencies change.

  ## Performance Optimizations

  The hook is now optimized to minimize unnecessary JSON-RPC tool update calls:
  - **React-style schema dependencies**: `inputSchema`, `outputSchema`, and `annotations` follow reference semantics. Memoize these objects to avoid unnecessary re-registration.
  - **Memoized JSON conversion**: Zod-to-JSON schema conversions are memoized.
  - **Ref-based callbacks**: `handler`, `onSuccess`, `onError`, and `formatOutput` changes don't trigger re-registration.

  **Best practice**: Use primitive values in `deps` instead of objects/arrays when possible:

  ```tsx
  // Better: derived primitives minimize re-registrations
  const siteIds = sites.map((s) => s.id).join(",");
  useWebMCP(
    { name: "sites_query", description: "...", handler: async () => ({}) },
    [sites.length, siteIds],
  );
  ```

## 0.2.2

### Patch Changes

- 14234a8: Fix biome linter issues by replacing eslint-disable comments with biome-ignore comments for React hooks exhaustive-deps rule

## 0.2.1

### Patch Changes

- b57ebab: Broaden React peer dependency to support React 17, 18, and 19

  Changed React peer dependency from `^19.1.0` to `^17.0.0 || ^18.0.0 || ^19.0.0` to allow usage in projects with older React versions. The hooks only use React 16.8+ compatible features (useState, useEffect, useCallback, useMemo, useRef, useContext), so this is a safe expansion of compatibility. Zod peer dependency set to `^3.25.0` to match MCP SDK requirements.

- b57ebab: fix: return structuredContent when outputSchema is defined

  When a tool is registered with an outputSchema, the MCP specification requires the execute result to include both content and structuredContent. This fix ensures compliance with the MCP spec by:
  - Returning structuredContent in the MCP response when outputSchema is provided
  - Passing through structuredContent in the @mcp-b/global bridge handler
  - Adding InferOutput utility type for better Zod schema type inference

- Updated dependencies [b57ebab]
  - @mcp-b/global@1.2.1

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
