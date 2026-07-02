import type { CallToolResult, McpServer, ToolDescriptor } from '@mcp-b/webmcp-ts-sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BookmarksApiTools } from './chrome-apis/BookmarksApiTools.ts';
import { HistoryApiTools } from './chrome-apis/HistoryApiTools.ts';
import { StorageApiTools } from './chrome-apis/StorageApiTools.ts';
import { TabGroupsApiTools } from './chrome-apis/TabGroupsApiTools.ts';
import { TabsApiTools } from './chrome-apis/TabsApiTools.ts';
import { UserScriptsApiTools } from './chrome-apis/UserScriptsApiTools.ts';
import { WindowsApiTools } from './chrome-apis/WindowsApiTools.ts';
import { EXTENSION_TOOL_CONTRACTS } from './contracts';

type ExtensionToolDescriptor = ToolDescriptor<Record<string, unknown>, CallToolResult>;
type RegisteredTool = Pick<
  ExtensionToolDescriptor,
  'annotations' | 'description' | 'execute' | 'inputSchema' | 'name' | 'outputSchema'
>;
type RegisteredToolConfig = Partial<
  Pick<ExtensionToolDescriptor, 'annotations' | 'description' | 'inputSchema' | 'outputSchema'>
>;

type ChromeStorageKey = string | string[] | Record<string, unknown> | null | undefined;

class CapturingServer {
  readonly tools: RegisteredTool[] = [];

  registerTool(
    tool: string | ExtensionToolDescriptor,
    config?: RegisteredToolConfig,
    handler?: RegisteredTool['execute']
  ) {
    if (typeof tool === 'string') {
      if (!handler) {
        throw new Error(`Missing handler for ${tool}`);
      }
      this.tools.push({
        name: tool,
        description: config?.description ?? '',
        inputSchema: config?.inputSchema,
        outputSchema: config?.outputSchema,
        annotations: config?.annotations,
        execute: handler,
      });
      return { name: tool };
    }

    this.tools.push({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: tool.annotations,
      execute: tool.execute,
    });
    return { name: tool.name };
  }

  getTool(name: string): RegisteredTool {
    const tool = this.tools.find((candidate) => candidate.name === name);
    if (!tool) {
      throw new Error(`Tool not registered: ${name}`);
    }
    return tool;
  }
}

const DIRECT_TOOL_NAMES = [
  'extension_tool_add_history_url',
  'extension_tool_capture_visible_tab',
  'extension_tool_clear_storage',
  'extension_tool_close_tabs',
  'extension_tool_create_bookmark',
  'extension_tool_create_tab',
  'extension_tool_create_window',
  'extension_tool_delete_all_history',
  'extension_tool_delete_history_range',
  'extension_tool_delete_history_url',
  'extension_tool_execute_user_script',
  'extension_tool_get_user_scripts',
  'extension_tool_register_user_scripts',
  'extension_tool_unregister_user_scripts',
  'extension_tool_update_user_scripts',
  'extension_tool_detect_tab_language',
  'extension_tool_discard_tab',
  'extension_tool_duplicate_tab',
  'extension_tool_get_all_tabs',
  'extension_tool_get_all_windows',
  'extension_tool_get_bookmark_children',
  'extension_tool_get_bookmark_subtree',
  'extension_tool_get_bookmark_tree',
  'extension_tool_get_bookmarks',
  'extension_tool_get_current_window',
  'extension_tool_get_history_visits',
  'extension_tool_get_last_focused_window',
  'extension_tool_get_recent_bookmarks',
  'extension_tool_get_storage',
  'extension_tool_get_storage_bytes_in_use',
  'extension_tool_get_tab',
  'extension_tool_get_tab_group',
  'extension_tool_get_tab_zoom',
  'extension_tool_get_tab_zoom_settings',
  'extension_tool_get_window',
  'extension_tool_group_tabs',
  'extension_tool_highlight_tabs',
  'extension_tool_list_active_tabs',
  'extension_tool_move_bookmark',
  'extension_tool_move_tab_group',
  'extension_tool_move_tabs',
  'extension_tool_navigate_tab_history',
  'extension_tool_query_tab_groups',
  'extension_tool_reload_tab',
  'extension_tool_remove_bookmark',
  'extension_tool_remove_bookmark_tree',
  'extension_tool_remove_storage',
  'extension_tool_remove_window',
  'extension_tool_search_bookmarks',
  'extension_tool_search_history',
  'extension_tool_send_tab_message',
  'extension_tool_set_storage',
  'extension_tool_set_tab_zoom',
  'extension_tool_set_tab_zoom_settings',
  'extension_tool_ungroup_tabs',
  'extension_tool_update_bookmark',
  'extension_tool_update_tab',
  'extension_tool_update_tab_group',
  'extension_tool_update_window',
] as const;

const DIRECT_CONTRACT_TOOL_NAMES = EXTENSION_TOOL_CONTRACTS.map((contract) => contract.name);

const LEGACY_READ_THEN_EXECUTE_TOOLS = [
  'extension_tool_bookmark_operations',
  'extension_tool_bookmark_parameters_description',
  'extension_tool_history_operations',
  'extension_tool_history_parameters_description',
  'extension_tool_storage_operations',
  'extension_tool_storage_parameters_description',
  'extension_tool_tab_group_operations',
  'extension_tool_tab_group_parameters_description',
  'extension_tool_tab_operations',
  'extension_tool_tab_parameters_description',
  'extension_tool_window_operations',
  'extension_tool_window_parameters_description',
] as const;

function asMcpServer(server: CapturingServer): McpServer {
  return server as unknown as McpServer;
}

