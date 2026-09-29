---
'@mcp-b/webmcp-extension': major
---

**Breaking: the extension client follows the 6.0.0 page runtime.**
`connectWebMCPClient()`, its options, and the template are unchanged. The
package takes the major version with the fixed release group; upgrade
`@mcp-b/global` in the MAIN-world bundle and `@mcp-b/transports` together with it.

What extension clients observe changes through the page runtime:

- Pages register tools on `document.modelContext`; the MAIN-world bundle no
  longer provides `navigator.modelContext`. Migrate page code as described in the
  `@mcp-b/global` changeset.
- When a native Chrome tool navigates, `executeTool()` resolves with `null`.
  The client used to receive an error result reading
  `Tool execution interrupted by navigation`; it now receives a successful
  result whose text is `null`. Check for that text if your extension reacted
  to the old error.
- Result and error shapes otherwise follow `@mcp-b/global` 6.0.0: imperative
  results are JSON strings, native declarative forms can return plain text, and
  failures routed through upstream execution surface as `Tool execution failed`
  without the original reason.
