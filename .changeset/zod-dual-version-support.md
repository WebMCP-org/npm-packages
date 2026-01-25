---
"@mcp-b/react-webmcp": minor
"usewebmcp": minor
"@mcp-b/global": patch
---

Add Zod 3.25+ and Zod 4 dual version support for React packages

- `@mcp-b/react-webmcp` and `usewebmcp` now accept `zod@^3.25.0 || ^4.0.0` as peer dependency
- Users on Zod 3.25+ can use `import { z } from "zod/v4"` for Zod 4 APIs
- `@mcp-b/global` improved schema detection to recognize both Zod 3 (`_def`) and Zod 4 (`_zod`) schemas
- Note: Using Zod schemas directly with `@mcp-b/global` (web standard polyfill) still requires Zod 4 APIs (`z.toJSONSchema`, `z.fromJSONSchema`)
