import { expectTypeOf, test } from 'vitest';
import type { CallToolResult } from './common.js';
import type {
  InferPromptArgs,
  InferToolArgs,
  InferToolResult,
  PromptArgsByName,
  PromptName,
  ToolArgsByName,
  ToolCallParams,
  ToolName,
  ToolResultByName,
  TypedModelContext,
} from './index.js';
import type { PromptDescriptor } from './prompt.js';
import type { ToolDescriptor } from './tool.js';

type SearchTool = ToolDescriptor<
  { query: string; limit?: number },
  CallToolResult & {
    structuredContent: {
      total: number;
    };
  },
  'search'
>;
type PingTool = ToolDescriptor<Record<string, never>, CallToolResult, 'ping'>;
type ToolRegistry = readonly [SearchTool, PingTool];

type ReviewPrompt = PromptDescriptor<{ code: string }, 'review'>;
type HelpPrompt = PromptDescriptor<Record<string, never>, 'help'>;
type PromptRegistry = readonly [ReviewPrompt, HelpPrompt];

test('ToolName and PromptName extract literal name unions', () => {
  expectTypeOf<ToolName<ToolRegistry>>().toEqualTypeOf<'search' | 'ping'>();
  expectTypeOf<PromptName<PromptRegistry>>().toEqualTypeOf<'review' | 'help'>();
});

test('Tool and prompt inference helpers resolve descriptor shapes', () => {
  expectTypeOf<InferToolArgs<SearchTool>>().toEqualTypeOf<{ query: string; limit?: number }>();
  expectTypeOf<InferToolResult<SearchTool>>().toEqualTypeOf<
    CallToolResult & { structuredContent: { total: number } }
  >();
  expectTypeOf<ToolArgsByName<ToolRegistry, 'search'>>().toEqualTypeOf<{
    query: string;
    limit?: number;
  }>();
  expectTypeOf<ToolResultByName<ToolRegistry, 'search'>>().toEqualTypeOf<
    CallToolResult & { structuredContent: { total: number } }
  >();
  expectTypeOf<InferPromptArgs<ReviewPrompt>>().toEqualTypeOf<{ code: string }>();
  expectTypeOf<PromptArgsByName<PromptRegistry, 'review'>>().toEqualTypeOf<{ code: string }>();
});

test('ToolCallParams makes arguments optional only for empty arg objects', () => {
  const requiredArgsParams: ToolCallParams<'search', { query: string }> = {
    name: 'search',
    arguments: { query: 'mcp' },
  };
  const optionalArgsParams: ToolCallParams<'ping', Record<string, never>> = {
    name: 'ping',
  };

  expectTypeOf(requiredArgsParams).toMatchTypeOf<{
    name: 'search';
    arguments: { query: string };
  }>();
  expectTypeOf(optionalArgsParams).toMatchTypeOf<{
    name: 'ping';
    arguments?: Record<string, never>;
  }>();
});

test('TypedModelContext.callTool is name-aware for known registries', () => {
  type AppModelContext = TypedModelContext<ToolRegistry, PromptRegistry>;
  expectTypeOf<AppModelContext['callTool']>().toBeCallableWith({
    name: 'search',
    arguments: { query: 'mcp' },
  });
  expectTypeOf<AppModelContext['callTool']>().toBeCallableWith({ name: 'ping' });
});

test('TypedModelContext list methods keep literal names', () => {
  type AppModelContext = TypedModelContext<ToolRegistry, PromptRegistry>;
  type ListedToolName = ReturnType<AppModelContext['listTools']>[number]['name'];
  type ListedPromptName = ReturnType<AppModelContext['listPrompts']>[number]['name'];
  expectTypeOf<ListedToolName>().toEqualTypeOf<ToolName<ToolRegistry>>();
  expectTypeOf<ListedPromptName>().toEqualTypeOf<PromptName<PromptRegistry>>();
});
