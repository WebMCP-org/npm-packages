import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import type {
  CallToolResult,
  ModelContext,
  ModelContextTesting,
  ModelContextToolInfo,
  ToolDescriptor,
} from './index.js';

const DEFAULT_INPUT_SCHEMA = { type: 'object', properties: {} } as const;

function createModelContextStub(): ModelContext {
  const tools = new Map<string, ToolDescriptor>();

  return {
    provideContext(options) {
      tools.clear();
      for (const tool of options?.tools ?? []) {
        tools.set(tool.name, tool as ToolDescriptor);
      }
    },
    registerTool(tool) {
      tools.set((tool as ToolDescriptor).name, tool as ToolDescriptor);
    },
    unregisterTool(name) {
      tools.delete(name);
    },
    clearContext() {
      tools.clear();
    },
    async getTools() {
      return [...tools.values()].map((tool) => ({
        name: tool.name,
        title: tool.title ?? '',
        description: tool.description,
        inputSchema: JSON.stringify(tool.inputSchema ?? DEFAULT_INPUT_SCHEMA),
        origin: window.location.origin,
        window,
      }));
    },
    async executeTool(tool: ModelContextToolInfo, inputArgsJson: string) {
      const registeredTool = tools.get(tool.name);
      if (!registeredTool) {
        throw new Error(`Tool not found: ${tool.name}`);
      }
      const result = await registeredTool.execute(JSON.parse(inputArgsJson), {
        requestUserInteraction: async (callback: () => Promise<unknown>) => callback(),
      });
      return JSON.stringify(result);
    },
    listTools() {
      return [...tools.values()].map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema ?? DEFAULT_INPUT_SCHEMA,
        ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
      }));
    },
    async callTool(params) {
      const tool = tools.get(params.name);
      if (!tool) {
        throw new Error(`Tool not found: ${params.name}`);
      }

      return tool.execute((params.arguments ?? {}) as Record<string, unknown>, {
        requestUserInteraction: async (callback: () => Promise<unknown>) => callback(),
      });
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  } as unknown as ModelContext;
}

function createModelContextTestingStub(): ModelContextTesting {
  return {
    listTools: () => [],
    executeTool: async () => '{}',
    registerToolsChangedCallback: () => {},
    getCrossDocumentScriptToolResult: async () => '[]',
  };
}

describe('@mcp-b/webmcp-types browser contract', () => {
  afterEach(() => {
    delete (document as unknown as Record<string, unknown>).modelContext;
    delete (navigator as unknown as Record<string, unknown>).modelContext;
    delete (navigator as unknown as Record<string, unknown>).modelContextTesting;
  });

  it('keeps document-first global augmentation types for browser consumers', () => {
    expectTypeOf<Document['modelContext']>().toEqualTypeOf<ModelContext>();
    expectTypeOf<Navigator['modelContext']>().toEqualTypeOf<ModelContext>();
    expectTypeOf<Navigator['modelContextTesting']>().toEqualTypeOf<
      ModelContextTesting | undefined
    >();
  });

  it('supports typed tool registration and call flow via document.modelContext', async () => {
    const context = createModelContextStub();
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      enumerable: true,
      writable: false,
      value: context,
    });

    const tool: ToolDescriptor<{ count: number }, CallToolResult, 'counter'> = {
      name: 'counter',
      description: 'Returns count text',
      inputSchema: DEFAULT_INPUT_SCHEMA,
      async execute(args) {
        return { content: [{ type: 'text', text: String(args.count) }] };
      },
    };

    document.modelContext.registerTool(tool);

    const result = await document.modelContext.callTool({
      name: 'counter',
      arguments: { count: 3 },
    });

    expect(result.content[0]?.type).toBe('text');
    expect(result.content[0]?.text).toBe('3');
    expectTypeOf(result).toMatchTypeOf<CallToolResult>();
  });

  it('keeps deprecated navigator.modelContext usable for backward-compatible consumers', async () => {
    const context = createModelContextStub();
    Object.defineProperty(navigator, 'modelContext', {
      configurable: true,
      enumerable: true,
      get: () => context,
    });

    const tool: ToolDescriptor<{ count: number }, CallToolResult, 'legacy_counter'> = {
      name: 'legacy_counter',
      description: 'Returns count text through the legacy surface',
      inputSchema: DEFAULT_INPUT_SCHEMA,
      async execute(args) {
        return { content: [{ type: 'text', text: String(args.count) }] };
      },
    };

    navigator.modelContext.registerTool(tool);

    const result = await navigator.modelContext.callTool({
      name: 'legacy_counter',
      arguments: { count: 4 },
    });

    expect(result.content[0]?.type).toBe('text');
    expect(result.content[0]?.text).toBe('4');
    expectTypeOf(result).toMatchTypeOf<CallToolResult>();
  });

  it('supports modelContextTesting typing in browser runtime', () => {
    const testing = createModelContextTestingStub();
    Object.defineProperty(navigator, 'modelContextTesting', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: testing,
    });

    expect(typeof navigator.modelContextTesting?.listTools).toBe('function');
    expect(typeof navigator.modelContextTesting?.executeTool).toBe('function');
    expectTypeOf(navigator.modelContextTesting).toMatchTypeOf<ModelContextTesting | undefined>();
  });
});
