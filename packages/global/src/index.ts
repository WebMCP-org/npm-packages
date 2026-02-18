import { cleanupWebModelContext, initializeWebModelContext } from './global.js';

export { cleanupWebModelContext, initializeWebModelContext };

export type {
  NativeModelContextBehavior,
  TransportConfiguration,
  WebModelContextInitOptions,
} from './types.js';

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
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
