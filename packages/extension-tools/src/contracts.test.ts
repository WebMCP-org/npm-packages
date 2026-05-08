import { ListToolsResultSchema } from '@mcp-b/webmcp-ts-sdk';
import { describe, expect, it } from 'vitest';

import {
  EXTENSION_TOOLS_META_KEY,
  EXTENSION_TOOL_CONTRACTS,
  EXTENSION_TOOL_CONTRACTS_BY_NAME,
  EXTENSION_TOOL_GROUP_CONTRACTS,
  EXTENSION_TOOL_GROUP_CONTRACTS_BY_ID,
  getExtensionToolInputSchema,
  getExtensionToolOutputSchema,
} from './contracts';
import { BOOKMARK_TOOL_CONTRACTS } from './contracts/bookmarks';
import { HISTORY_TOOL_CONTRACTS } from './contracts/history';
import { STORAGE_TOOL_CONTRACTS } from './contracts/storage';
import { TAB_GROUP_TOOL_CONTRACTS } from './contracts/tab-groups';
import { TAB_TOOL_CONTRACTS } from './contracts/tabs';
import { WINDOW_TOOL_CONTRACTS } from './contracts/windows';

function toMcpTool(contract: (typeof EXTENSION_TOOL_CONTRACTS)[number]) {
  return {
    name: contract.name,
    title: contract.title,
    description: contract.description,
    inputSchema: getExtensionToolInputSchema(contract),
    ...(getExtensionToolOutputSchema(contract)
      ? { outputSchema: getExtensionToolOutputSchema(contract) }
      : {}),
    annotations: contract.annotations,
    _meta: contract._meta,
  };
}

