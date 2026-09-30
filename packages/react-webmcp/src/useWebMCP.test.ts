import { cleanupWebModelContext, initializeWebModelContext } from '@mcp-b/global';
import { TabClientTransport } from '@mcp-b/transports';
import type { CallToolResult, JsonObject, WebMCP } from '@mcp-b/webmcp-ts-sdk';
import { Client } from '@modelcontextprotocol/client';
import { CallToolResultSchema } from '@modelcontextprotocol/core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { z } from 'zod';
import { useWebMCP } from './useWebMCP.js';

type CircularOutput = { self?: CircularOutput; ok?: boolean };

let client: Client;

function modelContext(): WebMCP.ModelContext {
  if (!document.modelContext) throw new Error('document.modelContext is unavailable');
  return document.modelContext;
}

async function findTool(name: string) {
  return (await modelContext().getTools()).find((tool) => tool.name === name);
}

async function executeRegisteredTool(
  name: string,
  args: JsonObject = {},
  options?: WebMCP.ModelContextExecuteToolOptions
): Promise<CallToolResult> {
  const tool = await findTool(name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  const serialized = await modelContext().executeTool(tool, args, options);
  return CallToolResultSchema.parse(JSON.parse(serialized));
}

describe('useWebMCP in a browser runtime', () => {
  beforeAll(async () => {
    cleanupWebModelContext();
    const channelId = `usewebmcp-${crypto.randomUUID()}`;
    initializeWebModelContext({
      transport: {
        iframeServer: false,
        tabServer: { channelId, allowedOrigins: [window.location.origin] },
      },
    });
    client = new Client(
      { name: 'usewebmcp-test-client', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } }
    );
    await client.connect(
      new TabClientTransport({ channelId, targetOrigin: window.location.origin })
    );
  });

  afterAll(() => client.close());

  afterEach(() => vi.restoreAllMocks());

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

    expect((await findTool('browser_total'))?.inputSchema).toMatchObject({
      required: ['left', 'right'],
    });
    let response: CallToolResult | undefined;
    await act(async () => {
      response = await executeRegisteredTool('browser_total', { left: 3, right: 4 });
    });
    expect(response?.structuredContent).toEqual({ total: 7 });
  });

  it('records non-serializable schema output as an execution error', async () => {
    const cyclic: CircularOutput = {};
    cyclic.self = cyclic;
    const { act, result } = await renderHook(() =>
      useWebMCP({
        name: 'browser_invalid_output',
        description: 'Returns invalid structured output',
        outputSchema: { type: 'object', properties: { ok: { type: 'boolean' } } } as const,
        execute: async () => cyclic,
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

  it.each(['default', 'custom'] as const)(
    'formats agent failures as MCP errors while local calls reject (%s)',
    async (formatter) => {
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
          name: 'mcp_agent_failure',
          description: 'Preserves agent and local error contracts',
          ...(formatError && { formatError }),
          execute: () => {
            throw failure;
          },
        })
      );

      await hook.act(async () => {
        expect(await executeRegisteredTool('mcp_agent_failure')).toEqual({
          content: [
            { type: 'text', text: `${formatter === 'custom' ? 'Custom: ' : ''}Handler failed` },
          ],
          isError: true,
        });
        await expect(hook.result.current.execute({})).rejects.toBe(failure);
      });
      expect(hook.result.current.state).toEqual({
        isExecuting: false,
        lastResult: null,
        error: failure,
        executionCount: 0,
      });
      if (formatError) expect(formatError).toHaveBeenCalledExactlyOnceWith(failure);
    }
  );

  it('formats Standard Schema failures before the handler runs', async () => {
    const execute = vi.fn(() => 'unexpected');
    const hook = await renderHook(() =>
      useWebMCP({
        name: 'mcp_validation_failure',
        description: 'Formats invalid input for agents',
        inputSchema: z.object({ count: z.string().regex(/^\d+$/, 'Use digits') }),
        execute,
      })
    );

    await hook.act(async () => {
      expect(await executeRegisteredTool('mcp_validation_failure', { count: 'invalid' })).toEqual({
        content: [{ type: 'text', text: 'Invalid tool input: Use digits' }],
        isError: true,
      });
      await expect(hook.result.current.execute({ count: 'invalid' })).rejects.toThrow('Use digits');
    });
    expect(execute).not.toHaveBeenCalled();
    expect(hook.result.current.state).toEqual({
      isExecuting: false,
      lastResult: null,
      error: new TypeError('Invalid tool input: Use digits'),
      executionCount: 0,
    });
  });

  it('keeps cancelled agent calls rejected instead of formatting an MCP error', async () => {
    const started = Promise.withResolvers<void>();
    const formatError = vi.fn((error: Error) => error.message);
    const hook = await renderHook(() =>
      useWebMCP({
        name: 'mcp_agent_cancellation',
        description: 'Preserves cancellation through error formatting',
        formatError,
        execute: () => {
          started.resolve();
          return new Promise<never>(() => {});
        },
      })
    );
    const controller = new AbortController();
    const reason = new Error('Cancelled');

    await hook.act(async () => {
      const execution = executeRegisteredTool(
        'mcp_agent_cancellation',
        {},
        {
          signal: controller.signal,
        }
      );
      const rejection = expect(execution).rejects.toBe(reason);
      await started.promise;
      controller.abort(reason);
      await rejection;
    });
    // The runtime rejects the caller first, then aborts the callback with its own AbortError.
    await vi.waitFor(() => expect(hook.result.current.state.error?.name).toBe('AbortError'));
    expect(formatError).not.toHaveBeenCalled();
    expect(hook.result.current.state).toMatchObject({
      isExecuting: false,
      lastResult: null,
      executionCount: 0,
    });
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

  it('sends a void result to agents as text', async () => {
    const hook = await renderHook(() =>
      useWebMCP({ name: 'browser_void', description: 'Returns nothing', execute: () => {} })
    );

    await hook.act(async () => {
      expect(await executeRegisteredTool('browser_void')).toEqual({
        content: [{ type: 'text', text: 'undefined' }],
        isError: false,
      });
    });
  });

  it.each(['output', 'error'] as const)(
    'uses the call-start %s formatter across a configuration update',
    async (stage) => {
      const name = `mcp_snapshot_${stage}`;
      const firstResult = Promise.withResolvers<string>();
      const started = Promise.withResolvers<void>();
      const failure = new Error('Handler failed');
      const register = vi.spyOn(modelContext(), 'registerTool');
      const hook = await renderHook(
        ({ revision }: { revision: string } = { revision: 'A' }) =>
          useWebMCP({
            name,
            description: 'Keeps each execution and formatter paired',
            execute: () => {
              if (revision === 'A') {
                started.resolve();
                return firstResult.promise;
              }
              if (stage === 'error') throw failure;
              return 'next';
            },
            formatOutput: (value) => `${revision}:${value}`,
            formatError: (error) => `${revision}:${error.message}`,
          }),
        { initialProps: { revision: 'A' } }
      );
      const tool = await findTool(name);
      if (!tool) throw new Error('Tool was not registered');
      let first!: Promise<string>;
      await hook.act(async () => {
        first = modelContext().executeTool(tool, {});
        await started.promise;
      });

      await hook.rerender({ revision: 'B' });
      expect(register.mock.calls.filter(([registered]) => registered.name === name)).toHaveLength(
        1
      );
      await hook.act(async () => {
        if (stage === 'output') firstResult.resolve('first');
        else firstResult.reject(failure);
        await expect(first).resolves.toBe(
          JSON.stringify(stage === 'output' ? 'A:first' : 'A:Handler failed')
        );
        await expect(modelContext().executeTool(tool, {})).resolves.toBe(
          JSON.stringify(stage === 'output' ? 'B:next' : 'B:Handler failed')
        );
      });
    }
  );

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

  it('validates and transforms Standard Schema input once for MCP clients and executeTool', async () => {
    const inputSchema = z.object({
      count: z.string().regex(/^\d+$/, 'Use digits').transform(Number),
      limit: z.number().default(10),
    });
    const validate = vi.spyOn(inputSchema['~standard'], 'validate');
    const received: number[] = [];
    const hook = await renderHook(() =>
      useWebMCP({
        name: 'mcp_transformed',
        description: 'Adds a numeric count to a limit',
        inputSchema,
        outputSchema: {
          type: 'object',
          properties: { total: { type: 'number' } },
          required: ['total'],
        },
        execute: ({ count, limit }) => {
          received.push(count);
          return { total: count + limit };
        },
      })
    );

    await hook.act(async () => {
      expect(
        await client.callTool({ name: 'mcp_transformed', arguments: { count: '2' } })
      ).toMatchObject({ isError: false, structuredContent: { total: 12 } });
      expect(await executeRegisteredTool('mcp_transformed', { count: '3' })).toMatchObject({
        structuredContent: { total: 13 },
      });
    });
    expect(received).toEqual([2, 3]);
    expect(validate).toHaveBeenCalledTimes(2);
    expect(hook.result.current.state.lastResult).toEqual({ total: 13 });
  });
});
