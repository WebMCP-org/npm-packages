import type { DetectionResult } from '../types';

/**
 * Checks the WebMCP API surface used by this native-only showcase.
 * WebMCP does not expose a standard way to identify a polyfill at runtime;
 * the showcase relies on its native-Chrome launch setup and does not load one.
 */
export function detectNativeAPI(): DetectionResult {
  const context = document.modelContext;

  if (!context) {
    return {
      isNative: false,
      message:
        'document.modelContext not found. Please launch Chromium with --enable-experimental-web-platform-features',
    };
  }

  if (
    typeof context.registerTool !== 'function' ||
    typeof context.getTools !== 'function' ||
    typeof context.addEventListener !== 'function'
  ) {
    return { isNative: false, message: 'document.modelContext is missing required WebMCP methods' };
  }

  return {
    isNative: true,
    message: 'Native Chromium Web Model Context API detected in the native-only showcase.',
  };
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
