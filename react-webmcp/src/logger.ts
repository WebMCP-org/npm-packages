/**
 * Logging utility for @mcp-b/react-webmcp package.
 *
 * Uses the `debug` package to provide namespace-based logging that is:
 * - Silent by default (no output unless explicitly enabled)
 * - Filterable by namespace
 * - Controllable via DEBUG env var (Node.js) or localStorage.debug (browser)
 *
 * @example Enable logging in browser:
 * ```javascript
 * localStorage.debug = 'mcp-b:react:*' // All react-webmcp logs
 * ```
 *
 * @module logger
 */

import debug from 'debug';

const BASE_NAMESPACE = 'mcp-b:react';

/**
 * Logger interface with log level methods.
 */
export interface Logger {
  /** Log at debug level (default) */
  (formatter: string, ...args: unknown[]): void;
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
 * Creates a namespaced logger for react-webmcp.
 */
function createLogger(module: string): Logger {
  const namespace = `${BASE_NAMESPACE}:${module}`;
  const baseDebug = debug(namespace);
  const warn = debug(`${namespace}:warn`);
  const error = debug(`${namespace}:error`);

  const logger = baseDebug as unknown as Logger;
  logger.warn = warn;
  logger.error = error;

  Object.defineProperty(logger, 'namespace', {
    value: namespace,
    writable: false,
  });

  Object.defineProperty(logger, 'enabled', {
    get: () => baseDebug.enabled || warn.enabled || error.enabled,
  });

  return logger;
}

// Pre-create loggers for each module
export const useWebMCPLog = createLogger('useWebMCP');
export const clientProviderLog = createLogger('McpClientProvider');
