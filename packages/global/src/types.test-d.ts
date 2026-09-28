import { expectTypeOf, test } from 'vitest';
import './index.js';

test('declarative form extensions remain optional Web IDL members', () => {
  expectTypeOf<SubmitEvent['agentInvoked']>().toEqualTypeOf<boolean | undefined>();
  expectTypeOf<NonNullable<SubmitEvent['respondWith']>>()
    .parameter(0)
    .toEqualTypeOf<Promise<unknown>>();
  expectTypeOf<NonNullable<SubmitEvent['respondWith']>>().returns.toBeVoid();
});
