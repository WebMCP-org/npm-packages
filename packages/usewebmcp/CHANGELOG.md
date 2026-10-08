# usewebmcp

## 6.0.0

### Major Changes

- 160acc3: **Breaking: `usewebmcp` now exposes only core WebMCP tools through React.**
  It depends on `webmcp-types` and the React peer, with no MCP-B runtime or MCP SDK
  dependency. Update installed MCP-B packages and `usewebmcp` together for this major
  release.

  ### Keep MCP behavior by changing packages

  If you use Standard Schema/Zod input, `outputSchema`, MCP annotations such as
  `idempotentHint`, `InferOutput`, or automatic MCP result formatting, install
  `@mcp-b/react-webmcp` and change your hook and type imports:

  ```diff
  - import { useWebMCP, type WebMCPConfig, type InferOutput } from 'usewebmcp';
  + import { useWebMCP, type WebMCPConfig, type InferOutput } from '@mcp-b/react-webmcp';
  ```

  Use `@mcp-b/global` in your browser entry to expose MCP metadata, prompts, resources,
  and transports. `@mcp-b/react-webmcp` validates Standard Schema input before calling
  your handler, and its default error response text is the error message alone, where
  5.x returned `Error: <message>`. The core `usewebmcp` hook validates nothing.

  ### Stay on the core hook

  Use a plain JSON Schema object and return your application's result directly:

  ```tsx
  'use client';

  import { useWebMCP } from 'usewebmcp';

  export function SearchTool() {
    const tool = useWebMCP({
      name: 'search',
      description: 'Search documentation',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
      execute: ({ query }) => {
        if (typeof query !== 'string') throw new TypeError('query must be a string');
        return { query };
      },
    });
    return <output>{tool.state.lastResult?.query}</output>;
  }
  ```

  - Core input schemas provide inference and metadata only. Validate input in the
    handler; TypeScript types do not validate agent or JavaScript callers.
  - Zod and other Standard Schema validators, which 5.x accepted, are rejected. Passing
    one is a type error, and at runtime the hook sets `registrationError` instead of
    registering the tool. Switch packages as shown above, or use JSON Schema:

    ```diff
    - inputSchema: z.object({ query: z.string() }),
    + inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    ```

  - Local `execute()` and `state.lastResult` contain the raw handler result. Agent
    callbacks now also return that value, without an MCP `content`/`structuredContent`
    envelope. Browser `document.modelContext.executeTool()` still serializes it to
    JSON; consumers of that method must parse the returned string.
  - Agents receive `null` when the handler returns `undefined`. Any other result must
    be JSON-serializable: a BigInt, function, or circular result fails the agent call,
    and `state.error` records the reason.
  - Core failures reject instead of returning an MCP `isError` response. Handle
    rejections in callers. A returned `Error` is treated as a failed execution.
  - `formatOutput` and `formatError` are extension-hook options, not core options.
    Core annotations come from `WebMCP.ToolAnnotations`.

  Provide `document.modelContext` before mounting tools. With the compatibility
  polyfill, install `@mcp-b/webmcp-polyfill` explicitly and call `installWebMCP()` in
  your browser entry. The hook itself does not install a runtime, does not wait for one
  installed later, and no longer reads `navigator.modelContext`.

  ### Update explicit generic arguments

  Prefer inference from `inputSchema` and `execute`. If you specify types explicitly:

  | 5.x type                                         | New core type                                               |
  | ------------------------------------------------ | ----------------------------------------------------------- |
  | `WebMCPConfig<InputSchema, OutputSchema>`        | `WebMCPConfig<InputSchema, Result>`                         |
  | `WebMCPReturn<OutputSchema, InputSchema>`        | `WebMCPReturn<InputSchema, Result>`                         |
  | `ToolExecuteFunction<InputSchema, OutputSchema>` | `ToolExecuteFunction<InputSchema, Result>`                  |
  | `InferOutput<OutputSchema>`                      | Import from `@mcp-b/react-webmcp`, or use your result type. |

  `Result` is the TypeScript value returned by the handler, not its JSON Schema.
  Input inference follows upstream `WebMCP.ModelContextToolFromSchema`. Preserve
  schema literals with `as const` when declaring them separately; a widened schema
  loses its literal types, so each declared property becomes an optional `unknown` field.

  ### Registration, cancellation, and fixes
  - `isSupported` reports API availability, and `registrationError` reports setup
    failures separately from `state.error`. Neither confirms registration; use
    `await document.modelContext.getTools()` for discovery. Tool hooks do not expose
    `isRegistered`; prompt/resource hooks in the extension package still do.
  - A missing `document.modelContext` no longer logs a warning; check `isSupported`.
    A rejected registration, such as a duplicate tool name, still logs one warning
    naming the tool and now also sets `registrationError`.
  - Handlers receive `(input, { signal })`. Local calls accept
    `execute(input, { signal: controller.signal })`. Forward the signal to work such
    as `fetch`; cancellation rejects and cannot later publish a successful result.
  - Schemas are memoized by object identity: replace a schema object when changing
    it instead of mutating it. Metadata changes refresh registration; equivalent
    serialized descriptors and unrelated renders reuse it. `deps` can force a refresh.
  - Stale registration failures no longer overwrite a replacement registration.
  - Production bundles preserve `'use client'`. The packed hooks are type-checked and
    server-rendered with React 18 and 19; browser tests, including StrictMode, run on
    React 19.
  - The new `usewebmcp/internal` entry serves `@mcp-b/react-webmcp`. It is not a
    stable API and can change in any release.

