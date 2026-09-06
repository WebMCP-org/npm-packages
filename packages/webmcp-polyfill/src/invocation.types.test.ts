import { expectTypeOf, it } from 'vitest';
import {
  invoke,
  type InputAdapter,
  type InvocationConfig,
  type InvocationResult,
} from './invocation.js';

it('requires validation when the executor needs a different input type', () => {
  const tool = { name: 'typed_input', instanceId: 'typed-input-1' };
  const execute = (input: { count: number }) => input.count + 1;

  // @ts-expect-error A string input cannot reach a number executor without an adapter.
  const invalid: InvocationConfig<{ count: string }, { count: number }, number> = { tool, execute };
  void invalid;

  const narrow: InvocationConfig<{ count: string | number }, { count: string | number }, number> = {
    tool,
    // @ts-expect-error Method bivariance must not accept an executor narrower than its validated input.
    execute,
  };
  void narrow;

  const narrowAdapter: InputAdapter<{ count: string | number }, { count: number }> = {
    // @ts-expect-error An adapter must accept every input its public type allows.
    validate: (input: { count: string }) => ({ count: Number(input.count.trim()) }),
  };
  void narrowAdapter;

  // @ts-expect-error Inferred calls need the same adapter as explicitly typed configurations.
  void invoke({ tool, execute }, { count: '3' });

  const valid: InvocationConfig<{ count: string }, { count: number }, number> = {
    tool,
    input: { validate: (input) => ({ count: Number(input.count) }) },
    execute,
  };
  expectTypeOf(invoke(valid, { count: '3' })).toEqualTypeOf<Promise<InvocationResult<number>>>();
  expectTypeOf(invoke({ tool, execute }, { count: 3 })).toEqualTypeOf<
    Promise<InvocationResult<number>>
  >();
});
