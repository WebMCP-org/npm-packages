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
    message: '',
  };

  const context = document.modelContext as
    | (Document['modelContext'] & { __isWebMCPPolyfill?: boolean })
    | undefined;

  if (!context) {
    result.message =
      'document.modelContext not found. Please launch Chromium with --enable-experimental-web-platform-features';
    return result;
  }

  result.available = true;

  result.isPolyfill = context.__isWebMCPPolyfill === true;
  if (result.isPolyfill) {
    result.message =
      'WebMCP polyfill detected. This app requires Chromium document.modelContext with no polyfill loaded.';
    return result;
  }

  if (
    typeof context.registerTool !== 'function' ||
    typeof context.getTools !== 'function' ||
    typeof context.addEventListener !== 'function'
  ) {
    result.message = 'document.modelContext is missing required WebMCP methods';
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
  const ctx = document.modelContext;

  return {
    modelContext: {
      available: !!ctx,
      methods: ctx ? Object.getOwnPropertyNames(Object.getPrototypeOf(ctx)) : [],
      constructorName: ctx?.constructor.name,
    },
  };
}
