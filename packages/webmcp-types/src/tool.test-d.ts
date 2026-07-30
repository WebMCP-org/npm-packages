import { expectTypeOf, test } from 'vitest';
import type { CallToolResult, ContentBlock, InputSchema } from './common.js';
import type {
  MaybePromise,
  ModelContextClient,
  ModelContextTool,
  ToolAnnotations,
  ToolDescriptor,
  ToolExecuteResultFromOutputSchema,
  ToolListItem,
  ToolResultFromOutputSchema,
  WebMcpToolAnnotations,
} from './tool.js';
import type { JsonSchemaForInference } from './json-schema.js';
import type { ModelContextCore, ModelContextRegisterToolOptions } from './model-context.js';
import type { Tool as McpTool } from '@modelcontextprotocol/server';

test('ToolDescriptor has required fields', () => {
  expectTypeOf<ToolDescriptor>().toHaveProperty('name');
  expectTypeOf<ToolDescriptor>().toHaveProperty('description');
  expectTypeOf<ToolDescriptor>().toHaveProperty('inputSchema');
  expectTypeOf<ToolDescriptor>().toHaveProperty('execute');
});

test('ToolDescriptor.execute accepts Record and returns MaybePromise<unknown> by default', () => {
  expectTypeOf<ToolDescriptor['execute']>().parameter(0).toEqualTypeOf<Record<string, unknown>>();
  expectTypeOf<ToolDescriptor['execute']>().parameter(1).toEqualTypeOf<ModelContextClient>();
  expectTypeOf<ToolDescriptor['execute']>().returns.toEqualTypeOf<MaybePromise<unknown>>();
});

test('ModelContextTool uses the standard one-argument promise callback', () => {
  expectTypeOf<ModelContextTool['execute']>().parameter(0).toEqualTypeOf<Record<string, unknown>>();
  expectTypeOf<Parameters<ModelContextTool['execute']>['length']>().toEqualTypeOf<1>();
  expectTypeOf<ModelContextTool['execute']>().returns.toEqualTypeOf<Promise<unknown>>();
});

test('ToolDescriptor supports strongly typed args and result via generics', () => {
  type SearchArgs = { query: string; limit?: number };
  type SearchResult = CallToolResult & {
    structuredContent: {
      query: string;
      total: number;
    };
  };

  expectTypeOf<ToolDescriptor<SearchArgs, SearchResult>['execute']>()
    .parameter(0)
    .toEqualTypeOf<SearchArgs>();
  expectTypeOf<ToolDescriptor<SearchArgs, SearchResult>['execute']>().returns.toEqualTypeOf<
    MaybePromise<SearchResult>
  >();
});

test('ToolDescriptor accepts both sync and async execute implementations', () => {
  const syncTool: ToolDescriptor<{ message: string }, CallToolResult, 'sync_echo'> = {
    name: 'sync_echo',
    description: 'Synchronous echo',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
    },
    execute(args) {
      return {
        content: [{ type: 'text', text: args.message }],
      };
    },
  };

  const asyncTool: ToolDescriptor<{ message: string }, CallToolResult, 'async_echo'> = {
    name: 'async_echo',
    description: 'Asynchronous echo',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
    },
    async execute(args) {
      return {
        content: [{ type: 'text', text: args.message }],
      };
    },
  };

  expectTypeOf(syncTool.execute).returns.toEqualTypeOf<MaybePromise<CallToolResult>>();
  expectTypeOf(asyncTool.execute).returns.toEqualTypeOf<MaybePromise<CallToolResult>>();
});

test('CallToolResult.content uses MCP v2 content blocks', () => {
  const strictBlock: ContentBlock = { type: 'text', text: 'ok' };

  const result: CallToolResult = {
    content: [strictBlock],
  };

  expectTypeOf(result.content).toEqualTypeOf<ContentBlock[]>();
});

test('ToolDescriptor supports literal tool names via generics', () => {
  expectTypeOf<
    ToolDescriptor<Record<string, never>, CallToolResult, 'health'>['name']
  >().toEqualTypeOf<'health'>();
});

test('ToolDescriptor.inputSchema supports InputSchema', () => {
  expectTypeOf<ToolDescriptor['inputSchema']>().toEqualTypeOf<InputSchema | undefined>();
});

