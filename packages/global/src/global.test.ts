import { TabClientTransport, TabServerTransport } from '@mcp-b/transports';
import { installWebMCP } from '@mcp-b/webmcp-polyfill';
import { BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';
import type { ModelContext, RegisteredTool, WebMcpToolInput } from '@mcp-b/webmcp-ts-sdk';
import { Client } from '@modelcontextprotocol/client';
import { isCallToolResult, type CallToolResult } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupWebModelContext, initializeWebModelContext } from './global.js';

const documentModelContextDescriptorStack: Array<PropertyDescriptor | undefined> = [];

function setDocumentModelContext(value: ModelContext | undefined): void {
  documentModelContextDescriptorStack.push(
    Object.getOwnPropertyDescriptor(document, 'modelContext')
  );
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    enumerable: true,
    writable: false,
    value,
  });
}

function restoreDocumentModelContext(): void {
  const descriptor = documentModelContextDescriptorStack.pop();
  if (descriptor) {
    Object.defineProperty(document, 'modelContext', descriptor);
    return;
  }
  Reflect.deleteProperty(document, 'modelContext');
}

afterEach(() => {
  cleanupWebModelContext();
  while (documentModelContextDescriptorStack.length > 0) {
    restoreDocumentModelContext();
  }
});

function getModelContext(): BrowserMcpServer {
  const context = document.modelContext;
  if (!(context instanceof BrowserMcpServer)) throw new Error('Global wrapper is unavailable');
  return context;
}

async function executeRegisteredTool(
  modelContext: BrowserMcpServer,
  name: string,
  args: WebMcpToolInput = {}
): Promise<string> {
  const tool = (await modelContext.getTools()).find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }
  return modelContext.executeTool(tool, args);
}

function parseSerializedResult(serialized: string): CallToolResult {
  const result: unknown = JSON.parse(serialized);
  if (!isCallToolResult(result)) throw new Error('Expected an MCP tool result');
  return result;
}

function createNativeModelContextStub(): ModelContext {
  const nativeContext: ModelContext = {
    executeTool: async () => {
      throw new Error('Unexpected native execution');
    },
    ontoolchange: null,
    getTools: async () => [],
    registerTool: async () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };

  return nativeContext;
}

