---
'@mcp-b/mcp-iframe': major
---

Make the package root the only auto-registering entry point and move custom
element registration to the side-effect-free `/element` export. Remove raw
client and refresh aliases, refresh advertised child items automatically, and
apply the call timeout to tools, resources, and prompts.
