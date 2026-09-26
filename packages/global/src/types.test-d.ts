import { expectTypeOf, test } from 'vitest';
import type { ModelContextTesting } from './index.js';

test('the testing shim exposes its compatibility methods', () => {
  expectTypeOf<ModelContextTesting['listTools']>().returns.toEqualTypeOf<
    Array<{ name: string; description: string; inputSchema?: string }>
  >();
  expectTypeOf<ModelContextTesting['executeTool']>().parameter(0).toEqualTypeOf<string>();
  expectTypeOf<ModelContextTesting['executeTool']>().parameter(1).toEqualTypeOf<string>();
  expectTypeOf<ModelContextTesting['executeTool']>().returns.toEqualTypeOf<
    Promise<string | null>
  >();
  expectTypeOf<Navigator['modelContextTesting']>().toEqualTypeOf<ModelContextTesting | undefined>();
});

test('declarative form extensions remain optional Web IDL members', () => {
  expectTypeOf<SubmitEvent['agentInvoked']>().toEqualTypeOf<boolean | undefined>();
  expectTypeOf<NonNullable<SubmitEvent['respondWith']>>()
    .parameter(0)
    .toEqualTypeOf<Promise<unknown>>();
  expectTypeOf<NonNullable<SubmitEvent['respondWith']>>().returns.toBeVoid();
});
