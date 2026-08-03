import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { inputRequired } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';
import { BrowserMcpServer, isBrowserMcpServer } from './browser-server.js';

let server: BrowserMcpServer | undefined;
let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  await server?.close();
  client = undefined;
  server = undefined;
});

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
});
