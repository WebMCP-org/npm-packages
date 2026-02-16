# Handoff Context For Next AI

## User intent (latest and strongest)
- User wants to **rebuild `@mcp-b/global` from scratch** because current code is too heavy.
- User wants `@mcp-b/global` to be a **thin MCP-first adapter**.
- User explicitly said:
  - Do **not** keep lots of custom validation/registration/execution logic in global.
  - MCP server class already handles much of this; global should mainly morph API shape and sync state.
  - Keep core `@mcp-b/webmcp-polyfill` strict; global handles adapter behavior.

## Desired architecture (from user messages)
- `@mcp-b/global` owns MCP runtime behavior for tools/resources/prompts.
- Core `navigator.modelContext` remains strict WebMCP base.
- Global should wrap core tool mutators:
  - `provideContext`
  - `registerTool`
  - `unregisterTool`
  - `clearContext`
- Global should mirror tool registrations into native/strict WebMCP so browser-native agents still see tools.
- Runtime should not depend on global-specific testing extensions.
- Remove heavy global testing layer and extension helpers.

## What was already changed (partial, currently inconsistent)
- File edited heavily: `packages/global/src/global.ts`.
- Removed large chunks related to custom `WebModelContextTesting` plumbing.
- Switched initialization/cleanup toward:
  - `initializeWebMCPPolyfill(...)`
  - `cleanupWebMCPPolyfill()`
  - method attach/detach wrappers on `navigator.modelContext`
- Started moving tool MCP path toward SDK delegation.
- Work is **incomplete** and currently has TypeScript errors.

## Current compile status
Running:
- `pnpm -C packages/global exec tsc --noEmit`

Current errors include:
- Unused imports in `packages/global/src/global.ts`:
  - `CallToolRequestSchema`
  - `ListToolsRequestSchema`
- Type mismatch calling `coreToolMutators.registerTool(...)` due overload/inputSchema optional typing.
- Incorrect use of `this.tabServer.registerTool(...)` (method not on typed `Server` alias currently used in this file).
- Implicit `any` parameter in the attempted callback.

## Files currently modified (relevant)
- `packages/global/src/global.ts` (modified twice, not clean)
- `packages/global/src/types.ts` (already modified before this handoff)
- `packages/global/src/testing.ts` (still present; user wants this removed or minimized)
- `packages/global/src/global.test.ts` (already modified before this handoff)

## Suggested reset strategy for next AI
1. Replace `packages/global/src/global.ts` with a fresh minimal implementation.
2. Decide one clear server abstraction:
   - If using `BrowserMcpServer` methods like `registerTool`, ensure type import/alias matches that class, not a plain `Server` transport type.
3. Implement only minimal adapter responsibilities:
   - Wrap core mutators.
   - Maintain minimal registry for API projection.
   - Keep mirrored registration into strict core.
4. Remove global testing extensions surface (`./testing`) if aligning to user request.
5. Update tests/docs only after runtime compiles.

## Important note
- User said they may delete everything and wants clean context for the next AI.
- This file is intended to preserve intent and avoid repeating failed incremental patching.