test('InputSchema accepts the MCP v2 tool schema at the WebMCP boundary', () => {
  expectTypeOf<McpTool['inputSchema']>().toExtend<InputSchema>();
});

test('ToolDescriptor.outputSchema supports inferable JSON Schema', () => {
  expectTypeOf<ToolDescriptor>().toHaveProperty('outputSchema');
  expectTypeOf<Required<ToolDescriptor>['outputSchema']>().toEqualTypeOf<JsonSchemaForInference>();
});

test('ToolResultFromOutputSchema infers structuredContent for object output schemas', () => {
  type OutputSchema = {
    type: 'object';
    properties: {
      total: { type: 'integer' };
      status: { type: 'string'; enum: ['ok', 'error'] };
    };
    required: ['total'];
    additionalProperties: false;
  };

  type StructuredContent = ToolResultFromOutputSchema<OutputSchema>['structuredContent'];
  const structuredContent: NonNullable<StructuredContent> = {
    total: 1,
    status: 'ok',
  };

  expectTypeOf(structuredContent.total).toEqualTypeOf<number>();
  expectTypeOf(structuredContent.status).toEqualTypeOf<'ok' | 'error' | undefined>();
  expectTypeOf<StructuredContent>().toEqualTypeOf<{
    total: number;
    status?: 'ok' | 'error';
  }>();
});

test('ToolDescriptor.annotations is optional ToolAnnotations', () => {
  expectTypeOf<ToolDescriptor>().toHaveProperty('annotations');
  expectTypeOf<Required<ToolDescriptor>['annotations']>().toEqualTypeOf<ToolAnnotations>();
});

test('ToolAnnotations has optional behavioral hints', () => {
  expectTypeOf<ToolAnnotations>().toMatchTypeOf<{
    title?: string | undefined;
    destructiveHint?: boolean | undefined;
    readOnlyHint?: boolean | undefined;
    untrustedContentHint?: boolean | undefined;
    idempotentHint?: boolean | undefined;
    openWorldHint?: boolean | undefined;
  }>();
});

test('WebMcpToolAnnotations only contains standard boolean hints', () => {
  expectTypeOf<WebMcpToolAnnotations>().toEqualTypeOf<{
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  }>();
});

test('ToolListItem mirrors ToolDescriptor metadata without execute', () => {
  expectTypeOf<ToolListItem>().toHaveProperty('name');
  expectTypeOf<ToolListItem>().toHaveProperty('description');
  expectTypeOf<ToolListItem>().toHaveProperty('inputSchema');
  expectTypeOf<ToolListItem>().not.toHaveProperty('execute');
});

test('ToolListItem supports literal tool names via generics', () => {
  expectTypeOf<ToolListItem<'search'>['name']>().toEqualTypeOf<'search'>();
});

// ============================================================================
// Non-object outputSchema support
// ============================================================================

test('ToolResultFromOutputSchema requires string structuredContent for string schema', () => {
  type StringSchema = { type: 'string' };
  type Result = ToolResultFromOutputSchema<StringSchema>;
  expectTypeOf<Result['structuredContent']>().toEqualTypeOf<string>();
});

test('ToolResultFromOutputSchema requires array structuredContent for array schema', () => {
  type ArraySchema = { type: 'array'; items: { type: 'number' } };
  type Result = ToolResultFromOutputSchema<ArraySchema>;
  expectTypeOf<Result['structuredContent']>().toEqualTypeOf<number[]>();
});

test('ToolResultFromOutputSchema requires number structuredContent for number schema', () => {
  type NumberSchema = { type: 'number' };
  type Result = ToolResultFromOutputSchema<NumberSchema>;
  expectTypeOf<Result['structuredContent']>().toEqualTypeOf<number>();
});

test('ToolResultFromOutputSchema requires boolean structuredContent for boolean schema', () => {
  type BooleanSchema = { type: 'boolean' };
  type Result = ToolResultFromOutputSchema<BooleanSchema>;
  expectTypeOf<Result['structuredContent']>().toEqualTypeOf<boolean>();
});

test('ToolExecuteResultFromOutputSchema allows string return for string schema', () => {
  type StringSchema = { type: 'string' };
  type Result = ToolExecuteResultFromOutputSchema<StringSchema>;
  expectTypeOf<string>().toMatchTypeOf<Result>();
  expectTypeOf<ToolResultFromOutputSchema<StringSchema>>().toMatchTypeOf<Result>();
});

