import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { cleanupWebModelContext, initializeWebModelContext } from './global.js';
import { createTestHelper } from './testing.js';
import type {
  ModelContext,
  ModelContextTesting,
  ModelContextTestingPolyfillExtensions,
} from './types.js';

declare global {
  interface Navigator {
    modelContext?: ModelContext;
    modelContextTesting?: ModelContextTesting;
  }
}

function flushMicrotasks(): Promise<void> {
  return Promise.resolve();
}

type SerializedTestingToolResult = {
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  metadata?: Record<string, unknown>;
};

function parseTestingToolResult(result: string | null): SerializedTestingToolResult | null {
  if (result === null) {
    return null;
  }
  return JSON.parse(result) as SerializedTestingToolResult;
}

describe('@mcp-b/global/testing', () => {
  beforeAll(() => {
    initializeWebModelContext({
      transport: {
        tabServer: {
          allowedOrigins: [window.location.origin],
        },
        iframeServer: false,
      },
    });
  });

  beforeEach(() => {
    navigator.modelContext?.clearContext();
    createTestHelper().reset();
  });

  afterAll(() => {
    try {
      cleanupWebModelContext();
    } catch {
      // Non-configurable navigator.modelContext in some environments is expected.
    }
  });

  it('creates a helper that executes tools with object args', async () => {
    navigator.modelContext?.registerTool({
      name: 'helper_echo',
      description: 'Echo helper',
      inputSchema: { message: z.string() },
      execute: async ({ message }) => ({
        content: [{ type: 'text', text: `Echo: ${message}` }],
      }),
    });

    const helper = createTestHelper();
    const result = await helper.executeTool('helper_echo', { message: 'hello' });

    const parsedResult = parseTestingToolResult(result);
    expect(parsedResult?.content[0]).toMatchObject({ type: 'text', text: 'Echo: hello' });
    await expect(helper.getCrossDocumentScriptToolResult()).resolves.toBe('[]');
  });

  it('falls back to navigator.modelContextTesting when bridge reference is missing', async () => {
    const bridgeDescriptor = Object.getOwnPropertyDescriptor(window, '__mcpBridge');
    delete (window as unknown as { __mcpBridge?: unknown }).__mcpBridge;

    navigator.modelContext?.registerTool({
      name: 'helper_navigator_fallback',
      description: 'Navigator fallback helper',
      inputSchema: { message: z.string() },
      execute: async ({ message }) => ({
        content: [{ type: 'text', text: `Fallback: ${message}` }],
      }),
    });

    try {
      const helper = createTestHelper();
      const result = await helper.executeTool('helper_navigator_fallback', { message: 'path' });
      const parsedResult = parseTestingToolResult(result);
      expect(parsedResult?.content[0]).toMatchObject({ type: 'text', text: 'Fallback: path' });
    } finally {
      if (bridgeDescriptor) {
        Object.defineProperty(window, '__mcpBridge', bridgeDescriptor);
      }
    }
  });

  it('forwards tool change subscriptions and polyfill extensions', async () => {
    const helper = createTestHelper();
    const callback = vi.fn();
    helper.onToolsChanged(callback);

    navigator.modelContext?.provideContext({
      tools: [
        {
          name: 'helper_changed',
          description: 'Changed helper',
          inputSchema: {},
          execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
        },
      ],
    });

    await flushMicrotasks();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(helper.listTools().map((tool) => tool.name)).toContain('helper_changed');

    await helper.executeTool('helper_changed', {});
    const calls = helper.getToolCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].toolName).toBe('helper_changed');
    expect(helper.getRegisteredTools().map((tool) => tool.name)).toContain('helper_changed');

    helper.setMockToolResponse('helper_changed', {
      content: [{ type: 'text', text: 'mocked' }],
    });
    await expect(helper.executeTool('helper_changed', {})).resolves.toMatch(/"text":"mocked"/);

    helper.clearMockToolResponse('helper_changed');
    await expect(helper.executeTool('helper_changed', {})).resolves.toMatch(/"text":"ok"/);

    helper.setMockToolResponse('helper_changed', {
      content: [{ type: 'text', text: 'mocked-again' }],
    });
    helper.clearAllMockToolResponses();
    await expect(helper.executeTool('helper_changed', {})).resolves.toMatch(/"text":"ok"/);

    helper.clearToolCalls();
    expect(helper.getToolCalls()).toHaveLength(0);

    helper.reset();
    expect(helper.getToolCalls()).toHaveLength(0);
  });

  it('throws when modelContextTesting is unavailable', () => {
    const bridge = (window as unknown as { __mcpBridge?: unknown }).__mcpBridge;
    const testingDescriptor = Object.getOwnPropertyDescriptor(navigator, 'modelContextTesting');

    delete (window as unknown as { __mcpBridge?: unknown }).__mcpBridge;
    delete (navigator as unknown as { modelContextTesting?: unknown }).modelContextTesting;

    try {
      expect(() => createTestHelper()).toThrow(/modelContextTesting is not available/i);
    } finally {
      if (testingDescriptor) {
        Object.defineProperty(navigator, 'modelContextTesting', testingDescriptor);
      }
      if (bridge) {
        Object.defineProperty(window, '__mcpBridge', {
          value: bridge,
          writable: false,
          configurable: true,
        });
      }
    }
  });

  it('supports native-style overrides and errors only on polyfill-only extensions', async () => {
    let receivedJsonArgs = '';
    let crossDocumentResultCalls = 0;

    const nativeLikeTesting = {
      executeTool: async (
        _toolName: string,
        inputArgsJson: string,
        _options?: { signal?: AbortSignal }
      ) => {
        receivedJsonArgs = inputArgsJson;
        return 'ok';
      },
      listTools: () => [],
      registerToolsChangedCallback: () => {},
      getCrossDocumentScriptToolResult: async () => {
        crossDocumentResultCalls += 1;
        return '{"ok":true}';
      },
    } as unknown as ModelContextTesting & Partial<ModelContextTestingPolyfillExtensions>;

    const helper = createTestHelper(nativeLikeTesting);
    const result = await helper.executeTool('native_style', { value: 5 });
    expect(result).toBe('ok');
    expect(receivedJsonArgs).toBe(JSON.stringify({ value: 5 }));
    await expect(helper.getCrossDocumentScriptToolResult()).resolves.toBe('{"ok":true}');
    expect(crossDocumentResultCalls).toBe(1);

    expect(() => helper.getToolCalls()).toThrow(
      /require the @mcp-b\/global polyfill testing extensions/i
    );
  });

  it('throws a clear error when helper args cannot be JSON-stringified', async () => {
    const helper = createTestHelper();
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;

    expect(() => helper.executeTool('any_tool', cyclic as Record<string, unknown>)).toThrow(
      /Failed to serialize tool arguments/i
    );
  });

  it('throws for unsupported JSON argument values (BigInt)', async () => {
    const helper = createTestHelper();
    expect(() =>
      helper.executeTool('any_tool', { unsupported: BigInt(1) } as Record<string, unknown>)
    ).toThrow(/Failed to serialize tool arguments/i);
  });
});
