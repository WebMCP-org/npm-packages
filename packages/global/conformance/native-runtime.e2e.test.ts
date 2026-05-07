import { afterEach, describe, expect, it } from 'vitest';
import type { ModelContext, ModelContextTesting, ToolDescriptor } from '@mcp-b/webmcp-types';

type NativeRegisterTool = (tool: ToolDescriptor, options?: { signal?: AbortSignal }) => unknown;

const registeredControllers: AbortController[] = [];

function requireNativeModelContext(): ModelContext {
  const modelContext = navigator.modelContext as unknown as ModelContext | undefined;
  if (!modelContext) {
    throw new Error('Expected native navigator.modelContext to be available in Chrome 149+');
  }
  return modelContext;
}

function requireNativeTestingContext(): ModelContextTesting {
  const testing = navigator.modelContextTesting as ModelContextTesting | undefined;
  if (!testing) {
    throw new Error(
      'Expected native navigator.modelContextTesting to be available with WebMCPTesting enabled'
    );
  }
  return testing;
}

function uniqueToolName(prefix: string): string {
  return `${prefix}_${String(Date.now())}_${String(Math.random()).slice(2)}`;
}

function listNativeToolNames(): string[] {
  return requireNativeTestingContext()
    .listTools()
    .map((tool) => tool.name);
}

function registerNativeTool(tool: ToolDescriptor, signal?: AbortSignal): unknown {
  const modelContext = requireNativeModelContext();
  const registerTool = modelContext.registerTool as NativeRegisterTool;
  return registerTool.call(modelContext, tool, signal ? { signal } : undefined);
}

function registerAbortableTool(tool: ToolDescriptor): AbortController {
  const controller = new AbortController();
  registeredControllers.push(controller);
  registerNativeTool(tool, controller.signal);
  return controller;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('Native WebMCP conformance (Chrome 149+)', () => {
  afterEach(async () => {
    for (const controller of registeredControllers.splice(0)) {
      controller.abort();
    }
    await flush();
  });

  it('exposes the Chrome 149 native producer and testing surfaces', () => {
    const modelContext = requireNativeModelContext();
    const testing = requireNativeTestingContext();

    expect(typeof modelContext.registerTool).toBe('function');
    expect(typeof testing.listTools).toBe('function');
    expect(typeof testing.executeTool).toBe('function');
    expect(typeof testing.addEventListener).toBe('function');

    expect(typeof modelContext.unregisterTool).toBe('undefined');
    expect(typeof modelContext.provideContext).toBe('undefined');
    expect(typeof modelContext.clearContext).toBe('undefined');
    expect(typeof (modelContext as unknown as { callTool?: unknown }).callTool).toBe('undefined');
    expect(typeof (modelContext as unknown as { listTools?: unknown }).listTools).toBe('undefined');
  });

  it('registerTool returns undefined and mirrors tools into modelContextTesting.listTools()', () => {
    const toolName = uniqueToolName('native_register');
    const controller = new AbortController();
    registeredControllers.push(controller);

    const result = registerNativeTool(
      {
        name: toolName,
        description: 'Native register conformance tool',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      },
      controller.signal
    );

    expect(result).toBeUndefined();
    expect(listNativeToolNames()).toContain(toolName);
  });

  it('registerTool(tool, { signal }) unregisters when the signal aborts', async () => {
    const toolName = uniqueToolName('native_signal');
    const controller = registerAbortableTool({
      name: toolName,
      description: 'Native AbortSignal conformance tool',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'ok' }] };
      },
    });

    expect(listNativeToolNames()).toContain(toolName);

    controller.abort();
    await flush();

    expect(listNativeToolNames()).not.toContain(toolName);
  });

  it('registerTool with a pre-aborted signal does not register the tool', async () => {
    const toolName = uniqueToolName('native_preaborted');
    const controller = new AbortController();
    controller.abort();

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
    );
    await flush();

    expect(listNativeToolNames()).not.toContain(toolName);
  });

  it('modelContextTesting.executeTool invokes a registered native tool', async () => {
    const toolName = uniqueToolName('native_execute');
    registerAbortableTool({
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

    const serialized = await requireNativeTestingContext().executeTool(
      toolName,
      JSON.stringify({ value: 7 })
    );

    expect(serialized).toEqual(expect.any(String));
    expect(serialized).toContain('value:7');
  });
});
