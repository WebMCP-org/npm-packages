# Pure JSON Schema Inference + Validation Plan (Polyfill)

## Objective

Enable a pure JSON Schema developer experience for WebMCP polyfill registration APIs (for example `navigator.modelContext.registerTool`) with both:

1. Compile-time TypeScript inference for handler arguments.
2. Runtime validation of input/output payloads.

This plan is scoped to `@mcp-b/global` and keeps Chromium/native parity in view.

## Why This Is Needed

Today the runtime already accepts JSON Schema and validates it, but compile-time inference is effectively Zod-first.

- Runtime schema normalization and validation path already exists in `packages/global/src/validation.ts`.
- Tool args typing is currently inferred from Zod generics in `packages/global/src/types.ts`.

Result: JSON Schema users get runtime checks but usually lose strongly inferred handler arg types unless they add manual type annotations.

## Inputs To Use During Implementation

### Internal References

- Current API and typing surface: `packages/global/src/types.ts`
- Current validation path: `packages/global/src/validation.ts`
- Native adapter behavior and parity context: `packages/global/src/native-adapter.ts`
- Chromium/spec/source pointers: `packages/global/WEBMCP-CONFORMANCE-REFERENCES.md`
- Existing perf expectations baseline: `docs/TESTING_GUIDE.md` and `docs/BEFOREUNLOAD_ANALYSIS.md`

### External References (via conformance index)

Use the links listed in `packages/global/WEBMCP-CONFORMANCE-REFERENCES.md`, especially:

- WebMCP spec/explainer
- Chromium source module pointers (`model_context`)
- Chrome status / blink-dev threads

## Design Principles

1. Separate concerns:
   - Compile-time inference is a type-level concern.
   - Runtime validation is an execution concern.
2. Keep polyfill API ergonomic for plain object literals.
3. Preserve backward compatibility for current Zod users.
4. Prefer deterministic, cacheable runtime validation.
5. Keep native Chromium behavior aligned at protocol boundaries (tool registration/call semantics).

## Target Developer Experience

### JSON Schema Literal Registration (Typed)

```ts
const inputSchema = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    limit: { type: 'integer', minimum: 1, maximum: 50 },
  },
  required: ['query'],
  additionalProperties: false,
} as const;

navigator.modelContext.registerTool({
  name: 'search',
  description: 'Search docs',
  inputSchema,
  execute: async (args) => {
    // args.query: string
    // args.limit?: number
    return { content: [{ type: 'text', text: args.query }] };
  },
});
```

### Runtime/Unknown Schema Registration (Safely Untyped)

If schema is loaded dynamically at runtime (network/file/user config), handler args should remain `Record<string, unknown>` unless the caller explicitly supplies a type.

## Proposed Architecture

### 1) Type Inference Layer (Compile-Time)

Adopt a type-level JSON Schema mapper (`json-schema-to-ts`, using `FromSchema`) for literal schemas.

Plan:

1. Introduce internal schema type aliases for inference:
   - `JsonSchemaForInference` (narrowed JSON schema object shape)
   - `InferArgsFromSchema<TSchema>` (conditional type)
2. Add overloads/generics for `ToolDescriptor` and `registerTool`:
   - Zod path remains intact.
   - JSON Schema literal path infers args from `FromSchema<TSchema>`.
3. Mirror the same strategy for `PromptDescriptor`/`registerPrompt` args.
4. Keep fallback behavior:
   - Non-literal or broad schema type resolves to `Record<string, unknown>`.

### Helper Utility (Optional but Recommended)

Add a no-op helper to preserve schema literals cleanly:

```ts
const schema = defineJsonSchema({
  type: 'object',
  properties: { ... },
  required: [...],
} as const);
```

This reduces accidental widening and keeps inference reliable.

### 2) Runtime Validation Layer

Move to an explicit validator abstraction so runtime engine can evolve independently of typing.

Interface sketch:

```ts
interface SchemaValidator {
  validateInput(schema: InputSchema, data: unknown): ValidationResult;
  validateOutput(schema: InputSchema, data: unknown): ValidationResult;
}
```

Implementation options:

1. Keep current JSON Schema -> Zod conversion path for v1.
2. Introduce AJV-backed validator for a pure JSON Schema runtime (recommended target).

Recommended direction:

- Implement AJV validator for JSON Schema runtime validation.
- Keep Zod compatibility path for users who pass Zod schema objects.
- Route both through a single `normalizeSchema` + validator interface.

### 3) Validation Performance Strategy

