import { IframeChildTransport, TabServerTransport } from '@mcp-b/transports';
import { installWebMCP } from '@mcp-b/webmcp-polyfill';
import { BrowserMcpServer, isBrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';
import type { Transport } from '@modelcontextprotocol/server';
import type { WebModelContextInitOptions } from './types.js';

interface RuntimeState {
  server: BrowserMcpServer;
  transport: Transport;
  previousDescriptor: PropertyDescriptor | undefined;
}

let runtime: RuntimeState | null = null;

function createTransport(config: WebModelContextInitOptions['transport']): Transport {
  const inIframe = window.parent !== window;

  if (inIframe && config?.iframeServer !== false) {
    return new IframeChildTransport(config?.iframeServer || { allowedOrigins: ['*'] });
  }

  if (config?.tabServer === false) {
    throw new Error('tabServer transport is disabled and iframe transport was not selected');
  }

  return new TabServerTransport(config?.tabServer || { allowedOrigins: ['*'] });
}

/** Installs the global bridge on `document.modelContext`. */
export function initializeWebModelContext(options?: WebModelContextInitOptions): void {
  if (!globalThis.window || !globalThis.document || globalThis.isSecureContext === false) {
    return;
  }

  if (runtime) {
    return;
  }

  // Cross-bundle guard: another bundle in this window already installed the bridge.
  if (isBrowserMcpServer(document.modelContext)) {
    return;
  }

  // Preserve native/core contexts and add declarative support when it is missing.
  installWebMCP();
  // Capture the upstream context before installing MCP-B extensions.
  const native = document.modelContext;
  if (!native) {
    throw new Error('modelContext is not available');
  }

  // Some browser hosts expose a frozen native context through non-configurable
  // own properties. It is already usable and cannot legally be wrapped.
  const previousDescriptor = Object.getOwnPropertyDescriptor(document, 'modelContext');
  if (previousDescriptor ? !previousDescriptor.configurable : !Object.isExtensible(document)) {
    return;
  }

  // Resolve transport before replacing the document context.
  const transport = createTransport(options?.transport);

  // Create the MCP server with native mirroring.
  const hostname = window.location.hostname || 'localhost';
  const server = new BrowserMcpServer({ name: `${hostname}-webmcp`, version: '1.0.0' }, { native });

  try {
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      enumerable: true,
      writable: false,
      value: server,
    });
    runtime = { server, transport, previousDescriptor };
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
}

export function cleanupWebModelContext(): void {
  if (!runtime) {
    return;
  }

  const { server, transport, previousDescriptor } = runtime;
  runtime = null;

  void server.close();
  void transport.close();

  // The polyfill and its declarative layer remain installed for the lifetime of the document.
  if (previousDescriptor) {
    Object.defineProperty(document, 'modelContext', previousDescriptor);
  } else {
    Reflect.deleteProperty(document, 'modelContext');
  }
}
