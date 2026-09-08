import { expect, it, vi } from 'vitest';
import {
  invoke,
  type AroundInvoke,
  type InvocationContext,
  type InvocationResult,
} from './invocation.js';

it('nests named plugins in declared order without using their names as identities', async () => {
  const events: string[] = [];
  const observe = (label: string) => ({
    name: 'same-name',
    aroundInvoke: async (
      _call: InvocationContext,
      next: () => Promise<InvocationResult<number>>
    ) => {
      events.push(`${label}:before`);
      const result = await next();
      events.push(`${label}:after`);
      return result;
    },
  });
  const result = await invoke(
    {
      tool: { instanceId: 'ordered', name: 'sum' },
      execute: () => {
        events.push('execute');
        return 3;
      },
      plugins: [observe('outer'), observe('inner')],
    },
    {}
  );
  expect(result.value).toBe(3);
  expect(events).toEqual(['outer:before', 'inner:before', 'execute', 'inner:after', 'outer:after']);
});

it('captures plugin hooks before an earlier plugin waits for approval', async () => {
  const entered = Promise.withResolvers<void>();
  const approved = Promise.withResolvers<void>();
  const denial = new Error('Destination is not authorized');
  const gate: { name: string; aroundInvoke: AroundInvoke<number> } = {
    name: 'policy',
    aroundInvoke: async (
      _call: InvocationContext,
      _next: () => Promise<InvocationResult<number>>
    ) => {
      throw denial;
    },
  };
  const plugins = [
    {
      name: 'approval',
      aroundInvoke: async (
        _call: InvocationContext,
        next: () => Promise<InvocationResult<number>>
      ) => {
        entered.resolve();
        await approved.promise;
        return next();
      },
    },
    gate,
  ];
  const execute = vi.fn(() => 3);
  const running = invoke({ tool: { instanceId: 'captured', name: 'write' }, execute, plugins }, {});
  await entered.promise;
  gate.aroundInvoke = async (_call, next) => next();
  plugins.pop();
  approved.resolve();
  await expect(running).rejects.toMatchObject({ cause: denial });
  expect(execute).not.toHaveBeenCalled();
});