## 5.1.0

### Minor Changes

- 4836fd6: Add an optional `enabled` flag, defaulting to `true`, to tool, prompt, and resource hook configs.
  `useWebMCPContext` accepts it in an optional fourth options argument. Disabling unregisters the
  item, and re-enabling registers the latest committed configuration. Tool execution state and
  local `execute`/`reset` controls remain available while disabled.

  Avoid allocating new execution state for no-op resets and overlapping starts with no state
  change. Add Chromium browser regression suites using React Profiler to cover render budgets,
  registration changes, stable callbacks, and client consumers in normal and StrictMode renders.

### Patch Changes

- @mcp-b/webmcp-types@5.1.0
- @mcp-b/webmcp-polyfill@5.1.0

## 5.0.3

### Patch Changes

- @mcp-b/webmcp-types@5.0.3
- @mcp-b/webmcp-polyfill@5.0.3

## 5.0.2

### Patch Changes

- @mcp-b/webmcp-types@5.0.2
- @mcp-b/webmcp-polyfill@5.0.2

## 5.0.1

### Patch Changes

- @mcp-b/webmcp-types@5.0.1
- @mcp-b/webmcp-polyfill@5.0.1

## 5.0.0

### Major Changes

- de0b41c: Use the strict `document.modelContext` lifecycle directly, remove duplicate
  runtime and schema contracts, and clean up registrations with `AbortSignal`.
- de0b41c: Drop React 17 from the supported peer range; `react` is now `^18.0.0 || ^19.0.0`.
  The hooks no longer carry mounted-ref guards, which React 18 made unnecessary by
  turning post-unmount state updates into a no-op, so React 17 was already
  unsupported in practice.

### Patch Changes

- de0b41c: Declare `sideEffects: false` and a top-level `types` entry. Both packages are
  pure re-exports, so bundlers can now tree-shake unused hooks, and consumers on
  `moduleResolution: "node"` resolve types without reading the `exports` map.
- de0b41c: Require Node 20 or newer. `@mcp-b/global`, `@mcp-b/mcp-iframe`,
  `@mcp-b/webmcp-polyfill` and `@mcp-b/webmcp-ts-sdk` previously allowed Node 18;
  the rest declared no `engines` range at all and now state the same floor. Node 18
  reached end of life in April 2025. Browser builds are unaffected — this governs
  build tooling and the relay CLI.
- de0b41c: Stop emitting declaration source maps, and ship the MIT `LICENSE` text these
  packages already declared. Each package shipped `dist` without `src`, so every
  published `.d.ts.map` pointed at a file that was not in the tarball; editors
  already fall back to the `.d.ts` itself. `@mcp-b/webmcp-types` keeps its maps —
  it is the one package that ships `src`, so its maps resolve.
