import { expectTypeOf, test } from 'vitest';
import type {
  CallToolResult,
  ContentBlock,
  ElicitationParams,
  ElicitationResult,
  InputSchema,
  LooseContentBlock,
} from './common.js';
import type {
  MaybePromise,
  ModelContextClient,
  ToolAnnotations,
  ToolDescriptor,
  ToolExecuteResultFromOutputSchema,
  ToolExecutionContext,
  ToolListItem,
  ToolResultFromOutputSchema,
} from './tool.js';

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

test('ToolExecutionContext.elicitInput accepts ElicitationParams and returns ElicitationResult', () => {
  expectTypeOf<ToolExecutionContext['elicitInput']>()
    .parameter(0)
    .toEqualTypeOf<ElicitationParams>();
  expectTypeOf<ToolExecutionContext['elicitInput']>().returns.toEqualTypeOf<
    Promise<ElicitationResult>
  >();
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

test('CallToolResult.content accepts strict and loose content blocks', () => {
  const strictBlock: ContentBlock = { type: 'text', text: 'ok' };
  const looseBlock: LooseContentBlock = { text: 'legacy', data: 'opaque' };

  const result: CallToolResult = {
    content: [strictBlock, looseBlock],
  };

  expectTypeOf(result.content).toEqualTypeOf<Array<ContentBlock | LooseContentBlock>>();
});

test('ToolDescriptor supports literal tool names via generics', () => {
  expectTypeOf<
    ToolDescriptor<Record<string, never>, CallToolResult, 'health'>['name']
  >().toEqualTypeOf<'health'>();
});

test('ToolDescriptor.inputSchema supports InputSchema', () => {
  expectTypeOf<ToolDescriptor['inputSchema']>().toEqualTypeOf<InputSchema | undefined>();
});

test('ToolDescriptor.outputSchema supports InputSchema', () => {
  expectTypeOf<ToolDescriptor>().toHaveProperty('outputSchema');
  expectTypeOf<Required<ToolDescriptor>['outputSchema']>().toEqualTypeOf<InputSchema>();
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
  expectTypeOf<StructuredContent>().toMatchTypeOf<
    | {
        total: number;
        status?: 'ok' | 'error';
      }
    | undefined
  >();
});

test('ToolDescriptor.annotations is optional ToolAnnotations', () => {
  expectTypeOf<ToolDescriptor>().toHaveProperty('annotations');
  expectTypeOf<Required<ToolDescriptor>['annotations']>().toEqualTypeOf<ToolAnnotations>();
});

test('ToolAnnotations has optional behavioral hints', () => {
  expectTypeOf<ToolAnnotations>().toMatchTypeOf<{
    title?: string;
    destructiveHint?: boolean | 'true' | 'false';
    readOnlyHint?: boolean | 'true' | 'false';
    idempotentHint?: boolean | 'true' | 'false';
    openWorldHint?: boolean | 'true' | 'false';
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

test('ToolResultFromOutputSchema returns plain CallToolResult for string schema', () => {
  type StringSchema = { type: 'string' };
  type Result = ToolResultFromOutputSchema<StringSchema>;
  expectTypeOf<Result>().toEqualTypeOf<CallToolResult>();
});

test('ToolResultFromOutputSchema returns plain CallToolResult for array schema', () => {
  type ArraySchema = { type: 'array'; items: { type: 'number' } };
  type Result = ToolResultFromOutputSchema<ArraySchema>;
  expectTypeOf<Result>().toEqualTypeOf<CallToolResult>();
});

test('ToolResultFromOutputSchema returns plain CallToolResult for number schema', () => {
  type NumberSchema = { type: 'number' };
  type Result = ToolResultFromOutputSchema<NumberSchema>;
  expectTypeOf<Result>().toEqualTypeOf<CallToolResult>();
});

test('ToolResultFromOutputSchema returns plain CallToolResult for boolean schema', () => {
  type BooleanSchema = { type: 'boolean' };
  type Result = ToolResultFromOutputSchema<BooleanSchema>;
  expectTypeOf<Result>().toEqualTypeOf<CallToolResult>();
});

test('ToolExecuteResultFromOutputSchema allows string return for string schema', () => {
  type StringSchema = { type: 'string' };
  type Result = ToolExecuteResultFromOutputSchema<StringSchema>;
  expectTypeOf<string>().toMatchTypeOf<Result>();
  expectTypeOf<CallToolResult>().toMatchTypeOf<Result>();
});

test('ToolExecuteResultFromOutputSchema allows number return for number schema', () => {
  type NumberSchema = { type: 'number' };
  type Result = ToolExecuteResultFromOutputSchema<NumberSchema>;
  expectTypeOf<number>().toMatchTypeOf<Result>();
  expectTypeOf<CallToolResult>().toMatchTypeOf<Result>();
});

test('ToolExecuteResultFromOutputSchema allows boolean return for boolean schema', () => {
  type BooleanSchema = { type: 'boolean' };
  type Result = ToolExecuteResultFromOutputSchema<BooleanSchema>;
  expectTypeOf<boolean>().toMatchTypeOf<Result>();
  expectTypeOf<CallToolResult>().toMatchTypeOf<Result>();
});

test('ToolExecuteResultFromOutputSchema allows array return for array schema', () => {
  type ArraySchema = { type: 'array'; items: { type: 'number' } };
  type Result = ToolExecuteResultFromOutputSchema<ArraySchema>;
  expectTypeOf<number[]>().toMatchTypeOf<Result>();
  expectTypeOf<CallToolResult>().toMatchTypeOf<Result>();
});
