import { expectTypeOf, test } from 'vitest';
import type { WebMCP } from 'webmcp-types';
import './index.js';

test('ModelContext is the non-constructible Web IDL interface object', () => {
  const context = document.modelContext;
  const modelContextConstructor = globalThis.ModelContext;
  if (modelContextConstructor !== undefined) {
    expectTypeOf(context instanceof modelContextConstructor).toEqualTypeOf<boolean>();
  }

  // @ts-expect-error The interface object is only for branding and instanceof.
  new ModelContext();

  expectTypeOf<typeof ModelContext>().toExtend<
    | (Function & {
        readonly prototype: WebMCP.ModelContext;
        [Symbol.hasInstance](
          value: Parameters<Function[typeof Symbol.hasInstance]>[0]
        ): value is WebMCP.ModelContext;
      })
    | undefined
  >();
});

test('declarative form extensions remain optional Web IDL members', () => {
  expectTypeOf<SubmitEvent['agentInvoked']>().toEqualTypeOf<boolean | undefined>();
  expectTypeOf<NonNullable<SubmitEvent['respondWith']>>()
    .parameter(0)
    .toEqualTypeOf<Promise<unknown>>();
  expectTypeOf<NonNullable<SubmitEvent['respondWith']>>().returns.toBeVoid();
});
