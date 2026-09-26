import type { WebMCP } from '@mcp-b/webmcp-polyfill';
import type { IframeChildTransportOptions, TabServerTransportOptions } from '@mcp-b/transports';

/** @deprecated Compatibility surface for Chromium's removed testing API. */
export interface ModelContextTesting extends EventTarget {
  listTools(): Array<{ name: string; description: string; inputSchema?: string }>;
  executeTool(
    toolName: string,
    inputArgsJson: string,
    options?: WebMCP.ModelContextExecuteToolOptions
  ): Promise<string | null>;
  ontoolchange: ((this: ModelContextTesting, event: Event) => unknown) | null;
}

export interface TransportConfiguration {
  /**
   * Configuring a transport means stating its origins: `allowedOrigins` is required
   * here, so a wildcard is only ever reached by omitting the transport entirely.
   */
  tabServer?: TabServerTransportOptions | false;
  iframeServer?: IframeChildTransportOptions | false;
}

export interface WebModelContextInitOptions {
  transport?: TransportConfiguration;
  autoInitialize?: boolean;
  /** Input format of an already installed context. Defaults to the current object-input draft.
   * Set to `json` for older Chrome implementations. */
  nativeExecuteToolInput?: 'object' | 'json';
  /**
   * Installs the legacy testing shim on the wrapped context when one is absent.
   * @default true
   */
  installTestingShim?: boolean;
}

declare global {
  interface Window {
    __webModelContextOptions?: WebModelContextInitOptions;
  }

  interface Navigator {
    /** @deprecated Compatibility surface for older Chromium previews. */
    modelContextTesting?: ModelContextTesting;
  }

  interface SubmitEvent {
    readonly agentInvoked?: boolean;
    respondWith?(agentResponse: Promise<unknown>): void;
  }
}
