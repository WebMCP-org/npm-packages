# @mcp-b/smart-dom-reader

## 5.0.3

### Patch Changes

- 4dec56a: Generate selectors using the actual test attribute and require the preferred CSS selector to identify one element. Fix XPath paths beneath ID anchors and for quoted IDs. Respect zero traversal depth and include a scoped host's shadow root, using direct children instead of redundant descendant scans. Report missing structure selectors instead of silently extracting the whole document.

  Refresh the server's embedded reader during workspace builds so both packages ship the same fixes.

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

- de0b41c: Require Node 20 or newer. `@mcp-b/global`, `@mcp-b/mcp-iframe`,
  `@mcp-b/webmcp-polyfill` and `@mcp-b/webmcp-ts-sdk` previously allowed Node 18;
  the rest declared no `engines` range at all and now state the same floor. Node 18
  reached end of life in April 2025. Browser builds are unaffected — this governs
  build tooling and the relay CLI.
- de0b41c: Resolve iframe documents across realms so `frameSelector` works for
  extractStructure, extractInteractive, and extractFull. `instanceof Document`
  tests the calling realm's constructor, so a document reached through an iframe
  never matched it and those three methods threw instead of reading the frame.
- de0b41c: Stop emitting declaration source maps, and ship the MIT `LICENSE` text these
  packages already declared. Each package shipped `dist` without `src`, so every
  published `.d.ts.map` pointed at a file that was not in the tarball; editors
  already fall back to the `.d.ts` itself. `@mcp-b/webmcp-types` keeps its maps —
  it is the one package that ships `src`, so its maps resolve.

## 4.0.0

### Patch Changes

- f096ba6: Fix package exports to reference the emitted `.mjs` and `.d.mts` files.

## 3.0.0

### Major Changes

- Align this package with the WebMCP v3 release train. This package has no direct API changes in this release.

## 2.3.1

## 2.3.0

## 2.2.0

## 2.1.0

## 2.0.13

## 2.0.12

## 2.0.11

## 2.0.10

## 2.0.9

## 2.0.8

## 2.0.7

## 1.1.0

### Minor Changes

- Stable release of all packages with backwards-compatible improvements.

### Patch Changes

- 02833d3: Bump all packages to new beta release
- 1f26978: Beta release for testing
- 7239bb5: Bump all packages to new beta release
- b8c2ea5: Beta release bump

## 1.0.3-beta.3

### Patch Changes

- Bump all packages to new beta release

## 1.0.3-beta.2

### Patch Changes

- Bump all packages to new beta release

## 1.0.3-beta.1

### Patch Changes

- Beta release bump

## 1.0.3-beta.0

### Patch Changes

- Beta release for testing

## 1.0.2

### Patch Changes

- Fix TypeScript recursion depth errors in MCP server
  - Resolved TypeScript compilation errors related to recursion depth limits
  - Improved type definitions for better compilation performance
