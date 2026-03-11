import type { DetectionResult } from '../types';

/**
 * Detects if the native Web Model Context API is available
 * This function explicitly checks for the NATIVE implementation,
 * rejecting any polyfill implementations
 */
export function detectNativeAPI(): DetectionResult {
  const result: DetectionResult = {
    available: false,
    isNative: false,
    isPolyfill: false,
    testingAvailable: false,
    supportsProvideContext: false,
    supportsRegisterTool: false,
    supportsUnregisterTool: false,
    supportsClearContext: false,
    message: '',
  };

  // Check if modelContext exists
  if (!navigator.modelContext) {
    result.message =
      'navigator.modelContext not found. Please launch Chromium with --enable-experimental-web-platform-features';
    return result;
  }

  result.available = true;

  // Check if it's a polyfill by examining constructor names
  const testingAPI = navigator.modelContextTesting;

  if (testingAPI) {
    result.testingAvailable = true;

    // Native implementations won't have "WebModelContext" in constructor name
    const constructorName = testingAPI.constructor.name;
    result.isPolyfill = constructorName.includes('WebModelContext');
    result.isNative = !result.isPolyfill;

    if (result.isPolyfill) {
      result.message = `Polyfill detected (${constructorName}). This app requires the NATIVE Chromium implementation. Please ensure you've launched with --enable-experimental-web-platform-features and no polyfill is loaded.`;
      return result;
    }
  }

  result.supportsProvideContext = typeof navigator.modelContext.provideContext === 'function';
  result.supportsRegisterTool = typeof navigator.modelContext.registerTool === 'function';
  result.supportsUnregisterTool = typeof navigator.modelContext.unregisterTool === 'function';
  result.supportsClearContext = typeof navigator.modelContext.clearContext === 'function';

  result.isNative = true;
  if (result.supportsUnregisterTool && result.supportsClearContext) {
    result.message = 'Native Chromium Web Model Context API detected!';
    return result;
  }

  const missingMethods = [
    !result.supportsProvideContext ? 'provideContext' : null,
    !result.supportsRegisterTool ? 'registerTool' : null,
    !result.supportsUnregisterTool ? 'unregisterTool' : null,
    !result.supportsClearContext ? 'clearContext' : null,
  ].filter(Boolean);

  result.message = `Native Chromium Web Model Context API detected (partial native surface: missing ${missingMethods.join(', ')}).`;
  return result;
}

/**
 * Get detailed API information for debugging
 */
export function getAPIInfo(): Record<string, unknown> {
  const ctx = navigator.modelContext;
  const testing = navigator.modelContextTesting;

  return {
    modelContext: {
      available: !!ctx,
      methods: ctx ? Object.getOwnPropertyNames(Object.getPrototypeOf(ctx)) : [],
      constructorName: ctx?.constructor.name,
    },
    modelContextTesting: {
      available: !!testing,
      methods: testing ? Object.getOwnPropertyNames(Object.getPrototypeOf(testing)) : [],
      constructorName: testing?.constructor.name,
    },
  };
}
