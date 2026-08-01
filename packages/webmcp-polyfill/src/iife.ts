import { initializeWebMCPPolyfill, type WebMCPPolyfillInitOptions } from './index.js';

export * from './index.js';

declare global {
  interface Window {
    __webMCPPolyfillOptions?: WebMCPPolyfillInitOptions;
  }
}

try {
  initializeWebMCPPolyfill(window.__webMCPPolyfillOptions);
} catch (error) {
  console.error('[WebMCPPolyfill] Auto-initialization failed:', error);
}
