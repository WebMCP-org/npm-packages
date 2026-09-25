import { IframeChildTransport, TabServerTransport } from '@mcp-b/transports';
import { installWebMCP } from '@mcp-b/webmcp-polyfill';
import { BrowserMcpServer, isBrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';
import type { ModelContext, ModelContextTesting } from '@mcp-b/webmcp-types';
import type { Transport } from '@modelcontextprotocol/server';
import { installWebMCPDeclarativeExtensions } from './declarative-forms.js';
import type { WebModelContextInitOptions } from './types.js';

interface RuntimeState {
  server: BrowserMcpServer;
  cleanupCompatibility: () => void;
  transport: Transport;
  previousDocumentModelContextDescriptor: PropertyDescriptor | undefined;
  previousNavigatorModelContextDescriptor: PropertyDescriptor | undefined;
}

let runtime: RuntimeState | null = null;

function installTestingShim(server: BrowserMcpServer): () => void {
  if (navigator.modelContextTesting) return () => {};
  const shim: ModelContextTesting = Object.assign(new EventTarget(), {
    ontoolchange: null as ModelContextTesting['ontoolchange'],
    listTools: () =>
      server.listTools().map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema: JSON.stringify(inputSchema),
      })),
    async executeTool(name: string, input: string, options?: { signal?: AbortSignal }) {
      const listed = server.listTools().some((tool) => tool.name === name);
      const tool = listed
        ? (await server.getTools()).find((candidate) => {
            if (candidate.name !== name) return false;
            let frame = candidate.window;
            while (frame) {
              if (frame === window) return true;
              if (frame.parent === frame) break;
              frame = frame.parent;
            }
            return false;
          })
        : undefined;
      if (!tool) throw new DOMException(`Tool not found: ${name}`, 'UnknownError');
      return server.executeTool(tool, input, options);
    },
  });
  shim.addEventListener('toolchange', (event) => shim.ontoolchange?.call(shim, event));
  const changed = () => shim.dispatchEvent(new Event('toolchange'));
  server.addEventListener('toolchange', changed);
  const previous = Object.getOwnPropertyDescriptor(navigator, 'modelContextTesting');
  Object.defineProperty(navigator, 'modelContextTesting', {
    configurable: true,
    enumerable: true,
    value: shim,
  });
  return () => {
    server.removeEventListener('toolchange', changed);
    if (navigator.modelContextTesting !== shim) return;
    if (previous) Object.defineProperty(navigator, 'modelContextTesting', previous);
    else Reflect.deleteProperty(navigator, 'modelContextTesting');
  };
}

function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof window.navigator !== 'undefined';
}

function readCurrentModelContext(): ModelContext | undefined {
  return document.modelContext ?? navigator.modelContext;
}

function canReplaceModelContext(target: Document | Navigator): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(target, 'modelContext');
  return descriptor ? descriptor.configurable === true : Object.isExtensible(target);
}

function replaceDocumentModelContext(value: unknown): void {
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    enumerable: true,
    writable: false,
    value,
  });

  if (document.modelContext !== value) {
    console.error(
      '[WebModelContext] Failed to replace document.modelContext.',
      'Descriptor:',
      Object.getOwnPropertyDescriptor(document, 'modelContext')
    );
  }
}

function replaceNavigatorModelContext(value: unknown): void {
  Object.defineProperty(navigator, 'modelContext', {
    configurable: true,
    enumerable: true,
    writable: false,
    value,
  });

  if (navigator.modelContext !== value) {
    console.error(
      '[WebModelContext] Failed to replace navigator.modelContext.',
      'Descriptor:',
      Object.getOwnPropertyDescriptor(navigator, 'modelContext')
    );
  }
}

function restoreProperty(
  target: Document | Navigator,
  key: 'modelContext',
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}

/**
 * Replace both modelContext surfaces with the given value.
 *
 * document.modelContext is canonical. @mcp-b/global still supports old
 * navigator-first users, so the bridge exposes the BrowserMcpServer wrapper
 * through both properties.
 */
function replaceModelContext(
  value: unknown,
  previousDocumentDescriptor: PropertyDescriptor | undefined,
  previousNavigatorDescriptor: PropertyDescriptor | undefined
): void {
  try {
    replaceDocumentModelContext(value);
    replaceNavigatorModelContext(value);
  } catch (error) {
    restoreProperty(document, 'modelContext', previousDocumentDescriptor);
    restoreProperty(navigator, 'modelContext', previousNavigatorDescriptor);
    throw error;
  }
}

