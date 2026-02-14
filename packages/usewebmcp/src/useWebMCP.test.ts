import type { ModelContext, ModelContextTesting } from '@mcp-b/global';
import { initializeWebModelContext } from '@mcp-b/global';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { z } from 'zod';
import { useWebMCP } from './useWebMCP.js';

// Extend Navigator type for testing
declare global {
  interface Navigator {
    modelContext?: ModelContext;
    modelContextTesting?: ModelContextTesting;
  }
}

const TEST_CHANNEL_ID = `useWebMCP-test-${Date.now()}`;

function parseSerializedToolResponse(result: string | null | undefined): {
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
} {
  if (!result) {
    throw new Error('Expected serialized tool response, received null/undefined');
  }
  return JSON.parse(result) as {
    content: Array<{ type: string; text?: string }>;
    structuredContent?: Record<string, unknown>;
  };
}

describe('useWebMCP', () => {
  beforeAll(() => {
    if (!navigator.modelContext) {
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

  beforeEach(() => {
    navigator.modelContext?.clearContext();
    navigator.modelContextTesting?.reset();
  });

  describe('initial state', () => {
    it('should have correct initial state', async () => {
      const { result } = await renderHook(() =>
        useWebMCP({
          name: 'test_tool',
          description: 'Test tool',
          handler: async () => 'result',
        })
      );

      expect(result.current.state).toEqual({
        isExecuting: false,
        lastResult: null,
        error: null,
        executionCount: 0,
      });
    });

    it('should provide execute and reset functions', async () => {
      const { result } = await renderHook(() =>
        useWebMCP({
          name: 'test_tool',
          description: 'Test tool',
          handler: async () => 'result',
        })
      );

      expect(typeof result.current.execute).toBe('function');
      expect(typeof result.current.reset).toBe('function');
    });
  });

  describe('tool registration', () => {
    it('should register tool with navigator.modelContext', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'my_tool',
          description: 'My test tool',
          handler: async () => 'result',
        })
      );

      const tools = navigator.modelContextTesting?.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('my_tool');
      expect(tools[0].description).toBe('My test tool');
    });

    it('should register tool with input schema', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'greet',
          description: 'Greet someone',
          inputSchema: {
            name: z.string(),
          },
          handler: async ({ name }) => `Hello, ${name}!`,
        })
      );

      const tools = navigator.modelContextTesting?.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('greet');
      // The testing API returns inputSchema as a JSON string
      const inputSchema = JSON.parse(tools[0].inputSchema);
      expect(inputSchema.properties).toHaveProperty('name');
    });

    it('should unregister tool on unmount', async () => {
      const { unmount } = await renderHook(() =>
        useWebMCP({
          name: 'temp_tool',
          description: 'Temporary tool',
          handler: async () => 'result',
        })
      );

      expect(navigator.modelContextTesting?.listTools()).toHaveLength(1);

      unmount();

      expect(navigator.modelContextTesting?.listTools()).toHaveLength(0);
    });
  });

  describe('execute', () => {
    it('should execute handler and update state', async () => {
      const handler = vi.fn().mockResolvedValue('success');

      const { result, act } = await renderHook(() =>
        useWebMCP({
          name: 'test_tool',
          description: 'Test',
          handler,
        })
      );

      await act(async () => {
        await result.current.execute({ foo: 'bar' });
      });

      expect(handler).toHaveBeenCalledWith({ foo: 'bar' });
      expect(result.current.state.lastResult).toBe('success');
      expect(result.current.state.executionCount).toBe(1);
    });

    it('should validate input with Zod schema', async () => {
      const handler = vi.fn().mockResolvedValue('valid');

      const { result, act } = await renderHook(() =>
        useWebMCP({
          name: 'typed_tool',
          description: 'Test',
          inputSchema: {
            count: z.number(),
          },
          handler,
        })
      );

      // Valid input
      await act(async () => {
        await result.current.execute({ count: 42 });
      });

      expect(handler).toHaveBeenCalledWith({ count: 42 });

      // Invalid input should throw
      await act(async () => {
        try {
          await result.current.execute({ count: 'not a number' });
        } catch {
          // Expected
        }
      });

      expect(result.current.state.error).not.toBeNull();
    });

    it('should handle errors and update state', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Handler failed'));

      const { result, act } = await renderHook(() =>
        useWebMCP({
          name: 'failing_tool',
          description: 'Test',
          handler,
        })
      );

      await act(async () => {
        try {
          await result.current.execute({});
        } catch {
          // Expected
        }
      });

      expect(result.current.state.error).toBeInstanceOf(Error);
      expect(result.current.state.error?.message).toBe('Handler failed');
      expect(result.current.state.isExecuting).toBe(false);
    });
  });

  describe('MCP tool execution via testing API', () => {
    it('should execute tool via modelContextTesting', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'echo_tool',
          description: 'Echo input',
          inputSchema: {
            message: z.string(),
          },
          handler: async ({ message }) => `Echo: ${message}`,
        })
      );

      const result = await navigator.modelContextTesting?.executeTool(
        'echo_tool',
        JSON.stringify({ message: 'hello' })
      );

      const parsed = parseSerializedToolResponse(result);
      expect(parsed.content[0]?.type).toBe('text');
      expect(parsed.content[0]?.text).toBe('Echo: hello');
    });

    it('should return structured content when outputSchema is provided', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'calc_tool',
          description: 'Calculate',
          inputSchema: {
            a: z.number(),
            b: z.number(),
          },
          outputSchema: {
            result: z.number(),
          },
          handler: async ({ a, b }) => ({ result: a + b }),
        })
      );

      const result = await navigator.modelContextTesting?.executeTool(
        'calc_tool',
        JSON.stringify({ a: 5, b: 3 })
      );

      const parsed = parseSerializedToolResponse(result);
      expect(parsed.structuredContent).toEqual({ result: 8 });
    });
  });

  describe('callbacks', () => {
    it('should call onSuccess after successful execution', async () => {
      const onSuccess = vi.fn();
      const handler = vi.fn().mockResolvedValue('result');

      const { result, act } = await renderHook(() =>
        useWebMCP({
          name: 'test_tool',
          description: 'Test',
          handler,
          onSuccess,
        })
      );

      await act(async () => {
        await result.current.execute({ input: 'value' });
      });

      expect(onSuccess).toHaveBeenCalledWith('result', { input: 'value' });
    });

    it('should call onError after failed execution', async () => {
      const onError = vi.fn();
      const error = new Error('Failure');
      const handler = vi.fn().mockRejectedValue(error);

      const { result, act } = await renderHook(() =>
        useWebMCP({
          name: 'test_tool',
          description: 'Test',
          handler,
          onError,
        })
      );

      await act(async () => {
        try {
          await result.current.execute({ input: 'value' });
        } catch {
          // Expected
        }
      });

      expect(onError).toHaveBeenCalledWith(error, { input: 'value' });
    });
  });

  describe('reset', () => {
    it('should reset state to initial values', async () => {
      const handler = vi.fn().mockResolvedValue('result');

      const { result, act } = await renderHook(() =>
        useWebMCP({
          name: 'test_tool',
          description: 'Test',
          handler,
        })
      );

      await act(async () => {
        await result.current.execute({});
      });

      expect(result.current.state.lastResult).toBe('result');
      expect(result.current.state.executionCount).toBe(1);

      await act(async () => {
        result.current.reset();
      });

      expect(result.current.state).toEqual({
        isExecuting: false,
        lastResult: null,
        error: null,
        executionCount: 0,
      });
    });
  });

  describe('re-registration behavior', () => {
    it('should not re-register when rerendered with unchanged config', async () => {
      const registerToolSpy = vi.spyOn(navigator.modelContext as ModelContext, 'registerTool');
      const stableHandler = async () => 'result';

      try {
        const { rerender } = await renderHook(() =>
          useWebMCP({
            name: 'stable_tool',
            description: 'Stable tool',
            handler: stableHandler,
          })
        );

        expect(registerToolSpy).toHaveBeenCalledTimes(1);
        expect(navigator.modelContextTesting?.listTools()).toHaveLength(1);

        await rerender();

        expect(registerToolSpy).toHaveBeenCalledTimes(1);
        expect(navigator.modelContextTesting?.listTools()).toHaveLength(1);
      } finally {
        registerToolSpy.mockRestore();
      }
    });

    it('should re-register when name changes', async () => {
      const { rerender } = await renderHook(
        ({ name }) =>
          useWebMCP({
            name,
            description: 'Test',
            handler: async () => 'result',
          }),
        { initialProps: { name: 'tool_v1' } }
      );

      expect(navigator.modelContextTesting?.listTools()[0].name).toBe('tool_v1');

      await rerender({ name: 'tool_v2' });

      expect(navigator.modelContextTesting?.listTools()[0].name).toBe('tool_v2');
    });

    it('should re-register when description changes', async () => {
      const { rerender } = await renderHook(
        ({ description }) =>
          useWebMCP({
            name: 'test_tool',
            description,
            handler: async () => 'result',
          }),
        { initialProps: { description: 'Version 1' } }
      );

      expect(navigator.modelContextTesting?.listTools()[0].description).toBe('Version 1');

      await rerender({ description: 'Version 2' });

      expect(navigator.modelContextTesting?.listTools()[0].description).toBe('Version 2');
    });
  });

  describe('defaultFormatOutput', () => {
    it('should format non-string output as JSON via MCP response', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'json_tool',
          description: 'Returns an object',
          handler: async () => ({ key: 'value', count: 42 }),
        })
      );

      const result = await navigator.modelContextTesting?.executeTool(
        'json_tool',
        JSON.stringify({})
      );

      const parsed = parseSerializedToolResponse(result);
      expect(parsed.content[0]?.type).toBe('text');
      // Non-string output should be JSON.stringified with indentation
      expect(parsed.content[0]?.text).toBe(JSON.stringify({ key: 'value', count: 42 }, null, 2));
    });

    it('should return string output as-is via MCP response', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'string_tool',
          description: 'Returns a string',
          handler: async () => 'plain string result',
        })
      );

      const result = await navigator.modelContextTesting?.executeTool(
        'string_tool',
        JSON.stringify({})
      );

      const parsed = parseSerializedToolResponse(result);
      expect(parsed.content[0]?.text).toBe('plain string result');
    });
  });

  describe('custom formatOutput', () => {
    it('should use custom formatOutput for MCP text response', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'custom_fmt_tool',
          description: 'Custom format',
          handler: async () => ({ x: 1, y: 2 }),
          formatOutput: (output) =>
            `x=${(output as { x: number }).x},y=${(output as { y: number }).y}`,
        })
      );

      const result = await navigator.modelContextTesting?.executeTool(
        'custom_fmt_tool',
        JSON.stringify({})
      );

      const parsed = parseSerializedToolResponse(result);
      expect(parsed.content[0]?.text).toBe('x=1,y=2');
    });
  });

  describe('MCP handler error path', () => {
    it('should handle handler errors via MCP (testing API throws on isError)', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'error_mcp_tool',
          description: 'Throws an error',
          handler: async () => {
            throw new Error('MCP handler error');
          },
        })
      );

      // The testing API converts isError responses to thrown DOMException
      await expect(
        navigator.modelContextTesting?.executeTool('error_mcp_tool', JSON.stringify({}))
      ).rejects.toThrow('MCP handler error');
    });

    it('should handle validation errors via MCP (testing API throws on isError)', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'validation_error_tool',
          description: 'Has input validation',
          inputSchema: {
            count: z.number(),
          },
          handler: async ({ count }) => `Count: ${count}`,
        })
      );

      // The bridge validates input before calling the hook's mcpHandler.
      // Validation errors result in isError response, which testing API throws.
      await expect(
        navigator.modelContextTesting?.executeTool(
          'validation_error_tool',
          JSON.stringify({ count: 'not-a-number' })
        )
      ).rejects.toThrow();
    });

    it('should handle non-Error thrown values via MCP', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'string_throw_tool',
          description: 'Throws a string',
          handler: async () => {
            throw 'raw string error';
          },
        })
      );

      await expect(
        navigator.modelContextTesting?.executeTool('string_throw_tool', JSON.stringify({}))
      ).rejects.toThrow('raw string error');
    });
  });

  describe('execute with non-Error thrown values', () => {
    it('should wrap non-Error thrown values in Error', async () => {
      const handler = vi.fn().mockRejectedValue('string error');

      const { result, act } = await renderHook(() =>
        useWebMCP({
          name: 'non_error_tool',
          description: 'Test',
          handler,
        })
      );

      await act(async () => {
        try {
          await result.current.execute({});
        } catch {
          // Expected
        }
      });

      expect(result.current.state.error).toBeInstanceOf(Error);
      expect(result.current.state.error?.message).toBe('string error');
    });
  });

  describe('outputSchema with non-object result', () => {
    it('should throw error when outputSchema is defined but handler returns non-object', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'bad_output_tool',
          description: 'Returns string with outputSchema',
          outputSchema: {
            value: z.string(),
          },
          // @ts-expect-error - intentionally returning wrong type for test
          handler: async () => 'not an object',
        })
      );

      // The mcpHandler catches the error and returns isError response.
      // The testing API converts isError responses to thrown DOMExceptions.
      await expect(
        navigator.modelContextTesting?.executeTool('bad_output_tool', JSON.stringify({}))
      ).rejects.toThrow('outputSchema requires the handler to return a JSON object result');
    });

    it('should throw error when outputSchema is defined but handler returns an array', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'array_output_tool',
          description: 'Returns array with outputSchema',
          outputSchema: {
            items: z.array(z.string()),
          },
          // @ts-expect-error - intentionally returning wrong type for test
          handler: async () => ['item1', 'item2'],
        })
      );

      await expect(
        navigator.modelContextTesting?.executeTool('array_output_tool', JSON.stringify({}))
      ).rejects.toThrow('outputSchema requires the handler to return a JSON object result');
    });

    it('should throw error when outputSchema is defined but handler returns null', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'null_output_tool',
          description: 'Returns null with outputSchema',
          outputSchema: {
            value: z.string(),
          },
          // @ts-expect-error - intentionally returning wrong type for test
          handler: async () => null,
        })
      );

      await expect(
        navigator.modelContextTesting?.executeTool('null_output_tool', JSON.stringify({}))
      ).rejects.toThrow('outputSchema requires the handler to return a JSON object result');
    });
  });

  describe('annotations', () => {
    it('should register tool with annotations', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'annotated_tool',
          description: 'Tool with annotations',
          annotations: {
            destructiveHint: true,
            idempotentHint: false,
          },
          handler: async () => 'result',
        })
      );

      const tools = navigator.modelContextTesting?.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('annotated_tool');
    });
  });

  describe('output schema registration', () => {
    it('should register tool with output schema in the tool definition', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'output_schema_tool',
          description: 'Tool with output schema',
          outputSchema: {
            message: z.string(),
          },
          handler: async () => ({ message: 'hello' }),
        })
      );

      const tools = navigator.modelContextTesting?.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('output_schema_tool');
    });
  });

  describe('deps parameter', () => {
    it('should re-register when deps change', async () => {
      const registerToolSpy = vi.spyOn(navigator.modelContext as ModelContext, 'registerTool');

      try {
        const { rerender } = await renderHook(
          ({ count }) =>
            useWebMCP(
              {
                name: 'deps_tool',
                description: `Count: ${count}`,
                handler: async () => `count is ${count}`,
              },
              [count]
            ),
          { initialProps: { count: 1 } }
        );

        expect(registerToolSpy).toHaveBeenCalledTimes(1);

        await rerender({ count: 2 });

        // Should have re-registered due to deps change (and description change)
        expect(registerToolSpy).toHaveBeenCalledTimes(2);
      } finally {
        registerToolSpy.mockRestore();
      }
    });
  });

  describe('dev mode warnings', () => {
    let originalProcess: unknown;

    beforeEach(() => {
      // Save original process
      originalProcess = (globalThis as Record<string, unknown>).process;
      // Set NODE_ENV to development to enable isDev
      (globalThis as Record<string, unknown>).process = {
        env: { NODE_ENV: 'development' },
      };
    });

    afterEach(() => {
      // Restore original process
      (globalThis as Record<string, unknown>).process = originalProcess;
    });

    it('should warn when inputSchema reference changes in dev mode', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const { rerender } = await renderHook(
          ({ schema }) =>
            useWebMCP({
              name: 'dev_input_warn_tool',
              description: 'Test',
              inputSchema: schema,
              handler: async () => 'result',
            }),
          { initialProps: { schema: { name: z.string() } } }
        );

        // Rerender with new inputSchema reference
        await rerender({ schema: { name: z.string() } });

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('inputSchema reference changed')
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('should warn when outputSchema reference changes in dev mode', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const { rerender } = await renderHook(
          ({ schema }) =>
            useWebMCP({
              name: 'dev_output_warn_tool',
              description: 'Test',
              outputSchema: schema,
              handler: async () => ({ value: 'test' }),
            }),
          { initialProps: { schema: { value: z.string() } } }
        );

        await rerender({ schema: { value: z.string() } });

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('outputSchema reference changed')
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('should warn when annotations reference changes in dev mode', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const { rerender } = await renderHook(
          ({ annotations }) =>
            useWebMCP({
              name: 'dev_annot_warn_tool',
              description: 'Test',
              annotations,
              handler: async () => 'result',
            }),
          { initialProps: { annotations: { destructiveHint: true as boolean } } }
        );

        await rerender({ annotations: { destructiveHint: true } });

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('annotations reference changed')
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('should warn when description changes in dev mode', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const { rerender } = await renderHook(
          ({ desc }) =>
            useWebMCP({
              name: 'dev_desc_warn_tool',
              description: desc,
              handler: async () => 'result',
            }),
          { initialProps: { desc: 'Version 1' } }
        );

        await rerender({ desc: 'Version 2' });

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('description changed'));
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('should warn when deps contain non-primitive values in dev mode', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const objDep = { key: 'value' };
        await renderHook(() =>
          useWebMCP(
            {
              name: 'dev_deps_warn_tool',
              description: 'Test',
              handler: async () => 'result',
            },
            [objDep]
          )
        );

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('deps contains non-primitive values')
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('should only warn once per category (warnOnce)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const { rerender } = await renderHook(
          ({ desc }) =>
            useWebMCP({
              name: 'dev_warn_once_tool',
              description: desc,
              handler: async () => 'result',
            }),
          { initialProps: { desc: 'V1' } }
        );

        await rerender({ desc: 'V2' });
        await rerender({ desc: 'V3' });

        // Description warning should only appear once
        const descWarnings = warnSpy.mock.calls.filter(
          (call) => typeof call[0] === 'string' && call[0].includes('description changed')
        );
        expect(descWarnings).toHaveLength(1);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('should warn when deps contain function values in dev mode', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const fnDep = () => {};
        await renderHook(() =>
          useWebMCP(
            {
              name: 'dev_fn_deps_warn_tool',
              description: 'Test',
              handler: async () => 'result',
            },
            [fnDep]
          )
        );

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('deps contains non-primitive values')
        );
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('isDev when NODE_ENV is production', () => {
    let originalProcess: unknown;

    beforeEach(() => {
      originalProcess = (globalThis as Record<string, unknown>).process;
      (globalThis as Record<string, unknown>).process = {
        env: { NODE_ENV: 'production' },
      };
    });

    afterEach(() => {
      (globalThis as Record<string, unknown>).process = originalProcess;
    });

    it('should not warn in production mode', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const { rerender } = await renderHook(
          ({ desc }) =>
            useWebMCP({
              name: 'prod_tool',
              description: desc,
              handler: async () => 'result',
            }),
          { initialProps: { desc: 'V1' } }
        );

        await rerender({ desc: 'V2' });

        // Should not have description change warning in production
        const descWarnings = warnSpy.mock.calls.filter(
          (call) => typeof call[0] === 'string' && call[0].includes('description changed')
        );
        expect(descWarnings).toHaveLength(0);
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('cleanup edge cases', () => {
    it('should skip unregister if tool owner token has been replaced', async () => {
      // Mock registerTool to allow duplicate registrations (bypass collision check)
      const originalRegisterTool = (navigator.modelContext as ModelContext).registerTool.bind(
        navigator.modelContext
      );
      const registerSpy = vi
        .spyOn(navigator.modelContext as ModelContext, 'registerTool')
        .mockImplementation((toolDef) => {
          // Silently unregister the existing tool first, then register the new one
          try {
            (navigator.modelContext as ModelContext).unregisterTool(toolDef.name);
          } catch {
            // Tool may not exist, that's fine
          }
          return originalRegisterTool(toolDef);
        });

      const unregisterSpy = vi.spyOn(navigator.modelContext as ModelContext, 'unregisterTool');

      try {
        // Register first tool
        const { unmount: unmount1 } = await renderHook(() =>
          useWebMCP({
            name: 'owner_clash_tool',
            description: 'First instance',
            handler: async () => 'first',
          })
        );

        // Register second tool with the same name (takes ownership of TOOL_OWNER_BY_NAME)
        const { unmount: unmount2 } = await renderHook(() =>
          useWebMCP({
            name: 'owner_clash_tool',
            description: 'Second instance',
            handler: async () => 'second',
          })
        );

        // Clear call counts to only track cleanup calls
        unregisterSpy.mockClear();

        // Unmounting first should NOT call unregisterTool because owner has changed
        unmount1();

        // unregisterTool should NOT have been called
        expect(unregisterSpy).not.toHaveBeenCalled();

        // Unmounting second should call unregisterTool since it's the current owner
        unmount2();

        expect(unregisterSpy).toHaveBeenCalledWith('owner_clash_tool');
      } finally {
        registerSpy.mockRestore();
        unregisterSpy.mockRestore();
      }
    });

    it('should handle unregisterTool throwing in dev mode', async () => {
      let originalProcess: unknown;
      originalProcess = (globalThis as Record<string, unknown>).process;
      (globalThis as Record<string, unknown>).process = {
        env: { NODE_ENV: 'development' },
      };

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const unregisterSpy = vi.spyOn(navigator.modelContext as ModelContext, 'unregisterTool');

      try {
        const { unmount } = await renderHook(() =>
          useWebMCP({
            name: 'cleanup_error_tool',
            description: 'Test cleanup error',
            handler: async () => 'result',
          })
        );

        // Make unregisterTool throw
        unregisterSpy.mockImplementation(() => {
          throw new Error('unregister failed');
        });

        unmount();

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to unregister tool'),
          expect.any(Error)
        );
      } finally {
        warnSpy.mockRestore();
        unregisterSpy.mockRestore();
        (globalThis as Record<string, unknown>).process = originalProcess;
      }
    });
  });

  describe('toStructuredContent edge cases', () => {
    it('should handle circular references in handler result with outputSchema', async () => {
      // Create an object with a circular reference - JSON.stringify will throw
      const circular: Record<string, unknown> = { key: 'value' };
      circular.self = circular;

      await renderHook(() =>
        useWebMCP({
          name: 'circular_tool',
          description: 'Returns circular object',
          outputSchema: {
            key: z.string(),
          },
          // @ts-expect-error - intentionally returning circular for test
          handler: async () => circular,
          // Provide custom formatOutput that handles circular objects
          // so we reach toStructuredContent instead of throwing in formatOutput
          formatOutput: () => 'circular object result',
        })
      );

      // toStructuredContent will catch the JSON.stringify error and return null,
      // which triggers the "outputSchema requires handler to return a JSON object" error.
      await expect(
        navigator.modelContextTesting?.executeTool('circular_tool', JSON.stringify({}))
      ).rejects.toThrow('outputSchema requires the handler to return a JSON object result');
    });
  });

  describe('modelContext not available', () => {
    it('should warn when navigator.modelContext is not available', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const originalModelContext = navigator.modelContext;

      try {
        // Temporarily remove modelContext
        Object.defineProperty(navigator, 'modelContext', {
          value: undefined,
          writable: true,
          configurable: true,
        });

        await renderHook(() =>
          useWebMCP({
            name: 'no_context_tool',
            description: 'Test',
            handler: async () => 'result',
          })
        );

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('window.navigator.modelContext is not available')
        );
      } finally {
        // Restore modelContext
        Object.defineProperty(navigator, 'modelContext', {
          value: originalModelContext,
          writable: true,
          configurable: true,
        });
        warnSpy.mockRestore();
      }
    });
  });
});
