import { IframeChildTransport, TabServerTransport } from '@mcp-b/transports';
import { installWebMCP } from '@mcp-b/webmcp-polyfill';
import { BrowserMcpServer, isBrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';
import type { Transport } from '@modelcontextprotocol/server';
import { installWebMCPDeclarativeExtensions } from './declarative-forms.js';
import type { WebModelContextInitOptions } from './types.js';

interface RuntimeState {
  server: BrowserMcpServer;
  cleanupForms: () => void;
  transport: Transport;
  previousDocumentModelContextDescriptor: PropertyDescriptor | undefined;
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

  // Cross-bundle guard: if modelContext is already a BrowserMcpServer
  // (set by another bundle in this window), skip initialization.
  const existingContext = document.modelContext;
  if (existingContext && isBrowserMcpServer(existingContext)) {
    return;
  }

  // Native and preinstalled contexts take precedence; otherwise install upstream.
  if (!existingContext) {
    installWebMCP();
  }
  // Capture the upstream context before installing MCP-B extensions.
  const native = document.modelContext;
  if (!native) {
    throw new Error('modelContext is not available');
  }

  // Some browser hosts expose a frozen native context through non-configurable
  // own properties. It is already usable and cannot legally be wrapped.
  const previousDocumentModelContextDescriptor = Object.getOwnPropertyDescriptor(
    document,
    'modelContext'
  );
  if (
    previousDocumentModelContextDescriptor
      ? !previousDocumentModelContextDescriptor.configurable
      : !Object.isExtensible(document)
  )
    return;

  // Resolve transport before replacing the document context.
  const transport = createTransport(options?.transport);

  // Create the MCP server with native mirroring.
  const hostname = window.location.hostname || 'localhost';
  const server = new BrowserMcpServer({ name: `${hostname}-webmcp`, version: '1.0.0' }, { native });
  let cleanupForms = () => {};

  try {
    if (!('agentInvoked' in SubmitEvent.prototype) || !('respondWith' in SubmitEvent.prototype)) {
      cleanupForms = installWebMCPDeclarativeExtensions(native);
    }
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      enumerable: true,
      writable: false,
      value: server,
    });
    runtime = {
      server,
      cleanupForms,
      transport,
      previousDocumentModelContextDescriptor,
    };
  } catch (error) {
    cleanupForms();
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

  const { server, transport, cleanupForms, previousDocumentModelContextDescriptor } = runtime;
  runtime = null;

  cleanupForms();
  void server.close();
  void transport.close();

  // Restore the descriptors that existed before we wrapped with BrowserMcpServer.
  // The upstream polyfill remains installed for the lifetime of the document.
  if (previousDocumentModelContextDescriptor) {
    Object.defineProperty(document, 'modelContext', previousDocumentModelContextDescriptor);
  } else {
    Reflect.deleteProperty(document, 'modelContext');
  }
}
