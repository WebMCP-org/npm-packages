import { normalizeInputSchema, normalizeToolResponse } from './schema.js';
import type { ModelContext, RegisteredTool } from './model-context.js';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Transport } from '@modelcontextprotocol/server';
import type { WebMcpToolInput } from './common.js';
import type { BrowserMcpServerOptions, PeerOriginTransport } from './browser-server.js';
import { inputRequired } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { BrowserMcpServer, isBrowserMcpServer, type ResourceDescriptor } from './browser-server.js';

function isCountThree(value: unknown): value is { count: 3 } {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'count' in value &&
    value.count === 3
  );
}

describe('protocol response compatibility', () => {
  it('passes a JSON-safe MCP result through unchanged', () => {
    const response = {
      content: [
        { type: 'text', text: 'done' },
        { type: 'resource_link', uri: 'https://example.com/report', name: 'report' },
      ],
      structuredContent: { version: 3 },
      isError: false,
      _meta: { extension: 'future' },
    };
    expect(normalizeToolResponse(response)).toBe(response);
  });

  it('normalizes objects outside the MCP content types as ordinary tool values', () => {
    const richText = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    };
    expect(normalizeToolResponse(richText)).toEqual({
      content: [{ type: 'text', text: JSON.stringify(richText) }],
      structuredContent: richText,
      isError: false,
    });
  });

  it('normalizes malformed protocol envelopes as ordinary tool values', () => {
    const response = { content: [{ type: 7, payload: 'not a discriminated block' }] };
    expect(normalizeToolResponse(response)).toEqual({
      content: [{ type: 'text', text: JSON.stringify(response) }],
      structuredContent: response,
      isError: false,
    });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** A server that closes after the test. */
function createServer(name: string, options?: BrowserMcpServerOptions): BrowserMcpServer {
  const server = new BrowserMcpServer({ name, version: '1.0.0' }, options);
  onTestFinished(() => server.close());
  return server;
}

/** An MCP client, closed after the test, and both ends of its in-memory link. */
function linkClient() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } }
  );
  onTestFinished(() => client.close());
  return { client, clientTransport, serverTransport };
}

async function connectClient(server: BrowserMcpServer): Promise<Client> {
  const { client, clientTransport, serverTransport } = linkClient();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
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

type NativeToolDictionary = Parameters<ModelContext['registerTool']>[0];

/** A native context that accepts registrations and lists nothing unless overridden. */
function createNativeContext(
  overrides: Partial<Pick<ModelContext, 'registerTool' | 'getTools' | 'executeTool'>> = {}
): ModelContext {
  return Object.assign(new EventTarget(), {
    ontoolchange: null,
    registerTool: async () => {},
    getTools: async () => [],
    executeTool: async () => {
      throw new Error('Unexpected native execution');
    },
    ...overrides,
  });
}

function registeredTool(name: string, overrides: Partial<RegisteredTool> = {}): RegisteredTool {
  return { name, title: '', description: name, origin: location.origin, window, ...overrides };
}

/** The browser runner frames this document; `parent` is replaceable, `top` is not. */
function asTopLevelWindow(): void {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'parent');
  if (!descriptor) throw new Error('window.parent is not an own property');
  Object.defineProperty(window, 'parent', { configurable: true, value: window });
  onTestFinished(() => {
    Object.defineProperty(window, 'parent', descriptor);
  });
}

/** Appends an iframe to `host` until the test finishes. */
function createFrame(host: Document = document) {
  const iframe = host.createElement('iframe');
  host.body.appendChild(iframe);
  onTestFinished(() => iframe.remove());
  const frameWindow = iframe.contentWindow;
  if (!frameWindow) throw new Error('The frame has no window');
  return { frameWindow, remove: () => iframe.remove() };
}

