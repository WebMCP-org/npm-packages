# Pure JSON Schema Inference + Validation Plan (Polyfill)

## Objective

Enable a pure JSON Schema developer experience for WebMCP polyfill registration APIs (for example `navigator.modelContext.registerTool`) with both:

1. Compile-time TypeScript inference for handler arguments.
2. Runtime validation of input/output payloads.

This plan uses `@mcp-b/global` as the current implementation baseline and targets a split into spec-focused polyfill and optional typing package while keeping Chromium/native parity in view.

## Package Boundary Decision (Confirmed)

The WebMCP polyfill in this plan is **purely spec-compliant** and must remain separate from adapter concerns.

Planned package boundaries:

1. `webmcp-polyfill` (runtime):
   - Implements only spec-aligned `navigator.modelContext` behavior.
   - No WebMCP-to-MCP adapter logic.
   - Zero runtime dependencies for JSON Schema MVP path.
2. `webmcp-types` (types/dev-only):
   - Provides richer TypeScript inference helpers for JSON Schema literals.
   - Can depend on type-level tooling (for example `json-schema-to-ts`) without affecting runtime footprint.
3. `mcp-b` adapter package:
   - Owns WebMCP-to-MCP bridging and transport adaptation logic.
   - Versioned and released independently from spec polyfill runtime.

## Dependency Policy and Updates

To support the boundary above, dependency policy should be explicit:

1. `webmcp-polyfill` runtime package:
   - Keep runtime JSON validation zero-dep for MVP subset.
   - Do not add adapter-focused dependencies.
   - Do not add heavy schema runtime engines in MVP.
2. `webmcp-types` package:
   - Add type-only inference dependency/dependencies here (if used).
   - Mark as dev/types-only consumption path.
3. Adapter package:
   - Keep existing adapter deps isolated from polyfill runtime.

Required repository updates:

1. Add new package(s) (`webmcp-polyfill`, `webmcp-types`) and wire into workspace configuration.
2. Move spec-facing runtime code/docs into `webmcp-polyfill`.
3. Move/define JSON Schema inference helper types in `webmcp-types`.
4. Update `package.json` dependency graphs so runtime polyfill does not pull adapter or type-inference deps.
5. Update docs and examples to show:
   - Spec-only usage path (runtime only).
   - Optional typed usage path (add `webmcp-types`).

### Planned Dependency Matrix

| Package | Runtime Deps | Dev/Type Deps | Must Not Depend On |
| --- | --- | --- | --- |
| `webmcp-polyfill` | none for JSON Schema MVP validator path | test/build tooling only | adapter package internals, heavy schema engines (MVP) |
| `webmcp-types` | none (types-only package) | type-level inference tooling as needed | runtime transport/adapter deps |
| `mcp-b` adapter | adapter/bridge stack as required | test/build tooling | direct reliance on polyfill-internal validator implementation details |

## Why This Is Needed

Today the runtime already accepts JSON Schema and validates it, but compile-time inference is effectively Zod-first.

- Runtime schema normalization and validation path already exists in `packages/global/src/validation.ts`.
- Tool args typing is currently inferred from Zod generics in `packages/global/src/types.ts`.

Result: JSON Schema users get runtime checks but usually lose strongly inferred handler arg types unless they add manual type annotations.

## Inputs To Use During Implementation

### Internal References (Current Baseline in Repo)

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

## Scope and Non-Goals

### In Scope

1. Spec-compliant WebMCP polyfill runtime surface (`navigator.modelContext`) in a dedicated runtime package.
2. Zero-dependency runtime validator for the defined JSON Schema MVP subset.
3. Compile-time JSON Schema inference helpers in a separate types package.
4. Explicit fail-fast behavior for unsupported schema keywords.
5. Conformance checks against Chromium/spec references for API shape and behavior.
6. Migration path from the current baseline implementation to split packages.

### Out of Scope (for MVP)

