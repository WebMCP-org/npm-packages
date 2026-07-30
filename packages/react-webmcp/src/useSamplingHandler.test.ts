import { describe, expect, it } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { installConnectedModelContext } from './connected-model-context.test-helper.js';
import { useSampling } from './useSamplingHandler.js';

describe('useSampling with a real MCP v2 client', () => {
  it('requests a model response and tracks the observable request state', async () => {
    const connection = await installConnectedModelContext({ sampling: {} }, (client) => {
      client.setRequestHandler('sampling/createMessage', async () => ({
        model: 'test-model',
        role: 'assistant',
        content: {
          type: 'text',
          text: 'Response from the connected client',
        },
      }));
    });
    let successCount = 0;
    const hook = await renderHook(() =>
      useSampling({
        onSuccess: () => {
          successCount += 1;
        },
      })
    );

    try {
      let response: unknown;
      await hook.act(async () => {
        response = await hook.result.current.createMessage({
          messages: [
            {
              role: 'user',
              content: { type: 'text', text: 'Say hello' },
            },
          ],
          maxTokens: 50,
        });
      });

      expect(response).toMatchObject({
        model: 'test-model',
        role: 'assistant',
        content: {
          type: 'text',
          text: 'Response from the connected client',
        },
      });
      expect(hook.result.current.state).toMatchObject({
        isLoading: false,
        error: null,
        requestCount: 1,
        result: response,
      });
      expect(successCount).toBe(1);

      await hook.act(() => {
        hook.result.current.reset();
      });
      expect(hook.result.current.state).toEqual({
        isLoading: false,
        result: null,
        error: null,
        requestCount: 0,
      });
    } finally {
      await hook.unmount();
      await connection.close();
    }
  });
});