- Updated dependencies [de0b41c]
- Updated dependencies [de0b41c]
- Updated dependencies [de0b41c]
- Updated dependencies [de0b41c]
- Updated dependencies [de0b41c]
- Updated dependencies [de0b41c]
- Updated dependencies [de0b41c]
- Updated dependencies [f1dbaa0]
- Updated dependencies [f80daeb]
  - @mcp-b/webmcp-types@5.0.0
  - @mcp-b/webmcp-polyfill@5.0.0

## 4.0.0

### Major Changes

- abaf5d0: Align the WebMCP runtime surface with Chrome 152 and the current document-first API.

  This follows the current first-party WebMCP sources: the W3C WebMCP draft, Chrome's WebMCP imperative API docs, and MCP SEP-2106 for MCP JSON Schema 2020-12 output behavior. `outputSchema` remains MCP-B helper metadata because the current W3C/Chrome WebMCP tool dictionary does not define or enforce it.

  `registerTool` now resolves `undefined`; use `registerTool(tool, { signal })` and abort the signal to unregister tools. `unregisterTool` remains as deprecated compatibility where present.

  The standard producer path is `document.modelContext.getTools()` plus `document.modelContext.executeTool(tool, inputArgsJson)`. Deprecated name-based helpers remain MCP-B compatibility APIs.

  Native tool backfill now supports current `getTools`/`executeTool` contexts, MCP transport output schemas preserve rootless object schemas by adding `type: "object"` on the MCP boundary, and Chrome DevTools WebMCP calls preserve `structuredContent` alongside MCP content blocks. The documentation now calls out the breaking migration path and links to the upstream WebMCP and MCP sources that drive it.

### Patch Changes

- Updated dependencies [abaf5d0]
- Updated dependencies [6b60264]
  - @mcp-b/webmcp-types@4.0.0
  - @mcp-b/webmcp-polyfill@4.0.0

## 3.0.0

### Major Changes

- Align standalone React hooks with the WebMCP v3 document-first API through `@mcp-b/webmcp-polyfill` and `@mcp-b/webmcp-types`.
- Hooks now register against `document.modelContext` first while retaining a `navigator.modelContext` fallback for older preview runtimes.

### Patch Changes

- Updated dependencies [4f3cc5e]
  - @mcp-b/webmcp-types@3.0.0
  - @mcp-b/webmcp-polyfill@3.0.0

## 2.3.1

### Patch Changes

- Updated dependencies
  - @mcp-b/webmcp-types@2.3.1
  - @mcp-b/webmcp-polyfill@2.3.1

## 2.3.0

### Patch Changes

- 9289d98: Track the April 23, 2026 WebMCP draft.
  - `registerTool(tool, options?)` accepts `ModelContextRegisterToolOptions { signal?: AbortSignal }`. Aborting the signal unregisters the tool. Pre-aborted signals short-circuit registration with a console warning.
  - `unregisterTool(name)` is `@deprecated` (removed from the spec on April 23, 2026). It still works against current Chrome Beta 147 and emits a one-time runtime deprecation warning. It will be removed in the next major version.
  - `ToolAnnotations` adds `untrustedContentHint` per the April 23 draft.
  - `@mcp-b/react-webmcp` and `@mcp-b/usewebmcp` use a per-effect `AbortController` for cleanup. On runtimes that ignore the second arg (Chrome Beta 147 native), aborting cannot remove the tool. Install `@mcp-b/global` or `@mcp-b/webmcp-polyfill` to mitigate this.
  - `BrowserMcpServer.registerTool(tool, options?)` forwards `options.signal` to the underlying native context when supported. The deprecated `{ unregister }` return handle is preserved for back-compat and will be removed in the next major version.

  Closes #188.

- Updated dependencies
- Updated dependencies [9289d98]
  - @mcp-b/webmcp-types@2.3.0
  - @mcp-b/webmcp-polyfill@2.3.0

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
