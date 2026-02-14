# WebMCP Alignment Matrix (Spec + Native/Polyfill Parity)

> **Status:** Active (ongoing tracking)
> **Chrome API:** WebMCP available behind flag in Chrome 146+
> **Last reviewed:** 2026-02-14

## Scope

This matrix separates:

1. Public WebMCP surface: `navigator.modelContext` behavior that should match the WebMCP draft/Chrome behavior.
2. MCPB bridge/extensions: non-standard helpers used to translate WebMCP to MCP. These may differ, but must not break parity between native and polyfill runtimes.

## Issue Matrix

| ID | Area | Current (Polyfill path) | Current (Native path) | Gap Type | Priority | Target |
| --- | --- | --- | --- | --- | --- | --- |
| WMC-01 | `provideContext()` semantics | Clears only Bucket A and keeps dynamic tools (`packages/global/src/global.ts:620`, `packages/global/src/global.ts:849`) | Delegates to native, but bridge assumes dynamic lifecycle via adapter wrappers (`packages/global/src/native-adapter.ts:610`) | Spec mismatch + parity risk | P0 | `provideContext()` must clear existing context consistently for tool set exposed to WebMCP consumers. |
| WMC-02 | `registerTool()` return value | Returns `{ unregister }` (`packages/global/src/global.ts:876`) | Adapter returns native result (`packages/global/src/native-adapter.ts:630`) and consumers rely on handle | Spec mismatch + future native risk | P0 | Public `registerTool()` should behave like spec (no handle); internal unregister convenience must move to MCPB-only helper. |
| WMC-03 | Duplicate registration behavior | Rapid duplicate registration may be ignored (`packages/global/src/global.ts:804`) | Native passthrough may throw or differ | Spec mismatch + polyfill/native divergence | P0 | Duplicate tool names should deterministically throw in both modes. |
| WMC-04 | `inputSchema` requiredness | `ToolDescriptor.inputSchema` required (`packages/global/src/types.ts:465`) | Same type contract through adapter | Type/API mismatch | P1 | `inputSchema` optional for WebMCP-facing API, default `{ type: 'object', properties: {} }`. |
| WMC-05 | Invalid schema handling | JSON schema conversion falls back permissively instead of hard-failing (`packages/global/src/validation.ts:52`, `packages/global/src/validation.ts:62`) | Depends on native validation | Spec mismatch + parity risk | P0 | Invalid `inputSchema` must throw during registration in both modes. |
| WMC-06 | Tool execute context shape | Uses `ToolExecutionContext.elicitInput(...)` (`packages/global/src/types.ts:498`, `packages/global/src/global.ts:1572`) | Same bridge contract | Spec mismatch | P0 | Expose `ModelContextClient.requestUserInteraction(callback)` contract; keep MCPB helpers internal. |
| WMC-07 | Native detection dependency | Initialization throws if native has `modelContext` but no `modelContextTesting` (`packages/global/src/global.ts:1910`) | Hard dependency in detection (`packages/global/src/native-adapter.ts:60`) | Forward-compat risk | P0 | Support native `modelContext` without requiring `modelContextTesting`; use testing API only when present. |
| WMC-08 | React hook cleanup contract | `useWebMCP` relies on `registration.unregister()` (`packages/react-webmcp/src/useWebMCP.ts:495`) | Same expectation when native path returns handle | Internal coupling to non-spec behavior | P0 | Hook cleanup should use spec-safe unregister strategy (e.g., `unregisterTool(name)` ownership-safe logic). |
| WMC-09 | Error typing/shape consistency | Mix of `Error` and custom `UnknownError` paths | Native path wraps execution failures into text `isError` response (`packages/global/src/native-adapter.ts:647`) | Parity inconsistency | P1 | Normalize throw/return behavior for invalid name, invalid schema, missing tool, and execution failures across both modes. |
| WMC-10 | Non-spec methods on `modelContext` | Includes `callTool`, resources/prompts, events beyond draft (`packages/global/src/types.ts:936`) | Installs shims/stubs on native context (`packages/global/src/native-adapter.ts:229`) | Extension boundary blur | P1 | Keep extensions available but isolate from strict WebMCP core behavior and test independently. |
| WMC-11 | Tool annotations shape | Accepts broader MCP annotations (`readOnlyHint`, `idempotentHint`, `destructiveHint`, etc.) | Same through bridge | Extension (low risk) | P2 | Treat extra annotations as MCPB extension; do not block WebMCP core conformance. |
| WMC-12 | Native/polyfill conformance harness | Tests exist but not unified as one normative matrix suite | Same | Test coverage gap | P0 | Add shared conformance suite executed against both polyfill and native-mock adapters. |

## Fix Plan

### Phase 1 (P0) - Lock public WebMCP core behavior

1. Define a strict core contract for public `navigator.modelContext` methods:
   - `provideContext(optional options = {})`
   - `clearContext()`
   - `registerTool(tool)`
   - `unregisterTool(name)`
2. Remove/disable rapid duplicate suppression for public registration path.
3. Make `inputSchema` optional at WebMCP boundary and default it.
4. Enforce schema validation at registration time; throw on invalid schema.
5. Implement `ModelContextClient.requestUserInteraction(callback)` in tool execution context and migrate tool callback signatures.

### Phase 2 (P0) - Restore native/polyfill parity

1. Refactor initialization so native `modelContext` can be used even when `modelContextTesting` is absent.
2. Make shared tool-registry behavior deterministic across both modes (duplicate handling, unregister semantics, clear behavior).
3. Update `useWebMCP` registration lifecycle to not rely on non-spec return handles.

### Phase 3 (P1) - Separate extensions from strict core

1. Keep MCPB conveniences (`callTool`, resource/prompt helpers, extra annotations) but treat them as extension surface.
2. Gate extension behavior behind explicit internal typing/docs so strict core tests stay spec-focused.
3. Normalize error taxonomy across modes for developer-facing consistency.

### Phase 4 (P0/P1) - Conformance tests and rollout

1. Add a shared conformance matrix test suite with two runners:
   - Runner A: pure polyfill runtime.
   - Runner B: native-adapter runtime using native mock.
2. Convert current expectation tests that codify non-spec behavior (e.g., dynamic tool persistence across `provideContext`) into extension tests.
3. Add migration notes for consumers impacted by `registerTool`/cleanup behavior.

## Acceptance Criteria

1. Same input sequence yields same outcome in native and polyfill modes for WebMCP core methods.
2. Public behavior matches the draft API semantics for method signatures and tool registration lifecycle.
3. MCPB-specific functionality remains available without contaminating strict core conformance tests.
