---
"@mcp-b/chrome-devtools-mcp": patch
---

Fix missing runtime dependencies - move core-js, debug, puppeteer, yargs, and zod from devDependencies to dependencies so they are installed when using npx.
