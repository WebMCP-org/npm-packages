import { cleanupWebModelContext, initializeWebModelContext } from './global.js';

export { cleanupWebModelContext, initializeWebModelContext };
export type { WebMCP } from '@mcp-b/webmcp-polyfill';

export type { TransportConfiguration, WebModelContextInitOptions } from './types.js';

const options = globalThis.window?.__webModelContextOptions;
if (options?.autoInitialize !== false) {
  try {
    initializeWebModelContext(options);
  } catch (error) {
    console.error('[WebModelContext] Auto-initialization failed:', error);
  }
}
