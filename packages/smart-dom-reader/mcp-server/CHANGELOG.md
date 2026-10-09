# @mcp-b/smart-dom-reader-server

## 6.0.0

### Patch Changes

- 160acc3: Tighten browser extraction and extension-port types during the TypeScript cleanup.
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

## 5.1.0

### Patch Changes

- 43ad4de: Update Playwright and the TypeScript loader to include upstream fixes.

## 5.0.3

### Patch Changes

- 4dec56a: Generate selectors using the actual test attribute and require the preferred CSS selector to identify one element. Fix XPath paths beneath ID anchors and for quoted IDs. Respect zero traversal depth and include a scoped host's shadow root, using direct children instead of redundant descendant scans. Report missing structure selectors instead of silently extracting the whole document.

  Refresh the server's embedded reader during workspace builds so both packages ship the same fixes.

- 4dec56a: Serialize browser connection and close requests so concurrent calls share one browser and reconnect only after cleanup finishes. Close the browser when the stdio session ends. Report unmatched explicit structure and interactive selectors as errors instead of extracting the whole page.

## 5.0.2

## 5.0.1

## 5.0.0

### Major Changes

- de0b41c: Move DOM extraction to the module-owned reader, traverse open shadow roots, and
  remove the undocumented constructor-injection path. The server now ships the
  same reader implementation and reports its package version at runtime.

  `extractInteractive`, `extractFull`, and `extractFromElement` now take
  `Omit<ExtractionOptions, 'mode'>` instead of `Partial<ExtractionOptions>`. Each
  of them picks its own mode and spreads it over the caller's options, so a `mode`
  passed in the options bag was silently discarded. Callers that passed one now get
  a compile error at the line that never did anything; drop the key, or use
  `new SmartDOMReader({ mode })` where the mode is genuinely yours to choose.

  `@mcp-b/smart-dom-reader-server` also joins the fixed version group in this
  release, moving from 0.2.0 to the shared line. It wraps the reader, so a breaking
  reader change could no longer ship here as a minor.

### Patch Changes

- de0b41c: Resolve iframe documents across realms so `frameSelector` works for
  extractStructure, extractInteractive, and extractFull. `instanceof Document`
  tests the calling realm's constructor, so a document reached through an iframe
  never matched it and those three methods threw instead of reading the frame.

## 4.0.0

### Major Changes

- Join the WebMCP unified release train. This package versioned independently on 0.x
  while wrapping `@mcp-b/smart-dom-reader`, so breaking reader changes reached
  consumers here as minor bumps. Its version is now fixed to the rest of the WebMCP
  packages, jumping 0.2.0 to 4.0.0 to match. No API changes in this release.

## 0.2.0

### Minor Changes

- Stable release of all packages with backwards-compatible improvements.

### Patch Changes

- 02833d3: Bump all packages to new beta release
- 7239bb5: Bump all packages to new beta release

## 0.1.1-beta.1

### Patch Changes

- Bump all packages to new beta release

## 0.1.1-beta.0

### Patch Changes

- Bump all packages to new beta release
