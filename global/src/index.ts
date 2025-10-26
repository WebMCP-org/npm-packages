// index.ts - Entry point for Web Model Context API polyfill

import { initializeWebModelContext } from './global.js';

// Auto-initialize when script loads in browser environments
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      try {
        initializeWebModelContext();
      } catch (error) {
        console.error('[Web Model Context] Auto-initialization failed:', error);
      }
    });
  } else {
    // DOM is already ready
    try {
      initializeWebModelContext();
    } catch (error) {
      console.error('[Web Model Context] Auto-initialization failed:', error);
    }
  }
}

// For manual initialization (when using as ES module)
export { cleanupWebModelContext, initializeWebModelContext } from './global.js';
export type * from './types.js';
