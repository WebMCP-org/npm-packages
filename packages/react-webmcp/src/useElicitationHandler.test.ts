import { describe, expect, it } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { installConnectedModelContext } from './connected-model-context.test-helper.js';
import { useElicitation } from './useElicitationHandler.js';

const FORM_CAPABILITY = { elicitation: { form: {} } } as const;

describe('useElicitation with a real MCP v2 client', () => {
  it('requests user input and tracks the accepted result', async () => {
    const connection = await installConnectedModelContext(FORM_CAPABILITY, (client) => {
      client.setRequestHandler('elicitation/create', async () => ({
        action: 'accept',
        content: { displayName: 'Ada' },
      }));
    });
    let successCount = 0;
    const hook = await renderHook(() =>
      useElicitation({
        onSuccess: () => {
          successCount += 1;
        },
      })
    );

    try {
      let response: unknown;
      await hook.act(async () => {
        response = await hook.result.current.elicitInput({
          message: 'Choose a display name',
          requestedSchema: {
            type: 'object',
            properties: {
              displayName: { type: 'string' },
            },
            required: ['displayName'],
          },
        });
      });

      expect(response).toEqual({
        action: 'accept',
        content: { displayName: 'Ada' },
      });
      expect(hook.result.current.state).toMatchObject({
        isLoading: false,
        error: null,
        requestCount: 1,
        result: response,
      });
      expect(successCount).toBe(1);
    } finally {
      await hook.unmount();
      await connection.close();
    }
  });

  it('surfaces protocol request failures through state and callbacks', async () => {
    const connection = await installConnectedModelContext(FORM_CAPABILITY, (client) => {
      client.setRequestHandler('elicitation/create', async () => {
        throw new Error('User input is unavailable');
      });
    });
    const failures: Error[] = [];
    const hook = await renderHook(() =>
      useElicitation({
        onError: (error) => {
          failures.push(error);
        },
      })
    );

    try {
      await hook.act(async () => {
        await expect(
          hook.result.current.elicitInput({
            message: 'Choose a display name',
            requestedSchema: {
              type: 'object',
              properties: {
                displayName: { type: 'string' },
              },
            },
          })
        ).rejects.toThrow('User input is unavailable');
      });

      expect(hook.result.current.state.isLoading).toBe(false);
      expect(hook.result.current.state.error).toBeInstanceOf(Error);
      expect(failures).toHaveLength(1);
      expect(failures[0]?.message).toContain('User input is unavailable');
    } finally {
      await hook.unmount();
      await connection.close();
    }
  });
});
