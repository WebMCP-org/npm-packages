import { initializeWebModelContext } from './global.js';
import { initLog as log } from './logger.js';
import type { TransportConfiguration, WebModelContextInitOptions } from './types.js';

type TabServerConfig = NonNullable<TransportConfiguration['tabServer']>;

function mergeTransportOptions(
  base: TransportConfiguration,
  override: TransportConfiguration
): TransportConfiguration {
  if (!base) {
    return override;
  }
  if (!override) {
    return base;
  }

  return {
    ...base,
    ...override,
    tabServer: {
      ...(base.tabServer ?? {}),
      ...(override.tabServer ?? {}),
    },
  };
}

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
    transport: mergeTransportOptions(base.transport ?? {}, override.transport ?? {}),
  };
}

function parseScriptTagOptions(
  script: HTMLScriptElement | null
): WebModelContextInitOptions | undefined {
  if (!script || !script.dataset) {
    return undefined;
  }

  const { dataset } = script;

  if (dataset.webmcpOptions) {
    try {
      return JSON.parse(dataset.webmcpOptions) as WebModelContextInitOptions;
    } catch (error) {
      log.error('Invalid JSON in data-webmcp-options: %O', error);
      return undefined;
    }
  }

  const options: WebModelContextInitOptions = {};
  let hasOptions = false;

  if (dataset.webmcpAutoInitialize !== undefined) {
    options.autoInitialize = dataset.webmcpAutoInitialize !== 'false';
    hasOptions = true;
  }

  const tabServerOptions: TabServerConfig = {};
  let hasTabServerOptions = false;

  if (dataset.webmcpAllowedOrigins) {
    const origins = dataset.webmcpAllowedOrigins
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);

    if (origins.length > 0) {
      tabServerOptions.allowedOrigins = origins;
      hasOptions = true;
      hasTabServerOptions = true;
    }
  }

  if (dataset.webmcpChannelId) {
    tabServerOptions.channelId = dataset.webmcpChannelId;
    hasOptions = true;
    hasTabServerOptions = true;
  }

  if (hasTabServerOptions) {
    options.transport = {
      ...(options.transport ?? {}),
      tabServer: {
        ...(options.transport?.tabServer ?? {}),
        ...tabServerOptions,
      },
    };
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

  const shouldAutoInitialize = mergedOptions?.autoInitialize !== false;

  try {
    if (shouldAutoInitialize) {
      initializeWebModelContext(mergedOptions);
    }
  } catch (error) {
    log.error('Auto-initialization failed: %O', error);
  }
}

export { cleanupWebModelContext, initializeWebModelContext } from './global.js';
export type * from './types.js';
