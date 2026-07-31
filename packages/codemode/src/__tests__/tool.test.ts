import { describe, expect, it } from 'vitest';
import { createCodeTool } from '../tool';

describe('createCodeTool', () => {
  it('rejects tool names that collide after JavaScript identifier sanitization', () => {
    expect(() =>
      createCodeTool({
        tools: {
          'get-weather': {
            inputSchema: { type: 'object' },
            execute: async () => 'hyphen',
          },
          get_weather: {
            inputSchema: { type: 'object' },
            execute: async () => 'underscore',
          },
        },
        executor: {
          execute: async () => ({ result: null, logs: [] }),
        },
      })
    ).toThrow(
      'Tool names "get-weather" and "get_weather" both map to the JavaScript identifier "get_weather"'
    );
  });

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
