import {
  IframeChildTransport,
  type IframeChildTransportOptions,
  TabServerTransport,
  type TabServerTransportOptions,
} from '@mcp-b/transports';
import { cleanupWebMCPPolyfill, initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
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

function isPolyfillModelContext(value: unknown): boolean {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as Record<string, unknown>).__isWebMCPPolyfill === true
  );
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

  const existingContext = navigator.modelContext as unknown;
  const hasNativeModelContext =
    Boolean(existingContext) && !isPolyfillModelContext(existingContext);
  const nativeModelContextBehavior = options?.nativeModelContextBehavior ?? 'preserve';

  if (hasNativeModelContext && nativeModelContextBehavior === 'preserve') {
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

  // 4. Replace navigator.modelContext with the server
  Object.defineProperty(navigator, 'modelContext', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: server,
  });

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

  // Restore the original context before polyfill cleanup
  Object.defineProperty(navigator, 'modelContext', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: native,
  });

  void server.close();
  void transport.close();

  cleanupWebMCPPolyfill();
}
