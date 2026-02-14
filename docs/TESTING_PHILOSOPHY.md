# Testing Philosophy

This document defines how we test in this npm package monorepo.

Primary goal: high confidence in behavior with minimal brittle tests.

## Core Principles

1. Integration-first over isolated unit tests
2. Mock external boundaries, not internal domain logic
3. Prefer real runtime surfaces for high-risk paths:
   - real browser for browser behavior
   - runtime-accurate environments for runtime-specific behavior
4. Keep fast feedback loops with narrow, deterministic tests for pure logic
5. Validate contracts at boundaries (schema, transport payloads, message shapes)

## Test Layers for This Repo

1. Contract tests (fast)
   - What: schema validation, serialization boundaries, type-level and DTO compatibility.
   - Why: catches contract drift early.
   - Mocking: none.

2. Slice integration tests (default)
   - What: multiple modules wired inside one package/feature.
   - Why: validates behavior instead of implementation choreography.
   - Mocking: external dependencies only.

3. Browser integration tests (runtime-accurate)
   - What: behavior relying on real browser APIs (`postMessage`, events, navigation, focus, extension boundaries where applicable).
   - Why: Node-like DOM simulators are useful, but still simulations.
   - Tooling: Vitest Browser Mode and Playwright-backed execution where configured.

4. Cross-package end-to-end tests (critical journeys)
   - What: workflows across package boundaries using test apps in `e2e/`.
   - Why: validates real wiring and compatibility between libraries.
   - Tooling: Playwright (`pnpm test:e2e`).

5. Artifact validation tests (publish confidence)
   - What: packed/tarball install and real usage checks for published artifacts.
   - Why: catches packaging/export/runtime surface regressions.
   - Tooling: repo scripts such as `pnpm test:e2e:tarball:global`.

## What Gets Which Test Type

1. Pure utility/transform/validation logic
   - Use: contract tests + focused unit tests.
   - Rule: no module-level internal mocks.

2. Stateful orchestration and lifecycle logic
   - Use: slice integration tests first.
   - Add: browser integration tests when browser/runtime semantics are involved.

3. Public API and contract boundary changes
   - Use: contract tests and integration tests in consuming package(s).
   - Add: E2E coverage when user-facing behavior changes.

4. External integrations
   - Use: boundary mocking only (HTTP/network/runtime adapters).
   - Never: mock your own feature modules to force outputs.

## Mocking Policy

Allowed mocks:

1. External HTTP/network boundaries
2. Platform boundaries outside test scope
3. Time/random/UUID when determinism is required
4. Third-party SDK internals when they are not the subject under test

Discouraged:

1. Mocking sibling/internal modules to assert call choreography
2. Mocking most of an orchestration path to force outputs

Hard rule:

1. If a test needs multiple internal module mocks, rewrite it as a slice integration test.

## Browser Testing Standard

Use browser-mode testing when behavior depends on browser execution semantics.

Guidelines:

1. Assert user-visible behavior and externally observable state.
2. Reuse shared network fixtures/handlers where possible.
3. Prefer deterministic waits (`expect(...).toHave...`) over arbitrary delays.

## Package and Monorepo Validation Standard

Every behavior change should include exact commands in PR notes.

Typical command sets:

1. Package-local change:
   - `pnpm --filter <package> check`
   - `pnpm --filter <package> typecheck`
   - `pnpm --filter <package> test`

2. Shared contract change across packages:
   - `pnpm typecheck`
   - `pnpm test:unit`

3. User-facing cross-package change:
   - `pnpm test:e2e`
   - Relevant package-local checks from item 1

4. Packaging/export surface change:
   - Relevant tarball/install validation script(s), for example `pnpm test:e2e:tarball:global`

## Coverage Expectations

Coverage numbers are indicators, not goals.

Quality bar:

1. Critical orchestration flows have integration coverage.
2. Contract boundaries are explicitly validated.
3. Business-critical user journeys have E2E coverage.

## PR Checklist (Testing)

1. What behavior changed?
2. Which test layer covers it (contract/slice/browser/E2E/artifact)?
3. Were only external boundaries mocked?
4. If internal mocks were used, why is a slice test not feasible?
5. Were failure paths and boundary cases covered?
6. Which exact commands were run?

## Migration Direction (From Heavy Mocking)

When refactoring old tests:

1. Keep existing tests temporarily if needed for safety.
2. Add stronger slice/runtime coverage for the same behavior.
3. Remove redundant mock-heavy tests once behavior is covered by stronger layers.

## References

- Vitest Browser Mode: https://vitest.dev/guide/browser/
- Vitest request mocking guidance: https://vitest.dev/guide/mocking/requests
- Vitest Test Projects: https://vitest.dev/guide/projects
- Playwright: https://playwright.dev/
- Mock Service Worker: https://mswjs.io/
