---
'@mcp-b/react-webmcp': major
'usewebmcp': major
---

Drop React 17 from the supported peer range; `react` is now `^18.0.0 || ^19.0.0`.
The hooks no longer carry mounted-ref guards, which React 18 made unnecessary by
turning post-unmount state updates into a no-op, so React 17 was already
unsupported in practice.
