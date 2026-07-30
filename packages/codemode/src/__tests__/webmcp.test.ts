import type { RegisteredTool } from '@mcp-b/webmcp-types';
import { describe, expect, it, vi } from 'vitest';
import {
  createCodeToolFromModelContext,
  modelContextToCodemodeTools,
  registeredToolsToCodemode,
} from '../webmcp';

function registeredTool(
  name: string,
  inputSchema?: Record<string, unknown> | string
): RegisteredTool {
  return {
    name,
    description: name === 'sum' ? 'Add two numbers' : name,
    ...(inputSchema === undefined
      ? {}
      : {
          inputSchema: typeof inputSchema === 'string' ? inputSchema : JSON.stringify(inputSchema),
        }),
    origin: window.location.origin,
    window,
  };
}

describe('registeredToolsToCodemode', () => {
  it('converts serialized WebMCP schemas and falls back for invalid schemas', () => {
    const tools = registeredToolsToCodemode([
      registeredTool('sum', {
        type: 'object',
        properties: {
          a: { type: 'number', description: 'First number' },
          b: { type: 'number', description: 'Second number' },
        },
        required: ['a', 'b'],
      }),
      registeredTool('invalid', '{not-json'),
    ]);

    expect(tools.sum).toMatchObject({
      description: 'Add two numbers',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'number', description: 'First number' },
          b: { type: 'number', description: 'Second number' },
        },
        required: ['a', 'b'],
      },
    });
    expect(tools.invalid?.inputSchema).toEqual({ type: 'object' });
  });
});

describe('modelContextToCodemodeTools', () => {
  it('refreshes the RegisteredTool descriptor before execution and unwraps structured output', async () => {
    const initial = registeredTool('sum', { type: 'object' });
    const current = registeredTool('sum', { type: 'object' });
    const getTools = vi.fn().mockResolvedValueOnce([initial]).mockResolvedValue([current]);
    const executeTool = vi.fn(async (_tool: RegisteredTool, input: string) => {
      const args = JSON.parse(input) as { a: number; b: number };
      return JSON.stringify({
        content: [{ type: 'text', text: String(args.a + args.b) }],
        structuredContent: { total: args.a + args.b },
      });
    });

    const tools = await modelContextToCodemodeTools({ getTools, executeTool });

    await expect(tools.sum?.execute?.({ a: 2, b: 3 })).resolves.toEqual({ total: 5 });
    expect(executeTool).toHaveBeenCalledWith(current, JSON.stringify({ a: 2, b: 3 }));
  });

  it('preserves direct string results from Chrome', async () => {
    const tool = registeredTool('echo', { type: 'object' });
    const tools = await modelContextToCodemodeTools({
      getTools: async () => [tool],
      executeTool: async () => 'plain text result',
    });

    await expect(tools.echo?.execute?.({ message: 'hello' })).resolves.toBe('plain text result');
  });
});

describe('createCodeToolFromModelContext', () => {
  it('creates a codemode tool from the current document API', async () => {
    const tool = registeredTool('sum', {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' },
      },
      required: ['a', 'b'],
    });
    const codemode = await createCodeToolFromModelContext({
      modelContext: {
        getTools: async () => [tool],
        executeTool: async (_tool, input) => {
          const args = JSON.parse(input) as { a: number; b: number };
          return JSON.stringify(args.a + args.b);
        },
      },
      executor: {
        execute: async (_code, fns) => ({
          result: await fns.sum?.({ a: 4, b: 5 }),
          logs: [],
        }),
      },
    });

    expect(codemode.description).toContain('type SumInput = {');
    await expect(
      codemode.execute?.(
        {
          code: 'async () => { return await codemode.sum({ a: 4, b: 5 }); }',
        },
        { toolCallId: 'test-call', messages: [] }
      )
    ).resolves.toEqual({
      code: 'async () => { return await codemode.sum({ a: 4, b: 5 }); }',
      result: 9,
      logs: [],
    });
  });
});
