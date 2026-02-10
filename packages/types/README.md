# @mcp-b/types

TypeScript type definitions for the [W3C Web Model Context API](https://github.com/nicolo-ribaudo/tc39-proposal-model-context-protocol) (`navigator.modelContext`).

Zero dependencies. Zero runtime. Just `.d.ts` declarations.

## What's included

- Global `Navigator` augmentation (`navigator.modelContext`)
- Core descriptors: tools
- Content and result payload types (`ContentBlock`, `CallToolResult`, `ResourceContents`)
- Consumer API: `callTool`
- Tool-scoped elicitation types (`ElicitationParams`, `ElicitationResult`, `ToolExecutionContext`)
- Typed event surface (`ToolCallEvent`)
- Pure JSON Schema inference helpers (`JsonSchemaForInference`, `InferArgsFromInputSchema`, `ToolDescriptorFromSchema`, `ToolResultFromOutputSchema`)

## Install

```bash
npm install --save-dev @mcp-b/types
# or
pnpm add -D @mcp-b/types
```

If your published library exposes `@mcp-b/types` in its own `.d.ts` surface, install it as a production dependency instead of a dev dependency.

## Usage

### Enable global types

TypeScript does not always include global declarations from regular npm packages automatically.
Use one of the following activation methods:

1. Add to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["@mcp-b/types"]
  }
}
```

2. Add a triple-slash reference in a global `.d.ts` file:

```typescript
/// <reference types="@mcp-b/types" />
```

3. Add a type-only import in your app/library entry:

```typescript
import type {} from '@mcp-b/types';
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
  ModelContext,
  ToolExecutionContext,
  ToolDescriptor,
  ToolDescriptorFromSchema,
  ToolResultFromOutputSchema,
  TypedModelContext,
  CallToolResult,
} from '@mcp-b/types';
```

### Typed tool descriptors

```typescript
import type { ElicitationParams, ToolDescriptor } from '@mcp-b/types';

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
    const approval = await context.elicitInput({
      mode: 'form',
      message: 'Run search?',
      requestedSchema: {
        type: 'object',
        properties: {
          confirmed: { type: 'boolean' },
        },
        required: ['confirmed'],
      },
    } satisfies ElicitationParams);

    if (approval.action !== 'accept') {
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

```typescript
import type { JsonSchemaForInference } from '@mcp-b/types';

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
navigator.modelContext.registerTool({
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
    const confirmation = await context.elicitInput({
      mode: 'form',
      message: `Confirm deploy to ${environment}?`,
      requestedSchema: {
        type: 'object',
        properties: {
          confirm: { type: 'boolean' },
        },
        required: ['confirm'],
      },
    });

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
import type { CallToolResult, ToolDescriptor, TypedModelContext } from '@mcp-b/types';

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

## Relationship to `@mcp-b/global`

| Package | Purpose |
|---------|---------|
| `@mcp-b/types` | Type definitions only - for libraries that need to type-check against the API |
| `@mcp-b/global` | Full polyfill runtime - implements `navigator.modelContext` with MCP transport |

Use `@mcp-b/types` when you only need types (e.g., building a library that accepts `ToolDescriptor`). Use `@mcp-b/global` when you need the actual polyfill.

## License

MIT
