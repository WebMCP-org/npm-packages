---
'@mcp-b/webmcp-ts-sdk': major
'@mcp-b/react-webmcp': major
---

Drop the `zod` peer dependency and remove the `zodToJsonSchema` / `isZodSchema`
helpers. Tool, prompt and resource schemas are now plain JSON Schema objects,
matching what `document.modelContext` accepts natively, so passing a Zod schema
to `useWebMCPPrompt` or `registerTool` no longer works. Convert at the call site
with `z.toJSONSchema(schema)` (Zod 4) and keep Zod as your own dependency if you
still want it for validation.
