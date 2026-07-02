import type {
  CallToolResult,
  McpServer,
  ModelContextClient,
  ToolDescriptor,
} from '@mcp-b/webmcp-ts-sdk';

import { BookmarksApiTools, type BookmarksApiToolsOptions } from './chrome-apis/BookmarksApiTools';
import { HistoryApiTools, type HistoryApiToolsOptions } from './chrome-apis/HistoryApiTools';
import { StorageApiTools, type StorageApiToolsOptions } from './chrome-apis/StorageApiTools';
import { TabGroupsApiTools, type TabGroupsApiToolsOptions } from './chrome-apis/TabGroupsApiTools';
import { TabsApiTools, type TabsApiToolsOptions } from './chrome-apis/TabsApiTools';
import { WindowsApiTools, type WindowsApiToolsOptions } from './chrome-apis/WindowsApiTools';
import { EXTENSION_TOOL_CONTRACTS_BY_NAME, type AnyExtensionToolContract } from './contracts';

type CapturedToolDescriptor = ToolDescriptor<Record<string, unknown>, unknown>;
type CapturedTool = Pick<CapturedToolDescriptor, 'description' | 'execute' | 'name'>;

export interface ExecutableExtensionTool {
  contract: AnyExtensionToolContract;
  description: string;
  name: string;
  execute(args: Record<string, unknown>, client?: ModelContextClient): Promise<CallToolResult>;
}

export interface CreateExecutableExtensionToolsOptions {
  bookmarks?: BookmarksApiToolsOptions;
  history?: HistoryApiToolsOptions;
  storage?: StorageApiToolsOptions;
  tabGroups?: TabGroupsApiToolsOptions;
  tabs?: TabsApiToolsOptions;
  windows?: WindowsApiToolsOptions;
}

export function createExecutableExtensionTools(
  options: CreateExecutableExtensionToolsOptions = {}
): ExecutableExtensionTool[] {
  const tools = new Map<string, CapturedTool>();
  const server = {
    registerTool(
      tool: string | CapturedToolDescriptor,
      config?: Partial<CapturedToolDescriptor>,
      handler?: CapturedToolDescriptor['execute']
    ) {
      if (typeof tool === 'string') {
        if (!handler) throw new Error(`Missing handler for ${tool}`);
        tools.set(tool, {
          name: tool,
          description: config?.description ?? '',
          execute: handler,
        });
        return { name: tool };
      }

      tools.set(tool.name, {
        name: tool.name,
        description: tool.description,
        execute: tool.execute,
      });
      return { name: tool.name };
    },
  } as unknown as McpServer;

  new BookmarksApiTools(server, options.bookmarks).registerTools();
  new HistoryApiTools(server, options.history).registerTools();
  new StorageApiTools(server, options.storage).registerTools();
  new TabGroupsApiTools(server, options.tabGroups).registerTools();
  new TabsApiTools(server, options.tabs).registerTools();
  new WindowsApiTools(server, options.windows).registerTools();

  const contractsByName = EXTENSION_TOOL_CONTRACTS_BY_NAME as Record<
    string,
    AnyExtensionToolContract | undefined
  >;

  return [...tools.values()].map((tool) => {
    const contract = contractsByName[tool.name];
    if (!contract) {
      throw new Error(`No extension-tools contract found for registered tool "${tool.name}"`);
    }
    return {
      contract,
      description: tool.description,
      name: tool.name,
      execute: async (args, client) =>
        (await tool.execute(args, client ?? ({} as ModelContextClient))) as CallToolResult,
    };
  });
}
