# @mcp-b/webmcp-polyfill

**Deprecated.** Use [`@w3c/webmcp-polyfill`](https://www.npmjs.com/package/@w3c/webmcp-polyfill)
for `document.modelContext`.

```bash
pnpm add @w3c/webmcp-polyfill
```

```ts
import { installWebMCP } from '@w3c/webmcp-polyfill';

installWebMCP();
```

This package is now a thin wrapper over `@w3c/webmcp-polyfill`. Its
`installWebMCP()` installs the upstream polyfill and then adds declarative tools:
forms with `toolname` and `tooldescription` become tools. Keep it only for
declarative tools, until the upstream polyfill ships them. For transports,
prompts, resources, or MCP `outputSchema` support, use
[`@mcp-b/global`](../global/README.md), which includes this layer.

## License

MIT. The IIFE bundle (`dist/index.iife.js`) includes `@w3c/webmcp-polyfill`,
distributed under the Apache License 2.0 in `LICENSE.webmcp-polyfill`.
