---
'@mcp-b/webmcp-polyfill': patch
---

Match Chrome's observable API shape, so `webmcp/idlharness.https.window.html`
now passes 20/20 subtests against the polyfill.

`document.modelContext` is a getter on `Document.prototype` rather than a value
property on the document instance, as WebIDL's `[SameObject] readonly attribute`
requires. Feature detection with `'modelContext' in document` and reads of
`document.modelContext` are unaffected; code that inspected the document's own
property descriptor — `Object.hasOwn(document, 'modelContext')` or
`Object.keys(document)` — must look at `Document.prototype` instead.

The context object also stops leaking its internals: bookkeeping fields and
helpers are `#private` or `static`, so only `registerTool`, `getTools`,
`executeTool` and `ontoolchange` appear on the prototype, and the polyfill's own
marker property is non-enumerable so instances spread and stringify like
Chrome's. `registerTool`, `getTools` and `executeTool` report the `length`
WebIDL specifies (1, 0, 2); their behavior is unchanged.
