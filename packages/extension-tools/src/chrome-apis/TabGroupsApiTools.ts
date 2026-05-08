import type { McpServer } from '@mcp-b/webmcp-ts-sdk';

import { type ApiAvailability, BaseApiTools } from '../BaseApiTools';
import { TAB_GROUP_ACTION_IDS, TAB_GROUP_TOOL_CONTRACTS } from '../contracts/tab-groups';

export interface TabGroupsApiToolsOptions {
  get?: boolean;
  query?: boolean;
  update?: boolean;
  move?: boolean;
}

export const TAB_GROUP_ACTIONS = TAB_GROUP_ACTION_IDS;

function serializeTabGroup(group: chrome.tabGroups.TabGroup) {
  return {
    id: group.id,
    ...(group.title !== undefined ? { title: group.title } : {}),
    color: group.color,
    collapsed: group.collapsed,
    ...((group as { shared?: boolean }).shared !== undefined
      ? { shared: (group as { shared?: boolean }).shared }
      : {}),
    windowId: group.windowId,
  };
}

export class TabGroupsApiTools extends BaseApiTools<TabGroupsApiToolsOptions> {
  protected apiName = 'TabGroups';

  constructor(server: McpServer, options: TabGroupsApiToolsOptions = {}) {
    super(server, options);
  }

  checkAvailability(): ApiAvailability {
    try {
      // Check if API exists
      if (!chrome.tabGroups) {
        return {
          available: false,
          message: 'chrome.tabGroups API is not defined',
          details:
            'This extension needs the "tabGroups" permission in its manifest.json and requires Chrome 89+ with Manifest V3',
        };
      }

      // Test a basic method
      if (typeof chrome.tabGroups.query !== 'function') {
        return {
          available: false,
          message: 'chrome.tabGroups.query is not available',
          details:
            'The tabGroups API appears to be partially available. Check manifest permissions.',
        };
      }

      // Try to actually use the API
      chrome.tabGroups.query({}, () => {
        if (chrome.runtime.lastError) {
          throw new Error(chrome.runtime.lastError.message);
        }
      });

      return {
        available: true,
        message: 'TabGroups API is fully available',
      };
    } catch (error) {
      return {
        available: false,
        message: 'Failed to access chrome.tabGroups API',
        details: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  registerTools(): void {
    if (this.shouldRegisterTool('get')) {
      this.registerExtensionTool(TAB_GROUP_TOOL_CONTRACTS.get, (params) =>
        this.handleGetTabGroup(params)
      );
    }

    if (this.shouldRegisterTool('query')) {
      this.registerExtensionTool(TAB_GROUP_TOOL_CONTRACTS.query, (params) =>
        this.handleQueryTabGroups(params)
      );
    }

    if (this.shouldRegisterTool('update')) {
      this.registerExtensionTool(TAB_GROUP_TOOL_CONTRACTS.update, (params) =>
        this.handleUpdateTabGroup(params)
      );
    }

    if (this.shouldRegisterTool('move')) {
      this.registerExtensionTool(TAB_GROUP_TOOL_CONTRACTS.move, (params) =>
        this.handleMoveTabGroup(params)
      );
    }
  }

  // ===== Action handlers =====
  private async handleGetTabGroup(raw: unknown) {
    const { groupId } = this.getSchema.parse(raw);
    const group = await new Promise<chrome.tabGroups.TabGroup>((resolve, reject) => {
      chrome.tabGroups.get(groupId, (group) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(group);
        }
      });
    });

    return this.formatJson(serializeTabGroup(group));
  }

  private async handleQueryTabGroups(raw: unknown) {
    const { collapsed, color, shared, title, windowId } = this.querySchema.parse(raw);
    // Build query info
    const queryInfo: any = {};

    if (collapsed !== undefined) queryInfo.collapsed = collapsed;
    if (color !== undefined) queryInfo.color = color;
    if (shared !== undefined) queryInfo.shared = shared;
    if (title !== undefined) queryInfo.title = title;
    if (windowId !== undefined) {
      // -2 represents WINDOW_ID_CURRENT in Chrome extensions
      queryInfo.windowId = windowId === -2 ? chrome.windows.WINDOW_ID_CURRENT : windowId;
    }

    const groups = await new Promise<chrome.tabGroups.TabGroup[]>((resolve, reject) => {
      chrome.tabGroups.query(queryInfo, (groups) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(groups);
        }
      });
    });

    return this.formatJson({
      count: groups.length,
      groups: groups.map(serializeTabGroup),
    });
  }

  private async handleUpdateTabGroup(raw: unknown) {
    const { groupId, collapsed, color, title } = this.updateSchema.parse(raw);
    // Build update properties
    const updateProperties: any = {};

    if (collapsed !== undefined) updateProperties.collapsed = collapsed;
    if (color !== undefined) updateProperties.color = color;
    if (title !== undefined) updateProperties.title = title;

    const updatedGroup = await new Promise<chrome.tabGroups.TabGroup | undefined>(
      (resolve, reject) => {
        chrome.tabGroups.update(groupId, updateProperties, (group) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(group);
          }
        });
      }
    );

    if (!updatedGroup) {
      return this.formatError('Failed to update tab group');
    }

    return this.formatSuccess('Tab group updated successfully', serializeTabGroup(updatedGroup));
  }

  private async handleMoveTabGroup(raw: unknown) {
    const { groupId, index, windowId } = this.moveSchema.parse(raw);
    // Build move properties
    const moveProperties: any = {
      index: index,
    };

    if (windowId !== undefined) {
      moveProperties.windowId = windowId;
    }

    const movedGroup = await new Promise<chrome.tabGroups.TabGroup | undefined>(
      (resolve, reject) => {
        chrome.tabGroups.move(groupId, moveProperties, (group) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(group);
          }
        });
      }
    );

    if (!movedGroup) {
      return this.formatError('Failed to move tab group');
    }

    return this.formatSuccess('Tab group moved successfully', serializeTabGroup(movedGroup));
  }

  // ===== Validation Schemas per action =====
  private getSchema = TAB_GROUP_TOOL_CONTRACTS.get.zodInputSchema;
  private querySchema = TAB_GROUP_TOOL_CONTRACTS.query.zodInputSchema;
  private updateSchema = TAB_GROUP_TOOL_CONTRACTS.update.zodInputSchema;
  private moveSchema = TAB_GROUP_TOOL_CONTRACTS.move.zodInputSchema;
}
