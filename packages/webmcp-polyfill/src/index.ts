import { cleanupWebModelContext, initializeWebModelContext } from './global.js';
import { createLogger } from './logger.js';
import type { WebModelContextInitOptions } from './types.js';

const logger = createLogger('WebModelContext');

function mergeInitOptions(
  base?: WebModelContextInitOptions,
  override?: WebModelContextInitOptions
): WebModelContextInitOptions | undefined {
  if (!base) {
    return override;
  }
  if (!override) {
    return base;
  }

  return {
    ...base,
    ...override,
  };
}

function parseScriptTagOptions(
  script: HTMLScriptElement | null
): WebModelContextInitOptions | undefined {
  if (!script || !script.dataset) {
    return undefined;
  }

  const { dataset } = script;
  const options: WebModelContextInitOptions = {};
  let hasOptions = false;

  if (dataset.webmcpOptions) {
    try {
      return JSON.parse(dataset.webmcpOptions) as WebModelContextInitOptions;
    } catch (error) {
      logger.error('Invalid JSON in data-webmcp-options:', error);
      return undefined;
    }
  }

  if (dataset.webmcpAutoInitialize !== undefined) {
    options.autoInitialize = dataset.webmcpAutoInitialize !== 'false';
    hasOptions = true;
  }

  return hasOptions ? options : undefined;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const globalOptions = window.__webModelContextOptions;
  const scriptElement = document.currentScript as HTMLScriptElement | null;
  const scriptOptions = parseScriptTagOptions(scriptElement);
  const mergedOptions =
    mergeInitOptions(globalOptions, scriptOptions) ?? globalOptions ?? scriptOptions;

  if (mergedOptions) {
    window.__webModelContextOptions = mergedOptions;
  }

  try {
    initializeWebModelContext(mergedOptions);
  } catch (error) {
    logger.error('Auto-initialization failed:', error);
  }
}

export { cleanupWebModelContext, initializeWebModelContext };
export { createLogger } from './logger.js';
export type * from './types.js';
export { compileJsonSchema } from './validation.js';
