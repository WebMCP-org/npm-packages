import { expectTypeOf, test } from 'vitest';
import type {
  CallToolResult,
  ContentBlock,
  InputSchema,
  MaybePromise,
  ModelContextRegisterToolOptions,
  ModelContextTool,
  ToolAnnotations,
  ToolDescriptor,
  ToolExecuteCallbackOptions,
  ToolListItem,
  ToolResultFromOutputSchema,
  WebMcpToolInput,
  WebMcpToolAnnotations,
} from './index.js';
import type { Tool as McpTool } from '@modelcontextprotocol/server';

declare const mcpSchema: McpTool['inputSchema'];

test('the standard callback accepts synchronous and asynchronous results', () => {
  const syncTool: ModelContextTool<{ value: number }, number> = {
    name: 'sync',
    description: 'Sync tool',
    execute: ({ value }) => value,
  };
  const asyncTool: ModelContextTool<{ value: number }, number> = {
    name: 'async',
    description: 'Async tool',
    execute: async ({ value }) => value,
  };

  expectTypeOf(syncTool.execute).returns.toEqualTypeOf<MaybePromise<number>>();
  expectTypeOf(asyncTool.execute).returns.toEqualTypeOf<MaybePromise<number>>();
  expectTypeOf<Parameters<ModelContextTool['execute']>['length']>().toEqualTypeOf<1 | 2>();
});

test('the execute options bag is optional and carries the cancellation signal', () => {
  const cancellable: ModelContextTool<{ value: number }, number> = {
    name: 'cancellable',
    description: 'Reads the signal when the platform passes one',
    execute: ({ value }, options) => (options?.signal.aborted ? -1 : value),
  };

  expectTypeOf(cancellable.execute)
    .parameter(1)
    .toEqualTypeOf<ToolExecuteCallbackOptions | undefined>();
  expectTypeOf<ToolExecuteCallbackOptions['signal']>().toEqualTypeOf<AbortSignal>();
});

test('the MCP-B descriptor keeps the standard callback shape', () => {
  expectTypeOf<ToolDescriptor['execute']>().parameter(0).toEqualTypeOf<Record<string, unknown>>();
  expectTypeOf<ToolDescriptor['execute']>()
    .parameter(1)
    .toEqualTypeOf<ToolExecuteCallbackOptions | undefined>();
  expectTypeOf<Parameters<ToolDescriptor['execute']>['length']>().toEqualTypeOf<1 | 2>();
  expectTypeOf<ToolDescriptor['execute']>().returns.toEqualTypeOf<unknown>();
});

test('tool descriptors preserve explicit input, output, and name types', () => {
  type SearchResult = CallToolResult & { structuredContent: { total: number } };
  type SearchTool = ToolDescriptor<{ query: string }, SearchResult, 'search'>;

  expectTypeOf<SearchTool['name']>().toEqualTypeOf<'search'>();
  expectTypeOf<SearchTool['execute']>().parameter(0).toEqualTypeOf<{ query: string }>();
  expectTypeOf<SearchTool['execute']>().returns.toEqualTypeOf<MaybePromise<SearchResult>>();
});

test('WebMCP tool inputs can be objects or arrays', () => {
  expectTypeOf<ModelContextTool<number[]>['execute']>().parameter(0).toEqualTypeOf<number[]>();
  expectTypeOf<ToolDescriptor<number[]>['execute']>().parameter(0).toEqualTypeOf<number[]>();
});

test('tool callbacks cannot narrow the declared input', () => {
  const narrow = (input: { query: string }) => input.query;
  const standard: ModelContextTool<WebMcpToolInput> = {
    name: 'standard',
    description: 'Standard tool',
    // @ts-expect-error the runtime may pass any WebMCP object.
    execute: narrow,
  };
  const extended: ToolDescriptor<WebMcpToolInput> = {
    name: 'extended',
    description: 'Extended tool',
    // @ts-expect-error the runtime may pass any WebMCP object.
    execute: narrow,
  };
  void [standard, extended];
});

test('CallToolResult content uses the upstream MCP union', () => {
  const content: ContentBlock = { type: 'text', text: 'ok' };
  const result: CallToolResult = { content: [content] };
  expectTypeOf(result.content).toEqualTypeOf<ContentBlock[]>();
});

test('InputSchema accepts MCP wire schemas and readonly JSON Schema literals', () => {
  const acceptWebSchema = (_schema: InputSchema) => {};
  acceptWebSchema(mcpSchema);

  const schema = {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  } as const satisfies InputSchema;
  expectTypeOf(schema.type).toEqualTypeOf<'object'>();
});

test('standard and extended annotations stay distinct', () => {
  expectTypeOf<WebMcpToolAnnotations>().toEqualTypeOf<{
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  }>();
  expectTypeOf<ToolAnnotations>().toMatchTypeOf<{
    title?: string | undefined;
    destructiveHint?: boolean | undefined;
    idempotentHint?: boolean | undefined;
    openWorldHint?: boolean | undefined;
    readOnlyHint?: boolean | undefined;
    untrustedContentHint?: boolean;
  }>();
});

test('output schemas narrow wrapped structured content', () => {
  type Result = ToolResultFromOutputSchema<{
    type: 'object';
    properties: {
      total: { type: 'integer' };
      status: { type: 'string'; enum: ['ok', 'error'] };
    };
    required: ['total'];
    additionalProperties: false;
  }>;

  expectTypeOf<Result['structuredContent']>().toEqualTypeOf<{
    total: number;
    status?: 'ok' | 'error';
  }>();
  expectTypeOf<
    ToolResultFromOutputSchema<{ type: 'array'; items: { type: 'number' } }>['structuredContent']
  >().toEqualTypeOf<number[]>();
});

test('list items expose metadata without execution', () => {
  expectTypeOf<ToolListItem<'search'>['name']>().toEqualTypeOf<'search'>();
  expectTypeOf<ToolListItem>().toHaveProperty('inputSchema');
  expectTypeOf<ToolListItem>().not.toHaveProperty('execute');
});

test('registration options expose signal and origin controls', () => {
  expectTypeOf<ModelContextRegisterToolOptions>().toEqualTypeOf<{
    signal?: AbortSignal;
    exposedTo?: string[];
  }>();
});
