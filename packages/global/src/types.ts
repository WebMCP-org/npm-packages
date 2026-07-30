import type { IframeChildTransportOptions, TabServerTransportOptions } from '@mcp-b/transports';

export interface TransportConfiguration {
  tabServer?: Partial<TabServerTransportOptions> | false;
  iframeServer?: Partial<IframeChildTransportOptions> | false;
}

export interface WebModelContextInitOptions {
  transport?: TransportConfiguration;
  autoInitialize?: boolean;
  /**
   * Forwarded to @mcp-b/webmcp-polyfill when polyfill installation is needed.
   * - true or 'if-missing' (default): install modelContextTesting only when missing.
   * - 'always': replace existing modelContextTesting.
   * - false: do not install modelContextTesting.
   */
  installTestingShim?: boolean | 'always' | 'if-missing';
}

declare global {
  interface Window {
    __webModelContextOptions?: WebModelContextInitOptions;
  }
}
