import {
  IframeChildTransport,
  type IframeChildTransportOptions,
  TabServerTransport,
  type TabServerTransportOptions,
} from '@mcp-b/transports';
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import { BrowserMcpServer, SERVER_MARKER_PROPERTY } from '@mcp-b/webmcp-ts-sdk';
import type { ModelContext } from '@mcp-b/webmcp-types';
import type { Transport } from '@modelcontextprotocol/server';
import type { WebModelContextInitOptions } from './types.js';

interface RuntimeState {
  native: ModelContext;
  server: BrowserMcpServer;
  transport: Transport;
  previousDocumentModelContextDescriptor: PropertyDescriptor | undefined;
  previousNavigatorModelContextDescriptor: PropertyDescriptor | undefined;
}

let runtime: RuntimeState | null = null;

function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof window.navigator !== 'undefined';
}

function readCurrentModelContext(): ModelContext | undefined {
  return document.modelContext ?? navigator.modelContext;
}

function isBrowserMcpServer(context: ModelContext): context is BrowserMcpServer {
  return SERVER_MARKER_PROPERTY in context && context[SERVER_MARKER_PROPERTY] === true;
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

  // Verify the replacement actually worked — the prototype getter cannot
  // shadow a non-configurable own property on the navigator instance.
  if (navigator.modelContext !== value) {
    console.error(
      '[WebModelContext] Failed to replace navigator.modelContext.',
      'Descriptor:',
      Object.getOwnPropertyDescriptor(navigator, 'modelContext')
    );
  }
}

/**
 * Replace both modelContext surfaces with the given value.
 *
 * document.modelContext is canonical. @mcp-b/global still supports old
 * navigator-first users, so the bridge exposes the BrowserMcpServer wrapper
 * through both properties.
 */
function restoreProperty(
  target: Document | Navigator,
  key: 'modelContext',
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}

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
    const iframeOptions: Partial<IframeChildTransportOptions> =
      typeof config?.iframeServer === 'object' ? config.iframeServer : {};

    const { allowedOrigins, ...rest } = iframeOptions;

    return new IframeChildTransport({
      allowedOrigins: allowedOrigins ?? ['*'],
      ...rest,
    });
  }

  if (config?.tabServer === false) {
    throw new Error('tabServer transport is disabled and iframe transport was not selected');
  }

  const tabOptions: Partial<TabServerTransportOptions> =
    typeof config?.tabServer === 'object' ? config.tabServer : {};

  const { allowedOrigins, ...rest } = tabOptions;

  return new TabServerTransport({
    allowedOrigins: allowedOrigins ?? ['*'],
    ...rest,
  });
}

/** Initializes the global bridge and returns the active server. */
export function initializeWebModelContext(
  options?: WebModelContextInitOptions
): BrowserMcpServer | undefined {
  if (!isBrowserEnvironment() || globalThis.isSecureContext === false) {
    return;
  }

  if (runtime) {
    return runtime.server;
  }

  // Cross-bundle guard: if modelContext is already a BrowserMcpServer
  // (set by another bundle in this window), skip initialization.
  const existingContext = readCurrentModelContext();
  if (existingContext && isBrowserMcpServer(existingContext)) {
    return existingContext;
  }

  // 1. Install polyfill (provides modelContext + modelContextTesting)
  initializeWebMCPPolyfill({
    installTestingShim: options?.installTestingShim ?? true,
  });

  // 2. Save reference to the polyfill's (or native) context
  const native = readCurrentModelContext();
  if (!native) {
    throw new Error('modelContext is not available');
  }

  // 3. Resolve transport before mutating either browser surface.
  const transport = createTransport(options?.transport);

  // 4. Create server with native mirroring
  const hostname = window.location.hostname || 'localhost';
  const server = new BrowserMcpServer({ name: `${hostname}-webmcp`, version: '1.0.0' }, { native });

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
    replaceModelContext(
      server,
      previousDocumentModelContextDescriptor,
      previousNavigatorModelContextDescriptor
    );
    runtime = {
      native,
      server,
      transport,
      previousDocumentModelContextDescriptor,
      previousNavigatorModelContextDescriptor,
    };
  } catch (error) {
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

  return server;
}

export function cleanupWebModelContext(): void {
  if (!runtime) {
    return;
  }

  const {
    server,
    transport,
    previousDocumentModelContextDescriptor,
    previousNavigatorModelContextDescriptor,
  } = runtime;
  runtime = null;

  void server.close();
  void transport.close();

  // Restore the descriptors that existed before we wrapped with BrowserMcpServer.
  // We intentionally do NOT call cleanupWebMCPPolyfill() here — the polyfill
  // manages its own lifecycle (auto-init, testing shim) independently.
  restoreProperty(document, 'modelContext', previousDocumentModelContextDescriptor);
  restoreProperty(navigator, 'modelContext', previousNavigatorModelContextDescriptor);
}
