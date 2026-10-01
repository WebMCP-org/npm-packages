# @mcp-b/webmcp-types

This package is a compatibility alias for the upstream
[`webmcp-types`](https://github.com/webmachinelearning/webmcp-types) package.
It forwards upstream type exports and browser declarations directly.

**This package will eventually be removed. Please use `webmcp-types` directly.**
There is no removal date yet.

## Migrate to upstream

```bash
pnpm remove @mcp-b/webmcp-types
pnpm add -D webmcp-types@0.1.9
```

Change the import to the upstream package:

```ts
import type { WebMCP } from 'webmcp-types';

const context: WebMCP.ModelContext | undefined = document.modelContext;
```

Also replace `@mcp-b/webmcp-types` with `webmcp-types` in TypeScript `types`
configuration and triple-slash references, if used. Published libraries whose
declarations reference these types should declare `webmcp-types` as a production
dependency.

## Compatibility

The alias exports the same `WebMCP` namespace as upstream. Existing consumers can
use it while migrating:

```ts
import type { WebMCP } from '@mcp-b/webmcp-types';
```

The previous package's top-level type exports are not reproduced. Use upstream
types such as `WebMCP.ModelContext` and `WebMCP.ModelContextTool`. MCP-B extension
types, including `ToolDescriptor` and `ModelContextWithExtensions`, now live in
[`@mcp-b/webmcp-ts-sdk`](../webmcp-ts-sdk/README.md).

See the [upstream README](https://github.com/webmachinelearning/webmcp-types#readme)
for the API and schema inference documentation.

## License

MIT.
