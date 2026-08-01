import type {
  ChromeModelContextExtensions,
  InputSchema,
  ModelContext,
  ModelContextRegisterToolOptions,
  ToolDescriptor,
  WebMcpToolInput,
} from '@mcp-b/webmcp-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as polyfillRoot from './index.js';
import { cleanupWebMCPPolyfill, initializeWebMCPPolyfill } from './index.js';
import { normalizeInputSchema, normalizeToolResponse } from './schema.js';

type CompatModelContext = {
  executeTool: NonNullable<ChromeModelContextExtensions['executeTool']>;
  registerTool(tool: ToolDescriptor, options?: ModelContextRegisterToolOptions): Promise<void>;
};

function asPolyfillInputSchema(schema: unknown): InputSchema {
  return schema as InputSchema;
}

function getCompatModelContext(): CompatModelContext {
  return document.modelContext as unknown as CompatModelContext;
}

function getDeprecatedNavigatorModelContext(): NonNullable<Navigator['modelContext']> {
  const context = navigator.modelContext;
  if (!context) {
    throw new Error('Expected the deprecated navigator.modelContext alias');
  }
  return context;
}

function initializeTestPolyfill(): void {
  initializeWebMCPPolyfill({ installTestingShim: true });
}

async function expectInvalidStateError(
  register: () => Promise<void>,
  message?: string | RegExp
): Promise<void> {
  try {
    await register();
    expect.fail('Expected registerTool to reject with InvalidStateError');
  } catch (error) {
    expect(error).toMatchObject({ name: 'InvalidStateError' });
    if (message !== undefined) {
      expect((error as Error).message).toEqual(expect.stringMatching(message));
    }
  }
}

