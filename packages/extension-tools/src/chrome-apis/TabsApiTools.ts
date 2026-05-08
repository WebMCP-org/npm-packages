import type { McpServer } from '@mcp-b/webmcp-ts-sdk';
import { z } from 'zod';

import { type ApiAvailability, BaseApiTools } from '../BaseApiTools';

export interface TabsApiToolsOptions {
  listActiveTabs?: boolean;
  createTab?: boolean;
  updateTab?: boolean;
  closeTabs?: boolean;
  getAllTabs?: boolean;
  navigateHistory?: boolean;
  reloadTab?: boolean;
  captureVisibleTab?: boolean;
  detectLanguage?: boolean;
  discardTab?: boolean;
  duplicateTab?: boolean;
  getTab?: boolean;
  getZoom?: boolean;
  getZoomSettings?: boolean;
  setZoom?: boolean;
  setZoomSettings?: boolean;
  groupTabs?: boolean;
  ungroupTabs?: boolean;
  highlightTabs?: boolean;
  moveTabs?: boolean;
  sendMessage?: boolean;
}

export const TAB_ACTIONS = [
  'listActiveTabs',
  'createTab',
  'updateTab',
  'closeTabs',
  'getAllTabs',
  'navigateHistory',
  'reloadTab',
  'captureVisibleTab',
  'detectLanguage',
  'discardTab',
  'duplicateTab',
  'getTab',
  'getZoom',
  'getZoomSettings',
  'setZoom',
  'setZoomSettings',
  'groupTabs',
  'ungroupTabs',
  'highlightTabs',
  'moveTabs',
  'sendMessage',
] as const;

export class TabsApiTools extends BaseApiTools<TabsApiToolsOptions> {
  protected apiName = 'Tabs';

  constructor(server: McpServer, options: TabsApiToolsOptions = {}) {
    super(server, options);
  }

