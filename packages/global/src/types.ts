/// <reference types="@mcp-b/webmcp-types" preserve="true" />

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
   * Existing modelContextTesting implementations are never replaced.
   * @default true
   */
  installTestingShim?: boolean;
}

declare global {
  interface Window {
    __webModelContextOptions?: WebModelContextInitOptions;
  }
}
