/**
 * Logging utility for MCP-B packages.
 *
 * Uses the `debug` package to provide namespace-based logging that is:
 * - Silent by default (no output unless explicitly enabled)
 * - Filterable by namespace
 * - Controllable via DEBUG env var (Node.js) or localStorage.debug (browser)
 *
 * @example
 * ```typescript
 * import { createLogger } from '@mcp-b/global/logger';
 *
 * const log = createLogger('transports:tab-client');
 *
 * log('Transport started');
 * log.warn('Connection unstable');
 * log.error('Connection failed: %O', error);
 * ```
 *
 * @example Enable logging in browser:
 * ```javascript
 * localStorage.debug = 'mcp-b:*'           // All mcp-b logs
 * localStorage.debug = 'mcp-b:transports:*' // Only transport logs
 * localStorage.debug = 'mcp-b:*:error'      // Only error logs
 * ```
 *
 * @example Enable logging in Node.js:
 * ```bash
 * DEBUG=mcp-b:* node app.js
 * ```
 *
 * @module logger
 */

import debug from 'debug';

/**
 * Base namespace for all MCP-B logging.
 * All loggers created via createLogger will be prefixed with this.
 */
const BASE_NAMESPACE = 'mcp-b';

/**
 * Logger interface with log level methods.
 * The base function logs at debug level.
 */
export interface Logger {
  /** Log at debug level (default) */
  (formatter: string, ...args: unknown[]): void;
  /** Log informational messages */
  info: debug.Debugger;
  /** Log warning messages */
  warn: debug.Debugger;
  /** Log error messages */
  error: debug.Debugger;
  /** The namespace for this logger */
  namespace: string;
  /** Whether this logger is enabled */
  enabled: boolean;
}

/**
 * Creates a namespaced logger for MCP-B packages.
 *
 * The logger is silent by default and only outputs when enabled via:
 * - Browser: `localStorage.debug = 'mcp-b:*'`
 * - Node.js: `DEBUG=mcp-b:* node app.js`
 *
 * @param module - Module name (e.g., 'transports:tab-client', 'global:init')
 * @returns Logger instance with debug, info, warn, and error methods
 *
 * @example
 * ```typescript
 * const log = createLogger('transports:tab-client');
 *
 * log('Connection established');          // mcp-b:transports:tab-client
 * log.info('Client connected');           // mcp-b:transports:tab-client:info
 * log.warn('Retrying connection');        // mcp-b:transports:tab-client:warn
 * log.error('Connection failed: %O', e);  // mcp-b:transports:tab-client:error
 * ```
 */
export function createLogger(module: string): Logger {
  const namespace = `${BASE_NAMESPACE}:${module}`;
  const baseDebug = debug(namespace);

  // Create level-specific loggers
  const info = debug(`${namespace}:info`);
  const warn = debug(`${namespace}:warn`);
  const error = debug(`${namespace}:error`);

  // Create the logger function with attached level methods
  const logger = baseDebug as unknown as Logger;
  logger.info = info;
  logger.warn = warn;
  logger.error = error;

  // Add convenience properties
  Object.defineProperty(logger, 'namespace', {
    value: namespace,
    writable: false,
  });

  Object.defineProperty(logger, 'enabled', {
    get: () => baseDebug.enabled || info.enabled || warn.enabled || error.enabled,
  });

  return logger;
}

/**
 * Enables logging for specified namespaces.
 * Useful for programmatic control of logging.
 *
 * @param namespaces - Namespace pattern (e.g., 'mcp-b:*', 'mcp-b:transports:*')
 *
 * @example
 * ```typescript
 * import { enableLogging } from '@mcp-b/global/logger';
 *
 * // Enable all MCP-B logs
 * enableLogging('mcp-b:*');
 *
 * // Enable only transport logs
 * enableLogging('mcp-b:transports:*');
 *
 * // Enable only error logs
 * enableLogging('mcp-b:*:error');
 * ```
 */
export function enableLogging(namespaces: string): void {
  debug.enable(namespaces);
}

/**
 * Disables all logging.
 *
 * @example
 * ```typescript
 * import { disableLogging } from '@mcp-b/global/logger';
 *
 * disableLogging();
 * ```
 */
export function disableLogging(): void {
  debug.disable();
}

/**
 * Gets the currently enabled namespaces.
 *
 * @returns The current namespace pattern string
 */
export function getEnabledNamespaces(): string {
  // The debug package stores enabled namespaces internally
  // We can access it via the enable function with no args
  return (debug as unknown as { namespaces?: string }).namespaces ?? '';
}

// Re-export the debug library for advanced use cases
export { debug };

// =============================================================================
// Internal loggers for @mcp-b/global package
// These are used internally and not exported to consumers
// =============================================================================

/** Logger for Web Model Context initialization and core functionality */
export const contextLog = createLogger('global:context');

/** Logger for native API adapter */
export const nativeAdapterLog = createLogger('global:native-adapter');

/** Logger for MCP bridge operations */
export const bridgeLog = createLogger('global:bridge');

/** Logger for testing API */
export const testingLog = createLogger('global:testing');

/** Logger for validation utilities */
export const validationLog = createLogger('global:validation');

/** Logger for initialization/index */
export const initLog = createLogger('global:init');
