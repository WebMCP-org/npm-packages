import { executionState } from '@mcp-b/webmcp-plugins/execution-state';
import { initializeWebModelContext } from '@mcp-b/global';
import type { CallToolResult, ChromeModelContext, ModelContext } from '@mcp-b/webmcp-types';
import { StrictMode, createElement } from 'react';
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
    const execution = executionState();
    const { act, unmount } = await renderHook(
      () =>
        useWebMCP({
          plugins: [execution],
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

    let response: CallToolResult | undefined;
    await act(async () => {
      response = await executeRegisteredTool('browser_greet', { name: 'Ada' });
    });
    expect(response?.content[0]).toMatchObject({ type: 'text', text: 'Hello, Ada' });
    expect(execution.getSnapshot().lastResult).toBe('Hello, Ada');
    expect(execution.getSnapshot().executionCount).toBe(1);

    await unmount();
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
    const execution = executionState();
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const { act } = await renderHook(() =>
      useWebMCP({
        plugins: [execution],
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
    expect(execution.getSnapshot().executionCount).toBe(0);
    expect(execution.getSnapshot().error?.message).toContain('JSON-serializable');
  });

  it.each(['default', 'custom'] as const)(
    'formats agent failures as MCP errors while local calls reject (%s)',
    async (formatter) => {
      const execution = executionState();
      const register = vi.spyOn(document.modelContext, 'registerTool');
      try {
        const failure = new Error('Handler failed');
        const formatError =
          formatter === 'custom'
            ? vi.fn((error: Error) => ({
                content: [{ type: 'text', text: `Custom: ${error.message}` }],
                isError: true,
              }))
            : undefined;
        const hook = await renderHook(() =>
          useWebMCP({
            plugins: [execution],
            name: 'mcp_agent_failure',
            description: 'Preserves agent and local error contracts',
            ...(formatError && { formatError }),
            execute: () => {
              throw failure;
            },
          })
        );
        const tool = register.mock.calls.find(([tool]) => tool.name === 'mcp_agent_failure')?.[0];
        if (!tool) throw new Error('Tool was not registered');

        await hook.act(async () => {
          await expect(tool.execute({}, { signal: new AbortController().signal })).resolves.toEqual(
            {
              content: [
                { type: 'text', text: `${formatter === 'custom' ? 'Custom: ' : ''}Handler failed` },
              ],
              isError: true,
            }
          );
          await expect(hook.result.current.execute({})).rejects.toBe(failure);
        });
        expect(execution.getSnapshot()).toEqual({
          isExecuting: false,
          lastResult: null,
          error: failure,
          executionCount: 0,
        });
        if (formatError) expect(formatError).toHaveBeenCalledExactlyOnceWith(failure);
      } finally {
        register.mockRestore();
      }
    }
  );

  it('formats Standard Schema failures before the handler runs', async () => {
    const execution = executionState();
    const register = vi.spyOn(document.modelContext, 'registerTool');
    try {
      const execute = vi.fn(() => 'unexpected');
      const hook = await renderHook(() =>
        useWebMCP({
          plugins: [execution],
          name: 'mcp_validation_failure',
          description: 'Formats invalid input for agents',
          inputSchema: z.object({ count: z.string().regex(/^\d+$/, 'Use digits') }),
          execute,
        })
      );
      const tool = register.mock.calls.find(
        ([tool]) => tool.name === 'mcp_validation_failure'
      )?.[0];
      if (!tool) throw new Error('Tool was not registered');

      await hook.act(async () => {
        await expect(
          tool.execute({ count: 'invalid' }, { signal: new AbortController().signal })
        ).resolves.toEqual({
          content: [{ type: 'text', text: 'Invalid tool input: Use digits' }],
          isError: true,
        });
        await expect(hook.result.current.execute({ count: 'invalid' })).rejects.toThrow(
          'Use digits'
        );
      });
      expect(execute).not.toHaveBeenCalled();
      expect(execution.getSnapshot()).toEqual({
        isExecuting: false,
        lastResult: null,
        error: new TypeError('Invalid tool input: Use digits'),
        executionCount: 0,
      });
    } finally {
      register.mockRestore();
    }
  });

  it('keeps cancelled agent calls rejected instead of formatting an MCP error', async () => {
    const execution = executionState();
    const register = vi.spyOn(document.modelContext, 'registerTool');
    try {
      const started = Promise.withResolvers<void>();
      const hook = await renderHook(() =>
        useWebMCP({
          plugins: [execution],
          name: 'mcp_agent_cancellation',
          description: 'Preserves cancellation through error formatting',
          execute: () => {
            started.resolve();
            return new Promise<never>(() => {});
          },
        })
      );
      const tool = register.mock.calls.find(
        ([tool]) => tool.name === 'mcp_agent_cancellation'
      )?.[0];
      if (!tool) throw new Error('Tool was not registered');
      const controller = new AbortController();
      const reason = new Error('Cancelled');

      await hook.act(async () => {
        const execution = tool.execute({}, { signal: controller.signal });
        const rejection = expect(execution).rejects.toBe(reason);
        await started.promise;
        controller.abort(reason);
        await rejection;
      });
      expect(execution.getSnapshot()).toEqual({
        isExecuting: false,
        lastResult: null,
        error: reason,
        executionCount: 0,
      });
    } finally {
      register.mockRestore();
    }
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
    await unmount();
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
  it('validates and transforms input once while preserving MCP output metadata', async () => {
    const execution = executionState();
    const inputSchema = z.object({ count: z.string().transform(Number) });
    const validate = vi.spyOn(inputSchema['~standard'], 'validate');
    const hook = await renderHook(() =>
      useWebMCP({
        plugins: [execution],
        name: 'mcp_validated',
        description: 'Validates MCP input',
        inputSchema,
        outputSchema: {
          type: 'object',
          properties: { total: { type: 'number' } },
          required: ['total'],
        },
        execute: ({ count }) => ({ total: count + 1 }),
      })
    );
    await hook.act(async () => {
      expect(await executeRegisteredTool('mcp_validated', { count: '2' })).toMatchObject({
        structuredContent: { total: 3 },
      });
    });
    expect(validate).toHaveBeenCalledTimes(1);
    expect(execution.getSnapshot().lastResult).toEqual({ total: 3 });
    validate.mockRestore();
  });
});
