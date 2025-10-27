// index.ts - Entry point for Web Model Context API polyfill

import { initializeWebModelContext } from './global.js';

// Auto-initialize immediately when script loads in browser environments
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  try {
    initializeWebModelContext();
  } catch (error) {
    console.error('[Web Model Context] Auto-initialization failed:', error);
  }
}

// For manual initialization (when using as ES module)
export { cleanupWebModelContext, initializeWebModelContext } from './global.js';
export type * from './types.js';
