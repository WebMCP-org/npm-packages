import { initializeWebModelContext } from '@mcp-b/global';
import { useRef } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { z } from 'zod';
import * as z4 from 'zod/v4';

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

function getModelContext(): NonNullable<typeof navigator.modelContext> {
  const modelContext = navigator.modelContext;
  if (!modelContext) {
    throw new Error('Expected navigator.modelContext to be available');
  }
  return modelContext;
}

function getTestingApi(): NonNullable<typeof navigator.modelContextTesting> {
  const testingApi = navigator.modelContextTesting;
  if (!testingApi) {
    throw new Error('Expected navigator.modelContextTesting to be available');
  }
  return testingApi;
}

function getRegisteredTools() {
  return getTestingApi().listTools();
}

function getRegisteredTool(name: string) {
  const tool = getRegisteredTools().find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Expected registered tool "${name}"`);
  }
  return tool;
}

function getSingleRegisteredTool() {
  const [tool] = getRegisteredTools();
  if (!tool) {
    throw new Error('Expected exactly one registered tool');
  }
  return tool;
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
    getModelContext().clearContext();
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

      const tools = getRegisteredTools();
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

      const tools = getRegisteredTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('greet');
      // The testing API returns inputSchema as a JSON string
      const inputSchema = JSON.parse(tools[0].inputSchema);
      expect(inputSchema.properties).toHaveProperty('name');
    });

    it('converts zod-like inputSchema before registration', async () => {
      const registerToolSpy = vi.spyOn(getModelContext(), 'registerTool');

      try {
        const zodSchema = { username: z.string() } as const;
        await renderHook(() =>
          useWebMCP({
            name: 'zod_like_tool',
            description: 'Tool using zod-like schema',
            inputSchema: zodSchema,
            handler: async () => 'ok',
          })
        );

        const descriptor = registerToolSpy.mock.calls.at(-1)?.[0] as {
          name: string;
          inputSchema?: {
            type?: string;
            properties?: Record<string, { type?: string }>;
            required?: string[];
          };
        };
        expect(descriptor.name).toBe('zod_like_tool');
        expect(descriptor.inputSchema?.type).toBe('object');
        expect(descriptor.inputSchema?.properties).toHaveProperty('username');
        expect(descriptor.inputSchema?.required).toContain('username');
      } finally {
        registerToolSpy.mockRestore();
      }
    });

    it('converts zod-like outputSchema before registration', async () => {
      const registerToolSpy = vi.spyOn(getModelContext(), 'registerTool');

      try {
        const zodOutputSchema = {
          count: z.number(),
          message: z.string(),
        } as const;

        await renderHook(() =>
          useWebMCP({
            name: 'zod_output_tool',
            description: 'Tool using zod-like output schema',
            outputSchema: zodOutputSchema,
            handler: async () => ({ count: 1, message: 'ok' }),
          })
        );

        const descriptor = registerToolSpy.mock.calls.at(-1)?.[0] as {
          name: string;
          outputSchema?: {
            type?: string;
            properties?: Record<string, { type?: string }>;
            required?: string[];
          };
        };

        expect(descriptor.name).toBe('zod_output_tool');
        expect(descriptor.outputSchema?.type).toBe('object');
        expect(descriptor.outputSchema?.properties).toHaveProperty('count');
        expect(descriptor.outputSchema?.properties).toHaveProperty('message');
        expect(descriptor.outputSchema?.required).toEqual(
          expect.arrayContaining(['count', 'message'])
        );
      } finally {
        registerToolSpy.mockRestore();
      }
    });

    it('passes Zod v4 Standard Schema input through without Zod v3 conversion', async () => {
      const registerToolSpy = vi.spyOn(getModelContext(), 'registerTool');
      const schema = z4.object({
        query: z4.string(),
        limit: z4.number().optional(),
      });

      try {
        await renderHook(() =>
          useWebMCP({
            name: 'zod4_passthrough_tool',
            description: 'Standard Schema should pass through unchanged',
            inputSchema: schema,
            handler: async ({ query, limit }) => ({ query, limit: limit ?? 10 }),
          })
        );

        const descriptor = registerToolSpy.mock.calls.at(-1)?.[0] as {
          name: string;
          inputSchema?: unknown;
        };

        expect(descriptor.name).toBe('zod4_passthrough_tool');
        expect(descriptor.inputSchema).toBe(schema);
        expect(descriptor.inputSchema).toHaveProperty('~standard');
      } finally {
        registerToolSpy.mockRestore();
      }
    });

    it('should register by default when enabled is omitted', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'enabled_default_tool',
          description: 'Enabled by default',
          handler: async () => 'result',
        })
      );

      const tools = getRegisteredTools();
      expect(tools.some((tool) => tool.name === 'enabled_default_tool')).toBe(true);
    });

    it('should skip registration when enabled is false', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'disabled_tool',
          description: 'Disabled tool',
          enabled: false,
          handler: async () => 'result',
        })
      );

      const tools = getRegisteredTools();
      expect(tools.some((tool) => tool.name === 'disabled_tool')).toBe(false);
    });

    it('should register when enabled changes from false to true', async () => {
      const { rerender } = await renderHook(
        ({ enabled }) =>
          useWebMCP({
            name: 'toggle_enabled_tool',
            description: 'Toggle registration',
            enabled,
            handler: async () => 'result',
          }),
        { initialProps: { enabled: false } }
      );

      expect(getRegisteredTools()).toEqual([]);

      await rerender({ enabled: true });

      expect(getRegisteredTools().some((tool) => tool.name === 'toggle_enabled_tool')).toBe(true);
    });

    it('should unregister when enabled changes from true to false', async () => {
      const { rerender } = await renderHook(
        ({ enabled }) =>
          useWebMCP({
            name: 'toggle_disabled_tool',
            description: 'Toggle unregister',
            enabled,
            handler: async () => 'result',
          }),
        { initialProps: { enabled: true } }
      );

      expect(getRegisteredTools().some((tool) => tool.name === 'toggle_disabled_tool')).toBe(true);

      await rerender({ enabled: false });

      expect(getRegisteredTools().some((tool) => tool.name === 'toggle_disabled_tool')).toBe(false);
    });

    it('should unregister tool on unmount', async () => {
      const { unmount } = await renderHook(() =>
        useWebMCP({
          name: 'temp_tool',
          description: 'Temporary tool',
          handler: async () => 'result',
        })
      );

      expect(getRegisteredTools()).toHaveLength(1);

      unmount();

      expect(getRegisteredTools()).toHaveLength(0);
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

      const result = await getTestingApi().executeTool(
        'echo_tool',
        JSON.stringify({ message: 'hello' })
      );

      const parsed = parseSerializedToolResponse(result);
      expect(parsed.content[0]?.type).toBe('text');
      expect(parsed.content[0]?.text).toBe('Echo: hello');
    });

    it('should reject invalid JSON Schema args via modelContextTesting', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'json_validation_tool',
          description: 'Validate JSON Schema args',
          inputSchema: {
            type: 'object',
            properties: { count: { type: 'number' } },
            required: ['count'],
          } as const,
          handler: async ({ count }) => ({ doubled: count * 2 }),
        })
      );

      await expect(
        getTestingApi().executeTool(
          'json_validation_tool',
          JSON.stringify({ count: 'not-a-number' })
        )
      ).rejects.toThrow();
    });

    it('should reject missing required JSON Schema args via modelContextTesting', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'json_required_tool',
          description: 'Require JSON Schema args',
          inputSchema: {
            type: 'object',
            properties: { message: { type: 'string' } },
            required: ['message'],
          } as const,
          handler: async ({ message }) => ({ echoed: message }),
        })
      );

      await expect(
        getTestingApi().executeTool('json_required_tool', JSON.stringify({}))
      ).rejects.toThrow();
    });

    it('should expose converted Zod v3 schema metadata to consumers', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'zod_v3_metadata_tool',
          description: 'Expose converted Zod v3 metadata',
          inputSchema: {
            username: z.string(),
            age: z.number().optional(),
          },
          handler: async ({ username, age }) => ({ username, age: age ?? null }),
        })
      );

      const tool = getRegisteredTool('zod_v3_metadata_tool');
      const inputSchema = JSON.parse(tool.inputSchema);

      expect(inputSchema.type).toBe('object');
      expect(inputSchema.properties?.username).toMatchObject({ type: 'string' });
      expect(inputSchema.properties?.age).toMatchObject({
        anyOf: expect.arrayContaining([expect.objectContaining({ type: 'number' })]),
      });
      expect(inputSchema.required).toContain('username');
      expect(inputSchema.required).not.toContain('age');
    });

    it('should execute converted Zod v3 schemas through modelContextTesting', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'zod_v3_execute_tool',
          description: 'Execute Zod v3 schema through consumer path',
          inputSchema: {
            username: z.string(),
            age: z.number().optional(),
          },
          handler: async ({ username, age }) => ({
            greeting: `Hello, ${username}`,
            age: age ?? null,
          }),
        })
      );

      const result = await getTestingApi().executeTool(
        'zod_v3_execute_tool',
        JSON.stringify({ username: 'Ada', age: 37 })
      );

      const parsed = parseSerializedToolResponse(result);
      expect(parsed.content[0]?.text).toContain('Hello, Ada');
    });

    it('should reject invalid converted Zod v3 args via modelContextTesting', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'zod_v3_validation_tool',
          description: 'Reject invalid converted Zod v3 args',
          inputSchema: {
            username: z.string(),
            age: z.number(),
          },
          handler: async ({ username, age }) => ({ username, age }),
        })
      );

      await expect(
        getTestingApi().executeTool(
          'zod_v3_validation_tool',
          JSON.stringify({ username: 'Ada', age: 'not-a-number' })
        )
      ).rejects.toThrow();
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

      const result = await getTestingApi().executeTool('calc_tool', JSON.stringify({ a: 5, b: 3 }));

      const parsed = parseSerializedToolResponse(result);
      expect(parsed.structuredContent).toEqual({ result: 8 });
    });

    it('should return structured content when outputSchema uses a Zod v3 schema map', async () => {
      await renderHook(() =>
        useWebMCP({
          name: 'zod_v3_output_tool',
          description: 'Structured content from Zod v3 output schema',
          outputSchema: {
            total: z.number(),
            label: z.string(),
          },
          handler: async () => ({ total: 3, label: 'ok' }),
        })
      );

      const result = await getTestingApi().executeTool('zod_v3_output_tool', JSON.stringify({}));

      const parsed = parseSerializedToolResponse(result);
      expect(parsed.structuredContent).toEqual({ total: 3, label: 'ok' });
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
      await expect(getTestingApi().executeTool('error_tool', JSON.stringify({}))).rejects.toThrow();
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
          // @ts-expect-error - intentionally returning wrong type for test
          handler: async () => 'not an object',
        })
      );

      // toStructuredContent returns null for strings, causing an error
      await expect(
        getTestingApi().executeTool('bad_output_tool', JSON.stringify({}))
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
          // @ts-expect-error - intentionally returning wrong type for test
          handler: async () => ['not', 'an', 'object'],
        })
      );

      await expect(
        getTestingApi().executeTool('array_output_tool', JSON.stringify({}))
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
          // @ts-expect-error - intentionally returning wrong type for test
          handler: async () => null,
        })
      );

      await expect(
        getTestingApi().executeTool('null_output_tool', JSON.stringify({}))
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
        getTestingApi().executeTool('non_error_mcp_tool', JSON.stringify({}))
      ).rejects.toThrow();
    });
  });

  describe('Zod v4 Standard Schema via testing API', () => {
    it('should register a tool with Zod v4 inputSchema and expose metadata', async () => {
      const schema = z4.object({
        query: z4.string(),
        limit: z4.number().optional(),
      });

      await renderHook(() =>
        useWebMCP({
          name: 'react_zod4_search',
          description: 'React Zod v4 Standard Schema input',
          inputSchema: schema,
          handler: async ({ query, limit }) => ({ query, limit: limit ?? 10 }),
        })
      );

      const tool = getRegisteredTool('react_zod4_search');
      expect(tool.description).toBe('React Zod v4 Standard Schema input');
      expect(tool.inputSchema).toBeDefined();
    });

    it('should execute valid Zod v4 Standard Schema args', async () => {
      const schema = z4.object({
        message: z4.string(),
      });

      await renderHook(() =>
        useWebMCP({
          name: 'react_zod4_echo',
          description: 'Echo a Zod v4 message',
          inputSchema: schema,
          handler: async ({ message }) => ({ echoed: message }),
        })
      );

      const result = await getTestingApi().executeTool(
        'react_zod4_echo',
        JSON.stringify({ message: 'hello from react-webmcp standard schema' })
      );

      const parsed = parseSerializedToolResponse(result);
      expect(parsed.content[0]?.type).toBe('text');
      expect(parsed.content[0]?.text).toContain('hello from react-webmcp standard schema');
    });

    it('should reject invalid Zod v4 Standard Schema args', async () => {
      const schema = z4.object({
        count: z4.number(),
      });

      await renderHook(() =>
        useWebMCP({
          name: 'react_zod4_validate',
          description: 'Validate Zod v4 args',
          inputSchema: schema,
          handler: async ({ count }) => ({ doubled: count * 2 }),
        })
      );

      await expect(
        getTestingApi().executeTool(
          'react_zod4_validate',
          JSON.stringify({ count: 'not a number' })
        )
      ).rejects.toThrow();
    });

    it('should reject nested invalid Zod v4 Standard Schema args', async () => {
      const schema = z4.object({
        user: z4.object({
          id: z4.string(),
        }),
      });

      await renderHook(() =>
        useWebMCP({
          name: 'react_zod4_nested_validate',
          description: 'Reject nested invalid Standard Schema args',
          inputSchema: schema,
          handler: async ({ user }) => ({ id: user.id }),
        })
      );

      await expect(
        getTestingApi().executeTool(
          'react_zod4_nested_validate',
          JSON.stringify({ user: { id: 123 } })
        )
      ).rejects.toThrow();
    });

    it('should reject missing required Zod v4 Standard Schema fields', async () => {
      const schema = z4.object({
        requiredField: z4.string(),
      });

      await renderHook(() =>
        useWebMCP({
          name: 'react_zod4_required',
          description: 'Require a Zod v4 field',
          inputSchema: schema,
          handler: async ({ requiredField }) => ({ value: requiredField }),
        })
      );

      await expect(
        getTestingApi().executeTool('react_zod4_required', JSON.stringify({}))
      ).rejects.toThrow();
    });

    it('should return structuredContent with Zod v4 input and JSON Schema output', async () => {
      const inputSchema = z4.object({
        x: z4.number(),
        y: z4.number(),
      });

      await renderHook(() =>
        useWebMCP({
          name: 'react_zod4_structured',
          description: 'Structured response with Standard Schema input',
          inputSchema,
          outputSchema: {
            type: 'object',
            properties: {
              sum: { type: 'number' },
            },
          } as const,
          handler: async ({ x, y }) => ({ sum: x + y }),
        })
      );

      const result = await getTestingApi().executeTool(
        'react_zod4_structured',
        JSON.stringify({ x: 2, y: 5 })
      );

      const parsed = parseSerializedToolResponse(result);
      expect(parsed.structuredContent).toEqual({ sum: 7 });
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

      const result = await getTestingApi().executeTool('obj_tool', JSON.stringify({}));

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

      const result = await getTestingApi().executeTool('custom_format_tool', JSON.stringify({}));

      const parsed = parseSerializedToolResponse(result);
      expect(parsed.content[0]?.text).toBe('Result: 42');
    });
  });

  describe('callbacks', () => {
    it('should call onStart with input before handler and onSuccess', async () => {
      const callOrder: string[] = [];
      const onStart = vi.fn((input: unknown) => {
        callOrder.push(`start:${JSON.stringify(input)}`);
      });
      const onSuccess = vi.fn(() => {
        callOrder.push('success');
      });
      const handler = vi.fn().mockImplementation(async (input: unknown) => {
        callOrder.push('handler');
        return input;
      });

      const { result, act } = await renderHook(() =>
        useWebMCP({
          name: 'start_tool',
          description: 'Test',
          handler,
          onStart,
          onSuccess,
        })
      );

      await act(async () => {
        await result.current.execute({ input: 'value' });
      });

      expect(onStart).toHaveBeenCalledWith({ input: 'value' });
      expect(handler).toHaveBeenCalledWith({ input: 'value' });
      expect(onSuccess).toHaveBeenCalledWith({ input: 'value' }, { input: 'value' });
      expect(callOrder).toEqual(['start:{"input":"value"}', 'handler', 'success']);
    });

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

    it('should call onStart before onError when handler fails', async () => {
      const callOrder: string[] = [];
      const onStart = vi.fn(() => {
        callOrder.push('start');
      });
      const onError = vi.fn(() => {
        callOrder.push('error');
      });
      const handler = vi.fn().mockImplementation(async () => {
        callOrder.push('handler');
        throw new Error('Failure');
      });

      const { result, act } = await renderHook(() =>
        useWebMCP({
          name: 'start_error_tool',
          description: 'Test',
          handler,
          onStart,
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

      expect(onStart).toHaveBeenCalledWith({ input: 'value' });
      expect(onError).toHaveBeenCalledWith(expect.any(Error), { input: 'value' });
      expect(callOrder).toEqual(['start', 'handler', 'error']);
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
      const registerToolSpy = vi.spyOn(getModelContext(), 'registerTool');
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
        expect(getRegisteredTools()).toHaveLength(1);

        await rerender();

        expect(registerToolSpy).toHaveBeenCalledTimes(1);
        expect(getRegisteredTools()).toHaveLength(1);
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

      expect(getSingleRegisteredTool().name).toBe('tool_v1');

      await rerender({ name: 'tool_v2' });

      expect(getSingleRegisteredTool().name).toBe('tool_v2');
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

      expect(getSingleRegisteredTool().description).toBe('Version 1');

      await rerender({ description: 'Version 2' });

      expect(getSingleRegisteredTool().description).toBe('Version 2');
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

      const tools = getRegisteredTools();
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

      const tools = getRegisteredTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('schema_tool');
    });
  });

  describe('deps behavior', () => {
    it('should re-register when deps change', async () => {
      const registerToolSpy = vi.spyOn(getModelContext(), 'registerTool');

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

      expect(getRegisteredTools()).toHaveLength(1);
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

      expect(getRegisteredTools()).toHaveLength(1);
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

      expect(getRegisteredTools()).toHaveLength(1);
    });
  });

  describe('cleanup edge cases', () => {
    it('should prefer the returned unregister handle when registerTool provides one', async () => {
      const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'modelContext');
      const unregister = vi.fn();
      const unregisterTool = vi.fn();

      Object.defineProperty(navigator, 'modelContext', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: {
          registerTool: vi.fn(() => ({ unregister })),
          unregisterTool,
        },
      });

      try {
        const { unmount } = await renderHook(() =>
          useWebMCP({
            name: 'handle_cleanup_tool',
            description: 'Uses string unregister cleanup',
            handler: async () => 'result',
          })
        );

        unmount();

        expect(unregister).toHaveBeenCalledTimes(1);
        expect(unregisterTool).not.toHaveBeenCalled();
      } finally {
        if (originalDescriptor) {
          Object.defineProperty(navigator, 'modelContext', originalDescriptor);
        } else {
          delete (navigator as unknown as Record<string, unknown>).modelContext;
        }
      }
    });

    it('should attempt string-name cleanup exactly once', async () => {
      const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'modelContext');
      const unregisterTool = vi.fn();

      Object.defineProperty(navigator, 'modelContext', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: {
          registerTool: vi.fn(() => undefined),
          unregisterTool,
        },
      });

      try {
        const { unmount } = await renderHook(() =>
          useWebMCP({
            name: 'string_cleanup_tool',
            description: 'Uses string unregister cleanup',
            handler: async () => 'result',
          })
        );

        unmount();

        expect(unregisterTool).toHaveBeenCalledTimes(1);
        expect(unregisterTool).toHaveBeenCalledWith('string_cleanup_tool');
      } finally {
        if (originalDescriptor) {
          Object.defineProperty(navigator, 'modelContext', originalDescriptor);
        } else {
          delete (navigator as unknown as Record<string, unknown>).modelContext;
        }
      }
    });

    it('should handle unregister errors gracefully', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const unregisterSpy = vi.spyOn(getModelContext(), 'unregisterTool').mockImplementation(() => {
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
      const registerToolSpy = vi.spyOn(getModelContext(), 'registerTool');

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
      const registerToolSpy = vi.spyOn(getModelContext(), 'registerTool');

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

    it('should not re-register when onStart reference changes', async () => {
      const registerToolSpy = vi.spyOn(getModelContext(), 'registerTool');

      try {
        const { rerender } = await renderHook(
          ({ onStart }) =>
            useWebMCP({
              name: 'onstart_ref_tool',
              description: 'Test',
              handler: async () => 'result',
              onStart,
            }),
          { initialProps: { onStart: () => {} } }
        );

        const initialCallCount = registerToolSpy.mock.calls.length;

        await rerender({ onStart: () => {} });

        expect(registerToolSpy.mock.calls.length).toBe(initialCallCount);
      } finally {
        registerToolSpy.mockRestore();
      }
    });

    it('should not re-register when onError reference changes', async () => {
      const registerToolSpy = vi.spyOn(getModelContext(), 'registerTool');

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
      const registerToolSpy = vi.spyOn(getModelContext(), 'registerTool');

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
      const registerToolSpy = vi.spyOn(getModelContext(), 'registerTool');

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

    it('should not re-register when annotations object is structurally identical but new reference', async () => {
      const registerToolSpy = vi.spyOn(getModelContext(), 'registerTool');

      try {
        const annotations = { readOnlyHint: false, idempotentHint: false };
        const { rerender } = await renderHook(
          ({ ann }) =>
            useWebMCP({
              name: 'annotations_ref_tool',
              description: 'Test',
              annotations: ann,
              handler: async () => 'result',
            }),
          { initialProps: { ann: annotations } }
        );

        const initialCallCount = registerToolSpy.mock.calls.length;

        // New object reference, same structure
        await rerender({ ann: { readOnlyHint: false, idempotentHint: false } });

        expect(registerToolSpy.mock.calls.length).toBe(initialCallCount);
      } finally {
        registerToolSpy.mockRestore();
      }
    });

    it('should not re-register when inputSchema object is structurally identical but new reference', async () => {
      const registerToolSpy = vi.spyOn(getModelContext(), 'registerTool');
      const schema = {
        type: 'object',
        properties: { name: { type: 'string' } },
      } as const;

      try {
        const { rerender } = await renderHook(
          ({ schema: s }) =>
            useWebMCP({
              name: 'schema_ref_tool',
              description: 'Test',
              inputSchema: s,
              handler: async () => 'result',
            }),
          { initialProps: { schema } }
        );

        const initialCallCount = registerToolSpy.mock.calls.length;

        await rerender({
          schema: {
            type: 'object',
            properties: { name: { type: 'string' } },
          } as const,
        });

        expect(registerToolSpy.mock.calls.length).toBe(initialCallCount);
      } finally {
        registerToolSpy.mockRestore();
      }
    });

    it('should re-register when annotations content actually changes', async () => {
      const registerToolSpy = vi.spyOn(getModelContext(), 'registerTool');

      try {
        const { rerender } = await renderHook(
          ({ hint }: { hint: boolean }) =>
            useWebMCP({
              name: 'annotations_change_tool',
              description: 'Test',
              annotations: { readOnlyHint: hint },
              handler: async () => 'result',
            }),
          { initialProps: { hint: false } }
        );

        const initialCallCount = registerToolSpy.mock.calls.length;

        await rerender({ hint: true });

        expect(registerToolSpy.mock.calls.length).toBeGreaterThan(initialCallCount);
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

    it('should use latest onStart callback after reference change', async () => {
      const onStartV1 = vi.fn();
      const onStartV2 = vi.fn();

      const { result, rerender, act } = await renderHook(
        ({ onStart }) =>
          useWebMCP({
            name: 'latest_onstart_tool',
            description: 'Test',
            handler: async () => 'result',
            onStart,
          }),
        { initialProps: { onStart: onStartV1 } }
      );

      await rerender({ onStart: onStartV2 });

      await act(async () => {
        await result.current.execute({ value: 1 });
      });

      expect(onStartV1).not.toHaveBeenCalled();
      expect(onStartV2).toHaveBeenCalledWith({ value: 1 });
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

      const result = await getTestingApi().executeTool('latest_format_tool', JSON.stringify({}));

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
      const modelContext = getModelContext();
      const originalRegister = modelContext.registerTool.bind(modelContext);
      const originalUnregister = modelContext.unregisterTool.bind(modelContext);

      const registerToolSpy = vi
        .spyOn(modelContext, 'registerTool')
        .mockImplementation((...args) => {
          callOrder.push('register');
          return originalRegister(...args);
        });
      const unregisterToolSpy = vi
        .spyOn(modelContext, 'unregisterTool')
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

  describe('render count verification', () => {
    function useRenderCount() {
      const count = useRef(0);
      count.current++;
      return count;
    }

    it('inline annotations do not cause extra registrations across multiple rerenders', async () => {
      const registerToolSpy = vi.spyOn(getModelContext(), 'registerTool');
      const unregisterToolSpy = vi.spyOn(getModelContext(), 'unregisterTool');

      try {
        const { rerender } = await renderHook(
          ({ counter }: { counter: number }) =>
            useWebMCP({
              name: 'render_count_annotations_tool',
              description: 'Test',
              annotations: { readOnlyHint: false, idempotentHint: false },
              handler: async () => `result-${counter}`,
            }),
          { initialProps: { counter: 0 } }
        );

        const registerCountAfterMount = registerToolSpy.mock.calls.length;

        // Simulate 5 parent rerenders — each passes new inline annotations object
        for (let i = 1; i <= 5; i++) {
          await rerender({ counter: i });
        }

        // registerTool should NOT have been called again
        expect(registerToolSpy.mock.calls.length).toBe(registerCountAfterMount);
        // unregisterTool should NOT have been called
        expect(unregisterToolSpy).not.toHaveBeenCalled();
        expect(getRegisteredTools()).toHaveLength(1);
      } finally {
        registerToolSpy.mockRestore();
        unregisterToolSpy.mockRestore();
      }
    });

    it('inline inputSchema and outputSchema do not cause re-registration across rerenders', async () => {
      const registerToolSpy = vi.spyOn(getModelContext(), 'registerTool');

      try {
        const { rerender } = await renderHook(
          ({ counter }: { counter: number }) =>
            useWebMCP({
              name: 'render_count_schema_tool',
              description: 'Test',
              inputSchema: {
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id'],
              } as const,
              outputSchema: {
                type: 'object',
                properties: { success: { type: 'boolean' } },
              } as const,
              annotations: { readOnlyHint: true },
              handler: async () => ({ success: true }),
            }),
          { initialProps: { counter: 0 } }
        );

        const registerCountAfterMount = registerToolSpy.mock.calls.length;

        for (let i = 1; i <= 5; i++) {
          await rerender({ counter: i });
        }

        expect(registerToolSpy.mock.calls.length).toBe(registerCountAfterMount);
      } finally {
        registerToolSpy.mockRestore();
      }
    });

    it('render count stays minimal when config objects are inline', async () => {
      const { result, rerender } = await renderHook(
        ({ counter }: { counter: number }) => {
          const renderCount = useRenderCount();
          useWebMCP({
            name: 'render_count_inline_tool',
            description: 'Test',
            annotations: { readOnlyHint: false },
            inputSchema: {
              type: 'object',
              properties: { x: { type: 'number' } },
            } as const,
            handler: async () => `v${counter}`,
          });
          return { renderCount: renderCount.current };
        },
        { initialProps: { counter: 0 } }
      );

      const afterMount = result.current.renderCount;

      await rerender({ counter: 1 });
      await rerender({ counter: 2 });
      await rerender({ counter: 3 });

      // Each rerender() call should cause exactly 1 render (the rerender itself).
      // Without the fix, each rerender would trigger effect cleanup + re-run,
      // which fires tools/list_changed notifications causing additional renders.
      const totalRenders = result.current.renderCount;
      const extraRenders = totalRenders - afterMount;
      expect(extraRenders).toBe(3); // exactly 3 rerenders, no cascading
    });

    it('return value references are stable across rerenders with inline objects', async () => {
      const { result, rerender } = await renderHook(
        ({ counter }: { counter: number }) =>
          useWebMCP({
            name: 'stable_refs_inline_tool',
            description: 'Test',
            annotations: { idempotentHint: true },
            handler: async () => `v${counter}`,
          }),
        { initialProps: { counter: 0 } }
      );

      const firstExecute = result.current.execute;
      const firstReset = result.current.reset;
      const firstState = result.current.state;

      await rerender({ counter: 1 });

      expect(result.current.execute).toBe(firstExecute);
      expect(result.current.reset).toBe(firstReset);
      // State object should be the same reference (no state updates occurred)
      expect(result.current.state).toBe(firstState);
    });

    it('structurally changed annotations DO cause re-registration', async () => {
      const registerToolSpy = vi.spyOn(getModelContext(), 'registerTool');
      const unregisterToolSpy = vi.spyOn(getModelContext(), 'unregisterTool');

      try {
        const { rerender } = await renderHook(
          ({ readOnly }: { readOnly: boolean }) =>
            useWebMCP({
              name: 'changed_annotations_tool',
              description: 'Test',
              annotations: { readOnlyHint: readOnly },
              handler: async () => 'result',
            }),
          { initialProps: { readOnly: false } }
        );

        const registerCountAfterMount = registerToolSpy.mock.calls.length;

        await rerender({ readOnly: true });

        // Should have re-registered (unregister old + register new)
        expect(registerToolSpy.mock.calls.length).toBeGreaterThan(registerCountAfterMount);
        expect(unregisterToolSpy).toHaveBeenCalled();
        // But only one tool should exist
        expect(getRegisteredTools()).toHaveLength(1);
      } finally {
        registerToolSpy.mockRestore();
        unregisterToolSpy.mockRestore();
      }
    });

    it('multiple tools with inline objects do not cascade re-registrations', async () => {
      const registerToolSpy = vi.spyOn(getModelContext(), 'registerTool');

      try {
        const { rerender } = await renderHook(
          ({ counter }: { counter: number }) => {
            const tool1 = useWebMCP({
              name: 'cascade_tool_1',
              description: 'First tool',
              annotations: { readOnlyHint: true },
              handler: async () => `t1-${counter}`,
            });
            const tool2 = useWebMCP({
              name: 'cascade_tool_2',
              description: 'Second tool',
              annotations: { idempotentHint: false },
              inputSchema: {
                type: 'object',
                properties: { id: { type: 'string' } },
              } as const,
              handler: async () => `t2-${counter}`,
            });
            return { tool1, tool2 };
          },
          { initialProps: { counter: 0 } }
        );

        const registerCountAfterMount = registerToolSpy.mock.calls.length;

        await rerender({ counter: 1 });
        await rerender({ counter: 2 });

        // No additional registrations
        expect(registerToolSpy.mock.calls.length).toBe(registerCountAfterMount);
        expect(getRegisteredTools().filter((t) => t.name.startsWith('cascade_tool_'))).toHaveLength(
          2
        );
      } finally {
        registerToolSpy.mockRestore();
      }
    });

    it('handler execution still works correctly after rerenders with inline objects', async () => {
      const { result, rerender, act } = await renderHook(
        ({ multiplier }: { multiplier: number }) =>
          useWebMCP({
            name: 'exec_after_rerender_tool',
            description: 'Test',
            annotations: { readOnlyHint: false },
            inputSchema: {
              type: 'object',
              properties: { value: { type: 'number' } },
            } as const,
            handler: async (input: { value: number }) => input.value * multiplier,
          }),
        { initialProps: { multiplier: 2 } }
      );

      // Rerender several times with different multiplier but same inline objects
      await rerender({ multiplier: 3 });
      await rerender({ multiplier: 5 });

      // Handler should use latest multiplier via ref
      await act(async () => {
        await result.current.execute({ value: 10 });
      });

      expect(result.current.state.lastResult).toBe(50); // 10 * 5
      expect(result.current.state.executionCount).toBe(1);
    });
  });
});
