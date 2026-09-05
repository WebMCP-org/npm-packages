import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import type { ChromeModelContext, ModelContext } from '@mcp-b/webmcp-types';
import { StrictMode, Suspense, createElement, useLayoutEffect } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from 'vitest-browser-react';
import { z } from 'zod';
import { useWebMCP } from './useWebMCP.js';

function hasDescriptorExecution(context: ModelContext): context is ChromeModelContext {
  return 'executeTool' in context && typeof context.executeTool === 'function';
}

async function executeRegisteredTool(
  name: string,
  args: Record<string, unknown> = {}
): Promise<unknown> {
  const modelContext = document.modelContext;
  if (!hasDescriptorExecution(modelContext)) {
    throw new Error('Chrome descriptor execution is unavailable');
  }

  const tool = (await modelContext.getTools()).find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }

  const serialized = await modelContext.executeTool(tool, JSON.stringify(args));
  if (serialized === null) {
    throw new Error(`Tool execution was interrupted: ${name}`);
  }

  try {
    return JSON.parse(serialized);
  } catch {
    return serialized;
  }
}

async function findTool(name: string) {
  return (await document.modelContext.getTools()).find((tool) => tool.name === name);
}

describe('useWebMCP in a browser runtime', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error');
  });
  afterEach(async () => {
    await cleanup();
    const errors = vi.mocked(console.error).mock.calls;
    vi.restoreAllMocks();
    vi.useRealTimers();
    expect(errors).toEqual([]);
  });
  beforeAll(() => {
    if (!document.modelContext) {
      initializeWebMCPPolyfill();
    }
  });

  it('registers, executes, and unregisters a real WebMCP tool', async () => {
    const { act, result, unmount } = await renderHook(
      () =>
        useWebMCP({
          name: 'browser_greet',
          description: 'Greets a person',
          inputSchema: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
          } as const,
          execute: async ({ name }) => `Hello, ${name}`,
        }),
      { wrapper: ({ children }) => createElement(StrictMode, null, children) }
    );

    const tool = await findTool('browser_greet');
    expect(tool?.description).toBe('Greets a person');
    // An object since webmcp#241.
    expect(tool?.inputSchema).toMatchObject({
      type: 'object',
      required: ['name'],
    });

    let response: unknown;
    await act(async () => {
      response = await executeRegisteredTool('browser_greet', { name: 'Ada' });
    });
    expect(response).toBe('Hello, Ada');
    expect(result.current.state.lastResult).toBe('Hello, Ada');
    expect(result.current.state.executionCount).toBe(1);

    await unmount();
    expect(await findTool('browser_greet')).toBeUndefined();
  });

  it('tracks manual execution, errors, and reset state', async () => {
    const { act, result } = await renderHook(() =>
      useWebMCP({
        name: 'browser_state',
        description: 'Exercises hook state',
        inputSchema: {
          type: 'object',
          properties: { value: { type: 'number' } },
          required: ['value'],
        } as const,
        execute: async ({ value }) => {
          if (value < 0) throw new Error('value must be positive');
          return value * 2;
        },
      })
    );

    await act(async () => {
      await result.current.execute({ value: 5 });
    });
    expect(result.current.state.lastResult).toBe(10);

    await act(async () => {
      await expect(result.current.execute({ value: -1 })).rejects.toThrow('value must be positive');
    });
    expect(result.current.state.error?.message).toBe('value must be positive');

    await act(async () => result.current.reset());
    expect(result.current.state).toEqual({
      isExecuting: false,
      lastResult: null,
      error: null,
      executionCount: 0,
    });
  });

  it.each([
    { failure: 'returned Error', execute: () => new Error('Execution failed') },
    {
      failure: 'non-Error rejection',
      execute: vi.fn<() => Promise<never>>().mockRejectedValue('Execution failed'),
    },
  ])('records a $failure for local and agent executions', async ({ execute }) => {
    const hook = await renderHook(() =>
      useWebMCP({ name: 'execution_failure', description: 'Reports execution failures', execute })
    );
    await hook.act(async () => {
      await expect(hook.result.current.execute({})).rejects.toThrow('Execution failed');
    });
    expect(hook.result.current.state).toEqual({
      isExecuting: false,
      lastResult: null,
      error: new Error('Execution failed'),
      executionCount: 0,
    });
    await hook.act(async () => {
      await expect(executeRegisteredTool('execution_failure')).resolves.toEqual({
        content: [{ type: 'text', text: 'Execution failed' }],
        isError: true,
      });
    });
    expect(hook.result.current.state).toEqual({
      isExecuting: false,
      lastResult: null,
      error: new Error('Execution failed'),
      executionCount: 0,
    });
  });

  it('keeps isExecuting true until every overlapping execution settles', async () => {
    const resolvers = new Map<string, (value: string) => void>();
    const { act, result } = await renderHook(() =>
      useWebMCP({
        name: 'browser_concurrent_state',
        description: 'Tracks concurrent executions',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        } as const,
        execute: ({ id }) => new Promise<string>((resolve) => resolvers.set(id, resolve)),
      })
    );

    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    await act(async () => {
      first = result.current.execute({ id: 'first' });
      second = result.current.execute({ id: 'second' });
    });
    expect(result.current.state.isExecuting).toBe(true);

    await act(async () => {
      resolvers.get('first')?.('first');
      await first;
    });
    expect(result.current.state.isExecuting).toBe(true);

    await act(async () => {
      resolvers.get('second')?.('second');
      await second;
    });
    expect(result.current.state.isExecuting).toBe(false);
  });

  it('settles an execution that outlives the component without a React warning', async () => {
    let settle: ((value: string) => void) | undefined;
    const { act, result, unmount } = await renderHook(() =>
      useWebMCP({
        name: 'browser_post_unmount',
        description: 'Settles after unmount',
        execute: () =>
          new Promise<string>((resolve) => {
            settle = resolve;
          }),
      })
    );

    const { execute, reset } = result.current;
    let pending!: Promise<unknown>;
    await act(() => {
      pending = execute({});
    });
    await unmount();

    settle?.('done');
    await expect(pending).resolves.toBe('done');
    reset();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('uses the latest implementation without re-registering the descriptor', async () => {
    const registerTool = vi.spyOn(document.modelContext, 'registerTool');
    const { act, rerender, unmount } = await renderHook(
      ({ version }) =>
        useWebMCP({
          name: 'browser_latest_execute',
          description: 'Uses the latest closure',
          execute: async () => version,
        }),
      { initialProps: { version: 'first' } }
    );

    const registrationsAfterMount = registerTool.mock.calls.filter(
      ([tool]) => tool.name === 'browser_latest_execute'
    ).length;
    await rerender({ version: 'second' });

    let response: unknown;
    await act(async () => {
      response = await executeRegisteredTool('browser_latest_execute');
    });
    expect(response).toBe('second');
    expect(
      registerTool.mock.calls.filter(([tool]) => tool.name === 'browser_latest_execute')
    ).toHaveLength(registrationsAfterMount);
    registerTool.mockRestore();
    await unmount();
  });

  it('publishes the latest implementation before later layout effects', async () => {
    let observed: string | undefined;
    const pending = new Promise<never>(() => {});
    const hook = await renderHook(
      ({ value }) => {
        const tool = useWebMCP({
          name: 'browser_layout_execute',
          description: 'Publishes at commit',
          execute: () => {
            observed = value;
            return pending;
          },
        });
        useLayoutEffect(() => {
          void tool.execute({});
        }, [tool.execute, value]);
      },
      { initialProps: { value: 'first' } }
    );

    expect(observed).toBe('first');
    await hook.rerender({ value: 'second' });
    expect(observed).toBe('second');
  });

  it('does not publish an implementation from a suspended render', async () => {
    const pending = new Promise<never>(() => {});
    const hook = await renderHook(
      ({ value, suspend }: { value: string; suspend?: boolean }) => {
        const tool = useWebMCP({
          name: 'browser_committed_execute',
          description: 'Uses only committed closures',
          execute: async () => value,
        });
        if (suspend) throw pending;
        return tool;
      },
      {
        initialProps: { value: 'committed' },
        wrapper: ({ children }) => createElement(Suspense, { fallback: null }, children),
      }
    );

    await hook.rerender({ value: 'uncommitted', suspend: true });

    let response: unknown;
    await hook.act(async () => {
      response = await executeRegisteredTool('browser_committed_execute');
    });
    expect(response).toBe('committed');
    await hook.unmount();
  });

  it('re-registers metadata only when declared dependencies change', async () => {
    const { rerender } = await renderHook(
      ({ revision }) =>
        useWebMCP(
          {
            name: 'browser_dependency',
            description: 'Uses explicit descriptor dependencies',
            inputSchema: {
              type: 'object',
              properties: {
                value: { type: 'string', description: `Revision ${revision}` },
              },
            } as const,
            execute: async () => revision,
          },
          [revision]
        ),
      { initialProps: { revision: 1 } }
    );

    const expectValueDescription = async (description: string) => {
      expect((await findTool('browser_dependency'))?.inputSchema).toMatchObject({
        properties: { value: { description } },
      });
    };
    await expectValueDescription('Revision 1');
    await rerender({ revision: 2 });
    await expectValueDescription('Revision 2');
  });

  it('converts a real Zod Standard JSON Schema through the registration path', async () => {
    const inputSchema = z.object({
      query: z.string(),
      limit: z.number().int().min(1).max(50).optional(),
    });

    await renderHook(() =>
      useWebMCP({
        name: 'browser_standard_schema',
        description: 'Uses Standard JSON Schema',
        inputSchema,
        execute: async ({ query }) => query,
      })
    );

    const tool = await findTool('browser_standard_schema');
    expect(tool?.inputSchema).toEqual({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: ['query'],
    });
  });

  it('validates and transforms Standard Schema input on local and registered calls', async () => {
    const inputSchema = z.object({
      count: z.string().regex(/^\d+$/, 'Count must contain digits').transform(Number),
      limit: z.number().default(10),
    });
    const execute = vi.fn(({ count, limit }: z.output<typeof inputSchema>) => count + limit);
    const hook = await renderHook(() =>
      useWebMCP({
        name: 'validated_input',
        description: 'Validates before execution',
        inputSchema,
        execute,
      })
    );
    await hook.act(async () => {
      await expect(hook.result.current.execute({ count: '2' })).resolves.toBe(12);
      await expect(executeRegisteredTool('validated_input', { count: '3' })).resolves.toBe(13);
      await expect(hook.result.current.execute({ count: 'bad' })).rejects.toThrow(
        'Count must contain digits'
      );
      const response = await executeRegisteredTool('validated_input', { count: 3 });
      expect(response).toMatchObject({ isError: true });
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0]?.[0]).toEqual({ count: 2, limit: 10 });
    expect(hook.result.current.state.error?.message).toContain('Invalid tool input');
    expect(hook.result.current.state.executionCount).toBe(2);
  });

  it('awaits async validation and refuses invalid local input before side effects', async () => {
    const inputSchema = z.object({
      name: z.string().refine(async (name) => name !== 'blocked', 'Name is blocked'),
    });
    const execute = vi.fn(({ name }: z.output<typeof inputSchema>) => name.toUpperCase());
    const hook = await renderHook(() =>
      useWebMCP({ name: 'async_validation', description: 'Checks names', inputSchema, execute })
    );
    await hook.act(async () => {
      await expect(hook.result.current.execute({ name: 'blocked' })).rejects.toThrow(
        'Name is blocked'
      );
    });
    expect(execute).not.toHaveBeenCalled();
    expect(hook.result.current.state).toMatchObject({ isExecuting: false, executionCount: 0 });
    await hook.act(async () => {
      await expect(hook.result.current.execute({ name: 'Ada' })).resolves.toBe('ADA');
    });
  });

  it('tracks cancellation separately for overlapping executions and ignores late completion', async () => {
    const first = Promise.withResolvers<string>();
    const second = Promise.withResolvers<string>();
    const signals: AbortSignal[] = [];
    const hook = await renderHook(() =>
      useWebMCP({
        name: 'cancel_execution',
        description: 'Handles cancellation',
        inputSchema: {
          type: 'object',
          properties: { first: { type: 'boolean' } },
          required: ['first'],
        },
        execute: ({ first: isFirst }, { signal }) => {
          signals.push(signal);
          return isFirst ? first.promise : second.promise;
        },
      })
    );
    const controller = new AbortController();
    let cancelled!: Promise<unknown>;
    let surviving!: Promise<unknown>;
    await hook.act(() => {
      cancelled = hook.result.current.execute({ first: true }, { signal: controller.signal });
      surviving = hook.result.current.execute({ first: false });
    });
    await hook.act(async () => {
      const rejection = expect(cancelled).rejects.toThrow('cancelled');
      controller.abort(new Error('cancelled'));
      await rejection;
      first.resolve('too late');
    });
    expect(signals[0]).toBe(controller.signal);
    expect(signals[1]?.aborted).toBe(false);
    expect(hook.result.current.state).toMatchObject({
      isExecuting: true,
      lastResult: null,
      executionCount: 0,
    });
    await hook.act(async () => {
      hook.result.current.reset();
      second.resolve('success');
      await surviving;
    });
    expect(hook.result.current.state).toEqual({
      isExecuting: false,
      lastResult: 'success',
      error: null,
      executionCount: 1,
    });
  });

  it('does not execute an already-cancelled request', async () => {
    const execute = vi.fn();
    const hook = await renderHook(() =>
      useWebMCP({ name: 'already_cancelled', description: 'Does not run', execute })
    );
    await hook.act(async () => {
      await expect(
        hook.result.current.execute({}, { signal: AbortSignal.abort() })
      ).rejects.toThrow();
    });
    expect(execute).not.toHaveBeenCalled();
    expect(hook.result.current.state.isExecuting).toBe(false);
  });

  it('forwards native execution options and supplies options to older runtimes', async () => {
    const register = vi.spyOn(document.modelContext!, 'registerTool');
    const signals: AbortSignal[] = [];
    const hook = await renderHook(() =>
      useWebMCP({
        name: 'native_options',
        description: 'Forwards options',
        execute: (_, { signal }) => {
          signals.push(signal);
          return 'ok';
        },
      })
    );
    const tool = register.mock.calls[0]?.[0];
    if (!tool) throw new Error('Tool was not registered');
    const signal = new AbortController().signal;
    await hook.act(async () => {
      await tool.execute({}, { signal });
      await executeRegisteredTool('native_options');
    });
    expect(signals[0]).toBe(signal);
    expect(signals[1]).toBeInstanceOf(AbortSignal);
  });

  it('updates schema and annotations by value without inline-object registration churn', async () => {
    const register = vi.spyOn(document.modelContext!, 'registerTool');
    const hook = await renderHook(
      ({ revision }) =>
        useWebMCP({
          name: 'metadata_updates',
          title: `Revision ${revision}`,
          description: 'Updates metadata',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string', description: `Revision ${revision}` } },
          },
          annotations: { readOnlyHint: revision === 1 },
          execute: () => revision,
        }),
      { initialProps: { revision: 1 } }
    );
    await hook.rerender({ revision: 1 });
    expect(register).toHaveBeenCalledTimes(1);
    await hook.rerender({ revision: 2 });
    expect(register).toHaveBeenCalledTimes(2);
    expect(await findTool('metadata_updates')).toMatchObject({
      title: 'Revision 2',
      annotations: { readOnlyHint: false },
      inputSchema: { properties: { query: { description: 'Revision 2' } } },
    });
  });

  it('can disable and re-enable registration while keeping local execution available', async () => {
    const hook = await renderHook(
      ({ enabled }) =>
        useWebMCP({
          name: 'enabled_tool',
          description: 'Conditional registration',
          enabled,
          execute: () => 'ok',
        }),
      { initialProps: { enabled: false } }
    );
    expect(hook.result.current).toMatchObject({
      isSupported: true,
      isRegistered: false,
      registrationError: null,
    });
    expect(await findTool('enabled_tool')).toBeUndefined();
    await hook.act(async () => {
      await expect(hook.result.current.execute({})).resolves.toBe('ok');
    });
    await hook.rerender({ enabled: true });
    await expect.poll(() => hook.result.current.isRegistered).toBe(true);
    await hook.rerender({ enabled: false });
    expect(await findTool('enabled_tool')).toBeUndefined();
    expect(hook.result.current.isRegistered).toBe(false);
  });

  it('reports a duplicate registration without unregistering the original owner', async () => {
    const first = await renderHook(() =>
      useWebMCP({ name: 'duplicate_owner', description: 'First owner', execute: () => 'first' })
    );
    const second = await renderHook(
      ({ enabled }) =>
        useWebMCP({
          name: 'duplicate_owner',
          description: 'Second owner',
          execute: () => 'second',
          enabled,
        }),
      { initialProps: { enabled: false } }
    );
    await second.act(async () => {
      await second.rerender({ enabled: true });
    });
    await second.act(async () => {
      await expect
        .poll(() => second.result.current.registrationError?.name)
        .toBe('InvalidStateError');
    });
    await second.unmount();
    expect(first.result.current.isRegistered).toBe(true);
    await first.act(async () => {
      expect(await executeRegisteredTool('duplicate_owner')).toBe('first');
    });
  });

  it('reports synchronous platform rejection without breaking rendering', async () => {
    vi.spyOn(document.modelContext!, 'registerTool').mockImplementationOnce(() => {
      throw new DOMException('Not allowed', 'NotAllowedError');
    });
    const hook = await renderHook(() =>
      useWebMCP({
        name: 'not_allowed',
        description: 'Denied by the platform',
        execute: () => 'never',
      })
    );
    expect(hook.result.current.registrationError?.name).toBe('NotAllowedError');
    expect(hook.result.current.isRegistered).toBe(false);
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores a stale registration that later %ss',
    async (outcome) => {
      const delayed = Promise.withResolvers<void>();
      const register = vi
        .spyOn(document.modelContext!, 'registerTool')
        .mockImplementationOnce(() => delayed.promise);
      const hook = await renderHook(
        ({ name }) => useWebMCP({ name, description: 'Async registration', execute: () => name }),
        { initialProps: { name: 'stale_registration' } }
      );
      expect(hook.result.current.isRegistered).toBe(false);
      await hook.rerender({ name: 'current_registration' });
      await expect.poll(() => hook.result.current.isRegistered).toBe(true);
      expect(register.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      await hook.act(async () => {
        if (outcome === 'resolve') delayed.resolve();
        else delayed.reject(new Error('Late failure'));
        await Promise.resolve();
      });
      expect(hook.result.current).toMatchObject({ isRegistered: true, registrationError: null });
    }
  );

  it('detects a late-injected API and stops probing after registration', async () => {
    const documentContext = vi.spyOn(document, 'modelContext', 'get').mockReturnValue(undefined);
    const navigatorContext = vi.spyOn(navigator, 'modelContext', 'get').mockReturnValue(undefined);
    vi.useFakeTimers();
    const hook = await renderHook(() =>
      useWebMCP({
        name: 'late_runtime',
        description: 'Waits for injection',
        execute: () => 'ready',
      })
    );
    expect(hook.result.current.isSupported).toBe(false);
    documentContext.mockRestore();
    navigatorContext.mockRestore();
    await hook.act(async () => {
      await vi.advanceTimersByTimeAsync(501);
    });
    expect(hook.result.current).toMatchObject({ isSupported: true, isRegistered: true });
    expect(vi.getTimerCount()).toBe(0);
    await hook.unmount();
    await vi.advanceTimersByTimeAsync(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds unsupported-browser discovery and cancels it on unmount', async () => {
    vi.spyOn(document, 'modelContext', 'get').mockReturnValue(undefined);
    vi.spyOn(navigator, 'modelContext', 'get').mockReturnValue(undefined);
    vi.useFakeTimers();
    const hook = await renderHook(() =>
      useWebMCP({ name: 'unsupported', description: 'No API', execute: () => 'local' })
    );
    await hook.act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(hook.result.current).toMatchObject({
      isSupported: false,
      isRegistered: false,
      registrationError: null,
    });
    expect(vi.getTimerCount()).toBe(0);
    await hook.unmount();
    const second = await renderHook(() =>
      useWebMCP({ name: 'unmounted_probe', description: 'No API', execute: () => 'local' })
    );
    await second.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('exposes schema conversion errors and recovers when supplied a valid schema', async () => {
    const invalid = z.object({ value: z.custom<symbol>() });
    const valid = z.object({ value: z.string() });
    const hook = await renderHook(
      ({ broken }) =>
        useWebMCP({
          name: 'schema_error',
          description: 'Reports bad schemas',
          inputSchema: broken ? invalid : valid,
          execute: () => 'ok',
        }),
      { initialProps: { broken: true } }
    );
    expect(hook.result.current.registrationError?.message).toContain('Failed to convert');
    expect(await findTool('schema_error')).toBeUndefined();
    await hook.rerender({ broken: false });
    await expect.poll(() => hook.result.current.isRegistered).toBe(true);
    expect(hook.result.current.registrationError).toBeNull();
  });
  it('reports circular schema metadata without registering and recovers after correction', async () => {
    const register = vi.spyOn(document.modelContext, 'registerTool');
    const properties: Record<string, unknown> = {};
    const circular = { type: 'object', properties };
    properties.self = circular;
    const hook = await renderHook(
      ({ broken }) =>
        useWebMCP({
          name: 'circular_schema',
          description: 'Reports unserializable schemas',
          inputSchema: broken ? circular : { type: 'object' },
          execute: () => 'ok',
        }),
      { initialProps: { broken: true } }
    );
    expect(hook.result.current.registrationError).toBeInstanceOf(TypeError);
    expect(hook.result.current.isRegistered).toBe(false);
    expect(register).not.toHaveBeenCalled();
    await hook.rerender({ broken: false });
    await expect.poll(() => hook.result.current.isRegistered).toBe(true);
    expect(hook.result.current.registrationError).toBeNull();
    expect(await findTool('circular_schema')).toMatchObject({ inputSchema: { type: 'object' } });
  });

  it('handles validation aborting before its promise settles', async () => {
    const validation = Promise.withResolvers<boolean>();
    const controller = new AbortController();
    const execute = vi.fn(() => 'unexpected');
    const inputSchema = z.object({
      value: z.string().refine(() => {
        controller.abort();
        return validation.promise;
      }),
    });
    const hook = await renderHook(() =>
      useWebMCP({
        name: 'cancel_validation',
        description: 'Cancel validation',
        inputSchema,
        execute,
      })
    );
    await hook.act(async () => {
      await expect(
        hook.result.current.execute({ value: 'ok' }, { signal: controller.signal })
      ).rejects.toThrow();
      validation.resolve(true);
    });
    expect(execute).not.toHaveBeenCalled();
    expect(hook.result.current.state.isExecuting).toBe(false);
  });

  it('formats agent results without changing local values and records formatter failures', async () => {
    const hook = await renderHook(
      ({ fail }) =>
        useWebMCP({
          name: 'formatted_result',
          description: 'Formats output',
          execute: () => ({ count: 3 }),
          formatOutput: async ({ count }) => {
            if (fail) throw new Error('Formatting failed');
            return `Count: ${count}`;
          },
        }),
      { initialProps: { fail: false } }
    );
    await hook.act(async () => {
      await expect(executeRegisteredTool('formatted_result')).resolves.toBe('Count: 3');
      await expect(hook.result.current.execute({})).resolves.toEqual({ count: 3 });
    });
    expect(hook.result.current.state.lastResult).toEqual({ count: 3 });
    await hook.rerender({ fail: true });
    await hook.act(async () => {
      expect(await executeRegisteredTool('formatted_result')).toMatchObject({ isError: true });
    });
    expect(hook.result.current.state.error?.message).toBe('Formatting failed');
    expect(hook.result.current.state.executionCount).toBe(2);
  });
});
