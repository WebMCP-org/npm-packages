# @mcp-b/webmcp-types

TypeScript contracts for the current WebMCP API on `document.modelContext`. This package emits declarations only and has no runtime side effects.

The [WebMCP draft](https://webmachinelearning.github.io/webmcp/) is authoritative for the browser API. MCP-B extension types are kept separate from that standard surface.

## Install

```bash
pnpm add -D @mcp-b/webmcp-types
```

Use a production dependency when your published declarations reference these types.

## Activate the browser globals

Choose one activation method:

```json
{
  "compilerOptions": {
    "types": ["@mcp-b/webmcp-types"]
  }
}
```

```ts
/// <reference types="@mcp-b/webmcp-types" />
```

```ts
import type {} from '@mcp-b/webmcp-types';
```

Activation adds the canonical `document.modelContext` type and the optional deprecated navigator compatibility surfaces.

## Register a standard tool

```ts
import type { JsonSchemaForInference } from '@mcp-b/webmcp-types';

const inputSchema = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    limit: { type: 'integer', minimum: 1 },
  },
  required: ['query'],
  additionalProperties: false,
} as const satisfies JsonSchemaForInference;

const controller = new AbortController();

await document.modelContext.registerTool(
  {
    name: 'search',
    description: 'Search indexed docs',
    inputSchema,
    execute: ({ query, limit }) => ({ query, limit }),
  },
  { signal: controller.signal }
);

controller.abort();
```

The callback input is `{ query: string; limit?: number }`. `registerTool()` returns `Promise<void>`; aborting the registration signal removes the tool.

## Type surfaces

| Type                         | Contract                                                         |
| ---------------------------- | ---------------------------------------------------------------- |
| `ModelContext`               | Current standard `document.modelContext` producer API            |
| `ChromeModelContext`         | Standard API plus feature-detectable Chromium `executeTool()`    |
| `ModelContextExtensions`     | MCP-B registration and `listTools()` extensions                  |
| `ModelContextWithExtensions` | Standard event/discovery shape with MCP-B registration overloads |
| `ModelContextTesting`        | Deprecated optional testing compatibility surface                |

Both tool descriptor callbacks receive one input argument. MCP-B `ToolDescriptor` may also declare `outputSchema`.

## Schema inference

`JsonSchemaForInference` is the JSON Schema type owned by `@modelcontextprotocol/server`. The local inference helpers add no competing schema vocabulary.

`InferJsonSchema<T>` supports:

- `type`, including multi-type arrays such as `['string', 'null']`
- `const` and `enum`
- object `properties`, `required`, and `additionalProperties`
- array `items`
- boolean subschemas

Typeless object keywords infer an object. Unsupported compositions such as `$ref` and `oneOf` remain `unknown`.

`InferArgsFromInputSchema<T>` keeps object and array inputs. A widened or runtime-defined `InputSchema` safely falls back to `WebMcpToolInput`, which is `Record<string, unknown> | unknown[]`.

MCP-B output inference uses `ToolResultFromOutputSchema<T>` or `ToolDescriptorFromSchema<TInput, TOutput>`. `outputSchema` is not part of the current standard `ModelContextTool` dictionary.

## Main exports

| Export                       | Purpose                                      |
| ---------------------------- | -------------------------------------------- |
| `ModelContextTool`           | Standard one-argument tool dictionary        |
| `RegisteredTool`             | Metadata returned by `getTools()`            |
| `ToolDescriptor`             | Explicit MCP-B input and result types        |
| `ToolDescriptorFromSchema`   | MCP-B input and output schema inference      |
| `ToolListItem`               | Metadata returned by `listTools()`           |
| `InputSchema`                | Broad runtime JSON Schema boundary           |
| `JsonSchemaForInference`     | Canonical upstream JSON Schema type          |
| `InferJsonSchema`            | Infer a value from supported schema keywords |
| `InferArgsFromInputSchema`   | Infer an object or array callback input      |
| `ToolResultFromOutputSchema` | Infer MCP `structuredContent`                |
| `CallToolResult`             | Canonical MCP tool result                    |
| `RegistrationHandle`         | Handle returned by prompt/resource helpers   |

## Compatibility

- `navigator.modelContext` remains optional and deprecated.
- `navigator.modelContextTesting` remains optional and deprecated.
- `unregisterTool()`, `provideContext()`, and `clearContext()` are absent. Use an `AbortSignal` to own a tool registration.
- Strict and `strictNullChecks: false` projects are covered by package type tests.

See the [package reference](https://docs.mcp-b.ai/packages/webmcp-types/reference) and [strict core versus MCP-B extensions](https://docs.mcp-b.ai/explanation/strict-core-vs-mcp-b-extensions).

## License

MIT
