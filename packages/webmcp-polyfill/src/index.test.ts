import type {
  ChromeModelContextExtensions,
  InputSchema,
  ModelContext,
  ModelContextRegisterToolOptions,
  ToolDescriptor,
} from '@mcp-b/webmcp-types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as polyfillRoot from './index.js';
import {
  cleanupWebMCPPolyfill,
  initializeWebMCPPolyfill,
  initializeWebModelContextPolyfill,
} from './index.js';
import { toJsonValue } from './schema.js';

type CompatModelContext = {
  executeTool: NonNullable<ChromeModelContextExtensions['executeTool']>;
  registerTool(tool: ToolDescriptor, options?: ModelContextRegisterToolOptions): Promise<void>;
  unregisterTool(nameOrTool: string | { name: string }): void;
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
  afterEach(() => {
    cleanupWebMCPPolyfill();
  });

  it('exports stable initialization and cleanup functions', () => {
    expect(typeof initializeWebMCPPolyfill).toBe('function');
    expect(typeof initializeWebModelContextPolyfill).toBe('function');
    expect(typeof cleanupWebMCPPolyfill).toBe('function');
  });

  it('keeps schema utilities on the schema entry point', () => {
    expect('normalizeInputSchema' in polyfillRoot).toBe(false);
    expect('toJsonValue' in polyfillRoot).toBe(false);
    expect(typeof toJsonValue).toBe('function');
  });

  it('installs strict core methods on document.modelContext', () => {
    initializeWebMCPPolyfill();

    expect(
      typeof (document.modelContext as unknown as { provideContext?: unknown }).provideContext
    ).toBe('undefined');
    expect(
      typeof (document.modelContext as unknown as { clearContext?: unknown }).clearContext
    ).toBe('undefined');
    expect(typeof document.modelContext.registerTool).toBe('function');
    expect(typeof document.modelContext.getTools).toBe('function');
    expect(typeof getCompatModelContext().unregisterTool).toBe('function');
    expect(typeof document.modelContext.ontoolchange).toBe('object');
    expect((document.modelContext as unknown as { callTool?: unknown }).callTool).toBeUndefined();
  });

  it('installs the exposed ModelContext constructor and brands the context instance', () => {
    initializeWebMCPPolyfill();

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
    initializeWebMCPPolyfill();

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
    initializeWebMCPPolyfill();

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
    initializeWebMCPPolyfill();

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      // First read triggers the warning.
      void getDeprecatedNavigatorModelContext();
      // Subsequent reads must not re-warn.
      void getDeprecatedNavigatorModelContext();
      void getDeprecatedNavigatorModelContext();

      expect(warnSpy).toHaveBeenCalledWith(
        '[WebMCPPolyfill] navigator.modelContext is deprecated. The May 27, 2026 WebMCP draft moved the modelContext getter from Navigator to Document — use document.modelContext instead. See https://github.com/webmachinelearning/webmcp/pull/184.'
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('does not warn when accessing document.modelContext', () => {
    initializeWebMCPPolyfill();

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      void document.modelContext;
      void document.modelContext;

      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('document.modelContext registerTool resolves undefined and throws on duplicates', async () => {
    initializeWebMCPPolyfill();

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
    initializeWebMCPPolyfill();

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
    initializeWebMCPPolyfill();
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

  it('unregisterTool on unknown names is a no-op', () => {
    initializeWebMCPPolyfill();
    expect(() => getCompatModelContext().unregisterTool('missing')).not.toThrow();
  });

  it('unregisterTool accepts the originally registered tool object for compatibility', async () => {
    initializeWebMCPPolyfill();

    const tool: ToolDescriptor & { inputSchema: InputSchema } = {
      name: 'compat_unregister_tool',
      description: 'Compatibility unregister tool',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    };

    await getCompatModelContext().registerTool(tool);
    getCompatModelContext().unregisterTool(tool);

    await expect(
      navigator.modelContextTesting?.executeTool('compat_unregister_tool', '{}')
    ).rejects.toThrow('Tool not found: compat_unregister_tool');
  });

  it('throws when unregisterTool receives an invalid compatibility value', () => {
    initializeWebMCPPolyfill();

    expect(() => getCompatModelContext().unregisterTool({} as never)).toThrow(
      "Failed to execute 'unregisterTool' on 'ModelContext': parameter 1 must be a string or an object with a string name."
    );
  });

  it('warns that unregisterTool is deprecated while preserving behavior', async () => {
    initializeWebMCPPolyfill();

    const tool = {
      name: 'deprecation_tool',
      description: 'Deprecation tool',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    };
    await document.modelContext.registerTool(tool);

    // Re-registration rejects iff the tool is in the registry.
    await expect(document.modelContext.registerTool(tool)).rejects.toThrow(
      'Tool already registered: deprecation_tool'
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      getCompatModelContext().unregisterTool('deprecation_tool');
      getCompatModelContext().unregisterTool('deprecation_tool');

      expect(warnSpy).toHaveBeenCalledWith(
        '[WebMCPPolyfill] document.modelContext.unregisterTool() is deprecated. The April 23, 2026 WebMCP draft removed it in favor of registerTool(tool, { signal }) — pass an AbortSignal and abort it to unregister.'
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }

    await expect(document.modelContext.registerTool(tool)).resolves.toBeUndefined();
  });

  it('registerTool with options.signal unregisters when the signal aborts', async () => {
    initializeWebMCPPolyfill();

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
    initializeWebMCPPolyfill();

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
    initializeWebMCPPolyfill();

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

  it('rejects registration and discovery from a detached document', async () => {
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
      await import(${JSON.stringify(moduleUrl)});
      parent.postMessage(${JSON.stringify(readyMessage)}, '*');
    </script>`;
    document.body.append(iframe);
    await loaded;

    const detachedContext = iframe.contentDocument?.modelContext;
    if (!detachedContext) throw new Error('Expected the iframe ModelContext');
    iframe.remove();

    await expect(
      detachedContext.registerTool({
        name: 'detached_document_tool',
        description: 'Must not register after its document is detached',
        execute: async () => ({ content: [{ type: 'text', text: 'never' }] }),
      })
    ).rejects.toMatchObject({ name: 'InvalidStateError' });
    await expect(detachedContext.getTools()).rejects.toMatchObject({ name: 'InvalidStateError' });
  });

  it('does not let an old registration signal remove a same-name replacement', async () => {
    initializeWebMCPPolyfill();
    const originalController = new AbortController();
    const original = {
      name: 'signal_replacement_tool',
      description: 'Original registration',
      execute: async () => ({ version: 'original' }),
    };
    await document.modelContext.registerTool(original, { signal: originalController.signal });
    getCompatModelContext().unregisterTool(original);

    await document.modelContext.registerTool({
      ...original,
      description: 'Replacement registration',
      execute: async () => ({ version: 'replacement' }),
    });
    originalController.abort();

    const [registered] = await document.modelContext.getTools();
    expect(registered?.name).toBe('signal_replacement_tool');
    await expect(getCompatModelContext().executeTool(registered!, '{}')).resolves.toBe(
      '{"version":"replacement"}'
    );
  });

  it('rejects untrustworthy cross-origin options with SecurityError', async () => {
    initializeWebMCPPolyfill();

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
    initializeWebMCPPolyfill();

    let count = 0;
    navigator.modelContextTesting?.addEventListener('toolchange', () => {
      count += 1;
    });

    await document.modelContext.registerTool({
      name: 't1',
      description: 'tool 1',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    });

    getCompatModelContext().unregisterTool('t1');

    await vi.waitFor(() => {
      expect(count).toBe(2);
    });
  });

  it('exposes native-shaped getTools on document.modelContext', async () => {
    initializeWebMCPPolyfill();

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
    initializeWebMCPPolyfill();

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

  it('warns once when cross-origin discovery is requested', async () => {
    initializeWebMCPPolyfill();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await document.modelContext.getTools({ fromOrigins: ['https://example.com'] });
      await document.modelContext.getTools({ fromOrigins: ['https://example.org'] });
      await document.modelContext.getTools({ fromOrigins: [] });

      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledWith(
        '[WebMCPPolyfill] Cross-document getTools({ fromOrigins }) discovery requires native WebMCP and is not available in the local polyfill.'
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('executes registered tool objects from document.modelContext.getTools', async () => {
    initializeWebMCPPolyfill();

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
    initializeWebMCPPolyfill();
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
    initializeWebMCPPolyfill();

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
    initializeWebMCPPolyfill();
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
    initializeWebMCPPolyfill();
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
      initializeWebMCPPolyfill();
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

      initializeWebMCPPolyfill();
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

      initializeWebMCPPolyfill();

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

      initializeWebMCPPolyfill();

      expect(document.modelContext).toBe(documentContext);
      expect(getDeprecatedNavigatorModelContext()).toBe(navigatorContext);
      expect(navigator.modelContextTesting).toBeUndefined();

      cleanupWebMCPPolyfill();
      expect(document.modelContext).toBe(documentContext);
      expect(getDeprecatedNavigatorModelContext()).toBe(navigatorContext);

      delete (document as unknown as Record<string, unknown>).modelContext;
      delete (navigator as unknown as Record<string, unknown>).modelContext;
    });

    it('does not install modelContextTesting when installTestingShim=false', () => {
      initializeWebMCPPolyfill({ installTestingShim: false });
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

      initializeWebMCPPolyfill();

      expect(document.modelContext).toBeDefined();
      expect(navigator.modelContextTesting).toBe(existingTesting);

      cleanupWebMCPPolyfill();
      delete (navigator as unknown as Record<string, unknown>).modelContextTesting;
    });

    it('overrides existing modelContextTesting when installTestingShim is always', () => {
      const existingTesting = {
        existing: true,
      } as unknown as Navigator['modelContextTesting'];
      Object.defineProperty(navigator, 'modelContextTesting', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: existingTesting,
      });

      initializeWebMCPPolyfill({ installTestingShim: 'always' });

      expect(document.modelContext).toBeDefined();
      expect(navigator.modelContextTesting).not.toBe(existingTesting);
      expect(typeof navigator.modelContextTesting?.executeTool).toBe('function');

      cleanupWebMCPPolyfill();
      delete (navigator as unknown as Record<string, unknown>).modelContextTesting;
    });

    it('is idempotent when already installed', () => {
      initializeWebMCPPolyfill();
      const first = document.modelContext;

      initializeWebMCPPolyfill();
      const second = document.modelContext;

      expect(first).toBe(second);
      expect(typeof second.registerTool).toBe('function');
    });
  });

  describe('cleanupWebMCPPolyfill', () => {
    it('is a no-op when not installed', () => {
      // Should not throw
      cleanupWebMCPPolyfill();
      cleanupWebMCPPolyfill();
    });

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

      initializeWebMCPPolyfill();
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
      initializeWebMCPPolyfill();
      expect(document.modelContext).toBeDefined();
      expect(getDeprecatedNavigatorModelContext()).toBeDefined();

      cleanupWebMCPPolyfill();

      expect('modelContext' in document).toBe(false);
      expect('modelContext' in navigator).toBe(false);
    });

    it('restores a pre-existing modelContextTesting descriptor after forced override', () => {
      const existingTesting = {
        existing: true,
      } as unknown as Navigator['modelContextTesting'];
      Object.defineProperty(navigator, 'modelContextTesting', {
        configurable: true,
        enumerable: false,
        writable: false,
        value: existingTesting,
      });
      const originalTestingDescriptor = Object.getOwnPropertyDescriptor(
        navigator,
        'modelContextTesting'
      );

      initializeWebMCPPolyfill({ installTestingShim: 'always' });
      expect(navigator.modelContextTesting).not.toBe(existingTesting);

      cleanupWebMCPPolyfill();

      expect('modelContext' in document).toBe(false);
      expect('modelContext' in navigator).toBe(false);
      expect(Object.getOwnPropertyDescriptor(navigator, 'modelContextTesting')).toEqual(
        originalTestingDescriptor
      );
      expect(navigator.modelContextTesting).toBe(existingTesting);

      delete (navigator as unknown as Record<string, unknown>).modelContextTesting;
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
        initializeWebMCPPolyfill();
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
      initializeWebMCPPolyfill();
      await expect(
        document.modelContext.registerTool(
          null as unknown as Parameters<typeof document.modelContext.registerTool>[0]
        )
      ).rejects.toThrow('registerTool(tool) requires a tool object');
    });

    it('throws InvalidStateError when tool name is empty', async () => {
      initializeWebMCPPolyfill();
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
      initializeWebMCPPolyfill();
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
      initializeWebMCPPolyfill();
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
      initializeWebMCPPolyfill();
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

    it('throws InvalidStateError for tool name with zero-width space', async () => {
      initializeWebMCPPolyfill();
      await expectInvalidStateError(
        () =>
          document.modelContext.registerTool({
            name: 'tool\u200Bname',
            description: 'test',
            execute: async () => ({ content: [] }),
          }),
        invalidToolNameMessage
      );
    });

    it('throws InvalidStateError for tool name with cyrillic homoglyph', async () => {
      initializeWebMCPPolyfill();
      await expectInvalidStateError(
        () =>
          document.modelContext.registerTool({
            name: 't\u043Eo\u043Bl',
            description: 'test',
            execute: async () => ({ content: [] }),
          }),
        invalidToolNameMessage
      );
    });

    it('throws InvalidStateError for tool name with ASCII space', async () => {
      initializeWebMCPPolyfill();
      await expectInvalidStateError(
        () =>
          document.modelContext.registerTool({
            name: 'tool name',
            description: 'test',
            execute: async () => ({ content: [] }),
          }),
        invalidToolNameMessage
      );
    });

    it('throws InvalidStateError for tool name with colon', async () => {
      initializeWebMCPPolyfill();
      await expectInvalidStateError(
        () =>
          document.modelContext.registerTool({
            name: 'tool:name',
            description: 'test',
            execute: async () => ({ content: [] }),
          }),
        invalidToolNameMessage
      );
    });

    it('throws InvalidStateError for tool name longer than 128 characters', async () => {
      initializeWebMCPPolyfill();
      await expectInvalidStateError(
        () =>
          document.modelContext.registerTool({
            name: 'a'.repeat(129),
            description: 'test',
            execute: async () => ({ content: [] }),
          }),
        invalidToolNameMessage
      );
    });

    it('accepts tool name with underscore, period, and hyphen', async () => {
      initializeWebMCPPolyfill();
      await expect(
        document.modelContext.registerTool({
          name: 'a._-b',
          description: 'test',
          execute: async () => ({ content: [] }),
        })
      ).resolves.toBeUndefined();
    });

    it('accepts tool name with exactly 128 characters', async () => {
      initializeWebMCPPolyfill();
      await expect(
        document.modelContext.registerTool({
          name: 'a'.repeat(128),
          description: 'test',
          execute: async () => ({ content: [] }),
        })
      ).resolves.toBeUndefined();
    });

    it('throws when tool execute is not a function', async () => {
      initializeWebMCPPolyfill();
      await expect(
        document.modelContext.registerTool({
          name: 'test',
          description: 'test desc',
          execute: 'not-a-function' as unknown as () => Promise<{ content: never[] }>,
        })
      ).rejects.toThrow('Tool "execute" must be a function');
    });

    it('throws when inputSchema is not an object', async () => {
      initializeWebMCPPolyfill();
      await expect(
        document.modelContext.registerTool({
          name: 'test',
          description: 'test desc',
          inputSchema: 'not-object' as unknown as { type: string },
          execute: async () => ({ content: [] }),
        })
      ).rejects.toThrow('inputSchema must be an object');
    });

    it('defaults inputSchema to empty object schema when not provided', async () => {
      initializeWebMCPPolyfill();
      document.modelContext.registerTool({
        name: 'no_schema',
        description: 'No schema tool',
        execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      });

      const tools = navigator.modelContextTesting?.listTools();
      expect(tools).toHaveLength(1);
      const schema = tools?.[0]?.inputSchema;
      expect(schema).toBeDefined();
      expect(JSON.parse(schema ?? '{}')).toEqual({ type: 'object', properties: {} });
    });

    it('defaults inputSchema.type to object when schema omits root type', async () => {
      initializeWebMCPPolyfill();
      document.modelContext.registerTool({
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
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      });
    });

    it('throws when Standard Schema validators cannot advertise JSON Schema metadata', async () => {
      initializeWebMCPPolyfill();

      const standardSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate(value: unknown) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
              return { issues: [{ message: 'arguments must be an object' }] };
            }

            const record = value as Record<string, unknown>;
            if (typeof record.message !== 'string') {
              return { issues: [{ message: 'message is required', path: ['message'] }] };
            }

            return { value: record };
          },
        },
      };

      await expect(
        document.modelContext.registerTool({
          name: 'standard_validator_tool',
          description: 'Standard validator tool',
          inputSchema: asPolyfillInputSchema(standardSchema),
          execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
        })
      ).rejects.toThrow('Standard Schema inputSchema must provide ~standard.jsonSchema.input()');
    });

    it('converts Standard JSON Schema inputs for testing shim metadata', () => {
      initializeWebMCPPolyfill();

      const standardJsonSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          jsonSchema: {
            input: () => ({
              type: 'object',
              properties: { count: { type: 'number' } },
              required: ['count'],
            }),
            output: () => ({ type: 'object', properties: {} }),
          },
        },
      };

      document.modelContext.registerTool({
        name: 'standard_json_tool',
        description: 'Standard json schema tool',
        inputSchema: asPolyfillInputSchema(standardJsonSchema),
        execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      });

      const tools = navigator.modelContextTesting?.listTools();
      const tool = tools?.find((entry) => entry.name === 'standard_json_tool');
      expect(tool?.inputSchema).toBeDefined();
      expect(JSON.parse(tool?.inputSchema ?? '{}')).toEqual({
        type: 'object',
        properties: { count: { type: 'number' } },
        required: ['count'],
      });
    });

    it('advertises converted Standard JSON Schema without running its validator', async () => {
      initializeWebMCPPolyfill();
      let validateCallCount = 0;

      const schemaWithBoth = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate(value: unknown) {
            validateCallCount += 1;
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
              return { issues: [{ message: 'arguments must be an object' }] };
            }
            const record = value as Record<string, unknown>;
            if (record.count !== 3) {
              return { issues: [{ message: 'count must be 3', path: ['count'] }] };
            }
            return { value: { count: 4 } };
          },
          jsonSchema: {
            input: () => ({
              type: 'object',
              properties: { count: { type: 'number' } },
              required: ['count'],
            }),
            output: () => ({ type: 'object', properties: {} }),
          },
        },
      };

      document.modelContext.registerTool({
        name: 'standard_both_tool',
        description: 'Standard schema + json schema tool',
        inputSchema: asPolyfillInputSchema(schemaWithBoth),
        execute: async (args) => ({ content: [{ type: 'text', text: String(args.count ?? '') }] }),
      });

      const tools = navigator.modelContextTesting?.listTools();
      expect(JSON.parse(tools?.[0]?.inputSchema ?? '{}')).toEqual({
        type: 'object',
        properties: { count: { type: 'number' } },
        required: ['count'],
      });

      await expect(
        navigator.modelContextTesting?.executeTool('standard_both_tool', '{}')
      ).resolves.toContain('""');

      await expect(
        navigator.modelContextTesting?.executeTool('standard_both_tool', '{"count":3}')
      ).resolves.toContain('"3"');

      expect(validateCallCount).toBe(0);
    });

    it('throws a stable error when Standard JSON Schema conversion fails for all targets', async () => {
      initializeWebMCPPolyfill();
      const attemptedTargets: string[] = [];

      const unsupportedStandardJsonSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          jsonSchema: {
            input: (options: { target: string }) => {
              attemptedTargets.push(options.target);
              throw new Error('unsupported target');
            },
            output: () => ({ type: 'object', properties: {} }),
          },
        },
      };

      await expect(
        document.modelContext.registerTool({
          name: 'unsupported_standard_json_tool',
          description: 'Unsupported standard json schema tool',
          inputSchema: asPolyfillInputSchema(unsupportedStandardJsonSchema),
          execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
        })
      ).rejects.toThrow(
        'Failed to convert Standard JSON Schema inputSchema to a JSON Schema object'
      );

      expect(attemptedTargets).toEqual(['draft-2020-12', 'draft-07']);
    });

    it('does not warn when Standard JSON Schema conversion succeeds on a fallback target', () => {
      initializeWebMCPPolyfill();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      try {
        const draft07OnlySchema = {
          '~standard': {
            version: 1 as const,
            vendor: 'test',
            jsonSchema: {
              input: (options: { target: string }) => {
                if (options.target === 'draft-2020-12') {
                  throw new Error('unsupported target');
                }

                return {
                  type: 'object',
                  properties: { count: { type: 'number' } },
                };
              },
              output: () => ({ type: 'object', properties: {} }),
            },
          },
        };

        document.modelContext.registerTool({
          name: 'draft_07_only_standard_json_tool',
          description: 'Draft 07 only standard json schema tool',
          inputSchema: asPolyfillInputSchema(draft07OnlySchema),
          execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
        });

        expect(warnSpy.mock.calls).not.toEqual(
          expect.arrayContaining([
            [expect.stringContaining('Standard JSON Schema conversion failed'), expect.anything()],
          ])
        );
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  // =========================================================================
  // inputSchema serialization semantics
  // =========================================================================

  describe('inputSchema serialization semantics', () => {
    it('rethrows the TypeError produced by JSON.stringify for circular schemas', async () => {
      initializeWebMCPPolyfill();
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
      initializeWebMCPPolyfill();

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
      initializeWebMCPPolyfill();
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
      initializeWebMCPPolyfill();

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
      initializeWebMCPPolyfill();
      const tools = navigator.modelContextTesting?.listTools();
      expect(tools).toEqual([]);
    });

    it('listTools returns registered tools with serialized inputSchema', () => {
      initializeWebMCPPolyfill();
      document.modelContext.registerTool({
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

    it('listTools normalizes empty inputSchema {} to default object schema', () => {
      initializeWebMCPPolyfill();
      document.modelContext.registerTool({
        name: 'no_args_tool',
        description: 'Tool with no arguments',
        inputSchema: {},
        execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      });

      const tools = navigator.modelContextTesting?.listTools();
      expect(tools).toHaveLength(1);
      expect(tools?.[0]?.inputSchema).toBeDefined();
      const parsed = JSON.parse(tools?.[0]?.inputSchema ?? '');
      expect(parsed).toEqual({ type: 'object', properties: {} });
    });

    it('executeTool throws on unknown tool', async () => {
      initializeWebMCPPolyfill();
      await expect(navigator.modelContextTesting?.executeTool('nonexistent', '{}')).rejects.toThrow(
        'Tool not found: nonexistent'
      );
    });

    it('executeTool throws on invalid JSON input', async () => {
      initializeWebMCPPolyfill();
      document.modelContext.registerTool({
        name: 'tool1',
        description: 'Tool 1',
        execute: async () => ({ content: [] }),
      });

      await expect(navigator.modelContextTesting?.executeTool('tool1', 'not-json')).rejects.toThrow(
        'Failed to parse input arguments'
      );
    });

    it('executeTool accepts a JSON array and passes it to the handler', async () => {
      initializeWebMCPPolyfill();
      let receivedInput: unknown;
      document.modelContext.registerTool({
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

    it('executeTool throws when input is a JSON primitive', async () => {
      initializeWebMCPPolyfill();
      document.modelContext.registerTool({
        name: 'tool1',
        description: 'Tool 1',
        execute: async () => ({ content: [] }),
      });

      await expect(navigator.modelContextTesting?.executeTool('tool1', '"hello"')).rejects.toThrow(
        'Failed to parse input arguments'
      );
    });

    it('executeTool throws when input is JSON null', async () => {
      initializeWebMCPPolyfill();
      document.modelContext.registerTool({
        name: 'tool1',
        description: 'Tool 1',
        execute: async () => ({ content: [] }),
      });

      await expect(navigator.modelContextTesting?.executeTool('tool1', 'null')).rejects.toThrow(
        'Failed to parse input arguments'
      );
    });

    it('executeTool preserves a pre-existing AbortSignal reason', async () => {
      initializeWebMCPPolyfill();
      document.modelContext.registerTool({
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

    it('executeTool preserves an AbortSignal reason during execution', async () => {
      initializeWebMCPPolyfill();
      const controller = new AbortController();
      const reason = { code: 'cancelled-during-execution' };

      document.modelContext.registerTool({
        name: 'slow_tool',
        description: 'Slow tool',
        execute: async () => {
          // Simulate slow work
          await new Promise((resolve) => setTimeout(resolve, 100));
          return { content: [{ type: 'text' as const, text: 'done' }] };
        },
      });

      // Abort after a short delay
      setTimeout(() => controller.abort(reason), 10);

      await expect(
        navigator.modelContextTesting?.executeTool('slow_tool', '{}', { signal: controller.signal })
      ).rejects.toBe(reason);
    });

    it('executeTool throws when tool execution throws', async () => {
      initializeWebMCPPolyfill();
      document.modelContext.registerTool({
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

    it('executeTool handles tool returning isError=true with text content', async () => {
      initializeWebMCPPolyfill();
      document.modelContext.registerTool({
        name: 'error_tool',
        description: 'Error tool',
        execute: async () => ({
          isError: true,
          content: [{ type: 'text' as const, text: 'Error: Something went wrong' }],
        }),
      });

      // The isError path in toSerializedTestingResult throws, which is then
      // caught by the outer try/catch in executeToolForTesting and re-thrown
      // with the generic TOOL_INVOCATION_FAILED_MESSAGE
      await expect(navigator.modelContextTesting?.executeTool('error_tool', '{}')).rejects.toThrow(
        'Tool was executed but the invocation failed'
      );
    });

    it('executeTool handles tool returning isError=true without text content', async () => {
      initializeWebMCPPolyfill();
      document.modelContext.registerTool({
        name: 'error_no_text_tool',
        description: 'Error no text tool',
        execute: async () => ({
          isError: true,
          content: [{ type: 'image' as const, data: 'base64data', mimeType: 'image/png' }],
        }),
      });

      await expect(
        navigator.modelContextTesting?.executeTool('error_no_text_tool', '{}')
      ).rejects.toThrow('Tool was executed but the invocation failed');
    });

    it('executeTool handles tool returning isError=true with empty content', async () => {
      initializeWebMCPPolyfill();
      document.modelContext.registerTool({
        name: 'error_empty_tool',
        description: 'Error empty content tool',
        execute: async () => ({
          isError: true,
          content: [],
        }),
      });

      await expect(
        navigator.modelContextTesting?.executeTool('error_empty_tool', '{}')
      ).rejects.toThrow('Tool was executed but the invocation failed');
    });

    it('executeTool returns null when result has metadata.willNavigate=true', async () => {
      initializeWebMCPPolyfill();
      document.modelContext.registerTool({
        name: 'navigate_tool',
        description: 'Navigate tool',
        execute: async () => ({
          content: [{ type: 'text' as const, text: 'navigating' }],
          metadata: { willNavigate: true },
        }),
      });

      const result = await navigator.modelContextTesting?.executeTool('navigate_tool', '{}');
      expect(result).toBeNull();
    });

    it('executeTool returns serialized result for normal tool response', async () => {
      initializeWebMCPPolyfill();
      document.modelContext.registerTool({
        name: 'normal_tool',
        description: 'Normal tool',
        execute: async () => ({
          content: [{ type: 'text' as const, text: 'hello' }],
        }),
      });

      const result = await navigator.modelContextTesting?.executeTool('normal_tool', '{}');
      expect(result).toBeDefined();
      const parsed = JSON.parse(result ?? '{}');
      expect(parsed.content[0].text).toBe('hello');
    });

    it('executeTool wraps raw object returns into content and structuredContent', async () => {
      initializeWebMCPPolyfill();
      document.modelContext.registerTool({
        name: 'raw_object_tool',
        description: 'Raw object tool',
        execute: async () => ({ ok: true, nested: { count: 2 } }),
      });

      const result = await navigator.modelContextTesting?.executeTool('raw_object_tool', '{}');
      const parsed = JSON.parse(result ?? '{}');
      expect(parsed.isError).toBe(false);
      expect(parsed.content?.[0]?.type).toBe('text');
      expect(parsed.structuredContent).toEqual({ ok: true, nested: { count: 2 } });
    });

    it('does not enforce outputSchema during imperative execution', async () => {
      initializeWebMCPPolyfill();
      getCompatModelContext().registerTool({
        name: 'invalid_output_schema_tool',
        description: 'Invalid output schema tool',
        outputSchema: {
          type: 'object',
          properties: { count: { type: 'number' } },
          required: ['count'],
        },
        execute: async () => ({ count: 'wrong' }),
      });

      const result = await navigator.modelContextTesting?.executeTool(
        'invalid_output_schema_tool',
        '{}'
      );
      const parsed = JSON.parse(result ?? '{}');
      expect(parsed.structuredContent).toEqual({ count: 'wrong' });
    });

    it('executeTool does not set structuredContent for non-json-safe objects', async () => {
      initializeWebMCPPolyfill();
      document.modelContext.registerTool({
        name: 'non_json_structured_content_tool',
        description: 'Non JSON structured content tool',
        execute: async () => ({ value: Number.NaN }),
      });

      const result = await navigator.modelContextTesting?.executeTool(
        'non_json_structured_content_tool',
        '{}'
      );
      const parsed = JSON.parse(result ?? '{}');
      expect(parsed.content?.[0]?.type).toBe('text');
      expect(parsed.structuredContent).toBeUndefined();
    });

    it('ontoolchange handler is called on tool changes', async () => {
      initializeWebMCPPolyfill();
      let called = false;
      navigator.modelContextTesting!.ontoolchange = () => {
        called = true;
      };
      document.modelContext.registerTool({
        name: 'ontoolchange_test',
        description: 'test',
        execute: async () => 'ok',
      });
      await vi.waitFor(() => {
        expect(called).toBe(true);
      });
    });

    it('re-adds testing ontoolchange after listeners when it was cleared', async () => {
      initializeWebMCPPolyfill();
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

    it('getCrossDocumentScriptToolResult returns empty array string', async () => {
      initializeWebMCPPolyfill();
      const getResult = navigator.modelContextTesting?.getCrossDocumentScriptToolResult;
      if (!getResult || !navigator.modelContextTesting) {
        throw new Error('Expected getCrossDocumentScriptToolResult to be available');
      }
      const result = await getResult.call(navigator.modelContextTesting);
      expect(result).toBe('[]');
    });
  });

  // =========================================================================
  // notifyToolsChanged edge cases
  // =========================================================================

  describe('notifyToolsChanged edge cases', () => {
    it('does not call callback when no callback is registered', async () => {
      initializeWebMCPPolyfill();
      // Register and unregister without a callback - should not throw
      document.modelContext.registerTool({
        name: 'no_cb_tool',
        description: 'No callback tool',
        execute: async () => ({ content: [] }),
      });

      await Promise.resolve();
    });
  });

  // =========================================================================
  // withAbortSignal edge cases
  // =========================================================================

  describe('abort signal edge cases', () => {
    it('resolves normally when signal is provided but not aborted', async () => {
      initializeWebMCPPolyfill();
      const controller = new AbortController();

      document.modelContext.registerTool({
        name: 'fast_tool',
        description: 'Fast tool',
        execute: async () => ({ content: [{ type: 'text' as const, text: 'fast' }] }),
      });

      const result = await navigator.modelContextTesting?.executeTool('fast_tool', '{}', {
        signal: controller.signal,
      });
      expect(result).toContain('fast');
    });

    it('rejects when signal aborts after promise starts but before it resolves', async () => {
      initializeWebMCPPolyfill();
      const controller = new AbortController();

      let resolvePromise: ((value: unknown) => void) | null = null;

      document.modelContext.registerTool({
        name: 'pending_tool',
        description: 'Pending tool',
        execute: () =>
          new Promise((resolve) => {
            resolvePromise = resolve as (value: unknown) => void;
          }) as Promise<{ content: never[] }>,
      });

      const resultPromise = navigator.modelContextTesting?.executeTool('pending_tool', '{}', {
        signal: controller.signal,
      });

      // Give it a tick to start
      await Promise.resolve();

      const reason = { code: 'pending-cancelled' };
      controller.abort(reason);

      await expect(resultPromise).rejects.toBe(reason);

      // Clean up - resolve the pending promise to avoid hanging
      (resolvePromise as ((v: unknown) => void) | null)?.({ content: [] });
    });
  });

  // =========================================================================
  // toSerializedTestingResult edge cases
  // =========================================================================

  describe('toSerializedTestingResult edge cases', () => {
    it('handles isError=true with text that does not start with Error:', async () => {
      initializeWebMCPPolyfill();
      document.modelContext.registerTool({
        name: 'plain_error_tool',
        description: 'Plain error tool',
        execute: async () => ({
          isError: true,
          content: [{ type: 'text' as const, text: 'Custom failure message' }],
        }),
      });

      // toSerializedTestingResult throws for isError, then the outer catch
      // re-throws with the generic message
      await expect(
        navigator.modelContextTesting?.executeTool('plain_error_tool', '{}')
      ).rejects.toThrow('Tool was executed but the invocation failed');
    });

    it('treats malformed isError payloads as raw return values', async () => {
      initializeWebMCPPolyfill();
      document.modelContext.registerTool({
        name: 'no_content_error_tool',
        description: 'No content error tool',
        execute: async () => ({
          isError: true,
          content: undefined as never,
        }),
      });

      const result = await navigator.modelContextTesting?.executeTool(
        'no_content_error_tool',
        '{}'
      );
      const parsed = JSON.parse(result ?? '{}');
      expect(parsed.isError).toBe(false);
      expect(parsed.content?.[0]?.type).toBe('text');
      expect(parsed.structuredContent).toBeUndefined();
    });

    it('handles metadata.willNavigate=false (does not return null)', async () => {
      initializeWebMCPPolyfill();
      document.modelContext.registerTool({
        name: 'no_navigate_tool',
        description: 'No navigate tool',
        execute: async () => ({
          content: [{ type: 'text' as const, text: 'staying' }],
          metadata: { willNavigate: false },
        }),
      });

      const result = await navigator.modelContextTesting?.executeTool('no_navigate_tool', '{}');
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
    });
  });

  // =========================================================================
  // withAbortSignal error rejection path (lines 457-459)
  // =========================================================================

  describe('withAbortSignal error path', () => {
    it('propagates tool execution error when signal is provided but not aborted', async () => {
      initializeWebMCPPolyfill();
      const controller = new AbortController();

      document.modelContext.registerTool({
        name: 'error_with_signal_tool',
        description: 'Error with signal',
        execute: async () => {
          throw new Error('Internal tool error');
        },
      });

      // The tool throws, promise rejects, withAbortSignal's rejection handler
      // fires (cleanup + reject), then the outer catch catches it
      await expect(
        navigator.modelContextTesting?.executeTool('error_with_signal_tool', '{}', {
          signal: controller.signal,
        })
      ).rejects.toThrow('Tool was executed but the invocation failed');
    });
  });

  // =========================================================================
  // Polyfill marker
  // =========================================================================

  describe('polyfill marker', () => {
    it('sets __isWebMCPPolyfill marker on modelContext', () => {
      initializeWebMCPPolyfill();
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
      initializeWebMCPPolyfill();
      getCompatModelContext().registerTool({
        name: 'sync_tool',
        description: 'Sync tool',
        execute: () => ({ content: [{ type: 'text' as const, text: 'sync result' }] }),
      });

      const result = await navigator.modelContextTesting?.executeTool('sync_tool', '{}');
      expect(result).toContain('sync result');
    });
  });

  // =========================================================================
  // getFirstTextBlock edge cases
  // =========================================================================

  describe('getFirstTextBlock edge cases', () => {
    it('skips non-text content blocks for error message extraction', async () => {
      initializeWebMCPPolyfill();
      document.modelContext.registerTool({
        name: 'mixed_content_error_tool',
        description: 'Mixed content error tool',
        execute: async () => ({
          isError: true,
          content: [
            { type: 'image' as const, data: 'base64data', mimeType: 'image/png' },
            { type: 'text' as const, text: 'Error: The real message' },
          ],
        }),
      });

      // The isError path throws in toSerializedTestingResult but is caught by
      // the outer try/catch which re-throws with the generic message
      await expect(
        navigator.modelContextTesting?.executeTool('mixed_content_error_tool', '{}')
      ).rejects.toThrow('Tool was executed but the invocation failed');
    });

    it('handles isError with empty string text', async () => {
      initializeWebMCPPolyfill();
      document.modelContext.registerTool({
        name: 'empty_text_error_tool',
        description: 'Empty text error tool',
        execute: async () => ({
          isError: true,
          content: [{ type: 'text' as const, text: '' }],
        }),
      });

      await expect(
        navigator.modelContextTesting?.executeTool('empty_text_error_tool', '{}')
      ).rejects.toThrow('Tool was executed but the invocation failed');
    });
  });

  // =========================================================================
  // Non-serializable tool result (covers toSerializedTestingResult catch on line 427)
  // =========================================================================

  describe('non-serializable tool result', () => {
    it('throws when tool result cannot be JSON.stringified', async () => {
      initializeWebMCPPolyfill();

      // Create a result with circular references
      const circular: Record<string, unknown> = { type: 'text', text: 'ok' };
      circular.self = circular;

      getCompatModelContext().registerTool({
        name: 'circular_result_tool',
        description: 'Circular result tool',
        execute: () => ({
          content: [circular as { type: 'text'; text: string }],
        }),
      });

      // The non-serializable result causes JSON.stringify to throw,
      // caught by toSerializedTestingResult's catch block, which is then
      // caught by the outer executeToolForTesting catch
      await expect(
        navigator.modelContextTesting?.executeTool('circular_result_tool', '{}')
      ).rejects.toThrow('Tool was executed but the invocation failed');
    });
  });

  describe('toJsonValue', () => {
    it('accepts JSON objects and rejects values that would need serialization cleanup', () => {
      const circular: Record<string, unknown> = { ok: true };
      circular.self = circular;

      expect(toJsonValue({ ok: true, nested: [1, 'two', null] })).toEqual({
        ok: true,
        nested: [1, 'two', null],
      });
      expect(toJsonValue({ date: new Date(0) })).toBeUndefined();
      expect(toJsonValue(circular)).toBeUndefined();
    });

    it('accepts JSON primitives and arrays', () => {
      expect(toJsonValue('ok')).toBe('ok');
      expect(toJsonValue(1)).toBe(1);
      expect(toJsonValue(false)).toBe(false);
      expect(toJsonValue(null)).toBeNull();
      expect(toJsonValue(['ok', 1])).toEqual(['ok', 1]);
      expect(toJsonValue(Number.NaN)).toBeUndefined();
    });
  });
});