describe('@mcp-b/webmcp-polyfill', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanupWebMCPPolyfill();
    vi.restoreAllMocks();
  });

  it('exports stable initialization and cleanup functions', () => {
    expect(typeof initializeWebMCPPolyfill).toBe('function');
    expect(typeof cleanupWebMCPPolyfill).toBe('function');
  });

  it('keeps schema utilities on the schema entry point', () => {
    expect('normalizeInputSchema' in polyfillRoot).toBe(false);
    expect('toJsonValue' in polyfillRoot).toBe(false);
    expect(typeof normalizeToolResponse).toBe('function');
  });

  it('installs strict core methods on document.modelContext', () => {
    initializeTestPolyfill();

    expect(
      typeof (document.modelContext as unknown as { provideContext?: unknown }).provideContext
    ).toBe('undefined');
    expect(
      typeof (document.modelContext as unknown as { clearContext?: unknown }).clearContext
    ).toBe('undefined');
    expect(typeof document.modelContext.registerTool).toBe('function');
    expect(typeof document.modelContext.getTools).toBe('function');
    expect(
      (document.modelContext as unknown as { unregisterTool?: unknown }).unregisterTool
    ).toBeUndefined();
    expect(typeof document.modelContext.ontoolchange).toBe('object');
    expect((document.modelContext as unknown as { callTool?: unknown }).callTool).toBeUndefined();
  });

  it('installs the exposed ModelContext constructor and brands the context instance', () => {
    initializeTestPolyfill();

    const constructor = Reflect.get(globalThis, 'ModelContext') as
      | (Function & { prototype: object })
      | undefined;
    expect(constructor).toBeTypeOf('function');
    if (typeof constructor !== 'function') throw new Error('Expected ModelContext constructor');

    expect(document.modelContext).toBeInstanceOf(constructor);
    expect(Object.getPrototypeOf(document.modelContext)).toBe(constructor.prototype);
    expect(document.modelContext.constructor).toBe(constructor);
    expect(Object.prototype.toString.call(document.modelContext)).toBe('[object ModelContext]');
    expect(() => Reflect.construct(constructor, [])).toThrow(TypeError);
    expect(Object.getOwnPropertyDescriptor(globalThis, 'ModelContext')).toMatchObject({
      configurable: true,
      enumerable: false,
      writable: true,
      value: constructor,
    });
  });

  it('installs readonly document descriptor and deprecated navigator accessor', () => {
    initializeTestPolyfill();

    const documentDescriptor = Object.getOwnPropertyDescriptor(document, 'modelContext');
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(navigator, 'modelContext');

    expect(documentDescriptor).toMatchObject({
      configurable: true,
      enumerable: true,
      writable: false,
      value: document.modelContext,
    });
    expect(navigatorDescriptor?.configurable).toBe(true);
    expect(navigatorDescriptor?.enumerable).toBe(true);
    expect(typeof navigatorDescriptor?.get).toBe('function');
    expect(navigatorDescriptor?.set).toBeUndefined();
    expect('value' in (navigatorDescriptor ?? {})).toBe(false);
    expect('writable' in (navigatorDescriptor ?? {})).toBe(false);

    const originalDocumentModelContext = document.modelContext;
    expect(() => {
      (document as unknown as { modelContext: unknown }).modelContext = { fake: true };
    }).toThrow();
    expect(document.modelContext).toBe(originalDocumentModelContext);
  });

  it('document.modelContext and navigator.modelContext share the same instance', async () => {
    initializeTestPolyfill();

    // Per WebMCP PR #184, document.modelContext is canonical and
    // navigator.modelContext is a deprecated alias to the same registry.
    // Tools registered on either surface must be observable on the other.
    expect(document.modelContext).toBe(getDeprecatedNavigatorModelContext());

    await getDeprecatedNavigatorModelContext().registerTool({
      name: 'shared_registry_tool',
      description: 'Tool registered via navigator.modelContext',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    });

    await expect(
      document.modelContext.registerTool({
        name: 'shared_registry_tool',
        description: 'Conflicting registration via document.modelContext',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => ({ content: [{ type: 'text', text: 'second' }] }),
      })
    ).rejects.toThrow('Tool already registered: shared_registry_tool');
  });

  it('logs a one-time deprecation warning when navigator.modelContext is accessed', () => {
    initializeTestPolyfill();

    const warnSpy = vi.mocked(console.warn);
    void getDeprecatedNavigatorModelContext();
    void getDeprecatedNavigatorModelContext();

    expect(warnSpy).toHaveBeenCalledWith(
      '[WebMCPPolyfill] navigator.modelContext is deprecated. The May 27, 2026 WebMCP draft moved the modelContext getter from Navigator to Document — use document.modelContext instead. See https://github.com/webmachinelearning/webmcp/pull/184.'
    );
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('does not warn when accessing document.modelContext', () => {
    initializeTestPolyfill();

    const warnSpy = vi.mocked(console.warn);
    void document.modelContext;
    void document.modelContext;

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('document.modelContext registerTool resolves undefined and throws on duplicates', async () => {
    initializeTestPolyfill();

    const firstResult = document.modelContext.registerTool({
      name: 'echo',
      description: 'Echo back input',
      inputSchema: { type: 'object', properties: { message: { type: 'string' } } },
      execute: async (args) => ({ content: [{ type: 'text', text: String(args.message ?? '') }] }),
    });

    await expect(firstResult).resolves.toBeUndefined();
    await expect(
      document.modelContext.registerTool({
        name: 'echo',
        description: 'Echo back input again',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => ({ content: [{ type: 'text', text: 'second' }] }),
      })
    ).rejects.toThrow('Tool already registered: echo');
  });

  it('serializes inputSchema without semantically validating JSON Schema keywords', async () => {
    initializeTestPolyfill();

    await expect(
      document.modelContext.registerTool({
        name: 'schema_metadata_tool',
        description: 'Schema metadata',
        inputSchema: {
          type: 123 as unknown as string,
        },
        execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      })
    ).resolves.toBeUndefined();

    await expect(document.modelContext.getTools()).resolves.toMatchObject([
      {
        name: 'schema_metadata_tool',
        inputSchema: '{"type":123}',
      },
    ]);
  });

  it('invokes the standard execute callback with only the input argument', async () => {
    initializeTestPolyfill();
    let argumentCount = 0;

    await document.modelContext.registerTool({
      name: 'standard_callback_shape',
      description: 'Checks the WebMCP callback shape',
      async execute() {
        argumentCount = arguments.length;
        return 'ok';
      },
    });

    const [tool] = await document.modelContext.getTools();
    if (!tool) throw new Error('Expected the registered tool');
    await getCompatModelContext().executeTool(tool, '{}');
    expect(argumentCount).toBe(1);
  });

  it('registerTool with options.signal unregisters when the signal aborts', async () => {
    initializeTestPolyfill();

    const tool = {
      name: 'signal_tool',
      description: 'Signal-driven tool',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    };

    const ac = new AbortController();
    await document.modelContext.registerTool(tool, { signal: ac.signal });

    await expect(document.modelContext.registerTool(tool)).rejects.toThrow(
      'Tool already registered: signal_tool'
    );

    ac.abort();

    await expect(document.modelContext.registerTool(tool)).resolves.toBeUndefined();
  });

  it('registerTool with a pre-aborted signal rejects and does not register the tool', async () => {
    initializeTestPolyfill();

    const ac = new AbortController();
    const reason = { code: 'registration-cancelled' };
    ac.abort(reason);

    const tool = {
      name: 'preaborted_tool',
      description: 'Pre-aborted tool',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ content: [{ type: 'text', text: 'never' }] }),
    };

    await expect(document.modelContext.registerTool(tool, { signal: ac.signal })).rejects.toBe(
      reason
    );

    await expect(document.modelContext.registerTool(tool)).resolves.toBeUndefined();
  });

  it('does not register when the signal aborts during option conversion', async () => {
    initializeTestPolyfill();

    const controller = new AbortController();
    const reason = { code: 'cancelled-during-options' };
    const exposedTo = [''];
    Object.defineProperty(exposedTo, 0, {
      get() {
        controller.abort(reason);
        return window.location.origin;
      },
    });

    await expect(
      document.modelContext.registerTool(
        {
          name: 'aborted_during_options',
          description: 'Must not leak into the registry',
          execute: async () => ({ content: [{ type: 'text', text: 'never' }] }),
        },
        { exposedTo, signal: controller.signal }
      )
    ).rejects.toBe(reason);

    await expect(document.modelContext.getTools()).resolves.toEqual([]);
  });

  it('rejects registration, discovery, and execution from a detached document', async () => {
    const iframe = document.createElement('iframe');
    const readyMessage = `webmcp-polyfill-ready-${crypto.randomUUID()}`;
    const moduleUrl = new URL('./index.ts', import.meta.url).href;
    const loaded = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error('Timed out installing the polyfill in the iframe')),
        2_000
      );
      const receiveReady = (event: MessageEvent) => {
        if (event.source !== iframe.contentWindow || event.data !== readyMessage) return;
        window.clearTimeout(timeout);
        window.removeEventListener('message', receiveReady);
        resolve();
      };
      window.addEventListener('message', receiveReady);
    });

    iframe.srcdoc = `<script type="module">
      const { initializeWebMCPPolyfill } = await import(${JSON.stringify(moduleUrl)});
      initializeWebMCPPolyfill();
      parent.postMessage(${JSON.stringify(readyMessage)}, '*');
    </script>`;
    document.body.append(iframe);
    await loaded;

    const detachedContext = iframe.contentDocument?.modelContext;
    if (!detachedContext) throw new Error('Expected the iframe ModelContext');
    await detachedContext.registerTool({
      name: 'detached_document_tool',
      description: 'Must not run after its document is detached',
      execute: async () => 'never',
    });
    const [detachedTool] = await detachedContext.getTools();
    if (!detachedTool) throw new Error('Expected a registered iframe tool');
    iframe.remove();

    await expect(
      detachedContext.registerTool({
        name: 'detached_document_tool',
        description: 'Must not register after its document is detached',
        execute: async () => ({ content: [{ type: 'text', text: 'never' }] }),
      })
    ).rejects.toMatchObject({ name: 'InvalidStateError' });
    await expect(detachedContext.getTools()).rejects.toMatchObject({ name: 'InvalidStateError' });
    const executeTool = (detachedContext as ModelContext & ChromeModelContextExtensions)
      .executeTool;
    if (!executeTool) throw new Error('Expected executeTool');
    await expect(executeTool.call(detachedContext, detachedTool, '{}')).rejects.toMatchObject({
      name: 'InvalidStateError',
    });
  });

  it('rejects registry access when Permissions Policy disables WebMCP', async () => {
    initializeTestPolyfill();
    await document.modelContext.registerTool({
      name: 'policy_tool',
      description: 'Permissions Policy test tool',
      execute: async () => 'never',
    });
    const [tool] = await document.modelContext.getTools();
    if (!tool) throw new Error('Expected a registered tool');

    const previous = Object.getOwnPropertyDescriptor(document, 'featurePolicy');
    Object.defineProperty(document, 'featurePolicy', {
      configurable: true,
      value: {
        features: () => ['tools'],
        allowsFeature: () => false,
      },
    });

    try {
      const expected = { name: 'NotAllowedError' };
      await expect(
        document.modelContext.registerTool({
          name: 'blocked_tool',
          description: 'Must not register',
          execute: async () => 'never',
        })
      ).rejects.toMatchObject(expected);
      await expect(document.modelContext.getTools()).rejects.toMatchObject(expected);
      await expect(getCompatModelContext().executeTool(tool, '{}')).rejects.toMatchObject(expected);
    } finally {
      if (previous) Object.defineProperty(document, 'featurePolicy', previous);
      else Reflect.deleteProperty(document, 'featurePolicy');
    }
  });

  it('does not let an old registration signal remove a same-name replacement', async () => {
    initializeTestPolyfill();
    const originalController = new AbortController();
    const original = {
      name: 'signal_replacement_tool',
      description: 'Original registration',
      execute: async () => ({ version: 'original' }),
    };
    await document.modelContext.registerTool(original, { signal: originalController.signal });
    originalController.abort();

    await document.modelContext.registerTool({
      ...original,
      description: 'Replacement registration',
      execute: async () => ({ version: 'replacement' }),
    });
    const [registered] = await document.modelContext.getTools();
    expect(registered?.name).toBe('signal_replacement_tool');
    await expect(getCompatModelContext().executeTool(registered!, '{}')).resolves.toBe(
      '{"version":"replacement"}'
    );
  });

  it('rejects untrustworthy cross-origin options with SecurityError', async () => {
    initializeTestPolyfill();

    await expect(
      document.modelContext.registerTool(
        {
          name: 'untrustworthy_exposure',
          description: 'Must not register',
          execute: async () => null,
        },
        { exposedTo: ['http://example.com'] }
      )
    ).rejects.toMatchObject({ name: 'SecurityError' });
    await expect(
      document.modelContext.getTools({ fromOrigins: ['not an origin'] })
    ).rejects.toMatchObject({ name: 'SecurityError' });
  });

  it('fires toolchange event for registry mutations', async () => {
    initializeTestPolyfill();

    let count = 0;
    navigator.modelContextTesting?.addEventListener('toolchange', () => {
      count += 1;
    });

    const controller = new AbortController();
    await document.modelContext.registerTool(
      {
        name: 't1',
        description: 'tool 1',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      },
      { signal: controller.signal }
    );

    controller.abort();

    await vi.waitFor(() => {
      expect(count).toBe(2);
    });
  });

  it('exposes native-shaped getTools on document.modelContext', async () => {
    initializeTestPolyfill();

    await document.modelContext.registerTool({
      name: 'native_get_tools_shape',
      title: 'Native Tool',
      description: 'Native getTools shape',
      inputSchema: {
        type: 'object',
        properties: { value: { type: 'number' } },
        required: ['value'],
      },
      execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    });

    await expect(document.modelContext.getTools()).resolves.toEqual([
      {
        name: 'native_get_tools_shape',
        title: 'Native Tool',
        description: 'Native getTools shape',
        inputSchema:
          '{"type":"object","properties":{"value":{"type":"number"}},"required":["value"]}',
        origin: window.location.origin,
        window,
      },
    ]);
  });

  it('returns strict, sorted WebMCP tool metadata', async () => {
    initializeTestPolyfill();

    const exactSchema = {
      properties: { value: { type: 'string' } },
      required: ['value'],
      additionalProperties: false,
    };

    await document.modelContext.registerTool({
      name: 'a_tool',
      description: 'No schema',
      execute: async () => ({ content: [] }),
    });
    await getCompatModelContext().registerTool({
      name: 'Z_tool',
      description: 'Exact schema and sanitized annotations',
      inputSchema: exactSchema,
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false,
        destructiveHint: true,
        title: 'MCP-only annotation',
      },
      execute: async () => ({ content: [] }),
    });
    await document.modelContext.registerTool({
      name: '_tool',
      description: 'Sort sentinel',
      execute: async () => ({ content: [] }),
    });

    const tools = await document.modelContext.getTools();

    expect(tools.map(({ name }) => name)).toEqual(['Z_tool', '_tool', 'a_tool']);
    expect(tools[0]).toMatchObject({
      title: '',
      inputSchema: JSON.stringify(exactSchema),
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false,
      },
    });
    expect(tools[0]?.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: false,
    });
    expect(tools[2]).not.toHaveProperty('inputSchema');
  });

  it('rejects unsupported cross-document discovery', async () => {
    initializeTestPolyfill();
    await expect(
      document.modelContext.getTools({ fromOrigins: ['https://example.com'] })
    ).rejects.toMatchObject({ name: 'NotSupportedError' });
    await expect(document.modelContext.getTools({ fromOrigins: [] })).resolves.toEqual([]);
  });

  it('executes registered tool objects from document.modelContext.getTools', async () => {
    initializeTestPolyfill();

    await document.modelContext.registerTool({
      name: 'native_execute_tool_shape',
      title: 'Native Execute Tool',
      description: 'Native executeTool shape',
      inputSchema: {
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['value'],
      },
      execute: async (args) => ({ echoed: args.value }),
    });

    const [tool] = await document.modelContext.getTools();
    const result = await getCompatModelContext().executeTool(
      tool!,
      JSON.stringify({ value: 'ok' })
    );

    expect(result).toBe('{"echoed":"ok"}');
  });

  it('rejects opaque origins and disabled origin isolation during native-shaped execution', async () => {
    initializeTestPolyfill();
    await document.modelContext.registerTool({
      name: 'secured_execute_tool',
      description: 'Checks execution security gates',
      execute: async () => 'ok',
    });
    const [tool] = await document.modelContext.getTools();

    await expect(
      getCompatModelContext().executeTool({ ...tool!, origin: 'data:text/html,test' }, '{}')
    ).rejects.toMatchObject({ name: 'NotSupportedError' });

    const previous = Object.getOwnPropertyDescriptor(globalThis, 'originAgentCluster');
    Object.defineProperty(globalThis, 'originAgentCluster', {
      configurable: true,
      value: false,
    });
    try {
      await expect(getCompatModelContext().executeTool(tool!, '{}')).rejects.toMatchObject({
        name: 'SecurityError',
      });
    } finally {
      if (previous) Object.defineProperty(globalThis, 'originAgentCluster', previous);
      else delete (globalThis as { originAgentCluster?: boolean }).originAgentCluster;
    }
  });

  it('fires producer toolchange events and ontoolchange for document registry mutations', async () => {
    initializeTestPolyfill();

    let listenerCount = 0;
    let handlerCount = 0;
    document.modelContext.addEventListener('toolchange', () => {
      listenerCount += 1;
    });
    let handlerTarget: EventTarget | null = null;
    let handlerThis: ModelContext | null = null;
    document.modelContext.ontoolchange = function (event) {
      handlerCount += 1;
      handlerTarget = event.target;
      // oxlint-disable-next-line typescript/no-this-alias -- verifies EventHandler `this` binding.
      handlerThis = this;
    };

    const controller = new AbortController();
    await document.modelContext.registerTool(
      {
        name: 'producer_event_tool',
        description: 'Producer event tool',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      },
      { signal: controller.signal }
    );

    controller.abort();
    await vi.waitFor(() => {
      expect(listenerCount).toBe(2);
      expect(handlerCount).toBe(2);
    });
    expect(handlerTarget).toBe(document.modelContext);
    expect(handlerThis).toBe(document.modelContext);
  });

  it('keeps the ontoolchange listener position when its callback is replaced', async () => {
    initializeTestPolyfill();
    const order: string[] = [];
    document.modelContext.ontoolchange = () => order.push('first');
    document.modelContext.addEventListener('toolchange', () => order.push('listener'));
    document.modelContext.ontoolchange = () => order.push('replacement');

    await document.modelContext.registerTool({
      name: 'handler_order_tool',
      description: 'Checks event handler ordering',
      execute: async () => null,
    });

    expect(order).toEqual(['replacement', 'listener']);
  });

  it('re-adds ontoolchange after listeners when it was cleared', async () => {
    initializeTestPolyfill();
    const order: string[] = [];
    document.modelContext.ontoolchange = () => order.push('first');
    document.modelContext.addEventListener('toolchange', () => order.push('listener'));
    document.modelContext.ontoolchange = null;
    document.modelContext.ontoolchange = () => order.push('replacement');

    await document.modelContext.registerTool({
      name: 'readded_handler_order_tool',
      description: 'Checks re-added event handler ordering',
      execute: async () => null,
    });

    expect(order).toEqual(['listener', 'replacement']);
  });

  // =========================================================================
  // Initialization & cleanup edge cases
  // =========================================================================

  describe('initializeWebMCPPolyfill options', () => {
    it('does not override existing document.modelContext when one already exists', () => {
      // First install
      initializeTestPolyfill();
      // Cleanup and manually set something
      cleanupWebMCPPolyfill();

      // Set a fake modelContext
      const fakeContext = { fake: true } as unknown as Document['modelContext'];
      Object.defineProperty(document, 'modelContext', {
        configurable: true,
        enumerable: true,
        writable: false,
        value: fakeContext,
      });

      initializeTestPolyfill();
      expect((document.modelContext as unknown as { fake?: boolean }).fake).toBe(true);
      expect('modelContext' in navigator).toBe(false);

      // Cleanup manually
      delete (document as unknown as Record<string, unknown>).modelContext;
    });

    it('aliases legacy native navigator.modelContext onto document.modelContext', () => {
      const fakeContext = { fake: true } as unknown as Navigator['modelContext'];
      Object.defineProperty(navigator, 'modelContext', {
        configurable: true,
        enumerable: true,
        get: () => fakeContext,
      });

      initializeTestPolyfill();

      expect(document.modelContext).toBe(fakeContext);
      expect(getDeprecatedNavigatorModelContext()).toBe(fakeContext);
      expect(navigator.modelContextTesting).toBeUndefined();

      cleanupWebMCPPolyfill();
      expect('modelContext' in document).toBe(false);
      expect(getDeprecatedNavigatorModelContext()).toBe(fakeContext);

      delete (navigator as unknown as Record<string, unknown>).modelContext;
    });

    it('does not override native document and navigator modelContext when both exist', () => {
      const documentContext = { documentNative: true } as unknown as Document['modelContext'];
      const navigatorContext = { navigatorNative: true } as unknown as Navigator['modelContext'];
      Object.defineProperty(document, 'modelContext', {
        configurable: true,
        enumerable: true,
        get: () => documentContext,
      });
      Object.defineProperty(navigator, 'modelContext', {
        configurable: true,
        enumerable: true,
        get: () => navigatorContext,
      });

      initializeTestPolyfill();

      expect(document.modelContext).toBe(documentContext);
      expect(getDeprecatedNavigatorModelContext()).toBe(navigatorContext);
      expect(navigator.modelContextTesting).toBeUndefined();

      cleanupWebMCPPolyfill();
      expect(document.modelContext).toBe(documentContext);
      expect(getDeprecatedNavigatorModelContext()).toBe(navigatorContext);

      delete (document as unknown as Record<string, unknown>).modelContext;
      delete (navigator as unknown as Record<string, unknown>).modelContext;
    });

    it('does not install modelContextTesting by default', () => {
      initializeWebMCPPolyfill();
      expect(document.modelContext).toBeDefined();
      expect(navigator.modelContextTesting).toBeUndefined();
    });

    it('does not override existing modelContextTesting by default', () => {
      const existingTesting = {
        existing: true,
      } as unknown as Navigator['modelContextTesting'];
      Object.defineProperty(navigator, 'modelContextTesting', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: existingTesting,
      });

      initializeTestPolyfill();

      expect(document.modelContext).toBeDefined();
      expect(navigator.modelContextTesting).toBe(existingTesting);

      cleanupWebMCPPolyfill();
      delete (navigator as unknown as Record<string, unknown>).modelContextTesting;
    });

    it('is idempotent when already installed', () => {
      initializeTestPolyfill();
      const first = document.modelContext;

      initializeTestPolyfill();
      const second = document.modelContext;

      expect(first).toBe(second);
      expect(typeof second.registerTool).toBe('function');
    });

    it('rolls back earlier property installs when a later install fails', async () => {
      const iframe = document.createElement('iframe');
      const moduleUrl = new URL('./index.ts', import.meta.url).href;
      iframe.srcdoc = `<script type="module">
        Object.defineProperty(navigator, 'modelContext', {
          configurable: false,
          value: undefined,
        });
        const { initializeWebMCPPolyfill } = await import(${JSON.stringify(moduleUrl)});
        let errorName = null;
        try {
          initializeWebMCPPolyfill();
        } catch (error) {
          errorName = error?.name ?? 'UnknownError';
        }
        document.documentElement.dataset.rollbackResult = JSON.stringify({
          errorName,
          documentInstalled: 'modelContext' in document,
          constructorInstalled: 'ModelContext' in window,
        });
      </script>`;
      document.body.append(iframe);

      try {
        await vi.waitFor(() => {
          expect(iframe.contentDocument?.documentElement.dataset.rollbackResult).toBeDefined();
        });
        expect(
          JSON.parse(iframe.contentDocument!.documentElement.dataset.rollbackResult ?? '{}')
        ).toEqual({
          errorName: 'TypeError',
          documentInstalled: false,
          constructorInstalled: false,
        });
      } finally {
        iframe.remove();
      }
    });
  });

  describe('cleanupWebMCPPolyfill', () => {
    it('does not mutate pre-existing descriptors when initialization no-ops', () => {
      // Set a fake modelContext first
      const originalFake = { original: true } as unknown as Navigator['modelContext'];
      Object.defineProperty(navigator, 'modelContext', {
        configurable: true,
        enumerable: true,
        writable: false,
        value: originalFake,
      });

      const originalTestingFake = {
        originalTesting: true,
      } as unknown as Navigator['modelContextTesting'];
      Object.defineProperty(navigator, 'modelContextTesting', {
        configurable: true,
        enumerable: true,
        writable: false,
        value: originalTestingFake,
      });

      initializeTestPolyfill();
      expect((document.modelContext as unknown as { original?: boolean }).original).toBe(true);

      cleanupWebMCPPolyfill();
      expect(
        (getDeprecatedNavigatorModelContext() as unknown as { original?: boolean }).original
      ).toBe(true);
      expect(
        (navigator.modelContextTesting as unknown as { originalTesting?: boolean }).originalTesting
      ).toBe(true);

      // Final cleanup
      delete (navigator as unknown as Record<string, unknown>).modelContext;
      delete (navigator as unknown as Record<string, unknown>).modelContextTesting;
    });

    it('removes installed document and navigator surfaces after a full polyfill install', () => {
      initializeTestPolyfill();
      expect(document.modelContext).toBeDefined();
      expect(getDeprecatedNavigatorModelContext()).toBeDefined();

      cleanupWebMCPPolyfill();

      expect('modelContext' in document).toBe(false);
      expect('modelContext' in navigator).toBe(false);
    });

    it('detaches registration lifetimes during cleanup', async () => {
      initializeTestPolyfill();
      const testing = navigator.modelContextTesting;
      const controller = new AbortController();
      let changes = 0;
      testing?.addEventListener('toolchange', () => {
        changes += 1;
      });

      await document.modelContext.registerTool(
        {
          name: 'cleanup_signal_tool',
          description: 'Cleanup signal tool',
          execute: async () => 'ok',
        },
        { signal: controller.signal }
      );
      cleanupWebMCPPolyfill();
      controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(changes).toBe(1);
    });

    it('restores a pre-existing global ModelContext descriptor', () => {
      const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'ModelContext');
      const existingConstructor = function ExistingModelContext() {};
      Object.defineProperty(globalThis, 'ModelContext', {
        configurable: true,
        enumerable: true,
        get: () => existingConstructor,
      });
      const existingDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'ModelContext');

      try {
        initializeTestPolyfill();
        expect(Reflect.get(globalThis, 'ModelContext')).not.toBe(existingConstructor);

        cleanupWebMCPPolyfill();

        expect(Object.getOwnPropertyDescriptor(globalThis, 'ModelContext')).toEqual(
          existingDescriptor
        );
        expect(Reflect.get(globalThis, 'ModelContext')).toBe(existingConstructor);
      } finally {
        if (originalDescriptor) {
          Object.defineProperty(globalThis, 'ModelContext', originalDescriptor);
        } else {
          Reflect.deleteProperty(globalThis, 'ModelContext');
        }
      }
    });
  });

  // =========================================================================
  // normalizeToolDescriptor validation
  // =========================================================================

  describe('normalizeToolDescriptor validation', () => {
    it('throws when tool is not an object', async () => {
      initializeTestPolyfill();
      await expect(
        document.modelContext.registerTool(
          null as unknown as Parameters<typeof document.modelContext.registerTool>[0]
        )
      ).rejects.toThrow('registerTool(tool) requires a tool object');
    });

    it('throws InvalidStateError when tool name is empty', async () => {
      initializeTestPolyfill();
      await expectInvalidStateError(
        () =>
          document.modelContext.registerTool({
            name: '',
            description: 'test',
            execute: async () => ({ content: [] }),
          }),
        'Tool "name" must be a non-empty string'
      );
    });

    it('applies WebIDL string coercion to tool metadata', async () => {
      initializeTestPolyfill();
      await document.modelContext.registerTool({
        name: 42 as unknown as string,
        title: 7 as unknown as string,
        description: 123 as unknown as string,
        annotations: {
          readOnlyHint: 1 as unknown as boolean,
          untrustedContentHint: 0 as unknown as boolean,
        },
        execute: async () => ({ content: [] }),
      });

      await expect(document.modelContext.getTools()).resolves.toMatchObject([
        {
          name: '42',
          title: '7',
          description: '123',
          annotations: {
            readOnlyHint: true,
            untrustedContentHint: false,
          },
        },
      ]);
    });

    it('throws InvalidStateError when tool description is empty', async () => {
      initializeTestPolyfill();
      await expectInvalidStateError(
        () =>
          document.modelContext.registerTool({
            name: 'test',
            description: '',
            execute: async () => ({ content: [] }),
          }),
        'Tool "description" must be a non-empty string'
      );
    });

    it('rejects symbols during WebIDL string coercion', async () => {
      initializeTestPolyfill();
      await expect(
        document.modelContext.registerTool({
          name: Symbol('tool') as unknown as string,
          description: 'test',
          execute: async () => ({ content: [] }),
        })
      ).rejects.toThrow(TypeError);
    });

    const invalidToolNameMessage =
      /Tool "name" must be 1–128 characters and contain only ASCII alphanumeric, underscore, hyphen, or period/;

    it.each([
      ['zero-width space', 'tool\u200Bname'],
      ['Cyrillic homoglyph', 't\u043Eo\u043Bl'],
      ['ASCII space', 'tool name'],
      ['colon', 'tool:name'],
      ['more than 128 characters', 'a'.repeat(129)],
    ])('throws InvalidStateError for a tool name containing %s', async (_case, name) => {
      initializeTestPolyfill();
      await expectInvalidStateError(
        () =>
          document.modelContext.registerTool({
            name,
            description: 'test',
            execute: async () => ({ content: [] }),
          }),
        invalidToolNameMessage
      );
    });

    it('accepts tool name with underscore, period, and hyphen', async () => {
      initializeTestPolyfill();
      await expect(
        document.modelContext.registerTool({
          name: 'a._-b',
          description: 'test',
          execute: async () => ({ content: [] }),
        })
      ).resolves.toBeUndefined();
    });

    it('accepts tool name with exactly 128 characters', async () => {
      initializeTestPolyfill();
      await expect(
        document.modelContext.registerTool({
          name: 'a'.repeat(128),
          description: 'test',
          execute: async () => ({ content: [] }),
        })
      ).resolves.toBeUndefined();
    });

    it('throws when tool execute is not a function', async () => {
      initializeTestPolyfill();
      await expect(
        document.modelContext.registerTool({
          name: 'test',
          description: 'test desc',
          execute: 'not-a-function' as unknown as () => Promise<{ content: never[] }>,
        })
      ).rejects.toThrow('Tool "execute" must be a function');
    });

    it('throws when inputSchema is not an object', async () => {
      initializeTestPolyfill();
      await expect(
        document.modelContext.registerTool({
          name: 'test',
          description: 'test desc',
          inputSchema: 'not-object' as unknown as { type: string },
          execute: async () => ({ content: [] }),
        })
      ).rejects.toThrow('inputSchema must be an object');
    });

    it('omits inputSchema metadata when none is registered', async () => {
      initializeTestPolyfill();
      await document.modelContext.registerTool({
        name: 'no_schema',
        description: 'No schema tool',
        execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      });

      const tools = navigator.modelContextTesting?.listTools();
      expect(tools).toHaveLength(1);
      expect(tools?.[0]?.inputSchema).toBeUndefined();
    });

    it('preserves schemas that omit a root type', async () => {
      initializeTestPolyfill();
      await document.modelContext.registerTool({
        name: 'implicit_object_schema',
        description: 'Implicit object schema tool',
        inputSchema: {
          properties: {
            query: { type: 'string' },
          },
          required: ['query'],
        },
        execute: async ({ query }) => ({ content: [{ type: 'text', text: String(query) }] }),
      });

      const tools = navigator.modelContextTesting?.listTools();
      expect(tools).toHaveLength(1);
      expect(JSON.parse(tools?.[0]?.inputSchema ?? '{}')).toEqual({
        properties: { query: { type: 'string' } },
        required: ['query'],
      });
    });

    it('normalizes Standard Schema only for MCP-B consumers', () => {
      const targets: string[] = [];
      const standardSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: (value: unknown) => ({ value: value as WebMcpToolInput }),
          jsonSchema: {
            input: ({ target }: { target: string }) => {
              targets.push(target);
              if (target === 'draft-2020-12') throw new Error('unsupported target');
              return { type: 'object', properties: { count: { type: 'number' } } };
            },
            output: () => ({ type: 'object' }),
          },
        },
      };

      const normalized = normalizeInputSchema(asPolyfillInputSchema(standardSchema));

      expect(targets).toEqual(['draft-2020-12', 'draft-07']);
      expect(normalized.registeredInputSchema).toBe(
        '{"type":"object","properties":{"count":{"type":"number"}}}'
      );
      expect(Reflect.get(normalized.inputSchema, '~standard')).toBe(standardSchema['~standard']);
    });
  });

  // =========================================================================
  // inputSchema serialization semantics
  // =========================================================================

  describe('inputSchema serialization semantics', () => {
    it('rethrows the TypeError produced by JSON.stringify for circular schemas', async () => {
      initializeTestPolyfill();
      const circular: Record<string, unknown> = { type: 'object' };
      circular.self = circular;

      let error: unknown;
      try {
        await document.modelContext.registerTool({
          name: 'circular_schema',
          description: 'Circular schema',
          inputSchema: circular as never,
          execute: async () => ({ content: [] }),
        });
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(TypeError);
      expect((error as Error).message).toContain('circular');
    });

    it('rejects when inputSchema.toJSON returns undefined', async () => {
      initializeTestPolyfill();

      await expect(
        document.modelContext.registerTool({
          name: 'undefined_schema',
          description: 'Undefined serialized schema',
          inputSchema: {
            toJSON: () => undefined,
          } as never,
          execute: async () => ({ content: [] }),
        })
      ).rejects.toThrow('inputSchema must be JSON-serializable');
    });

    it('rethrows errors raised by inputSchema.toJSON', async () => {
      initializeTestPolyfill();
      const serializationError = new Error('schema serialization failed');

      await expect(
        document.modelContext.registerTool({
          name: 'throwing_schema',
          description: 'Throwing serialized schema',
          inputSchema: {
            toJSON() {
              throw serializationError;
            },
          } as never,
          execute: async () => ({ content: [] }),
        })
      ).rejects.toBe(serializationError);
    });

    it('exposes the exact JSON string produced through inputSchema.toJSON', async () => {
      initializeTestPolyfill();

      await document.modelContext.registerTool({
        name: 'custom_serialized_schema',
        description: 'Custom serialized schema',
        inputSchema: {
          toJSON: () => 'serialized-schema',
        } as never,
        execute: async () => ({ content: [] }),
      });

      await expect(document.modelContext.getTools()).resolves.toMatchObject([
        {
          name: 'custom_serialized_schema',
          inputSchema: '"serialized-schema"',
        },
      ]);
    });
  });

  // =========================================================================
  // Testing shim methods
  // =========================================================================

  describe('modelContextTesting', () => {
    it('listTools returns empty array when no tools registered', () => {
      initializeTestPolyfill();
      const tools = navigator.modelContextTesting?.listTools();
      expect(tools).toEqual([]);
    });

    it('listTools returns registered tools with serialized inputSchema', async () => {
      initializeTestPolyfill();
      await document.modelContext.registerTool({
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: { type: 'object', properties: { x: { type: 'number' } } },
        execute: async () => ({ content: [{ type: 'text', text: 'result' }] }),
      });

      const tools = navigator.modelContextTesting?.listTools();
      expect(tools).toHaveLength(1);
      expect(tools?.[0]?.name).toBe('test_tool');
      expect(tools?.[0]?.description).toBe('Test tool');
      expect(tools?.[0]?.inputSchema).toBeDefined();
      const parsed = JSON.parse(tools?.[0]?.inputSchema ?? '');
      expect(parsed.type).toBe('object');
    });

    it('listTools preserves an empty inputSchema', async () => {
      initializeTestPolyfill();
      await document.modelContext.registerTool({
        name: 'no_args_tool',
        description: 'Tool with no arguments',
        inputSchema: {},
        execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      });

      const tools = navigator.modelContextTesting?.listTools();
      expect(tools).toHaveLength(1);
      expect(tools?.[0]?.inputSchema).toBe('{}');
    });

    it('executeTool throws on unknown tool', async () => {
      initializeTestPolyfill();
      await expect(navigator.modelContextTesting?.executeTool('nonexistent', '{}')).rejects.toThrow(
        'Tool not found: nonexistent'
      );
    });

    it.each([
      ['invalid JSON', 'not-json'],
      ['a JSON primitive', '"hello"'],
      ['JSON null', 'null'],
    ])('executeTool rejects %s input', async (_case, input) => {
      initializeTestPolyfill();
      await document.modelContext.registerTool({
        name: 'tool1',
        description: 'Tool 1',
        execute: async () => ({ content: [] }),
      });

      await expect(navigator.modelContextTesting?.executeTool('tool1', input)).rejects.toThrow(
        'Failed to parse input arguments'
      );
    });

    it('executeTool accepts a JSON array and passes it to the handler', async () => {
      initializeTestPolyfill();
      let receivedInput: unknown;
      await document.modelContext.registerTool({
        name: 'tool1',
        description: 'Tool 1',
        execute: async (input) => {
          receivedInput = input;
          return { content: [] };
        },
      });

      await expect(navigator.modelContextTesting?.executeTool('tool1', '[1,2,3]')).resolves.toBe(
        '{"content":[]}'
      );
      expect(receivedInput).toEqual([1, 2, 3]);
    });

    it('executeTool preserves a pre-existing AbortSignal reason', async () => {
      initializeTestPolyfill();
      await document.modelContext.registerTool({
        name: 'tool1',
        description: 'Tool 1',
        execute: async () => ({ content: [] }),
      });

      const controller = new AbortController();
      const reason = { code: 'already-cancelled' };
      controller.abort(reason);

      await expect(
        navigator.modelContextTesting?.executeTool('tool1', '{}', { signal: controller.signal })
      ).rejects.toBe(reason);
    });

    it('executeTool throws when tool execution throws', async () => {
      initializeTestPolyfill();
      await document.modelContext.registerTool({
        name: 'throwing_tool',
        description: 'Throwing tool',
        execute: async () => {
          throw new Error('Tool execution error');
        },
      });

      await expect(
        navigator.modelContextTesting?.executeTool('throwing_tool', '{}')
      ).rejects.toThrow('Tool was executed but the invocation failed');
    });

    it('executeTool serializes the handler result without interpreting MCP fields', async () => {
      initializeTestPolyfill();
      const expected = {
        isError: true,
        metadata: { willNavigate: true },
        value: { count: 2 },
      };
      await document.modelContext.registerTool({
        name: 'raw_result_tool',
        description: 'Raw result tool',
        execute: async () => expected,
      });

      const result = await navigator.modelContextTesting?.executeTool('raw_result_tool', '{}');
      expect(JSON.parse(result ?? '{}')).toEqual(expected);
    });

    it('ontoolchange handler is called on tool changes', async () => {
      initializeTestPolyfill();
      let called = false;
      navigator.modelContextTesting!.ontoolchange = () => {
        called = true;
      };
      await document.modelContext.registerTool({
        name: 'ontoolchange_test',
        description: 'test',
        execute: async () => 'ok',
      });
      await vi.waitFor(() => {
        expect(called).toBe(true);
      });
    });

    it('re-adds testing ontoolchange after listeners when it was cleared', async () => {
      initializeTestPolyfill();
      const testing = navigator.modelContextTesting!;
      const order: string[] = [];
      testing.ontoolchange = () => order.push('first');
      testing.addEventListener('toolchange', () => order.push('listener'));
      testing.ontoolchange = null;
      testing.ontoolchange = () => order.push('replacement');

      await document.modelContext.registerTool({
        name: 'testing_readded_handler_order_tool',
        description: 'Checks re-added testing event handler ordering',
        execute: async () => null,
      });

      expect(order).toEqual(['listener', 'replacement']);
    });
  });

  it('preserves an AbortSignal reason when execution is cancelled', async () => {
    initializeTestPolyfill();
    const controller = new AbortController();
    let resolveExecution: ((value: unknown) => void) | null = null;

    await document.modelContext.registerTool({
      name: 'pending_tool',
      description: 'Pending tool',
      execute: () =>
        new Promise((resolve) => {
          resolveExecution = resolve as (value: unknown) => void;
        }) as Promise<{ content: never[] }>,
    });

    const result = navigator.modelContextTesting?.executeTool('pending_tool', '{}', {
      signal: controller.signal,
    });
    await Promise.resolve();

    const reason = { code: 'pending-cancelled' };
    controller.abort(reason);
    await expect(result).rejects.toBe(reason);
    (resolveExecution as ((value: unknown) => void) | null)?.({ content: [] });
  });

  // =========================================================================
  // Polyfill marker
  // =========================================================================

  describe('polyfill marker', () => {
    it('sets __isWebMCPPolyfill marker on modelContext', () => {
      initializeTestPolyfill();
      expect(
        (document.modelContext as unknown as { __isWebMCPPolyfill?: boolean }).__isWebMCPPolyfill
      ).toBe(true);
    });
  });

  // =========================================================================
  // Tool with synchronous execute (MaybePromise support)
  // =========================================================================

  describe('synchronous execute', () => {
    it('handles synchronous tool execute function', async () => {
      initializeTestPolyfill();
      await getCompatModelContext().registerTool({
        name: 'sync_tool',
        description: 'Sync tool',
        execute: () => ({ content: [{ type: 'text' as const, text: 'sync result' }] }),
      });

      const result = await navigator.modelContextTesting?.executeTool('sync_tool', '{}');
      expect(result).toContain('sync result');
    });
  });

  it('falls back to string conversion when a handler result is not JSON-serializable', async () => {
    initializeTestPolyfill();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await getCompatModelContext().registerTool({
      name: 'circular_result_tool',
      description: 'Circular result tool',
      execute: () => circular,
    });

    await expect(
      navigator.modelContextTesting?.executeTool('circular_result_tool', '{}')
    ).resolves.toBe('[object Object]');
  });
});
