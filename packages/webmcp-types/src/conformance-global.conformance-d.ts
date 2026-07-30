import { expectTypeOf, test } from 'vitest';
import type { WebModelContextInitOptions } from '../../global/src/types.js';
import type {
  ChromeModelContext,
  ModelContext,
  ModelContextTesting,
  ModelContextWithExtensions,
} from './model-context.js';

type IsAssignable<TFrom, TTo> = TFrom extends TTo ? true : false;
type Assert<T extends true> = T;

/**
 * @mcp-b/global consumes these canonical types instead of maintaining a second
 * browser contract. Keep this fixture focused on the globals and composition
 * seams that the global runtime relies on.
 */
export type GlobalConformanceChecks = [
  Assert<IsAssignable<Document['modelContext'], ModelContext>>,
  Assert<IsAssignable<ModelContext, Document['modelContext']>>,
  Assert<IsAssignable<Navigator['modelContext'], ModelContext | undefined>>,
  Assert<IsAssignable<Navigator['modelContextTesting'], ModelContextTesting | undefined>>,
  Assert<IsAssignable<ModelContextWithExtensions, ModelContext>>,
  Assert<IsAssignable<undefined, ChromeModelContext['executeTool']>>,
  Assert<
    IsAssignable<
      WebModelContextInitOptions['installTestingShim'],
      boolean | 'always' | 'if-missing' | undefined
    >
  >,
];

test('global conformance checks compile', () => {
  expectTypeOf<true>().toEqualTypeOf<true>();
});
