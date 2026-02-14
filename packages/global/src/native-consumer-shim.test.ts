import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupWebModelContext, initializeWebModelContext } from './global.js';
import type {
  InputSchema,
  MCPBridge,
  ModelContext,
  ModelContextClient,
  ModelContextTesting,
  ToolListItem,
} from './types.js';

interface NativeToolDefinition {
  name: string;
  description: string;
  inputSchema: InputSchema;
  execute: (args: Record<string, unknown>, client: ModelContextClient) => Promise<unknown>;
}

class NativeModelContextMock extends EventTarget {
  private tools = new Map<string, NativeToolDefinition>();
  private onMutation?: () => void;

  setMutationListener(listener?: () => void): void {
    this.onMutation = listener;
  }

  private notifyMutation(): void {
    this.onMutation?.();
  }

  provideContext(context: { tools?: NativeToolDefinition[] }): void {
    this.tools.clear();
    for (const tool of context.tools ?? []) {
      this.tools.set(tool.name, tool);
    }
    this.notifyMutation();
  }

  registerTool(tool: NativeToolDefinition): void {
    this.tools.set(tool.name, tool);
    this.notifyMutation();
  }

  unregisterTool(name: string): void {
    this.tools.delete(name);
    this.notifyMutation();
  }

  listTools(): ToolListItem[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  clearContext(): void {
    this.tools.clear();
    this.notifyMutation();
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    let clientActive = true;
    try {
      const client: ModelContextClient = {
        requestUserInteraction: async (callback: () => Promise<unknown>) => {
          if (!clientActive) {
            throw new Error(
              `ModelContextClient for tool "${name}" is no longer active after execute() resolved`
            );
          }
          if (typeof callback !== 'function') {
            throw new TypeError('requestUserInteraction(callback) requires a function callback');
          }
          return callback();
        },
      };

      return await tool.execute(args, client);
    } finally {
      clientActive = false;
    }
  }

  registerResource(): { unregister: () => void } {
    return { unregister: () => {} };
  }

  unregisterResource(): void {}

  listResources(): [] {
    return [];
  }

  listResourceTemplates(): [] {
    return [];
  }

  registerPrompt(): { unregister: () => void } {
    return { unregister: () => {} };
  }

  unregisterPrompt(): void {}

  listPrompts(): [] {
    return [];
  }

  async createMessage(): Promise<never> {
    throw new Error('not supported');
  }

  async elicitInput(): Promise<never> {
    throw new Error('not supported');
  }
}

class NativeModelContextTestingMock {
  private callback: (() => void) | null = null;
  public executeToolCalls: Array<{ toolName: string; inputArgsJson: string }> = [];

  constructor(private modelContext: NativeModelContextMock) {}

  notifyToolsChanged(): void {
    this.callback?.();
  }

  async executeTool(
    toolName: string,
    inputArgsJson: string,
    _options?: { signal?: AbortSignal }
  ): Promise<string | null> {
    this.executeToolCalls.push({ toolName, inputArgsJson });
    const args = JSON.parse(inputArgsJson) as Record<string, unknown>;
    const result = await this.modelContext.executeTool(toolName, args);
    if (result === null || result === undefined) {
      return null;
    }

    return JSON.stringify(result);
  }

  listTools(): Array<{ name: string; description: string; inputSchema: string }> {
    return this.modelContext.listTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: JSON.stringify(tool.inputSchema),
    }));
  }

  registerToolsChangedCallback(callback: () => void): void {
    if (typeof callback !== 'function') {
      throw new TypeError('registerToolsChangedCallback callback must be a function');
    }
    this.callback = callback;
  }

  async getCrossDocumentScriptToolResult(): Promise<string> {
    return '[]';
  }

  getToolCalls(): Array<{
    toolName: string;
    arguments: Record<string, unknown>;
    timestamp: number;
  }> {
    return [];
  }

  clearToolCalls(): void {}

  setMockToolResponse(): void {}

  clearMockToolResponse(): void {}

  clearAllMockToolResponses(): void {}

  getRegisteredTools(): ToolListItem[] {
    return this.modelContext.listTools();
  }

  reset(): void {}
}

