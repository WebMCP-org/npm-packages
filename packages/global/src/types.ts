import type { IframeChildTransportOptions, TabServerTransportOptions } from '@mcp-b/transports';

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
}

declare global {
  interface Window {
    __webModelContextOptions?: WebModelContextInitOptions;
  }

  interface SubmitEvent {
    readonly agentInvoked?: boolean;
    respondWith?(agentResponse: Promise<unknown>): void;
  }
}
