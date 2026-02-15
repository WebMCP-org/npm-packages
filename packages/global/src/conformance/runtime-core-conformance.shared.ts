import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanupWebModelContext, initializeWebModelContext } from '../global.js';
import type { InputSchema, ModelContext, WebModelContextInitOptions } from '../types.js';

type ExpectedBridgeMode = 'polyfill-installed' | 'native';

interface RuntimeConformanceOptions {
  suiteName: string;
  expectedBridgeMode: ExpectedBridgeMode;
  expectNativeApiBeforeInit: boolean;
}

const TEST_INIT_OPTIONS: WebModelContextInitOptions = {
  transport: {
    tabServer: {
      allowedOrigins: [window.location.origin] as string[],
    },
    iframeServer: false,
  },
};

function flushMicrotasks(count = 1): Promise<void> {
  let promise = Promise.resolve();
  for (let i = 0; i < count; i += 1) {
    promise = promise.then(() => Promise.resolve());
  }
  return promise;
}

function resetBridgeGlobals(): void {
  delete (window as unknown as { __mcpBridge?: unknown }).__mcpBridge;
  delete (window as unknown as { __mcpBridgeInitState?: unknown }).__mcpBridgeInitState;
}

function installNotificationGuards(): void {
  const bridge = (
    window as unknown as {
      __mcpBridge?: {
        tabServer?: { notification?: (...args: unknown[]) => Promise<unknown> };
        iframeServer?: { notification?: (...args: unknown[]) => Promise<unknown> };
      };
    }
  ).__mcpBridge;

  if (!bridge) {
    return;
  }

  const wrap = (server?: { notification?: (...args: unknown[]) => Promise<unknown> }) => {
    if (!server?.notification) {
      return;
    }
    const original = server.notification.bind(server);
    server.notification = async (...args: unknown[]) => {
      try {
        return await original(...args);
      } catch {
        return;
      }
    };
  };

  wrap(bridge.tabServer);
  wrap(bridge.iframeServer);
}

function requireModelContext(): ModelContext {
  const modelContext = navigator.modelContext;
  if (!modelContext) {
    throw new Error('Expected navigator.modelContext to be available');
  }
  return modelContext as unknown as ModelContext;
}

function requireBridgeMode(): ExpectedBridgeMode {
  const initState = (window as unknown as { __mcpBridgeInitState?: { mode?: string } })
    .__mcpBridgeInitState;
  const mode = initState?.mode;
  if (mode !== 'polyfill-installed' && mode !== 'native') {
    throw new Error(`Unexpected bridge mode: ${String(mode)}`);
  }
  return mode;
}

export function runRuntimeCoreConformanceSuite(options: RuntimeConformanceOptions): void {
  describe(options.suiteName, () => {
    beforeAll(async () => {
      resetBridgeGlobals();
      try {
        cleanupWebModelContext();
      } catch {
        // Best-effort cleanup only.
      }

      const hasNativeContextBefore = Boolean(navigator.modelContext);
      const hasNativeTestingBefore = Boolean(navigator.modelContextTesting);
      const hasNativeBefore = hasNativeContextBefore && hasNativeTestingBefore;

      expect(hasNativeBefore).toBe(options.expectNativeApiBeforeInit);

      initializeWebModelContext(TEST_INIT_OPTIONS);
      installNotificationGuards();
      await flushMicrotasks(2);

      expect(requireBridgeMode()).toBe(options.expectedBridgeMode);
    });

    afterAll(() => {
      try {
        cleanupWebModelContext();
      } catch {
        // Best-effort cleanup only.
      }
      resetBridgeGlobals();
    });

    beforeEach(async () => {
      const modelContext = requireModelContext();
      modelContext.clearContext();
      await flushMicrotasks(2);
    });

    it('supports provideContext() replacement semantics', async () => {
      const modelContext = requireModelContext();

      modelContext.provideContext({ tools: [] });
      await flushMicrotasks(2);

      modelContext.registerTool({
        name: 'dynamic_before_provide',
        description: 'Dynamic tool',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'dynamic' }] };
        },
      });
      await flushMicrotasks(2);
      expect(modelContext.listTools().map((tool) => tool.name)).toContain('dynamic_before_provide');

      modelContext.provideContext({
        tools: [
          {
            name: 'base_after_provide',
            description: 'Base tool',
            inputSchema: { type: 'object', properties: {} },
            async execute() {
              return { content: [{ type: 'text', text: 'base' }] };
            },
          },
        ],
      });
      await flushMicrotasks(2);

      const toolNames = modelContext.listTools().map((tool) => tool.name);
      expect(toolNames).toContain('base_after_provide');
      expect(toolNames).not.toContain('dynamic_before_provide');
    });

    it('registerTool() returns undefined and duplicate names throw', () => {
      const modelContext = requireModelContext();

      const result = modelContext.registerTool({
        name: 'duplicate_name_case',
        description: 'First registration',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'first' }] };
        },
      });

      expect(result).toBeUndefined();
      expect(() =>
        modelContext.registerTool({
          name: 'duplicate_name_case',
          description: 'Second registration',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'second' }] };
          },
        })
      ).toThrow();
    });

    it('applies default inputSchema and throws on invalid schema', async () => {
      const modelContext = requireModelContext();

      modelContext.registerTool({
        name: 'default_schema_case',
        description: 'No explicit schema',
        async execute() {
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      });
      await flushMicrotasks(2);

      await expect(
        modelContext.callTool({
          name: 'default_schema_case',
          arguments: {},
        })
      ).resolves.toMatchObject({
        content: [{ type: 'text', text: 'ok' }],
      });

      expect(() =>
        modelContext.registerTool({
          name: 'invalid_schema_case',
          description: 'Invalid schema',
          inputSchema: { type: 'not-a-valid-json-schema-type' } as unknown as InputSchema,
          async execute() {
            return { content: [{ type: 'text', text: 'invalid' }] };
          },
        })
      ).toThrow();
    });

    it('unregisterTool(name) removes tools; unknown-name behavior is runtime-defined', async () => {
      const modelContext = requireModelContext();

      modelContext.registerTool({
        name: 'remove_me',
        description: 'Removal test',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'remove_me' }] };
        },
      });
      await flushMicrotasks(2);

      expect(modelContext.listTools().map((tool) => tool.name)).toContain('remove_me');
      modelContext.unregisterTool('remove_me');
      await flushMicrotasks(2);
      expect(modelContext.listTools().map((tool) => tool.name)).not.toContain('remove_me');

      try {
        modelContext.unregisterTool('unknown_tool_name');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Native Chromium currently throws InvalidStateError for unknown names.
        expect(message).toMatch(/invalid tool name|not registered/i);
      }
    });

    it('executes registered tools via callTool', async () => {
      const modelContext = requireModelContext();

      modelContext.registerTool({
        name: 'call_tool_case',
        description: 'Basic callTool execution',
        inputSchema: { type: 'object', properties: { value: { type: 'number' } } },
        async execute(args) {
          return {
            content: [{ type: 'text', text: `value:${String(args.value)}` }],
          };
        },
      });
      await flushMicrotasks(2);

      await expect(
        modelContext.callTool({
          name: 'call_tool_case',
          arguments: { value: 7 },
        })
      ).resolves.toMatchObject({
        content: [{ type: 'text', text: 'value:7' }],
      });
    });
  });
}