function flushMicrotasks(count = 1): Promise<void> {
  let promise = Promise.resolve();
  for (let i = 0; i < count; i += 1) {
    promise = promise.then(() => Promise.resolve());
  }
  return promise;
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

  if (!bridge) {
    return;
  }

  const wrap = (server?: { notification?: (...args: unknown[]) => Promise<unknown> }) => {
    if (!server?.notification) {
      return;
    }
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

function requireBridge(): MCPBridge {
  const bridge = (window as unknown as { __mcpBridge?: MCPBridge }).__mcpBridge;
  if (!bridge) {
    throw new Error('Expected __mcpBridge to be initialized');
  }
  return bridge;
}

const NATIVE_TEST_INIT_OPTIONS = {
  transport: {
    tabServer: {
      allowedOrigins: [window.location.origin],
    },
    iframeServer: false,
  },
} as const;

describe('Native consumer shim (no modelContextTesting)', () => {
  let originalModelContextDescriptor: PropertyDescriptor | undefined;
  let originalModelContextTestingDescriptor: PropertyDescriptor | undefined;
  let nativeModelContext: NativeModelContextMock;

  beforeEach(() => {
    originalModelContextDescriptor = Object.getOwnPropertyDescriptor(
      window.navigator,
      'modelContext'
    );
    originalModelContextTestingDescriptor = Object.getOwnPropertyDescriptor(
      window.navigator,
      'modelContextTesting'
    );

    try {
      cleanupWebModelContext();
    } catch {
      // If modelContext is non-configurable in the runtime, descriptor restoration below handles it.
    }

    nativeModelContext = new NativeModelContextMock();
    Object.defineProperty(window.navigator, 'modelContext', {
      value: nativeModelContext as unknown as ModelContext,
      writable: true,
      configurable: true,
    });

    delete (window.navigator as unknown as { modelContextTesting?: unknown }).modelContextTesting;
    delete (window as unknown as { __mcpBridge?: unknown }).__mcpBridge;
    delete (window as unknown as { __mcpBridgeInitState?: unknown }).__mcpBridgeInitState;
  });

  afterEach(() => {
    delete (window as unknown as { __mcpBridge?: unknown }).__mcpBridge;
    delete (window as unknown as { __mcpBridgeInitState?: unknown }).__mcpBridgeInitState;

    if (originalModelContextDescriptor) {
      Object.defineProperty(window.navigator, 'modelContext', originalModelContextDescriptor);
    } else {
      delete (window.navigator as unknown as { modelContext?: unknown }).modelContext;
    }

    if (originalModelContextTestingDescriptor) {
      Object.defineProperty(
        window.navigator,
        'modelContextTesting',
        originalModelContextTestingDescriptor
      );
    } else {
      delete (window.navigator as unknown as { modelContextTesting?: unknown }).modelContextTesting;
    }
  });

  it('initializes when native modelContext exists without modelContextTesting', () => {
    expect(() => initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS)).not.toThrow();
    expect(navigator.modelContext).toBeDefined();
  });

  it('creates __mcpBridge when initialized without modelContextTesting', () => {
    initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS);
    expect((window as unknown as { __mcpBridge?: unknown }).__mcpBridge).toBeDefined();
  });

  it('is idempotent across repeated initialization in native-without-testing mode', async () => {
    initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS);

    const firstBridge = (window as unknown as { __mcpBridge?: unknown }).__mcpBridge;
    const firstInitState = window.__mcpBridgeInitState;

    initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS);

    expect((window as unknown as { __mcpBridge?: unknown }).__mcpBridge).toBe(firstBridge);
    expect(window.__mcpBridgeInitState).toEqual(firstInitState);

    navigator.modelContext?.registerTool({
      name: 'native_no_testing_after_reinit',
      description: 'native-no-testing reinit parity',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    });

    await flushMicrotasks(2);
    expect(navigator.modelContext?.listTools().map((tool) => tool.name)).toContain(
      'native_no_testing_after_reinit'
    );
  });

  it('installs listTools stub when native modelContext does not provide it', async () => {
    Object.defineProperty(nativeModelContext, 'listTools', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS);

    const context = navigator.modelContext as ModelContext & {
      listTools?: () => ToolListItem[];
    };

    expect(typeof context.listTools).toBe('function');

    context.registerTool({
      name: 'native_stubbed_list_tools',
      description: 'Stubbed listTools parity check',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    });

    await flushMicrotasks(2);

    expect(context.listTools?.().map((tool) => tool.name)).toContain('native_stubbed_list_tools');
  });
});

