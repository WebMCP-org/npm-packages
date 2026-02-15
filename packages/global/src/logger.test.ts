import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from './logger.js';

const DEBUG_CONFIG_KEY = 'WEBMCP_DEBUG';

const clearDebugConfig = () => {
  try {
    window.localStorage.removeItem(DEBUG_CONFIG_KEY);
  } catch {}
};

const createDebugSpy = () => vi.spyOn(console, 'debug').mockImplementation(() => {});
const createInfoSpy = () => vi.spyOn(console, 'info').mockImplementation(() => {});

describe('Logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearDebugConfig();
  });

  it('disables debug when localStorage is unavailable', () => {
    const debugSpy = createDebugSpy();
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(undefined as unknown as Storage);

    const logger = createLogger('TestLogger');
    logger.debug('hidden');

    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('returns false when debug config is empty', () => {
    const debugSpy = createDebugSpy();
    window.localStorage.removeItem(DEBUG_CONFIG_KEY);

    const logger = createLogger('EmptyConfig');
    logger.debug('hidden');

    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('enables debug for wildcard config', () => {
    const debugSpy = createDebugSpy();
    const infoSpy = createInfoSpy();
    window.localStorage.setItem(DEBUG_CONFIG_KEY, '*');

    const logger = createLogger('Any');
    logger.debug('visible');
    logger.info('visible');

    expect(debugSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
  });

  it('matches namespace patterns with prefixes', () => {
    const debugSpy = createDebugSpy();
    const infoSpy = createInfoSpy();
    window.localStorage.setItem(DEBUG_CONFIG_KEY, 'WebModelContext,OtherNamespace');

    const matched = createLogger('WebModelContext:child');
    matched.info('visible');

    const missed = createLogger('Unmatched');
    missed.debug('hidden');

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('warns when localStorage access fails', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const logger = createLogger('Failure');
    logger.debug('hidden');

    expect(warnSpy).toHaveBeenCalled();
  });

  it('forces debug output when forceDebug option is enabled', () => {
    const debugSpy = createDebugSpy();
    const infoSpy = createInfoSpy();
    window.localStorage.removeItem(DEBUG_CONFIG_KEY);

    const logger = createLogger('Forced', { forceDebug: true });
    logger.debug('visible');
    logger.info('visible');

    expect(debugSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
  });
});
