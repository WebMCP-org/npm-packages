---
'@mcp-b/smart-dom-reader': major
'@mcp-b/smart-dom-reader-server': patch
'@mcp-b/transports': patch
---

Tighten browser extraction and extension-port types during the TypeScript cleanup.
These packages join the coordinated MCP-B major release; their changes below are
separate from the WebMCP core API migration.

- **`@mcp-b/smart-dom-reader`:** the browser bundle's `executeExtraction(method, args)`
  signature now correlates each method with its argument type using a tuple union.
  Remove explicit generic arguments from calls such as
  `executeExtraction<'extractStructure'>(...)`; pass the method literal and let
  TypeScript infer the arguments. Code passing a union of methods must narrow the
  method before selecting its arguments. `ContentDetection.detectLandmarks()` now
  exposes its known landmark keys; use `keyof ReturnType<typeof ContentDetection.detectLandmarks>`
  instead of an arbitrary string when indexing its result. SVG selector paths also
  read class attributes correctly.
- **`@mcp-b/smart-dom-reader-server`:** browser extraction dispatch and package-version
  loading use checked types. Existing MCP tool names, input schemas, and launch
  configuration remain unchanged; no configuration migration is needed.
- **`@mcp-b/transports`:** `ExtensionPort.postMessage` now describes MCP JSON-RPC
  messages and the transport's keep-alive envelope. Custom port adapters should
  accept that union; the `ExtensionPort` interface remains exported. Existing
  Chrome ports and transport constructors require no changes.