describe('Native adapter (with modelContextTesting)', () => {
  let originalModelContextDescriptor: PropertyDescriptor | undefined;
  let originalModelContextTestingDescriptor: PropertyDescriptor | undefined;
  let nativeModelContext: NativeModelContextMock;
  let nativeTesting: NativeModelContextTestingMock;

  beforeEach(() => {
    originalModelContextDescriptor = Object.getOwnPropertyDescriptor(
      window.navigator,
      'modelContext'
    );
    originalModelContextTestingDescriptor = Object.getOwnPropertyDescriptor(
      window.navigator,
      'modelContextTesting'
    );

    try {
      cleanupWebModelContext();
    } catch {
      // If modelContext is non-configurable in the runtime, descriptor restoration below handles it.
    }

    nativeModelContext = new NativeModelContextMock();
    nativeTesting = new NativeModelContextTestingMock(nativeModelContext);
    nativeModelContext.setMutationListener(() => nativeTesting.notifyToolsChanged());

    Object.defineProperty(window.navigator, 'modelContext', {
      value: nativeModelContext as unknown as ModelContext,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window.navigator, 'modelContextTesting', {
      value: nativeTesting as unknown as ModelContextTesting,
      writable: true,
      configurable: true,
    });

    delete (window as unknown as { __mcpBridge?: unknown }).__mcpBridge;
    delete (window as unknown as { __mcpBridgeInitState?: unknown }).__mcpBridgeInitState;
  });

  afterEach(() => {
    delete (window as unknown as { __mcpBridge?: unknown }).__mcpBridge;
    delete (window as unknown as { __mcpBridgeInitState?: unknown }).__mcpBridgeInitState;

    if (originalModelContextDescriptor) {
      Object.defineProperty(window.navigator, 'modelContext', originalModelContextDescriptor);
    } else {
      delete (window.navigator as unknown as { modelContext?: unknown }).modelContext;
    }

    if (originalModelContextTestingDescriptor) {
      Object.defineProperty(
        window.navigator,
        'modelContextTesting',
        originalModelContextTestingDescriptor
      );
    } else {
      delete (window.navigator as unknown as { modelContextTesting?: unknown }).modelContextTesting;
    }
  });

  it('routes execution through modelContextTesting.executeTool with JSON args', async () => {
    nativeModelContext.registerTool({
      name: 'native_testing_fallback',
      description: 'Testing fallback path',
      inputSchema: { type: 'object', properties: { value: { type: 'number' } } },
      execute: async ({ value }) => `value:${value}`,
    });

    initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS);

    const result = await navigator.modelContext?.callTool({
      name: 'native_testing_fallback',
      arguments: { value: 9 },
    });

    expect(result?.content[0].text).toBe('value:9');
    expect(nativeTesting.executeToolCalls).toHaveLength(1);
    expect(nativeTesting.executeToolCalls[0]).toMatchObject({
      toolName: 'native_testing_fallback',
      inputArgsJson: JSON.stringify({ value: 9 }),
    });
  });

  it('keeps first initialization on option mismatch in native mode', async () => {
    initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS);
    const firstBridge = requireBridge();
    const firstInitState = window.__mcpBridgeInitState;

    initializeWebModelContext({
      transport: {
        tabServer: {
          allowedOrigins: ['https://different-origin.example'],
        },
        iframeServer: false,
      },
    });

    expect(requireBridge()).toBe(firstBridge);
    expect(window.__mcpBridgeInitState).toEqual(firstInitState);

    nativeModelContext.registerTool({
      name: 'native_testing_after_reinit',
      description: 'native-testing reinit parity',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    });
    await flushMicrotasks(2);
    expect(
      requireBridge()
        .modelContext.listTools()
        .map((tool) => tool.name)
    ).toContain('native_testing_after_reinit');
  });

  it('installs missing polyfill stubs on native modelContext without overriding native methods', async () => {
    const nativeRegisterPromptSpy = vi.spyOn(nativeModelContext, 'registerPrompt');
    initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS);

    const nativeContext = navigator.modelContext as ModelContext &
      Record<'readResource' | 'getPrompt', unknown>;
    expect(typeof nativeContext.readResource).toBe('function');
    expect(typeof nativeContext.getPrompt).toBe('function');

    await expect(
      (nativeContext.readResource as (uri: string) => Promise<unknown>)('memory://resource')
    ).rejects.toThrow(/not supported/i);
    await expect(
      (nativeContext.getPrompt as (name: string) => Promise<unknown>)('missing_prompt')
    ).rejects.toThrow(/not supported/i);

    nativeContext.registerPrompt({
      name: 'native_prompt',
      get: async () => ({
        messages: [{ role: 'user', content: { type: 'text', text: 'hello' } }],
      }),
    });
    expect(nativeRegisterPromptSpy).toHaveBeenCalledTimes(1);
  });

  it('normalizes native executeTool payloads to ToolResponse shapes', async () => {
    nativeModelContext.registerTool({
      name: 'native_result_shape',
      description: 'Result conversion test',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => 'ignored',
    });

    initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS);

    nativeTesting.executeTool = vi.fn(async () => JSON.stringify({ foo: 'bar' }));
    await expect(
      navigator.modelContext?.callTool({
        name: 'native_result_shape',
        arguments: {},
      })
    ).resolves.toMatchObject({
      content: [{ type: 'text' }],
      structuredContent: { foo: 'bar' },
    });

    nativeTesting.executeTool = vi.fn(async () =>
      JSON.stringify({ content: [{ type: 'text', text: 'ok' }] })
    );
    await expect(
      navigator.modelContext?.callTool({
        name: 'native_result_shape',
        arguments: {},
      })
    ).resolves.toMatchObject({
      content: [{ type: 'text', text: 'ok' }],
    });

    nativeTesting.executeTool = vi.fn(async () => 'plain-text');
    await expect(
      navigator.modelContext?.callTool({
        name: 'native_result_shape',
        arguments: {},
      })
    ).resolves.toMatchObject({
      content: [{ type: 'text', text: 'plain-text' }],
    });

    nativeTesting.executeTool = vi.fn(async () => null);
    await expect(
      navigator.modelContext?.callTool({
        name: 'native_result_shape',
        arguments: {},
      })
    ).resolves.toMatchObject({
      content: [{ type: 'text', text: '' }],
    });
  });

  it('delegates bridge tool registration lifecycle to native APIs', async () => {
    initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS);

    const bridge = requireBridge();

    bridge.modelContext.provideContext({
      tools: [
        {
          name: 'bridge_base_tool',
          description: 'Base tool',
          inputSchema: { type: 'object', properties: {} },
          execute: async () => ({ content: [{ type: 'text', text: 'base' }] }),
        },
      ],
    });
    await flushMicrotasks(2);
    expect(bridge.modelContext.listTools().map((tool) => tool.name)).toContain('bridge_base_tool');

    bridge.modelContext.registerTool({
      name: 'bridge_dynamic_tool',
      description: 'Dynamic tool',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ content: [{ type: 'text', text: 'dynamic' }] }),
    });
    await flushMicrotasks(2);
    expect(bridge.modelContext.listTools().map((tool) => tool.name)).toContain(
      'bridge_dynamic_tool'
    );

    bridge.modelContext.unregisterTool('bridge_dynamic_tool');
    await flushMicrotasks(2);
    expect(bridge.modelContext.listTools().map((tool) => tool.name)).not.toContain(
      'bridge_dynamic_tool'
    );

    bridge.modelContext.unregisterTool('bridge_base_tool');
    await flushMicrotasks(2);
    expect(bridge.modelContext.listTools().map((tool) => tool.name)).not.toContain(
      'bridge_base_tool'
    );
  });

  it('keeps bridge sync working for native-origin updates after callback replacement', async () => {
    initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS);

    const bridge = requireBridge();
    const callbackReplacedTool = {
      name: 'callback_replaced_tool',
      description: 'Tool synced from native callback',
      inputSchema: JSON.stringify({ type: 'object', properties: {} }),
    };

    // Simulate another consumer replacing the native testing callback.
    nativeTesting.registerToolsChangedCallback(() => {});
    vi.spyOn(nativeTesting, 'listTools').mockReturnValue([callbackReplacedTool]);
    nativeTesting.notifyToolsChanged();

    await flushMicrotasks(2);

    expect(bridge.modelContext.listTools().map((tool) => tool.name)).toContain(
      'callback_replaced_tool'
    );
  });

  it('preserves external callback replacement semantics', async () => {
    initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS);

    const first = vi.fn();
    const second = vi.fn();

    navigator.modelContextTesting?.registerToolsChangedCallback(first);
    navigator.modelContextTesting?.registerToolsChangedCallback(second);
    nativeTesting.notifyToolsChanged();

    expect(first).toHaveBeenCalledTimes(0);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('keeps internal sync active after multiple external callback re-registrations', async () => {
    const listToolsMock = vi.spyOn(nativeTesting, 'listTools');
    const syncedTool = {
      name: 'multi_reregister_tool',
      description: 'Tool synced after re-registration',
      inputSchema: JSON.stringify({ type: 'object', properties: {} }),
    };

    listToolsMock.mockReturnValue([]);
    initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS);

    const bridge = requireBridge();

    navigator.modelContextTesting?.registerToolsChangedCallback(vi.fn());
    navigator.modelContextTesting?.registerToolsChangedCallback(vi.fn());
    navigator.modelContextTesting?.registerToolsChangedCallback(vi.fn());

    listToolsMock.mockReturnValue([syncedTool]);
    nativeTesting.notifyToolsChanged();
    await flushMicrotasks(2);

    expect(bridge.modelContext.listTools().map((tool) => tool.name)).toContain(
      'multi_reregister_tool'
    );
  });

  it('falls back to mutation-based sync when callback multiplexer cannot be installed', async () => {
    const lockedRegisterToolsChangedCallback =
      nativeTesting.registerToolsChangedCallback.bind(nativeTesting);

    Object.defineProperty(nativeTesting, 'registerToolsChangedCallback', {
      value: lockedRegisterToolsChangedCallback,
      writable: false,
      configurable: false,
    });

    initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS);

    const bridge = requireBridge();

    navigator.modelContext?.registerTool({
      name: 'locked_callback_tool',
      description: 'Tool registered with locked callback setter',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    });

    await flushMicrotasks(2);

    expect(bridge.modelContext.listTools().map((tool) => tool.name)).toContain(
      'locked_callback_tool'
    );
  });

  it('exposes adapter fallbacks for resources/prompts and forwards events', async () => {
    initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS);

    const bridge = requireBridge();

    const resourceRegistration = bridge.modelContext.registerResource({
      uri: 'memory://resource',
      name: 'Resource',
      read: async (uri: URL) => ({
        contents: [{ uri: uri.href, text: 'noop' }],
      }),
    });
    resourceRegistration.unregister();
    bridge.modelContext.unregisterResource('memory://resource');
    expect(bridge.modelContext.listResources()).toEqual([]);
    expect(bridge.modelContext.listResourceTemplates()).toEqual([]);
    await expect(bridge.modelContext.readResource('memory://resource')).rejects.toThrow(
      /not supported/i
    );

    const promptRegistration = bridge.modelContext.registerPrompt({
      name: 'prompt',
      get: async () => ({
        messages: [{ role: 'user', content: { type: 'text', text: 'hello' } }],
      }),
    });
    promptRegistration.unregister();
    bridge.modelContext.unregisterPrompt('prompt');
    expect(bridge.modelContext.listPrompts()).toEqual([]);
    await expect(bridge.modelContext.getPrompt('prompt')).rejects.toThrow(/not supported/i);

    const toolsChangedListener = vi.fn();
    const toolCallListener = vi.fn();
    bridge.modelContext.addEventListener('toolschanged', toolsChangedListener);
    bridge.modelContext.addEventListener('toolcall', toolCallListener);

    nativeModelContext.dispatchEvent(new Event('toolschanged'));
    nativeModelContext.dispatchEvent(new Event('toolcall'));
    expect(toolsChangedListener).toHaveBeenCalledTimes(1);
    expect(toolCallListener).toHaveBeenCalledTimes(1);

    bridge.modelContext.removeEventListener('toolschanged', toolsChangedListener);
    bridge.modelContext.removeEventListener('toolcall', toolCallListener);
    nativeModelContext.dispatchEvent(new Event('toolschanged'));
    nativeModelContext.dispatchEvent(new Event('toolcall'));
    expect(toolsChangedListener).toHaveBeenCalledTimes(1);
    expect(toolCallListener).toHaveBeenCalledTimes(1);

    expect(bridge.modelContext.dispatchEvent(new Event('toolschanged'))).toBe(true);
  });

  it('installs EventTarget shims when native context lacks event methods', async () => {
    Object.defineProperty(nativeModelContext, 'addEventListener', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(nativeModelContext, 'removeEventListener', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(nativeModelContext, 'dispatchEvent', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS);

    const context = navigator.modelContext as ModelContext;
    const listener = vi.fn();

    context.addEventListener('toolschanged', listener as () => void);
    expect(context.dispatchEvent(new Event('toolschanged'))).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    context.removeEventListener('toolschanged', listener as () => void);
    expect(context.dispatchEvent(new Event('toolschanged'))).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('throws explicit errors when sampling and elicitation capabilities are unavailable', async () => {
    initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS);

    const bridge = requireBridge() as {
      tabServer: { server?: unknown };
      modelContext: MCPBridge['modelContext'];
    };

    const originalServer = bridge.tabServer.server;
    (bridge.tabServer as { server?: unknown }).server = {};

    try {
      await expect(
        bridge.modelContext.createMessage({
          messages: [{ role: 'user', content: { type: 'text', text: 'hi' } }],
        })
      ).rejects.toThrow(/sampling is not supported/i);

      await expect(
        bridge.modelContext.elicitInput({
          message: 'Need input',
          requestedSchema: { type: 'object', properties: {} },
        })
      ).rejects.toThrow(/elicitation is not supported/i);
    } finally {
      (bridge.tabServer as { server?: unknown }).server = originalServer;
    }
  });

  it('delegates sampling and elicitation to connected tab server capabilities', async () => {
    initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS);

    const bridge = requireBridge() as {
      tabServer: { server?: unknown };
      modelContext: MCPBridge['modelContext'];
    };

    const samplingResponse = {
      model: 'test-model',
      role: 'assistant' as const,
      content: { type: 'text' as const, text: 'sampled' },
      stopReason: 'endTurn',
    };
    const elicitationResponse = {
      action: 'accept' as const,
      content: { answer: 'ok' },
    };

    const createMessage = vi.fn(async () => samplingResponse);
    const elicitInput = vi.fn(async () => elicitationResponse);

    const originalServer = bridge.tabServer.server;
    (bridge.tabServer as { server?: unknown }).server = {
      createMessage,
      elicitInput,
    };

    try {
      await expect(
        bridge.modelContext.createMessage({
          messages: [{ role: 'user', content: { type: 'text', text: 'hi' } }],
          maxTokens: 64,
        })
      ).resolves.toEqual(samplingResponse);
      expect(createMessage).toHaveBeenCalledTimes(1);

      await expect(
        bridge.modelContext.elicitInput({
          message: 'Need input',
          requestedSchema: {
            type: 'object',
            properties: { answer: { type: 'string' } },
            required: ['answer'],
          },
        })
      ).resolves.toEqual(elicitationResponse);
      expect(elicitInput).toHaveBeenCalledTimes(1);
    } finally {
      (bridge.tabServer as { server?: unknown }).server = originalServer;
    }
  });
});