test('ToolExecuteResultFromOutputSchema allows number return for number schema', () => {
  type NumberSchema = { type: 'number' };
  type Result = ToolExecuteResultFromOutputSchema<NumberSchema>;
  expectTypeOf<number>().toMatchTypeOf<Result>();
  expectTypeOf<ToolResultFromOutputSchema<NumberSchema>>().toMatchTypeOf<Result>();
});

test('ToolExecuteResultFromOutputSchema allows boolean return for boolean schema', () => {
  type BooleanSchema = { type: 'boolean' };
  type Result = ToolExecuteResultFromOutputSchema<BooleanSchema>;
  expectTypeOf<boolean>().toMatchTypeOf<Result>();
  expectTypeOf<ToolResultFromOutputSchema<BooleanSchema>>().toMatchTypeOf<Result>();
});

test('ToolExecuteResultFromOutputSchema allows array return for array schema', () => {
  type ArraySchema = { type: 'array'; items: { type: 'number' } };
  type Result = ToolExecuteResultFromOutputSchema<ArraySchema>;
  expectTypeOf<number[]>().toMatchTypeOf<Result>();
  expectTypeOf<ToolResultFromOutputSchema<ArraySchema>>().toMatchTypeOf<Result>();
});

test('ToolExecuteResultFromOutputSchema rejects wrapped object results missing structuredContent', () => {
  type OutputSchema = {
    type: 'object';
    properties: {
      status: { type: 'string'; enum: ['ok', 'error'] };
      total: { type: 'number' };
    };
    required: ['status', 'total'];
  };

  type Result = ToolExecuteResultFromOutputSchema<OutputSchema>;

  // @ts-expect-error - outputSchema requires structuredContent when returning a wrapped result
  const wrappedWithoutStructured: Result = { content: [{ type: 'text', text: 'ok' }] };
  void wrappedWithoutStructured;
});

test('ToolExecuteResultFromOutputSchema rejects wrapped object results with invalid structuredContent enum', () => {
  type OutputSchema = {
    type: 'object';
    properties: {
      status: { type: 'string'; enum: ['ok', 'error'] };
    };
    required: ['status'];
  };

  type Result = ToolExecuteResultFromOutputSchema<OutputSchema>;

  // @ts-expect-error - structuredContent.status must satisfy enum
  const invalidEnum: Result = {
    content: [{ type: 'text', text: 'bad enum' }],
    structuredContent: { status: 'pending' },
  };
  void invalidEnum;
});

test('ToolExecuteResultFromOutputSchema rejects wrapped object results with missing required structuredContent keys', () => {
  type OutputSchema = {
    type: 'object';
    properties: {
      total: { type: 'number' };
      category: { type: 'string' };
    };
    required: ['total'];
  };

  type Result = ToolExecuteResultFromOutputSchema<OutputSchema>;

  // @ts-expect-error - structuredContent.total is required
  const missingRequiredKey: Result = {
    content: [{ type: 'text', text: 'missing key' }],
    structuredContent: { category: 'news' },
  };
  void missingRequiredKey;
});

test('ToolExecuteResultFromOutputSchema rejects wrapped object results with wrong structuredContent property types', () => {
  type OutputSchema = {
    type: 'object';
    properties: {
      total: { type: 'number' };
    };
    required: ['total'];
  };

  type Result = ToolExecuteResultFromOutputSchema<OutputSchema>;

  // @ts-expect-error - structuredContent.total must be number
  const wrongType: Result = {
    content: [{ type: 'text', text: 'wrong type' }],
    structuredContent: { total: '1' },
  };
  void wrongType;
});

test('ModelContextRegisterToolOptions accepts an optional AbortSignal', () => {
  expectTypeOf<ModelContextRegisterToolOptions>().toExtend<{ signal?: AbortSignal }>();
});

test('ModelContextCore.registerTool accepts an optional options argument', () => {
  type RegisterTool = ModelContextCore['registerTool'];
  expectTypeOf<RegisterTool>().parameter(1).toExtend<ModelContextRegisterToolOptions | undefined>();
});