Add compiled-validator caching to avoid per-call recompilation.

Plan:

1. Compile JSON Schema validator once at registration time.
2. Cache by schema identity/hash.
3. Validate per-call with precompiled function.

Baseline perf constraints should not regress compared to current transport/per-request expectations documented in:

- `docs/TESTING_GUIDE.md`
- `docs/BEFOREUNLOAD_ANALYSIS.md`

Additional acceptance targets for schema validation path:

1. Registration-time compile overhead is one-time and bounded.
2. Tool call validation remains O(1) per call after compile.
3. Memory overhead scales with number of unique schemas, not number of calls.

### 4) Chromium / Native Parity Checkpoints

Before finalizing behavior, verify parity against references in `packages/global/WEBMCP-CONFORMANCE-REFERENCES.md`.

Focus checks:

1. `navigator.modelContext.registerTool` payload shape compatibility.
2. `listTools()` schema serialization shape compatibility.
3. Call validation and error surface parity (or documented deltas).
4. `modelContextTesting` compatibility/deprecation behavior untouched.

## Phased Implementation Plan

### Phase 0: Spec + Source Recon

1. Review WebMCP spec sections for tools/prompts/input schemas.
2. Review Chromium model_context source pointers for behavior details.
3. Document any incompatible assumptions before coding.

Deliverable:

- Short parity notes doc linked from this plan.

### Phase 1: Type-Only JSON Schema Inference

1. Add `json-schema-to-ts` as direct dependency where needed.
2. Extend tool/prompt type definitions with inference overloads.
3. Add type tests (`expectType`/`tsd` style) for:
   - required vs optional fields
   - arrays/unions/enums/literals
   - `additionalProperties` behavior
   - fallback to unknown for widened schemas

Deliverable:

- Typed JSON Schema handlers without runtime engine changes.

### Phase 2: Runtime Validator Abstraction

1. Introduce validator interface and adapters.
2. Migrate existing validation calls to abstraction.
3. Preserve existing error message shape where practical.

Deliverable:

- Runtime validation path decoupled from static typing path.

### Phase 3: Pure JSON Schema Runtime Engine

1. Add AJV validator backend and cache strategy.
2. Run side-by-side tests against current behavior.
3. Gate rollout behind internal feature flag if needed.

Deliverable:

- JSON Schema-native runtime validation with no inference regressions.

### Phase 4: Docs + Migration + Parity Matrix

1. Update `packages/global/README.md` examples for JSON Schema typed usage.
2. Add migration section for teams moving from Zod-first registration.
3. Add native-vs-polyfill parity matrix updates.

Deliverable:

- Public-facing guidance and compatibility guarantees.

## Test Plan

### Type Tests

1. Tool arg inference for literal JSON schemas.
2. Prompt arg inference parity.
3. Intentional fallback behavior for runtime schemas.

### Runtime Unit Tests

1. Input/output validation pass/fail cases.
2. Error formatting consistency.
3. Cache hit/miss behavior and duplicate schema handling.

### Integration/E2E

1. Existing polyfill tests must stay green.
2. Add JSON Schema-only e2e app scenario.
3. Run Chromium-native compatibility tests (`e2e/tests/chromium-native-api.spec.ts`).

### Performance Checks

1. Measure registration-time compile cost.
2. Measure per-call validation overhead.
3. Ensure no meaningful regression in current expected behavior documented in:
   - `docs/TESTING_GUIDE.md`
   - `docs/BEFOREUNLOAD_ANALYSIS.md`

## Risks and Mitigations

1. Risk: Type inference for complex JSON Schema features can degrade to `never/unknown`.
   Mitigation: clearly document supported inference subset and provide fallback typing escape hatches.
2. Risk: Runtime validator semantic differences (AJV vs current path) may break edge cases.
   Mitigation: run dual-engine comparison tests on representative schema corpus.
3. Risk: Compile-time performance of heavy type-level inference.
   Mitigation: keep helper utilities narrow, avoid over-generic public signatures, add TS compile benchmarks.

## Definition of Done

1. JSON Schema literal registration infers handler args in TypeScript.
2. Runtime input/output validation works without requiring Zod schemas.
3. Existing Zod-based APIs remain supported and tested.
4. Chromium/native behavior remains compatible or deltas are documented.
5. Performance and memory remain within existing practical expectations.

## Open Decisions

1. Should AJV become default immediately, or start behind a feature flag?
2. Should output schema inference be surfaced in helper utilities, or kept internal?
3. Do we codify a supported JSON Schema dialect/version subset for inference?