describe('extension tool contracts', () => {
  it('exports MCP-valid tool descriptors for the direct action catalog', () => {
    expect(() =>
      ListToolsResultSchema.parse({
        tools: EXTENSION_TOOL_CONTRACTS.map(toMcpTool),
      })
    ).not.toThrow();
  });

  it('keeps contract-only imports independent of extension globals', () => {
    expect(EXTENSION_TOOL_CONTRACTS.length).toBeGreaterThan(0);
    expect(EXTENSION_TOOL_GROUP_CONTRACTS.length).toBeGreaterThan(0);
  });

  it('exports unique stable names and catalog maps', () => {
    const names = EXTENSION_TOOL_CONTRACTS.map((contract) => contract.name);

    expect(new Set(names).size).toBe(names.length);
    for (const contract of EXTENSION_TOOL_CONTRACTS) {
      expect(EXTENSION_TOOL_CONTRACTS_BY_NAME[contract.name]).toBe(contract);
    }
    for (const group of EXTENSION_TOOL_GROUP_CONTRACTS) {
      expect(EXTENSION_TOOL_GROUP_CONTRACTS_BY_ID[group.id]).toBe(group);
    }
  });

  it('uses object-root JSON Schemas and declares complete MCP annotations', () => {
    for (const contract of EXTENSION_TOOL_CONTRACTS) {
      const inputSchema = getExtensionToolInputSchema(contract);
      const outputSchema = getExtensionToolOutputSchema(contract);

      expect(inputSchema.type).toBe('object');
      expect(inputSchema).toHaveProperty('properties');

      if (outputSchema) {
        expect(outputSchema.type).toBe('object');
      }

      expect(contract.annotations).toMatchObject({
        title: contract.title,
        readOnlyHint: expect.any(Boolean),
        destructiveHint: expect.any(Boolean),
        idempotentHint: expect.any(Boolean),
        openWorldHint: expect.any(Boolean),
      });
    }
  });

  it('uses sampled concrete output schemas for real-browser storage conformance tools', () => {
    expect(getExtensionToolOutputSchema(STORAGE_TOOL_CONTRACTS.getStorage)).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['area', 'data', 'keyCount'],
      properties: {
        area: { enum: ['sync', 'local', 'session'] },
        data: { type: 'object' },
        keyCount: { type: 'number' },
      },
    });
    expect(getExtensionToolOutputSchema(STORAGE_TOOL_CONTRACTS.setStorage)).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['keys'],
      properties: {
        keys: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    });
    expect(getExtensionToolOutputSchema(STORAGE_TOOL_CONTRACTS.removeStorage)).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['keys'],
      properties: {
        keys: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    });
    expect(getExtensionToolOutputSchema(STORAGE_TOOL_CONTRACTS.getBytesInUse)).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['area', 'bytesInUse', 'humanReadable', 'quota', 'percentageUsed'],
      properties: {
        area: { enum: ['sync', 'local', 'session'] },
        bytesInUse: { type: 'number' },
        humanReadable: { type: 'string' },
        quota: {
          anyOf: expect.arrayContaining([
            expect.objectContaining({
              type: 'object',
              additionalProperties: false,
              required: ['quotaBytes'],
            }),
            expect.objectContaining({
              type: 'null',
            }),
          ]),
        },
        percentageUsed: {
          type: ['string', 'null'],
        },
      },
    });
  });

  it('uses sampled concrete output schemas for real-browser bookmark conformance tools', () => {
    expect(getExtensionToolOutputSchema(BOOKMARK_TOOL_CONTRACTS.create)).toMatchObject({
      type: 'object',
      required: ['id', 'title', 'parentId', 'index', 'dateAdded', 'type'],
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        parentId: { type: 'string' },
        index: { type: 'number' },
        dateAdded: { type: 'number' },
        type: { enum: ['bookmark', 'folder'] },
      },
    });
    expect(getExtensionToolOutputSchema(BOOKMARK_TOOL_CONTRACTS.get)).toMatchObject({
      type: 'object',
      required: ['count', 'bookmarks'],
      properties: {
        count: { type: 'number' },
        bookmarks: {
          type: 'array',
          items: {
            required: ['id', 'title', 'type'],
          },
        },
      },
    });
    expect(getExtensionToolOutputSchema(BOOKMARK_TOOL_CONTRACTS.search)).toMatchObject({
      type: 'object',
      required: ['query', 'count', 'results'],
      properties: {
        query: { type: 'string' },
        count: { type: 'number' },
        results: {
          type: 'array',
          items: {
            required: ['id', 'title', 'type'],
          },
        },
      },
    });
    expect(getExtensionToolOutputSchema(BOOKMARK_TOOL_CONTRACTS.remove)).toMatchObject({
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
      },
    });
  });

  it('uses sampled concrete output schemas for real-browser tabs conformance tools', () => {
    expect(getExtensionToolOutputSchema(TAB_TOOL_CONTRACTS.createTab)).toMatchObject({
      type: 'object',
      required: ['id', 'index', 'windowId', 'active', 'pinned'],
      properties: {
        id: { type: 'number' },
        url: { type: 'string' },
        active: { type: 'boolean' },
        pinned: { type: 'boolean' },
        windowId: { type: 'number' },
      },
    });
    expect(getExtensionToolOutputSchema(TAB_TOOL_CONTRACTS.getAllTabs)).toMatchObject({
      type: 'object',
      required: ['count', 'tabs'],
      properties: {
        count: { type: 'number' },
        tabs: {
          type: 'array',
          items: {
            required: ['id', 'index', 'windowId', 'active', 'pinned'],
          },
        },
      },
    });
    expect(getExtensionToolOutputSchema(TAB_TOOL_CONTRACTS.closeTabs)).toMatchObject({
      type: 'object',
      required: ['tabIds'],
      properties: {
        tabIds: {
          type: 'array',
          items: { type: 'number' },
        },
      },
    });
    expect(getExtensionToolOutputSchema(TAB_TOOL_CONTRACTS.getTab)).toMatchObject({
      type: 'object',
      required: ['tab'],
      properties: {
        tab: {
          required: ['id', 'index', 'windowId', 'active', 'pinned'],
        },
      },
    });
    expect(getExtensionToolOutputSchema(TAB_TOOL_CONTRACTS.getZoomSettings)).toMatchObject({
      type: 'object',
      required: ['mode', 'scope', 'defaultZoomFactor'],
    });
    expect(getExtensionToolOutputSchema(TAB_TOOL_CONTRACTS.detectLanguage)).toMatchObject({
      type: 'object',
      required: ['language'],
      properties: {
        language: { type: 'string' },
      },
    });
  });

  it('uses sampled concrete output schemas for real-browser tab-groups conformance tools', () => {
    expect(getExtensionToolOutputSchema(TAB_GROUP_TOOL_CONTRACTS.get)).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['id', 'color', 'collapsed', 'windowId'],
      properties: {
        id: { type: 'number' },
        title: { type: 'string' },
        color: {
          enum: ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'],
        },
        collapsed: { type: 'boolean' },
        shared: { type: 'boolean' },
        windowId: { type: 'number' },
      },
    });
    expect(getExtensionToolOutputSchema(TAB_GROUP_TOOL_CONTRACTS.query)).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['count', 'groups'],
      properties: {
        count: { type: 'number' },
        groups: {
          type: 'array',
          items: {
            required: ['id', 'color', 'collapsed', 'windowId'],
          },
        },
      },
    });
    expect(getExtensionToolOutputSchema(TAB_GROUP_TOOL_CONTRACTS.update)).toMatchObject(
      getExtensionToolOutputSchema(TAB_GROUP_TOOL_CONTRACTS.get)
    );
    expect(getExtensionToolOutputSchema(TAB_GROUP_TOOL_CONTRACTS.move)).toMatchObject(
      getExtensionToolOutputSchema(TAB_GROUP_TOOL_CONTRACTS.get)
    );
  });

  it('keeps tab-groups input schemas aligned with Chrome tabGroups parameter constraints', () => {
    expect(() => TAB_GROUP_TOOL_CONTRACTS.get.zodInputSchema.parse({ groupId: -1 })).toThrow();
    expect(() => TAB_GROUP_TOOL_CONTRACTS.get.zodInputSchema.parse({ groupId: 1.5 })).toThrow();
    expect(() =>
      TAB_GROUP_TOOL_CONTRACTS.move.zodInputSchema.parse({ groupId: 1, index: -2 })
    ).toThrow();
    expect(() => TAB_GROUP_TOOL_CONTRACTS.query.zodInputSchema.parse({ windowId: -3 })).toThrow();
    expect(TAB_GROUP_TOOL_CONTRACTS.query.zodInputSchema.parse({ windowId: -2 })).toEqual({
      windowId: -2,
    });
    expect(TAB_GROUP_TOOL_CONTRACTS.move.zodInputSchema.parse({ groupId: 1, index: -1 })).toEqual({
      groupId: 1,
      index: -1,
    });
  });

  it('uses sampled concrete output schemas for real-browser windows conformance tools', () => {
    expect(getExtensionToolOutputSchema(WINDOW_TOOL_CONTRACTS.create)).toMatchObject({
      type: 'object',
      required: ['id', 'focused', 'incognito', 'alwaysOnTop', 'state', 'type'],
      properties: {
        id: { type: 'number' },
        focused: { type: 'boolean' },
        incognito: { type: 'boolean' },
        alwaysOnTop: { type: 'boolean' },
        state: {
          enum: ['normal', 'minimized', 'maximized', 'fullscreen', 'locked-fullscreen'],
        },
        type: { enum: ['normal', 'popup', 'panel', 'app', 'devtools'] },
        tabs: {
          type: 'array',
          items: {
            type: 'object',
          },
        },
      },
    });
    expect(getExtensionToolOutputSchema(WINDOW_TOOL_CONTRACTS.getAll)).toMatchObject({
      type: 'object',
      required: ['count', 'windows'],
      properties: {
        count: { type: 'number' },
        windows: {
          type: 'array',
          items: {
            required: ['id', 'focused', 'incognito', 'alwaysOnTop', 'state', 'type'],
          },
        },
      },
    });
    expect(getExtensionToolOutputSchema(WINDOW_TOOL_CONTRACTS.remove)).toMatchObject({
      type: 'object',
      required: ['windowId'],
      properties: {
        windowId: { type: 'number' },
      },
    });
  });

  it('uses sampled concrete output schemas for real-browser history conformance tools', () => {
    expect(getExtensionToolOutputSchema(HISTORY_TOOL_CONTRACTS.addUrl)).toMatchObject({
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string' },
      },
    });
    expect(getExtensionToolOutputSchema(HISTORY_TOOL_CONTRACTS.deleteRange)).toMatchObject({
      type: 'object',
      required: ['startTime', 'endTime', 'startTimeFormatted', 'endTimeFormatted'],
      properties: {
        startTime: { type: 'number' },
        endTime: { type: 'number' },
        startTimeFormatted: { type: 'string' },
        endTimeFormatted: { type: 'string' },
      },
    });
    expect(getExtensionToolOutputSchema(HISTORY_TOOL_CONTRACTS.getVisits)).toMatchObject({
      type: 'object',
      required: ['url', 'visitCount', 'visits'],
      properties: {
        url: { type: 'string' },
        visitCount: { type: 'number' },
        visits: {
          type: 'array',
          items: {
            required: ['id', 'visitId', 'transition'],
          },
        },
      },
    });
    expect(getExtensionToolOutputSchema(HISTORY_TOOL_CONTRACTS.search)).toMatchObject({
      type: 'object',
      required: ['query', 'resultCount', 'results'],
      properties: {
        query: {
          type: 'object',
          required: ['text'],
        },
        resultCount: { type: 'number' },
        results: {
          type: 'array',
          items: {
            required: ['id'],
          },
        },
      },
    });
    expect(getExtensionToolOutputSchema(HISTORY_TOOL_CONTRACTS.deleteUrl)).toMatchObject({
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string' },
      },
    });
  });

  it('keeps bookmark input schemas aligned with Chrome bookmark parameter constraints', () => {
    expect(() =>
      BOOKMARK_TOOL_CONTRACTS.create.zodInputSchema.parse({ title: 'x', index: -1 })
    ).toThrow();
    expect(() =>
      BOOKMARK_TOOL_CONTRACTS.create.zodInputSchema.parse({ title: 'x', index: 1.25 })
    ).toThrow();
    expect(() => BOOKMARK_TOOL_CONTRACTS.get.zodInputSchema.parse({ idOrIdList: [] })).toThrow();
    expect(() =>
      BOOKMARK_TOOL_CONTRACTS.getRecent.zodInputSchema.parse({ numberOfItems: 1.5 })
    ).toThrow();
    expect(BOOKMARK_TOOL_CONTRACTS.move.zodInputSchema.parse({ id: '1', index: 0 })).toEqual({
      id: '1',
      index: 0,
    });
  });

  it('keeps tabs input schemas aligned with Chrome tab parameter constraints', () => {
    expect(() => TAB_TOOL_CONTRACTS.createTab.zodInputSchema.parse({})).not.toThrow();
    expect(() => TAB_TOOL_CONTRACTS.closeTabs.zodInputSchema.parse({ tabIds: [] })).toThrow();
    expect(() => TAB_TOOL_CONTRACTS.closeTabs.zodInputSchema.parse({ tabIds: [1.25] })).toThrow();
    expect(() =>
      TAB_TOOL_CONTRACTS.moveTabs.zodInputSchema.parse({ tabIds: [1], index: -2 })
    ).toThrow();
    expect(TAB_TOOL_CONTRACTS.moveTabs.zodInputSchema.parse({ tabIds: [1], index: -1 })).toEqual({
      tabIds: [1],
      index: -1,
    });
    expect(() => TAB_TOOL_CONTRACTS.highlightTabs.zodInputSchema.parse({ tabs: [-1] })).toThrow();
    expect(() => TAB_TOOL_CONTRACTS.setZoom.zodInputSchema.parse({ zoomFactor: 0.1 })).toThrow();
    expect(TAB_TOOL_CONTRACTS.setZoom.zodInputSchema.parse({ zoomFactor: 0 })).toEqual({
      zoomFactor: 0,
    });
  });

  it('keeps windows input schemas aligned with Chrome window parameter constraints', () => {
    expect(() => WINDOW_TOOL_CONTRACTS.create.zodInputSchema.parse({})).not.toThrow();
    expect(() => WINDOW_TOOL_CONTRACTS.create.zodInputSchema.parse({ width: 1.25 })).toThrow();
    expect(() => WINDOW_TOOL_CONTRACTS.create.zodInputSchema.parse({ width: 0 })).toThrow();
    expect(() => WINDOW_TOOL_CONTRACTS.create.zodInputSchema.parse({ tabId: -1 })).toThrow();
    expect(() =>
      WINDOW_TOOL_CONTRACTS.update.zodInputSchema.parse({ windowId: 1, height: 1.5 })
    ).toThrow();
    expect(WINDOW_TOOL_CONTRACTS.update.zodInputSchema.parse({ windowId: -2 })).toEqual({
      windowId: -2,
    });
  });

  it('keeps history input schemas aligned with Chrome history parameter constraints', () => {
    expect(() =>
      HISTORY_TOOL_CONTRACTS.search.zodInputSchema.parse({ text: '', maxResults: 1.5 })
    ).toThrow();
    expect(() =>
      HISTORY_TOOL_CONTRACTS.search.zodInputSchema.parse({ text: '', maxResults: 0 })
    ).toThrow();
    expect(() =>
      HISTORY_TOOL_CONTRACTS.deleteRange.zodInputSchema.parse({ startTime: -1, endTime: 1 })
    ).toThrow();
    expect(HISTORY_TOOL_CONTRACTS.search.zodInputSchema.parse({ text: '', maxResults: 1 })).toEqual(
      {
        text: '',
        maxResults: 1,
      }
    );
  });

  it('carries namespaced MCP-B and Chrome extension metadata for each action', () => {
    for (const contract of EXTENSION_TOOL_CONTRACTS) {
      expect(contract.name).toMatch(/^extension_tool_/);
      expect(contract.title.length).toBeGreaterThan(0);
      expect(contract.description.length).toBeGreaterThan(0);
      expect(contract.groupId.length).toBeGreaterThan(0);
      expect(contract.actionId.length).toBeGreaterThan(0);

      if ('extension' in contract._meta) {
        expect(contract._meta.extension).toMatchObject({
          groupId: contract.groupId,
          actionId: contract.actionId,
          chromeApi: expect.any(String),
          permissions: expect.any(Array),
        });
      } else {
        const meta = contract._meta[EXTENSION_TOOLS_META_KEY];
        expect(meta).toMatchObject({
          packageName: '@mcp-b/extension-tools',
          versionFamily: expect.any(String),
          kind: expect.any(String),
          groupId: contract.groupId,
          actionId: contract.actionId,
          chromeApi: expect.any(String),
          requiredPermissions: expect.any(Array),
          optionalPermissions: expect.any(Array),
          manifestVersion: 3,
          runtimeContext: expect.any(Array),
          hostPermissionsRequired: expect.any(Boolean),
          activeTabRequired: expect.any(Boolean),
          tabIdRequired: expect.any(Boolean),
          frameIdSupported: expect.any(Boolean),
          originRequired: expect.any(Boolean),
          urlRequired: expect.any(Boolean),
          userGestureRequired: expect.any(Boolean),
          effect: expect.stringMatching(/^(delete|execute|mutate|navigate|read)$/),
          riskLevel: expect.stringMatching(/^(low|medium|high)$/),
        });
      }
    }
  });
});
