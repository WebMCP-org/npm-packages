---
'@mcp-b/webmcp-types': major
---

**Breaking: this package now forwards the upstream `WebMCP` namespace and browser
declarations.** The package name remains available, but its previous top-level
exports and MCP-B types are not reproduced. It is a types-only compatibility alias
for [`webmcp-types`](https://github.com/webmachinelearning/webmcp-types) and will
eventually be removed; no removal date is set.

### Prefer the upstream dependency

For an application:

```bash
pnpm remove @mcp-b/webmcp-types
pnpm add -D webmcp-types@^0.1.9
```

Published libraries whose declarations reference upstream types should add it to
`dependencies` instead. Update any `compilerOptions.types` entries and triple-slash
references to `webmcp-types` as well.

```diff
- import type { ModelContext, RegisteredTool } from '@mcp-b/webmcp-types';
+ import type { WebMCP } from 'webmcp-types';
+ type ModelContext = WebMCP.ModelContext;
+ type RegisteredTool = WebMCP.RegisteredTool;
```

You can temporarily use `import type { WebMCP } from '@mcp-b/webmcp-types'` with
the same namespace-based code. The alias has no runtime JavaScript entry point;
use type-only imports or TypeScript's `types` configuration.

### Move each type to its owner

| Old export from `@mcp-b/webmcp-types`                                                                                                                        | Replacement                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `ModelContext`, `RegisteredTool`, registration/discovery options                                                                                             | Corresponding `WebMCP.*` types from `webmcp-types`.                           |
| `ChromeModelContext`, `ChromeModelContextExtensions`                                                                                                         | `WebMCP.ModelContext`; `executeTool()` is now part of the core contract.      |
| `ChromeModelContextExecuteToolOptions`                                                                                                                       | `WebMCP.ModelContextExecuteToolOptions`.                                      |
| `ModelContextTesting`, `ModelContextTestingToolInfo`                                                                                                         | Removed. Use `WebMCP.ModelContext` and `WebMCP.RegisteredTool` for test code. |
| `ModelContextTool`, `WebMcpToolAnnotations`, `MaybePromise`                                                                                                  | `WebMCP.ModelContextTool`, `WebMCP.ToolAnnotations`, `WebMCP.MaybePromise`.   |
| `ToolDescriptor`, `ToolDescriptorFromSchema`, `ToolListItem`, `ModelContextExtensions`, `ModelContextWithExtensions`, MCP `ToolAnnotations`                  | Same export names from `@mcp-b/webmcp-ts-sdk`.                                |
| `InputSchema`, `InferArgsFromInputSchema`, `InferJsonSchema`, `JsonSchemaForInference`, `ToolResultFromOutputSchema`, MCP result types, `RegistrationHandle` | Same export names from `@mcp-b/webmcp-ts-sdk`.                                |

For standard schema inference, let `context.registerTool()` infer inline literals
or use `WebMCP.ModelContextToolFromSchema<typeof inputSchema>`. The upstream type
takes one schema generic; use the SDK's `ModelContextTool` helpers if you still need
explicit input/result/name generics. Keep separately declared schemas literal
with `as const`; widened schemas infer `Record<string, unknown>`.

The upstream declaration uses `document.modelContext`, object input to
`executeTool()`, a JSON-string execution result, and object-valued discovery
schemas. `RegisteredTool.title` is required (it may be `''`); update test doubles
that omitted it. Navigator aliases/testing declarations are gone. `SubmitEvent`
extensions are declared by `@mcp-b/webmcp-polyfill`, and its global `ModelContext`
interface-object declaration lives in `@mcp-b/webmcp-polyfill`.
