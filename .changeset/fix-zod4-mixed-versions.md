---
"@mcp-b/global": patch
"@mcp-b/react-webmcp": patch
"usewebmcp": patch
---

fix: Simplify to Zod 3.25+ only support

Remove Zod 4 support and simplify the validation layer to work only with Zod 3.25+.
This resolves compatibility issues with projects using Zod 3 and provides a simpler,
more reliable implementation using zod-to-json-schema.

Breaking: Projects must use Zod 3.25+ (not Zod 4). Update peer dependency accordingly.
