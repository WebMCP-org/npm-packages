import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ChromeModelContext, InputSchema, ModelContextTool } from '@mcp-b/webmcp-types';

interface RuntimeCoreConformanceOptions {
  suiteName: string;
  install(): void | Promise<void>;
  cleanup(): void | Promise<void>;
}

const activeControllers: AbortController[] = [];

function flushMicrotasks(count = 1): Promise<void> {
  let promise = Promise.resolve();
  for (let i = 0; i < count; i += 1) {
    promise = promise.then(() => Promise.resolve());
  }
  return promise.then(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

function uniqueToolName(prefix: string): string {
  return `${prefix}_${String(Date.now())}_${String(Math.random()).slice(2)}`;
}

function requireModelContext(): ChromeModelContext {
  const modelContext = document.modelContext;
  if (!modelContext) {
    throw new Error('Expected document.modelContext to be available');
  }
  return modelContext as ChromeModelContext;
}

function requireExecuteTool(modelContext: ChromeModelContext) {
  if (!modelContext.executeTool) {
    throw new Error('Expected document.modelContext.executeTool to be available');
  }
  return modelContext.executeTool.bind(modelContext);
}

async function listToolNames(): Promise<string[]> {
  return (await requireModelContext().getTools()).map((tool) => tool.name);
}

async function registerAbortableTool(tool: ModelContextTool): Promise<AbortController> {
  const controller = new AbortController();
  activeControllers.push(controller);
  await expect(
    requireModelContext().registerTool(tool, { signal: controller.signal })
  ).resolves.toBeUndefined();
  return controller;
}

export function runRuntimeCoreConformanceSuite(options: RuntimeCoreConformanceOptions): void {
  describe(options.suiteName, () => {
    beforeAll(async () => {
      await options.cleanup();
      await options.install();
      await flushMicrotasks(2);
    });

    afterEach(async () => {
      for (const controller of activeControllers.splice(0)) {
        controller.abort();
      }
      await flushMicrotasks(2);
    });

    afterAll(async () => {
      await options.cleanup();
    });

    it('does not expose removed context APIs', () => {
      const modelContext = requireModelContext();

      expect(typeof (modelContext as unknown as { provideContext?: unknown }).provideContext).toBe(
        'undefined'
      );
      expect(typeof (modelContext as unknown as { clearContext?: unknown }).clearContext).toBe(
        'undefined'
      );
    });

    it('exposes document.modelContext as canonical surface with navigator compatibility alias', async () => {
      const modelContext = requireModelContext();
      const navigatorAlias = navigator.modelContext;
      const toolName = uniqueToolName('canonical_alias_case');

      expect(navigatorAlias).toBe(modelContext);
      if (!navigatorAlias) {
        throw new Error('Expected navigator.modelContext compatibility alias');
      }

      await registerAbortableTool({
        name: toolName,
        description: 'Canonical document surface tool',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'alias-ok' }] };
        },
      });

      const documentTool = (await modelContext.getTools()).find((tool) => tool.name === toolName);
      const navigatorTool = (await navigatorAlias.getTools()).find(
        (tool) => tool.name === toolName
      );
      expect(documentTool).toBeDefined();
      expect(navigatorTool).toBeDefined();

      const serialized = await requireExecuteTool(navigatorAlias as ChromeModelContext)(
        navigatorTool!,
        '{}'
      );
      expect(serialized).toEqual(expect.any(String));
      expect(serialized).toContain('alias-ok');
    });

    it('registerTool resolves undefined and duplicate names reject', async () => {
      const toolName = uniqueToolName('duplicate_name_case');
      await registerAbortableTool({
        name: toolName,
        description: 'First registration',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'first' }] };
        },
      });

      expect(await listToolNames()).toContain(toolName);
      await expect(
        requireModelContext().registerTool({
          name: toolName,
          description: 'Second registration',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'second' }] };
          },
        })
      ).rejects.toThrow();
    });

    it('applies default inputSchema and preserves schema metadata', async () => {
      const toolName = uniqueToolName('default_schema_case');
      const modelContext = requireModelContext();
      await registerAbortableTool({
        name: toolName,
        description: 'No explicit schema',
        async execute() {
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      });

      const tool = (await modelContext.getTools()).find((candidate) => candidate.name === toolName);
      expect(tool).toBeDefined();
      const serialized = await requireExecuteTool(modelContext)(tool!, '{}');
      expect(serialized).toEqual(expect.any(String));
      expect(serialized).toContain('ok');

      const metadataToolName = uniqueToolName('schema_metadata_case');
      await registerAbortableTool({
        name: metadataToolName,
        description: 'Schema vocabulary is metadata at the WebMCP boundary',
        inputSchema: { type: 42 } as unknown as InputSchema,
        async execute() {
          return { content: [{ type: 'text', text: 'metadata' }] };
        },
      });
      const metadataTool = (await modelContext.getTools()).find(
        (candidate) => candidate.name === metadataToolName
      );
      expect(metadataTool?.inputSchema).toBe('{"type":42}');
    });

    it('executes registered tools via the producer getTools/executeTool API', async () => {
      const toolName = uniqueToolName('producer_execute_case');
      const modelContext = requireModelContext();
      await registerAbortableTool({
        name: toolName,
        description: 'Producer executeTool execution',
        inputSchema: { type: 'object', properties: { value: { type: 'number' } } },
        async execute(args) {
          return {
            content: [{ type: 'text', text: `producer:${String(args.value)}` }],
          };
        },
      });

      const tools = await modelContext.getTools();
      const tool = tools.find((candidate) => candidate.name === toolName);
      expect(tool).toBeDefined();

      const serialized = await requireExecuteTool(modelContext)(
        tool!,
        JSON.stringify({ value: 9 })
      );
      expect(serialized).toEqual(expect.any(String));
      expect(serialized).toContain('producer:9');
    });

    it('registerTool({ signal }) unregisters when the signal aborts', async () => {
      const toolName = uniqueToolName('signal_unregister_case');
      const controller = await registerAbortableTool({
        name: toolName,
        description: 'AbortSignal-driven unregistration',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      });

      expect(await listToolNames()).toContain(toolName);

      controller.abort();
      await flushMicrotasks(2);

      expect(await listToolNames()).not.toContain(toolName);
    });

    it('registerTool with a pre-aborted signal rejects and does not register the tool', async () => {
      const toolName = uniqueToolName('preaborted_signal_case');
      const controller = new AbortController();
      controller.abort();

      await expect(
        requireModelContext().registerTool(
          {
            name: toolName,
            description: 'Pre-aborted signal',
            inputSchema: { type: 'object', properties: {} },
            async execute() {
              return { content: [{ type: 'text', text: 'never' }] };
            },
          },
          { signal: controller.signal }
        )
      ).rejects.toThrow(/aborted/i);
      await flushMicrotasks(2);

      expect(await listToolNames()).not.toContain(toolName);
    });
  });
}
