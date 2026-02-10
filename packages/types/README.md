# @mcp-b/types

TypeScript type definitions for the [W3C Web Model Context API](https://github.com/nicolo-ribaudo/tc39-proposal-model-context-protocol) (`navigator.modelContext`).

Zero dependencies. Zero runtime. Just `.d.ts` declarations.

## Install

```bash
npm install @mcp-b/types
# or
pnpm add @mcp-b/types
```

## Usage

### Global types (automatic)

Simply installing the package adds `navigator.modelContext` to TypeScript's `Navigator` interface:

```typescript
// No import needed - types are globally augmented
navigator.modelContext.registerTool({
  name: 'search',
  description: 'Search the web',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
  execute: async ({ query }) => ({
    content: [{ type: 'text', text: `Results for: ${query}` }],
  }),
});
```

### Individual imports

```typescript
import type {
  ModelContext,
  ToolDescriptor,
  ResourceDescriptor,
  PromptDescriptor,
  CallToolResult,
} from '@mcp-b/types';
```

## Relationship to `@mcp-b/global`

| Package | Purpose |
|---------|---------|
| `@mcp-b/types` | Type definitions only - for libraries that need to type-check against the API |
| `@mcp-b/global` | Full polyfill runtime - implements `navigator.modelContext` with MCP transport |

Use `@mcp-b/types` when you only need types (e.g., building a library that accepts `ToolDescriptor`). Use `@mcp-b/global` when you need the actual polyfill.

## License

MIT