function createTransport(config: WebModelContextInitOptions['transport']): Transport {
  const inIframe = window.parent !== window;

  if (inIframe && config?.iframeServer !== false) {
    return new IframeChildTransport(
      typeof config?.iframeServer === 'object' ? config.iframeServer : { allowedOrigins: ['*'] }
    );
  }

  if (config?.tabServer === false) {
    throw new Error('tabServer transport is disabled and iframe transport was not selected');
  }

  return new TabServerTransport(
    typeof config?.tabServer === 'object' ? config.tabServer : { allowedOrigins: ['*'] }
  );
}

/** Installs the global bridge on `document.modelContext`. */
export function initializeWebModelContext(options?: WebModelContextInitOptions): void {
  if (!isBrowserEnvironment() || globalThis.isSecureContext === false) {
    return;
  }

  if (runtime) {
    return;
  }

  // Cross-bundle guard: if modelContext is already a BrowserMcpServer
  // (set by another bundle in this window), skip initialization.
  const existingContext = readCurrentModelContext();
  if (existingContext && isBrowserMcpServer(existingContext)) {
    return;
  }

  // Native and preinstalled contexts take precedence; otherwise install upstream.
  if (!existingContext) {
    installWebMCP();
  }
  // 2. Save reference to the polyfill's (or native) context
  const native = readCurrentModelContext();
  if (!native) {
    throw new Error('modelContext is not available');
  }

  // Some browser hosts expose a frozen native context through non-configurable
  // own properties. It is already usable and cannot legally be wrapped.
  if (!canReplaceModelContext(document) || !canReplaceModelContext(navigator)) {
    return;
  }

  // 3. Resolve transport before mutating either browser surface.
  const transport = createTransport(options?.transport);

  // 4. Create server with native mirroring
  const hostname = window.location.hostname || 'localhost';
  const server = new BrowserMcpServer(
    { name: `${hostname}-webmcp`, version: '1.0.0' },
    {
      native,
      ...(options?.nativeExecuteToolInput
        ? { nativeExecuteToolInput: options.nativeExecuteToolInput }
        : {}),
    }
  );
  let cleanupForms = () => {};
  let cleanupTesting = () => {};
  const cleanupCompatibility = () => {
    cleanupTesting();
    cleanupForms();
  };

  // 5. Replace both the canonical document surface and compatibility alias.
  const previousDocumentModelContextDescriptor = Object.getOwnPropertyDescriptor(
    document,
    'modelContext'
  );
  const previousNavigatorModelContextDescriptor = Object.getOwnPropertyDescriptor(
    navigator,
    'modelContext'
  );
  try {
    if (!('agentInvoked' in SubmitEvent.prototype) || !('respondWith' in SubmitEvent.prototype)) {
      cleanupForms = installWebMCPDeclarativeExtensions(native);
    }
    if (options?.installTestingShim ?? true) cleanupTesting = installTestingShim(server);
    replaceModelContext(
      server,
      previousDocumentModelContextDescriptor,
      previousNavigatorModelContextDescriptor
    );
    runtime = {
      server,
      cleanupCompatibility,
      transport,
      previousDocumentModelContextDescriptor,
      previousNavigatorModelContextDescriptor,
    };
  } catch (error) {
    cleanupCompatibility();
    void server.close();
    void transport.close();
    throw error;
  }

  void (async () => {
    try {
      await server.syncNativeTools();
    } catch (error) {
      console.warn('[WebModelContext] Native WebMCP tool synchronization failed:', error);
    }

    if (runtime?.server !== server) {
      return;
    }

    try {
      await server.connect(transport);
    } catch (error) {
      console.error('[WebModelContext] Failed to connect MCP transport:', error);
      if (runtime?.server === server) {
        cleanupWebModelContext();
      }
    }
  })();
}

export function cleanupWebModelContext(): void {
  if (!runtime) {
    return;
  }

  const {
    server,
    transport,
    cleanupCompatibility,
    previousDocumentModelContextDescriptor,
    previousNavigatorModelContextDescriptor,
  } = runtime;
  runtime = null;

  cleanupCompatibility();
  void server.close();
  void transport.close();

  // Restore the descriptors that existed before we wrapped with BrowserMcpServer.
  // The upstream polyfill remains installed for the lifetime of the document.
  restoreProperty(document, 'modelContext', previousDocumentModelContextDescriptor);
  restoreProperty(navigator, 'modelContext', previousNavigatorModelContextDescriptor);
}
