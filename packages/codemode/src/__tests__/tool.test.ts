import { describe, expect, it } from 'vitest';
import { createCodeTool } from '../tool';

describe('createCodeTool', () => {
  it('uses a custom code normalizer when provided', async () => {
    const codemode = createCodeTool({
      tools: {
        ping: {
          inputSchema: { type: 'object' },
          execute: async () => 'pong',
        },
      },
      executor: {
        execute: async (code, fns) => ({
          result: {
            code,
            value: await fns.ping?.({}),
          },
          logs: [],
        }),
      },
      normalizeCode: () => 'async () => { return "custom"; }',
    });

    const result = await (
      codemode as { execute: (input: { code: string }) => Promise<unknown> }
    ).execute({
      code: 'ping()',
    });

    expect(result).toEqual({
      code: 'ping()',
      result: {
        code: 'async () => { return "custom"; }',
        value: 'pong',
      },
      logs: [],
    });
  });
});
