# PR 215 Document ModelContext Test Plan

## Goal

Move the WebMCP packages to the May 27, 2026 `document.modelContext` surface while preserving compatibility for existing `navigator.modelContext` consumers.

The PR should be acceptable only when the new document-first surface is covered at the same level as the legacy navigator surface, and compatibility behavior is intentional instead of accidental.

## Chromium 150 Probe

Tested with downloaded latest Chromium:

```text
/tmp/chromium-latest/chromium/mac_arm-1636964/chrome-mac/Chromium.app/Contents/MacOS/Chromium
Chromium 150.0.7863.0
```

Launch flags:

```text
--enable-experimental-web-platform-features
--enable-features=WebMCPTesting,DevToolsWebMCPSupport
```

Runtime result on `https://example.com`:

- `document.modelContext` exists.
- `navigator.modelContext` exists as a deprecated transition alias.
- `document.modelContext === navigator.modelContext`.
- Reading `navigator.modelContext` emits Chromium's native warning: use `document.modelContext` instead.
- `Document.prototype.modelContext` is a configurable/enumerable getter-only Web IDL attribute.
- `Navigator.prototype.modelContext` is also a configurable/enumerable getter-only alias.
- `Navigator.prototype.modelContextTesting` is a configurable/enumerable accessor with getter and setter.

Producer `ModelContext` prototype:

- `registerTool(tool, options?)`
- `getTools()`
- `executeTool(registeredTool, inputArgsJson)`
- `ontoolchange`
- EventTarget methods

Absent from native producer `ModelContext`:

- `listTools()`
- `callTool(...)`
- `provideContext(...)`
- `clearContext()`
- `unregisterTool(...)`

Testing `ModelContextTesting` prototype:

- `listTools()`
- `executeTool(toolName, inputArgsJson)`
- `getCrossDocumentScriptToolResult()`
- `ontoolchange`
- EventTarget methods

Absent from native `ModelContextTesting`:

- `getTools()`

Important behavior:

- `document.modelContext.getTools()` returns a `Promise`, not a synchronous array.
- `await document.modelContext.getTools()` returns registered tool objects with:
  - `name`
  - `title`
  - `description`
  - JSON-stringified `inputSchema`
  - `origin`
  - `window`
- `document.modelContext.executeTool(...)` requires the registered tool object returned by `getTools()` as its first argument. Passing a string name or testing-tool-shaped object throws.
- `document.modelContext.executeTool(toolFromGetTools, inputArgsJson)` returns the JSON string produced by native execution.
- `navigator.modelContextTesting.executeTool(toolName, inputArgsJson)` still executes by name and returns a JSON string.
- Aborting the `AbortSignal` passed to `registerTool(tool, { signal })` removes the tool from both `getTools()` and `modelContextTesting.listTools()`.

Implication for this PR:

- Do not type or document `document.modelContext.listTools()`.
- Do not route producer execution through `document.modelContext.callTool(...)`.
- Keep `listTools()` and name-based `executeTool(...)` on `navigator.modelContextTesting`.
- Make polyfill `getTools()` async even if its internal registry is synchronous.
- Keep `@mcp-b/global` extension APIs (`listTools`, `callTool`, resources, prompts) separate from strict `@mcp-b/webmcp-types` / `@mcp-b/webmcp-polyfill` producer APIs.

## Required Fixes

1. Declare both global attributes as readonly:
   - `Document.modelContext`
   - `Navigator.modelContext`

2. Treat `document.modelContext` as canonical in tests, docs, and package metadata.

3. Keep explicit backwards compatibility tests for `navigator.modelContext`:
   - it returns the same polyfill instance as `document.modelContext`
   - it warns once on access
   - tools registered through one surface are visible through the other

4. Bridge older navigator-only native previews:
   - if `navigator.modelContext` exists and `document.modelContext` does not, define `document.modelContext` as a non-writable alias to the native navigator context
   - cleanup must remove only the alias the polyfill created and leave the native navigator descriptor intact

5. Match the current Chromium 150 preview producer surface:
   - `document.modelContext.getTools()` exists and returns a `Promise`
   - `document.modelContext.listTools()` does not exist
   - `document.modelContext.executeTool(registeredTool, inputArgsJson)` exists; the first argument must be an object returned by `getTools()`
   - `navigator.modelContextTesting.listTools()` remains the testing discovery API
   - `navigator.modelContextTesting.getTools()` does not exist

6. Keep tool descriptor types current with the WebMCP draft:
   - `ModelContextTool.title`
   - `ModelContextRegisterToolOptions.exposedTo`

## Unit Coverage

Add or keep tests for:

- `document.modelContext` strict core methods
- async `document.modelContext.getTools()` shape:
  - `name`
  - `title`
  - `description`
  - JSON-stringified `inputSchema`
  - `origin`
  - `window`
- `document.modelContext.executeTool(toolFromGetTools, inputArgsJson)`
- `navigator.modelContext` deprecated alias behavior
- descriptor shape:
  - `document.modelContext`: configurable, enumerable, non-writable value descriptor
  - `navigator.modelContext`: configurable, enumerable, getter-only accessor
- native detection matrix:
  - document-only native support
  - navigator-only native support
  - both document and navigator native support
- cleanup:
  - full polyfill install removes document and navigator descriptors on cleanup
  - legacy navigator-only alias cleanup removes only the document alias
  - forced `modelContextTesting` override restores the original descriptor

## Type Coverage

Add type-level tests for:

- `Document['modelContext']` equals `ModelContext`
- `Navigator['modelContext']` remains a deprecated alias typed as `ModelContext`
- `ModelContext['getTools']` returns `Promise<ModelContextToolInfo[]>`
- `ModelContext['executeTool']` accepts `ModelContextToolInfo` plus JSON-string input
- `ModelContextRegisterToolOptions` includes `exposedTo?: string[]`
- `ToolDescriptor` includes top-level `title?: string`
- assignment to either global fails:

```ts
// @ts-expect-error readonly Web IDL attribute
document.modelContext = {} as ModelContext;

// @ts-expect-error readonly Web IDL attribute
navigator.modelContext = {} as ModelContext;
```

## Browser / Native Coverage

Add a native Chromium M150 lane or targeted test that verifies:

- `document.modelContext` exists behind WebMCP flags
- `navigator.modelContext` exists during the transition
- both surfaces return the same native instance in the normal page case
- reading `navigator.modelContext` emits Chromium's native deprecation warning
- reading `document.modelContext` does not warn
- native producer discovery is `await document.modelContext.getTools()`, not `listTools()`
- native producer execution is `document.modelContext.executeTool(toolFromGetTools, inputArgsJson)`, not `callTool(...)`
- native testing discovery/execution remains `navigator.modelContextTesting.listTools()` and `executeTool(toolName, inputArgsJson)`

Add a browser test for document isolation when feasible:

- parent `document.modelContext` and `navigator.modelContext` share one instance
- child frame `document.modelContext` and `navigator.modelContext` share another instance
- parent and child instances are distinct
- tool registries do not leak between documents

## PR Split Guidance

If this grows too large, split it into two PRs:

1. Feature compatibility PR:
   - runtime document install
   - navigator alias
   - navigator-only native bridge
   - readonly type declarations
   - focused runtime and type tests

2. Cleanup migration PR:
   - move broad existing tests from navigator-first to document-first
   - update README examples and package metadata across dependent packages
   - add broader native/browser parity coverage

Do not merge the feature PR without the backwards compatibility and readonly tests. The cleanup PR can follow if the remaining work is mostly docs and large test rewrites.
