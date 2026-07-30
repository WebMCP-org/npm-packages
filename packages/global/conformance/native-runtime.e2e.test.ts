import type {
  ChromeModelContextExtensions,
  ModelContext,
  ModelContextTool,
  RegisteredTool,
} from '@mcp-b/webmcp-types';
import { afterEach, describe, expect, it } from 'vitest';

type NativeRegisterTool = (
  tool: ModelContextTool,
  options?: { signal?: AbortSignal }
) => Promise<void>;

type ChromeExecuteTool = NonNullable<ChromeModelContextExtensions['executeTool']>;

const registeredControllers: AbortController[] = [];

function requireNativeModelContext(): ModelContext {
  const modelContext = document.modelContext as ModelContext | undefined;
  if (!modelContext) {
    throw new Error('Expected native document.modelContext with WebMCP enabled');
  }
  return modelContext;
}

function getChromeExecuteTool(modelContext: ModelContext): ChromeExecuteTool | undefined {
  const chromeContext = modelContext as ModelContext & ChromeModelContextExtensions;
  return typeof chromeContext.executeTool === 'function'
    ? chromeContext.executeTool.bind(modelContext)
    : undefined;
}

function uniqueToolName(prefix: string): string {
  return `${prefix}_${String(Date.now())}_${String(Math.random()).slice(2)}`;
}

async function listNativeTools(): Promise<RegisteredTool[]> {
  return requireNativeModelContext().getTools();
}

async function listNativeToolNames(): Promise<string[]> {
  return (await listNativeTools()).map((tool) => tool.name);
}

function registerNativeTool(tool: ModelContextTool, signal?: AbortSignal): Promise<void> {
  const modelContext = requireNativeModelContext();
  const registerTool = modelContext.registerTool as NativeRegisterTool;
  return registerTool.call(modelContext, tool, signal ? { signal } : undefined);
}

async function registerAbortableTool(tool: ModelContextTool): Promise<AbortController> {
  const controller = new AbortController();
  registeredControllers.push(controller);
  await expect(registerNativeTool(tool, controller.signal)).resolves.toBeUndefined();
  return controller;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('Native WebMCP conformance', () => {
  afterEach(async () => {
    for (const controller of registeredControllers.splice(0)) {
      controller.abort();
    }
    await flush();
  });

  it('exposes the standard document.modelContext surface', () => {
    const modelContext = requireNativeModelContext();

    expect(typeof modelContext.registerTool).toBe('function');
    expect(typeof modelContext.getTools).toBe('function');
    expect(typeof modelContext.addEventListener).toBe('function');
    expect('unregisterTool' in modelContext).toBe(false);
    expect('provideContext' in modelContext).toBe(false);
    expect('clearContext' in modelContext).toBe(false);
  });

  it('treats Chromium executeTool as a feature-detected extension', () => {
    const executeTool = getChromeExecuteTool(requireNativeModelContext());
    expect(executeTool === undefined || typeof executeTool === 'function').toBe(true);
  });

  it('registerTool resolves undefined and exposes tools through getTools()', async () => {
    const toolName = uniqueToolName('native_register');
    const controller = new AbortController();
    registeredControllers.push(controller);

    await expect(
      registerNativeTool(
        {
          name: toolName,
          description: 'Native register conformance tool',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'ok' }] };
          },
        },
        controller.signal
      )
    ).resolves.toBeUndefined();

    await expect(listNativeToolNames()).resolves.toContain(toolName);
  });

  it('getTools accepts the standard fromOrigins option', async () => {
    await expect(requireNativeModelContext().getTools({ fromOrigins: [] })).resolves.toEqual(
      expect.any(Array)
    );
  });

  it('registerTool(tool, { signal }) unregisters when the signal aborts', async () => {
    const toolName = uniqueToolName('native_signal');
    const controller = await registerAbortableTool({
      name: toolName,
      description: 'Native AbortSignal conformance tool',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'ok' }] };
      },
    });

    await expect(listNativeToolNames()).resolves.toContain(toolName);

    controller.abort();
    await flush();

    await expect(listNativeToolNames()).resolves.not.toContain(toolName);
  });

  it('registerTool with a pre-aborted signal rejects and does not register the tool', async () => {
    const toolName = uniqueToolName('native_preaborted');
    const controller = new AbortController();
    controller.abort();

    await expect(
      registerNativeTool(
        {
          name: toolName,
          description: 'Native pre-aborted signal conformance tool',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'never' }] };
          },
        },
        controller.signal
      )
    ).rejects.toThrow(/abort/i);
    await flush();

    await expect(listNativeToolNames()).resolves.not.toContain(toolName);
  });

  it('executes a registered tool when Chromium executeTool is available', async () => {
    const modelContext = requireNativeModelContext();
    const executeTool = getChromeExecuteTool(modelContext);
    if (!executeTool) {
      return;
    }

    const toolName = uniqueToolName('native_execute');
    await registerAbortableTool({
      name: toolName,
      description: 'Native executeTool conformance tool',
      inputSchema: {
        type: 'object',
        properties: { value: { type: 'number' } },
        required: ['value'],
      },
      async execute(args) {
        return { content: [{ type: 'text', text: `value:${String(args.value)}` }] };
      },
    });

    const registeredTool = (await listNativeTools()).find((tool) => tool.name === toolName);
    if (!registeredTool) {
      throw new Error(`Expected getTools() to return ${toolName}`);
    }

    const serialized = await executeTool(registeredTool, JSON.stringify({ value: 7 }));

    expect(serialized).toEqual(expect.any(String));
    expect(serialized).toContain('value:7');
  });
});
