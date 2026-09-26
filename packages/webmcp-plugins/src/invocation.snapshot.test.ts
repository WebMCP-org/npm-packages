import { expect, it } from 'vitest';
import { invoke } from './invocation.js';
import { vi } from 'vitest';

class Count {
  constructor(readonly value: number) {}
  double() {
    return this.value * 2;
  }
}

it('retains a vendor class instance when no approval snapshot is requested', async () => {
  const transformed = new Count(2);
  const result = await invoke(
    {
      tool: { name: 'count', instanceId: 'count-1' },
      input: { validate: () => transformed },
      execute: (value) => {
        expect(value).toBe(transformed);
        return value.double();
      },
    },
    {}
  );
  expect(result.value).toBe(4);
});

it.each(['raw', 'transformed'] as const)(
  'rejects %s custom instances when a snapshot would erase their prototype',
  async (source) => {
    const execute = vi.fn(() => 'done');
    const operation =
      source === 'raw'
        ? invoke({ tool: { name: 'custom', instanceId: 'custom-1' }, execute }, new Count(2))
        : invoke(
            {
              tool: { name: 'custom', instanceId: 'custom-1' },
              input: { validate: () => new Count(2) },
              execute,
              binding: (value) => ({ value: value.value }),
              plugins: [
                {
                  name: 'test-plugin',
                  aroundInvoke: async (call, next) => {
                    await call.prepare();
                    return next();
                  },
                },
              ],
            },
            {}
          );
    await expect(operation).rejects.toThrow('Custom instances cannot be snapshotted');
    expect(execute).not.toHaveBeenCalled();
  }
);

it.each(['sparse', 'extra-property'] as const)(
  'rejects %s arrays instead of silently dropping approval data',
  async (kind) => {
    const sparse: number[] = [];
    sparse.length = 1;
    const input = kind === 'sparse' ? sparse : Object.assign([1], { extra: 'hidden' });
    const execute = vi.fn(() => 'done');
    await expect(
      invoke(
        {
          tool: { name: 'array', instanceId: 'array-1' },
          execute,
          plugins: [
            {
              name: 'test-plugin',
              aroundInvoke: async (call, next) => {
                await call.prepare();
                return next();
              },
            },
          ],
        },
        input
      )
    ).rejects.toThrow('Approval arrays must be dense and have no extra properties');
    expect(execute).not.toHaveBeenCalled();
  }
);

it('privately snapshots Date, Map, and Set before approval and isolates binding callbacks', async () => {
  const original = {
    date: new Date('2026-01-01T00:00:00Z'),
    map: new Map([['count', 1]]),
    set: new Set(['one']),
  };
  const summarize = (value: typeof original) => ({
    date: value.date.toISOString(),
    map: [...value.map],
    set: [...value.set],
  });
  const expected = summarize(original);
  const waiting = Promise.withResolvers<void>();
  const approved = Promise.withResolvers<void>();
  let bindingInput: typeof original | undefined;
  const running = invoke(
    {
      tool: { name: 'native_values', instanceId: 'native-values-1' },
      input: { validate: () => original },
      binding: (value) => {
        bindingInput = value;
        return summarize(value);
      },
      plugins: [
        {
          name: 'test-plugin',
          aroundInvoke: async (call, next) => {
            const operation = await call.prepare();
            expect(operation.binding).toEqual(expected);
            expect(operation.arguments).toBeUndefined();
            waiting.resolve();
            await approved.promise;
            return next();
          },
        },
      ],
      execute: summarize,
    },
    {}
  );
  await waiting.promise;
  original.date.setUTCFullYear(2027);
  original.map.set('count', 2);
  original.set.clear();
  bindingInput!.date.setUTCFullYear(2028);
  bindingInput!.map.clear();
  bindingInput!.set.add('changed');
  approved.resolve();
  expect((await running).value).toEqual(expected);
});

it('accepts an explicit complete binding for an array with custom data', async () => {
  const input = Object.assign([1], { extra: 'visible in binding' });
  const result = await invoke(
    {
      tool: { name: 'bound_array', instanceId: 'bound-array-1' },
      binding: (value: typeof input) => ({ items: [...value], extra: value.extra }),
      plugins: [
        {
          name: 'test-plugin',
          aroundInvoke: async (call, next) => {
            const operation = await call.prepare();
            expect(operation.arguments).toBeUndefined();
            expect(operation.binding).toEqual({ items: [1], extra: 'visible in binding' });
            return next();
          },
        },
      ],
      execute: (value: typeof input) => value.extra,
    },
    input
  );
  expect(result.value).toBe('visible in binding');
});

it.each(['non-enumerable', 'symbol'] as const)(
  'rejects %s fields that a snapshot would discard',
  async (kind) => {
    const input = {};
    Object.defineProperty(input, kind === 'symbol' ? Symbol('hidden') : 'hidden', {
      value: 'execution data',
      enumerable: kind === 'symbol',
    });
    const execute = vi.fn(() => 'done');
    await expect(
      invoke(
        {
          tool: { name: 'hidden_fields', instanceId: 'hidden-fields-1' },
          input: { validate: () => input },
          execute,
          plugins: [
            {
              name: 'test-plugin',
              aroundInvoke: async (call, next) => {
                await call.prepare();
                return next();
              },
            },
          ],
        },
        {}
      )
    ).rejects.toThrow('Input snapshots require enumerable string-keyed data properties');
    expect(execute).not.toHaveBeenCalled();
  }
);
