---
"@mcp-b/react-webmcp": patch
"@mcp-b/global": patch
---

fix: return structuredContent when outputSchema is defined

When a tool is registered with an outputSchema, the MCP specification requires the execute result to include both content and structuredContent. This fix ensures compliance with the MCP spec by:

- Returning structuredContent in the MCP response when outputSchema is provided
- Passing through structuredContent in the @mcp-b/global bridge handler
- Adding InferOutput utility type for better Zod schema type inference
