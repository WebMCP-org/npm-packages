import { expectTypeOf, test } from 'vitest';
import type {
  CallToolResult,
  ElicitationParams,
  ElicitationResult,
  InputSchema,
} from './common.js';
import type {
  ToolAnnotations,
  ToolDescriptor,
  ToolExecutionContext,
  ToolListItem,
} from './tool.js';

test('ToolDescriptor has required fields', () => {
  expectTypeOf<ToolDescriptor>().toHaveProperty('name');
  expectTypeOf<ToolDescriptor>().toHaveProperty('description');
  expectTypeOf<ToolDescriptor>().toHaveProperty('inputSchema');
  expectTypeOf<ToolDescriptor>().toHaveProperty('execute');
});

test('ToolDescriptor.execute accepts Record and returns Promise<CallToolResult>', () => {
  expectTypeOf<ToolDescriptor['execute']>().parameter(0).toEqualTypeOf<Record<string, unknown>>();
  expectTypeOf<ToolDescriptor['execute']>().parameter(1).toEqualTypeOf<ToolExecutionContext>();
  expectTypeOf<ToolDescriptor['execute']>().returns.toEqualTypeOf<Promise<CallToolResult>>();
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
    Promise<SearchResult>
  >();
});

test('ToolDescriptor supports literal tool names via generics', () => {
  expectTypeOf<
    ToolDescriptor<Record<string, never>, CallToolResult, 'health'>['name']
  >().toEqualTypeOf<'health'>();
});

test('ToolDescriptor.inputSchema is InputSchema', () => {
  expectTypeOf<ToolDescriptor['inputSchema']>().toEqualTypeOf<InputSchema>();
});

test('ToolDescriptor.outputSchema is optional InputSchema', () => {
  expectTypeOf<ToolDescriptor>().toHaveProperty('outputSchema');
  expectTypeOf<Required<ToolDescriptor>['outputSchema']>().toEqualTypeOf<InputSchema>();
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
