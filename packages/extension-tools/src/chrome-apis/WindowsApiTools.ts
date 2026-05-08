import type { McpServer } from '@mcp-b/webmcp-ts-sdk';

import { type ApiAvailability, BaseApiTools } from '../BaseApiTools';
import {
  WINDOW_ACTION_IDS,
  WINDOW_TOOL_CONTRACTS,
  type WindowCreateInput,
  type WindowGetAllInput,
  type WindowGetCurrentInput,
  type WindowGetInput,
  type WindowGetLastFocusedInput,
  type WindowRemoveInput,
  type WindowUpdateInput,
} from '../contracts/windows';

export interface WindowsApiToolsOptions {
  create?: boolean;
  get?: boolean;
  getAll?: boolean;
  getCurrent?: boolean;
  getLastFocused?: boolean;
  remove?: boolean;
  update?: boolean;
}

export const WINDOW_ACTIONS = WINDOW_ACTION_IDS;

export class WindowsApiTools extends BaseApiTools<WindowsApiToolsOptions> {
  protected apiName = 'Windows';

  constructor(server: McpServer, options: WindowsApiToolsOptions = {}) {
    super(server, options);
  }

  checkAvailability(): ApiAvailability {
    try {
      // Check if API exists
      if (!chrome.windows) {
        return {
          available: false,
          message: 'chrome.windows API is not defined',
          details: 'This extension needs the "windows" permission in its manifest.json',
        };
      }

      // Test a basic method
      if (typeof chrome.windows.getAll !== 'function') {
        return {
          available: false,
          message: 'chrome.windows.getAll is not available',
          details: 'The windows API appears to be partially available. Check manifest permissions.',
        };
      }

      // Try to actually use the API
      chrome.windows.getAll((_windows) => {
        if (chrome.runtime.lastError) {
          throw new Error(chrome.runtime.lastError.message);
        }
      });

      return {
        available: true,
        message: 'Windows API is fully available',
      };
    } catch (error) {
      return {
        available: false,
        message: 'Failed to access chrome.windows API',
        details: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  registerTools(): void {
    if (this.shouldRegisterTool('create')) {
      this.registerExtensionTool(WINDOW_TOOL_CONTRACTS.create, (params) =>
        this.handleCreate(params)
      );
    }

    if (this.shouldRegisterTool('get')) {
      this.registerExtensionTool(WINDOW_TOOL_CONTRACTS.get, (params) => this.handleGet(params));
    }

    if (this.shouldRegisterTool('getAll')) {
      this.registerExtensionTool(WINDOW_TOOL_CONTRACTS.getAll, (params) =>
        this.handleGetAll(params)
      );
    }

    if (this.shouldRegisterTool('getCurrent')) {
      this.registerExtensionTool(WINDOW_TOOL_CONTRACTS.getCurrent, (params) =>
        this.handleGetCurrent(params)
      );
    }

    if (this.shouldRegisterTool('getLastFocused')) {
      this.registerExtensionTool(WINDOW_TOOL_CONTRACTS.getLastFocused, (params) =>
        this.handleGetLastFocused(params)
      );
    }

    if (this.shouldRegisterTool('remove')) {
      this.registerExtensionTool(WINDOW_TOOL_CONTRACTS.remove, (params) =>
        this.handleRemove(params)
      );
    }

    if (this.shouldRegisterTool('update')) {
      this.registerExtensionTool(WINDOW_TOOL_CONTRACTS.update, (params) =>
        this.handleUpdate(params)
      );
    }
  }

  // ===== Action handlers =====
  private async handleCreate({
    url,
    focused,
    height,
    incognito,
    left,
    setSelfAsOpener,
    state,
    tabId,
    top,
    type,
    width,
  }: WindowCreateInput) {
    const createData: chrome.windows.CreateData = {};

    if (url !== undefined) createData.url = url;
    if (focused !== undefined) createData.focused = focused;
    if (height !== undefined) createData.height = height;
    if (incognito !== undefined) createData.incognito = incognito;
    if (left !== undefined) createData.left = left;
    if (setSelfAsOpener !== undefined) createData.setSelfAsOpener = setSelfAsOpener;
    if (state !== undefined) createData.state = state;
    if (tabId !== undefined) createData.tabId = tabId;
    if (top !== undefined) createData.top = top;
    if (type !== undefined) createData.type = type;
    if (width !== undefined) createData.width = width;

    const window = await chrome.windows.create(createData);
    if (!window) {
      return this.formatError(new Error('Failed to create window'));
    }

    return this.formatJson({
      id: window.id,
      focused: window.focused,
      incognito: window.incognito,
      alwaysOnTop: window.alwaysOnTop,
      state: window.state,
      type: window.type,
      left: window.left,
      top: window.top,
      width: window.width,
      height: window.height,
      tabs: window.tabs?.map((tab) => ({
        id: tab.id,
        url: tab.url,
        title: tab.title,
        active: tab.active,
      })),
    });
  }

  private async handleGet({ windowId, populate, windowTypes }: WindowGetInput) {
    const queryOptions: chrome.windows.QueryOptions = {};
    if (populate !== undefined) queryOptions.populate = populate;
    if (windowTypes !== undefined) queryOptions.windowTypes = windowTypes;

    const window = await new Promise<chrome.windows.Window>((resolve, reject) => {
      chrome.windows.get(windowId, queryOptions, (window) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(window);
        }
      });
    });

    return this.formatJson({
      id: window.id,
      focused: window.focused,
      incognito: window.incognito,
      alwaysOnTop: window.alwaysOnTop,
      state: window.state,
      type: window.type,
      left: window.left,
      top: window.top,
      width: window.width,
      height: window.height,
      sessionId: window.sessionId,
      tabs: window.tabs?.map((tab) => ({
        id: tab.id,
        url: tab.url,
        title: tab.title,
        active: tab.active,
        index: tab.index,
      })),
    });
  }

  private async handleGetAll({ populate, windowTypes }: WindowGetAllInput) {
    const queryOptions: chrome.windows.QueryOptions = {};
    if (populate !== undefined) queryOptions.populate = populate;
    if (windowTypes !== undefined) queryOptions.windowTypes = windowTypes;

    const windows = await new Promise<chrome.windows.Window[]>((resolve, reject) => {
      chrome.windows.getAll(queryOptions, (windows) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(windows);
        }
      });
    });