1. Full JSON Schema draft compatibility.
2. Complex composition/indirection keywords (`$ref`, `oneOf`, `anyOf`, `allOf`, etc.).
3. Automatic default value application during validation.
4. Adapter-specific features in the spec polyfill package.
5. Non-web runtimes (Node-first runtime adaptation) in the polyfill package.

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

## Planned JSON Schema Support Matrix (Zero-Dep MVP)

This matrix defines the initial zero-dependency support contract for tool/prompt argument schemas.

Support level definitions:

- `Full`: affects compile-time inference and runtime validation.
- `RuntimeOnly`: validated at runtime; does not change TypeScript type shape.
- `MetadataOnly`: accepted and preserved, but ignored for validation/inference.
- `Unsupported`: rejected at registration with a clear error.

### Core Keywords

| Keyword / Pattern | Compile-Time Inference | Runtime Validation | Support Level | Planned Behavior |
| --- | --- | --- | --- | --- |
| Root `type: "object"` | Yes | Yes | Full | Required for tool/prompt arg schema roots in MVP. |
| `properties` | Yes | Yes | Full | Defines object field map and nested schema tree. |
| `required` | Yes | Yes | Full | Required keys become non-optional in inferred type. |
| `additionalProperties: false` | Yes (closed object) | Yes | Full | Extra keys rejected. |
| `additionalProperties: true` | Yes (indexable extras) | Yes | Full | Extra keys accepted as `unknown` values. |
| `additionalProperties: { ...schema }` | No | No | Unsupported | Fail fast in MVP; reserved for later phase. |
| Property `type: "string"` | Yes (`string`) | Yes | Full | Standard primitive mapping. |
| Property `type: "number"` | Yes (`number`) | Yes | Full | Standard primitive mapping. |
| Property `type: "integer"` | Yes (`number`) | Yes | Full | Runtime enforces integer; TS remains `number`. |
| Property `type: "boolean"` | Yes (`boolean`) | Yes | Full | Standard primitive mapping. |
| Property `type: "null"` | Yes (`null`) | Yes | Full | Supports explicit null values. |
| `enum` | Yes (union of literals) | Yes | Full | Literal union inference when schema is `as const`. |
| `const` | Yes (single literal) | Yes | Full | Inferred as exact literal type. |
| `type: "array"` + `items: { ... }` | Yes (`T[]`) | Yes | Full | Single-schema items only in MVP. |
| Nested `type: "object"` | Yes | Yes | Full | Recursive object schema support. |
| `minLength` / `maxLength` | No | Yes | RuntimeOnly | Constraint check on strings only. |
| `pattern` | No | Yes | RuntimeOnly | Regex validation for strings. |
| `minimum` / `maximum` | No | Yes | RuntimeOnly | Numeric bound checks. |
| `exclusiveMinimum` / `exclusiveMaximum` | No | Yes | RuntimeOnly | Strict numeric bound checks. |
| `multipleOf` | No | Yes | RuntimeOnly | Numeric divisibility check. |
| `minItems` / `maxItems` | No | Yes | RuntimeOnly | Array length checks. |
| `uniqueItems` | No | Yes | RuntimeOnly | Deep-equality uniqueness check. |
| `minProperties` / `maxProperties` | No | Yes | RuntimeOnly | Object key-count checks. |
| `description` / `title` / `examples` | No | No | MetadataOnly | Preserved for docs/UI only. |
| `default` | No | No | MetadataOnly | Not auto-applied; informational only. |

### Unsupported Keywords (Fail-Fast in MVP)

