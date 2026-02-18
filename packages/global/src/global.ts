import {
  IframeChildTransport,
  type IframeChildTransportOptions,
  TabServerTransport,
  type TabServerTransportOptions,
} from '@mcp-b/transports';
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import { BrowserMcpServer, type Transport } from '@mcp-b/webmcp-ts-sdk';
import type { ModelContextCore } from '@mcp-b/webmcp-types';
import type { WebModelContextInitOptions } from './types.js';

interface RuntimeState {
  native: ModelContextCore;
  server: BrowserMcpServer;
  transport: Transport;
}

let runtime: RuntimeState | null = null;

function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof window.navigator !== 'undefined';
}

/**
 * Replace navigator.modelContext with the given value.
 * Tries an own-property on the navigator instance first. If the native browser
 * defines modelContext as a non-configurable property (common in Chromium), this
 * will throw — in that case we fall back to redefining the getter on
 * Navigator.prototype so that `navigator.modelContext` resolves to our value.
 */
function replaceModelContext(value: unknown): void {
  try {
    Object.defineProperty(navigator, 'modelContext', {
      configurable: true,
      enumerable: true,
      writable: false,
      value,
    });
  } catch {
    // Native browser property is non-configurable on the instance.
    // Shadow it with a getter on the prototype instead.
    Object.defineProperty(Object.getPrototypeOf(navigator), 'modelContext', {
      configurable: true,
      enumerable: true,
      get() {
        return value;
      },
    });
  }

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

function createTransport(config: WebModelContextInitOptions['transport']): Transport {
  const inIframe = window.parent !== window;

  if (inIframe && config?.iframeServer !== false) {
    const iframeOptions =
      typeof config?.iframeServer === 'object'
        ? config.iframeServer
        : ({} as Partial<IframeChildTransportOptions>);

    const { allowedOrigins, ...rest } = iframeOptions;

    return new IframeChildTransport({
      allowedOrigins: allowedOrigins ?? ['*'],
      ...rest,
    });
  }

  if (config?.tabServer === false) {
    throw new Error('tabServer transport is disabled and iframe transport was not selected');
  }

  const tabOptions =
    typeof config?.tabServer === 'object'
      ? config.tabServer
      : ({} as Partial<TabServerTransportOptions>);

  const { allowedOrigins, ...rest } = tabOptions;

  return new TabServerTransport({
    allowedOrigins: allowedOrigins ?? ['*'],
    ...rest,
  });
}

export function initializeWebModelContext(options?: WebModelContextInitOptions): void {
  if (!isBrowserEnvironment()) {
    return;
  }

  if (runtime) {
    return;
  }

  // 1. Install polyfill (provides modelContext + modelContextTesting)
  initializeWebMCPPolyfill({
    installTestingShim: options?.installTestingShim ?? 'if-missing',
  });

  // 2. Save reference to the polyfill's (or native) context
  const native = navigator.modelContext as unknown as ModelContextCore;
  if (!native) {
    throw new Error('navigator.modelContext is not available');
  }

  // 3. Create server with native mirroring
  const hostname = window.location.hostname || 'localhost';
  const server = new BrowserMcpServer({ name: `${hostname}-webmcp`, version: '1.0.0' }, { native });

  // 4. Replace navigator.modelContext with the server.
  // Try own-property on the navigator instance first (works for polyfill and most cases).
  // Fall back to a prototype getter if the native property is non-configurable.
  replaceModelContext(server);

  // 5. Create transport and connect
  const transport = createTransport(options?.transport);
  runtime = { native, server, transport };

  void server.connect(transport).catch((error: unknown) => {
    console.error('[WebModelContext] Failed to connect MCP transport:', error);
  });
}

export function cleanupWebModelContext(): void {
  if (!runtime) {
    return;
  }

  const { native, server, transport } = runtime;
  runtime = null;

  void server.close();
  void transport.close();

  // Restore the context that existed before we wrapped it with BrowserMcpServer.
  // We intentionally do NOT call cleanupWebMCPPolyfill() here — the polyfill
  // manages its own lifecycle (auto-init, testing shim) independently.
  replaceModelContext(native);
}
