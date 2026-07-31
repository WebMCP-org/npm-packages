import { expectTypeOf, test } from 'vitest';
import type { CallToolResult } from './common.js';
import type {
  ChromeModelContext,
  ChromeModelContextExecuteToolOptions,
  MaybePromise,
  ModelContext,
  ModelContextExtensions,
  ModelContextGetToolOptions,
  ModelContextTesting,
  ModelContextTestingExecuteToolOptions,
  ModelContextTestingToolInfo,
  ModelContextToolInfo,
  ModelContextWithExtensions,
  RegisteredTool,
} from './index.js';
import type { ToolListItem } from './tool.js';

// === Producer API ===
test('ModelContext.registerTool returns Promise<void>', () => {
  expectTypeOf<ModelContext['registerTool']>().returns.toEqualTypeOf<Promise<void>>();
});

test('ModelContext.registerTool accepts exposedTo options', () => {
  expectTypeOf<ModelContext['registerTool']>()
    .parameter(1)
    .toMatchTypeOf<{ signal?: AbortSignal; exposedTo?: string[] } | undefined>();
});

test('ModelContext.getTools accepts origin filters and returns registered tools asynchronously', () => {
  expectTypeOf<ModelContext['getTools']>()
    .parameter(0)
    .toEqualTypeOf<ModelContextGetToolOptions | undefined>();
  expectTypeOf<ModelContext['getTools']>().returns.toEqualTypeOf<Promise<RegisteredTool[]>>();
  expectTypeOf<ModelContextToolInfo>().toEqualTypeOf<RegisteredTool>();
});

test('ModelContext excludes Chromium experimental executeTool from the strict core', () => {
  // @ts-expect-error executeTool is an optional Chromium extension, not strict WebMCP core.
  expectTypeOf<ModelContext['executeTool']>().toBeNever();
});

test('ChromeModelContext exposes feature-detectable executeTool', () => {
  type ExecuteTool = NonNullable<ChromeModelContext['executeTool']>;
  expectTypeOf<ExecuteTool>().parameter(0).toEqualTypeOf<RegisteredTool>();
  expectTypeOf<ExecuteTool>().parameter(1).toEqualTypeOf<string>();
  expectTypeOf<ExecuteTool>()
    .parameter(2)
    .toEqualTypeOf<ChromeModelContextExecuteToolOptions | undefined>();
  expectTypeOf<ExecuteTool>().returns.toEqualTypeOf<Promise<string | null>>();
});

test('ModelContext does not expose legacy unregisterTool on the strict core surface', () => {
  // @ts-expect-error unregisterTool is an MCP-B compatibility extension, not strict WebMCP core.
  expectTypeOf<ModelContext['unregisterTool']>().toBeNever();
});

test('ModelContextExtensions.unregisterTool accepts legacy string names', () => {
  expectTypeOf<ModelContextExtensions['unregisterTool']>().toBeCallableWith('health');
});

test('ModelContextExtensions.unregisterTool also accepts tool-like objects for compatibility', () => {
  expectTypeOf<ModelContextExtensions['unregisterTool']>().toBeCallableWith({ name: 'health' });
});

test('ModelContextExtensions.listTools returns ToolListItem[]', () => {
  expectTypeOf<ModelContextExtensions['listTools']>().returns.toEqualTypeOf<ToolListItem[]>();
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

test('ModelContextTesting.ontoolchange is nullable event handler', () => {
  expectTypeOf<ModelContextTesting['ontoolchange']>().toEqualTypeOf<
    ((this: ModelContextTesting, ev: Event) => unknown) | null
  >();
});

test('ModelContextTesting.getCrossDocumentScriptToolResult is optional', () => {
  expectTypeOf<ModelContextTesting['getCrossDocumentScriptToolResult']>().toEqualTypeOf<
    (() => Promise<string>) | undefined
  >();
});

// === Events ===
// === Global augmentation ===
test('document.modelContext is typed as ModelContext', () => {
  expectTypeOf<Document['modelContext']>().toEqualTypeOf<ModelContext>();
});

test('global ModelContext exposes the Web IDL constructor value', () => {
  expectTypeOf<typeof globalThis.ModelContext>().toEqualTypeOf<{
    prototype: ModelContext;
    new (): ModelContext;
  }>();
  expectTypeOf<InstanceType<typeof globalThis.ModelContext>>().toEqualTypeOf<ModelContext>();
  const hasModelContextBrand = (
    context: ModelContext,
    constructor: typeof globalThis.ModelContext
  ) => context instanceof constructor;
  expectTypeOf(hasModelContextBrand).returns.toBeBoolean();
});

test('navigator.modelContext is typed as an optional deprecated alias', () => {
  expectTypeOf<Navigator['modelContext']>().toEqualTypeOf<ModelContext | undefined>();
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
  expectTypeOf<ModelContextWithExtensions>().toMatchTypeOf<ModelContext>();
  expectTypeOf<ModelContextWithExtensions['registerTool']>().toBeFunction();
  expectTypeOf<ModelContextWithExtensions['listTools']>().returns.toEqualTypeOf<ToolListItem[]>();
});

test('navigator.modelContextTesting is typed as optional ModelContextTesting', () => {
  expectTypeOf<Navigator['modelContextTesting']>().toEqualTypeOf<ModelContextTesting | undefined>();
});

test('index re-exports result helper types', () => {
  expectTypeOf<MaybePromise<CallToolResult>>().toEqualTypeOf<
    CallToolResult | Promise<CallToolResult>
  >();
});