type CoreConformanceMode = 'polyfill' | 'native-testing' | 'native-no-testing';

interface CoreConformanceHarness {
  mode: CoreConformanceMode;
  nativeModelContext?: NativeModelContextMock;
  nativeTesting?: NativeModelContextTestingMock;
}

const CORE_CONFORMANCE_MODES: CoreConformanceMode[] = [
  'polyfill',
  'native-testing',
  'native-no-testing',
];

function safeSetNavigatorProperty(
  key: 'modelContext' | 'modelContextTesting',
  value: unknown
): void {
  const descriptor = Object.getOwnPropertyDescriptor(window.navigator, key);
  if (!descriptor || descriptor.configurable) {
    Object.defineProperty(window.navigator, key, {
      value,
      writable: true,
      configurable: true,
    });
    return;
  }

  if (descriptor.writable) {
    (window.navigator as unknown as Record<string, unknown>)[key] = value;
  }
}

function safeDeleteNavigatorProperty(key: 'modelContext' | 'modelContextTesting'): void {
  const descriptor = Object.getOwnPropertyDescriptor(window.navigator, key);
  if (!descriptor) {
    return;
  }

  if (descriptor.configurable) {
    delete (window.navigator as unknown as Record<string, unknown>)[key];
    return;
  }

  if (descriptor.writable) {
    (window.navigator as unknown as Record<string, unknown>)[key] = undefined;
  }
}

