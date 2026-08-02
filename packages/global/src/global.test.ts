import { TabClientTransport, TabServerTransport } from '@mcp-b/transports';
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import { normalizeInputSchema } from '@mcp-b/webmcp-polyfill/schema';
import { BrowserMcpServer, type ResourceDescriptor } from '@mcp-b/webmcp-ts-sdk';
import type { ModelContext } from '@mcp-b/webmcp-types';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { inputRequired } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupWebModelContext, initializeWebModelContext } from './global.js';

const documentModelContextDescriptorStack: Array<PropertyDescriptor | undefined> = [];

function setDocumentModelContext(value: unknown): void {
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
  delete (document as unknown as Record<string, unknown>).modelContext;
}

afterEach(() => {
  cleanupWebModelContext();
  while (documentModelContextDescriptorStack.length > 0) {
    restoreDocumentModelContext();
  }
});

function getModelContext(): BrowserMcpServer {
  return document.modelContext as unknown as BrowserMcpServer;
}

async function executeRegisteredTool(
  modelContext: BrowserMcpServer,
  name: string,
  args: unknown = {}
): Promise<string | null> {
  const tool = (await modelContext.getTools()).find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }
  return modelContext.executeTool(tool, JSON.stringify(args));
}

function parseSerializedResult(serialized: string | null): unknown {
  if (serialized === null) return null;
  try {
    return JSON.parse(serialized);
  } catch {
    return serialized;
  }
}

function createNativeModelContextStub(): Navigator['modelContext'] {
  const nativeContext: Record<string, unknown> = {
    registerTool: () => {},
    listTools: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };

  return nativeContext as unknown as Navigator['modelContext'];
}

