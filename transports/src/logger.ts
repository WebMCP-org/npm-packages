/**
 * Logging utility for MCP-B transports.
 *
 * Uses the `debug` package to provide namespace-based logging that is:
 * - Silent by default (no output unless explicitly enabled)
 * - Filterable by namespace
 * - Controllable via DEBUG env var (Node.js) or localStorage.debug (browser)
 *
 * @example Enable logging in browser:
 * ```javascript
 * localStorage.debug = 'mcp-b:transports:*' // All transport logs
 * ```
 *
 * @module logger
 */

import debug from 'debug';

const BASE_NAMESPACE = 'mcp-b:transports';

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
 * Creates a namespaced logger for transports.
 */
function createLogger(module: string): Logger {
  const namespace = `${BASE_NAMESPACE}:${module}`;
  const baseDebug = debug(namespace);
  const warn = debug(`${namespace}:warn`);
  const error = debug(`${namespace}:error`);

  // Extend the base debugger with warn and error methods
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

// Pre-create loggers for each transport
export const tabClientLog = createLogger('tab-client');
export const tabServerLog = createLogger('tab-server');
export const iframeChildLog = createLogger('iframe-child');
export const iframeParentLog = createLogger('iframe-parent');
export const extensionClientLog = createLogger('extension-client');
export const extensionServerLog = createLogger('extension-server');
export const userScriptClientLog = createLogger('userscript-client');
export const userScriptServerLog = createLogger('userscript-server');
