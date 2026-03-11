import { TabClientTransport, TabServerTransport } from '@mcp-b/transports';
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import { BrowserMcpServer, Client } from '@mcp-b/webmcp-ts-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupWebModelContext, initializeWebModelContext } from './global.js';

afterEach(() => {
  cleanupWebModelContext();
});

function getModelContext(): BrowserMcpServer {
  return navigator.modelContext as unknown as BrowserMcpServer;
}

function createNativeModelContextStub(): Navigator['modelContext'] {
  return {
    provideContext: () => {},
    registerTool: () => {},
    unregisterTool: () => {},
    clearContext: () => {},
    listTools: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  } as unknown as Navigator['modelContext'];
}

function setTestingShim(value: unknown): void {
  testingShimDescriptorStack.push(
    Object.getOwnPropertyDescriptor(navigator, 'modelContextTesting')
  );
  Object.defineProperty(navigator, 'modelContextTesting', {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

const testingShimDescriptorStack: Array<PropertyDescriptor | undefined> = [];

function clearTestingShim(): void {
  const previousDescriptor = testingShimDescriptorStack.pop();
  if (previousDescriptor) {
    Object.defineProperty(navigator, 'modelContextTesting', previousDescriptor);
    return;
  }

  delete (navigator as unknown as Record<string, unknown>).modelContextTesting;
}

describe('global adapter', () => {
  it('wraps native navigator.modelContext with BrowserMcpServer by default', () => {
    const nativeContext = createNativeModelContextStub();
    Object.defineProperty(navigator, 'modelContext', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: nativeContext,
    });

    initializeWebModelContext();
    // Server wraps native, adding registerPrompt/registerResource/etc.
    expect(navigator.modelContext).not.toBe(nativeContext);

    cleanupWebModelContext();
    expect(navigator.modelContext).toBe(nativeContext);
    delete (navigator as unknown as Record<string, unknown>).modelContext;
  });

  it('can patch native navigator.modelContext when requested', () => {
    const nativeContext = createNativeModelContextStub();
    Object.defineProperty(navigator, 'modelContext', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: nativeContext,
    });

    initializeWebModelContext({ nativeModelContextBehavior: 'patch' });
    // Server replaces the native context
    expect(navigator.modelContext).not.toBe(nativeContext);

    cleanupWebModelContext();
    expect(navigator.modelContext).toBe(nativeContext);
    delete (navigator as unknown as Record<string, unknown>).modelContext;
  });

  it('init replaces navigator.modelContext with BrowserMcpServer', () => {
    initializeWebModelContext();
    initializeWebModelContext(); // second call is no-op

    const modelContext = getModelContext();

    expect(typeof modelContext.provideContext).toBe('function');
    expect(typeof modelContext.registerTool).toBe('function');
    expect(typeof modelContext.unregisterTool).toBe('function');
    expect(typeof modelContext.clearContext).toBe('function');
    expect(typeof modelContext.listTools).toBe('function');
    expect(typeof modelContext.callTool).toBe('function');
  });

  it('registerTool mirrors to native/testing API', async () => {
    initializeWebModelContext();

    const modelContext = getModelContext();

    modelContext.registerTool({
      name: 'web_tool',
      description: 'Web style tool',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'web-ok' }] };
      },
    });

    // Testing shim reads from the native polyfill, which is mirrored
    const tools = navigator.modelContextTesting?.listTools() ?? [];
    expect(tools.some((tool) => tool.name === 'web_tool')).toBe(true);

    const serialized = await navigator.modelContextTesting?.executeTool('web_tool', '{}');
    expect(serialized).toContain('web-ok');
  });

  it('supports calling destructured registerTool', async () => {
    initializeWebModelContext();

    const modelContext = getModelContext();
    const registerTool = modelContext.registerTool;

    registerTool({
      name: 'destructured_register_tool',
      description: 'Registered via destructured method',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'destructured-ok' }] };
      },
    });

    const result = await modelContext.callTool({
      name: 'destructured_register_tool',
      arguments: {},
    });
    expect(result.content[0]?.type).toBe('text');
    expect((result.content[0] as { text?: string }).text).toContain('destructured-ok');
  });

  it('backfills tools registered before initializeWebModelContext', async () => {
    initializeWebMCPPolyfill();

    const nativeContext = navigator.modelContext as unknown as {
      registerTool: (tool: {
        name: string;
        description: string;
        inputSchema: { type: 'object'; properties: Record<string, never> };
        execute: () => Promise<{
          content: Array<{ type: 'text'; text: string }>;
        }>;
      }) => void;
    };

    nativeContext.registerTool({
      name: 'pre_registered_tool',
      description: 'registered before wrapper init',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'pre-registered-ok' }] };
      },
    });

    initializeWebModelContext();
    const modelContext = getModelContext();
    const names = modelContext.listTools().map((tool) => tool.name);
    expect(names).toContain('pre_registered_tool');

    const result = await modelContext.callTool({
      name: 'pre_registered_tool',
      arguments: {},
    });
    expect(result.content[0]?.type).toBe('text');
    expect((result.content[0] as { text?: string }).text).toContain('pre-registered-ok');
  });

  it('backfills tools from testing shim listTools() and tolerates invalid inputSchema JSON', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const executeTool = vi.fn(async () =>
      JSON.stringify({
        content: [{ type: 'text', text: 'shim-ok' }],
      })
    );

    setTestingShim({
      listTools: () => [
        {
          name: 'shim_list_tool',
          description: 'Tool sourced from listTools',
          inputSchema: 'not-json',
        },
      ],
      executeTool,
    });

    try {
      initializeWebModelContext();
      const modelContext = getModelContext();

      expect(modelContext.listTools().map((tool) => tool.name)).toContain('shim_list_tool');

      const result = await modelContext.callTool({
        name: 'shim_list_tool',
        arguments: { sample: true },
      });
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text?: string }).text).toContain('shim-ok');
      expect(executeTool).toHaveBeenCalledWith('shim_list_tool', JSON.stringify({ sample: true }));
      expect(warnSpy).toHaveBeenCalledWith(
        '[WebMCP] Failed to parse testing inputSchema JSON:',
        expect.any(Error)
      );
    } finally {
      warnSpy.mockRestore();
      cleanupWebModelContext();
      clearTestingShim();
    }
  });

  it('returns navigation interruption error when testing shim executeTool resolves null', async () => {
    setTestingShim({
      getRegisteredTools: () => [
        {
          name: 'shim_nav_tool',
          description: 'Navigation test',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
      executeTool: async () => null,
    });

    try {
      initializeWebModelContext();
      const modelContext = getModelContext();

      const result = await modelContext.callTool({
        name: 'shim_nav_tool',
        arguments: {},
      });

      expect(result.isError).toBe(true);
      expect((result.content[0] as { text?: string }).text).toContain('interrupted by navigation');
    } finally {
      cleanupWebModelContext();
      clearTestingShim();
    }
  });

  it('throws when testing shim returns invalid serialized JSON', async () => {
    setTestingShim({
      getRegisteredTools: () => [
        {
          name: 'shim_invalid_json_tool',
          description: 'Bad JSON serialization',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
      executeTool: async () => 'not-json',
    });

    try {
      initializeWebModelContext();
      const modelContext = getModelContext();

      await expect(
        modelContext.callTool({
          name: 'shim_invalid_json_tool',
          arguments: {},
        })
      ).rejects.toThrow('Failed to parse serialized tool response for shim_invalid_json_tool');
    } finally {
      cleanupWebModelContext();
      clearTestingShim();
    }
  });

  it('throws when testing shim returns serialized non-object payload', async () => {
    setTestingShim({
      getRegisteredTools: () => [
        {
          name: 'shim_invalid_shape_tool',
          description: 'Bad response shape',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
      executeTool: async () => JSON.stringify('not-an-object'),
    });

    try {
      initializeWebModelContext();
      const modelContext = getModelContext();

      await expect(
        modelContext.callTool({
          name: 'shim_invalid_shape_tool',
          arguments: {},
        })
      ).rejects.toThrow('Invalid serialized tool response for shim_invalid_shape_tool');
    } finally {
      cleanupWebModelContext();
      clearTestingShim();
    }
  });

  it('ignores testing shims without listTools/getRegisteredTools methods', () => {
    setTestingShim({
      executeTool: async () =>
        JSON.stringify({
          content: [{ type: 'text', text: 'unused' }],
        }),
    });

    try {
      initializeWebModelContext();
      const modelContext = getModelContext();
      expect(modelContext.listTools()).toEqual([]);
    } finally {
      cleanupWebModelContext();
      clearTestingShim();
    }
  });

  it('provideContext replaces all tools on both sides', () => {
    initializeWebModelContext();

    const modelContext = getModelContext();

    modelContext.registerTool({
      name: 'dynamic_tool',
      description: 'dynamic',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'dynamic' }] };
      },
    });

    modelContext.provideContext({
      tools: [
        {
          name: 'context_tool',
          description: 'context',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'context' }] };
          },
        },
      ],
    });

    const tools = navigator.modelContextTesting?.listTools() ?? [];
    expect(tools.some((tool) => tool.name === 'context_tool')).toBe(true);
    expect(tools.some((tool) => tool.name === 'dynamic_tool')).toBe(false);
  });

  it('tolerates native contexts that omit clearContext while still mirroring provided tools', () => {
    const registerTool = vi.fn();
    const nativeContext = {
      provideContext: () => {},
      registerTool,
      listTools: () => [],
      callTool: async () => ({ content: [{ type: 'text', text: 'native-ok' }] }),
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    } as unknown as Navigator['modelContext'];

    Object.defineProperty(navigator, 'modelContext', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: nativeContext,
    });

    initializeWebModelContext();

    const modelContext = getModelContext();
    expect(() =>
      modelContext.provideContext({
        tools: [
          {
            name: 'context_tool',
            description: 'context',
            inputSchema: { type: 'object', properties: {} },
            async execute() {
              return { content: [{ type: 'text', text: 'context' }] };
            },
          },
        ],
      })
    ).not.toThrow();

    expect(registerTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'context_tool',
      })
    );
  });

  it('unregisterTool and clearContext remove mirrored tools', () => {
    initializeWebModelContext();

    const modelContext = getModelContext();

    modelContext.registerTool({
      name: 'remove_me',
      description: 'remove me',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'remove' }] };
      },
    });

    modelContext.unregisterTool('remove_me');

    let tools = navigator.modelContextTesting?.listTools() ?? [];
    expect(tools.some((tool) => tool.name === 'remove_me')).toBe(false);

    modelContext.registerTool({
      name: 'clear_me',
      description: 'clear me',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'clear' }] };
      },
    });

    modelContext.clearContext();

    tools = navigator.modelContextTesting?.listTools() ?? [];
    expect(tools.some((tool) => tool.name === 'clear_me')).toBe(false);
  });

  it('suppresses same-task mirrored tool churn when the final testing-shim state is unchanged', async () => {
    initializeWebModelContext();

    const modelContext = getModelContext();
    modelContext.registerTool({
      name: 'stable_tool',
      description: 'stable',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'stable' }] };
      },
    });

    await Promise.resolve();
    await Promise.resolve();

    const snapshots: string[][] = [];
    navigator.modelContextTesting?.registerToolsChangedCallback(() => {
      snapshots.push((navigator.modelContextTesting?.listTools() ?? []).map((tool) => tool.name));
    });

    modelContext.unregisterTool('stable_tool');
    modelContext.registerTool({
      name: 'stable_tool',
      description: 'stable',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'stable' }] };
      },
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(snapshots).toEqual([]);
  });

  it('sets __isBrowserMcpServer marker on navigator.modelContext', () => {
    initializeWebModelContext();
    const ctx = navigator.modelContext as unknown as Record<string, unknown>;
    expect(ctx.__isBrowserMcpServer).toBe(true);
  });

  it('skips initialization when navigator.modelContext already has __isBrowserMcpServer marker', () => {
    // Simulate another bundle having already set up a BrowserMcpServer
    const fakeServer = {
      __isBrowserMcpServer: true,
      provideContext: () => {},
      registerTool: () => {},
      unregisterTool: () => {},
      clearContext: () => {},
    };
    Object.defineProperty(navigator, 'modelContext', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: fakeServer,
    });

    try {
      initializeWebModelContext();

      // Init should have been skipped — modelContext should still be the fake server
      expect(navigator.modelContext).toBe(fakeServer);
    } finally {
      cleanupWebModelContext();
      delete (navigator as unknown as Record<string, unknown>).modelContext;
      delete (navigator as unknown as Record<string, unknown>).modelContextTesting;
    }
  });

  it('cleanup restores and allows re-init', () => {
    initializeWebModelContext();
    expect(typeof getModelContext().listTools).toBe('function');

    cleanupWebModelContext();

    initializeWebModelContext();
    expect(typeof getModelContext().listTools).toBe('function');
  });

  it('listTools normalizes empty inputSchema {} to default object schema', () => {
    initializeWebModelContext();
    const modelContext = getModelContext();

    modelContext.registerTool({
      name: 'no_args_tool',
      description: 'Tool with no arguments',
      inputSchema: {},
      async execute() {
        return { content: [{ type: 'text', text: 'ok' }] };
      },
    });

    const tools = modelContext.listTools();
    const tool = tools.find((t) => t.name === 'no_args_tool');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema).toEqual({ type: 'object', properties: {} });
  });

  it('listTools does not prepend type:"object" to non-object outputSchema', () => {
    initializeWebModelContext();
    const modelContext = getModelContext();

    modelContext.registerTool({
      name: 'string_output_tool',
      description: 'Tool with string output schema',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: { type: 'string' },
      async execute() {
        return { content: [{ type: 'text', text: 'ok' }] };
      },
    });

    const tools = modelContext.listTools();
    const tool = tools.find((t) => t.name === 'string_output_tool');
    expect(tool).toBeDefined();
    // outputSchema should NOT get type:"object" — non-object types must be preserved
    expect(tool?.outputSchema).toMatchObject({ type: 'string' });
  });

  it('listTools preserves outputSchema without applying object-type normalization', async () => {
    initializeWebModelContext();
    const modelContext = getModelContext();

    modelContext.registerTool({
      name: 'output_no_type_tool',
      description: 'Tool with output schema missing root type',
      inputSchema: {},
      outputSchema: {
        properties: {
          value: { type: 'string' },
        },
        required: ['value'],
      },
      async execute() {
        return {
          content: [{ type: 'text', text: 'ok' }],
          structuredContent: { value: 'ok' },
        };
      },
    });

    const tools = modelContext.listTools();
    const tool = tools.find((t) => t.name === 'output_no_type_tool');
    expect(tool).toBeDefined();
    // outputSchema should NOT get type:"object" prepended — only inputSchema requires that
    expect(tool?.outputSchema).toEqual({
      properties: { value: { type: 'string' } },
      required: ['value'],
    });

    const result = await modelContext.callTool({ name: 'output_no_type_tool', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ value: 'ok' });
  });

  it('listTools normalizes inputSchema missing type to object schema', async () => {
    initializeWebModelContext();
    const modelContext = getModelContext();

    modelContext.registerTool({
      name: 'input_no_type_tool',
      description: 'Tool with input schema missing root type',
      inputSchema: {
        properties: {
          message: { type: 'string' },
        },
        required: ['message'],
      },
      async execute(args) {
        return {
          content: [{ type: 'text', text: `echo:${String(args.message ?? '')}` }],
        };
      },
    });

    const tools = modelContext.listTools();
    const tool = tools.find((t) => t.name === 'input_no_type_tool');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema).toMatchObject({
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    });

    const result = await modelContext.callTool({
      name: 'input_no_type_tool',
      arguments: { message: 'hi' },
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]).toMatchObject({ type: 'text', text: 'echo:hi' });
  });
});

