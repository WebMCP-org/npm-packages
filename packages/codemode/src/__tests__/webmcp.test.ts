import { describe, expect, it } from 'vitest';
import {
  createCodeToolFromModelContextTesting,
  modelContextTestingToCodemodeTools,
} from '../webmcp';

describe('modelContextTestingToCodemodeTools', () => {
  it('converts listed tools into executable codemode descriptors', async () => {
    const modelContextTesting = {
      listTools: () => [
        {
          name: 'sum',
          description: 'Add two numbers',
          inputSchema: JSON.stringify({
            type: 'object',
            properties: {
              a: { type: 'number', description: 'First number' },
              b: { type: 'number', description: 'Second number' },
            },
            required: ['a', 'b'],
          }),
        },
      ],
      executeTool: async (toolName: string, inputArgsJson: string) => {
        const args = JSON.parse(inputArgsJson) as { a: number; b: number };
        return JSON.stringify({
          toolName,
          total: args.a + args.b,
        });
      },
    };

    const tools = modelContextTestingToCodemodeTools(modelContextTesting);
    const result = await tools.sum?.execute?.({ a: 2, b: 3 });

    expect(tools.sum?.description).toBe('Add two numbers');
    expect(tools.sum?.inputSchema).toEqual({
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' },
      },
      required: ['a', 'b'],
    });
    expect(result).toEqual({
      toolName: 'sum',
      total: 5,
    });
  });

  it('falls back to an object schema when testing inputSchema is missing or invalid', () => {
    const tools = modelContextTestingToCodemodeTools({
      listTools: () => [
        { name: 'missing', description: 'Missing schema' },
        { name: 'invalid', description: 'Invalid schema', inputSchema: '{not-json' },
      ],
      executeTool: async () => null,
    });

    expect(tools.missing?.inputSchema).toEqual({ type: 'object' });
    expect(tools.invalid?.inputSchema).toEqual({ type: 'object' });
  });

  it('returns raw strings when testing execution returns non-JSON content', async () => {
    const tools = modelContextTestingToCodemodeTools({
      listTools: () => [
        {
          name: 'echo',
          description: 'Echo text',
          inputSchema: JSON.stringify({ type: 'object' }),
        },
      ],
      executeTool: async () => 'plain text result',
    });

    await expect(tools.echo?.execute?.({ message: 'hello' })).resolves.toBe('plain text result');
  });
});

describe('createCodeToolFromModelContextTesting', () => {
  it('creates a codemode tool that executes through modelContextTesting', async () => {
    const codemode = createCodeToolFromModelContextTesting({
      modelContextTesting: {
        listTools: () => [
          {
            name: 'sum',
            description: 'Add two numbers',
            inputSchema: JSON.stringify({
              type: 'object',
              properties: {
                a: { type: 'number', description: 'First number' },
                b: { type: 'number', description: 'Second number' },
              },
              required: ['a', 'b'],
            }),
          },
        ],
        executeTool: async (_toolName: string, inputArgsJson: string) => {
          const args = JSON.parse(inputArgsJson) as { a: number; b: number };
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

    expect((codemode as { description?: string }).description).toContain('type SumInput = {');
    expect((codemode as { description?: string }).description).toContain(
      '@param input.a - First number'
    );

    const result = await (
      codemode as { execute: (input: { code: string }) => Promise<unknown> }
    ).execute({
      code: 'async () => { return await codemode.sum({ a: 4, b: 5 }); }',
    });

    expect(result).toEqual({
      code: 'async () => { return await codemode.sum({ a: 4, b: 5 }); }',
      result: 9,
      logs: [],
    });
  });
});
