# @mcp-b/webmcp-types

**Deprecated.** Use [`webmcp-types`](https://www.npmjs.com/package/webmcp-types)
directly.

```bash
pnpm remove @mcp-b/webmcp-types
pnpm add -D webmcp-types
```

```ts
import type { WebMCP } from 'webmcp-types';
```

This package only forwards the `webmcp-types` exports and browser declarations.
MCP-B extension types, such as `ToolDescriptor` and `ModelContextWithExtensions`,
live in [`@mcp-b/webmcp-ts-sdk`](../webmcp-ts-sdk/README.md). For the MCP side of
WebMCP, use [`@mcp-b/global`](../global/README.md).

## License

MIT.