function safeRestoreNavigatorProperty(
  key: 'modelContext' | 'modelContextTesting',
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) {
    try {
      Object.defineProperty(window.navigator, key, descriptor);
      return;
    } catch {
      if (descriptor.writable && 'value' in descriptor) {
        (window.navigator as unknown as Record<string, unknown>)[key] = descriptor.value;
      }
      return;
    }
  }

  safeDeleteNavigatorProperty(key);
}

async function withCoreConformanceHarness(
  mode: CoreConformanceMode,
  run: (harness: CoreConformanceHarness) => Promise<void> | void
): Promise<void> {
  const originalModelContextDescriptor = Object.getOwnPropertyDescriptor(
    window.navigator,
    'modelContext'
  );
  const originalModelContextTestingDescriptor = Object.getOwnPropertyDescriptor(
    window.navigator,
    'modelContextTesting'
  );

  delete (window as unknown as { __mcpBridge?: unknown }).__mcpBridge;
  delete (window as unknown as { __mcpBridgeInitState?: unknown }).__mcpBridgeInitState;

  try {
    cleanupWebModelContext();
  } catch {
    // Ignore cleanup failures caused by non-configurable runtime descriptors.
  }

  let nativeModelContext: NativeModelContextMock | undefined;
  let nativeTesting: NativeModelContextTestingMock | undefined;

  if (mode === 'polyfill') {
    safeDeleteNavigatorProperty('modelContext');
    safeDeleteNavigatorProperty('modelContextTesting');
  } else {
    nativeModelContext = new NativeModelContextMock();

    safeSetNavigatorProperty('modelContext', nativeModelContext as unknown as ModelContext);

    if (mode === 'native-testing') {
      nativeTesting = new NativeModelContextTestingMock(nativeModelContext);
      nativeModelContext.setMutationListener(() => nativeTesting?.notifyToolsChanged());
      safeSetNavigatorProperty(
        'modelContextTesting',
        nativeTesting as unknown as ModelContextTesting
      );
    } else {
      safeDeleteNavigatorProperty('modelContextTesting');
    }
  }

  initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS);
  installNotificationGuards();
  await flushMicrotasks(2);

  try {
    await run({ mode, nativeModelContext, nativeTesting });
  } finally {
    try {
      cleanupWebModelContext();
    } catch {
      // Ignore cleanup failures in test teardown.
    }

    delete (window as unknown as { __mcpBridge?: unknown }).__mcpBridge;
    delete (window as unknown as { __mcpBridgeInitState?: unknown }).__mcpBridgeInitState;

    safeRestoreNavigatorProperty('modelContext', originalModelContextDescriptor);
    safeRestoreNavigatorProperty('modelContextTesting', originalModelContextTestingDescriptor);
  }
}

