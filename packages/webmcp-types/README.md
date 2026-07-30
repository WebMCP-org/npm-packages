# @mcp-b/webmcp-types

Strict TypeScript type definitions for the WebMCP core API (`document.modelContext`).

Zero runtime. Zero side effects. Just `.d.ts` types.

## Type Safety First

This package is the type-safety source of truth for WebMCP.

- Infer tool input args from literal `inputSchema`
- Infer `structuredContent` from literal `outputSchema`
- Keep safe fallbacks (`Record<string, unknown>`) when schemas are widened/runtime-defined

## Why This Package

- Global `Document` augmentation for `document.modelContext`
- Optional deprecated `Navigator` augmentation for older `navigator.modelContext` runtimes
- Strongly typed tool descriptors and tool responses
- Literal JSON Schema inference for tool args and `structuredContent`
- Runtime-agnostic: works with native implementations, polyfills, or adapters

## Package Selection

| Package                  | Use When                                                             |
| ------------------------ | -------------------------------------------------------------------- |
| `@mcp-b/webmcp-types`    | You only need compile-time types                                     |
| `@mcp-b/webmcp-polyfill` | You need strict WebMCP core runtime behavior                         |
| `@mcp-b/global`          | You want core + MCPB bridge extensions such as prompts and resources |

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

await document.modelContext.registerTool({
  name: 'search',
  description: 'Search indexed docs',
  inputSchema,
  async execute(args) {
    // args is inferred as: { query: string; limit?: number }
    return {
      total: 1,
      items: [args.query],
    };
  },
});
```

## Strict Type Inference Deep Dive

### 1. Inference works best with literal schemas

Use `as const satisfies JsonSchemaForInference` so TypeScript preserves literal schema information.

If schema types are widened (for example `InputSchema` loaded at runtime), inference intentionally falls back to:

```ts
Record<string, unknown>;
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

| Schema shape                                               | Inferred extras                                    |
| ---------------------------------------------------------- | -------------------------------------------------- |
| `additionalProperties: false`                              | No extra keys                                      |
| `additionalProperties` omitted/`true`                      | Extra keys allowed as `unknown`                    |
| `additionalProperties: { ... }` with no named `properties` | Map-like `Record<string, ...>`                     |
| `additionalProperties: { ... }` with named `properties`    | Named properties inferred, extras remain `unknown` |

### 4. Required keys depend on literal `required`

If `required` is widened (for example a runtime `string[]`), fields are treated as optional by design.

### 5. MCP-B output inference from `outputSchema`

When `outputSchema` is a literal JSON Schema, `structuredContent` is inferred automatically via `ToolResultFromOutputSchema`. Object, array, string, number, boolean, and null schemas are supported for MCP-B type inference.

`outputSchema` is not part of the WebMCP `ModelContextTool` dictionary. Use it through `ModelContextWithExtensions` when an MCP-B runtime or adapter consumes the metadata.

This catches enum/type mismatches at compile time.

### 6. Explicit typing is still available

You can always provide explicit generic args/results with `ToolDescriptor<TArgs, TResult, TName>` when schema inference is not enough for your use case.

## Core and Extension Surfaces

`Document['modelContext']` is typed as strict core WebMCP methods only.
`Navigator['modelContext']` remains an optional deprecated compatibility alias.

Current Chromium previews may add `executeTool(...)`. It is intentionally absent
from the strict core and available as an optional `ChromeModelContextExtensions`
member:

```ts
import type { ChromeModelContextExtensions } from '@mcp-b/webmcp-types';

const chromeContext = document.modelContext as Document['modelContext'] &
  ChromeModelContextExtensions;
const registeredTool = (await document.modelContext.getTools())[0];

if (registeredTool && chromeContext.executeTool) {
  await chromeContext.executeTool(registeredTool, JSON.stringify({ query: 'docs' }));
}
```

Extension methods are available via `ModelContextExtensions` and `ModelContextWithExtensions`:

```ts
import type { ModelContextExtensions } from '@mcp-b/webmcp-types';

const modelContext = document.modelContext as Document['modelContext'] & ModelContextExtensions;
const tools = modelContext.listTools();

void tools;
```

## Commonly Used Exports

| Export                         | Purpose                                            |
| ------------------------------ | -------------------------------------------------- |
| `ModelContext`                 | Strict core `document.modelContext` type           |
| `ModelContextTool`             | Strict one-argument WebMCP tool descriptor         |
| `RegisteredTool`               | Tool metadata returned by `getTools()`             |
| `ChromeModelContextExtensions` | Optional experimental Chromium additions           |
| `ToolDescriptor`               | Explicitly typed tool descriptor                   |
| `ToolDescriptorFromSchema`     | Schema-driven descriptor with inferred args/result |
| `JsonSchemaForInference`       | Supported JSON Schema subset for inference         |
| `InferArgsFromInputSchema`     | Derive args shape from a schema type               |
| `ToolResultFromOutputSchema`   | Derive `structuredContent` type from output schema |
| `CallToolResult`               | Tool response type                                 |
| `ContentBlock`                 | MCP v2 tool result content blocks                  |
| `ModelContextClient`           | Tool execution client (`requestUserInteraction`)   |

## Important Notes

- This package does not install any runtime behavior.
- Runtime validation/execution behavior depends on your WebMCP runtime package.
- Prefer `document.modelContext`. Current Chromium has removed `navigator.modelContext`; the optional type remains for older browsers and compatibility runtimes.
- `provideContext()` and `clearContext()` were removed from the upstream WebMCP spec on March 5, 2026 and are intentionally not typed.
- `unregisterTool(name)` is `@deprecated`. The April 23, 2026 WebMCP draft removed it from the spec in favor of an `AbortSignal` passed via `registerTool(tool, { signal })`. The type is retained for compatibility with older native previews and existing MCP-B wrappers; it will be removed in the next major version.
- `registerTool(tool, options?)` returns `Promise<void>` and accepts a `ModelContextRegisterToolOptions` dictionary with an optional `signal: AbortSignal`. Aborting the signal unregisters the tool. Invalid and duplicate registrations reject the promise.
- `getTools({ fromOrigins })` discovers same-origin tools plus tools explicitly exposed by matching descendant origins.
- Strict WebMCP annotations are boolean `readOnlyHint` and `untrustedContentHint` fields. MCP-B annotation extensions remain available on `ToolDescriptor`.
- `navigator.modelContextTesting` is deprecated and optional for compatibility with older Chromium previews and MCP-B testing shims.

## License

MIT
