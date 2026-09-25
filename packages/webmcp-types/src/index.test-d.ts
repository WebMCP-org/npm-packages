import { expectTypeOf, test } from 'vitest';
import type {
  ChromeModelContext,
  ChromeModelContextExecuteToolOptions,
  ChromeModelContextExtensions,
  WebMCP,
  ModelContext,
  ModelContextExtensions,
  ModelContextGetToolOptions,
  ModelContextTesting,
  ModelContextTestingToolInfo,
  ModelContextWithExtensions,
  RegisteredTool,
  ToolListItem,
} from './index.js';

test('RegisteredTool.inputSchema spans both schema generations', () => {
  // webmcp#241: an object from Chrome >=154.0.8013, a serialized string before.
  expectTypeOf<RegisteredTool['inputSchema']>().toEqualTypeOf<object | string | undefined>();
});

test('ModelContext exposes the upstream producer API with optional runtime execution', () => {
  expectTypeOf<ModelContext['registerTool']>().returns.toEqualTypeOf<Promise<void>>();
  expectTypeOf<ModelContext['getTools']>()
    .parameter(0)
    .toEqualTypeOf<ModelContextGetToolOptions | undefined>();
  expectTypeOf<ModelContext['getTools']>().returns.toEqualTypeOf<Promise<RegisteredTool[]>>();
  expectTypeOf<NonNullable<ModelContext['executeTool']>>()
    .parameter(1)
    .toEqualTypeOf<object | undefined>();
  expectTypeOf<NonNullable<ModelContext['executeTool']>>().returns.toEqualTypeOf<
    Promise<string | null>
  >();

  // @ts-expect-error Unregistration is owned by the registration AbortSignal.
  expectTypeOf<ModelContext['unregisterTool']>().toBeNever();
});

test('ChromeModelContext keeps the legacy JSON-string overload', () => {
  expectTypeOf<ChromeModelContextExtensions['executeTool']>().toEqualTypeOf<
    | ((
        tool: RegisteredTool,
        inputArguments: string,
        options?: ChromeModelContextExecuteToolOptions
      ) => Promise<string | null>)
    | undefined
  >();

  const supportsBothExecuteToolInputs = (context: ChromeModelContext, tool: RegisteredTool) => {
    context.executeTool?.(tool, {});
    context.executeTool?.(tool, '{}');
  };
  expectTypeOf(supportsBothExecuteToolInputs).toBeFunction();
});

test('MCP-B extensions list tools without restoring removed compatibility methods', () => {
  expectTypeOf<ModelContextExtensions['listTools']>().returns.toEqualTypeOf<ToolListItem[]>();
  // @ts-expect-error unregisterTool is not part of the v5 extension contract.
  expectTypeOf<ModelContextExtensions['unregisterTool']>().toBeNever();
});

test('the Chromium testing shim retains its observable contract', () => {
  expectTypeOf<ModelContextTesting['listTools']>().returns.toEqualTypeOf<
    ModelContextTestingToolInfo[]
  >();
  expectTypeOf<ModelContextTesting['executeTool']>().parameter(0).toEqualTypeOf<string>();
  expectTypeOf<ModelContextTesting['executeTool']>().parameter(1).toEqualTypeOf<string>();
  expectTypeOf<ModelContextTesting['executeTool']>()
    .parameter(2)
    .toEqualTypeOf<ChromeModelContextExecuteToolOptions | undefined>();
  expectTypeOf<ModelContextTesting['executeTool']>().returns.toEqualTypeOf<
    Promise<string | null>
  >();
  // @ts-expect-error Fake cross-document results are not part of the compatibility surface.
  expectTypeOf<ModelContextTesting['getCrossDocumentScriptToolResult']>().toBeNever();
});

test('global declarations use the document-first API', () => {
  expectTypeOf<Document['modelContext']>().toEqualTypeOf<WebMCP.ModelContext | undefined>();
  expectTypeOf<Navigator['modelContext']>().toEqualTypeOf<ModelContext | undefined>();
  expectTypeOf<Navigator['modelContextTesting']>().toEqualTypeOf<ModelContextTesting | undefined>();
});

test('the ModelContext interface object brands values but is not constructible', () => {
  // The interface object only exists where the realm implements WebMCP, so the
  // global is declared possibly-undefined and `instanceof` needs a guard.
  expectTypeOf<NonNullable<typeof ModelContext>>().toMatchTypeOf<Function>();
  const hasModelContextBrand = (value: unknown) =>
    typeof ModelContext !== 'undefined' && value instanceof ModelContext;
  expectTypeOf(hasModelContextBrand).returns.toBeBoolean();

  const constructModelContext = () => {
    // @ts-expect-error WebMCP does not define a ModelContext constructor.
    return new ModelContext();
  };
  expectTypeOf(constructModelContext).toBeFunction();
});

test('global modelContext properties are readonly', () => {
  const assign = (documentRef: Document, navigatorRef: Navigator) => {
    // @ts-expect-error modelContext is a readonly Web IDL attribute.
    documentRef.modelContext = {} as ModelContext;
    // @ts-expect-error the deprecated alias is also readonly.
    navigatorRef.modelContext = {} as ModelContext;
  };
  expectTypeOf(assign).toBeFunction();
});

test('ModelContextWithExtensions replaces registration while preserving the core', () => {
  expectTypeOf<ModelContextWithExtensions>().toMatchTypeOf<ModelContext>();
  expectTypeOf<ModelContextWithExtensions['registerTool']>().toBeFunction();
  expectTypeOf<ModelContextWithExtensions['listTools']>().returns.toEqualTypeOf<ToolListItem[]>();
});
