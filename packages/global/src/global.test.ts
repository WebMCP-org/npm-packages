import { TabClientTransport, TabServerTransport } from '@mcp-b/transports';
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import { normalizeInputSchema } from '@mcp-b/webmcp-polyfill/schema';
import { BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';
import type { ModelContextCore } from '@mcp-b/webmcp-types';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { inputRequired } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserMcpServer as SourceBrowserMcpServer } from '../../webmcp-ts-sdk/src/browser-server.js';
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
    unregisterTool: () => {},
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

    initializeWebModelContext();
    // Server wraps native, adding registerPrompt/registerResource/etc.
    expect(document.modelContext).not.toBe(nativeContext);

    cleanupWebModelContext();
    expect(document.modelContext).toBe(nativeContext);
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
    expect(typeof modelContext.unregisterTool).toBe('function');
    expect(typeof (modelContext as unknown as { clearContext?: unknown }).clearContext).toBe(
      'undefined'
    );
    expect(typeof modelContext.listTools).toBe('function');
    expect(typeof modelContext.getTools).toBe('function');
    expect(typeof modelContext.executeTool).toBe('function');
    expect(typeof modelContext.ontoolchange).toBe('object');
    expect(modelContext).toBeInstanceOf(EventTarget);
  });

  it('registerTool resolves undefined and mirrors to the browser API', async () => {
    initializeWebModelContext();

    const modelContext = getModelContext();

    const result = modelContext.registerTool({
      name: 'web_tool',
      description: 'Web style tool',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'web-ok' }] };
      },
    });

    await expect(result).resolves.toBeUndefined();

    const tools = await modelContext.getTools();
    expect(tools.some((tool) => tool.name === 'web_tool')).toBe(true);

    const serialized = await executeRegisteredTool(modelContext, 'web_tool');
    expect(serialized).toContain('web-ok');

    modelContext.unregisterTool('web_tool');
    expect((await modelContext.getTools()).some((tool) => tool.name === 'web_tool')).toBe(false);
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

  it('validates prompt arguments on direct BrowserMcpServer reads', async () => {
    const server = new SourceBrowserMcpServer({
      name: 'prompt-validation-test',
      version: '1.0.0',
    });
    const get = vi.fn(async (args: Record<string, string>) => ({
      messages: [
        {
          role: 'user' as const,
          content: { type: 'text' as const, text: `Summarize ${args.url}` },
        },
      ],
    }));
    server.registerPrompt({
      name: 'summarize',
      argsSchema: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
      },
      get,
    });

    try {
      await expect(server.getPrompt('summarize', {})).rejects.toThrow(
        'Invalid arguments for prompt summarize'
      );
      expect(get).not.toHaveBeenCalled();

      await expect(server.getPrompt('summarize', { url: 'https://example.com' })).resolves.toEqual({
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: 'Summarize https://example.com' },
          },
        ],
      });
      expect(get).toHaveBeenCalledOnce();
    } finally {
      await server.close();
    }
  });

  it('passes explicit v2 request options through unchanged', async () => {
    const server = new BrowserMcpServer({ name: 'request-options-test', version: '1.0.0' });
    const createMessage = vi.spyOn(server.server, 'createMessage').mockResolvedValue({} as never);
    const params = {
      messages: [{ role: 'user' as const, content: { type: 'text' as const, text: 'Hi' } }],
      maxTokens: 100,
    };
    const options = { timeout: 30_000, maxTotalTimeout: 60_000 };

    await server.createMessage(params, options);

    expect(createMessage).toHaveBeenCalledWith(params, options);
    await server.close();
  });

  it('keeps the 10-second sampling and elicitation default timeout', async () => {
    const server = new BrowserMcpServer({ name: 'default-timeout-test', version: '1.0.0' });
    const createMessage = vi.spyOn(server.server, 'createMessage').mockResolvedValue({} as never);
    const elicitInput = vi.spyOn(server.server, 'elicitInput').mockResolvedValue({} as never);
    const samplingParams = {
      messages: [{ role: 'user' as const, content: { type: 'text' as const, text: 'Hi' } }],
      maxTokens: 100,
    };
    const elicitationParams = {
      message: 'Choose a display name',
      requestedSchema: {
        type: 'object' as const,
        properties: { displayName: { type: 'string' as const } },
      },
    };

    await server.createMessage(samplingParams);
    await server.elicitInput(elicitationParams);

    expect(createMessage).toHaveBeenCalledWith(samplingParams, { timeout: 10_000 });
    expect(elicitInput).toHaveBeenCalledWith(elicitationParams, { timeout: 10_000 });
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
    server.registerResource({
      uri: 'user://{userId}/profile',
      name: 'User profile',
      async read(uri, params) {
        templateParams = params;
        return { contents: [{ uri: uri.href, text: String(params?.userId) }] };
      },
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
      await expect(server.readResource('user://84/profile')).resolves.toMatchObject({
        contents: [{ uri: 'user://84/profile', text: '84' }],
      });
      expect(templateParams).toEqual({ userId: '84' });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('rejects input-required results at the WebMCP descriptor boundary', async () => {
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
            type: 'object',
            properties: { count: { type: 'number' } },
            required: ['count'],
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
        content: [
          {
            type: 'text',
            text: expect.stringContaining(
              'Multi-round tool flows require direct McpServer registration'
            ),
          },
        ],
      });

      const [registeredTool] = await server.getTools();
      await expect(server.executeTool(registeredTool!, '{"count":3}')).rejects.toThrow(
        'Multi-round tool flows require direct McpServer registration'
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
    let handlerThis: ModelContextCore | null = null;
    modelContext.addEventListener('toolchange', () => {
      listenerCount += 1;
    });
    modelContext.ontoolchange = function (event) {
      handlerCount += 1;
      handlerTarget = event.target;
      // oxlint-disable-next-line typescript/no-this-alias -- verifies EventHandler `this` binding.
      handlerThis = this;
    };

    await modelContext.registerTool({
      name: 'wrapper_event_tool',
      description: 'Wrapper event tool',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'ok' }] };
      },
    });

    modelContext.unregisterTool('wrapper_event_tool');
    await vi.waitFor(() => {
      expect(listenerCount).toBe(2);
      expect(handlerCount).toBe(2);
    });
    expect(handlerTarget).toBe(modelContext);
    expect(handlerThis).toBe(modelContext);
  });

  it('registerTool({ signal }) abort removes the tool from browser discovery', async () => {
    initializeWebModelContext();

    const modelContext = getModelContext();
    const ac = new AbortController();

    await modelContext.registerTool(
      {
        name: 'signal_tool',
        description: 'AbortSignal-driven tool',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'signal-ok' }] };
        },
      },
      { signal: ac.signal }
    );

    expect(modelContext.listTools().some((tool) => tool.name === 'signal_tool')).toBe(true);
    expect((await modelContext.getTools()).some((tool) => tool.name === 'signal_tool')).toBe(true);

    ac.abort();

    expect(modelContext.listTools().some((tool) => tool.name === 'signal_tool')).toBe(false);
    expect((await modelContext.getTools()).some((tool) => tool.name === 'signal_tool')).toBe(false);
  });

  it('does not let an old registration signal remove a same-name replacement', async () => {
    const server = new BrowserMcpServer({ name: 'signal-replacement-test', version: '1.0.0' });
    const originalController = new AbortController();
    await server.registerTool(
      {
        name: 'signal_replacement_tool',
        description: 'Original registration',
        async execute() {
          return { version: 'original' };
        },
      },
      { signal: originalController.signal }
    );
    server.unregisterTool('signal_replacement_tool');
    await server.registerTool({
      name: 'signal_replacement_tool',
      description: 'Replacement registration',
      async execute() {
        return { version: 'replacement' };
      },
    });

    originalController.abort();

    await expect(executeRegisteredTool(server, 'signal_replacement_tool')).resolves.toBe(
      '{"version":"replacement"}'
    );
    await server.close();
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
      unregisterTool(name: string) {
        nativeTools.delete(name);
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
    const server = new SourceBrowserMcpServer(
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

    await expect(sync).resolves.toBe(0);
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
    const server = new SourceBrowserMcpServer(
      { name: 'native-schema-isolation-server', version: '1.0.0' },
      { native: nativeContext }
    );

    try {
      await expect(server.syncNativeTools()).resolves.toBe(1);
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

    expect(await server.syncNativeTools()).toBe(1);
    await server.connect(new TabServerTransport({ allowedOrigins: ['*'], channelId }));

    try {
      await client.connect(
        new TabClientTransport({ targetOrigin: '*', channelId, requestTimeout: 5000 })
      );
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
              'Multi-round tool flows require direct McpServer registration'
            ),
          },
        ],
      });

      const replacement = { ...firstNativeTool };
      visibleNativeTool = replacement;
      expect(await server.syncNativeTools()).toBe(0);
      await client.callTool({ name: firstNativeTool.name, arguments: {} });
      expect(executedTools.at(-1)).toBe(replacement);

      const updated = { ...replacement, description: 'Updated metadata' };
      visibleNativeTool = updated;
      expect(await server.syncNativeTools()).toBe(0);
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
      await client.connect(
        new TabClientTransport({ targetOrigin: '*', channelId, requestTimeout: 5000 })
      );
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

  it('unregisterTool removes mirrored tools', async () => {
    initializeWebModelContext();

    const modelContext = getModelContext();

    await modelContext.registerTool({
      name: 'remove_me',
      description: 'remove me',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'remove' }] };
      },
    });

    modelContext.unregisterTool('remove_me');

    const tools = await modelContext.getTools();
    expect(tools.some((tool) => tool.name === 'remove_me')).toBe(false);
  });

  it('unregisterTool accepts the originally registered tool object for compatibility', async () => {
    initializeWebModelContext();

    const modelContext = getModelContext();
    const tool = {
      name: 'compat_unregister_tool',
      description: 'Compatibility unregister tool',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'ok' }] };
      },
    } satisfies Parameters<typeof modelContext.registerTool>[0];

    await modelContext.registerTool(tool);
    modelContext.unregisterTool(tool);

    const tools = await modelContext.getTools();
    expect(tools.some((registeredTool) => registeredTool.name === 'compat_unregister_tool')).toBe(
      false
    );
  });

  it('forwards string tool names to native unregisterTool even for compatibility inputs', async () => {
    const nativeUnregisterTool = vi.fn();
    const nativeContext = {
      ...createNativeModelContextStub(),
      unregisterTool: nativeUnregisterTool,
    } as Navigator['modelContext'];

    setDocumentModelContext(nativeContext);

    try {
      initializeWebModelContext();

      const modelContext = getModelContext();
      const tool = {
        name: 'native_name_forwarding_tool',
        description: 'Compatibility unregister tool',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      } satisfies Parameters<typeof modelContext.registerTool>[0];

      await modelContext.registerTool(tool);
      nativeUnregisterTool.mockClear();

      modelContext.unregisterTool(tool);

      expect(nativeUnregisterTool).toHaveBeenCalledWith('native_name_forwarding_tool');
    } finally {
      cleanupWebModelContext();
    }
  });

  it('uses AbortSignal cleanup when native mirrors omit unregisterTool', async () => {
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
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await server.registerTool({
        name: 'signal_only_native_tool',
        description: 'Native signal-only cleanup tool',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      });

      expect(nativeToolNames.has('signal_only_native_tool')).toBe(true);
      expect(nativeRegisterTool).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'signal_only_native_tool' }),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );

      expect(() => server.unregisterTool('signal_only_native_tool')).not.toThrow();
      expect(nativeToolNames.has('signal_only_native_tool')).toBe(false);
    } finally {
      warnSpy.mockRestore();
      void server.close();
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

  it('does not warn when native registerTool rejects because its cleanup signal aborts', async () => {
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
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const registration = server.registerTool({
        name: 'native_abort_rejected_tool',
        description: 'Native registration rejects on cleanup abort',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'transport-ok' }] };
        },
      });

      expect(() => server.unregisterTool('native_abort_rejected_tool')).not.toThrow();
      await expect(registration).rejects.toMatchObject({ name: 'AbortError' });

      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Native WebMCP tool mirror registration rejected'),
        expect.any(Error)
      );
    } finally {
      warnSpy.mockRestore();
      void server.close();
    }
  });

  it('aborts signal-only native mirrors when the caller signal aborts', async () => {
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
      { name: 'native-signal-abort-test', version: '1.0.0' },
      {
        native: nativeContext,
      }
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const controller = new AbortController();

    try {
      const registration = server.registerTool(
        {
          name: 'caller_signal_only_native_tool',
          description: 'Native caller signal cleanup tool',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'ok' }] };
          },
        },
        { signal: controller.signal }
      );

      expect(
        server.listTools().some((tool) => tool.name === 'caller_signal_only_native_tool')
      ).toBe(true);
      expect(nativeToolNames.has('caller_signal_only_native_tool')).toBe(true);

      controller.abort();
      await expect(registration).rejects.toBe(controller.signal.reason);

      expect(
        server.listTools().some((tool) => tool.name === 'caller_signal_only_native_tool')
      ).toBe(false);
      expect(nativeToolNames.has('caller_signal_only_native_tool')).toBe(false);
    } finally {
      warnSpy.mockRestore();
      void server.close();
    }
  });

  it('sets __isBrowserMcpServer marker on document.modelContext', () => {
    initializeWebModelContext();
    const ctx = document.modelContext as unknown as Record<string, unknown>;
    expect(ctx.__isBrowserMcpServer).toBe(true);
  });

  it('skips initialization when document.modelContext already has __isBrowserMcpServer marker', () => {
    // Simulate another bundle having already set up a BrowserMcpServer
    const fakeServer = {
      __isBrowserMcpServer: true,
      registerTool: () => {},
      unregisterTool: () => {},
    };
    setDocumentModelContext(fakeServer);

    try {
      initializeWebModelContext();

      // Init should have been skipped — modelContext should still be the fake server
      expect(document.modelContext).toBe(fakeServer);
    } finally {
      cleanupWebModelContext();
    }
  });

  it('cleanup restores and allows re-init', () => {
    initializeWebModelContext();
    expect(typeof getModelContext().listTools).toBe('function');

    cleanupWebModelContext();

    initializeWebModelContext();
    expect(typeof getModelContext().listTools).toBe('function');
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

  it('listTools does not prepend type:"object" to non-object outputSchema', async () => {
    initializeWebModelContext();
    const modelContext = getModelContext();

    await modelContext.registerTool({
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

    // Place server on document.modelContext (as initializeWebModelContext would)
    setDocumentModelContext(server);

    // Verify marker is present (BrowserMcpServer sets it automatically)
    const ctx = document.modelContext as unknown as Record<string, unknown>;
    expect(ctx.__isBrowserMcpServer).toBe(true);

    // --- Bundle B: calls initializeWebModelContext() ---
    // Module-level `runtime` is null (no prior init in this test).
    // The ONLY thing preventing a second server+transport is the marker on modelContext.
    initializeWebModelContext({
      transport: { tabServer: { allowedOrigins: ['*'], channelId }, iframeServer: false },
    });

    // modelContext should still be Bundle A's server — not replaced
    expect(document.modelContext).toBe(server);

    // --- Verify: full MCP roundtrip invokes tool exactly once ---
    const clientTransport = new TabClientTransport({
      targetOrigin: '*',
      channelId,
      requestTimeout: 5000,
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

  it('keeps primitive outputSchema on WebMCP and projects it for legacy MCP transport', async () => {
    const channelId = uniqueChannel();
    const serverTransport = new TabServerTransport({ allowedOrigins: ['*'], channelId });
    const server = new BrowserMcpServer({ name: 'primitive-output-server', version: '1.0.0' });

    server.registerTool({
      name: 'primitive_output_tool',
      description: 'Returns primitive structured content in the browser surface',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: { type: 'string' },
      async execute() {
        return 'ready';
      },
    });

    expect(
      server.listTools().find((tool) => tool.name === 'primitive_output_tool')?.outputSchema
    ).toEqual({ type: 'string' });

    await server.connect(serverTransport);

    const clientTransport = new TabClientTransport({
      targetOrigin: '*',
      channelId,
      requestTimeout: 5000,
    });
    const mcpClient = new Client(
      { name: 'primitive-output-client', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } }
    );

    try {
      await mcpClient.connect(clientTransport);
      const listed = await mcpClient.listTools();
      const listedTool = listed.tools.find((tool) => tool.name === 'primitive_output_tool');
      expect(listedTool?.outputSchema).toEqual({
        type: 'object',
        properties: { result: { type: 'string' } },
        required: ['result'],
      });

      const result = await mcpClient.callTool({
        name: 'primitive_output_tool',
        arguments: {},
      });
      expect(result.content).toEqual([{ type: 'text', text: 'ready' }]);
      expect(result.structuredContent).toEqual({ result: 'ready' });
    } finally {
      await mcpClient.close();
      await server.close();
    }
  });

  it('keeps non-object input schemas on WebMCP without breaking the MCP tool list', async () => {
    const channelId = uniqueChannel();
    const server = new BrowserMcpServer({ name: 'array-input-server', version: '1.0.0' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await (server as unknown as ModelContextCore).registerTool({
      name: 'array_input_tool',
      description: 'Accepts a WebMCP array input',
      inputSchema: { type: 'array', items: { type: 'number' } },
      async execute(values) {
        return values;
      },
    });

    expect(server.listTools().map((tool) => tool.name)).toContain('array_input_tool');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('MCP input schemas require'));

    await server.connect(new TabServerTransport({ allowedOrigins: ['*'], channelId }));
    const client = new Client(
      { name: 'array-input-client', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } }
    );

    try {
      await client.connect(
        new TabClientTransport({ targetOrigin: '*', channelId, requestTimeout: 5000 })
      );
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name)).not.toContain('array_input_tool');
    } finally {
      warnSpy.mockRestore();
      await client.close();
      await server.close();
    }
  });

  it('keeps object outputSchema without a root type on MCP transport', async () => {
    const channelId = uniqueChannel();
    const serverTransport = new TabServerTransport({ allowedOrigins: ['*'], channelId });
    const server = new BrowserMcpServer({ name: 'object-output-server', version: '1.0.0' });
    const outputSchema = {
      properties: { total: { type: 'number' } },
      required: ['total'],
    };

    server.registerTool({
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

    await server.connect(serverTransport);

    const clientTransport = new TabClientTransport({
      targetOrigin: '*',
      channelId,
      requestTimeout: 5000,
    });
    const mcpClient = new Client(
      { name: 'object-output-client', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } }
    );

    try {
      await mcpClient.connect(clientTransport);
      const listed = await mcpClient.listTools();
      const listedTool = listed.tools.find(
        (tool) => tool.name === 'object_output_without_root_type_tool'
      );
      expect(listedTool?.outputSchema).toEqual({ type: 'object', ...outputSchema });

      const result = await mcpClient.callTool({
        name: 'object_output_without_root_type_tool',
        arguments: {},
      });
      expect(result.structuredContent).toEqual({ total: 1 });
    } finally {
      await mcpClient.close();
      await server.close();
    }
  });
});
