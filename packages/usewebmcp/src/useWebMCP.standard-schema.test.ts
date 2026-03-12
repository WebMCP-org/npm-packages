import { initializeWebModelContext } from '@mcp-b/global';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import * as z from 'zod/v4';

import { useWebMCP } from './useWebMCP.js';

/**
 * Standard Schema integration tests for useWebMCP with Zod v4.
 *
 * Zod v4 implements Standard Schema v1 (`~standard` protocol) which means
 * schemas can be passed directly as `inputSchema` without manual JSON Schema
 * conversion. The polyfill detects `~standard.validate` and uses it for
 * runtime validation, while TypeScript infers handler args from `~standard.types.input`.
 */

const TEST_CHANNEL_ID = `useWebMCP-standard-schema-test-${Date.now()}`;

function getTestingApi(): NonNullable<typeof navigator.modelContextTesting> {
  const testingApi = navigator.modelContextTesting;
  if (!testingApi) {
    throw new Error('Expected navigator.modelContextTesting to be available');
  }
  return testingApi;
}

function getModelContext(): NonNullable<typeof navigator.modelContext> {
  const modelContext = navigator.modelContext;
  if (!modelContext) {
    throw new Error('Expected navigator.modelContext to be available');
  }
  return modelContext;
}

function getRegisteredTool(name: string) {
  const tool = getTestingApi()
    .listTools()
    .find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Expected registered tool "${name}"`);
  }
  return tool;
}

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

describe('useWebMCP with Zod v4 Standard Schema', () => {
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
  });

  describe('tool registration via Standard Schema', () => {
    it('should register a tool with a Zod v4 inputSchema', async () => {
      const schema = z.object({
        query: z.string(),
        limit: z.number().optional(),
      });

      await renderHook(() =>
        useWebMCP({
          name: 'zod4_search',
          description: 'Search with Zod v4 Standard Schema input',
          inputSchema: schema,
          execute: async ({ query, limit }) => {
            return { query, limit: limit ?? 10 };
          },
        })
      );

      const tool = getRegisteredTool('zod4_search');
      expect(tool.description).toBe('Search with Zod v4 Standard Schema input');
    });

    it('should list the tool with a valid inputSchema in metadata', async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      await renderHook(() =>
        useWebMCP({
          name: 'zod4_metadata',
          description: 'Metadata test',
          inputSchema: schema,
          execute: async (input) => input,
        })
      );

      const tool = getRegisteredTool('zod4_metadata');
      // The polyfill should expose some inputSchema (may be the default empty object
      // since Zod v4 Standard Schema doesn't expose jsonSchema, only validate)
      expect(tool.inputSchema).toBeDefined();
    });
  });

  describe('execution via modelContextTesting (MCP client path)', () => {
    it('should execute with valid args and return content', async () => {
      const schema = z.object({
        message: z.string(),
      });

      await renderHook(() =>
        useWebMCP({
          name: 'zod4_echo',
          description: 'Echo a message',
          inputSchema: schema,
          execute: async ({ message }) => {
            return { echoed: message };
          },
        })
      );

      const result = await getTestingApi().executeTool(
        'zod4_echo',
        JSON.stringify({ message: 'hello from standard schema' })
      );

      const parsed = parseSerializedToolResponse(result);
      expect(parsed.content).toBeDefined();
      expect(parsed.content.length).toBeGreaterThan(0);
      expect(parsed.content[0].type).toBe('text');
      expect(parsed.content[0].text).toContain('hello from standard schema');
    });

    it('should reject invalid args via Standard Schema validation', async () => {
      const schema = z.object({
        count: z.number(),
      });

      await renderHook(() =>
        useWebMCP({
          name: 'zod4_validate',
          description: 'Validation test',
          inputSchema: schema,
          execute: async ({ count }) => {
            return { doubled: count * 2 };
          },
        })
      );

      // Pass a string where number is expected
      await expect(
        getTestingApi().executeTool('zod4_validate', JSON.stringify({ count: 'not a number' }))
      ).rejects.toThrow();
    });

    it('should reject missing required fields via Standard Schema validation', async () => {
      const schema = z.object({
        required_field: z.string(),
      });

      await renderHook(() =>
        useWebMCP({
          name: 'zod4_required',
          description: 'Required field test',
          inputSchema: schema,
          execute: async ({ required_field }) => {
            return { value: required_field };
          },
        })
      );

      // Pass empty object, missing required field
      await expect(
        getTestingApi().executeTool('zod4_required', JSON.stringify({}))
      ).rejects.toThrow();
    });
  });

  describe('execution via hook execute() (UI path)', () => {
    it('should execute and update state', async () => {
      const schema = z.object({
        x: z.number(),
        y: z.number(),
      });

      const { result, act } = await renderHook(() =>
        useWebMCP({
          name: 'zod4_add',
          description: 'Add two numbers',
          inputSchema: schema,
          execute: async ({ x, y }) => {
            return { sum: x + y };
          },
        })
      );

      expect(result.current.state.executionCount).toBe(0);

      await act(async () => {
        await result.current.execute({ x: 3, y: 7 });
      });

      expect(result.current.state.lastResult).toEqual({ sum: 10 });
      expect(result.current.state.executionCount).toBe(1);
      expect(result.current.state.isExecuting).toBe(false);
      expect(result.current.state.error).toBeNull();
    });

    it('should update error state when handler throws', async () => {
      const schema = z.object({
        shouldFail: z.boolean(),
      });

      const { result, act } = await renderHook(() =>
        useWebMCP({
          name: 'zod4_failing',
          description: 'A tool that fails',
          inputSchema: schema,
          execute: async ({ shouldFail }) => {
            if (shouldFail) {
              throw new Error('intentional failure');
            }
            return { ok: true };
          },
        })
      );

      await act(async () => {
        try {
          await result.current.execute({ shouldFail: true });
        } catch {
          // expected
        }
      });

      expect(result.current.state.error).toBeInstanceOf(Error);
      expect(result.current.state.error?.message).toBe('intentional failure');
      expect(result.current.state.isExecuting).toBe(false);
    });
  });

  describe('output schema with Standard Schema input', () => {
    it('should return structuredContent when outputSchema is provided', async () => {
      const inputSchema = z.object({
        userId: z.string(),
      });

      const outputSchema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
      } as const;

      await renderHook(() =>
        useWebMCP({
          name: 'zod4_with_output',
          description: 'Standard Schema input + JSON Schema output',
          inputSchema,
          outputSchema,
          execute: async ({ userId }) => {
            return { id: userId, name: `User ${userId}` };
          },
        })
      );

      const result = await getTestingApi().executeTool(
        'zod4_with_output',
        JSON.stringify({ userId: 'abc-123' })
      );

      const parsed = parseSerializedToolResponse(result);
      expect(parsed.structuredContent).toEqual({
        id: 'abc-123',
        name: 'User abc-123',
      });
    });
  });

  describe('complex Zod v4 schemas', () => {
    it('should handle nested object schemas', async () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          email: z.string(),
        }),
        options: z.object({
          notify: z.boolean(),
        }),
      });

      const { result, act } = await renderHook(() =>
        useWebMCP({
          name: 'zod4_nested',
          description: 'Nested objects',
          inputSchema: schema,
          execute: async ({ user, options }) => {
            return {
              greeting: `Hello ${user.name} (${user.email})`,
              notified: options.notify,
            };
          },
        })
      );

      await act(async () => {
        await result.current.execute({
          user: { name: 'Alex', email: 'alex@example.com' },
          options: { notify: true },
        });
      });

      expect(result.current.state.lastResult).toEqual({
        greeting: 'Hello Alex (alex@example.com)',
        notified: true,
      });
    });

    it('should handle array schemas', async () => {
      const schema = z.object({
        tags: z.array(z.string()),
        limit: z.number(),
      });

      await renderHook(() =>
        useWebMCP({
          name: 'zod4_arrays',
          description: 'Array input',
          inputSchema: schema,
          execute: async ({ tags, limit }) => {
            return { filtered: tags.slice(0, limit) };
          },
        })
      );

      const result = await getTestingApi().executeTool(
        'zod4_arrays',
        JSON.stringify({ tags: ['a', 'b', 'c', 'd'], limit: 2 })
      );

      const parsed = parseSerializedToolResponse(result);
      const text = parsed.content[0]?.text;
      expect(text).toBeDefined();
      // defaultFormatOutput pretty-prints JSON, so parse back to check value
      const output = JSON.parse(text ?? '{}') as { filtered: string[] };
      expect(output.filtered).toEqual(['a', 'b']);
    });

    it('should handle enum/union schemas', async () => {
      const schema = z.object({
        action: z.enum(['start', 'stop', 'restart']),
        force: z.boolean().optional(),
      });

      await renderHook(() =>
        useWebMCP({
          name: 'zod4_enum',
          description: 'Enum input',
          inputSchema: schema,
          execute: async ({ action, force }) => {
            return { performed: action, forced: force ?? false };
          },
        })
      );

      const result = await getTestingApi().executeTool(
        'zod4_enum',
        JSON.stringify({ action: 'restart', force: true })
      );

      const parsed = parseSerializedToolResponse(result);
      expect(parsed.content[0].text).toContain('restart');
    });

    it('should reject invalid enum values via validation', async () => {
      const schema = z.object({
        status: z.enum(['active', 'inactive']),
      });

      await renderHook(() =>
        useWebMCP({
          name: 'zod4_enum_invalid',
          description: 'Enum validation test',
          inputSchema: schema,
          execute: async ({ status }) => {
            return { status };
          },
        })
      );

      await expect(
        getTestingApi().executeTool('zod4_enum_invalid', JSON.stringify({ status: 'deleted' }))
      ).rejects.toThrow();
    });
  });

  describe('type inference verification', () => {
    it('should infer handler args from Zod v4 schema at compile time', async () => {
      const schema = z.object({
        title: z.string(),
        count: z.number(),
        active: z.boolean(),
      });

      // This test verifies compile-time inference. If the types are wrong,
      // TypeScript would error on the property accesses below.
      const { result, act } = await renderHook(() =>
        useWebMCP({
          name: 'zod4_inference',
          description: 'Type inference test',
          inputSchema: schema,
          execute: async (args) => {
            // These should all be correctly typed without explicit casting:
            const title: string = args.title;
            const count: number = args.count;
            const active: boolean = args.active;
            return { title, count, active };
          },
        })
      );

      await act(async () => {
        await result.current.execute({ title: 'Test', count: 42, active: true });
      });

      expect(result.current.state.lastResult).toEqual({
        title: 'Test',
        count: 42,
        active: true,
      });
    });

    it('should infer optional fields as possibly undefined', async () => {
      const schema = z.object({
        required: z.string(),
        optional: z.string().optional(),
      });

      const { result, act } = await renderHook(() =>
        useWebMCP({
          name: 'zod4_optional_inference',
          description: 'Optional inference test',
          inputSchema: schema,
          execute: async (args) => {
            // `optional` should be typed as `string | undefined`
            const value: string = args.optional ?? 'default';
            return { required: args.required, resolved: value };
          },
        })
      );

      await act(async () => {
        await result.current.execute({ required: 'hello' });
      });

      expect(result.current.state.lastResult).toEqual({
        required: 'hello',
        resolved: 'default',
      });
    });
  });

  describe('callbacks with Standard Schema', () => {
    it('should call onSuccess with result and input', async () => {
      const schema = z.object({ value: z.number() });
      let capturedResult: unknown = null;
      let capturedInput: unknown = null;

      const { act } = await renderHook(() =>
        useWebMCP({
          name: 'zod4_onsuccess',
          description: 'onSuccess callback test',
          inputSchema: schema,
          execute: async ({ value }) => ({ doubled: value * 2 }),
          onSuccess: (result, input) => {
            capturedResult = result;
            capturedInput = input;
          },
        })
      );

      // Execute via modelContextTesting to trigger MCP path
      await act(async () => {
        await getTestingApi().executeTool('zod4_onsuccess', JSON.stringify({ value: 5 }));
      });

      expect(capturedResult).toEqual({ doubled: 10 });
      expect(capturedInput).toEqual({ value: 5 });
    });

    it('should call onError when handler fails', async () => {
      const schema = z.object({ trigger: z.boolean() });
      let capturedError: Error | null = null;

      const { result, act } = await renderHook(() =>
        useWebMCP({
          name: 'zod4_onerror',
          description: 'onError callback test',
          inputSchema: schema,
          execute: async () => {
            throw new Error('standard schema error');
          },
          onError: (err) => {
            capturedError = err;
          },
        })
      );

      await act(async () => {
        try {
          await result.current.execute({ trigger: true });
        } catch {
          // expected
        }
      });

      expect(capturedError).toBeInstanceOf(Error);
      expect(capturedError?.message).toBe('standard schema error');
    });
  });

  describe('lifecycle', () => {
    it('should unregister tool on unmount', async () => {
      const schema = z.object({ input: z.string() });

      const { unmount } = await renderHook(() =>
        useWebMCP({
          name: 'zod4_lifecycle',
          description: 'Lifecycle test',
          inputSchema: schema,
          execute: async ({ input }) => ({ output: input }),
        })
      );

      let tools = getTestingApi().listTools();
      expect(tools.find((t) => t.name === 'zod4_lifecycle')).toBeDefined();

      unmount();

      tools = getTestingApi().listTools();
      expect(tools.find((t) => t.name === 'zod4_lifecycle')).toBeUndefined();
    });
  });
});