| Keyword / Pattern | Compile-Time Inference | Runtime Validation | Support Level | Planned Behavior |
| --- | --- | --- | --- | --- |
| `$ref`, `$defs`, `definitions` | No | No | Unsupported | Reject registration with unsupported-keyword error. |
| `oneOf`, `anyOf`, `allOf`, `not` | No | No | Unsupported | Reject registration in MVP to avoid ambiguous semantics. |
| `if`, `then`, `else` | No | No | Unsupported | Reject registration in MVP. |
| `dependentRequired`, `dependentSchemas` | No | No | Unsupported | Reject registration in MVP. |
| `patternProperties` | No | No | Unsupported | Reject registration in MVP. |
| `propertyNames` | No | No | Unsupported | Reject registration in MVP. |
| `unevaluatedProperties`, `unevaluatedItems` | No | No | Unsupported | Reject registration in MVP. |
| `prefixItems`, `additionalItems` | No | No | Unsupported | Reject registration in MVP (tuple arrays deferred). |
| `contains`, `minContains`, `maxContains` | No | No | Unsupported | Reject registration in MVP. |
| `format` (strict semantic validation) | No | No | Unsupported | Treated as unsupported in MVP; can be added later via explicit format module. |
| `type` as array union (for example `["string","null"]`) | No | No | Unsupported | Reject in MVP; prefer `enum` or later union support phase. |

### Registration Error Contract for Unsupported Keywords

When unsupported keywords are present, registration should fail immediately with deterministic errors:

1. Include tool/prompt name and keyword path.
2. Include a short remediation hint.
3. Never silently ignore unsupported structural keywords.

Example error shape:

```txt
[Web Model Context] Unsupported JSON Schema keyword "oneOf" at "#/properties/input/oneOf" for tool "my_tool".
Supported MVP subset is documented in docs/PURE_JSON_SCHEMA_TYPE_INFERENCE_PLAN.md.
```

## Proposed Architecture

### 1) Type Inference Layer (Compile-Time)

Adopt a type-level JSON Schema mapper for literal schemas in the **types package** (for example `json-schema-to-ts` using `FromSchema`, or an in-house equivalent).

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

Implementation approach for this plan:

1. Implement a zero-dependency validator/compiler for the MVP subset defined in the support matrix.
2. Keep any existing compatibility path (for example Zod input objects during transition) behind normalization boundaries.
3. Route validation through a single `normalizeSchema` + validator interface.

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

1. Add type-inference dependency/dependencies only to `webmcp-types` (not runtime polyfill).
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

1. Implement zero-dependency MVP subset validator/compiler and cache strategy.
2. Run side-by-side tests against current behavior.
3. Gate rollout behind internal feature flag if needed.

Deliverable:

- JSON Schema-native runtime validation with no inference regressions.

### Phase 4: Docs + Migration + Parity Matrix

1. Update package READMEs for split architecture (`webmcp-polyfill`, `webmcp-types`, and adapter docs).
2. Add migration section for teams moving from Zod-first registration.
3. Add native-vs-polyfill parity matrix updates.

Deliverable:

- Public-facing guidance and compatibility guarantees.

## Phase Exit Criteria and Artifacts

| Phase | Exit Criteria | Required Artifact(s) |
| --- | --- | --- |
| 0 - Spec + Source Recon | Spec/native parity assumptions documented and reviewed | `docs/webmcp-parity-notes.md` (or equivalent) |
| 1 - Type Inference | Literal schemas infer correctly; widened schemas degrade safely | Type test suite output + updated `webmcp-types` API docs |
| 2 - Validator Abstraction | Runtime calls routed through unified validation interface | Refactor PR with no behavior regression in existing tests |
| 3 - Zero-Dep Runtime Engine | MVP subset fully enforced; unsupported keywords fail fast | Validator compiler tests + perf benchmark report |
| 4 - Docs + Migration | Consumers can migrate with documented steps and examples | Updated READMEs, migration guide, changelog entries |

### Pull Request Requirements Per Phase

1. Each phase PR must include a checklist mapping changed files to this plan section.
2. Each phase PR must include test evidence scoped to that phase.
3. Any deliberate deviation from this plan must be documented in the PR description and linked back to an updated plan section.

## Implementation Blueprint (Detailed)

### Proposed Package and Directory Layout