describe('global adapter', () => {
  it('wraps native document.modelContext with BrowserMcpServer by default', () => {
    const nativeContext = createNativeModelContextStub();
    setDocumentModelContext(nativeContext);

    expect(initializeWebModelContext()).toBeUndefined();
    const server = getModelContext();
    expect(server).toBeInstanceOf(BrowserMcpServer);
    expect(initializeWebModelContext()).toBeUndefined();
    expect(document.modelContext).toBe(server);

    cleanupWebModelContext();
    expect(document.modelContext).toBe(nativeContext);

    expect(initializeWebModelContext()).toBeUndefined();
    expect(document.modelContext).not.toBe(nativeContext);
    expect(typeof getModelContext().listTools).toBe('function');
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
      registerTool: () => {},
      getTools: vi.fn(() => pendingTools),
      executeTool: vi.fn(async () => null),
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
      registerTool: () => {},
      getTools: vi.fn().mockRejectedValue(synchronizationError),
      executeTool: vi.fn(async () => null),
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

  it('init replaces navigator.modelContext with BrowserMcpServer', () => {
    initializeWebModelContext();
    initializeWebModelContext(); // second call is no-op

    const modelContext = getModelContext();

    expect(typeof (modelContext as unknown as { provideContext?: unknown }).provideContext).toBe(
      'undefined'
    );
    expect(typeof modelContext.registerTool).toBe('function');
    expect(typeof (modelContext as unknown as { unregisterTool?: unknown }).unregisterTool).toBe(
      'undefined'
    );
    expect(typeof (modelContext as unknown as { clearContext?: unknown }).clearContext).toBe(
      'undefined'
    );
    expect(typeof modelContext.listTools).toBe('function');
    expect(typeof modelContext.getTools).toBe('function');
    expect(typeof modelContext.executeTool).toBe('function');
    expect(typeof modelContext.ontoolchange).toBe('object');
    expect(modelContext).toBeInstanceOf(EventTarget);
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
        inputSchema:
          '{"type":"object","properties":{"value":{"type":"number"}},"required":["value"]}',
        origin: expect.any(String),
        window: expect.any(Object),
      }),
    ]);
    await expect(modelContext.executeTool(tools[0]!, '{"value":7}')).resolves.toBe('{"value":7}');
  });

  it('sorts local getTools fallback and supplies the WebMCP title default', async () => {
    const server = new BrowserMcpServer({ name: 'local-get-tools-test', version: '1.0.0' });
    for (const name of ['z_tool', 'a_tool']) {
      await server.registerTool({
        name,
        description: name,
        async execute() {},
      });
    }

    expect((await server.getTools()).map(({ name, title }) => ({ name, title }))).toEqual([
      { name: 'a_tool', title: '' },
      { name: 'z_tool', title: '' },
    ]);
    await server.close();
  });

  it('exposes URI templates through the MCP resource template contract', async () => {
    const server = new BrowserMcpServer({ name: 'resource-template-test', version: '1.0.0' });
    const client = new Client(
      { name: 'resource-template-client', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } }
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    let templateParams: Record<string, string | string[]> | undefined;

    server.registerResource({
      uri: 'config://settings',
      name: 'Settings',
      async read(uri) {
        return { contents: [{ uri: uri.href, text: 'static' }] };
      },
    });
    const templateDescriptor = {
      uri: 'user://{userId}/profile',
      name: 'User profile',
      async read(uri, params) {
        templateParams = params;
        return { contents: [{ uri: uri.href, text: String(params?.userId) }] };
      },
    } satisfies ResourceDescriptor;
    const templateRegistration = server.registerResource(templateDescriptor);
    templateDescriptor.uri = 'mutated://resource';
    templateDescriptor.name = 'Mutated resource';
    templateDescriptor.read = async (uri) => ({
      contents: [{ uri: uri.href, text: 'mutated' }],
    });
    await server.connect(serverTransport);

    try {
      await client.connect(clientTransport);

      await expect(client.listResources()).resolves.toMatchObject({
        resources: [{ uri: 'config://settings', name: 'Settings' }],
      });
      await expect(client.listResourceTemplates()).resolves.toMatchObject({
        resourceTemplates: [{ uriTemplate: 'user://{userId}/profile', name: 'User profile' }],
      });
      await expect(client.readResource({ uri: 'user://42/profile' })).resolves.toMatchObject({
        contents: [{ uri: 'user://42/profile', text: '42' }],
      });
      expect(templateParams).toEqual({ userId: '42' });
      await expect(client.readResource({ uri: 'config://settings' })).resolves.toMatchObject({
        contents: [{ uri: 'config://settings', text: 'static' }],
      });
      templateRegistration.unregister();
      await expect(client.listResourceTemplates()).resolves.toMatchObject({
        resourceTemplates: [],
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('delegates Standard Schema validation and input-required flows to the MCP server', async () => {
    const standardSchema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate(value: unknown) {
          const count = (value as { count?: unknown }).count;
          return count === 3
            ? { value: { count: 4 } }
            : { issues: [{ message: 'count must be 3' }] };
        },
        jsonSchema: {
          input: () => ({
            oneOf: [
              {
                type: 'object',
                properties: { count: { type: 'number' } },
                required: ['count'],
              },
            ],
          }),
          output: () => ({ type: 'object', properties: {} }),
        },
      },
    };
    const server = new BrowserMcpServer({ name: 'input-required-test', version: '1.0.0' });
    const client = new Client(
      { name: 'input-required-client', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } }
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    let validatedCount: unknown;

    try {
      await server.registerTool({
        name: 'webmcp_input_required',
        description: 'Attempts an unsupported multi-round WebMCP flow',
        inputSchema: normalizeInputSchema(standardSchema).inputSchema,
        async execute({ count }) {
          validatedCount = count;
          return inputRequired({ requestState: 'opaque-state' });
        },
      });
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: 'webmcp_input_required',
        arguments: { count: 3 },
      });
      expect(validatedCount).toBe(4);
      expect(result).toMatchObject({
        isError: true,
      });

      const [registeredTool] = await server.getTools();
      await expect(server.executeTool(registeredTool!, '{"count":3}')).resolves.toContain(
        'input_required'
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('mirrors Standard Schema inputs to native as plain JSON Schema', async () => {
    const nativeRegisterTool = vi.fn();
    const nativeContext = Object.assign(new EventTarget(), {
      registerTool: nativeRegisterTool,
      async getTools() {
        return [];
      },
    });
    const server = new BrowserMcpServer(
      { name: 'standard-schema-native-mirror-test', version: '1.0.0' },
      { native: nativeContext }
    );
    const inputSchema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate(value: unknown) {
          return { value };
        },
        jsonSchema: {
          input: () => ({
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          }),
          output: () => ({ type: 'object', properties: {} }),
        },
      },
    };

    try {
      await server.registerTool({
        name: 'standard_schema_native_mirror',
        description: 'Mirrors converted schema metadata',
        inputSchema,
        async execute() {
          return 'ok';
        },
      });

      expect(nativeRegisterTool).toHaveBeenCalledWith(
        expect.objectContaining({
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        }),
        expect.any(Object)
      );
      expect(nativeRegisterTool.mock.calls[0]?.[0]).not.toHaveProperty('inputSchema.~standard');
    } finally {
      await server.close();
    }
  });

  it('fires producer toolchange events and ontoolchange on wrapper mutations', async () => {
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

    const controller = new AbortController();
    await modelContext.registerTool(
      {
        name: 'wrapper_event_tool',
        description: 'Wrapper event tool',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      },
      { signal: controller.signal }
    );

    controller.abort();
    await vi.waitFor(() => {
      expect(listenerCount).toBe(2);
      expect(handlerCount).toBe(2);
    });
    expect(handlerTarget).toBe(modelContext);
    expect(handlerThis).toBe(modelContext);
  });

  it('preserves ontoolchange ordering across replacement and removal', async () => {
    const server = new BrowserMcpServer({ name: 'event-order-test', version: '1.0.0' });
    const order: string[] = [];
    server.ontoolchange = () => order.push('handler');
    server.addEventListener('toolchange', () => order.push('listener'));
    server.ontoolchange = () => order.push('replacement');

    server.dispatchEvent(new Event('toolchange'));
    expect(order).toEqual(['replacement', 'listener']);

    order.length = 0;
    server.ontoolchange = null;
    server.ontoolchange = () => order.push('re-added');
    server.dispatchEvent(new Event('toolchange'));
    expect(order).toEqual(['listener', 're-added']);
    server.ontoolchange = {} as never;
    expect(server.ontoolchange).toBeNull();
    await server.close();
  });

  it('rejects a local registration when close wins its notification race', async () => {
    const server = new BrowserMcpServer({ name: 'close-race-test', version: '1.0.0' });
    const listener = vi.fn();
    server.addEventListener('toolchange', listener);
    const registration = server.registerTool({
      name: 'close_race_tool',
      description: 'Closes while registration is pending',
      async execute() {},
    });
    const rejection = expect(registration).rejects.toMatchObject({ name: 'InvalidStateError' });

    await Promise.resolve();
    await server.close();

    await rejection;
    expect(listener).not.toHaveBeenCalled();
    expect(server.listTools()).toEqual([]);
  });

  it('cleans up a native mirror when native registration closes the wrapper', async () => {
    const nativeTools = new Set<string>();
    let server: BrowserMcpServer;
    let closing!: Promise<void>;
    const nativeContext = Object.assign(new EventTarget(), {
      registerTool(tool: { name: string }, options?: { signal?: AbortSignal }) {
        nativeTools.add(tool.name);
        options?.signal?.addEventListener('abort', () => nativeTools.delete(tool.name), {
          once: true,
        });
        closing = server.close();
      },
      async getTools() {
        return [];
      },
    });
    server = new BrowserMcpServer(
      { name: 'native-close-race-test', version: '1.0.0' },
      { native: nativeContext }
    );

    await expect(
      server.registerTool({
        name: 'native_close_race_tool',
        description: 'Native registration closes the wrapper',
        async execute() {},
      })
    ).rejects.toMatchObject({ name: 'InvalidStateError' });
    await closing;
    expect(nativeTools).toEqual(new Set());
  });

  it('detaches registration cleanup before restoring a native context', async () => {
    const nativeTools = new Map<string, unknown>();
    const nativeContext = Object.assign(new EventTarget(), {
      registerTool(tool: { name: string }, options?: { signal?: AbortSignal }) {
        nativeTools.set(tool.name, tool);
        options?.signal?.addEventListener(
          'abort',
          () => {
            nativeTools.delete(tool.name);
          },
          { once: true }
        );
      },
      async getTools() {
        return [];
      },
    });
    const server = new BrowserMcpServer(
      { name: 'close-cleanup-test', version: '1.0.0' },
      { native: nativeContext }
    );
    const controller = new AbortController();

    await server.registerTool(
      {
        name: 'restored_native_tool',
        description: 'Original wrapper registration',
        async execute() {},
      },
      { signal: controller.signal }
    );
    await server.close();

    const replacement = { name: 'restored_native_tool' };
    nativeTools.set(replacement.name, replacement);
    controller.abort();

    expect(nativeTools.get(replacement.name)).toBe(replacement);
  });

  it('preserves AbortSignal reasons for registration and Chrome execution', async () => {
    const server = new BrowserMcpServer({ name: 'abort-reason-test', version: '1.0.0' });
    const registrationReason = { source: 'registration' };
    const registrationController = new AbortController();
    registrationController.abort(registrationReason);

    await expect(
      server.registerTool(
        {
          name: 'preaborted_tool',
          description: 'Never registers',
          async execute() {},
        },
        { signal: registrationController.signal }
      )
    ).rejects.toBe(registrationReason);

    const pendingReason = { source: 'pending-registration' };
    const pendingController = new AbortController();
    const pendingRegistration = server.registerTool(
      {
        name: 'pending_abort_tool',
        description: 'Aborted before registration settles',
        async execute() {},
      },
      { signal: pendingController.signal }
    );
    pendingController.abort(pendingReason);
    await expect(pendingRegistration).rejects.toBe(pendingReason);

    const validationReason = { source: 'origin-validation' };
    const validationController = new AbortController();
    const exposedTo = ['https://example.com'];
    Object.defineProperty(exposedTo, 0, {
      get() {
        validationController.abort(validationReason);
        return 'https://example.com';
      },
    });
    await expect(
      server.registerTool(
        {
          name: 'validation_abort_tool',
          description: 'Aborted while validating origins',
          async execute() {},
        },
        { exposedTo, signal: validationController.signal }
      )
    ).rejects.toBe(validationReason);

    await server.registerTool({
      name: 'cancelled_execution_tool',
      description: 'Waits for cancellation',
      async execute() {
        return new Promise(() => {});
      },
    });
    const [tool] = await server.getTools();
    const executionReason = { source: 'execution' };
    const executionController = new AbortController();
    const execution = server.executeTool(tool!, '{}', { signal: executionController.signal });
    executionController.abort(executionReason);
    await expect(execution).rejects.toBe(executionReason);
    await server.close();
  });

  it('rejects invalid direct registrations and untrustworthy origin options', async () => {
    const server = new BrowserMcpServer({ name: 'registration-validation-test', version: '1.0.0' });

    await expect(
      server.registerTool({
        name: 'empty_description_tool',
        description: '',
        async execute() {},
      })
    ).rejects.toMatchObject({ name: 'InvalidStateError' });
    await expect(
      server.registerTool({
        name: 'missing_execute_tool',
        description: 'Missing execute callback',
      } as never)
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      server.registerTool(
        {
          name: 'untrustworthy_exposure_tool',
          description: 'Must not register',
          async execute() {},
        },
        { exposedTo: ['http://example.com'] }
      )
    ).rejects.toMatchObject({ name: 'SecurityError' });
    await expect(server.getTools({ fromOrigins: ['not an origin'] })).rejects.toMatchObject({
      name: 'SecurityError',
    });

    expect(server.listTools()).toEqual([]);
    await server.close();
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
    initializeWebMCPPolyfill();

    const nativeContext = document.modelContext as unknown as {
      registerTool: (
        tool: {
          name: string;
          description: string;
          inputSchema: { type: 'object'; properties: Record<string, never> };
          execute: () => Promise<{
            content: Array<{ type: 'text'; text: string }>;
          }>;
        },
        options?: { signal?: AbortSignal }
      ) => Promise<void>;
    };
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

  it('backfills tools from a native document modelContext using getTools and executeTool', async () => {
    const nativeTool = {
      name: 'standard_native_tool',
      description: 'registered before wrapper init through the standard API',
      inputSchema: JSON.stringify({
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      }),
      origin: window.location.origin,
      window,
    };
    const executeTool = vi.fn(async (_tool: unknown, input: string) =>
      JSON.parse(input).message === 'plain'
        ? 'standard-native-text'
        : JSON.stringify({
            content: [{ type: 'text', text: 'standard-native-ok' }],
            structuredContent: { ok: true },
          })
    );
    const getTools = vi.fn(async () => [nativeTool]);
    const nativeContext = {
      registerTool: () => {},
      getTools,
      executeTool,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    };

    setDocumentModelContext(nativeContext);

    initializeWebModelContext();
    await vi.waitFor(() => {
      const names = getModelContext()
        .listTools()
        .map((tool) => tool.name);
      expect(names).toContain('standard_native_tool');
    });
    await getModelContext().getTools({ fromOrigins: ['https://child.example'] });
    expect(getTools).toHaveBeenLastCalledWith({ fromOrigins: ['https://child.example'] });

    const result = parseSerializedResult(
      await executeRegisteredTool(getModelContext(), 'standard_native_tool', {
        message: 'hello',
      })
    ) as { content: unknown[]; structuredContent?: unknown };

    expect(result.content[0]).toMatchObject({ type: 'text', text: 'standard-native-ok' });
    expect(result.structuredContent).toEqual({ ok: true });
    expect(executeTool).toHaveBeenCalledWith(
      nativeTool,
      JSON.stringify({ message: 'hello' }),
      undefined
    );

    const plainResult = await executeRegisteredTool(getModelContext(), 'standard_native_tool', {
      message: 'plain',
    });
    expect(plainResult).toBe('standard-native-text');
  });

  it('does not repopulate tools when close races with native getTools', async () => {
    type NativeTool = {
      name: string;
      description: string;
      inputSchema: string;
      origin: string;
      window: Window;
    };

    let resolveGetTools!: (tools: NativeTool[]) => void;
    let markGetToolsStarted!: () => void;
    const getToolsStarted = new Promise<void>((resolve) => {
      markGetToolsStarted = resolve;
    });
    const nativeContext = Object.assign(new EventTarget(), {
      registerTool: () => {},
      getTools: () => {
        markGetToolsStarted();
        return new Promise<NativeTool[]>((resolve) => {
          resolveGetTools = resolve;
        });
      },
      executeTool: async () =>
        JSON.stringify({ content: [{ type: 'text', text: 'should-not-run' }] }),
    });
    const server = new BrowserMcpServer(
      { name: 'native-close-race-server', version: '1.0.0' },
      { native: nativeContext }
    );

    const sync = server.syncNativeTools();
    await getToolsStarted;
    const closing = server.close();
    resolveGetTools([
      {
        name: 'late_native_tool',
        description: 'Resolved after close started',
        inputSchema: JSON.stringify({ type: 'object', properties: {} }),
        origin: window.location.origin,
        window,
      },
    ]);

    await expect(sync).resolves.toBeUndefined();
    await closing;
    expect(server.listTools()).toEqual([]);
  });

  it('skips a native tool with an unsupported schema dialect without blocking later tools', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const nativeContext = Object.assign(new EventTarget(), {
      registerTool: () => {},
      getTools: async () => [
        {
          name: 'a_bad_native_schema',
          description: 'Cannot be compiled by the MCP validator',
          inputSchema: JSON.stringify({
            $schema: 'https://json-schema.org/draft/2099-99/schema',
            type: 'object',
            properties: { value: { type: 'string' } },
          }),
          origin: window.location.origin,
          window,
        },
        {
          name: 'z_valid_native_schema',
          description: 'Should still be registered',
          inputSchema: JSON.stringify({
            type: 'object',
            properties: { value: { type: 'string' } },
          }),
          origin: window.location.origin,
          window,
        },
      ],
      executeTool: async () => JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }),
    });
    const server = new BrowserMcpServer(
      { name: 'native-schema-isolation-server', version: '1.0.0' },
      { native: nativeContext }
    );

    try {
      await expect(server.syncNativeTools()).resolves.toBeUndefined();
      expect(server.listTools().map(({ name }) => name)).toEqual(['z_valid_native_schema']);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('a_bad_native_schema'),
        expect.anything()
      );
    } finally {
      warn.mockRestore();
      await server.close();
    }
  });

  it('refreshes native tool identity and metadata through MCP reconciliation', async () => {
    const channelId = `native-refresh-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const firstNativeTool = {
      name: 'refreshable_native_tool',
      description: 'Original metadata',
      inputSchema: JSON.stringify({ type: 'object', properties: {} }),
      origin: window.location.origin,
      window,
    };
    let visibleNativeTool = firstNativeTool;
    const executedTools: Array<typeof firstNativeTool> = [];
    const nativeContext = Object.assign(new EventTarget(), {
      registerTool: () => {},
      getTools: async () => [visibleNativeTool],
      executeTool: async (tool: typeof firstNativeTool, input: string) => {
        executedTools.push(tool);
        if (JSON.parse(input).inputRequired === true) {
          return JSON.stringify(inputRequired({ requestState: 'opaque-native-state' }));
        }
        return JSON.stringify({
          content: [{ type: 'text', text: tool === visibleNativeTool ? 'current' : 'stale' }],
        });
      },
    });
    const server = new BrowserMcpServer(
      { name: 'native-refresh-server', version: '1.0.0' },
      { native: nativeContext }
    );
    const client = new Client(
      { name: 'native-refresh-client', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } }
    );

    await server.syncNativeTools();
    await server.connect(new TabServerTransport({ allowedOrigins: ['*'], channelId }));

    try {
      await client.connect(new TabClientTransport({ targetOrigin: '*', channelId }));
      await expect(
        client.callTool({ name: firstNativeTool.name, arguments: {} })
      ).resolves.toMatchObject({
        content: [{ type: 'text', text: 'current' }],
      });
      await expect(
        client.callTool({
          name: firstNativeTool.name,
          arguments: { inputRequired: true },
        })
      ).resolves.toMatchObject({
        isError: true,
        content: [
          {
            type: 'text',
            text: expect.stringContaining(
              'Multi-round tool flows require BrowserMcpServer.mcpServer.registerTool()'
            ),
          },
        ],
      });

      const replacement = { ...firstNativeTool };
      visibleNativeTool = replacement;
      await server.syncNativeTools();
      await client.callTool({ name: firstNativeTool.name, arguments: {} });
      expect(executedTools.at(-1)).toBe(replacement);

      const updated = { ...replacement, description: 'Updated metadata' };
      visibleNativeTool = updated;
      await server.syncNativeTools();
      const listed = await client.listTools();
      expect(listed.tools.find(({ name }) => name === updated.name)?.description).toBe(
        'Updated metadata'
      );
      await client.callTool({ name: updated.name, arguments: {} });
      expect(executedTools.at(-1)).toBe(updated);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('forwards MCP cancellation to a backfilled native Chrome tool', async () => {
    const channelId = `native-cancel-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const nativeTool = {
      name: 'cancellable_native_tool',
      description: 'Waits for cancellation',
      origin: window.location.origin,
      window,
    };
    let nativeSignal: AbortSignal | undefined;
    const nativeContext = Object.assign(new EventTarget(), {
      registerTool: () => {},
      getTools: async () => [nativeTool],
      executeTool: vi.fn(
        (
          _tool: typeof nativeTool,
          _input: string,
          options?: { signal?: AbortSignal }
        ): Promise<string> => {
          nativeSignal = options?.signal;
          return new Promise((_, reject) => {
            nativeSignal?.addEventListener('abort', () => reject(nativeSignal?.reason), {
              once: true,
            });
          });
        }
      ),
    });
    const server = new BrowserMcpServer(
      { name: 'native-cancellation-server', version: '1.0.0' },
      { native: nativeContext }
    );
    await server.syncNativeTools();
    await server.connect(new TabServerTransport({ allowedOrigins: ['*'], channelId }));
    const client = new Client(
      { name: 'native-cancellation-client', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } }
    );
    const controller = new AbortController();

    try {
      await client.connect(new TabClientTransport({ targetOrigin: '*', channelId }));
      const call = client.callTool(
        { name: nativeTool.name, arguments: {} },
        { signal: controller.signal }
      );
      await vi.waitFor(() => expect(nativeSignal).toBeInstanceOf(AbortSignal));

      controller.abort();

      await expect(call).rejects.toMatchObject({
        name: 'SdkError',
        message: expect.stringContaining('AbortError'),
      });
      await vi.waitFor(() => expect(nativeSignal?.aborted).toBe(true));
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('reconciles native tools after toolchange events', async () => {
    const nativeTools: Array<{
      name: string;
      description: string;
      origin: string;
      window: Window;
    }> = [];
    const nativeContext = Object.assign(new EventTarget(), {
      registerTool: () => {},
      getTools: async () => nativeTools,
      executeTool: async () =>
        JSON.stringify({ content: [{ type: 'text', text: 'native-event-ok' }] }),
    });
    setDocumentModelContext(nativeContext);
    initializeWebModelContext();

    nativeTools.push({
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

  it('uses AbortSignal cleanup for native mirrors', async () => {
    const nativeToolNames = new Set<string>();
    const nativeRegisterTool = vi.fn(
      (
        tool: Parameters<BrowserMcpServer['registerTool']>[0],
        options?: { signal?: AbortSignal }
      ) => {
        nativeToolNames.add(tool.name);
        options?.signal?.addEventListener(
          'abort',
          () => {
            nativeToolNames.delete(tool.name);
          },
          { once: true }
        );
      }
    );
    const nativeContext = {
      registerTool: nativeRegisterTool,
      listTools: () => [...nativeToolNames].map((name) => ({ name })),
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    } as unknown as Navigator['modelContext'];
    const server = new BrowserMcpServer(
      { name: 'native-signal-test', version: '1.0.0' },
      {
        native: nativeContext,
      }
    );
    const controller = new AbortController();

    try {
      await server.registerTool(
        {
          name: 'signal_only_native_tool',
          description: 'Native signal cleanup tool',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'ok' }] };
          },
        },
        { signal: controller.signal }
      );

      expect(nativeToolNames.has('signal_only_native_tool')).toBe(true);
      expect(nativeRegisterTool).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'signal_only_native_tool' }),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );

      controller.abort();
      expect(nativeToolNames.has('signal_only_native_tool')).toBe(false);
      expect(server.listTools().map(({ name }) => name)).not.toContain('signal_only_native_tool');
    } finally {
      await server.close();
    }
  });

  it('preserves raw WebMCP results at the native mirror boundary', async () => {
    let mirroredTool: { execute(args: Record<string, unknown>): Promise<unknown> } | undefined;
    const server = new BrowserMcpServer(
      { name: 'native-raw-result-test', version: '1.0.0' },
      {
        native: {
          ...createNativeModelContextStub(),
          registerTool(tool: typeof mirroredTool) {
            mirroredTool = tool;
          },
        } as unknown as Navigator['modelContext'],
      }
    );

    await server.registerTool({
      name: 'raw_native_tool',
      description: 'Returns an unwrapped WebMCP value',
      async execute() {
        return { ok: true };
      },
    });

    await expect(mirroredTool?.execute({})).resolves.toEqual({ ok: true });
    await server.close();
  });

  it('rejects and rolls back when native registration is blocked by permissions policy', async () => {
    const nativeRegisterTool = vi.fn(() => {
      throw new DOMException(
        "Failed to execute 'registerTool' on 'ModelContext': Access to the feature \"tools\" is disallowed by permissions policy.",
        'NotAllowedError'
      );
    });
    const nativeContext = {
      registerTool: nativeRegisterTool,
      getTools: async () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    } as unknown as Navigator['modelContext'];
    const server = new BrowserMcpServer(
      { name: 'native-permissions-policy-test', version: '1.0.0' },
      {
        native: nativeContext,
      }
    );

    try {
      await expect(
        server.registerTool({
          name: 'iframe_blocked_native_tool',
          description: 'Native registration is blocked inside the iframe',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'ok' }] };
          },
        })
      ).rejects.toMatchObject({ name: 'NotAllowedError' });

      expect(nativeRegisterTool).toHaveBeenCalled();
      expect(server.listTools().some((tool) => tool.name === 'iframe_blocked_native_tool')).toBe(
        false
      );
      await expect(server.getTools()).resolves.toEqual([]);
    } finally {
      void server.close();
    }
  });

  it('rolls back transport registration when async native registerTool rejects', async () => {
    let nativeCleanupSignal: AbortSignal | undefined;
    let nativeCleanupAbortCount = 0;
    const nativeRegisterTool = vi.fn(
      (_tool: unknown, options?: { signal?: AbortSignal }): Promise<void> => {
        nativeCleanupSignal = options?.signal;
        nativeCleanupSignal?.addEventListener(
          'abort',
          () => {
            nativeCleanupAbortCount++;
          },
          { once: true }
        );
        return Promise.reject(new Error('native async registration rejected'));
      }
    );
    const nativeContext = {
      registerTool: nativeRegisterTool,
      listTools: () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    } as unknown as Navigator['modelContext'];
    const server = new BrowserMcpServer(
      { name: 'native-async-rejection-test', version: '1.0.0' },
      {
        native: nativeContext,
      }
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await expect(
        server.registerTool({
          name: 'async_rejected_native_tool',
          description: 'Native registration rejects asynchronously',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'transport-ok' }] };
          },
        })
      ).rejects.toThrow('native async registration rejected');

      expect(nativeRegisterTool).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'async_rejected_native_tool' }),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
      expect(nativeCleanupSignal?.aborted).toBe(true);
      expect(nativeCleanupAbortCount).toBe(1);
      expect(server.listTools().some((tool) => tool.name === 'async_rejected_native_tool')).toBe(
        false
      );
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      void server.close();
    }
  });

  it('preserves a caller abort reason when native registration rejects on cleanup', async () => {
    let nativeCleanupSignal: AbortSignal | undefined;
    const nativeRegisterTool = vi.fn(
      (_tool: unknown, options?: { signal?: AbortSignal }): Promise<void> => {
        nativeCleanupSignal = options?.signal;
        return new Promise((_, reject) => {
          nativeCleanupSignal?.addEventListener(
            'abort',
            () => reject(new DOMException('signal is aborted without reason', 'AbortError')),
            { once: true }
          );
        });
      }
    );
    const nativeContext = {
      registerTool: nativeRegisterTool,
      listTools: () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    } as unknown as Navigator['modelContext'];
    const server = new BrowserMcpServer(
      { name: 'native-abort-rejection-test', version: '1.0.0' },
      {
        native: nativeContext,
      }
    );
    const controller = new AbortController();
    const reason = new Error('caller cancelled registration');

    try {
      const registration = server.registerTool(
        {
          name: 'native_abort_rejected_tool',
          description: 'Native registration rejects on cleanup abort',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'transport-ok' }] };
          },
        },
        { signal: controller.signal }
      );
      const rejection = expect(registration).rejects.toBe(reason);

      await vi.waitFor(() => expect(nativeCleanupSignal).toBeDefined());
      controller.abort(reason);

      await rejection;
      expect(server.listTools()).toEqual([]);
    } finally {
      await server.close();
    }
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
    ) as { isError?: boolean; structuredContent?: Record<string, unknown> };
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
    ) as {
      content: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };
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
    const serverTransport = new TabServerTransport({ allowedOrigins: ['*'], channelId });
    const server = new BrowserMcpServer({ name: 'bundle-a', version: '1.0.0' });

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

  it('preserves WebMCP schemas across the MCP transport boundary', async () => {
    const server = new BrowserMcpServer({ name: 'schema-transport-server', version: '1.0.0' });
    const client = new Client(
      { name: 'schema-transport-client', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } }
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const outputSchema = {
      properties: { total: { type: 'number' } },
      required: ['total'],
    };

    try {
      await server.registerTool({
        name: 'primitive_output_tool',
        description: 'Returns primitive structured content in the browser surface',
        inputSchema: { type: 'object', properties: {} },
        outputSchema: { type: 'string' },
        async execute() {
          return 'ready';
        },
      });
      await server.registerTool({
        name: 'array_input_tool',
        description: 'Accepts a WebMCP array input',
        inputSchema: { type: 'array', items: { type: 'number' } },
        async execute(values) {
          return values;
        },
      });
      await server.registerTool({
        name: 'object_output_without_root_type_tool',
        description: 'Returns object structured content with a rootless schema',
        inputSchema: { type: 'object', properties: {} },
        outputSchema,
        async execute() {
          return {
            content: [{ type: 'text', text: 'total:1' }],
            structuredContent: { total: 1 },
          };
        },
      });

      outputSchema.required.length = 0;
      outputSchema.properties.total.type = 'string';
      const localTools = server.listTools();
      expect(
        localTools.find((tool) => tool.name === 'primitive_output_tool')?.outputSchema
      ).toEqual({ type: 'string' });
      expect(localTools.map(({ name }) => name)).toContain('array_input_tool');
      expect(
        localTools.find((tool) => tool.name === 'object_output_without_root_type_tool')
          ?.outputSchema
      ).toEqual({
        properties: { total: { type: 'number' } },
        required: ['total'],
      });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('MCP input schemas require'));
      await expect(executeRegisteredTool(server, 'array_input_tool', [1, 2, 3])).resolves.toBe(
        '[1,2,3]'
      );

      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const listed = await client.listTools();
      expect(listed.tools.map(({ name }) => name)).not.toContain('array_input_tool');
      expect(
        listed.tools.find((tool) => tool.name === 'primitive_output_tool')?.outputSchema
      ).toEqual({
        type: 'object',
        properties: { result: { type: 'string' } },
        required: ['result'],
      });
      expect(
        listed.tools.find((tool) => tool.name === 'object_output_without_root_type_tool')
          ?.outputSchema
      ).toEqual({
        type: 'object',
        properties: { total: { type: 'number' } },
        required: ['total'],
      });

      const primitiveResult = await client.callTool({
        name: 'primitive_output_tool',
        arguments: {},
      });
      expect(primitiveResult.content).toEqual([{ type: 'text', text: 'ready' }]);
      expect(primitiveResult.structuredContent).toEqual({ result: 'ready' });

      const objectResult = await client.callTool({
        name: 'object_output_without_root_type_tool',
        arguments: {},
      });
      expect(objectResult.structuredContent).toEqual({ total: 1 });
    } finally {
      warnSpy.mockRestore();
      await client.close();
      await server.close();
    }
  });
});
