import { expectTypeOf, test } from 'vitest';
import type {
  CallToolResult as GlobalCallToolResult,
  ElicitationParams as GlobalElicitationParams,
  ElicitationResult as GlobalElicitationResult,
  InputSchema as GlobalInputSchema,
  ModelContext as GlobalModelContext,
  ModelContextInput as GlobalModelContextInput,
  ModelContextTesting as GlobalModelContextTesting,
  ModelContextTestingExecuteToolOptions as GlobalModelContextTestingExecuteToolOptions,
  ToolInfo as GlobalTestingToolInfo,
  ToolCallEvent as GlobalToolCallEvent,
  ToolDescriptor as GlobalToolDescriptor,
  ToolListItem as GlobalToolListItem,
} from '../../global/src/types.js';
import type {
  CallToolResult,
  ElicitationParams,
  ElicitationResult,
  InputSchema,
} from './common.js';
import type {
  ModelContext,
  ModelContextExtensions,
  ModelContextInput,
  ModelContextTesting,
  ModelContextTestingExecuteToolOptions,
  ModelContextTestingToolInfo,
  ModelContextWithExtensions,
  ToolCallEvent,
} from './model-context.js';
import type { ToolDescriptor, ToolListItem } from './tool.js';

type IsAssignable<TFrom, TTo> = TFrom extends TTo ? true : false;
type Assert<T extends true> = T;

type GlobalJsonToolDescriptor = GlobalToolDescriptor<Record<string, never>, Record<string, never>>;

export type GlobalConformanceChecks = [
  Assert<IsAssignable<InputSchema['type'], GlobalInputSchema['type']>>,
  Assert<IsAssignable<CallToolResult['content'], GlobalCallToolResult['content']>>,
  Assert<IsAssignable<ToolDescriptor['name'], GlobalJsonToolDescriptor['name']>>,
  Assert<IsAssignable<ToolDescriptor['description'], GlobalJsonToolDescriptor['description']>>,
  Assert<IsAssignable<ToolDescriptor['inputSchema'], GlobalInputSchema>>,
  Assert<
    IsAssignable<
      Parameters<ToolDescriptor<Record<string, unknown>, CallToolResult, string>['execute']>[0],
      Parameters<GlobalJsonToolDescriptor['execute']>[0]
    >
  >,
  Assert<
    IsAssignable<
      Parameters<ToolDescriptor<Record<string, unknown>, CallToolResult, string>['execute']>[1],
      { requestUserInteraction: (callback: () => Promise<unknown>) => Promise<unknown> }
    >
  >,
  Assert<IsAssignable<ToolListItem, GlobalToolListItem>>,
  Assert<IsAssignable<ElicitationParams, GlobalElicitationParams>>,
  Assert<IsAssignable<ElicitationResult, GlobalElicitationResult>>,
  Assert<IsAssignable<ModelContextInput, GlobalModelContextInput>>,
  Assert<IsAssignable<ToolCallEvent['name'], GlobalToolCallEvent['name']>>,
  Assert<IsAssignable<ToolCallEvent['arguments'], GlobalToolCallEvent['arguments']>>,
  Assert<
    IsAssignable<ModelContextTestingExecuteToolOptions, GlobalModelContextTestingExecuteToolOptions>
  >,
  Assert<
    IsAssignable<GlobalModelContextTestingExecuteToolOptions, ModelContextTestingExecuteToolOptions>
  >,
  Assert<IsAssignable<ModelContextTestingToolInfo, GlobalTestingToolInfo>>,
  Assert<IsAssignable<GlobalTestingToolInfo, ModelContextTestingToolInfo>>,
  Assert<
    IsAssignable<
      ReturnType<ModelContextWithExtensions['callTool']>,
      ReturnType<GlobalModelContext['callTool']>
    >
  >,
  Assert<
    IsAssignable<
      Parameters<ModelContextWithExtensions['callTool']>[0],
      Parameters<GlobalModelContext['callTool']>[0]
    >
  >,
  Assert<
    IsAssignable<
      ReturnType<ModelContextExtensions['listTools']>,
      ReturnType<GlobalModelContext['listTools']>
    >
  >,
  Assert<
    IsAssignable<
      ReturnType<ModelContext['registerTool']>,
      ReturnType<GlobalModelContext['registerTool']>
    >
  >,
  Assert<
    IsAssignable<
      ReturnType<ModelContextTesting['executeTool']>,
      ReturnType<GlobalModelContextTesting['executeTool']>
    >
  >,
  Assert<
    IsAssignable<
      Parameters<ModelContextTesting['executeTool']>[2],
      Parameters<GlobalModelContextTesting['executeTool']>[2]
    >
  >,
  Assert<
    IsAssignable<
      ReturnType<ModelContextTesting['listTools']>,
      ReturnType<GlobalModelContextTesting['listTools']>
    >
  >,
];

test('global conformance checks compile', () => {
  expectTypeOf<true>().toEqualTypeOf<true>();
});
