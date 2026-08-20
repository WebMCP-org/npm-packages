---
'@mcp-b/webmcp-types': major
'@mcp-b/webmcp-polyfill': major
'@mcp-b/webmcp-ts-sdk': major
'@mcp-b/webmcp-local-relay': patch
---

Return `RegisteredTool.inputSchema` from `getTools()` as a JSON Schema object
instead of a serialized string, following webmcp#241 and Chrome 154.0.8013.
The polyfill and the standalone `BrowserMcpServer` both parse a fresh object
per call, exactly like Blink parsing its serialized copy; a schema whose
custom `toJSON` serializes to non-object JSON is omitted rather than surfaced
as a value consumers would mistake for a pre-154 serialized string.

Consumers stay compatible with both generations of Chrome: the browser-server
native backfill and the relay embed accept the object shape from new Chrome and
the string shape that the 149–156 Origin Trial population still returns. The
`RegisteredTool.inputSchema` type widens to `InputSchema | string` to make that
branching explicit.

Before this, Chrome ≥154.0.8013 broke native tool mirroring entirely:
`JSON.parse` on the new object threw, and every native tool — including
child-frame tools — was dropped as malformed.
