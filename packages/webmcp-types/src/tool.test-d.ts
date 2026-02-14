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

test('ToolDescriptor.execute accepts Record and returns MaybePromise<CallToolResult>', () => {
  expectTypeOf<ToolDescriptor['execute']>().parameter(0).toEqualTypeOf<Record<string, unknown>>();
  expectTypeOf<ToolDescriptor['execute']>().parameter(1).toEqualTypeOf<ModelContextClient>();
  expectTypeOf<ToolDescriptor['execute']>().returns.toEqualTypeOf<MaybePromise<CallToolResult>>();
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

test('ToolDescriptor.inputSchema is optional InputSchema', () => {
  expectTypeOf<ToolDescriptor['inputSchema']>().toEqualTypeOf<InputSchema | undefined>();
});

test('ToolDescriptor.outputSchema is optional InputSchema', () => {
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
    destructiveHint?: boolean;
    readOnlyHint?: boolean;
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
