import { expectTypeOf, test } from 'vitest';
import type { CallToolResult, RegistrationHandle } from './common.js';
import type {
  LooseContentBlock,
  MaybePromise,
  ModelContext,
  ModelContextInput,
  ToolCallEvent,
} from './index.js';
import type { ToolDescriptor, ToolListItem } from './tool.js';

// === Producer API ===
test('ModelContext.registerTool accepts ToolDescriptor and returns RegistrationHandle', () => {
  const tool: ToolDescriptor = {
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
  expectTypeOf<ModelContext['registerTool']>().returns.toEqualTypeOf<RegistrationHandle>();
});

test('ModelContext.unregisterTool accepts name string', () => {
  expectTypeOf<ModelContext['unregisterTool']>().parameter(0).toEqualTypeOf<string>();
});

test('ModelContext.listTools returns ToolListItem[]', () => {
  expectTypeOf<ModelContext['listTools']>().returns.toEqualTypeOf<ToolListItem[]>();
});

test('ModelContext.provideContext accepts ModelContextInput', () => {
  expectTypeOf<ModelContext['provideContext']>().parameter(0).toEqualTypeOf<ModelContextInput>();
});

// === Consumer API ===
test('ModelContext.callTool returns Promise<CallToolResult>', () => {
  expectTypeOf<ModelContext['callTool']>().returns.toEqualTypeOf<Promise<CallToolResult>>();
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

test('index re-exports helper types for permissive results', () => {
  expectTypeOf<MaybePromise<CallToolResult>>().toEqualTypeOf<
    CallToolResult | Promise<CallToolResult>
  >();
  expectTypeOf<LooseContentBlock>().toMatchTypeOf<Record<string, unknown>>();
});
