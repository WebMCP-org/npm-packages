import { initializeWebModelContext } from '@mcp-b/global';
import type { ModelContextTesting } from '@mcp-b/webmcp-types';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';

import { useWebMCP } from './useWebMCP.js';

const TEST_CHANNEL_ID = `useWebMCP-test-${Date.now()}`;
const DEBUG_CONFIG_KEY = 'WEBMCP_DEBUG';

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

function enableDebugLogging(config = '*'): () => void {
  const previous = window.localStorage.getItem(DEBUG_CONFIG_KEY);
  window.localStorage.setItem(DEBUG_CONFIG_KEY, config);

  return () => {
    if (previous === null) {
      window.localStorage.removeItem(DEBUG_CONFIG_KEY);
      return;
    }
    window.localStorage.setItem(DEBUG_CONFIG_KEY, previous);
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
    window.localStorage.removeItem(DEBUG_CONFIG_KEY);
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
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
          } as const,
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

    it('should pass input to handler', async () => {
      const handler = vi.fn().mockResolvedValue('valid');

      const { result, act } = await renderHook(() =>
        useWebMCP({
          name: 'typed_tool',
          description: 'Test',
          inputSchema: {
            type: 'object',
            properties: { count: { type: 'number' } },
            required: ['count'],
          } as const,
          handler,
        })
      );

      await act(async () => {
        await result.current.execute({ count: 42 });
      });

      expect(handler).toHaveBeenCalledWith({ count: 42 });
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

    it('should handle non-Error throws and convert to string', async () => {
      const { result, act } = await renderHook(() =>
        useWebMCP({
          name: 'non_error_throw_tool',
          description: 'Throws non-Error',
          handler: async () => {
            throw 'string error';
          },
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

  describe('MCP tool execution via testing API', () => {
    it('should execute tool via modelContextTesting', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'echo_tool',
          description: 'Echo input',
          inputSchema: {
            type: 'object',
            properties: { message: { type: 'string' } },
            required: ['message'],
          } as const,
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
            type: 'object',
            properties: { a: { type: 'number' }, b: { type: 'number' } },
            required: ['a', 'b'],
          } as const,
          outputSchema: {
            type: 'object',
            properties: { result: { type: 'number' } },
          } as const,
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

    it('should throw when handler throws via MCP execution', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'error_tool',
          description: 'Throws error',
          handler: async () => {
            throw new Error('MCP handler error');
          },
        })
      );

      // The testing API throws DOMException for error responses
      await expect(
        navigator.modelContextTesting?.executeTool('error_tool', JSON.stringify({}))
      ).rejects.toThrow();
    });

    it('should throw when outputSchema is defined but handler returns non-object', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'bad_output_tool',
          description: 'Bad output',
          outputSchema: {
            type: 'object',
            properties: { value: { type: 'string' } },
          } as const,
          handler: async () => 'not an object' as never,
        })
      );

      // toStructuredContent returns null for strings, causing an error
      await expect(
        navigator.modelContextTesting?.executeTool('bad_output_tool', JSON.stringify({}))
      ).rejects.toThrow();
    });

    it('should throw when outputSchema is defined but handler returns an array', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'array_output_tool',
          description: 'Array output',
          outputSchema: {
            type: 'object',
            properties: { value: { type: 'string' } },
          } as const,
          handler: async () => ['not', 'an', 'object'] as never,
        })
      );

      await expect(
        navigator.modelContextTesting?.executeTool('array_output_tool', JSON.stringify({}))
      ).rejects.toThrow();
    });

    it('should throw when outputSchema is defined but handler returns null', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'null_output_tool',
          description: 'Null output',
          outputSchema: {
            type: 'object',
            properties: { value: { type: 'string' } },
          } as const,
          handler: async () => null as never,
        })
      );

      await expect(
        navigator.modelContextTesting?.executeTool('null_output_tool', JSON.stringify({}))
      ).rejects.toThrow();
    });

    it('should throw when MCP execution receives non-Error throw', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'non_error_mcp_tool',
          description: 'Non-Error throw via MCP',
          handler: async () => {
            throw 42;
          },
        })
      );

      await expect(
        navigator.modelContextTesting?.executeTool('non_error_mcp_tool', JSON.stringify({}))
      ).rejects.toThrow();
    });
  });

  describe('formatOutput', () => {
    it('should use default formatOutput for non-string values', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'obj_tool',
          description: 'Returns object',
          handler: async () => ({ key: 'value' }),
        })
      );

      const result = await navigator.modelContextTesting?.executeTool(
        'obj_tool',
        JSON.stringify({})
      );

      const parsed = parseSerializedToolResponse(result);
      expect(parsed.content[0]?.text).toBe(JSON.stringify({ key: 'value' }, null, 2));
    });

    it('should use custom formatOutput when provided', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'custom_format_tool',
          description: 'Custom format',
          handler: async () => 42,
          formatOutput: (output) => `Result: ${output}`,
        })
      );

      const result = await navigator.modelContextTesting?.executeTool(
        'custom_format_tool',
        JSON.stringify({})
      );

      const parsed = parseSerializedToolResponse(result);
      expect(parsed.content[0]?.text).toBe('Result: 42');
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
      const registerToolSpy = vi.spyOn(navigator.modelContext, 'registerTool');
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
    it('should register tool with output schema JSON', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'schema_tool',
          description: 'Has output schema',
          outputSchema: {
            type: 'object',
            properties: { count: { type: 'number' }, label: { type: 'string' } },
          } as const,
          handler: async () => ({ count: 1, label: 'test' }),
        })
      );

      const tools = navigator.modelContextTesting?.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('schema_tool');
    });
  });

  describe('deps behavior', () => {
    it('should re-register when deps change', async () => {
      const registerToolSpy = vi.spyOn(navigator.modelContext, 'registerTool');

      try {
        const { rerender } = await renderHook(
          ({ count }) =>
            useWebMCP(
              {
                name: 'deps_tool',
                description: `Count: ${count}`,
                handler: async () => count,
              },
              [count]
            ),
          { initialProps: { count: 1 } }
        );

        expect(registerToolSpy).toHaveBeenCalledTimes(1);

        await rerender({ count: 2 });

        expect(registerToolSpy).toHaveBeenCalledTimes(2);
      } finally {
        registerToolSpy.mockRestore();
      }
    });
  });

  describe('debug diagnostics', () => {
    let cleanupDebugLogging: (() => void) | undefined;

    afterEach(() => {
      cleanupDebugLogging?.();
      cleanupDebugLogging = undefined;
    });

    it('handles schema reference changes during rerender', async () => {
      cleanupDebugLogging = enableDebugLogging('*');
      const { rerender } = await renderHook(
        ({ inputSchema, outputSchema, annotations }) =>
          useWebMCP({
            name: 'diag_schema_tool',
            description: 'Test',
            inputSchema,
            outputSchema,
            annotations,
            handler: async () => ({ value: 'test' }),
          }),
        {
          initialProps: {
            inputSchema: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            } as const,
            outputSchema: {
              type: 'object',
              properties: { value: { type: 'string' } },
            } as const,
            annotations: { destructiveHint: true } as const,
          },
        }
      );

      await rerender({
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        } as const,
        outputSchema: {
          type: 'object',
          properties: { value: { type: 'string' } },
        } as const,
        annotations: { destructiveHint: true },
      });

      expect(navigator.modelContextTesting?.listTools()).toHaveLength(1);
    });

    it('handles description and deps changes without breaking registration', async () => {
      cleanupDebugLogging = enableDebugLogging('*');

      const objDep = { key: 'value' };
      const fnDep = () => {};

      const { rerender } = await renderHook(
        ({ description, currentDep }) =>
          useWebMCP(
            {
              name: 'diag_deps_tool',
              description,
              handler: async () => 'result',
            },
            [currentDep]
          ),
        {
          initialProps: {
            description: 'v1',
            currentDep: objDep as unknown,
          },
        }
      );

      await rerender({ description: 'v2', currentDep: fnDep as unknown });

      expect(navigator.modelContextTesting?.listTools()).toHaveLength(1);
    });

    it('keeps a single active registration across repeated rerenders', async () => {
      cleanupDebugLogging = enableDebugLogging('*');

      const { rerender } = await renderHook(
        ({ description }) =>
          useWebMCP({
            name: 'diag_once_tool',
            description,
            handler: async () => 'result',
          }),
        { initialProps: { description: 'v1' } }
      );

      await rerender({ description: 'v2' });
      await rerender({ description: 'v3' });

      expect(navigator.modelContextTesting?.listTools()).toHaveLength(1);
    });
  });

  describe('cleanup edge cases', () => {
    it('should handle unregister errors gracefully', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const unregisterSpy = vi
        .spyOn(navigator.modelContext, 'unregisterTool')
        .mockImplementation(() => {
          throw new Error('Unregister failed');
        });

      try {
        const { unmount } = await renderHook(() =>
          useWebMCP({
            name: 'unregister_error_tool',
            description: 'Test',
            handler: async () => 'result',
          })
        );

        // Should not throw, just warn
        unmount();

        expect(warnSpy).toHaveBeenCalledWith(
          '[ReactWebMCP:useWebMCP]',
          expect.stringContaining('Failed to unregister tool'),
          expect.any(Error)
        );
      } finally {
        warnSpy.mockRestore();
        unregisterSpy.mockRestore();
      }
    });
  });

  describe('modelContext unavailability', () => {
    it('should warn when modelContext is not available', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const savedModelContext = navigator.modelContext;

      try {
        Object.defineProperty(navigator, 'modelContext', {
          value: undefined,
          writable: true,
          configurable: true,
        });

        await renderHook(() =>
          useWebMCP({
            name: 'unavailable_tool',
            description: 'Test',
            handler: async () => 'result',
          })
        );

        expect(warnSpy).toHaveBeenCalledWith(
          '[ReactWebMCP:useWebMCP]',
          expect.stringContaining('modelContext is not available')
        );
      } finally {
        Object.defineProperty(navigator, 'modelContext', {
          value: savedModelContext,
          writable: true,
          configurable: true,
        });
        warnSpy.mockRestore();
      }
    });
  });

  describe('re-render optimization', () => {
    // --- Reference Stability ---

    it('should return stable execute reference across same-prop rerenders', async () => {
      const { result, rerender } = await renderHook(() =>
        useWebMCP({
          name: 'stable_exec_tool',
          description: 'Test',
          handler: async () => 'result',
        })
      );

      const firstExecute = result.current.execute;

      await rerender();

      expect(result.current.execute).toBe(firstExecute);
    });

    it('should maintain stable execute reference when description changes', async () => {
      const { result, rerender } = await renderHook(
        ({ description }) =>
          useWebMCP({
            name: 'stable_exec_desc_tool',
            description,
            handler: async () => 'result',
          }),
        { initialProps: { description: 'v1' } }
      );

      const firstExecute = result.current.execute;

      await rerender({ description: 'v2' });

      expect(result.current.execute).toBe(firstExecute);
    });

    it('should return stable reset reference across rerenders', async () => {
      const { result, rerender } = await renderHook(
        ({ description }) =>
          useWebMCP({
            name: 'stable_reset_tool',
            description,
            handler: async () => 'result',
          }),
        { initialProps: { description: 'v1' } }
      );

      const firstReset = result.current.reset;

      await rerender({ description: 'v2' });

      expect(result.current.reset).toBe(firstReset);
    });

    // --- Callbacks Don't Trigger Re-registration ---

    it('should not re-register when handler reference changes', async () => {
      const registerToolSpy = vi.spyOn(navigator.modelContext, 'registerTool');

      try {
        const { rerender } = await renderHook(
          ({ handler }) =>
            useWebMCP({
              name: 'handler_ref_tool',
              description: 'Test',
              handler,
            }),
          { initialProps: { handler: async () => 'v1' } }
        );

        const initialCallCount = registerToolSpy.mock.calls.length;

        await rerender({ handler: async () => 'v2' });

        expect(registerToolSpy.mock.calls.length).toBe(initialCallCount);
      } finally {
        registerToolSpy.mockRestore();
      }
    });

    it('should not re-register when onSuccess reference changes', async () => {
      const registerToolSpy = vi.spyOn(navigator.modelContext, 'registerTool');

      try {
        const { rerender } = await renderHook(
          ({ onSuccess }) =>
            useWebMCP({
              name: 'onsuccess_ref_tool',
              description: 'Test',
              handler: async () => 'result',
              onSuccess,
            }),
          { initialProps: { onSuccess: () => {} } }
        );

        const initialCallCount = registerToolSpy.mock.calls.length;

        await rerender({ onSuccess: () => {} });

        expect(registerToolSpy.mock.calls.length).toBe(initialCallCount);
      } finally {
        registerToolSpy.mockRestore();
      }
    });

    it('should not re-register when onError reference changes', async () => {
      const registerToolSpy = vi.spyOn(navigator.modelContext, 'registerTool');

      try {
        const { rerender } = await renderHook(
          ({ onError }) =>
            useWebMCP({
              name: 'onerror_ref_tool',
              description: 'Test',
              handler: async () => 'result',
              onError,
            }),
          { initialProps: { onError: () => {} } }
        );

        const initialCallCount = registerToolSpy.mock.calls.length;

        await rerender({ onError: () => {} });

        expect(registerToolSpy.mock.calls.length).toBe(initialCallCount);
      } finally {
        registerToolSpy.mockRestore();
      }
    });

    it('should not re-register when formatOutput reference changes', async () => {
      const registerToolSpy = vi.spyOn(navigator.modelContext, 'registerTool');

      try {
        const { rerender } = await renderHook(
          ({ formatOutput }) =>
            useWebMCP({
              name: 'format_ref_tool',
              description: 'Test',
              handler: async () => 42,
              formatOutput,
            }),
          { initialProps: { formatOutput: (output: unknown) => `Old: ${output}` } }
        );

        const initialCallCount = registerToolSpy.mock.calls.length;

        await rerender({ formatOutput: (output: unknown) => `New: ${output}` });

        expect(registerToolSpy.mock.calls.length).toBe(initialCallCount);
      } finally {
        registerToolSpy.mockRestore();
      }
    });

    it('should not accumulate registrations when multiple callbacks change', async () => {
      const registerToolSpy = vi.spyOn(navigator.modelContext, 'registerTool');

      try {
        const { rerender } = await renderHook(
          ({ handler, onSuccess, onError, formatOutput }) =>
            useWebMCP({
              name: 'multi_callback_tool',
              description: 'Test',
              handler,
              onSuccess,
              onError,
              formatOutput,
            }),
          {
            initialProps: {
              handler: async () => 'v1',
              onSuccess: () => {},
              onError: () => {},
              formatOutput: (output: unknown) => String(output),
            },
          }
        );

        const initialCallCount = registerToolSpy.mock.calls.length;

        await rerender({
          handler: async () => 'v2',
          onSuccess: () => {},
          onError: () => {},
          formatOutput: (output: unknown) => `new: ${output}`,
        });

        await rerender({
          handler: async () => 'v3',
          onSuccess: () => {},
          onError: () => {},
          formatOutput: (output: unknown) => `newest: ${output}`,
        });

        expect(registerToolSpy.mock.calls.length).toBe(initialCallCount);
      } finally {
        registerToolSpy.mockRestore();
      }
    });

    // --- Latest Ref Values Used at Execution Time ---

    it('should use latest handler after reference change', async () => {
      const handlerV1 = vi.fn().mockResolvedValue('v1');
      const handlerV2 = vi.fn().mockResolvedValue('v2');

      const { result, rerender, act } = await renderHook(
        ({ handler }) =>
          useWebMCP({
            name: 'latest_handler_tool',
            description: 'Test',
            handler,
          }),
        { initialProps: { handler: handlerV1 } }
      );

      await rerender({ handler: handlerV2 });

      await act(async () => {
        await result.current.execute({ key: 'test' });
      });

      expect(handlerV1).not.toHaveBeenCalled();
      expect(handlerV2).toHaveBeenCalledWith({ key: 'test' });
      expect(result.current.state.lastResult).toBe('v2');
    });

    it('should use latest onSuccess callback after reference change', async () => {
      const onSuccessV1 = vi.fn();
      const onSuccessV2 = vi.fn();

      const { result, rerender, act } = await renderHook(
        ({ onSuccess }) =>
          useWebMCP({
            name: 'latest_onsuccess_tool',
            description: 'Test',
            handler: async () => 'result',
            onSuccess,
          }),
        { initialProps: { onSuccess: onSuccessV1 } }
      );

      await rerender({ onSuccess: onSuccessV2 });

      await act(async () => {
        await result.current.execute({});
      });

      expect(onSuccessV1).not.toHaveBeenCalled();
      expect(onSuccessV2).toHaveBeenCalledWith('result', {});
    });

    it('should use latest onError callback after reference change', async () => {
      const onErrorV1 = vi.fn();
      const onErrorV2 = vi.fn();
      const error = new Error('fail');

      const { result, rerender, act } = await renderHook(
        ({ onError }) =>
          useWebMCP({
            name: 'latest_onerror_tool',
            description: 'Test',
            handler: async () => {
              throw error;
            },
            onError,
          }),
        { initialProps: { onError: onErrorV1 } }
      );

      await rerender({ onError: onErrorV2 });

      await act(async () => {
        try {
          await result.current.execute({});
        } catch {
          // Expected
        }
      });

      expect(onErrorV1).not.toHaveBeenCalled();
      expect(onErrorV2).toHaveBeenCalledWith(error, {});
    });

    it('should use latest formatOutput after reference change', async () => {
      const { rerender } = await renderHook(
        ({ formatOutput }) =>
          useWebMCP({
            name: 'latest_format_tool',
            description: 'Test',
            handler: async () => 42,
            formatOutput,
          }),
        { initialProps: { formatOutput: (output: unknown) => `Old: ${output}` } }
      );

      await rerender({ formatOutput: (output: unknown) => `New: ${output}` });

      const result = await navigator.modelContextTesting?.executeTool(
        'latest_format_tool',
        JSON.stringify({})
      );

      const parsed = parseSerializedToolResponse(result);
      expect(parsed.content[0]?.text).toBe('New: 42');
    });

    // --- State Reference Behavior ---

    it('should not change state reference on rerender without state change', async () => {
      const { result, rerender } = await renderHook(() =>
        useWebMCP({
          name: 'state_ref_tool',
          description: 'Test',
          handler: async () => 'result',
        })
      );

      const firstState = result.current.state;

      await rerender();

      expect(result.current.state).toBe(firstState);
    });

    it('should change state reference after execution', async () => {
      const { result, act } = await renderHook(() =>
        useWebMCP({
          name: 'state_change_tool',
          description: 'Test',
          handler: async () => 'result',
        })
      );

      const firstState = result.current.state;

      await act(async () => {
        await result.current.execute({});
      });

      expect(result.current.state).not.toBe(firstState);
      expect(result.current.state.executionCount).toBe(1);
    });

    // --- Effect Cleanup Ordering ---

    it('should unregister before re-registering when name changes', async () => {
      const callOrder: string[] = [];
      const originalRegister = navigator.modelContext.registerTool.bind(navigator.modelContext);
      const originalUnregister = navigator.modelContext.unregisterTool.bind(navigator.modelContext);

      const registerToolSpy = vi
        .spyOn(navigator.modelContext, 'registerTool')
        .mockImplementation((...args) => {
          callOrder.push('register');
          return originalRegister(...args);
        });
      const unregisterToolSpy = vi
        .spyOn(navigator.modelContext, 'unregisterTool')
        .mockImplementation((...args: [string]) => {
          callOrder.push('unregister');
          return originalUnregister(...args);
        });

      try {
        const { rerender } = await renderHook(
          ({ name }) =>
            useWebMCP({
              name,
              description: 'Test',
              handler: async () => 'result',
            }),
          { initialProps: { name: 'order_tool_old' } }
        );

        callOrder.length = 0;

        await rerender({ name: 'order_tool_new' });

        const unregisterIdx = callOrder.indexOf('unregister');
        const registerIdx = callOrder.indexOf('register');

        expect(unregisterIdx).toBeGreaterThanOrEqual(0);
        expect(registerIdx).toBeGreaterThanOrEqual(0);
        expect(unregisterIdx).toBeLessThan(registerIdx);
      } finally {
        registerToolSpy.mockRestore();
        unregisterToolSpy.mockRestore();
      }
    });
  });
});
