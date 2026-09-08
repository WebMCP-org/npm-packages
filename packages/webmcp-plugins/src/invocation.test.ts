import { describe, expect, it } from 'vitest';
import { executionState } from './execution-state.js';
import {
  invoke,
  InvocationFailure,
  unwrapInvocation,
  type InvocationResult,
} from './invocation.js';

describe('invocation middleware', () => {
  it('preserves completed success when a state listener cancels during notification', async () => {
    const controller = new AbortController();
    const state = executionState<number>();
    state.subscribe(() => {
      if (state.getSnapshot().executionCount === 1) controller.abort('after completion');
    });
    const outcomes: string[] = [];
    const result = await invoke(
      {
        tool: { instanceId: 'settled', name: 'write' },
        execute: () => 7,
        plugins: [
          {
            name: 'test-plugin',
            aroundInvoke: async (_call, next) => {
              try {
                const result = await next();
                outcomes.push('success');
                return result;
              } catch (error) {
                outcomes.push('failure');
                throw error;
              }
            },
          },
          state,
        ],
      },
      {},
      { signal: controller.signal }
    );
    expect(result.value).toBe(7);
    expect(outcomes).toEqual(['success']);
    expect(state.getSnapshot()).toMatchObject({
      executionCount: 1,
      error: null,
      isExecuting: false,
    });
  });
  it('keeps executable values private from approval binding callbacks', async () => {
    let retained: { amount: number } | undefined;
    const waiting = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const running = invoke(
      {
        tool: { instanceId: 'binding', name: 'write' },
        binding: (input: { amount: number }) => {
          retained = input;
          return { amount: input.amount };
        },
        execute: (input) => input.amount,
        plugins: [
          {
            name: 'test-plugin',
            aroundInvoke: async (call, next) => {
              await call.prepare();
              waiting.resolve();
              await resume.promise;
              return next();
            },
          },
        ],
      },
      { amount: 10 }
    );
    await waiting.promise;
    if (retained) retained.amount = 100;
    resume.resolve();
    expect((await running).value).toBe(10);
  });
  it('caches failed preparation and forbids recovery of denial into success', async () => {
    let validations = 0;
    let executions = 0;
    const invalid = new TypeError('invalid input');
    await expect(
      invoke(
        {
          tool: { instanceId: 'invalid', name: 'write' },
          input: {
            validate: () => {
              validations++;
              throw invalid;
            },
          },
          execute: () => ++executions,
          plugins: [
            {
              name: 'test-plugin',
              aroundInvoke: async (call, next) => {
                const results = await Promise.allSettled([call.prepare(), call.prepare()]);
                expect(results).toEqual([
                  {
                    status: 'rejected',
                    reason: expect.objectContaining({ kind: 'invalid_input', cause: invalid }),
                  },
                  {
                    status: 'rejected',
                    reason: expect.objectContaining({ kind: 'invalid_input', cause: invalid }),
                  },
                ]);
                return next();
              },
            },
          ],
        },
        {}
      )
    ).rejects.toMatchObject({ kind: 'invalid_input', cause: invalid });
    expect(validations).toBe(1);
    expect(executions).toBe(0);
    await expect(
      invoke(
        {
          tool: { instanceId: 'denied', name: 'write' },
          execute: () => ++executions,
          plugins: [
            {
              name: 'test-plugin',
              aroundInvoke: async (_call, next) => {
                try {
                  return await next();
                } catch {
                  return { value: 1, response: 1 };
                }
              },
            },
            {
              name: 'test-plugin',
              aroundInvoke: async () => {
                throw new InvocationFailure('denied', new Error('denied'));
              },
            },
          ],
        },
        {}
      )
    ).rejects.toMatchObject({ kind: 'denied' });
    expect(executions).toBe(0);
  });

  it('requires a JSON approval binding for non-JSON transformed inputs', async () => {
    const execute = (input: Date) => input.getUTCFullYear();
    const input = { validate: () => new Date('2026-01-01T00:00:00.000Z') };
    const config = { tool: { instanceId: 'date', name: 'schedule' }, input, execute };
    expect((await invoke(config, {})).value).toBe(2026);
    const consent: import('./invocation.js').AroundInvoke<number> = async (call, next) => {
      await call.prepare();
      return next();
    };
    await expect(
      invoke({ ...config, plugins: [{ name: 'test-plugin', aroundInvoke: consent }] }, {})
    ).rejects.toThrow('explicit approval binding');
    expect(
      (
        await invoke(
          {
            ...config,
            plugins: [{ name: 'test-plugin', aroundInvoke: consent }],
            binding: (date) => ({ date: date.toISOString() }),
          },
          {}
        )
      ).value
    ).toBe(2026);
  });

  it('does not recursively format formatter failures or trust error-shaped objects', async () => {
    let attempts = 0;
    const formattingError = new Error('formatter failed');
    const config = {
      tool: { instanceId: 'format', name: 'write' },
      execute: () => {
        throw { kind: 'cancelled', response: 'spoofed' };
      },
      formatError: () => {
        attempts++;
        throw formattingError;
      },
      plugins: [
        {
          name: 'test-plugin',
          aroundInvoke: async (
            _call: import('./invocation.js').InvocationContext,
            next: () => Promise<InvocationResult<never>>
          ) => next(),
        },
      ],
    };
    await expect(invoke(config, {}, { forAgent: true })).rejects.toMatchObject({
      kind: 'format_error',
      cause: formattingError,
    });
    expect(attempts).toBe(1);
    await expect(invoke(config, {})).rejects.toMatchObject({ kind: 'tool_error' });
    expect(attempts).toBe(1);
  });

  it.each(['validation', 'execution', 'formatting'] as const)(
    'cancels during %s and observes a late failure',
    async (phase) => {
      const controller = new AbortController();
      const pending = Promise.withResolvers<object>();
      const started = Promise.withResolvers<void>();
      const wait = () => {
        started.resolve();
        return pending.promise;
      };
      let formats = 0;
      const result = invoke(
        {
          tool: { instanceId: phase, name: 'write' },
          input: { validate: phase === 'validation' ? wait : () => ({}) },
          execute: phase === 'execution' ? wait : () => ({}),
          ...(phase === 'formatting' && { formatOutput: wait }),
          formatError: () => {
            formats++;
          },
        },
        {},
        { forAgent: true, signal: controller.signal }
      );
      await started.promise;
      controller.abort('cancel');
      await expect(result).rejects.toMatchObject({ kind: 'cancelled', cause: 'cancel' });
      pending.reject(new Error('late failure'));
      expect(formats).toBe(0);
    }
  );
  it('does not share transformed values with a validator after approval', async () => {
    const value = { destination: { name: 'approved' } };
    const approved = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const running = invoke(
      {
        tool: { instanceId: 'transformed', name: 'write' },
        input: { validate: () => value },
        execute: (input) => input.destination.name,
        plugins: [
          {
            name: 'test-plugin',
            aroundInvoke: async (call, next) => {
              await call.prepare();
              approved.resolve();
              await resume.promise;
              return next();
            },
          },
        ],
      },
      {}
    );
    await approved.promise;
    value.destination.name = 'changed';
    resume.resolve();
    expect((await running).value).toBe('approved');
  });
  it('stops abandoned execution when middleware throws before preparation finishes', async () => {
    const validation = Promise.withResolvers<object>();
    let executions = 0;
    const running = invoke(
      {
        tool: { instanceId: 'abandoned', name: 'write' },
        input: { validate: () => validation.promise },
        execute: () => ++executions,
        plugins: [
          {
            name: 'test-plugin',
            aroundInvoke: async (_call, next) => {
              void next();
              throw new Error('plugin failed');
            },
          },
        ],
      },
      {}
    );
    await expect(running).rejects.toMatchObject({ kind: 'middleware_error' });
    validation.resolve({});
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(executions).toBe(0);
  });
  it('classifies MCP errors only for protocol delivery and preserves their response', async () => {
    const response = { content: [{ type: 'text', text: 'failed' }], isError: true };
    const config = {
      tool: { instanceId: 'mcp-error', name: 'write' },
      execute: () => response,
      isErrorResponse: (value: unknown) => value === response,
    };
    await expect(invoke(config, {}, { forAgent: true })).rejects.toMatchObject({
      kind: 'tool_error',
      response,
    });
    expect((await invoke(config, {})).value).toBe(response);
  });
  it('formats a failure once before observers unwind while local calls skip formatting', async () => {
    const error = new Error('write failed');
    const observed: unknown[] = [];
    let formats = 0;
    const config = {
      tool: { instanceId: 'errors', name: 'write' },
      execute: () => {
        throw error;
      },
      formatError: () => {
        formats++;
        return undefined;
      },
      plugins: [
        {
          name: 'test-plugin',
          aroundInvoke: async (
            _call: import('./invocation.js').InvocationContext,
            next: () => Promise<InvocationResult<never>>
          ) => {
            try {
              return await next();
            } catch (failure) {
              observed.push(failure);
              throw failure;
            }
          },
        },
      ],
    };
    await expect(
      unwrapInvocation(invoke(config, {}, { forAgent: true }), true)
    ).resolves.toBeUndefined();
    expect(observed[0]).toMatchObject({ kind: 'tool_error', cause: error });
    expect('response' in Object(observed[0])).toBe(true);
    expect(formats).toBe(1);
    await expect(unwrapInvocation(invoke(config, {}))).rejects.toBe(error);
    expect(formats).toBe(1);
  });
  it('captures the handler and immutable final arguments before waiting for approval', async () => {
    const approval = Promise.withResolvers<void>();
    const waiting = Promise.withResolvers<void>();
    const input = { destination: { name: 'original' } };
    const config = {
      tool: { instanceId: 'snapshot', name: 'write' },
      execute: (value: typeof input) => value.destination.name,
      plugins: [
        {
          name: 'test-plugin',
          aroundInvoke: async (
            call: import('./invocation.js').InvocationContext,
            next: () => Promise<InvocationResult<string>>
          ) => {
            const operation = await call.prepare();
            expect(Object.isFrozen(operation.arguments)).toBe(true);
            expect(Object.isFrozen(Reflect.get(Object(operation.arguments), 'destination'))).toBe(
              true
            );
            waiting.resolve();
            await approval.promise;
            return next();
          },
        },
      ],
    };
    const running = invoke(config, input);
    input.destination.name = 'changed';
    config.execute = () => 'replacement';
    await waiting.promise;
    approval.resolve();
    expect((await running).value).toBe('original');
  });
  it('cancels pending approval and blocks late continuation', async () => {
    const controller = new AbortController();
    const approve = Promise.withResolvers<void>();
    const waiting = Promise.withResolvers<void>();
    let executions = 0;
    const running = invoke(
      {
        tool: { instanceId: 'cancel', name: 'write' },
        execute: () => ++executions,
        plugins: [
          {
            name: 'test-plugin',
            aroundInvoke: async (call, next) => {
              await call.prepare();
              waiting.resolve();
              await approve.promise;
              return next();
            },
          },
        ],
      },
      {},
      { signal: controller.signal }
    );
    await waiting.promise;
    const reason = new Error('cancelled by caller');
    controller.abort(reason);
    await expect(running).rejects.toMatchObject({ kind: 'cancelled', cause: reason });
    approve.resolve();
    await Promise.resolve();
    expect(executions).toBe(0);
  });
  it('rejects early middleware returns and observes abandoned downstream rejections', async () => {
    const work = Promise.withResolvers<number>();
    const started = Promise.withResolvers<void>();
    const running = invoke(
      {
        tool: { instanceId: 'early', name: 'write' },
        execute: () => {
          started.resolve();
          return work.promise;
        },
        plugins: [
          {
            name: 'test-plugin',
            aroundInvoke: async (_call, next) => {
              void next();
              await started.promise;
              return { value: 2, response: 2 };
            },
          },
        ],
      },
      {}
    );
    await expect(running).rejects.toMatchObject({ kind: 'middleware_error' });
    work.reject(new Error('late failure'));
  });
  it('rejects duplicate and saved continuations without repeating execution', async () => {
    let executions = 0;
    let saved: (() => Promise<InvocationResult<number>>) | undefined;
    await invoke(
      {
        tool: { instanceId: 'once', name: 'write' },
        execute: () => ++executions,
        plugins: [
          {
            name: 'test-plugin',
            aroundInvoke: async (_call, next) => {
              saved = next;
              const first = next();
              await expect(next()).rejects.toMatchObject({ kind: 'middleware_error' });
              return first;
            },
          },
        ],
      },
      {}
    );
    await expect(saved?.()).rejects.toMatchObject({ kind: 'middleware_error' });
    expect(executions).toBe(1);
  });
  it('validates once before consent and unwinds in registration order', async () => {
    const events: string[] = [];
    const result = await invoke(
      {
        tool: { instanceId: 'rollback-1', name: 'rollback' },
        input: {
          validate: (input: { revision: string }) => {
            events.push('validate');
            return { revision: input.revision.trim() };
          },
        },
        plugins: [
          {
            name: 'test-plugin',
            aroundInvoke: async (_call, next) => {
              events.push('observe');
              const value = await next();
              events.push('observed');
              return value;
            },
          },
          {
            name: 'test-plugin',
            aroundInvoke: async (call, next) => {
              const [first, second] = await Promise.all([call.prepare(), call.prepare()]);
              expect(first).toBe(second);
              expect(first.arguments).toEqual({ revision: 'abc' });
              events.push('consent');
              return next();
            },
          },
        ],
        execute: (input) => {
          events.push('execute');
          return input.revision;
        },
      },
      { revision: ' abc ' }
    );
    expect(result).toEqual({ value: 'abc', response: 'abc' });
    expect(events).toEqual(['observe', 'validate', 'consent', 'execute', 'observed']);
  });
});
