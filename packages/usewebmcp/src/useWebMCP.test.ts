import { installWebMCP } from '@mcp-b/webmcp-polyfill';
import { StrictMode, Suspense, createElement, useLayoutEffect } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from 'vitest-browser-react';
import { useWebMCP } from './useWebMCP.js';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

interface CircularInputSchema {
  type: string;
  properties: Record<string, CircularInputSchema>;
}

interface CircularAnnotations {
  readOnlyHint: boolean;
  self?: CircularAnnotations;
}

async function executeRegisteredTool(name: string, args: JsonObject = {}): Promise<JsonValue> {
  const modelContext = document.modelContext;
  if (!modelContext || typeof modelContext.executeTool !== 'function') {
    throw new Error('Chrome descriptor execution is unavailable');
  }

  const tool = (await modelContext.getTools()).find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }

  const serialized = await modelContext.executeTool(tool, args);
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
  return (await document.modelContext!.getTools()).find((tool) => tool.name === name);
}

describe('useWebMCP in a browser runtime', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error');
  });
  afterEach(async () => {
    await cleanup();
    const errors = vi.mocked(console.error).mock.calls;
    vi.restoreAllMocks();
    expect(errors).toEqual([]);
  });
  beforeAll(() => {
    if (!document.modelContext) {
      installWebMCP();
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
    expect(result.current).not.toHaveProperty('isRegistered');
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
    const register = vi.spyOn(document.modelContext!, 'registerTool');
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
    const tool = register.mock.calls[0]?.[0];
    if (!tool) throw new Error('Tool was not registered');
    await hook.act(async () => {
      await expect(tool.execute({}, { signal: new AbortController().signal })).rejects.toThrow(
        'Execution failed'
      );
    });
    expect(hook.result.current.state).toEqual({
      isExecuting: false,
      lastResult: null,
      error: new Error('Execution failed'),
      executionCount: 0,
    });
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
    const registerTool = vi.spyOn(document.modelContext!, 'registerTool');
    const { act, rerender, unmount } = await renderHook(
      ({ version }: { version: string } = { version: 'first' }) =>
        useWebMCP({
          name: 'browser_latest_execute',
          description: 'Uses the latest closure',
          execute: async () => version,
        })
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
    const hook = await renderHook(({ value }: { value: string } = { value: 'first' }) => {
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
    });

    expect(observed).toBe('first');
    await hook.rerender({ value: 'second' });
    expect(observed).toBe('second');
  });

  it('does not publish an implementation from a suspended render', async () => {
    const pending = new Promise<never>(() => {});
    const hook = await renderHook(
      (
        { value, suspend }: { value: string; suspend: boolean } = {
          value: 'committed',
          suspend: false,
        }
      ) => {
        const tool = useWebMCP({
          name: 'browser_committed_execute',
          description: 'Uses only committed closures',
          execute: async () => value,
        });
        if (suspend) throw pending;
        return tool;
      },
      { wrapper: ({ children }) => createElement(Suspense, { fallback: null }, children) }
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
    const { rerender } = await renderHook(({ revision }: { revision: number } = { revision: 1 }) =>
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
      )
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

  it('forwards execution signals through the upstream callback contract', async () => {
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
    const hook = await renderHook(({ revision }: { revision: number } = { revision: 1 }) =>
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
      })
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
    const hook = await renderHook(({ enabled }: { enabled: boolean } = { enabled: false }) =>
      useWebMCP({
        name: 'enabled_tool',
        description: 'Conditional registration',
        enabled,
        execute: () => 'ok',
      })
    );
    expect(hook.result.current).toMatchObject({
      isSupported: true,
      registrationError: null,
    });
    expect(await findTool('enabled_tool')).toBeUndefined();
    await hook.act(async () => {
      await expect(hook.result.current.execute({})).resolves.toBe('ok');
    });
    await hook.rerender({ enabled: true });
    await expect.poll(() => findTool('enabled_tool')).toBeDefined();
    await hook.rerender({ enabled: false });
    expect(await findTool('enabled_tool')).toBeUndefined();
    expect(hook.result.current.registrationError).toBeNull();
  });

  it('warns about a duplicate registration without unregistering the original owner', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = await renderHook(() =>
      useWebMCP({ name: 'duplicate_owner', description: 'First owner', execute: () => 'first' })
    );
    const second = await renderHook(({ enabled }: { enabled: boolean } = { enabled: false }) =>
      useWebMCP({
        name: 'duplicate_owner',
        description: 'Second owner',
        execute: () => 'second',
        enabled,
      })
    );
    await second.act(async () => {
      await second.rerender({ enabled: true });
    });
    await second.act(async () => {
      await expect
        .poll(() => second.result.current.registrationError?.name)
        .toBe('InvalidStateError');
    });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('"duplicate_owner"');
    await second.unmount();
    expect(await findTool('duplicate_owner')).toMatchObject({ description: 'First owner' });
    expect(first.result.current.registrationError).toBeNull();
    await first.act(async () => {
      expect(await executeRegisteredTool('duplicate_owner')).toBe('first');
    });
  });

  it('reports synchronous platform rejection without breaking rendering', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
    expect(warn).toHaveBeenCalledOnce();
    expect(await findTool('not_allowed')).toBeUndefined();
  });

  it.each(['resolve', 'reject'] as const)(
    'handles delayed metadata registration and its %s outcome before recovery',
    async (outcome) => {
      const name = `registration_update_${outcome}`;
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const hook = await renderHook(({ revision }: { revision: number } = { revision: 1 }) =>
        useWebMCP({ name, description: `Revision ${revision}`, execute: () => revision })
      );
      expect(await findTool(name)).toMatchObject({ description: 'Revision 1' });
      const context = document.modelContext!;
      const registerTool = context.registerTool;
      const delayed = Promise.withResolvers<void>();
      vi.spyOn(context, 'registerTool').mockImplementationOnce(async (...args) => {
        await delayed.promise;
        return registerTool.apply(context, args);
      });

      await hook.rerender({ revision: 2 });
      expect(hook.result.current).toMatchObject({
        isSupported: true,
        registrationError: null,
      });
      expect(await findTool(name)).toBeUndefined();

      const failure = new Error('Metadata registration failed');
      await hook.act(async () => {
        if (outcome === 'resolve') delayed.resolve();
        else delayed.reject(failure);
        await Promise.resolve();
      });
      expect(hook.result.current).toMatchObject({
        registrationError: outcome === 'reject' ? failure : null,
      });
      expect(warn).toHaveBeenCalledTimes(outcome === 'reject' ? 1 : 0);
      if (outcome === 'resolve')
        expect(await findTool(name)).toMatchObject({ description: 'Revision 2' });
      else expect(await findTool(name)).toBeUndefined();

      await hook.rerender({ revision: 3 });
      expect(hook.result.current.registrationError).toBeNull();
      expect(await findTool(name)).toMatchObject({ description: 'Revision 3' });
    }
  );

  it.each(['resolve', 'reject'] as const)(
    'ignores a stale registration that later %ss',
    async (outcome) => {
      const delayed = Promise.withResolvers<void>();
      const register = vi
        .spyOn(document.modelContext!, 'registerTool')
        .mockImplementationOnce(() => delayed.promise);
      const hook = await renderHook(({ name }: { name: string } = { name: 'stale_registration' }) =>
        useWebMCP({ name, description: 'Async registration', execute: () => name })
      );
      expect(await findTool('stale_registration')).toBeUndefined();
      await hook.rerender({ name: 'current_registration' });
      await expect.poll(() => findTool('current_registration')).toBeDefined();
      expect(register.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      await hook.act(async () => {
        if (outcome === 'resolve') delayed.resolve();
        else delayed.reject(new Error('Late failure'));
        await Promise.resolve();
      });
      expect(hook.result.current.registrationError).toBeNull();
      expect(await findTool('current_registration')).toBeDefined();
      expect(await findTool('stale_registration')).toBeUndefined();
    }
  );

  it('reports an unavailable API and keeps local execution', async () => {
    vi.spyOn(document, 'modelContext', 'get').mockReturnValue(undefined);
    const hook = await renderHook(() =>
      useWebMCP({ name: 'unsupported', description: 'No API', execute: () => 'local' })
    );
    expect(hook.result.current).toMatchObject({ isSupported: false, registrationError: null });
    await hook.act(async () => {
      await expect(hook.result.current.execute({})).resolves.toBe('local');
    });
  });

  it('returns an undefined result to agents as null', async () => {
    const hook = await renderHook(() =>
      useWebMCP({ name: 'void_result', description: 'Returns nothing', execute: () => {} })
    );
    await hook.act(async () => {
      expect(await executeRegisteredTool('void_result')).toBeNull();
    });
    expect(hook.result.current.state).toMatchObject({ error: null, executionCount: 1 });
  });

  it.each([
    { result: 'a BigInt', value: 1n },
    { result: 'a function', value: () => 'not JSON' },
  ])('fails an agent call that returns $result and records the error', async ({ value }) => {
    const hook = await renderHook(() =>
      useWebMCP({
        name: 'unserializable_result',
        description: 'Returns non-JSON',
        execute: () => value,
      })
    );
    await hook.act(async () => {
      await expect(executeRegisteredTool('unserializable_result')).rejects.toMatchObject({
        name: 'UnknownError',
      });
    });
    expect(hook.result.current.state).toMatchObject({ lastResult: null, executionCount: 0 });
    expect(hook.result.current.state.error?.message).toBe(
      'Tool "unserializable_result" returned a result that is not JSON-serializable'
    );
  });

  it('rejects a Standard Schema validator without registering', async () => {
    const register = vi.spyOn(document.modelContext!, 'registerTool');
    // Zod defines ~standard as a non-enumerable property.
    const inputSchema = Object.defineProperty({ type: 'object' }, '~standard', {
      value: { version: 1, vendor: 'zod', validate: () => ({ value: {} }) },
    });
    const hook = await renderHook(() =>
      useWebMCP({
        name: 'standard_schema',
        description: 'Uses a validator',
        inputSchema,
        execute: () => 'ok',
      })
    );
    expect(hook.result.current.registrationError?.message).toContain('@mcp-b/react-webmcp');
    expect(register).not.toHaveBeenCalled();
    expect(await findTool('standard_schema')).toBeUndefined();
  });

  it('reports a schema that serializes to undefined and recovers after correction', async () => {
    const invalid = { type: 'object', toJSON: () => undefined };
    const hook = await renderHook(({ broken }: { broken: boolean } = { broken: true }) =>
      useWebMCP({
        name: 'undefined_schema',
        description: 'Requires serializable metadata',
        inputSchema: broken ? invalid : { type: 'object' },
        execute: () => 'ok',
      })
    );
    expect(hook.result.current.registrationError?.message).toBe(
      'inputSchema must serialize to JSON'
    );
    expect(await findTool('undefined_schema')).toBeUndefined();
    await hook.rerender({ broken: false });
    expect(hook.result.current.registrationError).toBeNull();
    expect(await findTool('undefined_schema')).toMatchObject({ inputSchema: { type: 'object' } });
  });

  it.each(['schema', 'annotations'] as const)(
    'reports circular %s without registering and recovers after correction',
    async (source) => {
      const register = vi.spyOn(document.modelContext!, 'registerTool');
      const circular: CircularInputSchema = { type: 'object', properties: {} };
      circular.properties.self = circular;
      const annotations: CircularAnnotations = { readOnlyHint: true };
      annotations.self = annotations;
      const hook = await renderHook(({ broken }: { broken: boolean } = { broken: true }) =>
        useWebMCP({
          name: 'circular_schema',
          description: 'Reports unserializable schemas',
          inputSchema: broken && source === 'schema' ? circular : { type: 'object' },
          ...(broken && source === 'annotations' && { annotations }),
          execute: () => 'ok',
        })
      );
      expect(hook.result.current.registrationError).toBeInstanceOf(TypeError);
      expect(await findTool('circular_schema')).toBeUndefined();
      expect(register).not.toHaveBeenCalled();
      await hook.rerender({ broken: false });
      await expect.poll(() => findTool('circular_schema')).toBeDefined();
      expect(hook.result.current.registrationError).toBeNull();
      expect(await findTool('circular_schema')).toMatchObject({ inputSchema: { type: 'object' } });
    }
  );
});
