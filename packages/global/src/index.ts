import { cleanupWebModelContext, initializeWebModelContext } from './global.js';

export { cleanupWebModelContext, initializeWebModelContext };
export type { WebMCP } from '@mcp-b/webmcp-polyfill';

export type { TransportConfiguration, WebModelContextInitOptions } from './types.js';

if (globalThis.window !== undefined && globalThis.document !== undefined) {
  const options = window.__webModelContextOptions;
  const shouldAutoInitialize = options?.autoInitialize !== false;

  if (shouldAutoInitialize) {
    try {
      initializeWebModelContext(options);
    } catch (error) {
      console.error('[WebModelContext] Auto-initialization failed:', error);
    }
  }
}