```txt
packages/
  webmcp-polyfill/
    src/
      index.ts
      model-context.ts
      schema/
        types.ts
        keyword-support.ts
        compile.ts
        validate.ts
        cache.ts
        errors.ts
      testing/
        model-context-testing.ts
    README.md
    package.json
  webmcp-types/
    src/
      index.ts
      schema-types.ts
      infer.ts
      define-json-schema.ts
    README.md
    package.json
  mcp-b-... (adapter packages)
```

### Dependency Direction (Must Stay Acyclic)

1. `webmcp-types` -> type-level libs only (if any).
2. `webmcp-polyfill` -> no dependency on adapter package internals.
3. Adapter package -> may depend on public APIs from polyfill/types, but not on polyfill internals.

### Runtime API Contract (Polyfill Package)

| API | Validation Behavior | Type Behavior | Failure Behavior |
| --- | --- | --- | --- |
| `provideContext({ tools })` | Validate each tool schema at registration time | N/A at runtime | Throws on unsupported schema keyword |
| `registerTool(tool)` | Compiles validator for `inputSchema` and optional `outputSchema` once | N/A at runtime | Throws deterministic schema error |
| `callTool({ name, arguments })` | Validates input before execute and output after execute (if output schema exists) | N/A at runtime | Returns tool error payload with validation details |
| `listTools()` | Returns normalized schema representation | N/A | No inference side-effects |
| `registerPrompt(prompt)` | Same schema compile/validate policy for prompt args | N/A | Throws deterministic schema error |
| `getPrompt(name, args)` | Validates args against compiled prompt schema | N/A | Returns validation error |

### Type API Contract (Types Package)

| Export | Purpose | Notes |
| --- | --- | --- |
| `JsonSchemaMvp` | Narrow schema type representing supported MVP subset | Prevents unsupported keywords at compile time where possible |
| `InferJsonSchema<TSchema>` | Infers TS type from JSON schema literal | Literal schemas only |
| `InferToolArgs<TSchema>` | Convenience alias for tool `execute(args)` typing | Falls back to `Record<string, unknown>` on widened schemas |
| `defineJsonSchema<T>()` | Literal-preserving helper for schema authoring | No runtime effect |
| `defineTool<TSchema>()` (optional) | Helper to couple schema + handler type inference | Optional ergonomics utility |

### Type Inference Semantics (Normative for MVP)

1. Root schema for tool/prompt args must be `type: "object"`.
2. `required` controls optionality; missing/invalid `required` entries are compile-time ignored and runtime rejected at registration.
3. `integer` maps to `number` in TypeScript and integer checks at runtime.
4. `enum` and `const` require literal schemas (`as const`) for narrow unions.
5. `additionalProperties` behavior:
   - `false` => closed object type + runtime rejection of unknown keys.
   - `true` => open object type with `Record<string, unknown>` extras.
6. Non-literal/dynamic schemas always degrade to `Record<string, unknown>` in handler args.

### Runtime Validator Compiler Design

#### Compilation Pipeline

1. Preflight scan of schema tree.
2. Reject unsupported keywords with exact JSON pointer path.
3. Normalize shape (for example coerce missing `required` to empty set).
4. Emit validator function tree (object/array/scalar validators).
5. Store compiled validator and metadata in cache.

#### Validation Execution Pipeline

1. Lookup compiled validator from cache using schema identity/hash.
2. Execute validator against input.
3. On success, call handler.
4. If output schema exists, validate handler output.
5. Return success or structured validation error.

#### Cache Strategy

1. Primary key: object identity via `WeakMap` when schema object instance is stable.
2. Secondary key: deterministic stable hash string for equivalent but non-identical objects.
3. Cache value: `{ validator, schemaHash, compiledAt, keywordSummary }`.
4. Cache invalidation: process-lifetime for MVP (no mutation support).

### Runtime Limits and Safeguards

| Safeguard | Planned Value | Reason |
| --- | --- | --- |
| Max schema depth | 25 | Prevent pathological recursion/stack usage |
| Max properties per object schema | 1000 | Guard against memory abuse |
| Max enum size | 500 | Bound compile and comparison cost |
| Max pattern length | 4096 chars | Prevent expensive regex payloads |
| Max error count per validation | 50 | Keep errors useful and bounded |

