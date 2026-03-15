# Type Testing and No-Cast Policy

This document defines how TypeScript types are treated in this monorepo.

Types are part of the product surface here, not editor decoration. If inference fails at a public boundary, that is a library bug or a contract bug. Do not patch around it locally.

This document extends:

- [`TESTING_PHILOSOPHY.md`](./TESTING_PHILOSOPHY.md)
- [`TESTING.md`](./TESTING.md)
- [`AI_CONTRIBUTION_MANIFESTO.md`](./AI_CONTRIBUTION_MANIFESTO.md)
- [`MCPB_PACKAGE_PHILOSOPHY.md`](./MCPB_PACKAGE_PHILOSOPHY.md)

## Core Rule

Do not use casts to make repo code compile.

That includes:

- production code
- tests
- E2E fixtures
- examples and demo apps
- documentation snippets
- test helpers and browser globals

If code only works after `as any`, `as unknown as`, a widened wrapper function, or a manually retyped global, the type contract is broken and must be fixed at the source.

## Why This Is Non-Negotiable

This repo publishes runtime libraries and type contracts. Our tests are supposed to catch contract drift.

When a test does this:

```ts
const registerTool = mc.registerTool as unknown as (tool: unknown) => void;
```

the test stops testing `registerTool`.

When an E2E test does this:

```ts
const testing = navigator.modelContextTesting as unknown as {
  executeTool: (name: string, inputArgsJson: string) => Promise<string | null>;
};
```

the test stops proving that our browser API is typed correctly.

When an example annotates `execute(args: { ... })` because inference failed, the example stops proving that our inference works.

These are false greens. They hide the exact regressions the suite exists to catch.

## Hard Rules

### 1. No assertion chains

Do not use:

- `as any`
- `as unknown as`
- broad `as SomeType` casts to silence a mismatch
- wrapper aliases that erase a function signature before use

Examples of banned patterns:

```ts
const registerTool = mc.registerTool as unknown as (tool: unknown) => void;
const ctx = navigator.modelContext as ModelContextWithExtensions;
const testing = navigator.modelContextTesting as unknown as {
  executeTool: (name: string, inputArgsJson: string) => Promise<string | null>;
};
```

### 2. No local redefinition of public boundaries

Do not locally invent weaker versions of:

- `navigator.modelContext`
- `navigator.modelContextTesting`
- `window`
- `globalThis`
- public tool or transport signatures

If a global is missing a property in tests, add the correct global typing in the owning package or test project. Do not cast the global at the usage site.

Do not hide repo-owned globals or public boundaries behind local aliases unless there is a real control-flow reason.

Bad:

```ts
const mc = navigator.modelContext;
const registerTool = mc.registerTool;
const testing = navigator.modelContextTesting;
```

Preferred:

```ts
navigator.modelContext.registerTool({
  name: 'ping',
  description: 'Ping',
  execute() {
    return { content: [{ type: 'text', text: 'pong' }] };
  },
});

await navigator.modelContextTesting?.executeTool('ping', '{}');
```

Use the direct path so the code clearly exercises the real public surface.

### 3. No manual patching of missing inference

If `execute(args)` is supposed to infer from `inputSchema`, do not manually annotate `args` just to keep the example moving.

Bad:

```ts
registerTool({
  inputSchema: SOME_SCHEMA,
  async execute(args: { query: string }) {
    return { content: [{ type: 'text', text: args.query }] };
  },
});
```

Good:

```ts
registerTool({
  inputSchema: SOME_SCHEMA,
  async execute(args) {
    return { content: [{ type: 'text', text: args.query }] };
  },
});
```

If the second form does not infer correctly, fix the library types.

### 4. E2E tests must use real typed globals

E2E code is not exempt.

Do not cast inside `page.evaluate(...)` to reach globals. Do not assign repo-owned globals to intermediate variables just to make access easier. Instead:

1. define the global type in the relevant test project
2. augment `Window`, `Navigator`, or `globalThis`
3. read the global directly

Bad:

```ts
const result = await page.evaluate(() => {
  const testing = navigator.modelContextTesting as unknown as {
    listTools: () => unknown[];
  };
  return testing.listTools();
});
```

Good direction:

```ts
const result = await page.evaluate(() => {
  return navigator.modelContextTesting?.listTools();
});
```

with the global declared in a `.d.ts` file owned by the test project.

### 5. Extension access requires narrowing, not casting

`Navigator['modelContext']` is intentionally strict core.

If code needs MCP-B extension methods, use a real type guard or the owning package's extension type surface. Do not cast the core global to an extension shape.

Preferred pattern:

```ts
function hasModelContextExtensions(
  modelContext: Navigator['modelContext']
): modelContext is Navigator['modelContext'] & ModelContextExtensions {
  return 'callTool' in modelContext && 'listTools' in modelContext;
}
```

If a type guard is impossible because the types themselves are wrong, fix the types.

## Allowed Type-Test Escapes

There is one narrow exception category:

- negative type tests using `@ts-expect-error`

Use this only to prove that invalid code is rejected.

Rules:

- include a short reason
- place it directly on the line that should fail
- never use it to unblock runtime code

Example:

```ts
// @ts-expect-error - closed schema requires query
const args: InferArgsFromInputSchema<typeof schema> = {};
```

If you need anything broader than that, the design is probably wrong.

