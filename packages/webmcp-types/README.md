# @mcp-b/webmcp-types

Strict TypeScript type definitions for the WebMCP core API (`navigator.modelContext`).

Zero runtime. Zero side effects. Just `.d.ts` types.

## Type Safety First

This package is the type-safety source of truth for WebMCP.

- Infer tool input args from literal `inputSchema`
- Infer `structuredContent` from literal `outputSchema`
- Keep safe fallbacks (`Record<string, unknown>`) when schemas are widened/runtime-defined
- Provide name-aware typed registries with `TypedModelContext`

## Why This Package

- Global `Navigator` augmentation for `navigator.modelContext`
- Strongly typed tool descriptors and tool responses
- Literal JSON Schema inference for tool args and `structuredContent`
- Name-aware helper types for typed tool registries
- Runtime-agnostic: works with native implementations, polyfills, or adapters

## Package Selection

| Package | Use When |
| --- | --- |
| `@mcp-b/webmcp-types` | You only need compile-time types |
| `@mcp-b/webmcp-polyfill` | You need strict WebMCP core runtime behavior |
| `@mcp-b/global` | You want core + MCPB bridge extensions (`callTool`, prompts, resources, etc.) |

## Install

```bash
pnpm add -D @mcp-b/webmcp-types
# or
npm install --save-dev @mcp-b/webmcp-types
```

If your published library exposes these types in its public declarations, install as a production dependency instead of a dev dependency.

## Activate Global Types

TypeScript may not automatically include global declarations from npm packages. Use one of these:

1. Add to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["@mcp-b/webmcp-types"]
  }
}
```

2. Add a triple-slash reference in a global `.d.ts` file:

```ts
/// <reference types="@mcp-b/webmcp-types" />
```

3. Add a type-only import:

```ts
import type {} from '@mcp-b/webmcp-types';
```

## Quick Start

```ts
import type { JsonSchemaForInference } from '@mcp-b/webmcp-types';

const inputSchema = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    limit: { type: 'integer', minimum: 1, maximum: 50 },
  },
  required: ['query'],
  additionalProperties: false,
} as const satisfies JsonSchemaForInference;

const outputSchema = {
  type: 'object',
  properties: {
    total: { type: 'integer' },
    items: { type: 'array', items: { type: 'string' } },
  },
  required: ['total'],
  additionalProperties: false,
} as const satisfies JsonSchemaForInference;

navigator.modelContext.registerTool({
  name: 'search',
  description: 'Search indexed docs',
  inputSchema,
  outputSchema,
  async execute(args) {
    // args is inferred as: { query: string; limit?: number }
    return {
      content: [{ type: 'text', text: `Searching for ${args.query}` }],
      structuredContent: {
        // inferred from outputSchema
        total: 1,
        items: [args.query],
      },
    };
  },
});
```

## Strict Type Inference Deep Dive

### 1. Inference works best with literal schemas

Use `as const satisfies JsonSchemaForInference` so TypeScript preserves literal schema information.

If schema types are widened (for example `InputSchema` loaded at runtime), inference intentionally falls back to:

```ts
Record<string, unknown>
```

### 2. Input inference rules

`InferArgsFromInputSchema<T>` and schema-driven `registerTool(...)` inference use a focused subset:

- `type`
- `properties`
- `required`
- `items`
- `enum`
- `const`
- `nullable`
- `additionalProperties`

Other schema keywords are accepted as metadata but do not add new inferred structure.

### 3. `additionalProperties` behavior

| Schema shape | Inferred extras |
| --- | --- |
| `additionalProperties: false` | No extra keys |
| `additionalProperties` omitted/`true` | Extra keys allowed as `unknown` |
| `additionalProperties: { ... }` with no named `properties` | Map-like `Record<string, ...>` |
| `additionalProperties: { ... }` with named `properties` | Named properties inferred, extras remain `unknown` |

### 4. Required keys depend on literal `required`

If `required` is widened (for example a runtime `string[]`), fields are treated as optional by design.

### 5. Output inference from `outputSchema`

When `outputSchema` is a literal object schema, `structuredContent` is inferred automatically via `ToolResultFromOutputSchema`.

This catches enum/type mismatches at compile time.

### 6. Explicit typing is still available

You can always provide explicit generic args/results with `ToolDescriptor<TArgs, TResult, TName>` when schema inference is not enough for your use case.

## Name-Aware Typed Context (Advanced)

`TypedModelContext<TTools>` gives literal-name-aware `callTool(...)` typing for known registries.

```ts
import type { CallToolResult, ToolDescriptor, TypedModelContext } from '@mcp-b/webmcp-types';

type SearchTool = ToolDescriptor<
  { query: string; limit?: number },
  CallToolResult & { structuredContent: { total: number } },
  'search'
>;

type PingTool = ToolDescriptor<Record<string, never>, CallToolResult, 'ping'>;
type AppModelContext = TypedModelContext<readonly [SearchTool, PingTool]>;

declare const modelContext: AppModelContext;

await modelContext.callTool({
  name: 'search',
  arguments: { query: 'webmcp' },
});

await modelContext.callTool({ name: 'ping' });
// arguments are optional for Record<string, never> tools
```

## Core and Extension Surfaces

`Navigator['modelContext']` is typed as strict core WebMCP methods only.

Extension methods are available via `ModelContextExtensions` and `ModelContextWithExtensions`:

```ts
import type { ModelContextExtensions } from '@mcp-b/webmcp-types';

const modelContext = navigator.modelContext as Navigator['modelContext'] & ModelContextExtensions;
const tools = modelContext.listTools();
const result = await modelContext.callTool({
  name: 'search',
  arguments: { query: 'docs' },
});

void tools;
void result;
```

## Commonly Used Exports

| Export | Purpose |
| --- | --- |
| `ModelContext` | Strict core `navigator.modelContext` type |
| `ToolDescriptor` | Explicitly typed tool descriptor |
| `ToolDescriptorFromSchema` | Schema-driven descriptor with inferred args/result |
| `JsonSchemaForInference` | Supported JSON Schema subset for inference |
| `InferArgsFromInputSchema` | Derive args shape from a schema type |
| `ToolResultFromOutputSchema` | Derive `structuredContent` type from output schema |
| `TypedModelContext` | Name-aware typed `callTool`/`listTools` for known registries |
| `CallToolResult` | Tool response type |
| `ContentBlock` / `LooseContentBlock` | Strict and pragmatic content block typing |
| `ModelContextClient` | Tool execution client (`requestUserInteraction`) |

## Important Notes

- This package does not install any runtime behavior.
- Runtime validation/execution behavior depends on your WebMCP runtime package.
- `provideContext()` and `clearContext()` remain typed for compatibility, but are deprecated because the upstream WebMCP spec removed them on March 5, 2026.
- `unregisterTool(...)` accepts either a legacy string name or a tool-like object with `name` during the current compatibility window.
- `navigator.modelContextTesting` is typed as optional for compatibility with Chromium preview/testing surfaces.

## License

MIT
