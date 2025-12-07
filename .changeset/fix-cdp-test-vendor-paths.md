---
"@mcp-b/chrome-devtools-mcp": patch
---

Fix post-build script to update import paths in tests directory

The post-build script now correctly updates import paths from `node_modules` to `vendor` in both `src/` and `tests/` directories, fixing test failures after the vendor rename.
