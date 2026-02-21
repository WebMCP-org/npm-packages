import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import type { BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';
import { afterEach, describe, expect, it } from 'vitest';
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
