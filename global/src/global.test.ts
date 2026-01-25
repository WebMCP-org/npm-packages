import { TabClientTransport } from '@mcp-b/transports';
import type { JSONRPCMessage } from '@mcp-b/webmcp-ts-sdk';
import { Client } from '@mcp-b/webmcp-ts-sdk';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { cleanupWebModelContext, initializeWebModelContext } from './global.js';
import type { InternalModelContext, ModelContext, ModelContextTesting } from './types.js';

// Extend Navigator type for testing
declare global {
  interface Navigator {
    modelContext?: ModelContext;
    modelContextTesting?: ModelContextTesting;
  }
}

// Use a unique channel ID for the entire test suite to avoid conflicts
const TEST_CHANNEL_ID = `test-suite-${Date.now()}`;
const DEFAULT_INIT_OPTIONS = {
  transport: {
    tabServer: {
      channelId: TEST_CHANNEL_ID,
      allowedOrigins: [window.location.origin],
    },
  },
} as const;

async function resetPolyfill(options = DEFAULT_INIT_OPTIONS) {
  await flushMicrotasks();
  const descriptor = Object.getOwnPropertyDescriptor(window.navigator, 'modelContext');

  if (descriptor && descriptor.configurable === false) {
    installNotificationGuards();
    return;
  }

  try {
    cleanupWebModelContext();
  } catch {
    // Navigator properties are non-configurable when the polyfill is installed
  }
  initializeWebModelContext(options);
  installNotificationGuards();
}

async function flushMicrotasks(count = 1): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await Promise.resolve();
  }
}

function installNotificationGuards(): void {
  const bridge = (
    window as unknown as {
      __mcpBridge?: {
        tabServer?: { notification?: (...args: unknown[]) => Promise<unknown> };
        iframeServer?: { notification?: (...args: unknown[]) => Promise<unknown> };
      };
    }
  ).__mcpBridge;

  if (!bridge) return;

  const wrap = (server?: { notification?: (...args: unknown[]) => Promise<unknown> }) => {
    if (!server?.notification) return;
    const original = server.notification.bind(server);
    server.notification = async (...args: unknown[]) => {
      try {
        return await original(...args);
      } catch {
        return;
      }
    };
  };

  wrap(bridge.tabServer);
  wrap(bridge.iframeServer);
}

/**
 * Helper to create an MCP client connected to the polyfill server.
 */
async function createMCPClient(): Promise<{
  transport: TabClientTransport;
  sendRequest: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  close: () => Promise<void>;
}> {
  const transport = new TabClientTransport({
    targetOrigin: window.location.origin,
    channelId: TEST_CHANNEL_ID,
    requestTimeout: 5000,
  });

  let requestId = 0;
  const pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  transport.onmessage = (message: JSONRPCMessage) => {
    if ('id' in message && message.id !== undefined) {
      const pending = pendingRequests.get(message.id as number);
      if (pending) {
        pendingRequests.delete(message.id as number);
        if ('error' in message) {
          pending.reject(new Error((message.error as { message: string }).message));
        } else {
          pending.resolve('result' in message ? message.result : undefined);
        }
      }
    }
  };

  await transport.start();
  await transport.serverReadyPromise;

  const sendRequest = (method: string, params?: Record<string, unknown>): Promise<unknown> => {
    const id = ++requestId;
    return new Promise((resolve, reject) => {
      pendingRequests.set(id, { resolve, reject });
      transport.send({
        jsonrpc: '2.0',
        id,
        method,
        params: params ?? {},
      });
    });
  };

  const close = async () => {
    pendingRequests.clear();
    try {
      await transport.close();
    } catch {
      // Ignore close errors
    }
  };

  return { transport, sendRequest, close };
}