describe('BrowserMcpServer', () => {
  it.each(['', 'text', 7, false, null, { nested: true }])(
    'serializes the WebMCP result %j as JSON',
    async (result) => {
      const server = createServer('json-results');
      await server.registerTool({
        name: 'result',
        description: 'Returns a value',
        execute: () => result,
      });
      await expect(executeRegisteredTool(server, 'result')).resolves.toBe(JSON.stringify(result));
    }
  );

  it('rejects legacy string input and results that cannot cross the JSON boundary', async () => {
    const server = createServer('object-input');
    await server.registerTool({
      name: 'echo',
      description: 'Echoes input',
      execute: (input) => input,
    });
    const [tool] = await server.getTools();
    if (!tool) throw new Error('Missing echo tool');
    // @ts-expect-error WebMCP accepts an input object, not serialized JSON.
    await expect(server.executeTool(tool, '{"value":1}')).rejects.toBeInstanceOf(TypeError);
    await expect(server.executeTool(tool, [1, 2])).resolves.toBe('[1,2]');
    await expect(server.executeTool(tool, { toJSON: () => undefined })).rejects.toBeInstanceOf(
      TypeError
    );
    await expect(server.executeTool(tool, { toJSON: () => 'primitive' })).rejects.toMatchObject({
      name: 'UnknownError',
    });
    await server.registerTool({
      name: 'undefined',
      description: 'Returns no JSON value',
      execute: () => undefined,
    });
    await expect(executeRegisteredTool(server, 'undefined')).rejects.toMatchObject({
      name: 'UnknownError',
    });
  });

  it('narrows branded model contexts', () => {
    expect(isBrowserMcpServer(createServer('guard-test'))).toBe(true);
    expect(isBrowserMcpServer(undefined)).toBe(false);
  });

  it('uses Web IDL callback semantics and preserves execution errors', async () => {
    const server = createServer('execution-test');
    await server.registerTool({
      name: 'receiver',
      description: 'Captures its receiver',
      async execute(this: undefined) {
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

    await expect(executeRegisteredTool(server, 'receiver')).resolves.toBe('{"ok":true}');
    await expect(executeRegisteredTool(server, 'failure')).rejects.toMatchObject({
      name: 'UnknownError',
      message: 'Tool execution failed',
    });
  });

  it('preserves known annotations and returns detached tool metadata', async () => {
    const server = createServer('metadata-test');
    // @ts-expect-error Web IDL accepts a null options dictionary at runtime.
    await server.registerTool(
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
      null
    );

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
    const native = createNativeContext({
      registerTool: () =>
        accepted.then(() => {
          native.dispatchEvent(new Event('toolchange'));
        }),
      getTools: async () => [registeredTool('accepted')],
    });
    const server = createServer('native-staging-test', { native });
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
  });

  it('allows an aborted pending native tool to be registered again immediately', async () => {
    const resolveNativeRegistrations: Array<() => void> = [];
    const server = createServer('native-abort-test', {
      native: createNativeContext({
        registerTool: () =>
          new Promise<void>((resolve) => resolveNativeRegistrations.push(resolve)),
      }),
    });
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

  it('keeps the MCP tool when Permissions Policy blocks the native mirror', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    onTestFinished(() => warn.mockRestore());
    const server = createServer('native-policy-test', {
      native: createNativeContext({
        registerTool: () =>
          Promise.reject(
            new DOMException('WebMCP is disabled by Permissions Policy', 'NotAllowedError')
          ),
      }),
    });

    await server.registerTool({
      name: 'framed_tool',
      description: 'Registered in a frame without allow="tools"',
      execute: () => 'ok',
    });

    expect(server.listTools().map(({ name }) => name)).toEqual(['framed_tool']);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('backfills an existing native tool after native registration rejects', async () => {
    const nativeFailure = new DOMException('Tool already registered', 'InvalidStateError');
    const server = createServer('native-rejection-test', {
      native: createNativeContext({
        registerTool: () => Promise.reject(nativeFailure),
        getTools: async () => [registeredTool('native_tool')],
      }),
    });

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
    const server = createServer('publication-abort-test');
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
    const server = createServer('close-test');
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
    await expect(server.executeTool(tool!, {})).rejects.toMatchObject({
      name: 'InvalidStateError',
    });
  });

  it('supports dynamic MCP registrations but rejects multi-round WebMCP tools', async () => {
    const server = createServer('mcp-test');
    const client = await connectClient(server);

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

  it('delegates discovery ordering, title defaults, and parsed schemas to upstream', async () => {
    const server = createServer('discovery-test');
    const schema = { type: 'object', properties: { value: { type: 'string' } } } as const;
    await server.registerTool({
      name: 'z_tool',
      description: 'z_tool',
      inputSchema: schema,
      async execute() {},
    });
    await server.registerTool({ name: 'a_tool', description: 'a_tool', async execute() {} });

    expect(
      (await server.getTools()).map(({ name, title, inputSchema }) => ({
        name,
        title,
        inputSchema,
      }))
    ).toEqual([
      { name: 'a_tool', title: '', inputSchema: undefined },
      { name: 'z_tool', title: '', inputSchema: schema },
    ]);
  });

  it('exposes URI templates through the MCP resource template contract', async () => {
    const server = createServer('resource-template-test');
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
    const client = await connectClient(server);

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
  });

  it('delegates Standard Schema validation to the MCP server and rejects input-required results', async () => {
    const standardSchema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate(value: Parameters<StandardSchemaV1['~standard']['validate']>[0]) {
          return isCountThree(value)
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
    const server = createServer('input-required-test');
    let validatedCount: unknown;
    await server.registerTool({
      name: 'webmcp_input_required',
      description: 'Attempts an unsupported multi-round WebMCP flow',
      inputSchema: normalizeInputSchema(standardSchema).inputSchema,
      async execute({ count }: { count?: unknown }) {
        validatedCount = count;
        return inputRequired({ requestState: 'opaque-state' });
      },
    });
    const client = await connectClient(server);

    const result = await client.callTool({
      name: 'webmcp_input_required',
      arguments: { count: 3 },
    });
    expect(validatedCount).toBe(4);
    expect(result).toMatchObject({ isError: true });
    await expect(
      executeRegisteredTool(server, 'webmcp_input_required', { count: 3 })
    ).resolves.toContain('input_required');
  });

  it('mirrors Standard Schema inputs to native as plain JSON Schema', async () => {
    const server = createServer('standard-schema-native-mirror-test');
    const jsonSchema = {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    };

    await server.registerTool({
      name: 'standard_schema_native_mirror',
      description: 'Mirrors converted schema metadata',
      inputSchema: {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate(value: Parameters<StandardSchemaV1['~standard']['validate']>[0]) {
            return { value };
          },
          jsonSchema: {
            input: () => jsonSchema,
            output: () => ({ type: 'object', properties: {} }),
          },
        },
      },
      async execute() {
        return 'ok';
      },
    });

    const [tool] = await server.getTools();
    expect(tool?.inputSchema).toEqual(jsonSchema);
  });

  it('preserves ontoolchange ordering across replacement and removal', () => {
    const server = createServer('event-order-test');
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
    // @ts-expect-error External JavaScript may assign a non-callable EventHandler value.
    server.ontoolchange = {};
    expect(server.ontoolchange).toBeNull();
  });

  it('cancels the upstream registration when close wins its notification race', async () => {
    const server = createServer('close-race-test');
    const listener = vi.fn();
    server.addEventListener('toolchange', listener);
    const registration = server.registerTool({
      name: 'close_race_tool',
      description: 'Closes while registration is pending',
      async execute() {},
    });
    const rejection = expect(registration).rejects.toMatchObject({ name: 'AbortError' });

    await Promise.resolve();
    await server.close();

    await rejection;
    expect(listener).not.toHaveBeenCalled();
    expect(server.listTools()).toEqual([]);
  });

  it('cleans up a native mirror when native registration closes the wrapper', async () => {
    const nativeTools = new Set<string>();
    let closing!: Promise<void>;
    const server = createServer('native-close-race-test', {
      native: createNativeContext({
        async registerTool(tool: { name: string }, options?: { signal?: AbortSignal }) {
          nativeTools.add(tool.name);
          options?.signal?.addEventListener('abort', () => nativeTools.delete(tool.name), {
            once: true,
          });
          closing = server.close();
        },
      }),
    });

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
    const server = createServer('close-cleanup-test', {
      native: createNativeContext({
        async registerTool(tool: { name: string }, options?: { signal?: AbortSignal }) {
          nativeTools.set(tool.name, tool);
          options?.signal?.addEventListener('abort', () => nativeTools.delete(tool.name), {
            once: true,
          });
        },
      }),
    });
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

  it('preserves AbortSignal reasons for registration and upstream execution', async () => {
    const server = createServer('abort-reason-test');
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
    const execution = server.executeTool(tool!, {}, { signal: executionController.signal });
    executionController.abort(executionReason);
    await expect(execution).rejects.toBe(executionReason);
  });

  it('rejects invalid direct registrations and untrustworthy discovery origins', async () => {
    const server = createServer('registration-validation-test');

    await expect(
      server.registerTool({
        name: 'empty_description_tool',
        description: '',
        async execute() {},
      })
    ).rejects.toMatchObject({ name: 'InvalidStateError' });
    await expect(
      // @ts-expect-error External JavaScript can omit the required callback.
      server.registerTool({
        name: 'missing_execute_tool',
        description: 'Missing execute callback',
      })
    ).rejects.toBeInstanceOf(TypeError);
    await expect(server.getTools({ fromOrigins: ['not an origin'] })).rejects.toMatchObject({
      name: 'SecurityError',
    });

    expect(server.listTools()).toEqual([]);
  });

  it.each([
    ['submitted:/first', 'submitted:/first', undefined],
    ['', '', undefined],
    ['"quoted result"', 'quoted result', undefined],
    ['10.50', '10.50', undefined],
    ['true', 'true', undefined],
    ['[1]', '[1]', undefined],
    ['{"total":10.5}', '{"total":10.5}', { total: 10.5 }],
    ['{"content":[{"type":"text","text":"MCP result"}]}', 'MCP result', undefined],
  ])('converts native result %j into MCP content', async (result, text, structuredContent) => {
    const tool = registeredTool('native_result');
    const server = createServer('native-result-server', {
      native: createNativeContext({
        getTools: async () => [tool],
        executeTool: async () => result,
      }),
    });
    const client = await connectClient(server);
    await server.syncNativeTools();

    const response = await client.callTool({ name: tool.name, arguments: {} });
    expect(response).toMatchObject({ content: [{ type: 'text', text }] });
    expect(response.structuredContent).toEqual(structuredContent);
    await expect(server.executeTool(tool, {})).resolves.toBe(result);
  });

  it('mirrors only its own document when framed and its subtree when top-level', async () => {
    const { frameWindow: childWindow } = createFrame();
    // The browser runner hosts this test document in a frame. A sibling's
    // parent is that same host, rather than the document served by this server.
    const hostWindow = window.parent;
    const { frameWindow: siblingWindow } = createFrame(hostWindow.document);
    const tools = [
      registeredTool('own'),
      registeredTool('descendant', { window: childWindow }),
      registeredTool('ancestor', { window: hostWindow }),
      registeredTool('sibling', { window: siblingWindow }),
    ];
    const executeTool = vi.fn(async () => JSON.stringify({ ok: true }));
    const server = createServer('frame-scope-server', {
      native: createNativeContext({ getTools: async () => tools, executeTool }),
    });

    await server.syncNativeTools();
    expect(server.listTools().map(({ name }) => name)).toEqual(['own']);
    asTopLevelWindow();
    await server.syncNativeTools();
    expect(server.listTools().map(({ name }) => name)).toEqual(['own', 'descendant']);
    expect(await server.getTools()).toEqual(tools);
    const client = await connectClient(server);
    await client.callTool({ name: 'descendant', arguments: {} });
    expect(executeTool).toHaveBeenCalledWith(tools[1], {}, expect.any(Object));
  });

  it('lets a local registration take over a name mirrored from a child frame', async () => {
    asTopLevelWindow();
    const { frameWindow: childWindow } = createFrame();
    const nativeTools = [registeredTool('shared', { description: 'child', window: childWindow })];
    const executeTool = vi.fn(async () => '{"from":"child"}');
    const native = createNativeContext({
      async registerTool(tool: NativeToolDictionary) {
        nativeTools.push(registeredTool(tool.name, { description: tool.description }));
        native.dispatchEvent(new Event('toolchange'));
      },
      getTools: async () => [...nativeTools],
      executeTool,
    });
    const server = createServer('child-collision-server', { native });

    await server.syncNativeTools();
    expect(server.listTools()).toMatchObject([{ name: 'shared', description: 'child' }]);
    await server.registerTool({
      name: 'shared',
      description: 'parent',
      execute: () => ({ from: 'parent' }),
    });
    expect(server.listTools()).toMatchObject([{ name: 'shared', description: 'parent' }]);
    await server.syncNativeTools();
    expect(server.listTools()).toMatchObject([{ name: 'shared', description: 'parent' }]);

    const client = await connectClient(server);
    await expect(client.callTool({ name: 'shared', arguments: {} })).resolves.toMatchObject({
      structuredContent: { from: 'parent' },
    });
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('mirrors a child frame tool after the parent aborts its own registration of the name', async () => {
    asTopLevelWindow();
    const { frameWindow: childWindow } = createFrame();
    const childTool = registeredTool('shared', { description: 'child', window: childWindow });
    let ownTool: RegisteredTool | undefined;
    const native = createNativeContext({
      async registerTool(tool: NativeToolDictionary, options?: { signal?: AbortSignal }) {
        ownTool = registeredTool(tool.name, { description: tool.description });
        options?.signal?.addEventListener(
          'abort',
          () => {
            ownTool = undefined;
            native.dispatchEvent(new Event('toolchange'));
          },
          { once: true }
        );
        native.dispatchEvent(new Event('toolchange'));
      },
      getTools: async () => (ownTool ? [ownTool, childTool] : [childTool]),
    });
    const server = createServer('child-takeover-server', { native });
    const controller = new AbortController();

    await server.registerTool(
      { name: 'shared', description: 'parent', execute: () => ({}) },
      { signal: controller.signal }
    );
    expect(server.listTools()).toMatchObject([{ name: 'shared', description: 'parent' }]);

    controller.abort();
    await vi.waitFor(() =>
      expect(server.listTools()).toMatchObject([{ name: 'shared', description: 'child' }])
    );
  });

  it('drops a child frame mirror after a call fails because the frame was removed', async () => {
    asTopLevelWindow();
    const { frameWindow: childWindow, remove: removeChildFrame } = createFrame();
    const childTool = registeredTool('removed_frame_tool', { window: childWindow });
    const server = createServer('removed-frame-server', {
      native: createNativeContext({
        getTools: async () => (childWindow.closed ? [] : [childTool]),
        executeTool: async () => {
          throw new DOMException('Tool execution failed', 'UnknownError');
        },
      }),
    });
    const order: string[] = [];
    server.addEventListener('toolchange', () => order.push('toolchange'));

    await server.syncNativeTools();
    expect(server.listTools().map(({ name }) => name)).toEqual(['removed_frame_tool']);
    const client = await connectClient(server);

    removeChildFrame();
    expect(childWindow.closed).toBe(true);
    await expect(
      client.callTool({ name: 'removed_frame_tool', arguments: {} })
    ).resolves.toMatchObject({
      isError: true,
      content: [{ type: 'text', text: expect.stringContaining('Tool execution failed') }],
    });
    await vi.waitFor(() => expect(server.listTools()).toEqual([]));
    await expect.poll(() => order).toEqual(['toolchange']);
  });

  it('re-dispatches native lifecycle events and exposes their handlers', async () => {
    const native = createNativeContext();
    const server = createServer('lifecycle-server', { native });
    const seen: Array<{ type: string; toolName: unknown; target: boolean; self: boolean }> = [];
    const lifecycleEvent = (type: string, toolName: string) => {
      const event = new Event(type);
      Object.defineProperty(event, 'toolName', { enumerable: true, value: toolName });
      return event;
    };
    const onActivated = function (this: ModelContext, event: Event) {
      seen.push({
        type: event.type,
        toolName: Object.getOwnPropertyDescriptor(event, 'toolName')?.value,
        target: event.target === server,
        self: this === server,
      });
    };
    server.ontoolactivated = onActivated;
    server.addEventListener('toolcancel', (event) => {
      seen.push({
        type: event.type,
        toolName: Object.getOwnPropertyDescriptor(event, 'toolName')?.value,
        target: event.target === server,
        self: true,
      });
    });

    native.dispatchEvent(lifecycleEvent('toolactivated', 'checkout'));
    native.dispatchEvent(lifecycleEvent('toolcancel', 'checkout'));
    expect(seen).toEqual([
      { type: 'toolactivated', toolName: 'checkout', target: true, self: true },
      { type: 'toolcancel', toolName: 'checkout', target: true, self: true },
    ]);
    expect(server.ontoolactivated).toBe(onActivated);
    expect(server.ontoolcancel).toBeNull();
    server.ontoolactivated = null;
    expect(server.ontoolactivated).toBeNull();

    await server.close();
    native.dispatchEvent(lifecycleEvent('toolcancel', 'checkout'));
    expect(seen).toHaveLength(2);
  });

  it('does not repopulate tools when close races with native getTools', async () => {
    let resolveGetTools!: (tools: RegisteredTool[]) => void;
    let markGetToolsStarted!: () => void;
    const getToolsStarted = new Promise<void>((resolve) => {
      markGetToolsStarted = resolve;
    });
    const server = createServer('native-close-race-server', {
      native: createNativeContext({
        getTools: () => {
          markGetToolsStarted();
          return new Promise<RegisteredTool[]>((resolve) => {
            resolveGetTools = resolve;
          });
        },
      }),
    });

    const sync = server.syncNativeTools();
    await getToolsStarted;
    const closing = server.close();
    resolveGetTools([
      registeredTool('late_native_tool', { inputSchema: { type: 'object', properties: {} } }),
    ]);

    await expect(sync).resolves.toBeUndefined();
    await closing;
    expect(server.listTools()).toEqual([]);
  });

  it('skips native tools whose schemas are malformed or cannot compile without blocking others', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const objectSchema = { type: 'object', properties: { value: { type: 'string' } } };
    const server = createServer('native-schema-isolation-server', {
      native: createNativeContext({
        getTools: async () => [
          registeredTool('a_bad_native_schema', {
            inputSchema: {
              $schema: 'https://json-schema.org/draft/2099-99/schema',
              type: 'object',
              properties: { value: { type: 'string' } },
            },
          }),
          registeredTool('array_schema_tool', { inputSchema: [] }),
          registeredTool('unserializable_schema_tool', {
            inputSchema: { toJSON: () => undefined },
          }),
          registeredTool('z_valid_native_schema', { inputSchema: objectSchema }),
        ],
      }),
    });

    await expect(server.syncNativeTools()).resolves.toBeUndefined();
    expect(server.listTools().map(({ name }) => name)).toEqual(['z_valid_native_schema']);
    expect(server.listTools()[0]?.inputSchema).toEqual(objectSchema);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('a_bad_native_schema'),
      expect.anything()
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('array_schema_tool'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unserializable_schema_tool'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('input schema is malformed'));
  });

  it('refreshes native tool identity and metadata through MCP reconciliation', async () => {
    const firstNativeTool = registeredTool('refreshable_native_tool', {
      description: 'Original metadata',
      inputSchema: { type: 'object', properties: {} },
    });
    let visibleNativeTool = firstNativeTool;
    const executedTools: RegisteredTool[] = [];
    const server = createServer('native-refresh-server', {
      native: createNativeContext({
        getTools: async () => [visibleNativeTool],
        executeTool: async (tool) => {
          executedTools.push(tool);
          return JSON.stringify({
            content: [{ type: 'text', text: tool === visibleNativeTool ? 'current' : 'stale' }],
          });
        },
      }),
    });

    await server.syncNativeTools();
    const client = await connectClient(server);
    await expect(
      client.callTool({ name: firstNativeTool.name, arguments: {} })
    ).resolves.toMatchObject({
      content: [{ type: 'text', text: 'current' }],
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
  });

  it('forwards MCP cancellation to a backfilled native tool', async () => {
    const nativeTool = registeredTool('cancellable_native_tool');
    let nativeSignal: AbortSignal | undefined;
    const server = createServer('native-cancellation-server', {
      native: createNativeContext({
        getTools: async () => [nativeTool],
        executeTool: (_tool, _input, options) => {
          nativeSignal = options?.signal;
          return new Promise((_, reject) => {
            nativeSignal?.addEventListener('abort', () => reject(nativeSignal?.reason), {
              once: true,
            });
          });
        },
      }),
    });
    await server.syncNativeTools();
    const client = await connectClient(server);
    const controller = new AbortController();

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
  });

  it('removes the native mirror when the registration signal aborts', async () => {
    const server = createServer('native-signal-test');
    const controller = new AbortController();

    await server.registerTool(
      {
        name: 'signal_only_native_tool',
        description: 'Native signal cleanup tool',
        async execute() {},
      },
      { signal: controller.signal }
    );
    expect((await server.getTools()).map(({ name }) => name)).toEqual(['signal_only_native_tool']);

    controller.abort();
    await expect(server.getTools()).resolves.toEqual([]);
    expect(server.listTools()).toEqual([]);
  });

  it('rolls back transport registration when async native registerTool rejects', async () => {
    let nativeCleanupSignal: AbortSignal | undefined;
    let nativeCleanupAbortCount = 0;
    const server = createServer('native-async-rejection-test', {
      native: createNativeContext({
        registerTool: (_tool: NativeToolDictionary, options?: { signal?: AbortSignal }) => {
          nativeCleanupSignal = options?.signal;
          nativeCleanupSignal?.addEventListener('abort', () => nativeCleanupAbortCount++, {
            once: true,
          });
          return Promise.reject(new Error('native async registration rejected'));
        },
      }),
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      server.registerTool({
        name: 'async_rejected_native_tool',
        description: 'Native registration rejects asynchronously',
        async execute() {},
      })
    ).rejects.toThrow('native async registration rejected');

    expect(nativeCleanupSignal?.aborted).toBe(true);
    expect(nativeCleanupAbortCount).toBe(1);
    expect(server.listTools()).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('preserves a caller abort reason when native registration rejects on cleanup', async () => {
    let nativeCleanupSignal: AbortSignal | undefined;
    const server = createServer('native-abort-rejection-test', {
      native: createNativeContext({
        registerTool: (_tool: NativeToolDictionary, options?: { signal?: AbortSignal }) => {
          nativeCleanupSignal = options?.signal;
          return new Promise<void>((_, reject) => {
            nativeCleanupSignal?.addEventListener(
              'abort',
              () => reject(new DOMException('signal is aborted without reason', 'AbortError')),
              { once: true }
            );
          });
        },
      }),
    });
    const controller = new AbortController();
    const reason = new Error('caller cancelled registration');

    const registration = server.registerTool(
      {
        name: 'native_abort_rejected_tool',
        description: 'Native registration rejects on cleanup abort',
        async execute() {},
      },
      { signal: controller.signal }
    );
    const rejection = expect(registration).rejects.toBe(reason);

    await vi.waitFor(() => expect(nativeCleanupSignal).toBeDefined());
    controller.abort(reason);

    await rejection;
    expect(server.listTools()).toEqual([]);
  });

  it('preserves WebMCP schemas across the MCP transport boundary', async () => {
    const server = createServer('schema-transport-server');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const outputSchema = {
      properties: { total: { type: 'number' } },
      required: ['total'],
    };

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
    expect(localTools.find((tool) => tool.name === 'primitive_output_tool')?.outputSchema).toEqual({
      type: 'string',
    });
    expect(localTools.map(({ name }) => name)).toContain('array_input_tool');
    expect(
      localTools.find((tool) => tool.name === 'object_output_without_root_type_tool')?.outputSchema
    ).toEqual({
      properties: { total: { type: 'number' } },
      required: ['total'],
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('MCP input schemas require'));
    await expect(executeRegisteredTool(server, 'array_input_tool', [1, 2, 3])).resolves.toBe(
      '[1,2,3]'
    );

    const client = await connectClient(server);
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
  });
});

describe('BrowserMcpServer exposedTo', () => {
  /** InMemoryTransport plus the peer-origin surface IframeChildTransport reports. */
  function withPeerOrigin<T extends Transport>(transport: T, origin?: string) {
    const peer: Pick<PeerOriginTransport, 'clientOrigin' | 'onclientorigin'> = {
      clientOrigin: origin,
      onclientorigin: undefined,
    };
    return Object.assign(transport, peer);
  }

  async function connectPair(origin?: string) {
    const server = createServer('exposure-test');
    const { client, clientTransport, serverTransport } = linkClient();
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

  it.each([
    ['https://parent.example', true],
    ['https://other.example', false],
  ])('%s sees a tool exposed to https://parent.example: %s', async (origin, visible) => {
    const { server, client } = await connectPair(origin);
    await server.registerTool(restricted, { exposedTo: ['https://parent.example'] });
    const { tools } = await client.listTools();
    expect(tools.some((tool) => tool.name === restricted.name)).toBe(visible);
  });

  it('leaves tools registered without exposedTo visible to any embedder', async () => {
    const { server, client } = await connectPair('https://other.example');
    await server.registerTool({
      name: 'open_tool',
      description: 'No allowlist',
      execute: async () => 'ok',
    });
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain('open_tool');
  });

  it('snapshots the exposure allowlist before registration yields', async () => {
    const { server, client, peered } = await connectPair('https://other.example');
    const exposedTo = ['https://parent.example'];
    const registration = server.registerTool(restricted, { exposedTo });
    exposedTo[0] = 'https://other.example';
    await registration;
    peered.onclientorigin?.('https://other.example');
    expect((await client.listTools()).tools).toEqual([]);
    await expect(client.callTool({ name: restricted.name })).rejects.toThrow('disabled');
  });

  it('matches exposure URLs by their parsed origin', async () => {
    const { server, client } = await connectPair('https://parent.example');
    await server.registerTool(restricted, { exposedTo: ['https://PARENT.example:443/path'] });
    expect((await client.listTools()).tools.map(({ name }) => name)).toContain(restricted.name);
  });

  it('never exposes a restricted tool to an opaque peer', async () => {
    const { server, client, peered } = await connectPair('null');
    await server.registerTool(restricted, { exposedTo: ['https://parent.example'] });
    peered.onclientorigin?.('null');
    expect((await client.listTools()).tools).toEqual([]);
    await expect(client.callTool({ name: restricted.name })).rejects.toThrow('disabled');
  });

  it.each([
    'http://example.com',
    'not an origin',
    'file:///trusted/tool.html',
    'chrome-extension://abcdefghijklmnop',
    'moz-extension://abcdefghijklmnop',
  ])(
    'rejects exposure origins the upstream context refuses before publishing: %s',
    async (origin) => {
      const { server, client } = await connectPair(origin);
      await expect(server.registerTool(restricted, { exposedTo: [origin] })).rejects.toMatchObject({
        name: 'SecurityError',
      });
      expect(server.listTools()).toEqual([]);
      expect((await client.listTools()).tools).toEqual([]);
    }
  );

  it('forgets the previous peer when reconnecting to an unidentified transport', async () => {
    const { server, client, peered } = await connectPair('https://parent.example');
    await server.registerTool(restricted, { exposedTo: ['https://parent.example'] });
    expect((await client.listTools()).tools.map(({ name }) => name)).toContain(restricted.name);
    const previousOriginCallback = peered.onclientorigin;
    await client.close();
    await server.mcpServer.close();

    const next = linkClient();
    await server.connect(next.serverTransport);
    await next.client.connect(next.clientTransport);
    previousOriginCallback?.('https://parent.example');
    expect((await next.client.listTools()).tools).toEqual([]);
    await expect(next.client.callTool({ name: restricted.name })).rejects.toThrow('disabled');
  });

  it.each([false, true])(
    'rejects a second connection before changing the existing peer (start fails: %s)',
    async (failStart) => {
      const { server, client } = await connectPair('https://other.example');
      const [, replacementTransport] = InMemoryTransport.createLinkedPair();
      const replacement = withPeerOrigin(replacementTransport, 'https://parent.example');
      const start = vi.spyOn(replacement, 'start');
      if (failStart) start.mockRejectedValue(new Error('replacement failed'));

      await server.registerTool(restricted, { exposedTo: ['https://parent.example'] });
      await expect(server.connect(replacement)).rejects.toMatchObject({
        name: 'InvalidStateError',
      });
      expect(start).not.toHaveBeenCalled();
      expect((await client.listTools()).tools).toEqual([]);
      await expect(client.callTool({ name: restricted.name })).rejects.toThrow('disabled');
    }
  );

  it('cleans up a failed connection before retrying with another peer', async () => {
    const server = createServer('failed-exposure-test');
    const [, failedTransport] = InMemoryTransport.createLinkedPair();
    const failed = withPeerOrigin(failedTransport, 'https://parent.example');
    let lateOrigin: typeof failed.onclientorigin;
    failed.start = async () => {
      lateOrigin = failed.onclientorigin;
      throw new Error('transport failed');
    };
    await server.registerTool(restricted, { exposedTo: ['https://parent.example'] });
    await expect(server.connect(failed)).rejects.toThrow('transport failed');
    expect(server.mcpServer.server.transport).toBeUndefined();
    expect(failed.onclientorigin).toBeUndefined();

    const { client, clientTransport, serverTransport } = linkClient();
    await server.connect(withPeerOrigin(serverTransport, 'https://other.example'));
    await client.connect(clientTransport);
    lateOrigin?.('https://parent.example');
    expect((await client.listTools()).tools).toEqual([]);
    await expect(client.callTool({ name: restricted.name })).rejects.toThrow('disabled');
  });

  it('does not tear down a new connection when a closed transport rejects late', async () => {
    const server = createServer('late-failure-test');
    const [, failedTransport] = InMemoryTransport.createLinkedPair();
    const failed = withPeerOrigin(failedTransport, 'https://other.example');
    let rejectStart!: (reason: Error) => void;
    failed.start = () =>
      new Promise<void>((_, reject) => {
        rejectStart = reject;
      });
    await server.registerTool(restricted, { exposedTo: ['https://parent.example'] });
    const connecting = server.connect(failed);
    await failed.close();

    const { client, clientTransport, serverTransport } = linkClient();
    await server.connect(withPeerOrigin(serverTransport, 'https://parent.example'));
    await client.connect(clientTransport);
    rejectStart(new Error('late start failure'));
    await expect(connecting).rejects.toThrow('late start failure');
    expect((await client.listTools()).tools.map(({ name }) => name)).toContain(restricted.name);
    expect(await client.callTool({ name: restricted.name })).toMatchObject({
      content: [{ type: 'text', text: 'ok' }],
    });
  });

  it('fails closed when the transport never names a peer', async () => {
    const server = createServer('exposure-test');
    const client = await connectClient(server);
    await server.registerTool(restricted, { exposedTo: ['https://parent.example'] });
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).not.toContain('restricted_tool');
  });

  it('exposes a tool registered before the peer origin is known', async () => {
    const { server, client, peered } = await connectPair();
    await server.registerTool(restricted, { exposedTo: ['https://parent.example'] });
    const before = await client.listTools();
    expect(before.tools.map((tool) => tool.name)).not.toContain('restricted_tool');

    peered.onclientorigin?.('https://parent.example');

    const after = await client.listTools();
    expect(after.tools.map((tool) => tool.name)).toContain('restricted_tool');
  });
});
