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
  ModelContextTestingPolyfillExtensions,
  ModelContextTestingToolInfo,
  ModelContextToolInfo,
  ModelContextToolRegistrationHandle,
  ModelContextWithExtensions,
  ToolCallEvent,
} from './index.js';
import type { ToolDescriptor, ToolListItem } from './tool.js';

// === Producer API ===
test('ModelContext.registerTool accepts ToolDescriptor and returns void', () => {
  const tool: ToolDescriptor & { inputSchema: InputSchema } = {
    name: 'health',
    title: 'Health',
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

test('ModelContext.registerTool accepts exposedTo options', () => {
  expectTypeOf<ModelContext['registerTool']>()
    .parameter(1)
    .toMatchTypeOf<{ signal?: AbortSignal; exposedTo?: string[] } | undefined>();
});

test('ModelContext.getTools returns native registered tool objects asynchronously', () => {
  expectTypeOf<ModelContext['getTools']>().returns.toEqualTypeOf<Promise<ModelContextToolInfo[]>>();
});

test('ModelContext.executeTool uses registered tool objects and JSON-string input', () => {
  expectTypeOf<ModelContext['executeTool']>().parameter(0).toEqualTypeOf<ModelContextToolInfo>();
  expectTypeOf<ModelContext['executeTool']>().parameter(1).toEqualTypeOf<string>();
  expectTypeOf<ModelContext['executeTool']>().returns.toEqualTypeOf<Promise<string | null>>();
});

test('ModelContext.unregisterTool accepts legacy string names', () => {
  expectTypeOf<ModelContext['unregisterTool']>().toBeCallableWith('health');
});

test('ModelContext.unregisterTool also accepts tool-like objects for compatibility', () => {
  expectTypeOf<ModelContext['unregisterTool']>().toBeCallableWith({ name: 'health' });
});

test('ModelContextToolRegistrationHandle exposes unregister()', () => {
  expectTypeOf<ModelContextToolRegistrationHandle['unregister']>().toBeCallableWith();
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

test('ModelContextTestingPolyfillExtensions.registerToolsChangedCallback accepts function callbacks', () => {
  expectTypeOf<ModelContextTestingPolyfillExtensions['registerToolsChangedCallback']>()
    .parameter(0)
    .toEqualTypeOf<() => void>();
});

test('ModelContextTesting.ontoolchange is nullable event handler', () => {
  expectTypeOf<ModelContextTesting['ontoolchange']>().toEqualTypeOf<
    ((this: ModelContextTesting, ev: Event) => unknown) | null
  >();
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
test('document.modelContext is typed as ModelContext', () => {
  expectTypeOf<Document['modelContext']>().toEqualTypeOf<ModelContext>();
});

test('navigator.modelContext is typed as deprecated ModelContext alias', () => {
  expectTypeOf<Navigator['modelContext']>().toEqualTypeOf<ModelContext>();
});

test('global modelContext properties are readonly', () => {
  const assertReadonlyGlobals = (documentRef: Document, navigatorRef: Navigator) => {
    // @ts-expect-error modelContext is a readonly Web IDL attribute.
    documentRef.modelContext = {} as ModelContext;
    // @ts-expect-error modelContext is a readonly Web IDL attribute.
    navigatorRef.modelContext = {} as ModelContext;
  };

  expectTypeOf(assertReadonlyGlobals).toBeFunction();
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
