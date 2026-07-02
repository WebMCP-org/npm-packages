import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createChromeApiExecutor } from './chrome-methods';

type ChromeStorageKey = string | string[] | Record<string, unknown> | null | undefined;

function createStorageArea(initialData: Record<string, unknown> = {}) {
  const data = { ...initialData };

  return {
    QUOTA_BYTES: 1024,
    async get(keys: ChromeStorageKey) {
      if (keys == null) {
        return { ...data };
      }
      if (typeof keys === 'string') {
        return keys in data ? { [keys]: data[keys] } : {};
      }
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, data[key]]));
      }

      return Object.fromEntries(
        Object.entries(keys).map(([key, defaultValue]) => [
          key,
          key in data ? data[key] : defaultValue,
        ])
      );
    },
    async set(values: Record<string, unknown>) {
      Object.assign(data, values);
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete data[key];
      }
    },
    async clear() {
      for (const key of Object.keys(data)) {
        delete data[key];
      }
    },
    async getBytesInUse(keys: ChromeStorageKey) {
      return JSON.stringify(await this.get(keys)).length;
    },
  };
}

describe('chrome method facade', () => {
  const globalWithChrome = globalThis as unknown as { chrome?: unknown };
  let previousChrome: unknown;
  let tabQueries: unknown[];

  beforeEach(() => {
    previousChrome = globalWithChrome.chrome;
    tabQueries = [];
    globalWithChrome.chrome = {
      runtime: {},
      storage: {
        local: createStorageArea({ existing: 'value' }),
        session: createStorageArea(),
        sync: createStorageArea(),
      },
      tabs: {
        async query(queryInfo: unknown) {
          tabQueries.push(queryInfo);
          return [
            {
              id: 7,
              index: 0,
              windowId: 1,
              active: true,
              pinned: false,
              title: 'Pending tab',
              url: '',
              pendingUrl: 'https://example.test/pending',
            },
          ];
        },
      },
    };
  });

  afterEach(() => {
    globalWithChrome.chrome = previousChrome;
  });

  it('returns native Chrome method outputs instead of action wrappers', async () => {
    const chromeApi = createChromeApiExecutor();

    await expect(
      chromeApi.invoke({
        path: 'storage.local.set',
        args: [{ theme: 'dark', volume: 7 }],
      })
    ).resolves.toBeUndefined();

    await expect(
      chromeApi.invoke({
        path: 'storage.local.get',
        args: [['existing', 'theme', 'volume']],
      })
    ).resolves.toEqual({ existing: 'value', theme: 'dark', volume: 7 });

    await expect(
      chromeApi.invoke({
        path: 'storage.local.get',
        args: [{ missing: 'default value' }],
      })
    ).resolves.toEqual({ missing: 'default value' });
  });

  it('passes native tabs.query input to the action and returns a tab array', async () => {
    const chromeApi = createChromeApiExecutor();

    await expect(
      chromeApi.invoke({
        path: 'tabs.query',
        args: [{ active: true, url: 'https://example.test/pending' }],
      })
    ).resolves.toEqual([
      {
        id: 7,
        index: 0,
        windowId: 1,
        active: true,
        pinned: false,
        title: 'Pending tab',
        url: 'https://example.test/pending',
        pendingUrl: 'https://example.test/pending',
      },
    ]);

    expect(tabQueries).toEqual([{ active: true, url: 'https://example.test/pending' }]);
  });

  it('reports unavailable Chrome paths with the native method name', async () => {
    const chromeApi = createChromeApiExecutor();

    await expect(
      chromeApi.invoke({
        path: 'tabs.notARealMethod',
        args: [],
      })
    ).rejects.toThrow('chrome.tabs.notARealMethod is not available in this run.');
  });

  it('reports facade argument errors with the native method name', async () => {
    const chromeApi = createChromeApiExecutor();

    await expect(
      chromeApi.invoke({
        path: 'tabs.query',
        args: ['not query info'],
      })
    ).rejects.toThrow('chrome.tabs.query: invalid arguments');
  });
});
