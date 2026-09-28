import { expectTypeOf, test } from 'vitest';
import type {
  WebMCP,
  ModelContext,
  ModelContextExtensions,
  ModelContextGetToolOptions,
  ModelContextWithExtensions,
  RegisteredTool,
  ToolListItem,
} from './index.js';

test('core contracts come directly from upstream WebMCP', () => {
  expectTypeOf<RegisteredTool>().toEqualTypeOf<WebMCP.RegisteredTool>();
  expectTypeOf<ModelContext>().toEqualTypeOf<WebMCP.ModelContext>();
});

test('ModelContext exposes the upstream producer API with object-input execution', () => {
  expectTypeOf<ModelContext['registerTool']>().returns.toEqualTypeOf<Promise<void>>();
  expectTypeOf<ModelContext['getTools']>()
    .parameter(0)
    .toEqualTypeOf<ModelContextGetToolOptions | undefined>();
  expectTypeOf<ModelContext['getTools']>().returns.toEqualTypeOf<Promise<RegisteredTool[]>>();
  expectTypeOf<ModelContext['executeTool']>().parameter(1).toEqualTypeOf<object | undefined>();
  expectTypeOf<ModelContext['executeTool']>().returns.toEqualTypeOf<Promise<string>>();

  // @ts-expect-error Unregistration is owned by the registration AbortSignal.
  expectTypeOf<ModelContext['unregisterTool']>().toBeNever();
});

test('MCP-B extensions list tools without restoring removed compatibility methods', () => {
  expectTypeOf<ModelContextExtensions['listTools']>().returns.toEqualTypeOf<ToolListItem[]>();
  // @ts-expect-error unregisterTool is not part of the v5 extension contract.
  expectTypeOf<ModelContextExtensions['unregisterTool']>().toBeNever();
});

test('global declarations use the document-first API', () => {
  expectTypeOf<Document['modelContext']>().toEqualTypeOf<WebMCP.ModelContext | undefined>();
});

test('global modelContext properties are readonly', () => {
  const assign = (documentRef: Document, context: ModelContext) => {
    // @ts-expect-error modelContext is a readonly Web IDL attribute.
    documentRef.modelContext = context;
  };
  expectTypeOf(assign).toBeFunction();
});

test('ModelContextWithExtensions replaces registration while preserving the core', () => {
  expectTypeOf<ModelContextWithExtensions>().toMatchTypeOf<ModelContext>();
  expectTypeOf<ModelContextWithExtensions['registerTool']>().toBeFunction();
  expectTypeOf<ModelContextWithExtensions['listTools']>().returns.toEqualTypeOf<ToolListItem[]>();
});
