---
'@mcp-b/smart-dom-reader': major
'@mcp-b/smart-dom-reader-server': major
---

Move DOM extraction to the module-owned reader, traverse open shadow roots, and
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
