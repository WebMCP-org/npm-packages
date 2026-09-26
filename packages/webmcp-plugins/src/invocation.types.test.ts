import { expectTypeOf, it } from 'vitest';
import { executionState } from './execution-state.js';
import {
  invoke,
  type InputAdapter,
  type AroundInvoke,
  type InvocationConfig,
  type InvocationResult,
  type WebMCPPlugin,
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

it('requires named plugins and preserves results through generic observers', () => {
  const tool = { name: 'named_plugin', instanceId: 'named-plugin-1' };
  const execute = () => 42;
  const aroundInvoke: AroundInvoke<number> = (_call, next) => next();
  const genericPlugin: WebMCPPlugin = {
    name: 'generic-observer',
    aroundInvoke: (_call, next) => next(),
  };
  expectTypeOf(invoke({ tool, execute, plugins: [genericPlugin] }, {})).toEqualTypeOf<
    Promise<InvocationResult<number>>
  >();
  expectTypeOf(executionState<number>()).toMatchTypeOf<WebMCPPlugin<number>>();
  const config: InvocationConfig<object, object, number> = {
    tool,
    execute,
    plugins: [{ name: 'observer', aroundInvoke }],
  };
  expectTypeOf(invoke(config, {})).toEqualTypeOf<Promise<InvocationResult<number>>>();

  const unnamed: InvocationConfig<object, object, number> = {
    tool,
    execute,
    // @ts-expect-error Bare middleware functions are no longer a plugin configuration.
    plugins: [aroundInvoke],
  };
  void unnamed;
  const oldConfig: InvocationConfig<object, object, number> = {
    tool,
    execute,
    // @ts-expect-error The old middleware option has no compatibility alias.
    middleware: [aroundInvoke],
  };
  void oldConfig;
  const mismatched: InvocationConfig<object, object, number> = {
    tool,
    execute,
    // @ts-expect-error A store restricted to strings cannot observe numeric tool results.
    plugins: [executionState<string>()],
  };
  void mismatched;
  // @ts-expect-error Inference cannot make a number-only observer accept string results.
  void invoke({ tool, execute: () => 'wrong', plugins: [executionState<number>()] }, {});

  expectTypeOf(invoke({ tool, execute, plugins: [executionState()] }, {})).toEqualTypeOf<
    Promise<InvocationResult<number>>
  >();
});

it('infers schema-transformed inputs and results with typed plugins in either property order', () => {
  const tool = { name: 'transformed_plugin', instanceId: 'transformed-plugin-1' };
  const input: InputAdapter<{ count: string }, { count: number }> = {
    validate: ({ count }) => ({ count: Number(count) }),
  };
  const before = invoke(
    {
      tool,
      input,
      plugins: [executionState<number>()],
      execute: ({ count }) => {
        expectTypeOf(count).toEqualTypeOf<number>();
        return count * 2;
      },
    },
    { count: '3' }
  );
  expectTypeOf(before).toEqualTypeOf<Promise<InvocationResult<number>>>();
  const after = invoke(
    {
      tool,
      input,
      execute: ({ count }) => count * 2,
      plugins: [executionState<number>()],
    },
    { count: '3' }
  );
  expectTypeOf(after).toEqualTypeOf<Promise<InvocationResult<number>>>();
  const generic = invoke(
    {
      tool,
      input,
      plugins: [executionState()],
      execute: async ({ count }) => {
        expectTypeOf(count).toEqualTypeOf<number>();
        return count * 2;
      },
    },
    { count: '3' }
  );
  expectTypeOf(generic).toEqualTypeOf<Promise<InvocationResult<number>>>();
});
