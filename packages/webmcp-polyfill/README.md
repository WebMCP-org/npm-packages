# @mcp-b/webmcp-polyfill

Strict WebMCP core runtime polyfill for `navigator.modelContext`.

This package installs only the core API:

- `provideContext(options?)`
- `registerTool(tool)`
- `unregisterTool(name)`
- `clearContext()`

It does not install MCP bridge extension methods like `callTool`, resources, or prompts.
For the full MCPB runtime (core + bridge extensions), use `@mcp-b/global`.

## Install

```bash
pnpm add @mcp-b/webmcp-polyfill
```

## Usage

```ts
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';

initializeWebMCPPolyfill();
```

## Options

```ts
initializeWebMCPPolyfill({
  forceOverride: false,
  installTestingShim: true,
});
```

- `forceOverride`: replace an existing `navigator.modelContext` if present.
- `installTestingShim`: install `navigator.modelContextTesting` parity helpers.

## Interop with `@mcp-b/global`

- Default behavior is non-destructive: if `navigator.modelContext` already exists, this package does nothing unless `forceOverride: true` is passed.
- When a page already has this core polyfill and later loads `@mcp-b/global`, global runs in attach-only mode (keeps the existing object identity and adds bridge/runtime features).
- Repeated injection of `@mcp-b/global` is idempotent (first initialization wins).

## Testing Shim

When `installTestingShim` is enabled (default), this package also installs a minimal
`navigator.modelContextTesting` surface for parity-style tests:

- `listTools()`
- `executeTool(toolName, inputArgsJson, options?)`
- `registerToolsChangedCallback(callback)`
- `getCrossDocumentScriptToolResult()`

## Cleanup

```ts
import { cleanupWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';

cleanupWebMCPPolyfill();
```
