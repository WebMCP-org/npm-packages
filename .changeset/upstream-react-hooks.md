---
'usewebmcp': major
'@mcp-b/react-webmcp': minor
'@mcp-b/webmcp-types': major
'@mcp-b/webmcp-polyfill': patch
---

Use the Community Group's `webmcp-types` as the core React hook contract and the owner of
`Document.modelContext`. MCP-B types now derive standard contracts from upstream and retain
extension and legacy discovery types without conflicting global declarations.

`usewebmcp` no longer installs MCP-B or the MCP SDK. Its results infer from `execute` and successful
agent calls return raw values. To retain `outputSchema`, MCP annotations, and automatic MCP response
formatting, import `useWebMCP` from `@mcp-b/react-webmcp`. Core `WebMCPConfig` and `WebMCPReturn`
now use `<TInputSchema, TResult>`; the extension package retains its previous output-schema generics
and `InferOutput` export. Upstream registration falls back to `Record<string, unknown>` for a widened
schema; MCP-B descriptor helpers retain their object-or-array compatibility fallback.

Both tool hooks validate Standard Schema input before local and agent execution, await async
validation, and pass transformed output to the handler. Caller types retain the schema's input type.
JSON Schema metadata alone does not add validation. Handlers always receive execution options with
an AbortSignal, including when older runtimes omit the options bag.

Add `exposedTo`, `formatOutput`, and registration status/error fields alongside `enabled`. Serialized metadata
changes refresh registration without churn from equivalent inline objects. Missing APIs are checked
for up to ten seconds after mount. Cancelled executions cannot overwrite later state, and stale
registration promises cannot alter replacement registrations.

Add browser and native Chrome regression coverage plus packed-package tests for production
`'use client'` directives, isolated strict declarations, upstream/MCP-B coexistence, and React 18/19
server rendering.

References: https://github.com/webmachinelearning/webmcp-types,
https://github.com/GoogleChromeLabs/use-webmcp-tool, and https://standardschema.dev/.
