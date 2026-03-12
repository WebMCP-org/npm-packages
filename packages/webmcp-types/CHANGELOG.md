# @mcp-b/webmcp-types

## 2.2.0

### Patch Changes

- 2540527: Align MCP-B with the latest WebMCP compatibility direction by deprecating removed context APIs, accepting tool-object unregistration, and keeping the legacy unregister handle available as a deprecated compatibility path in MCP-B wrappers.

## 2.1.0

## 2.0.13

## 2.0.12

## 2.0.11

## 2.0.10

## 2.0.9

## 2.0.8

### Patch Changes

- Support non-object outputSchema types (string, number, boolean, array) in registerTool overload 1. Widen TOutputSchema constraint from JsonSchemaObject to JsonSchemaForInference so primitive outputSchemas work with full type inference. Add comprehensive type tests codifying real-world usage patterns.

## 2.0.7

### Patch Changes

- Fix registerTool overloads to accept raw return values (e.g. `Promise<string>`) in widened-schema and no-schema tool definitions. Previously only `CallToolResult` was accepted, requiring `as const satisfies` on every tool object.
