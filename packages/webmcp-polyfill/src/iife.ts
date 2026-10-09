import { installWebMCP } from './index.js';

export * from './index.js';

try {
  installWebMCP();
} catch (error) {
  console.error('[WebMCPPolyfill] Auto-initialization failed:', error);
}