    return this.formatJson({
      count: windows.length,
      windows: windows.map((window) => ({
        id: window.id,
        focused: window.focused,
        incognito: window.incognito,
        alwaysOnTop: window.alwaysOnTop,
        state: window.state,
        type: window.type,
        left: window.left,
        top: window.top,
        width: window.width,
        height: window.height,
        sessionId: window.sessionId,
        tabs: window.tabs?.map((tab) => ({
          id: tab.id,
          url: tab.url,
          title: tab.title,
          active: tab.active,
          index: tab.index,
        })),
      })),
    });
  }

  private async handleGetCurrent({ populate, windowTypes }: WindowGetCurrentInput) {
    const queryOptions: chrome.windows.QueryOptions = {};
    if (populate !== undefined) queryOptions.populate = populate;
    if (windowTypes !== undefined) queryOptions.windowTypes = windowTypes;

    const window = await new Promise<chrome.windows.Window>((resolve, reject) => {
      chrome.windows.getCurrent(queryOptions, (window) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(window);
        }
      });
    });

    return this.formatJson({
      id: window.id,
      focused: window.focused,
      incognito: window.incognito,
      alwaysOnTop: window.alwaysOnTop,
      state: window.state,
      type: window.type,
      left: window.left,
      top: window.top,
      width: window.width,
      height: window.height,
      sessionId: window.sessionId,
      tabs: window.tabs?.map((tab) => ({
        id: tab.id,
        url: tab.url,
        title: tab.title,
        active: tab.active,
        index: tab.index,
      })),
    });
  }

  private async handleGetLastFocused({ populate, windowTypes }: WindowGetLastFocusedInput) {
    const queryOptions: chrome.windows.QueryOptions = {};
    if (populate !== undefined) queryOptions.populate = populate;
    if (windowTypes !== undefined) queryOptions.windowTypes = windowTypes;

    const window = await new Promise<chrome.windows.Window>((resolve, reject) => {
      chrome.windows.getLastFocused(queryOptions, (window) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(window);
        }
      });
    });

    return this.formatJson({
      id: window.id,
      focused: window.focused,
      incognito: window.incognito,
      alwaysOnTop: window.alwaysOnTop,
      state: window.state,
      type: window.type,
      left: window.left,
      top: window.top,
      width: window.width,
      height: window.height,
      sessionId: window.sessionId,
      tabs: window.tabs?.map((tab) => ({
        id: tab.id,
        url: tab.url,
        title: tab.title,
        active: tab.active,
        index: tab.index,
      })),
    });
  }

  private async handleRemove({ windowId }: WindowRemoveInput) {
    await new Promise<void>((resolve, reject) => {
      chrome.windows.remove(windowId, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });

    return this.formatSuccess('Window removed successfully', { windowId });
  }

  private async handleUpdate({
    windowId,
    drawAttention,
    focused,
    height,
    left,
    state,
    top,
    width,
  }: WindowUpdateInput) {
    const updateInfo: chrome.windows.UpdateInfo = {};

    if (drawAttention !== undefined) updateInfo.drawAttention = drawAttention;
    if (focused !== undefined) updateInfo.focused = focused;
    if (height !== undefined) updateInfo.height = height;
    if (left !== undefined) updateInfo.left = left;
    if (state !== undefined) updateInfo.state = state;
    if (top !== undefined) updateInfo.top = top;
    if (width !== undefined) updateInfo.width = width;

    const window = await new Promise<chrome.windows.Window>((resolve, reject) => {
      chrome.windows.update(windowId, updateInfo, (window) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(window);
        }
      });
    });

    return this.formatJson({
      id: window.id,
      focused: window.focused,
      incognito: window.incognito,
      alwaysOnTop: window.alwaysOnTop,
      state: window.state,
      type: window.type,
      left: window.left,
      top: window.top,
      width: window.width,
      height: window.height,
      sessionId: window.sessionId,
    });
  }
}
