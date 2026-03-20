---
'@mcp-b/webmcp-ts-sdk': major
'@mcp-b/codemode': major
---

Drop Zod 3 support across MCP-B packages and standardize the workspace on Zod 4 plus Standard Schema. This removes the `zod-to-json-schema` fallback path, makes MCP-B runtime normalization explicitly Zod 4-only, and updates docs and E2E coverage to reflect the new contract.
