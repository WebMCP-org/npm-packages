import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import type { BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

function setTestingShim(value: unknown): void {
  testingShimDescriptorStack.push(
    Object.getOwnPropertyDescriptor(navigator, 'modelContextTesting')
  );
  Object.defineProperty(navigator, 'modelContextTesting', {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

const testingShimDescriptorStack: Array<PropertyDescriptor | undefined> = [];

function clearTestingShim(): void {
  const previousDescriptor = testingShimDescriptorStack.pop();
  if (previousDescriptor) {
    Object.defineProperty(navigator, 'modelContextTesting', previousDescriptor);
    return;
  }

  delete (navigator as unknown as Record<string, unknown>).modelContextTesting;
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

  it('backfills tools from testing shim listTools() and tolerates invalid inputSchema JSON', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const executeTool = vi.fn(async () =>
      JSON.stringify({
        content: [{ type: 'text', text: 'shim-ok' }],
      })
    );

    setTestingShim({
      listTools: () => [
        {
          name: 'shim_list_tool',
          description: 'Tool sourced from listTools',
          inputSchema: 'not-json',
        },
      ],
      executeTool,
    });

    try {
      initializeWebModelContext();
      const modelContext = getModelContext();

      expect(modelContext.listTools().map((tool) => tool.name)).toContain('shim_list_tool');

      const result = await modelContext.callTool({
        name: 'shim_list_tool',
        arguments: { sample: true },
      });
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text?: string }).text).toContain('shim-ok');
      expect(executeTool).toHaveBeenCalledWith('shim_list_tool', JSON.stringify({ sample: true }));
      expect(warnSpy).toHaveBeenCalledWith(
        '[WebMCP] Failed to parse testing inputSchema JSON:',
        expect.any(Error)
      );
    } finally {
      warnSpy.mockRestore();
      cleanupWebModelContext();
      clearTestingShim();
    }
  });

  it('returns navigation interruption error when testing shim executeTool resolves null', async () => {
    setTestingShim({
      getRegisteredTools: () => [
        {
          name: 'shim_nav_tool',
          description: 'Navigation test',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
      executeTool: async () => null,
    });

    try {
      initializeWebModelContext();
      const modelContext = getModelContext();

      const result = await modelContext.callTool({
        name: 'shim_nav_tool',
        arguments: {},
      });

      expect(result.isError).toBe(true);
      expect((result.content[0] as { text?: string }).text).toContain('interrupted by navigation');
    } finally {
      cleanupWebModelContext();
      clearTestingShim();
    }
  });

  it('throws when testing shim returns invalid serialized JSON', async () => {
    setTestingShim({
      getRegisteredTools: () => [
        {
          name: 'shim_invalid_json_tool',
          description: 'Bad JSON serialization',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
      executeTool: async () => 'not-json',
    });

    try {
      initializeWebModelContext();
      const modelContext = getModelContext();

      await expect(
        modelContext.callTool({
          name: 'shim_invalid_json_tool',
          arguments: {},
        })
      ).rejects.toThrow('Failed to parse serialized tool response for shim_invalid_json_tool');
    } finally {
      cleanupWebModelContext();
      clearTestingShim();
    }
  });

  it('throws when testing shim returns serialized non-object payload', async () => {
    setTestingShim({
      getRegisteredTools: () => [
        {
          name: 'shim_invalid_shape_tool',
          description: 'Bad response shape',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
      executeTool: async () => JSON.stringify('not-an-object'),
    });

    try {
      initializeWebModelContext();
      const modelContext = getModelContext();

      await expect(
        modelContext.callTool({
          name: 'shim_invalid_shape_tool',
          arguments: {},
        })
      ).rejects.toThrow('Invalid serialized tool response for shim_invalid_shape_tool');
    } finally {
      cleanupWebModelContext();
      clearTestingShim();
    }
  });

  it('ignores testing shims without listTools/getRegisteredTools methods', () => {
    setTestingShim({
      executeTool: async () =>
        JSON.stringify({
          content: [{ type: 'text', text: 'unused' }],
        }),
    });

    try {
      initializeWebModelContext();
      const modelContext = getModelContext();
      expect(modelContext.listTools()).toEqual([]);
    } finally {
      cleanupWebModelContext();
      clearTestingShim();
    }
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

  it('listTools normalizes empty inputSchema {} to default object schema', () => {
    initializeWebModelContext();
    const modelContext = getModelContext();

    modelContext.registerTool({
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
    expect(tool?.inputSchema).toMatchObject({ type: 'object' });
  });
});
