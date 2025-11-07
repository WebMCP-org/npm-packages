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
    message: '',
  };

  // Check if modelContext exists
  if (!navigator.modelContext) {
    result.message = 'navigator.modelContext not found. Please launch Chromium with --enable-experimental-web-platform-features';
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

  // Additional check: native API should have Chromium-specific methods
  const hasNativeMethods =
    typeof navigator.modelContext.unregisterTool === 'function' &&
    typeof navigator.modelContext.clearContext === 'function';

  if (!hasNativeMethods) {
    result.isPolyfill = true;
    result.isNative = false;
    result.message = 'Missing native methods (unregisterTool, clearContext). Polyfill detected.';
    return result;
  }

  result.isNative = true;
  result.message = 'Native Chromium Web Model Context API detected!';
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
