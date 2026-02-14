# @mcp-b/webmcp-types

Strict TypeScript type definitions for the WebMCP core API (`navigator.modelContext`).

Zero dependencies. Zero runtime. Just `.d.ts` declarations.

## What's included

- Global `Navigator` augmentation (`navigator.modelContext`)
- Core descriptors: tools
- Content and result payload types (`ContentBlock`, `CallToolResult`, `ResourceContents`)
- MCPB extension API types (`ModelContextExtensions`, including `callTool`)
- Tool execution client types (`ModelContextClient`, `ToolExecutionContext`)
- Typed event surface (`ToolCallEvent`)
- Pure JSON Schema inference helpers (`JsonSchemaForInference`, `InferArgsFromInputSchema`, `ToolDescriptorFromSchema`, `ToolResultFromOutputSchema`)

## Install

```bash
npm install --save-dev @mcp-b/webmcp-types
# or
pnpm add -D @mcp-b/webmcp-types
```

If your published library exposes `@mcp-b/webmcp-types` in its own `.d.ts` surface, install it as a production dependency instead of a dev dependency.

## Usage

### Enable global types

TypeScript does not always include global declarations from regular npm packages automatically.
Use one of the following activation methods:

1. Add to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["@mcp-b/webmcp-types"]
  }
}
```

2. Add a triple-slash reference in a global `.d.ts` file:

```typescript
/// <reference types="@mcp-b/webmcp-types" />
```

3. Add a type-only import in your app/library entry:

```typescript
import type {} from '@mcp-b/webmcp-types';
```

### Global API example

After activating the types, `navigator.modelContext` is available on `Navigator`:

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
  ElicitationParams,
  ElicitationResult,
  InferArgsFromInputSchema,
  JsonSchemaForInference,
  LooseContentBlock,
  MaybePromise,
  ModelContext,
  ModelContextClient,
  ModelContextExtensions,
  ToolExecutionContext,
  ToolDescriptor,
  ToolDescriptorFromSchema,
  ToolResultFromOutputSchema,
  TypedModelContext,
  CallToolResult,
} from '@mcp-b/webmcp-types';
```

### Sync or async execute handlers

`execute` can return a plain result or a `Promise`.

```typescript
import type { CallToolResult, ToolDescriptor } from '@mcp-b/webmcp-types';

const syncTool: ToolDescriptor<{ message: string }, CallToolResult, 'sync_echo'> = {
  name: 'sync_echo',
  description: 'Synchronous echo',
  inputSchema: {
    type: 'object',
    properties: { message: { type: 'string' } },
    required: ['message'],
  },
  execute(args) {
    return {
      content: [{ type: 'text', text: args.message }],
    };
  },
};
```

### Strict and loose content blocks

`CallToolResult.content` accepts strict MCP content blocks and pragmatic loose objects.

```typescript
import type { CallToolResult } from '@mcp-b/webmcp-types';

const result: CallToolResult = {
  content: [
    { type: 'text', text: 'strict block' },
    { text: 'loose block', data: 'opaque payload' },
  ],
};
```

### Typed tool descriptors

```typescript
import type { ToolDescriptor } from '@mcp-b/webmcp-types';

type SearchArgs = {
  query: string;
  limit?: number;
};

const searchTool: ToolDescriptor<SearchArgs> = {
  name: 'search',
  description: 'Search indexed docs',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'number' },
    },
    required: ['query'],
  },
  execute: async ({ query, limit }, context) => {
    const approval = await context.requestUserInteraction(async () => ({
      confirmed: true,
    }));

    if (
      typeof approval !== 'object' ||
      !approval ||
      !('confirmed' in approval) ||
      !approval.confirmed
    ) {
      return {
        content: [{ type: 'text', text: 'Search cancelled by user.' }],
      };
    }

    return {
      content: [{ type: 'text', text: `Searching for "${query}" (limit: ${limit ?? 10})` }],
    };
  },
};
```

### Pure JSON Schema inference (input + output)

Inference focuses on core keywords (`type`, `properties`, `required`, `items`, `enum`, `const`) and tolerates additional schema metadata.

```typescript
import type { JsonSchemaForInference } from '@mcp-b/webmcp-types';

const inputSchema = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    limit: { type: 'integer', minimum: 1, maximum: 50 },
  },
  required: ['query'],
  additionalProperties: false,
} as const satisfies JsonSchemaForInference;

const outputSchema = {
  type: 'object',
  properties: {
    total: { type: 'integer' },
    items: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['total'],
  additionalProperties: false,
} as const satisfies JsonSchemaForInference;

navigator.modelContext.registerTool({
  name: 'search',
  description: 'Search indexed docs',
  inputSchema,
  outputSchema,
  async execute(args) {
    // args is inferred as:
    // { query: string; limit?: number }
    return {
      content: [{ type: 'text', text: `Searching for ${args.query}` }],
      // structuredContent is inferred from outputSchema as:
      // { total: number; items?: string[] }
      structuredContent: {
        total: 1,
        items: [args.query],
      },
    };
  },
});
```

If your schema is not a literal (for example loaded from runtime config), inference safely falls back to `Record<string, unknown>`.

### Tool-scoped elicitation

```typescript
import type { ModelContextExtensions } from '@mcp-b/webmcp-types';

const modelContext = navigator.modelContext as Navigator['modelContext'] & ModelContextExtensions;

modelContext.registerTool({
  name: 'deploy',
  description: 'Deploy current build',
  inputSchema: {
    type: 'object',
    properties: {
      environment: { type: 'string' },
    },
    required: ['environment'],
  },
  async execute({ environment }, context) {
    const confirmation = await context.requestUserInteraction(async () => ({
      action: 'accept',
      content: { confirm: true },
    }));

    if (confirmation.action !== 'accept' || !confirmation.content?.confirm) {
      return {
        content: [{ type: 'text', text: 'Deployment cancelled.' }],
      };
    }

    return {
      content: [{ type: 'text', text: `Deployment started for ${environment}.` }],
    };
  },
};
```

### Name-aware typed context (advanced)

```typescript
import type { CallToolResult, ToolDescriptor, TypedModelContext } from '@mcp-b/webmcp-types';

type SearchTool = ToolDescriptor<
  { query: string },
  CallToolResult & { structuredContent: { total: number } },
  'search'
>;

type PingTool = ToolDescriptor<Record<string, never>, CallToolResult, 'ping'>;

type AppModelContext = TypedModelContext<readonly [SearchTool, PingTool]>;
declare const modelContext: AppModelContext;

const searchResult = await modelContext.callTool({
  name: 'search',
  arguments: { query: 'webmcp' },
});
// searchResult is inferred from the 'search' tool result type.

await modelContext.callTool({ name: 'ping' });
// 'ping' arguments are optional because the args type is Record<string, never>.
```

## Relationship to Runtime Packages

| Package | Purpose |
|---------|---------|
| `@mcp-b/webmcp-types` | Type definitions only - for libraries that need to type-check against the API |
| `@mcp-b/webmcp-polyfill` | Strict core runtime polyfill for `navigator.modelContext` |
| `@mcp-b/global` | Full MCPB runtime (core + bridge extensions like `callTool`, prompts, resources) |

Use `@mcp-b/webmcp-types` when you only need types (e.g., building a library that accepts `ToolDescriptor`). Use `@mcp-b/webmcp-polyfill` for strict core runtime behavior, or `@mcp-b/global` for extension-heavy bridge workflows.

## License

MIT
