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
  let registeredUserScripts: unknown[];
  let userScriptExecutions: unknown[];

  beforeEach(() => {
    previousChrome = globalWithChrome.chrome;
    tabQueries = [];
    registeredUserScripts = [];
    userScriptExecutions = [];
    globalWithChrome.chrome = {
      runtime: {},
      storage: {
        local: createStorageArea({ existing: 'value' }),
        session: createStorageArea(),
        sync: createStorageArea(),
      },
      userScripts: {
        async getScripts(filter: { ids?: string[] } | undefined) {
          const scripts = [
            {
              id: 'marker',
              matches: ['http://127.0.0.1/*'],
              runAt: 'document_end',
              world: 'USER_SCRIPT',
              js: [{ code: 'document.title = "marked";' }],
            },
          ];
          if (filter?.ids) {
            return scripts.filter((script) => filter.ids?.includes(script.id));
          }
          return scripts;
        },
        async register(scripts: unknown[]) {
          registeredUserScripts.push(...scripts);
        },
        async unregister() {},
        async execute(injection: unknown) {
          userScriptExecutions.push(injection);
          return [{ frameId: 0, documentId: 'doc-1', result: 'ran' }];
        },
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
        url: '',
        pendingUrl: 'https://example.test/pending',
      },
    ]);

    expect(tabQueries).toEqual([{ active: true, url: 'https://example.test/pending' }]);
  });

  it('registers, lists, and executes user scripts through native signatures', async () => {
    const chromeApi = createChromeApiExecutor();

    await expect(
      chromeApi.invoke({
        path: 'userScripts.register',
        args: [
          [
            {
              id: 'marker',
              matches: ['http://127.0.0.1/*'],
              js: [{ code: 'document.title = "marked";' }],
              runAt: 'document_end',
            },
          ],
        ],
      })
    ).resolves.toMatchObject({ scriptIds: ['marker'] });
    expect(registeredUserScripts).toHaveLength(1);

    await expect(
      chromeApi.invoke({ path: 'userScripts.getScripts', args: [] })
    ).resolves.toMatchObject({
      count: 1,
      scripts: [{ id: 'marker', jsSourcesCount: 1 }],
    });

    await expect(
      chromeApi.invoke({
        path: 'userScripts.execute',
        args: [{ target: { tabId: 7 }, js: [{ code: '"ran"' }] }],
      })
    ).resolves.toMatchObject({
      injectionCount: 1,
      results: [{ frameId: 0, result: 'ran' }],
    });
    expect(userScriptExecutions).toEqual([{ target: { tabId: 7 }, js: [{ code: '"ran"' }] }]);
  });

  it('rejects user script sources that set both code and file', async () => {
    const chromeApi = createChromeApiExecutor();

    await expect(
      chromeApi.invoke({
        path: 'userScripts.register',
        args: [
          [
            {
              id: 'bad',
              matches: ['http://127.0.0.1/*'],
              js: [{ code: 'x', file: 'y.js' }],
            },
          ],
        ],
      })
    ).rejects.toThrow('Exactly one of code or file');
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
