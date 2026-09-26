import { expectTypeOf, test } from 'vitest';
import type { WebMCP } from 'webmcp-types';

test('ModelContext is the non-constructible Web IDL interface object', () => {
  const context = document.modelContext;
  if (typeof ModelContext !== 'undefined') {
    expectTypeOf(context instanceof ModelContext).toEqualTypeOf<boolean>();
  }

  // @ts-expect-error The interface object is only for branding and instanceof.
  new ModelContext();

  expectTypeOf<typeof ModelContext>().toExtend<
    | (Function & {
        readonly prototype: WebMCP.ModelContext;
        [Symbol.hasInstance](value: unknown): value is WebMCP.ModelContext;
      })
    | undefined
  >();
});