describe('Web Model Context Polyfill', () => {
  beforeAll(async () => {
    await resetPolyfill();
  });

  afterAll(async () => {
    await flushMicrotasks();
    try {
      cleanupWebModelContext();
    } catch {
      // navigator properties may be non-configurable in jsdom/browser environments
    }
  });

  // Initialize polyfill once for all tests
  // Clear context before each test to ensure clean state
  beforeEach(async () => {
    if (!navigator.modelContext || !navigator.modelContextTesting) {
      await resetPolyfill();
    }
    navigator.modelContext?.clearContext();
    navigator.modelContextTesting?.reset();
  });

  afterEach(async () => {
    await flushMicrotasks();
  });

  describe('Initialization', () => {
    it('should have navigator.modelContext installed', () => {
      expect(navigator.modelContext).toBeDefined();
      expect(typeof navigator.modelContext?.registerTool).toBe('function');
      expect(typeof navigator.modelContext?.provideContext).toBe('function');
      expect(typeof navigator.modelContext?.clearContext).toBe('function');
    });

    it('should have navigator.modelContextTesting installed', () => {
      expect(navigator.modelContextTesting).toBeDefined();
      expect(typeof navigator.modelContextTesting?.executeTool).toBe('function');
      expect(typeof navigator.modelContextTesting?.listTools).toBe('function');
    });

    it('should start with empty context after clearContext', () => {
      expect(navigator.modelContextTesting!.listTools()).toHaveLength(0);
      expect(navigator.modelContext!.listResources()).toHaveLength(0);
      expect(navigator.modelContext!.listPrompts()).toHaveLength(0);
    });
  });

  describe('Tool Registration via provideContext', () => {
    it('should register tools via provideContext', () => {
      navigator.modelContext!.provideContext({
        tools: [
          {
            name: 'test_tool',
            description: 'A test tool',
            inputSchema: { name: z.string() },
            execute: async () => ({ content: [{ type: 'text', text: 'done' }] }),
          },
        ],
      });

      const tools = navigator.modelContextTesting!.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test_tool');
      expect(tools[0].description).toBe('A test tool');
    });

    it('should support JSON Schema input format', () => {
      navigator.modelContext!.provideContext({
        tools: [
          {
            name: 'json_schema_tool',
            description: 'Tool with JSON Schema',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
              required: ['name'],
            },
            execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
          },
        ],
      });

      const tools = navigator.modelContextTesting!.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('json_schema_tool');
    });

    it('should replace tools on subsequent provideContext calls', () => {
      navigator.modelContext!.provideContext({
        tools: [
          {
            name: 'tool_a',
            description: 'Tool A',
            inputSchema: {},
            execute: async () => ({ content: [{ type: 'text', text: 'a' }] }),
          },
        ],
      });

      expect(navigator.modelContextTesting!.listTools()).toHaveLength(1);

      navigator.modelContext!.provideContext({
        tools: [
          {
            name: 'tool_b',
            description: 'Tool B',
            inputSchema: {},
            execute: async () => ({ content: [{ type: 'text', text: 'b' }] }),
          },
          {
            name: 'tool_c',
            description: 'Tool C',
            inputSchema: {},
            execute: async () => ({ content: [{ type: 'text', text: 'c' }] }),
          },
        ],
      });

      const tools = navigator.modelContextTesting!.listTools();
      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name).sort()).toEqual(['tool_b', 'tool_c']);
    });
  });

  describe('Tool Registration via registerTool', () => {
    it('should register and unregister tools dynamically', () => {
      const { unregister } = navigator.modelContext!.registerTool({
        name: 'dynamic_tool',
        description: 'A dynamic tool',
        inputSchema: { value: z.number() },
        execute: async ({ value }) => ({
          content: [{ type: 'text', text: String(value * 2) }],
        }),
      });

      expect(navigator.modelContextTesting!.listTools()).toHaveLength(1);

      unregister();

      expect(navigator.modelContextTesting!.listTools()).toHaveLength(0);
    });

    it('should persist dynamic tools across provideContext calls', () => {
      // Register dynamic tool first
      navigator.modelContext!.registerTool({
        name: 'dynamic_tool',
        description: 'Dynamic',
        inputSchema: {},
        execute: async () => ({ content: [{ type: 'text', text: 'dynamic' }] }),
      });

      // provideContext should not remove dynamic tools
      navigator.modelContext!.provideContext({
        tools: [
          {
            name: 'base_tool',
            description: 'Base',
            inputSchema: {},
            execute: async () => ({ content: [{ type: 'text', text: 'base' }] }),
          },
        ],
      });

      const tools = navigator.modelContextTesting!.listTools();
      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name).sort()).toEqual(['base_tool', 'dynamic_tool']);
    });

    it('should throw on name collision with provideContext tools', () => {
      navigator.modelContext!.provideContext({
        tools: [
          {
            name: 'collision_tool',
            description: 'Base',
            inputSchema: {},
            execute: async () => ({ content: [{ type: 'text', text: 'base' }] }),
          },
        ],
      });

      expect(() => {
        navigator.modelContext!.registerTool({
          name: 'collision_tool',
          description: 'Dynamic',
          inputSchema: {},
          execute: async () => ({ content: [{ type: 'text', text: 'dynamic' }] }),
        });
      }).toThrow(/collision/i);
    });
  });

  describe('Tool Execution', () => {
    it('should execute tools via testing API', async () => {
      navigator.modelContext!.provideContext({
        tools: [
          {
            name: 'echo',
            description: 'Echo tool',
            inputSchema: { message: z.string() },
            execute: async ({ message }) => ({
              content: [{ type: 'text', text: `Echo: ${message}` }],
            }),
          },
        ],
      });

      const result = await navigator.modelContextTesting!.executeTool(
        'echo',
        JSON.stringify({ message: 'hello' })
      );

      expect(result).toBe('Echo: hello');
    });

    it('should return structured content when present', async () => {
      navigator.modelContext!.provideContext({
        tools: [
          {
            name: 'structured',
            description: 'Returns structured data',
            inputSchema: {},
            execute: async () => ({
              content: [{ type: 'text', text: 'JSON response' }],
              structuredContent: { foo: 'bar', count: 42 },
            }),
          },
        ],
      });

      const result = await navigator.modelContextTesting!.executeTool(
        'structured',
        JSON.stringify({})
      );

      expect(result).toEqual({ foo: 'bar', count: 42 });
    });

    it('should handle tool execution errors', async () => {
      navigator.modelContext!.provideContext({
        tools: [
          {
            name: 'failing_tool',
            description: 'Always fails',
            inputSchema: {},
            execute: async () => {
              throw new Error('Intentional failure');
            },
          },
        ],
      });

      // Should return undefined for errors (as per native API behavior)
      const result = await navigator.modelContextTesting!.executeTool(
        'failing_tool',
        JSON.stringify({})
      );

      expect(result).toBeUndefined();
    });

    it('should throw for non-existent tools', async () => {
      await expect(
        navigator.modelContextTesting!.executeTool('nonexistent', JSON.stringify({}))
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('MCP Client Communication', () => {
    let client: Awaited<ReturnType<typeof createMCPClient>>;

    beforeEach(async () => {
      // Register some tools before connecting client
      navigator.modelContext!.provideContext({
        tools: [
          {
            name: 'add',
            description: 'Add two numbers',
            inputSchema: { a: z.number(), b: z.number() },
            execute: async ({ a, b }) => ({
              content: [{ type: 'text', text: String((a as number) + (b as number)) }],
              structuredContent: { result: (a as number) + (b as number) },
            }),
          },
          {
            name: 'greet',
            description: 'Greet a person',
            inputSchema: { name: z.string() },
            execute: async ({ name }) => ({
              content: [{ type: 'text', text: `Hello, ${name}!` }],
            }),
          },
        ],
      });

      client = await createMCPClient();
    });

    afterEach(async () => {
      await client?.close();
    });

    it('should list tools via MCP', async () => {
      const result = (await client.sendRequest('tools/list')) as { tools: unknown[] };

      expect(result.tools).toHaveLength(2);
      expect(result.tools.map((t: { name: string }) => t.name).sort()).toEqual(['add', 'greet']);
    });

    it('should call tools via MCP', async () => {
      const result = (await client.sendRequest('tools/call', {
        name: 'add',
        arguments: { a: 5, b: 3 },
      })) as { content: Array<{ text: string }>; structuredContent: { result: number } };

      expect(result.content[0].text).toBe('8');
      expect(result.structuredContent.result).toBe(8);
    });

    it('should handle MCP tool errors', async () => {
      await expect(
        client.sendRequest('tools/call', {
          name: 'nonexistent_tool',
          arguments: {},
        })
      ).rejects.toThrow();
    });

    it('should validate tool arguments via MCP', async () => {
      const result = (await client.sendRequest('tools/call', {
        name: 'add',
        arguments: { a: 'not a number', b: 5 },
      })) as { content: Array<{ text: string }>; isError: boolean };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/validation/i);
    });
  });

  describe('Custom Transport MCP Client', () => {
    it('should serve MCP requests over a provided transport', async () => {
      const transport = new TabClientTransport({
        targetOrigin: window.location.origin,
        channelId: TEST_CHANNEL_ID,
        requestTimeout: 5000,
      });
      const mcpClient = new Client({ name: 'test-client', version: '1.0.0' });

      await mcpClient.connect(transport);

      navigator.modelContext!.provideContext({
        tools: [
          {
            name: 'sum',
            description: 'Add numbers',
            inputSchema: { a: z.number(), b: z.number() },
            execute: async ({ a, b }) => ({
              content: [{ type: 'text', text: String((a as number) + (b as number)) }],
            }),
          },
        ],
        prompts: [
          {
            name: 'welcome',
            description: 'Welcomes a user',
            argsSchema: { name: z.string() },
            get: async ({ name }) => ({
              messages: [{ role: 'assistant', content: { type: 'text', text: `Hello ${name}` } }],
            }),
          },
        ],
      });

      const tools = await mcpClient.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain('sum');

      const toolResult = await mcpClient.callTool({
        name: 'sum',
        arguments: { a: 4, b: 6 },
      });
      expect(toolResult.content[0].text).toBe('10');

      const promptResult = await mcpClient.getPrompt({
        name: 'welcome',
        arguments: { name: 'Codex' },
      });
      expect(promptResult.messages[0].content).toMatchObject({ type: 'text', text: 'Hello Codex' });

      await expect(
        mcpClient.getPrompt({ name: 'welcome', arguments: { name: 123 } as unknown as object })
      ).rejects.toThrow(/invalid input/i);

      await transport.close();
    });
  });

  describe('Resource Registration', () => {
    it('should register resources via provideContext', () => {
      navigator.modelContext!.provideContext({
        resources: [
          {
            uri: 'app://settings',
            name: 'App Settings',
            description: 'Application settings',
            mimeType: 'application/json',
            read: async () => ({
              contents: [
                {
                  uri: 'app://settings',
                  mimeType: 'application/json',
                  text: JSON.stringify({ theme: 'dark' }),
                },
              ],
            }),
          },
        ],
      });

      const resources = navigator.modelContext!.listResources();
      expect(resources).toHaveLength(1);
      expect(resources[0].uri).toBe('app://settings');
    });

    it('should register and unregister resources dynamically', () => {
      const { unregister } = navigator.modelContext!.registerResource({
        uri: 'dynamic://data',
        name: 'Dynamic Data',
        read: async () => ({
          contents: [{ uri: 'dynamic://data', text: 'dynamic content' }],
        }),
      });

      expect(navigator.modelContext!.listResources()).toHaveLength(1);

      unregister();

      expect(navigator.modelContext!.listResources()).toHaveLength(0);
    });

    it('should support resource templates and template reads', async () => {
      const internalContext = navigator.modelContext as unknown as InternalModelContext;

      navigator.modelContext!.provideContext({
        resources: [
          {
            uri: 'app://config',
            name: 'Config',
            description: 'Static config',
            read: async (uri: URL) => ({
              contents: [{ uri: uri.toString(), text: 'config-json' }],
            }),
          },
          {
            uri: 'app://files/{path}',
            name: 'Dynamic File',
            description: 'File template',
            read: async (_uri: URL, params?: Record<string, string>) => ({
              contents: [
                {
                  uri: `app://files/${params?.path}`,
                  text: `file:${params?.path}`,
                },
              ],
            }),
          },
        ],
      });

      expect(navigator.modelContext!.listResources().map((r) => r.uri)).toEqual(['app://config']);

      expect(navigator.modelContext!.listResourceTemplates()).toEqual([
        {
          uriTemplate: 'app://files/{path}',
          name: 'Dynamic File',
          description: 'File template',
        },
      ]);

      const result = await internalContext.readResource('app://files/docs/readme.md');
      expect(result.contents[0].text).toBe('file:docs/readme.md');
    });
  });

  describe('Prompt Registration', () => {
    it('should register prompts via provideContext', () => {
      navigator.modelContext!.provideContext({
        prompts: [
          {
            name: 'code_review',
            description: 'Review code',
            get: async () => ({
              messages: [{ role: 'user', content: { type: 'text', text: 'Review this code' } }],
            }),
          },
        ],
      });

      const prompts = navigator.modelContext!.listPrompts();
      expect(prompts).toHaveLength(1);
      expect(prompts[0].name).toBe('code_review');
    });

    it('should register and unregister prompts dynamically', () => {
      const { unregister } = navigator.modelContext!.registerPrompt({
        name: 'dynamic_prompt',
        description: 'Dynamic prompt',
        get: async () => ({
          messages: [{ role: 'user', content: { type: 'text', text: 'Dynamic' } }],
        }),
      });

      expect(navigator.modelContext!.listPrompts()).toHaveLength(1);

      unregister();

      expect(navigator.modelContext!.listPrompts()).toHaveLength(0);
    });
  });

  describe('Testing API', () => {
    it('should record tool call history', async () => {
      navigator.modelContext!.provideContext({
        tools: [
          {
            name: 'tracked_tool',
            description: 'Tracked tool',
            inputSchema: { value: z.number() },
            execute: async () => ({ content: [{ type: 'text', text: 'done' }] }),
          },
        ],
      });

      await navigator.modelContextTesting!.executeTool(
        'tracked_tool',
        JSON.stringify({ value: 42 })
      );
      await navigator.modelContextTesting!.executeTool(
        'tracked_tool',
        JSON.stringify({ value: 100 })
      );

      const history = navigator.modelContextTesting!.getToolCalls();
      expect(history).toHaveLength(2);
      expect(history[0].toolName).toBe('tracked_tool');
      expect(history[0].arguments).toEqual({ value: 42 });
      expect(history[1].arguments).toEqual({ value: 100 });
    });

    it('should support mock responses', async () => {
      navigator.modelContext!.provideContext({
        tools: [
          {
            name: 'mockable_tool',
            description: 'Can be mocked',
            inputSchema: {},
            execute: async () => ({ content: [{ type: 'text', text: 'real response' }] }),
          },
        ],
      });

      // Set mock
      navigator.modelContextTesting!.setMockToolResponse('mockable_tool', {
        content: [{ type: 'text', text: 'mocked!' }],
      });

      const result = await navigator.modelContextTesting!.executeTool(
        'mockable_tool',
        JSON.stringify({})
      );

      expect(result).toBe('mocked!');

      // Clear mock
      navigator.modelContextTesting!.clearMockToolResponse('mockable_tool');

      const realResult = await navigator.modelContextTesting!.executeTool(
        'mockable_tool',
        JSON.stringify({})
      );

      expect(realResult).toBe('real response');
    });

    it('should notify toolsChanged callbacks with microtask batching', async () => {
      const callback = vi.fn();
      navigator.modelContextTesting!.registerToolsChangedCallback(callback);

      navigator.modelContext!.provideContext({
        tools: [
          {
            name: 'batched_tool',
            description: 'Batched',
            inputSchema: {},
            execute: async () => ({ content: [{ type: 'text', text: 'base' }] }),
          },
        ],
      });

      navigator.modelContext!.registerTool({
        name: 'batched_dynamic',
        description: 'Dynamic',
        inputSchema: {},
        execute: async () => ({ content: [{ type: 'text', text: 'dyn' }] }),
      });

      await flushMicrotasks();
      expect(callback).toHaveBeenCalledTimes(1);

      navigator.modelContext!.unregisterTool('batched_dynamic');
      await flushMicrotasks();
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should reset testing state', async () => {
      navigator.modelContext!.provideContext({
        tools: [
          {
            name: 'reset_test_tool',
            description: 'Test',
            inputSchema: {},
            execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
          },
        ],
      });

      await navigator.modelContextTesting!.executeTool('reset_test_tool', JSON.stringify({}));
      navigator.modelContextTesting!.setMockToolResponse('reset_test_tool', {
        content: [{ type: 'text', text: 'mock' }],
      });

      expect(navigator.modelContextTesting!.getToolCalls()).toHaveLength(1);

      navigator.modelContextTesting!.reset();

      expect(navigator.modelContextTesting!.getToolCalls()).toHaveLength(0);
    });
  });

  describe('Sampling and Elicitation', () => {
    it('should delegate sampling and elicitation to the MCP server implementation', async () => {
      const bridge = (window as unknown as { __mcpBridge: { tabServer: { server?: unknown } } })
        .__mcpBridge;
      const originalServer = bridge.tabServer.server;

      const createMessage = vi.fn().mockResolvedValue({
        model: 'test-model',
        content: { type: 'text', text: 'sampled' },
        role: 'assistant',
      });
      const elicitInput = vi.fn().mockResolvedValue({
        action: 'accept',
        content: { field: 'value' },
      });

      (bridge.tabServer as { server: unknown }).server = {
        ...originalServer,
        createMessage,
        elicitInput,
      };

      const samplingResult = await navigator.modelContext!.createMessage({
        messages: [{ role: 'user', content: { type: 'text', text: 'hi' } }],
      });
      const elicitationResult = await navigator.modelContext!.elicitInput({
        message: 'Need input',
        requestedSchema: {
          type: 'object',
          properties: { field: { type: 'string' } },
        },
      });

      expect(createMessage).toHaveBeenCalledTimes(1);
      expect(elicitInput).toHaveBeenCalledTimes(1);
      expect(samplingResult).toMatchObject({ content: { text: 'sampled' }, role: 'assistant' });
      expect(elicitationResult).toEqual({ action: 'accept', content: { field: 'value' } });

      (bridge.tabServer as { server: unknown }).server = originalServer;
    });
  });

  describe('ToolCall Events', () => {
    it('should dispatch toolcall events', async () => {
      const eventHandler = vi.fn();

      navigator.modelContext!.addEventListener('toolcall', eventHandler);

      navigator.modelContext!.provideContext({
        tools: [
          {
            name: 'event_tool',
            description: 'Tool with events',
            inputSchema: { value: z.string() },
            execute: async () => ({ content: [{ type: 'text', text: 'done' }] }),
          },
        ],
      });

      await navigator.modelContextTesting!.executeTool(
        'event_tool',
        JSON.stringify({ value: 'test' })
      );

      expect(eventHandler).toHaveBeenCalledOnce();
      expect(eventHandler.mock.calls[0][0].name).toBe('event_tool');
      expect(eventHandler.mock.calls[0][0].arguments).toEqual({ value: 'test' });

      navigator.modelContext!.removeEventListener('toolcall', eventHandler);
    });

    it('should allow intercepting tool calls via respondWith', async () => {
      const interceptor = (event: {
        preventDefault: () => void;
        respondWith: (r: unknown) => void;
      }) => {
        event.preventDefault();
        event.respondWith({
          content: [{ type: 'text', text: 'intercepted!' }],
        });
      };

      navigator.modelContext!.addEventListener('toolcall', interceptor);

      navigator.modelContext!.provideContext({
        tools: [
          {
            name: 'interceptable_tool',
            description: 'Can be intercepted',
            inputSchema: {},
            execute: async () => ({ content: [{ type: 'text', text: 'original' }] }),
          },
        ],
      });

      const result = await navigator.modelContextTesting!.executeTool(
        'interceptable_tool',
        JSON.stringify({})
      );

      expect(result).toBe('intercepted!');

      navigator.modelContext!.removeEventListener('toolcall', interceptor);
    });
  });

  describe('clearContext', () => {
    it('should clear all registered items', () => {
      navigator.modelContext!.provideContext({
        tools: [
          {
            name: 'tool1',
            description: 'Tool 1',
            inputSchema: {},
            execute: async () => ({ content: [{ type: 'text', text: '1' }] }),
          },
        ],
        resources: [
          {
            uri: 'app://data',
            name: 'Data',
            read: async () => ({ contents: [{ uri: 'app://data', text: 'data' }] }),
          },
        ],
        prompts: [
          {
            name: 'prompt1',
            description: 'Prompt 1',
            get: async () => ({
              messages: [{ role: 'user', content: { type: 'text', text: 'p' } }],
            }),
          },
        ],
      });

      navigator.modelContext!.registerTool({
        name: 'dynamic_tool',
        description: 'Dynamic',
        inputSchema: {},
        execute: async () => ({ content: [{ type: 'text', text: 'd' }] }),
      });

      expect(navigator.modelContextTesting!.listTools()).toHaveLength(2);
      expect(navigator.modelContext!.listResources()).toHaveLength(1);
      expect(navigator.modelContext!.listPrompts()).toHaveLength(1);

      navigator.modelContext!.clearContext();

      expect(navigator.modelContextTesting!.listTools()).toHaveLength(0);
      expect(navigator.modelContext!.listResources()).toHaveLength(0);
      expect(navigator.modelContext!.listPrompts()).toHaveLength(0);
    });
  });
});

describe('Validation Utilities', () => {
  it('should convert Zod schema to JSON Schema', async () => {
    const { zodToJsonSchema } = await import('./validation.js');

    const jsonSchema = zodToJsonSchema({
      name: z.string(),
      age: z.number(),
      email: z.email().optional(),
    });

    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema.properties).toBeDefined();
    expect(jsonSchema.properties?.name).toEqual({ type: 'string' });
    expect(jsonSchema.properties?.age).toEqual({ type: 'number' });
  });
});
