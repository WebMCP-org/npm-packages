import type { CallToolResult } from '@mcp-b/webmcp-ts-sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EXTENSION_TOOL_CONTRACTS, STORAGE_TOOL_CONTRACTS } from './contracts';
import { createExecutableExtensionTools } from './executable-tools';

type ChromeStorageKey = string | string[] | Record<string, unknown> | null | undefined;

function toolText(result: CallToolResult): string {
  const [firstContent] = result.content;
  if (firstContent?.type !== 'text') {
    throw new Error('Expected text tool result');
  }
  return firstContent.text;
}

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

describe('executable extension tools', () => {
  const globalWithChrome = globalThis as unknown as { chrome?: unknown };
  let previousChrome: unknown;

  beforeEach(() => {
    previousChrome = globalWithChrome.chrome;
    globalWithChrome.chrome = {
      runtime: {},
      storage: {
        local: createStorageArea({ existing: 'value' }),
        session: createStorageArea(),
        sync: createStorageArea(),
      },
    };
  });

  afterEach(() => {
    globalWithChrome.chrome = previousChrome;
  });

  it('derives executable tools from the canonical contracts and existing handlers', async () => {
    const tools = createExecutableExtensionTools();
    const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

    expect([...toolsByName.keys()].sort()).toEqual(
      EXTENSION_TOOL_CONTRACTS.map((contract) => contract.name).sort()
    );

    const setStorage = toolsByName.get(STORAGE_TOOL_CONTRACTS.setStorage.name);
    expect(setStorage?.contract).toBe(STORAGE_TOOL_CONTRACTS.setStorage);

    const setResult = await setStorage?.execute({
      area: 'local',
      data: { theme: 'dark', volume: 7 },
    });
    expect(setResult?.isError).not.toBe(true);
    expect(setResult?.structuredContent).toEqual({ keys: ['theme', 'volume'] });

    const getResult = await toolsByName.get(STORAGE_TOOL_CONTRACTS.getStorage.name)?.execute({
      area: 'local',
      keys: ['existing', 'theme', 'volume'],
    });
    expect(getResult?.structuredContent).toEqual({
      area: 'local',
      data: { existing: 'value', theme: 'dark', volume: 7 },
      keyCount: 3,
    });
  });

  it('returns contract validation errors through the existing tool error path', async () => {
    const toolsByName = new Map(createExecutableExtensionTools().map((tool) => [tool.name, tool]));

    const result = await toolsByName.get(STORAGE_TOOL_CONTRACTS.setStorage.name)?.execute({
      area: 'local',
    });

    expect(result?.isError).toBe(true);
    expect(toolText(result as CallToolResult)).toContain('Error:');
  });
});
