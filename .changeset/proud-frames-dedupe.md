---
'@mcp-b/mcp-iframe': patch
---

Ignore duplicate iframe items instead of dropping a live registration. A child
that advertises two items mapping to the same parent name or wrapper URI no
longer displaces the first registration from the connection's bookkeeping, so
disconnecting always unregisters everything the element registered.
