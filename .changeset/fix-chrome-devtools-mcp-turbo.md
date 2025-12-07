---
"@mcp-b/chrome-devtools-mcp": patch
---

Fix turbo build output caching - adds package-level turbo.json to correctly specify build/** as output directory. This fixes the issue where published packages were missing build/node_modules containing compiled chrome-devtools-frontend dependencies.