## Required Patterns

### 1. Use the canonical package for the boundary you are testing

- strict core WebMCP types come from `@mcp-b/webmcp-types`
- strict core runtime behavior comes from `@mcp-b/webmcp-polyfill`
- MCP-B extensions come from `@mcp-b/global`

Do not import a weaker or more convenient type from the wrong layer.

### 2. Prefer the real runtime package over manual global installation

If the test is about runtime behavior, use the runtime we publish.

- use `@mcp-b/webmcp-polyfill` when testing strict core runtime behavior
- use `@mcp-b/global` when testing MCP-B runtime and extension behavior
- let those packages install `navigator.modelContext` / `navigator.modelContextTesting`

Do not manually assign globals in runtime tests when the package under test already owns that setup.

Bad:

```ts
Object.defineProperty(navigator, 'modelContextTesting', {
  configurable: true,
  value: fakeTestingApi,
});
```

Preferred:

```ts
import { initializeWebModelContext } from '@mcp-b/global';

initializeWebModelContext();
await navigator.modelContextTesting?.executeTool('ping', '{}');
```

Manual global installation is only acceptable in narrow contract tests where the point of the test is the type surface itself, not runtime behavior.

### 3. Put global typing where the global is declared

For browser test projects and examples:

- add or update `.d.ts` files for `Window`, `Navigator`, and `globalThis`
- keep the declaration next to the owning runtime or test project
- make the test compile without per-call casts

### 4. Use typed helpers, not weakened helpers

If a helper installs globals or builds fixtures, the helper itself must be correctly typed.

Bad:

```ts
function installTestingApi(testing: unknown) {
  (navigator as any).modelContextTesting = testing;
}
```

Good direction:

```ts
declare global {
  interface Navigator {
    modelContextTesting?: ModelContextTesting;
  }
}

function installTestingApi(testing: ModelContextTesting) {
  Object.defineProperty(navigator, 'modelContextTesting', {
    configurable: true,
    value: testing,
  });
}
```

Use this pattern only for narrow contract tests. For runtime tests, import the actual polyfill/runtime package instead.

### 5. Use declaration-preserving schema definitions

If inference depends on literal schemas:

- preserve literals with `as const` where appropriate
- use `satisfies` against the canonical schema type
- avoid widening schema objects before registration

If the only way to register a schema is to cast it, fix the registration typing.

## Review Checklist

Reject a change if it does any of the following:

1. Casts `window`, `navigator`, or `globalThis` to reach a repo-owned property.
2. Casts `registerTool`, `callTool`, `listTools`, `executeTool`, or similar public functions to broader signatures.
3. Assigns repo-owned globals or public boundary methods to intermediate variables without a real need.
4. Adds manual handler arg annotations because schema inference failed.
5. Re-declares a public API locally with weaker types than the canonical package exports.
6. Uses docs/examples that compile only because types were asserted away.
7. Adds E2E coverage that proves runtime behavior but not the public type contract.

## What To Do Instead

When a change hits a type wall:

1. Identify the real boundary that is incorrectly typed.
2. Fix the canonical type definition in the owning package.
3. Add or update type tests that prove the intended inference.
4. Add or update runtime tests only after the type contract is honest.
5. Remove any temporary casts used during debugging before merging.

## When Repo Signals Conflict

In this repo, confusion usually does not come from one package README being completely wrong. It comes from mixed local signals:

- package docs describe the intended boundary correctly
- nearby tests/examples/docs still show casts, aliases, or manual global wiring
- AI follows the closest concrete pattern instead of the canonical package boundary

Rule:

If the package docs say to use the real polyfill/runtime surface, but the nearest example or test does something weaker, treat the example or test as the bug.

Do not copy the weaker local pattern.

Fix it so the nearest example matches the canonical package story:

- `@mcp-b/webmcp-types` provides the type contract
- `@mcp-b/webmcp-polyfill` installs strict core runtime globals
- `@mcp-b/global` installs MCP-B runtime/extension globals
- native Chromium tests use the real `navigator.modelContext` / `navigator.modelContextTesting` browser APIs directly

When you encounter local code that manually wires globals, casts to extension shapes, or invents helper aliases around repo-owned boundaries, do not normalize it. Update the code or docs so the local example teaches the same contract as the package docs.

## Required Validation For Type Surface Changes

If you change public types, schema inference, global augmentation, or test globals:

1. typecheck the affected package(s)
2. run the relevant `.test-d.ts` / type test suite
3. run consuming package checks when the contract crosses package boundaries
4. run relevant E2E or integration coverage when user-facing behavior depends on that contract

Typical commands:

```bash
pnpm --filter <package> typecheck
pnpm --filter <package> test
pnpm typecheck
pnpm test:unit
pnpm test:e2e
```

## Migration Guidance For Existing Casts

When cleaning up old code, follow this order:

1. Replace casted globals with real global declarations.
2. Replace casted public APIs with canonical imported types.
3. Replace casted extension access with type guards.
4. Remove manual handler arg annotations and let inference speak.
5. If inference breaks after removing casts, stop and fix the library types before continuing.

Do not keep a cast "temporarily" in a test or example. That is how broken contracts become normal.

## Repo Standard

In this repo, missing inference is a bug.

In this repo, casts on repo-owned boundaries are a bug.

In this repo, tests must prove the type contract, not route around it.
