# @mcp-b/smart-dom-reader-server

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
