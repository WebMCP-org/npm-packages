/**
 * Logging utility for @mcp-b/react-webmcp package.
 * @module logger
 */

import debug from 'debug';

const BASE_NAMESPACE = 'mcp-b:react';

interface Logger {
  (formatter: string, ...args: unknown[]): void;
  warn: debug.Debugger;
  error: debug.Debugger;
}

function createLogger(module: string): Logger {
  const namespace = `${BASE_NAMESPACE}:${module}`;
  const baseDebug = debug(namespace);
  const warn = debug(`${namespace}:warn`);
  const error = debug(`${namespace}:error`);

  const logger = baseDebug as unknown as Logger;
  logger.warn = warn;
  logger.error = error;

  return logger;
}

export const useWebMCPLog = createLogger('useWebMCP');
export const clientProviderLog = createLogger('McpClientProvider');
