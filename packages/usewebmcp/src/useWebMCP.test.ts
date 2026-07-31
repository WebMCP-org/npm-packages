import { initializeWebModelContext } from '@mcp-b/global';
import type { CallToolResult, ChromeModelContext, ModelContextCore } from '@mcp-b/webmcp-types';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { z } from 'zod';
import { useWebMCP } from './useWebMCP.js';

const TEST_CHANNEL_ID = `usewebmcp-browser-${Date.now()}`;

function hasDescriptorExecution(context: ModelContextCore): context is ChromeModelContext {
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
    const { act, result, unmount } = await renderHook(() =>
      useWebMCP({
        name: 'browser_greet',
        description: 'Greets a person',
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        } as const,
        execute: async ({ name }) => `Hello, ${name}`,
      })
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

  it('tracks manual execution, callbacks, errors, and reset state', async () => {
    const successes: number[] = [];
    const failures: string[] = [];
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
        onSuccess: (value) => successes.push(value),
        onError: (error) => failures.push(error.message),
      })
    );

    await act(async () => {
      await result.current.execute({ value: 5 });
    });
    expect(result.current.state.lastResult).toBe(10);
    expect(successes).toEqual([10]);

    await act(async () => {
      await expect(result.current.execute({ value: -1 })).rejects.toThrow('value must be positive');
    });
    expect(result.current.state.error?.message).toBe('value must be positive');
    expect(failures).toEqual(['value must be positive']);

    await act(async () => result.current.reset());
    expect(result.current.state).toEqual({
      isExecuting: false,
      lastResult: null,
      error: null,
      executionCount: 0,
    });
  });

  it('uses execute in preference to the legacy handler alias', async () => {
    const { act } = await renderHook(() =>
      useWebMCP({
        name: 'browser_execute_precedence',
        description: 'Checks implementation selection',
        execute: async () => 'execute',
        handler: async () => 'handler',
      })
    );

    let response: CallToolResult | undefined;
    await act(async () => {
      response = await executeRegisteredTool('browser_execute_precedence');
    });
    expect(response?.content[0]).toMatchObject({ type: 'text', text: 'execute' });
  });

  it('uses the latest implementation without re-registering the descriptor', async () => {
    const { act, rerender } = await renderHook(
      ({ version }) =>
        useWebMCP({
          name: 'browser_latest_execute',
          description: 'Uses the latest closure',
          execute: async () => version,
        }),
      { initialProps: { version: 'first' } }
    );

    const firstTool = await findTool('browser_latest_execute');
    await rerender({ version: 'second' });
    const secondTool = await findTool('browser_latest_execute');

    let response: CallToolResult | undefined;
    await act(async () => {
      response = await executeRegisteredTool('browser_latest_execute');
    });
    expect(response?.content[0]).toMatchObject({ type: 'text', text: 'second' });
    expect(secondTool?.name).toBe(firstTool?.name);
  });

  it('re-registers metadata only when declared dependencies change', async () => {
    const { rerender } = await renderHook(
      ({ description, revision }) =>
        useWebMCP(
          {
            name: 'browser_dependency',
            description,
            execute: async () => revision,
          },
          [revision]
        ),
      {
        initialProps: {
          description: 'Revision one',
          revision: 1,
        },
      }
    );

    expect((await findTool('browser_dependency'))?.description).toBe('Revision one');
    await rerender({ description: 'Revision two', revision: 2 });
    expect((await findTool('browser_dependency'))?.description).toBe('Revision two');
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
