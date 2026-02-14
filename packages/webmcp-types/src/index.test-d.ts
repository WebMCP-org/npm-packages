import { expectTypeOf, test } from 'vitest';
import type { CallToolResult, InputSchema } from './common.js';
import type {
  LooseContentBlock,
  MaybePromise,
  ModelContext,
  ModelContextExtensions,
  ModelContextInput,
  ModelContextTesting,
  ModelContextTestingExecuteToolOptions,
  ModelContextTestingToolInfo,
  ModelContextWithExtensions,
  ToolCallEvent,
} from './index.js';
import type { ToolDescriptor, ToolListItem } from './tool.js';

// === Producer API ===
test('ModelContext.registerTool accepts ToolDescriptor and returns void', () => {
  const tool: ToolDescriptor & { inputSchema: InputSchema } = {
    name: 'health',
    description: 'Health check',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    async execute() {
      return {
        content: [{ type: 'text', text: 'ok' }],
      };
    },
  };

  expectTypeOf<ModelContext['registerTool']>().toBeCallableWith(tool);
  expectTypeOf<ModelContext['registerTool']>().returns.toEqualTypeOf<void>();
});

test('ModelContext.unregisterTool accepts name string', () => {
  expectTypeOf<ModelContext['unregisterTool']>().parameter(0).toEqualTypeOf<string>();
});

test('ModelContextExtensions.listTools returns ToolListItem[]', () => {
  expectTypeOf<ModelContextExtensions['listTools']>().returns.toEqualTypeOf<ToolListItem[]>();
});

test('ModelContext.provideContext accepts optional ModelContextInput', () => {
  expectTypeOf<ModelContext['provideContext']>()
    .parameter(0)
    .toEqualTypeOf<ModelContextInput | undefined>();
});

// === Consumer API ===
test('ModelContextExtensions.callTool returns Promise<CallToolResult>', () => {
  expectTypeOf<ModelContextExtensions['callTool']>().returns.toEqualTypeOf<
    Promise<CallToolResult>
  >();
});

test('ModelContextTesting.executeTool uses JSON-string input and returns Promise<string | null>', () => {
  expectTypeOf<ModelContextTesting['executeTool']>().parameter(0).toEqualTypeOf<string>();
  expectTypeOf<ModelContextTesting['executeTool']>().parameter(1).toEqualTypeOf<string>();
  expectTypeOf<ModelContextTesting['executeTool']>()
    .parameter(2)
    .toEqualTypeOf<ModelContextTestingExecuteToolOptions | undefined>();
  expectTypeOf<ModelContextTesting['executeTool']>().returns.toEqualTypeOf<
    Promise<string | null>
  >();
});

test('ModelContextTesting.listTools returns ModelContextTestingToolInfo[]', () => {
  expectTypeOf<ModelContextTesting['listTools']>().returns.toEqualTypeOf<
    ModelContextTestingToolInfo[]
  >();
});

test('ModelContextTesting.registerToolsChangedCallback accepts function callbacks', () => {
  expectTypeOf<ModelContextTesting['registerToolsChangedCallback']>()
    .parameter(0)
    .toEqualTypeOf<() => void>();
});

test('ModelContextTesting.getCrossDocumentScriptToolResult returns Promise<string>', () => {
  expectTypeOf<ModelContextTesting['getCrossDocumentScriptToolResult']>().returns.toEqualTypeOf<
    Promise<string>
  >();
});

// === General ===
test('ModelContext.clearContext returns void', () => {
  expectTypeOf<ModelContext['clearContext']>().returns.toEqualTypeOf<void>();
});

// === Events ===
test('ToolCallEvent extends Event with name, arguments, respondWith', () => {
  expectTypeOf<ToolCallEvent>().toMatchTypeOf<Event>();
  expectTypeOf<ToolCallEvent>().toHaveProperty('name');
  expectTypeOf<ToolCallEvent>().toHaveProperty('arguments');
  expectTypeOf<ToolCallEvent>().toHaveProperty('respondWith');
});

// === Global augmentation ===
test('navigator.modelContext is typed as ModelContext', () => {
  expectTypeOf<Navigator['modelContext']>().toEqualTypeOf<ModelContext>();
});

test('ModelContextWithExtensions composes strict core and extension methods', () => {
  expectTypeOf<ModelContextWithExtensions['provideContext']>().toBeCallableWith(undefined);
  expectTypeOf<ModelContextWithExtensions['listTools']>().returns.toEqualTypeOf<ToolListItem[]>();
});

test('navigator.modelContextTesting is typed as optional ModelContextTesting', () => {
  expectTypeOf<Navigator['modelContextTesting']>().toEqualTypeOf<ModelContextTesting | undefined>();
});

test('index re-exports helper types for permissive results', () => {
  expectTypeOf<MaybePromise<CallToolResult>>().toEqualTypeOf<
    CallToolResult | Promise<CallToolResult>
  >();
  expectTypeOf<LooseContentBlock>().toMatchTypeOf<Record<string, unknown>>();
});