for (const mode of CORE_CONFORMANCE_MODES) {
  describe(`Core conformance matrix (${mode})`, () => {
    it('supports provideContext() default arg and replacement semantics', async () => {
      await withCoreConformanceHarness(mode, async () => {
        const modelContext = navigator.modelContext;
        expect(modelContext).toBeDefined();

        expect(() => modelContext.provideContext()).not.toThrow();

        modelContext.registerTool({
          name: 'dynamic_before_provide',
          description: 'Dynamic tool',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'dynamic' }] };
          },
        });
        expect(modelContext.listTools().map((tool) => tool.name)).toContain(
          'dynamic_before_provide'
        );

        modelContext.provideContext({
          tools: [
            {
              name: 'base_after_provide',
              description: 'Base tool',
              inputSchema: { type: 'object', properties: {} },
              async execute() {
                return { content: [{ type: 'text', text: 'base' }] };
              },
            },
          ],
        });

        const toolNames = modelContext.listTools().map((tool) => tool.name);
        expect(toolNames).toContain('base_after_provide');
        expect(toolNames).not.toContain('dynamic_before_provide');
      });
    });

    it('registerTool() returns undefined and duplicate names throw', async () => {
      await withCoreConformanceHarness(mode, async () => {
        const modelContext = navigator.modelContext;
        expect(modelContext).toBeDefined();

        const result = modelContext.registerTool({
          name: 'duplicate_name_case',
          description: 'First registration',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'first' }] };
          },
        });

        expect(result).toBeUndefined();
        expect(() =>
          modelContext.registerTool({
            name: 'duplicate_name_case',
            description: 'Second registration',
            inputSchema: { type: 'object', properties: {} },
            async execute() {
              return { content: [{ type: 'text', text: 'second' }] };
            },
          })
        ).toThrow();
      });
    });

    it('applies default inputSchema and throws on invalid schema', async () => {
      await withCoreConformanceHarness(mode, async () => {
        const modelContext = navigator.modelContext;
        expect(modelContext).toBeDefined();

        modelContext.registerTool({
          name: 'default_schema_case',
          description: 'No explicit schema',
          async execute() {
            return { content: [{ type: 'text', text: 'ok' }] };
          },
        });

        await expect(
          modelContext.callTool({
            name: 'default_schema_case',
            arguments: {},
          })
        ).resolves.toMatchObject({
          content: [{ type: 'text', text: 'ok' }],
        });

        expect(() =>
          modelContext.registerTool({
            name: 'invalid_schema_case',
            description: 'Invalid schema',
            inputSchema: { type: 'not-a-valid-json-schema-type' } as unknown as InputSchema,
            async execute() {
              return { content: [{ type: 'text', text: 'invalid' }] };
            },
          })
        ).toThrow();
      });
    });

    it('unregisterTool(name) removes tools and is a no-op for unknown names', async () => {
      await withCoreConformanceHarness(mode, async () => {
        const modelContext = navigator.modelContext;
        expect(modelContext).toBeDefined();

        modelContext.registerTool({
          name: 'remove_me',
          description: 'Removal test',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'remove_me' }] };
          },
        });

        expect(modelContext.listTools().map((tool) => tool.name)).toContain('remove_me');
        modelContext.unregisterTool('remove_me');
        expect(modelContext.listTools().map((tool) => tool.name)).not.toContain('remove_me');

        expect(() => modelContext.unregisterTool('unknown_tool_name')).not.toThrow();
      });
    });

    it('passes ModelContextClient and enforces post-resolution lifecycle', async () => {
      await withCoreConformanceHarness(mode, async () => {
        const modelContext = navigator.modelContext;
        expect(modelContext).toBeDefined();

        let capturedClient: ModelContextClient | undefined;
        modelContext.registerTool({
          name: 'client_lifecycle_case',
          description: 'Client lifecycle behavior',
          inputSchema: { type: 'object', properties: {} },
          async execute(_args, client) {
            capturedClient = client;
            const interaction = await client.requestUserInteraction(async () => ({
              approved: true,
            }));
            return {
              content: [{ type: 'text', text: JSON.stringify(interaction) }],
            };
          },
        });

        await expect(
          modelContext.callTool({
            name: 'client_lifecycle_case',
            arguments: {},
          })
        ).resolves.toMatchObject({
          content: [{ type: 'text', text: '{"approved":true}' }],
        });

        expect(capturedClient).toBeDefined();
        if (!capturedClient) {
          throw new Error('Expected execute() to capture a ModelContextClient');
        }

        await expect(
          capturedClient.requestUserInteraction(async () => ({ approved: true }))
        ).rejects.toThrow(/no longer active/i);
      });
    });
  });
}