  checkAvailability(): ApiAvailability {
    try {
      // Test basic tabs API access
      if (!chrome.tabs) {
        return {
          available: false,
          message: 'chrome.tabs API is not defined',
          details: 'This extension may not have the "tabs" permission in its manifest',
        };
      }

      // Test a basic method that should always be available with tabs permission
      if (typeof chrome.tabs.query !== 'function') {
        return {
          available: false,
          message: 'chrome.tabs.query is not available',
          details: 'The tabs API appears to be partially available. Check manifest permissions.',
        };
      }

      return {
        available: true,
        message: 'Tabs API is fully available',
      };
    } catch (error) {
      return {
        available: false,
        message: 'Failed to access chrome.tabs API',
        details: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  registerTools(): void {
    if (this.shouldRegisterTool('listActiveTabs')) {
      this.registerExtensionTool(
        'extension_tool_list_active_tabs',
        'Lists all tabs grouped by domain',
        this.listActiveTabsSchema.shape,
        () => this.handleListActiveTabs()
      );
    }

    if (this.shouldRegisterTool('createTab')) {
      this.registerExtensionTool(
        'extension_tool_create_tab',
        'Create a new browser tab',
        this.createTabSchema.shape,
        (params) => this.handleCreateTab(params)
      );
    }

    if (this.shouldRegisterTool('updateTab')) {
      this.registerExtensionTool(
        'extension_tool_update_tab',
        'Update properties of an existing tab. If no tabId is specified, operates on the currently active tab',
        this.updateTabSchema.shape,
        (params) => this.handleUpdateTab(params)
      );
    }

    if (this.shouldRegisterTool('closeTabs')) {
      this.registerExtensionTool(
        'extension_tool_close_tabs',
        'Close one or more tabs',
        this.closeTabsSchema.shape,
        (params) => this.handleCloseTabs(params)
      );
    }

    if (this.shouldRegisterTool('getAllTabs')) {
      this.registerExtensionTool(
        'extension_tool_get_all_tabs',
        'Get information about all open tabs',
        this.getAllTabsSchema.shape,
        (params) => this.handleGetAllTabs(params)
      );
    }

    if (this.shouldRegisterTool('navigateHistory')) {
      this.registerExtensionTool(
        'extension_tool_navigate_tab_history',
        "Navigate forward or backward in a tab's history. If no tabId is specified, operates on the currently active tab",
        this.navigateHistorySchema.shape,
        (params) => this.handleNavigateHistory(params)
      );
    }

    if (this.shouldRegisterTool('reloadTab')) {
      this.registerExtensionTool(
        'extension_tool_reload_tab',
        'Reload a tab. If no tabId is specified, operates on the currently active tab',
        this.reloadTabSchema.shape,
        (params) => this.handleReloadTab(params)
      );
    }

    if (this.shouldRegisterTool('captureVisibleTab')) {
      this.registerExtensionTool(
        'extension_tool_capture_visible_tab',
        'Take a screenshot of the visible area of the currently active tab in a window',
        this.captureVisibleTabSchema.shape,
        (params) => this.handleCaptureVisibleTab(params)
      );
    }

    if (this.shouldRegisterTool('detectLanguage')) {
      this.registerExtensionTool(
        'extension_tool_detect_tab_language',
        'Detect the primary language of the content in a tab',
        this.detectLanguageSchema.shape,
        (params) => this.handleDetectLanguage(params)
      );
    }

    if (this.shouldRegisterTool('discardTab')) {
      this.registerExtensionTool(
        'extension_tool_discard_tab',
        'Discards a tab from memory. Discarded tabs are still visible but need to reload when activated',
        this.discardTabSchema.shape,
        (params) => this.handleDiscardTab(params)
      );
    }

    if (this.shouldRegisterTool('duplicateTab')) {
      this.registerExtensionTool(
        'extension_tool_duplicate_tab',
        'Duplicate a tab',
        this.duplicateTabSchema.shape,
        (params) => this.handleDuplicateTab(params)
      );
    }

    if (this.shouldRegisterTool('getTab')) {
      this.registerExtensionTool(
        'extension_tool_get_tab',
        'Retrieves details about a specific tab',
        this.getTabSchema.shape,
        (params) => this.handleGetTab(params)
      );
    }

    if (this.shouldRegisterTool('getZoom')) {
      this.registerExtensionTool(
        'extension_tool_get_tab_zoom',
        'Retrieves the current zoom level of a tab',
        this.getZoomSchema.shape,
        (params) => this.handleGetZoom(params)
      );
    }

    if (this.shouldRegisterTool('getZoomSettings')) {
      this.registerExtensionTool(
        'extension_tool_get_tab_zoom_settings',
        'Gets the current zoom settings of a tab',
        this.getZoomSettingsSchema.shape,
        (params) => this.handleGetZoomSettings(params)
      );
    }

    if (this.shouldRegisterTool('setZoom')) {
      this.registerExtensionTool(
        'extension_tool_set_tab_zoom',
        'Sets the zoom factor of a tab',
        this.setZoomSchema.shape,
        (params) => this.handleSetZoom(params)
      );
    }

    if (this.shouldRegisterTool('setZoomSettings')) {
      this.registerExtensionTool(
        'extension_tool_set_tab_zoom_settings',
        'Sets zoom settings for a tab (how zoom changes are handled)',
        this.setZoomSettingsSchema.shape,
        (params) => this.handleSetZoomSettings(params)
      );
    }

    if (this.shouldRegisterTool('groupTabs')) {
      this.registerExtensionTool(
        'extension_tool_group_tabs',
        'Groups one or more tabs together',
        this.groupTabsSchema.shape,
        (params) => this.handleGroupTabs(params)
      );
    }

    if (this.shouldRegisterTool('ungroupTabs')) {
      this.registerExtensionTool(
        'extension_tool_ungroup_tabs',
        'Removes tabs from their groups',
        this.ungroupTabsSchema.shape,
        (params) => this.handleUngroupTabs(params)
      );
    }

    if (this.shouldRegisterTool('highlightTabs')) {
      this.registerExtensionTool(
        'extension_tool_highlight_tabs',
        'Highlights the given tabs and focuses on the first one',
        this.highlightTabsSchema.shape,
        (params) => this.handleHighlightTabs(params)
      );
    }

    if (this.shouldRegisterTool('moveTabs')) {
      this.registerExtensionTool(
        'extension_tool_move_tabs',
        'Moves tabs to a new position within their window or to another window',
        this.moveTabsSchema.shape,
        (params) => this.handleMoveTabs(params)
      );
    }

    if (this.shouldRegisterTool('sendMessage')) {
      this.registerExtensionTool(
        'extension_tool_send_tab_message',
        'Sends a message to content scripts in a specific tab',
        this.sendMessageSchema.shape,
        (params) => this.handleSendMessage(params)
      );
    }
  }

  // ===== Action handlers =====
  private async handleListActiveTabs() {
    const tabs = await chrome.tabs.query({});

    const tabsInfo = tabs.map((tab) => {
      // Extract domain from URL
      let domain = 'unknown';
      if (tab.url) {
        try {
          const url = new URL(tab.url);
          domain = url.hostname;
        } catch {
          // Keep domain as 'unknown' for invalid URLs
        }
      }

      return {
        tabId: tab.id,
        domain,
        url: tab.url,
        title: tab.title,
        isActive: tab.active,
        windowId: tab.windowId,
        index: tab.index,
        pinned: tab.pinned,
        audible: tab.audible,
        mutedInfo: tab.mutedInfo,
        status: tab.status,
      };
    });

    const byDomain = tabsInfo.reduce(
      (acc, tab) => {
        const domain = tab.domain || 'unknown';
        if (!acc[domain]) acc[domain] = [];
        acc[domain].push(tab);
        return acc;
      },
      {} as Record<string, typeof tabsInfo>
    );

    // Sort tabs within each domain by their index
    for (const tabs of Object.values(byDomain)) {
      tabs.sort((a, b) => {
        // First sort by windowId, then by index
        if (a.windowId !== b.windowId) {
          return (a.windowId || 0) - (b.windowId || 0);
        }
        return (a.index || 0) - (b.index || 0);
      });
    }

    return this.formatJson(byDomain);
  }

  private async handleCreateTab(raw: unknown) {
    const { url, active, pinned } = this.createTabSchema.parse(raw);
    const tab = await chrome.tabs.create({ url, active, pinned });
    return this.formatSuccess(`Created tab ${tab.id} with URL: ${tab.url || 'about:blank'}`);
  }

  private async handleUpdateTab(raw: unknown) {
    let { tabId, url, active, pinned, muted } = this.updateTabSchema.parse(raw);
    if (tabId === undefined) {
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!activeTab || !activeTab.id) {
        return this.formatError(new Error('No active tab found'));
      }
      tabId = activeTab.id;
    }

    const updateProperties: chrome.tabs.UpdateProperties = {};
    if (url !== undefined) updateProperties.url = url;
    if (active !== undefined) updateProperties.active = active;
    if (pinned !== undefined) updateProperties.pinned = pinned;
    if (muted !== undefined) updateProperties.muted = muted;

    const tab = await chrome.tabs.update(tabId, updateProperties);
    if (!tab) {
      return this.formatError(new Error('Tab does not exist'));
    }

    return this.formatSuccess(`Updated tab ${tab.id}`, updateProperties);
  }

  private async handleCloseTabs(raw: unknown) {
    const { tabIds } = this.closeTabsSchema.parse(raw);
    await chrome.tabs.remove(tabIds);
    return this.formatSuccess(`Closed ${tabIds.length} tab(s): ${tabIds.join(', ')}`);
  }

  private async handleGetAllTabs(raw: unknown) {
    const { currentWindow } = this.getAllTabsSchema.parse(raw);
    const tabs = await chrome.tabs.query(currentWindow ? { currentWindow: true } : {});
    const tabInfo = tabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      active: tab.active,
      pinned: tab.pinned,
      windowId: tab.windowId,
      index: tab.index,
    }));

