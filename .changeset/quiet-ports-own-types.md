---
'@mcp-b/transports': patch
---

Stop installing and forcing `@types/chrome` into every transport consumer. The
extension server accepts an `ExtensionPort` with only the methods it uses, so
existing Chrome ports remain compatible with either `@types/chrome` or
Chromium's `chrome-types`. Page and iframe transport imports no longer add
Chrome extension globals. Extension applications should declare their chosen
Chrome types as their own development dependency.
