---
"@mcp-b/mcp-iframe": minor
---

Enforce MCP name validation for tool and prompt prefixes

**BREAKING CHANGE**: Default prefix separator changed from `:` to `_` to comply with MCP schema requirements.

Tool and prompt names must match the pattern `^[a-zA-Z0-9_-]{1,128}$`. The previous default separator `:` was invalid according to this schema.

Changes:
- Changed default `prefix-separator` from `:` to `_`
- Added runtime validation for prefix separator (warns and sanitizes invalid characters)
- Added validation for element ID/name (warns and sanitizes invalid characters)
- Added validation before tool/prompt registration (skips registration with error if final name is invalid)
- Names exceeding 128 characters will not be registered

If you were relying on the `:` separator, you can either:
1. Accept the new `_` separator (recommended for MCP compatibility)
2. Explicitly set `prefix-separator=":"` attribute (not recommended as it may cause MCP validation errors)
