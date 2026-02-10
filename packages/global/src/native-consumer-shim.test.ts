import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupWebModelContext, initializeWebModelContext } from './global.js';
import type {
  InputSchema,
  MCPBridge,
  ModelContext,
  ModelContextTesting,
  ToolListItem,
} from './types.js';

interface NativeToolDefinition {
  name: string;
  description: string;
  inputSchema: InputSchema;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
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

  registerTool(tool: NativeToolDefinition): { unregister: () => void } {
    this.tools.set(tool.name, tool);
    this.notifyMutation();
    return {
      unregister: () => this.unregisterTool(tool.name),
    };
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
    return tool.execute(args);
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
  private callbacks = new Set<() => void>();
  public executeToolCalls: Array<{ toolName: string; inputArgsJson: string }> = [];

  constructor(private modelContext: NativeModelContextMock) {}

  notifyToolsChanged(): void {
    for (const callback of this.callbacks) {
      callback();
    }
  }

  async executeTool(toolName: string, inputArgsJson: string): Promise<unknown> {
    this.executeToolCalls.push({ toolName, inputArgsJson });
    const args = JSON.parse(inputArgsJson) as Record<string, unknown>;
    return this.modelContext.executeTool(toolName, args);
  }

  listTools(): Array<{ name: string; description: string; inputSchema: string }> {
    return this.modelContext.listTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: JSON.stringify(tool.inputSchema),
    }));
  }

  registerToolsChangedCallback(callback: () => void): void {
    this.callbacks.add(callback);
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

    const nativeModelContext = new NativeModelContextMock();
    Object.defineProperty(window.navigator, 'modelContext', {
      value: nativeModelContext as unknown as ModelContext,
      writable: true,
      configurable: true,
    });

    delete (window.navigator as unknown as { modelContextTesting?: unknown }).modelContextTesting;
    delete (window as unknown as { __mcpBridge?: unknown }).__mcpBridge;
  });

  afterEach(() => {
    delete (window as unknown as { __mcpBridge?: unknown }).__mcpBridge;

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

  it('installs callTool shim and executes native tools', async () => {
    initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS);

    const modelContext = navigator.modelContext as ModelContext;
    expect(typeof modelContext.callTool).toBe('function');

    modelContext.registerTool({
      name: 'native_only_echo',
      description: 'Echo for native-only shim test',
      inputSchema: {
        type: 'object',
        properties: {
          value: { type: 'number' },
        },
        required: ['value'],
      },
      execute: async ({ value }) => {
        return {
          content: [{ type: 'text', text: String(value) }],
        };
      },
    });

    await flushMicrotasks(2);

    const result = await modelContext.callTool({
      name: 'native_only_echo',
      arguments: { value: 42 },
    });

    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('42');
  });

  it('keeps bridge tools in sync and emits toolschanged on native mutations', async () => {
    initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS);

    const modelContext = navigator.modelContext as ModelContext;
    const toolsChanged = vi.fn();
    modelContext.addEventListener('toolschanged', toolsChanged);

    modelContext.registerTool({
      name: 'native_only_counter',
      description: 'Counter',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({
        content: [{ type: 'text', text: 'ok' }],
      }),
    });

    await flushMicrotasks(2);

    const bridge = (window as unknown as { __mcpBridge?: { modelContext: ModelContext } })
      .__mcpBridge;
    const bridgeTools = bridge?.modelContext.listTools().map((tool) => tool.name) ?? [];

    expect(bridgeTools).toContain('native_only_counter');
    expect(toolsChanged).toHaveBeenCalledTimes(1);

    modelContext.clearContext();
    await flushMicrotasks(2);

    const bridgeToolsAfterClear = bridge?.modelContext.listTools().map((tool) => tool.name) ?? [];
    expect(bridgeToolsAfterClear).not.toContain('native_only_counter');
    expect(toolsChanged).toHaveBeenCalledTimes(2);
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
  });

  afterEach(() => {
    delete (window as unknown as { __mcpBridge?: unknown }).__mcpBridge;

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

  it('prefers native modelContext.callTool over modelContextTesting.executeTool when available', async () => {
    nativeModelContext.registerTool({
      name: 'native_calltool_preferred',
      description: 'Preferred native callTool path',
      inputSchema: { type: 'object', properties: { value: { type: 'number' } } },
      execute: async ({ value }) => ({ content: [{ type: 'text', text: `legacy:${value}` }] }),
    });

    let nativeCallToolCount = 0;
    (
      nativeModelContext as unknown as {
        callTool: (params: {
          name: string;
          arguments?: Record<string, unknown>;
        }) => Promise<unknown>;
      }
    ).callTool = async (params) => {
      nativeCallToolCount += 1;
      return { content: [{ type: 'text', text: `native:${params.arguments?.value}` }] };
    };

    initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS);

    const result = await navigator.modelContext?.callTool({
      name: 'native_calltool_preferred',
      arguments: { value: 7 },
    });

    expect(result?.content[0].text).toBe('native:7');
    expect(nativeCallToolCount).toBe(1);
    expect(nativeTesting.executeToolCalls).toHaveLength(0);
  });

  it('falls back to modelContextTesting.executeTool with JSON args when native callTool is absent', async () => {
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

  it('normalizes non-MCP native callTool results into MCP-shaped responses', async () => {
    nativeModelContext.registerTool({
      name: 'native_calltool_normalize',
      description: 'Normalize native result values',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => 'unused',
    });

    const nativeCallTool = vi
      .fn()
      .mockResolvedValueOnce({ echoed: true })
      .mockResolvedValueOnce(17)
      .mockResolvedValueOnce(null);

    (
      nativeModelContext as unknown as {
        callTool: (params: {
          name: string;
          arguments?: Record<string, unknown>;
        }) => Promise<unknown>;
      }
    ).callTool = nativeCallTool;

    initializeWebModelContext(NATIVE_TEST_INIT_OPTIONS);

    const bridge = requireBridge();

    const firstResult = await bridge.modelContext.callTool({
      name: 'native_calltool_normalize',
      arguments: {},
    });
    expect(firstResult?.structuredContent).toEqual({ echoed: true });
    expect(firstResult?.content[0].text).toContain('"echoed": true');

    const secondResult = await bridge.modelContext.callTool({
      name: 'native_calltool_normalize',
      arguments: {},
    });
    expect(secondResult?.content[0].text).toBe('17');

    const thirdResult = await bridge.modelContext.callTool({
      name: 'native_calltool_normalize',
      arguments: {},
    });
    expect(thirdResult?.content[0].text).toBe('');

    expect(nativeTesting.executeToolCalls).toHaveLength(0);
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

    const registration = bridge.modelContext.registerTool({
      name: 'bridge_dynamic_tool',
      description: 'Dynamic tool',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ content: [{ type: 'text', text: 'dynamic' }] }),
    });
    await flushMicrotasks(2);
    expect(bridge.modelContext.listTools().map((tool) => tool.name)).toContain(
      'bridge_dynamic_tool'
    );

    registration.unregister();
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