If any limit is exceeded, registration fails with a deterministic schema-limit error.

### Error Model (Structured + Deterministic)

| Code | When Raised | Required Fields |
| --- | --- | --- |
| `WMCP_SCHEMA_UNSUPPORTED_KEYWORD` | Unsupported keyword found during preflight | `toolOrPromptName`, `keyword`, `path` |
| `WMCP_SCHEMA_INVALID_STRUCTURE` | Schema malformed for MVP rules | `toolOrPromptName`, `path`, `reason` |
| `WMCP_SCHEMA_LIMIT_EXCEEDED` | Schema exceeds runtime safety bounds | `toolOrPromptName`, `limitName`, `limitValue`, `actualValue` |
| `WMCP_INPUT_VALIDATION_FAILED` | Tool/prompt args fail runtime validation | `toolOrPromptName`, `issues[]` |
| `WMCP_OUTPUT_VALIDATION_FAILED` | Tool output fails declared output schema | `toolName`, `issues[]` |

Error messages must include:

1. Stable error code.
2. Human-readable one-line summary.
3. JSON pointer path when applicable.
4. Link or pointer to this support matrix section.

### Conformance/Compatibility Matrix (Runtime Methods)

| Surface | Polyfill Target | Native Chromium Parity Goal |
| --- | --- | --- |
| `navigator.modelContext` shape | Match current spec shape | No breaking signature divergence |
| `registerTool` lifecycle | Deterministic compile + register | Compatible semantics for registration outcomes |
| `toolschanged` event timing | Microtask-batched where appropriate | Match documented behavior as closely as possible |
| `callTool` request/response | MCP-style object form | Compatible result/error shape expectations |
| `modelContextTesting` handling | Compatibility/deprecation behavior maintained | Do not regress native detection/interop |

## Migration Blueprint (Current Baseline -> Split Packages)

### Step 1: Package Scaffolding

1. Create `packages/webmcp-polyfill`.
2. Create `packages/webmcp-types`.
3. Wire both into workspace configuration and CI jobs.

### Step 2: Runtime Extraction

1. Move spec-facing runtime files from baseline package into `webmcp-polyfill`.
2. Keep adapter-oriented code in adapter package(s).
3. Preserve behavior with parity tests during extraction.

### Step 3: Types Extraction

1. Move JSON-schema inference helpers and type-level utilities into `webmcp-types`.
2. Re-export optional helper types from runtime package only if needed for DX, without creating runtime dep coupling.

### Step 4: Validation Engine Transition

1. Add zero-dep validator compiler path.
2. Keep transitional path (if any) behind explicit compatibility layer.
3. Flip default to zero-dep path after test and perf gates pass.

### Step 5: Consumer Migration Support

1. Publish migration guide mapping old imports to new package imports.
2. Provide codemod or copy-paste migration snippets for common patterns.
3. Publish deprecation timeline for any legacy mixed-surface package.

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

### Comprehensive Test Matrix

| Category | Scenario | Expected Outcome |
| --- | --- | --- |
| Type Inference | `required` + optional property mix | Correct optionality in handler args |
| Type Inference | `enum`/`const` literals with `as const` | Narrow unions inferred correctly |
| Type Inference | Widened schema object without literals | Fallback to `Record<string, unknown>` |
| Runtime Validation | Extra key with `additionalProperties: false` | Input rejected with deterministic error |
| Runtime Validation | Unsupported keyword (`oneOf`) in schema | Registration fails immediately |
| Runtime Validation | Valid nested object + array payload | Input accepted |
| Runtime Validation | Output schema mismatch | Output validation failure surfaced |
| Performance | Repeated calls with same schema | No recompilation after first compile |
| Conformance | `registerTool` + `listTools` parity | Behavior compatible with expected surface |
| Compatibility | Native API detected + shim path | No regression in native/consumer interop |