function registerDirectToolGroups(server: CapturingServer): void {
  new BookmarksApiTools(asMcpServer(server)).registerTools();
  new HistoryApiTools(asMcpServer(server)).registerTools();
  new StorageApiTools(asMcpServer(server)).registerTools();
  new TabGroupsApiTools(asMcpServer(server)).registerTools();
  new TabsApiTools(asMcpServer(server)).registerTools();
  new UserScriptsApiTools(asMcpServer(server), {
    configureWorld: false,
    getWorldConfigurations: false,
    resetWorldConfiguration: false,
  }).registerTools();
  new WindowsApiTools(asMcpServer(server)).registerTools();
}

function toolText(result: CallToolResult): string {
  const [firstContent] = result.content;
  if (firstContent?.type !== 'text') {
    throw new Error('Expected text tool result');
  }
  return firstContent.text;
}

function jsonToolResult<T>(result: CallToolResult): T {
  return JSON.parse(toolText(result)) as T;
}

async function executeTool(
  tool: RegisteredTool,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  return tool.execute(args, {
    requestUserInteraction: async (callback) => callback(),
  });
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
    snapshot() {
      return { ...data };
    },
  };
}

describe('direct extension action tools', () => {
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

  it('registers the exact action-specific tool surface for the first-party Chrome API groups', () => {
    const server = new CapturingServer();

    registerDirectToolGroups(server);

    expect([...DIRECT_CONTRACT_TOOL_NAMES].sort()).toEqual([...DIRECT_TOOL_NAMES].sort());
    expect(server.tools.map((tool) => tool.name).sort()).toEqual(
      [...DIRECT_CONTRACT_TOOL_NAMES].sort()
    );
    for (const legacyTool of LEGACY_READ_THEN_EXECUTE_TOOLS) {
      expect(server.tools.map((tool) => tool.name)).not.toContain(legacyTool);
    }
  });

  it('registers JSON Schema descriptors for direct action parameters', () => {
    const server = new CapturingServer();

    new TabsApiTools(asMcpServer(server)).registerTools();

    const schema = server.getTool('extension_tool_create_tab').inputSchema;
    expect(schema).toMatchObject({
      type: 'object',
      properties: {
        active: { type: 'boolean' },
        pinned: { type: 'boolean' },
        url: { type: 'string' },
      },
    });
    expect(schema?.required).toBeUndefined();

    expect(server.getTool('extension_tool_create_tab').annotations).toMatchObject({
      title: 'Create Tab',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
  });

  it('omits disabled actions from tool discovery', () => {
    const server = new CapturingServer();

    new TabsApiTools(asMcpServer(server), {
      createTab: false,
      getZoomSettings: false,
    }).registerTools();

    const names = server.tools.map((tool) => tool.name);
    expect(names).not.toContain('extension_tool_create_tab');
    expect(names).not.toContain('extension_tool_get_tab_zoom_settings');
    expect(names).toContain('extension_tool_get_all_tabs');
  });

  it('executes storage actions directly without an operation wrapper', async () => {
    const server = new CapturingServer();

    new StorageApiTools(asMcpServer(server)).registerTools();

    const setResult = await executeTool(server.getTool('extension_tool_set_storage'), {
      area: 'local',
      data: { theme: 'dark', volume: 7 },
    });
    expect(setResult.isError).not.toBe(true);
    expect(toolText(setResult)).toContain('Stored 2 key(s) in local storage');
    expect(setResult.structuredContent).toBeUndefined();

    const getResult = await executeTool(server.getTool('extension_tool_get_storage'), {
      area: 'local',
      keys: ['theme', 'volume'],
    });
    expect(getResult.structuredContent).toEqual({ theme: 'dark', volume: 7 });
    expect(jsonToolResult(getResult)).toEqual({ theme: 'dark', volume: 7 });

    const bytesResult = await executeTool(
      server.getTool('extension_tool_get_storage_bytes_in_use'),
      {
        area: 'local',
        keys: ['theme'],
      }
    );
    expect(jsonToolResult(bytesResult)).toEqual(expect.any(Number));
    expect(bytesResult.structuredContent).toEqual(expect.any(Number));

    const removeResult = await executeTool(server.getTool('extension_tool_remove_storage'), {
      area: 'local',
      keys: ['theme'],
    });
    expect(removeResult.isError).not.toBe(true);
    expect(removeResult.structuredContent).toBeUndefined();

    const afterRemove = await executeTool(server.getTool('extension_tool_get_storage'), {
      area: 'local',
    });
    expect(jsonToolResult(afterRemove)).toEqual({ existing: 'value', volume: 7 });

    const clearWithoutConfirm = await executeTool(server.getTool('extension_tool_clear_storage'), {
      area: 'local',
      confirm: false,
    });
    expect(clearWithoutConfirm.isError).toBe(true);
    expect(toolText(clearWithoutConfirm)).toContain('requires confirm=true');

    const clearResult = await executeTool(server.getTool('extension_tool_clear_storage'), {
      area: 'local',
      confirm: true,
    });
    expect(clearResult.isError).not.toBe(true);

    const afterClear = await executeTool(server.getTool('extension_tool_get_storage'), {
      area: 'local',
    });
    expect(jsonToolResult(afterClear)).toEqual({});
  });

  it('returns handler validation failures as tool errors', async () => {
    const server = new CapturingServer();

    new StorageApiTools(asMcpServer(server)).registerTools();

    const result = await executeTool(server.getTool('extension_tool_set_storage'), {
      area: 'local',
    });

    expect(result.isError).toBe(true);
    expect(toolText(result)).toContain('Error:');
  });
});
