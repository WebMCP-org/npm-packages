import type { IframeChildTransportOptions, TabServerTransportOptions } from '@mcp-b/transports';

export interface TransportConfiguration {
  tabServer?: Partial<TabServerTransportOptions> | false;
  iframeServer?: Partial<IframeChildTransportOptions> | false;
}

export type NativeModelContextBehavior = 'preserve' | 'patch';

export interface WebModelContextInitOptions {
  transport?: TransportConfiguration;
  autoInitialize?: boolean;
  /**
   * Behavior when navigator.modelContext already exists.
   * - 'preserve' (default): wrap native with BrowserMcpServer, mirroring
   *   core operations to the native object while extending with prompts,
   *   resources, and other MCP capabilities.
   * - 'patch': same wrapping behavior (kept for backward compatibility).
   */
  nativeModelContextBehavior?: NativeModelContextBehavior;
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
