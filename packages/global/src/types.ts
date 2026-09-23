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
  /** Input format of an already installed context. Defaults to the current object-input draft.
   * Set to `json` for older Chrome implementations. */
  nativeExecuteToolInput?: 'object' | 'json';
  /**
   * Installs the legacy testing shim when this entry point installs a polyfill.
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