    return this.formatJson(tabInfo);
  }

  private async handleNavigateHistory(raw: unknown) {
    if (typeof chrome.tabs.goBack !== 'function' || typeof chrome.tabs.goForward !== 'function') {
      return this.formatError(
        new Error('✗ Navigation methods not available - Chrome 72+ required')
      );
    }
    let { tabId, direction } = this.navigateHistorySchema.parse(raw);
    if (tabId === undefined) {
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!activeTab || !activeTab.id) {
        return this.formatError(new Error('No active tab found'));
      }
      tabId = activeTab.id;
    }

    if (direction === 'back') {
      await chrome.tabs.goBack(tabId);
    } else {
      await chrome.tabs.goForward(tabId);
    }

    return this.formatSuccess(`Navigated ${direction} in tab ${tabId}`);
  }

  private async handleReloadTab(raw: unknown) {
    let { tabId, bypassCache } = this.reloadTabSchema.parse(raw);
    if (tabId === undefined) {
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!activeTab || !activeTab.id) {
        return this.formatError(new Error('No active tab found'));
      }
      tabId = activeTab.id;
    }

    await chrome.tabs.reload(tabId, { bypassCache });
    return this.formatSuccess(`Reloaded tab ${tabId}${bypassCache ? ' (bypassed cache)' : ''}`);
  }

  private async handleCaptureVisibleTab(raw: unknown) {
    if (typeof chrome.tabs.captureVisibleTab !== 'function') {
      return this.formatError(
        new Error(
          '✗ Screenshot capture not available - requires "activeTab" or "<all_urls>" permission'
        )
      );
    }
    const { windowId } = this.captureVisibleTabSchema.parse(raw);
    const dataUrl = windowId
      ? await chrome.tabs.captureVisibleTab(windowId, {})
      : await chrome.tabs.captureVisibleTab();

    chrome.tabs.create({ url: dataUrl });
    return this.formatSuccess(
      `Screenshot captured (data URL length: ${dataUrl.length} characters)`
    );
  }

  private async handleDetectLanguage(raw: unknown) {
    const { tabId } = this.detectLanguageSchema.parse(raw);
    const language = await chrome.tabs.detectLanguage(tabId!);
    return this.formatSuccess(`Tab language detected: ${language}`, {
      language,
    });
  }

  private async handleDiscardTab(raw: unknown) {
    const { tabId } = this.discardTabSchema.parse(raw);
    const tab = await chrome.tabs.discard(tabId);
    if (!tab) {
      return this.formatError(new Error('Failed to discard tab'));
    }
    return this.formatSuccess(`Discarded tab ${tab.id}`, { tab });
  }

  private async handleDuplicateTab(raw: unknown) {
    const { tabId } = this.duplicateTabSchema.parse(raw);
    const tab = await chrome.tabs.duplicate(tabId);
    if (!tab) {
      return this.formatError(new Error('Failed to duplicate tab'));
    }
    return this.formatSuccess(`Duplicated tab ${tab.id}`, { tab });
  }

  private async handleGetTab(raw: unknown) {
    const { tabId } = this.getTabSchema.parse(raw);
    const tab = await chrome.tabs.get(tabId);
    return this.formatJson(tab);
  }

  private async handleGetZoom(raw: unknown) {
    const { tabId } = this.getZoomSchema.parse(raw);
    const zoomFactor = await chrome.tabs.getZoom(tabId!);
    return this.formatSuccess(`Zoom factor: ${zoomFactor}`, {
      zoomFactor,
    });
  }

  private async handleGetZoomSettings(raw: unknown) {
    const { tabId } = this.getZoomSettingsSchema.parse(raw);
    const zoomSettings = await chrome.tabs.getZoomSettings(tabId!);
    return this.formatJson(zoomSettings);
  }

  private async handleSetZoom(raw: unknown) {
    const { tabId, zoomFactor } = this.setZoomSchema.parse(raw);
    await chrome.tabs.setZoom(tabId!, zoomFactor);
    return this.formatSuccess(`Set zoom factor to ${zoomFactor === 0 ? 'default' : zoomFactor}`);
  }

  private async handleSetZoomSettings(raw: unknown) {
    const { tabId, mode, scope } = this.setZoomSettingsSchema.parse(raw);
    const settings: chrome.tabs.ZoomSettings = {};
    if (mode) settings.mode = mode;
    if (scope) settings.scope = scope;

    await chrome.tabs.setZoomSettings(tabId!, settings);
    return this.formatSuccess('Updated zoom settings', settings);
  }

  private async handleGroupTabs(raw: unknown) {
    const { tabIds, groupId, createProperties } = this.groupTabsSchema.parse(raw);
    const options: Parameters<typeof chrome.tabs.group>[0] = {
      tabIds: tabIds.length === 1 ? tabIds[0] : tabIds,
    };

    if (groupId !== undefined) {
      options.groupId = groupId;
    } else if (createProperties) {
      options.createProperties = createProperties;
    }

    const resultGroupId = await chrome.tabs.group(options);
    return this.formatSuccess(`Grouped ${tabIds.length} tabs into group ${resultGroupId}`, {
      groupId: resultGroupId,
    });
  }

  private async handleUngroupTabs(raw: unknown) {
    const { tabIds } = this.ungroupTabsSchema.parse(raw);
    await chrome.tabs.ungroup(tabIds.length === 1 ? tabIds[0]! : tabIds);
    return this.formatSuccess(`Ungrouped ${tabIds.length} tab(s)`);
  }

  private async handleHighlightTabs(raw: unknown) {
    const { tabs, windowId } = this.highlightTabsSchema.parse(raw);
    const highlightInfo: chrome.tabs.HighlightInfo = {
      tabs: tabs.length === 1 ? tabs[0]! : tabs,
    };
    if (windowId !== undefined) {
      highlightInfo.windowId = windowId;
    }

    const window = await chrome.tabs.highlight(highlightInfo);
    return this.formatSuccess(`Highlighted ${tabs.length} tab(s)`, {
      window,
    });
  }

  private async handleMoveTabs(raw: unknown) {
    const { tabIds, index, windowId } = this.moveTabsSchema.parse(raw);
    const moveProperties: chrome.tabs.MoveProperties = { index };
    if (windowId !== undefined) {
      moveProperties.windowId = windowId;
    }

    const tabs = chrome.tabs.move(
      //@ts-expect-error - to lazy to fix this
      tabIds.length === 1 ? tabIds[0] : tabIds,
      moveProperties
    );
    return this.formatSuccess(`Moved ${tabIds.length} tab(s) to index ${index}`, { tabs });
  }

  private async handleSendMessage(raw: unknown) {
    const { tabId, message, frameId, documentId } = this.sendMessageSchema.parse(raw);
    const options: chrome.tabs.MessageSendOptions = {};
    if (frameId !== undefined) options.frameId = frameId;
    if (documentId !== undefined) options.documentId = documentId;

    const response = await chrome.tabs.sendMessage(tabId, message, options);
    return this.formatSuccess('Message sent successfully', { response });
  }

  // ===== Validation Schemas per action =====
  private listActiveTabsSchema = z.object({});

  private createTabSchema = z.object({
    url: z
      .string()
      .optional()
      .describe(
        `URL to open in the new tab. Fully-qualified URLs must include a scheme (i.e., 'http://www.google.com', not 'www.google.com'). Relative URLs are relative to the current page within the extension. Defaults to the New Tab Page.`
      ),
    active: z.boolean().optional().describe('Whether the tab should be active'),
    pinned: z.boolean().optional().describe('Whether the tab should be pinned'),
  });

  private updateTabSchema = z.object({
    tabId: z.number().optional().describe('ID of the tab to update (defaults to active tab)'),
    url: z.string().optional().describe('New URL for the tab'),
    active: z.boolean().optional().describe('Whether to make the tab active'),
    pinned: z.boolean().optional().describe('Whether to pin/unpin the tab'),
    muted: z.boolean().optional().describe('Whether to mute/unmute the tab'),
  });

  private closeTabsSchema = z.object({
    tabIds: z.array(z.number()).describe('Array of tab IDs to close'),
  });

  private getAllTabsSchema = z.object({
    currentWindow: z.boolean().optional().describe('Only get tabs from current window'),
  });

  private navigateHistorySchema = z.object({
    tabId: z.number().optional().describe('Tab ID to navigate (defaults to active tab)'),
    direction: z.enum(['back', 'forward']).describe('Navigation direction'),
  });

  private reloadTabSchema = z.object({
    tabId: z.number().optional().describe('Tab ID to reload (defaults to active tab)'),
    bypassCache: z.boolean().optional().describe('Bypass the cache when reloading'),
  });

  private captureVisibleTabSchema = z.object({
    windowId: z.number().optional().describe('Window ID (defaults to current window)'),
  });

  private detectLanguageSchema = z.object({
    tabId: z.number().optional().describe('Tab ID (defaults to active tab)'),
  });

  private discardTabSchema = z.object({
    tabId: z
      .number()
      .optional()
      .describe('Tab ID to discard (if omitted, browser picks least important tab)'),
  });

  private duplicateTabSchema = z.object({
    tabId: z.number().describe('ID of the tab to duplicate'),
  });

  private getTabSchema = z.object({
    tabId: z.number().describe('Tab ID'),
  });

  private getZoomSchema = z.object({
    tabId: z.number().optional().describe('Tab ID (defaults to active tab)'),
  });

  private getZoomSettingsSchema = z.object({
    tabId: z.number().optional().describe('Tab ID (defaults to active tab)'),
  });

  private setZoomSchema = z.object({
    tabId: z.number().optional().describe('Tab ID (defaults to active tab)'),
    zoomFactor: z.number().describe('New zoom factor (0 resets to default, >0 sets specific zoom)'),
  });

  private setZoomSettingsSchema = z.object({
    tabId: z.number().optional().describe('Tab ID (defaults to active tab)'),
    mode: z
      .enum(['automatic', 'manual', 'disabled'])
      .optional()
      .describe('How zoom changes are handled'),
    scope: z
      .enum(['per-origin', 'per-tab'])
      .optional()
      .describe('Whether zoom persists across pages'),
  });

  private groupTabsSchema = z.object({
    tabIds: z.array(z.number()).min(1).describe('Tab IDs to group'),
    groupId: z.number().optional().describe('Existing group ID to add tabs to'),
    createProperties: z
      .object({
        windowId: z.number().optional().describe('Window ID for new group'),
      })
      .optional()
      .describe('Properties for creating a new group'),
  });

  private ungroupTabsSchema = z.object({
    tabIds: z.array(z.number()).min(1).describe('Tab IDs to ungroup'),
  });

  private highlightTabsSchema = z.object({
    tabs: z.array(z.number()).min(1).describe('Tab indices to highlight'),
    windowId: z.number().optional().describe('Window ID containing the tabs'),
  });

  private moveTabsSchema = z.object({
    tabIds: z.array(z.number()).min(1).describe('Tab IDs to move'),
    index: z.number().describe('Position to move tabs to (-1 for end)'),
    windowId: z.number().optional().describe('Target window ID'),
  });

  private sendMessageSchema = z.object({
    tabId: z.number().describe('Tab ID to send message to'),
    message: z.any().describe('Message to send (must be JSON-serializable)'),
    frameId: z.number().optional().describe('Specific frame ID to target'),
    documentId: z.string().optional().describe('Specific document ID to target'),
  });
}
