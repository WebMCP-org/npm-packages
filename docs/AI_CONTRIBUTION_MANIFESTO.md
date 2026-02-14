# AI Contribution Manifesto

This document defines the engineering quality bar for AI-assisted and human-authored changes in this npm package monorepo.

AI-generated code is cheap to produce and expensive to maintain. Ship only changes that improve the long-term shape of the system.

## 0) Design Priorities (In Order)

1. Safety and spec correctness
2. Performance and predictability
3. Developer experience and velocity

If goals conflict, the higher-priority goal wins unless a reviewer explicitly accepts the tradeoff.

## 1) Default Mindset

Before writing code, assume:

- The next engineer will read only touched files and the PR summary.
- The next AI agent will copy your pattern exactly.
- Every duplicated constant/type/validator will fork behavior later.
- "Works locally" is insufficient without bounded behavior and validation evidence.

Rule: if a change increases future cognitive load without clear payoff, it is incomplete.

## 2) Safety Rules (Non-Negotiable)

### 2.1 Single source of truth (SSOT)

- `packages/webmcp-types/` is canonical for strict WebMCP core type contracts.
- `packages/webmcp-polyfill/` is canonical for strict runtime semantics of WebMCP behavior.
- `packages/global/` may add MCP-B integration features, but must not weaken strict core behavior.
- Transport message and lifecycle behavior must stay centralized in `packages/transports/`; do not clone protocol shapes in consumers.
- Shared vocabulary (tool metadata keys, event names, capability flags, error semantics) must be centralized and imported, not duplicated.

### 2.2 Boundaries validate data

Treat all boundary input as untrusted:

- `postMessage` payloads
- extension/runtime messages
- JSON-RPC envelopes
- tool arguments and serialized testing inputs
- external SDK or client payloads

Validate at boundary entry, then narrow types for internal logic.

Do not bypass validation with assertion chains (`as any`, `as unknown as`, blind casts).

### 2.3 Contracts stay synchronized

- If exported types or runtime behavior change in one package, update all dependent package boundaries in the same change.
- If `navigator.modelContext` or testing helper behavior changes, update type surfaces, docs, and conformance tests together.
- If shared definitions cross package boundaries, move them into the canonical package rather than cloning.

### 2.4 Bounded behavior over implicit behavior

- Put explicit limits on retries, timeouts, queue growth, payload size, and listener fan-out where practical.
- Prefer explicit options over hidden library defaults when defaults impact safety or correctness.
- Test valid inputs, invalid inputs, and boundary transitions.

### 2.5 Breaking changes require explicit approval

- Do not introduce breaking public API behavior without explicit maintainer approval in task/PR context.
- Any approved breaking change must include a changeset with clear migration notes.

## 3) Performance Rules

Performance is a design concern, not a late patch.

- Think in bottlenecks first: serialization, cross-context messaging, network, and DOM/runtime overhead.
- Prefer batching and stable message shapes over chatty fine-grained calls.
- Keep hot-path control flow obvious; avoid abstraction layers that hide cost.
- Avoid repeated schema conversion and repeated deep clone work in tight paths.
- For non-trivial perf claims, include a short explanation of what got faster and why.

## 4) Developer Experience Rules

### 4.1 Ownership and boundaries

- Keep package responsibilities clear and intentional.
- Avoid pass-through wrappers unless they enforce a boundary, invariant, or compatibility contract.
- Export public APIs intentionally; keep internals private by default.

### 4.2 Clarity over cleverness

- Prefer explicit control flow and narrow composable units.
- Keep related logic together; split modules only when ownership boundaries are real.
- Use comments for "why", not "what".

### 4.3 Respect stack conventions

- Runtime contracts: `@mcp-b/webmcp-types` and `@mcp-b/webmcp-polyfill` define strict core behavior.
- Integration layer: `@mcp-b/global` can extend with transport/resources/prompts/testing helpers without contract drift.
- Transport behavior remains explicit and testable in `@mcp-b/transports`.

## 5) Duplication Policy

Eliminate aggressively:

- Duplicated enums/literals for protocol/domain values
- Duplicated validation constraints
- Duplicated branching/precondition logic
- Duplicated cross-package contract types

Allowed intentionally only when duplication is small, stable, and clearer than abstraction, with rationale in code comment or PR note.

## 6) Validation and Regression Safety

Every change includes proportional validation evidence.

Minimum expectation:

1. Typecheck affected package(s)
2. Run lint/format checks for affected package(s)
3. Run focused tests for changed behavior
4. Include exact commands in the PR description

When applicable, also run:

- `pnpm test:unit` when shared boundaries or cross-package contracts move
- `pnpm test:e2e` for user-facing flow changes
- package-specific browser/node test variants when runtime-specific behavior changes

No "trust me" refactors.

## 7) PR Quality Contract

PR descriptions should include:

1. Problem: what correctness/maintainability/performance risk existed
2. Decision: what became canonical (types/constants/contracts/validation)
3. Scope: affected packages and docs
4. Safety: unchanged behavior vs intentional behavior changes
5. Validation: exact commands run
6. Follow-ups: deferred work with reason

## 8) Review Anti-Patterns

Reject or request changes for:

- Temporary duplicated domain definitions
- New indirection with no boundary value
- Type assertions used to silence mismatches
- Contract changes without dependent updates
- Behavior changes without tests and validation evidence
- Performance claims without concrete explanation

## 9) Definition of Done

A change is done when:

1. Domain truth is centralized
2. Runtime validation proves boundary safety
3. Cross-package contracts are synchronized
4. Indirection is justified
5. Validation evidence is included
6. Future readers can quickly infer ownership and intent

If any item is missing, the change is still a draft.
