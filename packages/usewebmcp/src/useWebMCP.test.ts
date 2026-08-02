import { initializeWebModelContext } from '@mcp-b/global';
import type { CallToolResult, ChromeModelContext, ModelContext } from '@mcp-b/webmcp-types';
import { StrictMode, Suspense, createElement, useLayoutEffect } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { z } from 'zod';
import { useWebMCP } from './useWebMCP.js';

const TEST_CHANNEL_ID = `usewebmcp-browser-${Date.now()}`;

function hasDescriptorExecution(context: ModelContext): context is ChromeModelContext {
  return 'executeTool' in context && typeof context.executeTool === 'function';
}

async function executeRegisteredTool(
  name: string,
  args: Record<string, unknown> = {}
): Promise<CallToolResult> {
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

  return JSON.parse(serialized) as CallToolResult;
}

async function findTool(name: string) {
  return (await document.modelContext.getTools()).find((tool) => tool.name === name);
}

describe('useWebMCP in a browser runtime', () => {
  beforeAll(() => {
    if (!document.modelContext) {
      initializeWebModelContext({
        transport: {
          tabServer: {
            channelId: TEST_CHANNEL_ID,
            allowedOrigins: [window.location.origin],
          },
        },
      });
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
    expect(JSON.parse(tool?.inputSchema ?? '{}')).toMatchObject({
      type: 'object',
      required: ['name'],
    });

    let response: CallToolResult | undefined;
    await act(async () => {
      response = await executeRegisteredTool('browser_greet', { name: 'Ada' });
    });
    expect(response?.content[0]).toMatchObject({ type: 'text', text: 'Hello, Ada' });
    expect(result.current.state.lastResult).toBe('Hello, Ada');
    expect(result.current.state.executionCount).toBe(1);

    unmount();
    expect(await findTool('browser_greet')).toBeUndefined();
  });

  it('publishes JSON structured content when an output schema is present', async () => {
    const { act } = await renderHook(() =>
      useWebMCP({
        name: 'browser_total',
        description: 'Adds two numbers',
        inputSchema: {
          type: 'object',
          properties: {
            left: { type: 'number' },
            right: { type: 'number' },
          },
          required: ['left', 'right'],
        } as const,
        outputSchema: {
          type: 'object',
          properties: { total: { type: 'number' } },
          required: ['total'],
        } as const,
        execute: async ({ left, right }) => ({ total: left + right }),
      })
    );

    let response: CallToolResult | undefined;
    await act(async () => {
      response = await executeRegisteredTool('browser_total', { left: 3, right: 4 });
    });
    expect(response?.structuredContent).toEqual({ total: 7 });
  });

  it('records non-serializable schema output as an execution error', async () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const { act, result } = await renderHook(() =>
      useWebMCP({
        name: 'browser_invalid_output',
        description: 'Returns invalid structured output',
        outputSchema: { type: 'object', properties: { ok: { type: 'boolean' } } } as const,
        execute: async () => cyclic as { ok?: boolean },
      })
    );

    let response: CallToolResult | undefined;
    await act(async () => {
      response = await executeRegisteredTool('browser_invalid_output');
    });
    expect(response?.isError).toBe(true);
    expect(result.current.state.executionCount).toBe(0);
    expect(result.current.state.error?.message).toContain('JSON-serializable');
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

  it('normalizes raw JSON and passes through existing MCP responses', async () => {
    const { act } = await renderHook(() => {
      useWebMCP({
        name: 'browser_response',
        description: 'Returns an MCP response',
        execute: async () => ({
          content: [{ type: 'text' as const, text: 'ready' }],
          isError: false,
        }),
      });
      useWebMCP({
        name: 'browser_raw_json',
        description: 'Returns raw JSON',
        execute: async () => ({ ready: true }),
      });
    });

    let response: CallToolResult | undefined;
    let rawResponse: CallToolResult | undefined;
    await act(async () => {
      [response, rawResponse] = await Promise.all([
        executeRegisteredTool('browser_response'),
        executeRegisteredTool('browser_raw_json'),
      ]);
    });
    expect(response).toEqual({
      content: [{ type: 'text', text: 'ready' }],
      isError: false,
    });
    expect(rawResponse?.structuredContent).toEqual({ ready: true });
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

    let response: CallToolResult | undefined;
    await act(async () => {
      response = await executeRegisteredTool('browser_latest_execute');
    });
    expect(response?.content[0]).toMatchObject({ type: 'text', text: 'second' });
    expect(
      registerTool.mock.calls.filter(([tool]) => tool.name === 'browser_latest_execute')
    ).toHaveLength(registrationsAfterMount);
    registerTool.mockRestore();
    unmount();
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

    let response: CallToolResult | undefined;
    await hook.act(async () => {
      response = await executeRegisteredTool('browser_committed_execute');
    });
    expect(response?.content[0]).toMatchObject({ type: 'text', text: 'committed' });
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

    const getValueDescription = async () => {
      const schema = JSON.parse((await findTool('browser_dependency'))?.inputSchema ?? '{}');
      return schema.properties.value.description;
    };
    expect(await getValueDescription()).toBe('Revision 1');
    await rerender({ revision: 2 });
    expect(await getValueDescription()).toBe('Revision 2');
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
    expect(JSON.parse(tool?.inputSchema ?? '{}')).toEqual({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: ['query'],
    });
  });
});
