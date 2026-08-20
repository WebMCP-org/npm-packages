import { normalizeInputSchema } from '@mcp-b/webmcp-polyfill/schema';
import type { ModelContext } from '@mcp-b/webmcp-types';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { inputRequired } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserMcpServer, isBrowserMcpServer, type ResourceDescriptor } from './browser-server.js';

let server: BrowserMcpServer | undefined;
let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  await server?.close();
  client = undefined;
  server = undefined;
});

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

function createNativeModelContextStub(): ModelContext {
  const nativeContext: Record<string, unknown> = {
    registerTool: () => {},
    listTools: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };

  return nativeContext as unknown as ModelContext;
}

describe('BrowserMcpServer', () => {
  it('narrows branded model contexts', () => {
    server = new BrowserMcpServer({ name: 'guard-test', version: '1.0.0' });
    expect(isBrowserMcpServer(server)).toBe(true);
    expect(isBrowserMcpServer(undefined)).toBe(false);
  });

  it('uses Web IDL callback semantics and preserves execution errors', async () => {
    server = new BrowserMcpServer({ name: 'execution-test', version: '1.0.0' });
    await server.registerTool({
      name: 'receiver',
      description: 'Captures its receiver',
      async execute(this: unknown) {
        expect(this).toBeUndefined();
        return { ok: true };
      },
    });
    await server.registerTool({
      name: 'failure',
      description: 'Throws',
      async execute() {
        throw new Error('boom');
      },
    });
    await server.registerTool({
      name: 'abort',
      description: 'Waits for cancellation',
      execute: () => new Promise(() => {}),
    });

    const tools = await server.getTools();
    await expect(
      server.executeTool(tools.find(({ name }) => name === 'receiver')!, '{}')
    ).resolves.toBe('{"ok":true}');
    await expect(
      server.executeTool(tools.find(({ name }) => name === 'failure')!, '{}')
    ).rejects.toMatchObject({ name: 'UnknownError', message: expect.stringContaining('boom') });

    const reason = { source: 'caller' };
    const controller = new AbortController();
    const execution = server.executeTool(tools.find(({ name }) => name === 'abort')!, '{}', {
      signal: controller.signal,
    });
    controller.abort(reason);
    await expect(execution).rejects.toBe(reason);
  });

  it('preserves known annotations and returns detached tool metadata', async () => {
    server = new BrowserMcpServer({ name: 'metadata-test', version: '1.0.0' });
    await Reflect.apply(server.registerTool, server, [
      {
        name: 'annotated',
        description: 'Has annotations',
        inputSchema: { type: 'object', properties: { value: { type: 'string' } } },
        annotations: {
          title: 'Annotated tool',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
          untrustedContentHint: true,
        },
        async execute() {},
      },
      null,
    ]);

    const [listed] = server.listTools();
    expect(listed?.annotations).toEqual({
      title: 'Annotated tool',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      untrustedContentHint: true,
    });
    listed!.inputSchema.type = 'array';
    listed!.annotations!.title = 'mutated';
    expect(server.listTools()[0]).toMatchObject({
      inputSchema: { type: 'object' },
      annotations: { title: 'Annotated tool' },
    });
  });

  it('publishes native registrations only after native acceptance', async () => {
    let resolveNative!: () => void;
    const accepted = new Promise<void>((resolve) => {
      resolveNative = resolve;
    });
    const nativeFailure = new Error('native rejected');
    let registrationCount = 0;
    const nativeTools = [
      {
        name: 'accepted',
        description: 'Accepted asynchronously',
        origin: window.location.origin,
        window,
      },
    ];
    const native = Object.assign(new EventTarget(), {
      ontoolchange: null,
      registerTool() {
        registrationCount += 1;
        return registrationCount === 1
          ? accepted.then(() => {
              native.dispatchEvent(new Event('toolchange'));
            })
          : Promise.reject(nativeFailure);
      },
      async getTools() {
        return nativeTools;
      },
      async executeTool() {
        return '{}';
      },
    });
    server = new BrowserMcpServer({ name: 'native-staging-test', version: '1.0.0' }, { native });
    const order: string[] = [];
    server.addEventListener('toolchange', () => order.push('toolchange'));

    const registration = server
      .registerTool({
        name: 'accepted',
        description: 'Accepted asynchronously',
        async execute() {},
      })
      .then(() => order.push('resolved'));
    expect(server.listTools()).toEqual([]);
    resolveNative();
    await registration;
    expect(server.listTools().map(({ name }) => name)).toEqual(['accepted']);
    expect(order).toEqual(['toolchange', 'resolved']);

    // Native events remain authoritative when getTools() reuses descriptor objects.
    native.dispatchEvent(new Event('toolchange'));
    await server.syncNativeTools();
    await expect.poll(() => order).toEqual(['toolchange', 'resolved', 'toolchange']);

    await expect(
      server.registerTool({
        name: 'rejected',
        description: 'Rejected asynchronously',
        async execute() {},
      })
    ).rejects.toBe(nativeFailure);
    expect(server.listTools().map(({ name }) => name)).toEqual(['accepted']);
  });

  it('allows an aborted pending native tool to be registered again immediately', async () => {
    const resolveNativeRegistrations: Array<() => void> = [];
    const native = Object.assign(new EventTarget(), {
      ontoolchange: null,
      registerTool() {
        return new Promise<void>((resolve) => resolveNativeRegistrations.push(resolve));
      },
      async getTools() {
        return [];
      },
    });
    server = new BrowserMcpServer({ name: 'native-abort-test', version: '1.0.0' }, { native });
    const tool = {
      name: 'strict_mode_tool',
      description: 'Registers again during effect replay',
      async execute() {},
    };
    const controller = new AbortController();
    const reason = { source: 'effect-cleanup' };

    const abandonedRegistration = server.registerTool(tool, { signal: controller.signal });
    controller.abort(reason);
    const activeRegistration = server.registerTool(tool);

    resolveNativeRegistrations[1]!();
    await activeRegistration;
    resolveNativeRegistrations[0]!();
    await expect(abandonedRegistration).rejects.toBe(reason);
    expect(server.listTools().map(({ name }) => name)).toEqual(['strict_mode_tool']);
  });

  it('backfills an existing native tool after native registration rejects', async () => {
    const nativeFailure = new DOMException('Tool already registered', 'InvalidStateError');
    const native = Object.assign(new EventTarget(), {
      ontoolchange: null,
      registerTool() {
        return Promise.reject(nativeFailure);
      },
      async getTools() {
        return [
          {
            name: 'native_tool',
            description: 'Already registered by the browser',
            origin: window.location.origin,
            window,
          },
        ];
      },
      async executeTool() {
        return '{}';
      },
    });
    server = new BrowserMcpServer({ name: 'native-rejection-test', version: '1.0.0' }, { native });

    await expect(
      server.registerTool({
        name: 'native_tool',
        description: 'Conflicts with the browser registration',
        async execute() {},
      })
    ).rejects.toBe(nativeFailure);
    await server.syncNativeTools();

    expect(server.listTools().map(({ name }) => name)).toEqual(['native_tool']);
  });

  it('rolls back publication when registration aborts during schema cloning', async () => {
    server = new BrowserMcpServer({ name: 'publication-abort-test', version: '1.0.0' });
    const controller = new AbortController();
    const reason = { source: 'output-schema' };

    await expect(
      server.registerTool(
        {
          name: 'aborted_publication',
          description: 'Aborts while cloning its output schema',
          outputSchema: {
            type: 'object' as const,
            get properties() {
              controller.abort(reason);
              return {};
            },
          },
          async execute() {},
        },
        { signal: controller.signal }
      )
    ).rejects.toBe(reason);
    expect(server.listTools()).toEqual([]);
  });

  it('shares close work and rejects document operations after closing', async () => {
    server = new BrowserMcpServer({ name: 'close-test', version: '1.0.0' });
    await server.registerTool({
      name: 'closed',
      description: 'Closed with its server',
      async execute() {},
    });
    const [tool] = await server.getTools();

    const closing = server.close();
    expect(server.close()).toBe(closing);
    await closing;
    await expect(server.getTools()).rejects.toMatchObject({ name: 'InvalidStateError' });
    await expect(server.executeTool(tool!, '{}')).rejects.toMatchObject({
      name: 'InvalidStateError',
    });
  });

  it('supports dynamic MCP registrations but rejects multi-round WebMCP tools', async () => {
    server = new BrowserMcpServer({ name: 'mcp-test', version: '1.0.0' });
    client = new Client(
      { name: 'mcp-test-client', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } }
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    server.registerResource({
      uri: 'test://dynamic',
      name: 'Dynamic resource',
      async read(uri) {
        return { contents: [{ uri: uri.href, text: 'resource' }] };
      },
    });
    server.registerPrompt({
      name: 'dynamic_prompt',
      async get() {
        return { messages: [{ role: 'user', content: { type: 'text', text: 'prompt' } }] };
      },
    });
    await server.registerTool({
      name: 'multi_round',
      description: 'Requires another input round',
      async execute() {
        return inputRequired({ requestState: 'opaque-state' });
      },
    });

    await expect(client.readResource({ uri: 'test://dynamic' })).resolves.toMatchObject({
      contents: [{ text: 'resource' }],
    });
    await expect(client.getPrompt({ name: 'dynamic_prompt' })).resolves.toMatchObject({
      messages: [{ content: { text: 'prompt' } }],
    });
    await expect(client.callTool({ name: 'multi_round', arguments: {} })).resolves.toMatchObject({
      isError: true,
      content: [
        {
          text: expect.stringContaining('BrowserMcpServer.mcpServer.registerTool()'),
        },
      ],
    });
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

  it('delegates Standard Schema validation to the MCP server and rejects input-required results', async () => {
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
        async execute({ count }: { count?: unknown }) {
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
      { native: nativeContext as unknown as ModelContext }
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
      { native: nativeContext as unknown as ModelContext }
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
      { native: nativeContext as unknown as ModelContext }
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
      { native: nativeContext as unknown as ModelContext }
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
      { native: nativeContext as unknown as ModelContext }
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

  it('backfills native object schemas without sharing the page-world object', async () => {
    // Chrome ≥154.0.8013 returns inputSchema as an object (webmcp#241); the
    // string cases above cover the serialized form older Chrome still sends.
    const objectSchema = { type: 'object', properties: { value: { type: 'string' } } };
    const nativeContext = Object.assign(new EventTarget(), {
      registerTool: () => {},
      getTools: async () => [
        {
          name: 'object_schema_tool',
          description: 'Schema arrives as an object',
          inputSchema: objectSchema,
          origin: window.location.origin,
          window,
        },
      ],
      executeTool: async () => JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }),
    });
    const server = new BrowserMcpServer(
      { name: 'native-object-schema-server', version: '1.0.0' },
      { native: nativeContext as unknown as ModelContext }
    );

    try {
      await expect(server.syncNativeTools()).resolves.toBeUndefined();
      const [listed] = server.listTools();
      expect(listed?.inputSchema).toEqual(objectSchema);

      objectSchema.properties.value.type = 'number';
      expect(listed?.inputSchema).toEqual({
        type: 'object',
        properties: { value: { type: 'string' } },
      });
    } finally {
      await server.close();
    }
  });

  it('refreshes native tool identity and metadata through MCP reconciliation', async () => {
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
      { native: nativeContext as unknown as ModelContext }
    );
    const client = new Client(
      { name: 'native-refresh-client', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } }
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.syncNativeTools();
    await server.connect(serverTransport);

    try {
      await client.connect(clientTransport);
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
      { native: nativeContext as unknown as ModelContext }
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.syncNativeTools();
    await server.connect(serverTransport);
    const client = new Client(
      { name: 'native-cancellation-client', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } }
    );
    const controller = new AbortController();

    try {
      await client.connect(clientTransport);
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
    } as unknown as ModelContext;
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
        } as unknown as ModelContext,
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
    } as unknown as ModelContext;
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
    } as unknown as ModelContext;
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
    } as unknown as ModelContext;
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

describe('BrowserMcpServer exposedTo', () => {
  /** InMemoryTransport plus the peer-origin surface IframeChildTransport reports. */
  function withPeerOrigin<T extends object>(transport: T, origin?: string) {
    return Object.assign(transport, {
      clientOrigin: origin,
      onclientorigin: undefined as ((origin: string) => void) | undefined,
    });
  }

  async function connectPair(origin?: string) {
    const server = new BrowserMcpServer({ name: 'exposure-test', version: '1.0.0' });
    const client = new Client(
      { name: 'exposure-test-client', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } }
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const peered = withPeerOrigin(serverTransport, origin);
    await server.connect(peered);
    await client.connect(clientTransport);
    return { server, client, peered };
  }

  const restricted = {
    name: 'restricted_tool',
    description: 'Only for the named embedder',
    execute: async () => 'ok',
  };

  it('hides a restricted tool from an embedder outside its allowlist', async () => {
    const { server, client } = await connectPair('https://other.example');
    try {
      await server.registerTool(restricted, { exposedTo: ['https://parent.example'] });
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).not.toContain('restricted_tool');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('exposes a restricted tool to the embedder named in exposedTo', async () => {
    const { server, client } = await connectPair('https://parent.example');
    try {
      await server.registerTool(restricted, { exposedTo: ['https://parent.example'] });
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toContain('restricted_tool');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('leaves tools registered without exposedTo visible to any embedder', async () => {
    const { server, client } = await connectPair('https://other.example');
    try {
      await server.registerTool({
        name: 'open_tool',
        description: 'No allowlist',
        execute: async () => 'ok',
      });
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toContain('open_tool');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('fails closed when the transport never names a peer', async () => {
    const server = new BrowserMcpServer({ name: 'exposure-test', version: '1.0.0' });
    const client = new Client(
      { name: 'exposure-test-client', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } }
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      await server.registerTool(restricted, { exposedTo: ['https://parent.example'] });
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).not.toContain('restricted_tool');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('exposes a tool registered before the peer origin is known', async () => {
    const { server, client, peered } = await connectPair();
    try {
      await server.registerTool(restricted, { exposedTo: ['https://parent.example'] });
      const before = await client.listTools();
      expect(before.tools.map((tool) => tool.name)).not.toContain('restricted_tool');

      peered.onclientorigin?.('https://parent.example');

      const after = await client.listTools();
      expect(after.tools.map((tool) => tool.name)).toContain('restricted_tool');
    } finally {
      await client.close();
      await server.close();
    }
  });
});
