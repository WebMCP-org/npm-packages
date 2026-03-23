---
'@mcp-b/webmcp-ts-sdk': major
'@mcp-b/codemode': major
'@mcp-b/react-webmcp': major
'@mcp-b/webmcp-types': minor
'@mcp-b/webmcp-polyfill': minor
'@mcp-b/usewebmcp': minor
---

Drop Zod 3 support and standardize on Zod 4 plus Standard Schema.

Breaking changes:

- `@mcp-b/webmcp-ts-sdk`: removed Zod-specific validation; schemas must be JSON-exportable
- `@mcp-b/codemode`: peer dependency narrowed from `zod ^3.25 || ^4.0` to `zod ^4.0`
- `@mcp-b/react-webmcp`: removed `ZodSchemaObject` export; removed Zod field-map shorthand; dropped `zod` and `zod-to-json-schema` optional peer deps

Minor additions:

- `@mcp-b/webmcp-types`: Standard Schema types (`StandardJSONSchemaV1`, `ToolInputSchema`, `ToolOutputSchema`, `InferToolInputSchema`, `InferToolOutputSchema`)
- `@mcp-b/webmcp-polyfill`: re-exports Standard Schema types from webmcp-types; new `WebMCPToolRegistry` class
- `@mcp-b/usewebmcp`: `enabled` and `onStart` options
