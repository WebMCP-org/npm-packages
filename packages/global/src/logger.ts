/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Lightweight logging system for @mcp-b/global
 *
 * Design Decision: This implements a custom logger instead of using the 'debug'
 * package to reduce bundle size and eliminate external dependencies in the
 * browser build. The API is intentionally simpler, focusing on the specific
 * needs of browser-based MCP implementations.
 *
 * Configuration via localStorage:
 * - localStorage.setItem('WEBMCP_DEBUG', '*') - enable all debug logging
 * - localStorage.setItem('WEBMCP_DEBUG', 'WebModelContext') - enable specific namespace
 * - localStorage.setItem('WEBMCP_DEBUG', 'WebModelContext,NativeAdapter') - multiple namespaces
 * - localStorage.setItem('WEBMCP_DEBUG', 'WebModelContext:') - enable namespace and sub-namespaces
 * - localStorage.removeItem('WEBMCP_DEBUG') - disable debug logging (default)
 *
 * Environment Support:
 * - Automatically detects localStorage availability
 * - Gracefully degrades to "disabled" state when localStorage is inaccessible
 * - Never throws errors from configuration checks (safe for private browsing mode)
 */

/** localStorage key for debug configuration */
const DEBUG_CONFIG_KEY = 'WEBMCP_DEBUG' as const;

/**
 * Check if debug logging is enabled for a namespace
 *
 * Supports namespace hierarchy via colons. Setting 'WebModelContext' will match
 * both 'WebModelContext' and 'WebModelContext:init', but NOT 'WebModelContextTesting'.
 */
function isDebugEnabled(namespace: string): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }

  try {
    const debugConfig = localStorage.getItem(DEBUG_CONFIG_KEY);
    if (!debugConfig) return false;

    if (debugConfig === '*') return true;

    const patterns = debugConfig.split(',').map((p) => p.trim());
    return patterns.some((pattern) => namespace === pattern || namespace.startsWith(`${pattern}:`));
  } catch (err) {
    // localStorage might throw in some browsers (private mode, disabled storage)
    // Log once to console so developers know debug logging is disabled
    if (typeof console !== 'undefined' && console.warn) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[WebMCP] localStorage access failed, debug logging disabled: ${message}`);
    }
    return false;
  }
}

/**
 * No-op function for disabled log levels
 */
const noop = (): void => {};

/**
 * Logger interface with standard log levels
 *
 * All methods accept the same argument patterns as their console.* equivalents,
 * supporting format strings, object inspection, and multiple arguments.
 */
export interface Logger {
  /** Debug-level logging (disabled by default, enable via WEBMCP_DEBUG) */
  debug(message?: unknown, ...optionalParams: unknown[]): void;
  /** Info-level logging (disabled by default, enable via WEBMCP_DEBUG) */
  info(message?: unknown, ...optionalParams: unknown[]): void;
  /** Warning-level logging (enabled by default, not gated by WEBMCP_DEBUG) */
  warn(message?: unknown, ...optionalParams: unknown[]): void;
  /** Error-level logging (enabled by default, not gated by WEBMCP_DEBUG) */
  error(message?: unknown, ...optionalParams: unknown[]): void;
}

/**
 * Create a namespaced logger
 *
 * Uses .bind() to prepend namespace prefixes to console methods without manual
 * string concatenation. Debug enablement is determined at logger creation time
 * for performance - changes to localStorage after creation won't affect existing
 * loggers. Refresh the page to apply new WEBMCP_DEBUG settings.
 *
 * @param namespace - Namespace for the logger (e.g., 'WebModelContext', 'NativeAdapter')
 * @returns Logger instance with debug, info, warn, error methods
 *
 * @example
 * ```typescript
 * const logger = createLogger('WebModelContext');
 * logger.debug('Tool registered:', toolName); // Only shown if WEBMCP_DEBUG includes 'WebModelContext'
 * logger.error('Execution failed:', error); // Always enabled
 * ```
 */
export function createLogger(namespace: string): Logger {
  const prefix = `[${namespace}]`;

  // Note: Debug enablement is checked once at creation time for performance.
  // Changes to localStorage after creation won't affect existing loggers.
  const isDebug = isDebugEnabled(namespace);

  // Create bound console methods that include the namespace prefix
  const boundWarn = console.warn.bind(console, prefix);
  const boundError = console.error.bind(console, prefix);
  const boundLog = console.log.bind(console, prefix);

  return {
    // Warnings and errors are always enabled (production-safe)
    warn: boundWarn,
    error: boundError,

    // Debug and info are conditional - use bound methods or no-ops
    debug: isDebug ? boundLog : noop,
    info: isDebug ? boundLog : noop,
  };
}