describe('cross-bundle duplicate prevention (e2e)', () => {
  const delay = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));
  const uniqueChannel = () => `e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  it('duplicate TabServerTransports cause double message delivery (root cause of #136)', async () => {
    // This test proves the underlying transport bug: two server transports on the
    // same channel each register their own window.addEventListener('message', ...),
    // so a single client message is received and processed by BOTH.
    // This is exactly what happened when two bundles both called initializeWebModelContext().
    const channelId = uniqueChannel();

    const server1 = new TabServerTransport({ allowedOrigins: ['*'], channelId });
    const server2 = new TabServerTransport({ allowedOrigins: ['*'], channelId });

    let totalMessageCount = 0;

    server1.onmessage = () => {
      totalMessageCount++;
    };
    server2.onmessage = () => {
      totalMessageCount++;
    };

    await server1.start();
    await server2.start();

    const client = new TabClientTransport({
      targetOrigin: '*',
      channelId,
      requestTimeout: 500,
    });
    await client.start();
    await client.serverReadyPromise;

    await client.send({ jsonrpc: '2.0', method: 'tools/call', id: 1, params: { name: 'test' } });
    await delay();

    // BUG: 1 client message → 2 server deliveries. This caused double tool invocations.
    expect(totalMessageCount).toBe(2);

    await server1.close();
    await server2.close();
    await client.close().catch(() => {});
  });

  it('marker guard prevents duplicate transport, tool invoked exactly once', async () => {
    // Simulate the real cross-bundle scenario:
    //   Bundle A: creates BrowserMcpServer + TabServerTransport, sets marker on modelContext
    //   Bundle B: calls initializeWebModelContext() with its own runtime=null,
    //             sees marker on navigator.modelContext → skips
    //
    // We simulate this by manually setting up a BrowserMcpServer with a transport
    // (acting as Bundle A), then calling initializeWebModelContext() (acting as Bundle B).
    // Since no prior initializeWebModelContext() call was made in this test,
    // the module-level `runtime` is null — the marker is the ONLY guard.
    const channelId = uniqueChannel();

    // --- Bundle A: manually create server + transport ---
    const serverTransport = new TabServerTransport({ allowedOrigins: ['*'], channelId });
    const server = new BrowserMcpServer({ name: 'bundle-a', version: '1.0.0' });

    let invocationCount = 0;
    server.registerTool({
      name: 'e2e_guard_tool',
      description: 'Verifies single invocation',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        invocationCount++;
        return { content: [{ type: 'text', text: `count:${invocationCount}` }] };
      },
    });

    await server.connect(serverTransport);

    // Place server on navigator.modelContext (as initializeWebModelContext would)
    Object.defineProperty(navigator, 'modelContext', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: server,
    });

    // Verify marker is present (BrowserMcpServer sets it automatically)
    const ctx = navigator.modelContext as unknown as Record<string, unknown>;
    expect(ctx.__isBrowserMcpServer).toBe(true);

    // --- Bundle B: calls initializeWebModelContext() ---
    // Module-level `runtime` is null (no prior init in this test).
    // The ONLY thing preventing a second server+transport is the marker on modelContext.
    initializeWebModelContext({
      transport: { tabServer: { allowedOrigins: ['*'], channelId }, iframeServer: false },
    });

    // modelContext should still be Bundle A's server — not replaced
    expect(navigator.modelContext).toBe(server);

    // --- Verify: full MCP roundtrip invokes tool exactly once ---
    const clientTransport = new TabClientTransport({
      targetOrigin: '*',
      channelId,
      requestTimeout: 5000,
    });
    const mcpClient = new Client({ name: 'test-client', version: '1.0.0' });
    await mcpClient.connect(clientTransport);

    const result = await mcpClient.callTool({ name: 'e2e_guard_tool', arguments: {} });

    expect(invocationCount).toBe(1);
    expect(result.content).toEqual([{ type: 'text', text: 'count:1' }]);

    // Cleanup (manual since we didn't use initializeWebModelContext)
    await mcpClient.close();
    await server.close();
    delete (navigator as unknown as Record<string, unknown>).modelContext;
    delete (navigator as unknown as Record<string, unknown>).modelContextTesting;
  });
});
