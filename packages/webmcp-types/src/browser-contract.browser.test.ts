import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import type {
  ChromeModelContext,
  ModelContext,
  ModelContextGetToolOptions,
  ModelContextTesting,
  ModelContextTool,
  RegisteredTool,
} from './index.js';

const DEFAULT_INPUT_SCHEMA = { type: 'object', properties: {} } as const;

class ModelContextStub extends EventTarget {
  readonly tools = new Map<string, ModelContextTool>();
  ontoolchange: ((this: ModelContext, event: Event) => unknown) | null = null;

  async registerTool(tool: ModelContextTool, options?: { signal?: AbortSignal }): Promise<void> {
    if (options?.signal?.aborted) {
      throw options.signal.reason;
    }

    this.tools.set(tool.name, tool);
    options?.signal?.addEventListener('abort', () => this.tools.delete(tool.name), {
      once: true,
    });

    const event = new Event('toolchange');
    this.ontoolchange?.call(this as unknown as ModelContext, event);
    this.dispatchEvent(event);
  }

  async getTools(_options?: ModelContextGetToolOptions): Promise<RegisteredTool[]> {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      ...(tool.title === undefined ? {} : { title: tool.title }),
      description: tool.description,
      ...(tool.inputSchema === undefined ? {} : { inputSchema: JSON.stringify(tool.inputSchema) }),
      origin: window.location.origin,
      window,
      ...(tool.annotations === undefined ? {} : { annotations: tool.annotations }),
    }));
  }

  async executeTool(tool: RegisteredTool, inputArguments: string): Promise<string> {
    const registeredTool = this.tools.get(tool.name);
    if (!registeredTool) {
      throw new Error(`Tool not found: ${tool.name}`);
    }

    const result = await registeredTool.execute(JSON.parse(inputArguments));
    return JSON.stringify(result);
  }
}

class ModelContextTestingStub extends EventTarget implements ModelContextTesting {
  ontoolchange: ((this: ModelContextTesting, event: Event) => unknown) | null = null;

  listTools(): [] {
    return [];
  }

  async executeTool(): Promise<string> {
    return '{}';
  }
}

function createModelContextStub(): ChromeModelContext {
  return new ModelContextStub() as unknown as ChromeModelContext;
}

describe('@mcp-b/webmcp-types browser contract', () => {
  afterEach(() => {
    delete (document as unknown as Record<string, unknown>).modelContext;
    delete (navigator as unknown as Record<string, unknown>).modelContext;
    delete (navigator as unknown as Record<string, unknown>).modelContextTesting;
  });

  it('keeps document strict and navigator compatibility globals optional', () => {
    expectTypeOf<Document['modelContext']>().toEqualTypeOf<ModelContext>();
    expectTypeOf<Navigator['modelContext']>().toEqualTypeOf<ModelContext | undefined>();
    expectTypeOf<Navigator['modelContextTesting']>().toEqualTypeOf<
      ModelContextTesting | undefined
    >();
  });

  it('registers and discovers tools through the strict document surface', async () => {
    const context = createModelContextStub();
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      enumerable: true,
      writable: false,
      value: context,
    });

    const tool: ModelContextTool<{ count: number }, { count: number }, 'counter'> = {
      name: 'counter',
      description: 'Returns the supplied count',
      inputSchema: DEFAULT_INPUT_SCHEMA,
      async execute(input) {
        return { count: input.count };
      },
    };

    await document.modelContext.registerTool(tool);
    const registeredTools = await document.modelContext.getTools();

    expect(registeredTools).toHaveLength(1);
    expect(registeredTools[0]).toMatchObject({
      name: 'counter',
      description: 'Returns the supplied count',
    });
    expectTypeOf(registeredTools).toEqualTypeOf<RegisteredTool[]>();
  });

  it('feature-detects Chromium executeTool outside the strict core', async () => {
    const context = createModelContextStub();
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      enumerable: true,
      writable: false,
      value: context,
    });

    await document.modelContext.registerTool({
      name: 'chrome_counter',
      description: 'Returns the supplied count through the Chrome extension',
      inputSchema: DEFAULT_INPUT_SCHEMA,
      async execute(input: Record<string, unknown>) {
        return { count: input.count };
      },
    });

    const executeTool = context.executeTool;
    if (!executeTool) {
      throw new Error('Expected the test stub to expose the Chromium executeTool extension');
    }

    const [registeredTool] = await document.modelContext.getTools();
    if (!registeredTool) {
      throw new Error('Expected the registered tool to be discoverable');
    }

    await expect(
      executeTool.call(context, registeredTool, JSON.stringify({ count: 3 }))
    ).resolves.toBe(JSON.stringify({ count: 3 }));
  });

  it('keeps navigator.modelContext as optional deprecated compatibility', async () => {
    const context = createModelContextStub();
    Object.defineProperty(navigator, 'modelContext', {
      configurable: true,
      enumerable: true,
      get: () => context,
    });

    const compatibilityContext = navigator.modelContext;
    if (!compatibilityContext) {
      throw new Error('Expected the test compatibility alias to be installed');
    }

    await compatibilityContext.registerTool({
      name: 'legacy_counter',
      description: 'Returns a count through the deprecated alias',
      async execute() {
        return { count: 4 };
      },
    });

    await expect(compatibilityContext.getTools()).resolves.toEqual([
      expect.objectContaining({ name: 'legacy_counter' }),
    ]);
  });

  it('keeps modelContextTesting as optional deprecated compatibility', () => {
    const testing = new ModelContextTestingStub();
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
