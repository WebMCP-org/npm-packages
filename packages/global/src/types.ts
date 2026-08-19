/// <reference types="@mcp-b/webmcp-types" preserve="true" />

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
  /**
   * Forwarded to @mcp-b/webmcp-polyfill when polyfill installation is needed.
   * Existing modelContextTesting implementations are never replaced.
   *
   * Deliberately inverts the polyfill's own default (false): this entry point is the
   * batteries-included one, and the e2e suites rely on the shim being present.
   * @default true
   */
  installTestingShim?: boolean;
}

declare global {
  interface Window {
    __webModelContextOptions?: WebModelContextInitOptions;
  }
}
