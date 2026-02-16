import { afterEach, describe, expect, it } from 'vitest';
import { cleanupWebModelContext, initializeWebModelContext } from './global.js';
import type { ModelContext } from './types.js';

afterEach(() => {
  cleanupWebModelContext();
});

function getModelContext(): ModelContext {
  return navigator.modelContext as unknown as ModelContext;
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

describe('global adapter', () => {
  it('preserves native navigator.modelContext by default', () => {
    const nativeContext = createNativeModelContextStub();
    Object.defineProperty(navigator, 'modelContext', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: nativeContext,
    });

    initializeWebModelContext();
    expect(navigator.modelContext).toBe(nativeContext);

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

  it('cleanup restores and allows re-init', () => {
    initializeWebModelContext();
    expect(typeof getModelContext().listTools).toBe('function');

    cleanupWebModelContext();

    initializeWebModelContext();
    expect(typeof getModelContext().listTools).toBe('function');
  });
});