describe('global adapter', () => {
  it('wraps native document.modelContext with BrowserMcpServer by default', () => {
    const nativeContext = createNativeModelContextStub();
    setDocumentModelContext(nativeContext);

    expect(initializeWebModelContext()).toBeUndefined();
    const server = getModelContext();
    expect(server).toBeInstanceOf(BrowserMcpServer);
    expect(navigator).not.toHaveProperty('modelContext');
    expect(navigator).not.toHaveProperty('modelContextTesting');
    expect(initializeWebModelContext()).toBeUndefined();
    expect(document.modelContext).toBe(server);

    cleanupWebModelContext();
    expect(document.modelContext).toBe(nativeContext);

    expect(initializeWebModelContext()).toBeUndefined();
    expect(document.modelContext).not.toBe(nativeContext);
    expect(getModelContext().listTools).toBeTypeOf('function');
  });

  it('adds MCP-B extensions around an upstream context installed beforehand', () => {
    installWebMCP();
    const upstreamContext = document.modelContext;
    const previousRespondWith = Object.getOwnPropertyDescriptor(
      SubmitEvent.prototype,
      'respondWith'
    );

    initializeWebModelContext();

    const server = getModelContext();
    expect(server).toBeInstanceOf(BrowserMcpServer);
    expect(document.modelContext).toBe(server);
    expect(SubmitEvent.prototype.respondWith).toBeTypeOf('function');

    cleanupWebModelContext();
    expect(document.modelContext).toBe(upstreamContext);
    expect(Object.getOwnPropertyDescriptor(SubmitEvent.prototype, 'respondWith')).toEqual(
      previousRespondWith
    );
  });

  it('leaves native declarative form support in place', async () => {
    const nativeContext = createNativeModelContextStub();
    if (!nativeContext) throw new Error('Native modelContext stub is unavailable');
    const registerTool = vi.spyOn(nativeContext, 'registerTool');
    const previousAgentInvoked = Object.getOwnPropertyDescriptor(
      SubmitEvent.prototype,
      'agentInvoked'
    );
    const previousRespondWith = Object.getOwnPropertyDescriptor(
      SubmitEvent.prototype,
      'respondWith'
    );
    Object.defineProperties(SubmitEvent.prototype, {
      agentInvoked: { configurable: true, get: () => false },
      respondWith: { configurable: true, writable: true, value: () => {} },
    });
    setDocumentModelContext(nativeContext);
    const form = document.createElement('form');
    form.setAttribute('toolname', 'native_declarative_tool');
    form.setAttribute('tooldescription', 'Provided by the browser');
    document.body.append(form);

    try {
      initializeWebModelContext();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(registerTool).not.toHaveBeenCalled();
    } finally {
      form.remove();
      cleanupWebModelContext();
      if (previousAgentInvoked) {
        Object.defineProperty(SubmitEvent.prototype, 'agentInvoked', previousAgentInvoked);
      } else {
        Reflect.deleteProperty(SubmitEvent.prototype, 'agentInvoked');
      }
      if (previousRespondWith) {
        Object.defineProperty(SubmitEvent.prototype, 'respondWith', previousRespondWith);
      } else {
        Reflect.deleteProperty(SubmitEvent.prototype, 'respondWith');
      }
    }
  });

  it('leaves a non-configurable native modelContext untouched', () => {
    const nativeContext = createNativeModelContextStub();
    setDocumentModelContext(nativeContext);
    const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
    const descriptorSpy = vi
      .spyOn(Object, 'getOwnPropertyDescriptor')
      .mockImplementation((target, key) => {
        const descriptor = getOwnPropertyDescriptor(target, key);
        return target === document && key === 'modelContext' && descriptor
          ? { ...descriptor, configurable: false }
          : descriptor;
      });

    try {
      expect(initializeWebModelContext()).toBeUndefined();
      expect(document.modelContext).toBe(nativeContext);
    } finally {
      descriptorSpy.mockRestore();
    }
  });

  it('leaves the native surface untouched when transport selection fails', () => {
    const nativeContext = createNativeModelContextStub();
    setDocumentModelContext(nativeContext);

    expect(() =>
      initializeWebModelContext({
        transport: { iframeServer: false, tabServer: false },
      })
    ).toThrow('tabServer transport is disabled');
    expect(document.modelContext).toBe(nativeContext);
  });

  it('restores the native surface and permits retry when transport connection fails', async () => {
    const nativeContext = createNativeModelContextStub();
    const connectionError = new Error('transport connection failed');
    const connectSpy = vi
      .spyOn(BrowserMcpServer.prototype, 'connect')
      .mockRejectedValueOnce(connectionError)
      .mockResolvedValueOnce(undefined);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setDocumentModelContext(nativeContext);

    try {
      initializeWebModelContext();

      await vi.waitFor(() => {
        expect(document.modelContext).toBe(nativeContext);
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        '[WebModelContext] Failed to connect MCP transport:',
        connectionError
      );

      initializeWebModelContext();

      await vi.waitFor(() => {
        expect(connectSpy).toHaveBeenCalledTimes(2);
        expect(document.modelContext).not.toBe(nativeContext);
      });
    } finally {
      connectSpy.mockRestore();
      consoleSpy.mockRestore();
    }
  });

  it('waits for initial native tool synchronization before connecting the transport', async () => {
    let resolveTools!: (tools: []) => void;
    const pendingTools = new Promise<[]>((resolve) => {
      resolveTools = resolve;
    });
    const nativeContext = Object.assign(new EventTarget(), {
      ontoolchange: null,
      registerTool: async () => {},
      getTools: vi.fn(() => pendingTools),
      executeTool: vi.fn(async () => 'null'),
    });
    const connectSpy = vi.spyOn(BrowserMcpServer.prototype, 'connect').mockResolvedValue(undefined);
    setDocumentModelContext(nativeContext);

    try {
      initializeWebModelContext();

      await vi.waitFor(() => {
        expect(nativeContext.getTools).toHaveBeenCalledOnce();
      });
      expect(connectSpy).not.toHaveBeenCalled();

      resolveTools([]);

      await vi.waitFor(() => {
        expect(connectSpy).toHaveBeenCalledOnce();
      });
    } finally {
      resolveTools([]);
      connectSpy.mockRestore();
    }
  });

  it('connects after an initial native tool synchronization failure', async () => {
    const synchronizationError = new Error('native discovery failed');
    const nativeContext = Object.assign(new EventTarget(), {
      ontoolchange: null,
      registerTool: async () => {},
      getTools: vi.fn().mockRejectedValue(synchronizationError),
      executeTool: vi.fn(async () => 'null'),
    });
    const connectSpy = vi.spyOn(BrowserMcpServer.prototype, 'connect').mockResolvedValue(undefined);
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setDocumentModelContext(nativeContext);

    try {
      initializeWebModelContext();

      await vi.waitFor(() => {
        expect(connectSpy).toHaveBeenCalledOnce();
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        '[WebModelContext] Native WebMCP tool synchronization failed:',
        synchronizationError
      );
    } finally {
      connectSpy.mockRestore();
      consoleSpy.mockRestore();
    }
  });

  it('getTools returns the native producer tool-list shape', async () => {
    initializeWebModelContext();

    const modelContext = getModelContext();
    await modelContext.registerTool({
      name: 'native_shape_tool',
      title: 'Native shape tool',
      description: 'Native shape tool',
      inputSchema: {
        type: 'object',
        properties: { value: { type: 'number' } },
        required: ['value'],
      },
      async execute({ value }) {
        return { value };
      },
    });

    const tools = await modelContext.getTools();
    expect(tools).toEqual([
      expect.objectContaining({
        name: 'native_shape_tool',
        title: 'Native shape tool',
        description: 'Native shape tool',
        // An object since webmcp#241.
        inputSchema: {
          type: 'object',
          properties: { value: { type: 'number' } },
          required: ['value'],
        },
        origin: expect.any(String),
        window: expect.any(Object),
      }),
    ]);
    await expect(modelContext.executeTool(tools[0]!, { value: 7 })).resolves.toBe('{"value":7}');
  });

  it('uses upstream object execution and preserves cancellation and annotations', async () => {
    initializeWebModelContext();
    const modelContext = getModelContext();
    let callbackSignal: AbortSignal | undefined;
    const started = Promise.withResolvers<void>();
    await modelContext.registerTool({
      name: 'upstream_execution',
      description: 'Runs through the official polyfill',
      annotations: { consequentialHint: true, debugging: true },
      execute(_input, options) {
        callbackSignal = options?.signal;
        started.resolve();
        return new Promise(() => {});
      },
    });
    const tool = (await modelContext.getTools()).find(({ name }) => name === 'upstream_execution')!;
    expect(tool.annotations).toMatchObject({ consequentialHint: true, debugging: true });
    const controller = new AbortController();
    const result = modelContext.executeTool(tool, {}, { signal: controller.signal });
    const rejection = expect(result).rejects.toBe('cancelled');
    await started.promise;
    expect(callbackSignal).toBeInstanceOf(AbortSignal);
    controller.abort('cancelled');
    await rejection;
    await vi.waitFor(() => expect(callbackSignal?.aborted).toBe(true));
  });

  it('forwards each upstream toolchange during concurrent registration and cleanup', async () => {
    installWebMCP();
    const upstream = document.modelContext;
    if (!upstream) throw new Error('Upstream context is unavailable');
    initializeWebModelContext();

    const modelContext = getModelContext();
    let listenerCount = 0;
    let handlerCount = 0;
    let handlerTarget: EventTarget | null = null;
    let handlerThis: ModelContext | null = null;
    modelContext.addEventListener('toolchange', () => {
      listenerCount += 1;
    });
    modelContext.ontoolchange = function (event) {
      handlerCount += 1;
      handlerTarget = event.target;
      // oxlint-disable-next-line typescript/no-this-alias -- verifies EventHandler `this` binding.
      handlerThis = this;
    };

    const observations = new AbortController();
    let upstreamCount = 0;
    upstream.addEventListener(
      'toolchange',
      () => {
        upstreamCount += 1;
      },
      { signal: observations.signal }
    );
    const controller = new AbortController();
    try {
      await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          modelContext.registerTool(
            {
              name: `wrapper_event_tool_${index}`,
              description: 'Wrapper event tool',
              execute: () => 'ok',
            },
            { signal: controller.signal }
          )
        )
      );
      await vi.waitFor(() => {
        expect(upstreamCount).toBeGreaterThanOrEqual(10);
        expect(listenerCount).toBe(upstreamCount);
        expect(handlerCount).toBe(upstreamCount);
      });

      const registrationEvents = upstreamCount;
      controller.abort();
      await vi.waitFor(() => {
        expect(upstreamCount).toBeGreaterThanOrEqual(registrationEvents + 10);
        expect(listenerCount).toBe(upstreamCount);
        expect(handlerCount).toBe(upstreamCount);
      });
      expect(handlerTarget).toBe(modelContext);
      expect(handlerThis).toBe(modelContext);
    } finally {
      observations.abort();
      controller.abort();
    }
  });

  it('supports calling destructured registerTool', async () => {
    initializeWebModelContext();

    const modelContext = getModelContext();
    const registerTool = modelContext.registerTool;

    await registerTool({
      name: 'destructured_register_tool',
      description: 'Registered via destructured method',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'destructured-ok' }] };
      },
    });

    const result = await executeRegisteredTool(modelContext, 'destructured_register_tool');
    expect(result).toContain('destructured-ok');
  });

  it('backfills tools registered before initializeWebModelContext', async () => {
    installWebMCP();

    const nativeContext = document.modelContext;
    if (!nativeContext) throw new Error('Polyfill context is unavailable');
    const controller = new AbortController();

    await nativeContext.registerTool(
      {
        name: 'pre_registered_tool',
        description: 'registered before wrapper init',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'pre-registered-ok' }] };
        },
      },
      { signal: controller.signal }
    );

    initializeWebModelContext();
    const modelContext = getModelContext();
    await vi.waitFor(() => {
      expect(modelContext.listTools().map((tool) => tool.name)).toContain('pre_registered_tool');
    });

    const result = await executeRegisteredTool(modelContext, 'pre_registered_tool');
    expect(result).toContain('pre-registered-ok');

    controller.abort();
    await vi.waitFor(() => {
      expect(modelContext.listTools().map((tool) => tool.name)).not.toContain(
        'pre_registered_tool'
      );
    });
  });

  it('reconciles native tools after toolchange events', async () => {
    const nativeTools: RegisteredTool[] = [];
    const nativeContext = Object.assign(new EventTarget(), {
      ontoolchange: null,
      registerTool: async () => {},
      getTools: async () => nativeTools,
      executeTool: async () =>
        JSON.stringify({ content: [{ type: 'text', text: 'native-event-ok' }] }),
    });
    setDocumentModelContext(nativeContext);
    initializeWebModelContext();

    nativeTools.push({
      title: '',
      name: 'native_event_tool',
      description: 'Added after initialization',
      origin: window.location.origin,
      window,
    });
    nativeContext.dispatchEvent(new Event('toolchange'));
    await vi.waitFor(() => {
      expect(
        getModelContext()
          .listTools()
          .map((tool) => tool.name)
      ).toContain('native_event_tool');
    });

    nativeTools.length = 0;
    nativeContext.dispatchEvent(new Event('toolchange'));
    await vi.waitFor(() => {
      expect(
        getModelContext()
          .listTools()
          .map((tool) => tool.name)
      ).not.toContain('native_event_tool');
    });
  });

  it('listTools normalizes empty inputSchema {} to default object schema', async () => {
    initializeWebModelContext();
    const modelContext = getModelContext();

    await modelContext.registerTool({
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

  it('listTools preserves outputSchema without applying object-type normalization', async () => {
    initializeWebModelContext();
    const modelContext = getModelContext();

    await modelContext.registerTool({
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

    const result = parseSerializedResult(
      await executeRegisteredTool(modelContext, 'output_no_type_tool')
    );
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ value: 'ok' });
  });

  it('listTools normalizes inputSchema missing type to object schema', async () => {
    initializeWebModelContext();
    const modelContext = getModelContext();

    await modelContext.registerTool({
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

    const result = parseSerializedResult(
      await executeRegisteredTool(modelContext, 'input_no_type_tool', { message: 'hi' })
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0]).toMatchObject({ type: 'text', text: 'echo:hi' });
  });
});

describe('cross-bundle duplicate prevention (e2e)', () => {
  const uniqueChannel = () => `e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  it('marker guard prevents duplicate transport, tool invoked exactly once', async () => {
    // Simulate the real cross-bundle scenario:
    //   Bundle A: creates BrowserMcpServer + TabServerTransport, sets marker on modelContext
    //   Bundle B: calls initializeWebModelContext() with its own runtime=null,
    //             sees marker on document.modelContext → skips
    //
    // We simulate this by manually setting up a BrowserMcpServer with a transport
    // (acting as Bundle A), then calling initializeWebModelContext() (acting as Bundle B).
    // Since no prior initializeWebModelContext() call was made in this test,
    // the module-level `runtime` is null — the marker is the ONLY guard.
    const channelId = uniqueChannel();

    // --- Bundle A: manually create server + transport ---
    installWebMCP();
    const serverTransport = new TabServerTransport({ allowedOrigins: ['*'], channelId });
    const server = new BrowserMcpServer(
      { name: 'bundle-a', version: '1.0.0' },
      { native: document.modelContext! }
    );

    let invocationCount = 0;
    await server.registerTool({
      name: 'e2e_guard_tool',
      description: 'Verifies single invocation',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        invocationCount++;
        return { content: [{ type: 'text', text: `count:${invocationCount}` }] };
      },
    });
    await server.connect(serverTransport);

    // Place server on document.modelContext (as initializeWebModelContext would)
    setDocumentModelContext(server);

    // --- Bundle B: calls initializeWebModelContext() ---
    // Module-level `runtime` is null (no prior init in this test).
    // The ONLY thing preventing a second server+transport is the marker on modelContext.
    expect(
      initializeWebModelContext({
        transport: { tabServer: { allowedOrigins: ['*'], channelId }, iframeServer: false },
      })
    ).toBeUndefined();

    // modelContext should still be Bundle A's server — not replaced
    expect(document.modelContext).toBe(server);

    // --- Verify: full MCP roundtrip invokes tool exactly once ---
    const clientTransport = new TabClientTransport({
      targetOrigin: '*',
      channelId,
    });
    const mcpClient = new Client(
      { name: 'test-client', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } }
    );
    await mcpClient.connect(clientTransport);

    const result = await mcpClient.callTool({ name: 'e2e_guard_tool', arguments: {} });

    expect(invocationCount).toBe(1);
    expect(result.content).toEqual([{ type: 'text', text: 'count:1' }]);

    // Cleanup (manual since we didn't use initializeWebModelContext)
    await mcpClient.close();
    await server.close();
  });
});