## Performance Budgets and Gates

### Proposed Budgets (MVP Targets)

1. Registration compile time (typical tool schema): p95 <= 2ms.
2. Validation overhead per call (typical payload): p95 <= 0.2ms.
3. Memory per compiled schema (typical): <= 4KB.
4. No regression to existing beforeunload/request-tracking expectations documented in:
   - `docs/TESTING_GUIDE.md`
   - `docs/BEFOREUNLOAD_ANALYSIS.md`

### Perf Gate for Merge

1. Benchmark suite must run in CI for representative schemas.
2. PR must include before/after benchmark summary when touching validator compiler.
3. Any budget breach requires explicit waiver note in PR with remediation plan.

## Security and Robustness Considerations

1. Reject or safely bound potentially expensive regex patterns.
2. Protect against prototype pollution by validating only own enumerable properties.
3. Avoid executing user-provided code paths during schema compile.
4. Cap recursion depth and issue count to prevent denial-of-service style payloads.
5. Ensure error payloads do not leak sensitive runtime internals.

## Release, Rollout, and Rollback Plan

### Release Stages

1. `alpha`: package split and type inference path available behind explicit opt-in docs.
2. `beta`: zero-dep validator enabled by default in polyfill with compatibility fallback available.
3. `stable`: fallback removed or retained only if justified by compatibility metrics.

### Rollout Gates

1. All type/runtime/e2e/perf gates pass.
2. Conformance/parity checklist is complete.
3. Migration docs and examples are published.

### Rollback Strategy

1. Keep previous stable package tags and migration notes available.
2. If severe regression occurs, patch-release to temporarily re-enable compatibility path.
3. Maintain schema-error compatibility contract to avoid breaking downstream error handling.

## Documentation and Communication Deliverables

1. `webmcp-polyfill` README:
   - Spec surface, supported schema subset, runtime behavior, error codes.
2. `webmcp-types` README:
   - Inference helpers, literal schema guidance, fallback behavior.
3. Adapter docs:
   - Clear separation from spec polyfill package.
4. Migration guide:
   - Old import -> new import mapping and examples.
5. Changelog entries:
   - Package split rationale and compatibility notes.

## Risks and Mitigations

1. Risk: Type inference for complex JSON Schema features can degrade to `never/unknown`.
   Mitigation: clearly document supported inference subset and provide fallback typing escape hatches.
2. Risk: Custom zero-dep validator may diverge from full JSON Schema semantics on edge cases.
   Mitigation: enforce fail-fast unsupported-keyword policy and add conformance tests for supported subset.
3. Risk: Compile-time performance of heavy type-level inference.
   Mitigation: keep helper utilities narrow, avoid over-generic public signatures, add TS compile benchmarks.
4. Risk: Package split introduces migration friction.
   Mitigation: ship migration guide + codemod snippets and preserve a compatibility window.
5. Risk: Native Chromium behavior changes over time.
   Mitigation: periodically refresh parity tests against links in `WEBMCP-CONFORMANCE-REFERENCES.md`.

## Execution Checklist

1. Package split scaffold merged.
2. JSON Schema MVP support matrix implemented and enforced.
3. Type inference helpers published in types package.
4. Zero-dep validator compiler merged with cache and limits.
5. Error code contract implemented and documented.
6. Conformance and perf gates green in CI.
7. Migration docs and examples published.
8. Beta rollout completed with no high-severity regressions.

## Definition of Done

1. JSON Schema literal registration infers handler args in TypeScript.
2. Runtime input/output validation works without requiring Zod schemas.
3. Any transitional Zod compatibility path (if retained) is explicitly documented and tested.
4. Chromium/native behavior remains compatible or deltas are documented.
5. Performance and memory remain within existing practical expectations.

## Open Decisions

1. Should we ship a plugin hook for optional full-schema validator engines in non-MVP phases?
2. Should output schema inference be surfaced in helper utilities, or kept internal?
3. Do we codify a supported JSON Schema dialect/version subset for inference?
