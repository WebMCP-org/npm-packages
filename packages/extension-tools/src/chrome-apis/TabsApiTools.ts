import type { McpServer } from '@mcp-b/webmcp-ts-sdk';

import { type ApiAvailability, BaseApiTools } from '../BaseApiTools';
import { TAB_ACTION_IDS, TAB_TOOL_CONTRACTS } from '../contracts/tabs';

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

export const TAB_ACTIONS = TAB_ACTION_IDS;

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
      this.registerExtensionTool(TAB_TOOL_CONTRACTS.listActiveTabs, () =>
        this.handleListActiveTabs()
      );
    }

    if (this.shouldRegisterTool('createTab')) {
      this.registerExtensionTool(TAB_TOOL_CONTRACTS.createTab, (params) =>
        this.handleCreateTab(params)
      );
    }

    if (this.shouldRegisterTool('updateTab')) {
      this.registerExtensionTool(TAB_TOOL_CONTRACTS.updateTab, (params) =>
        this.handleUpdateTab(params)
      );
    }

    if (this.shouldRegisterTool('closeTabs')) {
      this.registerExtensionTool(TAB_TOOL_CONTRACTS.closeTabs, (params) =>
        this.handleCloseTabs(params)
      );
    }

    if (this.shouldRegisterTool('getAllTabs')) {
      this.registerExtensionTool(TAB_TOOL_CONTRACTS.getAllTabs, (params) =>
        this.handleGetAllTabs(params)
      );
    }

    if (this.shouldRegisterTool('navigateHistory')) {
      this.registerExtensionTool(TAB_TOOL_CONTRACTS.navigateHistory, (params) =>
        this.handleNavigateHistory(params)
      );
    }

    if (this.shouldRegisterTool('reloadTab')) {
      this.registerExtensionTool(TAB_TOOL_CONTRACTS.reloadTab, (params) =>
        this.handleReloadTab(params)
      );
    }

    if (this.shouldRegisterTool('captureVisibleTab')) {
      this.registerExtensionTool(TAB_TOOL_CONTRACTS.captureVisibleTab, (params) =>
        this.handleCaptureVisibleTab(params)
      );
    }

    if (this.shouldRegisterTool('detectLanguage')) {
      this.registerExtensionTool(TAB_TOOL_CONTRACTS.detectLanguage, (params) =>
        this.handleDetectLanguage(params)
      );
    }

    if (this.shouldRegisterTool('discardTab')) {
      this.registerExtensionTool(TAB_TOOL_CONTRACTS.discardTab, (params) =>
        this.handleDiscardTab(params)
      );
    }

    if (this.shouldRegisterTool('duplicateTab')) {
      this.registerExtensionTool(TAB_TOOL_CONTRACTS.duplicateTab, (params) =>
        this.handleDuplicateTab(params)
      );
    }

    if (this.shouldRegisterTool('getTab')) {
      this.registerExtensionTool(TAB_TOOL_CONTRACTS.getTab, (params) => this.handleGetTab(params));
    }

    if (this.shouldRegisterTool('getZoom')) {
      this.registerExtensionTool(TAB_TOOL_CONTRACTS.getZoom, (params) =>
        this.handleGetZoom(params)
      );
    }

    if (this.shouldRegisterTool('getZoomSettings')) {
      this.registerExtensionTool(TAB_TOOL_CONTRACTS.getZoomSettings, (params) =>
        this.handleGetZoomSettings(params)
      );
    }

    if (this.shouldRegisterTool('setZoom')) {
      this.registerExtensionTool(TAB_TOOL_CONTRACTS.setZoom, (params) =>
        this.handleSetZoom(params)
      );
    }

    if (this.shouldRegisterTool('setZoomSettings')) {
      this.registerExtensionTool(TAB_TOOL_CONTRACTS.setZoomSettings, (params) =>
        this.handleSetZoomSettings(params)
      );
    }

    if (this.shouldRegisterTool('groupTabs')) {
      this.registerExtensionTool(TAB_TOOL_CONTRACTS.groupTabs, (params) =>
        this.handleGroupTabs(params)
      );
    }

    if (this.shouldRegisterTool('ungroupTabs')) {
      this.registerExtensionTool(TAB_TOOL_CONTRACTS.ungroupTabs, (params) =>
        this.handleUngroupTabs(params)
      );
    }

    if (this.shouldRegisterTool('highlightTabs')) {
      this.registerExtensionTool(TAB_TOOL_CONTRACTS.highlightTabs, (params) =>
        this.handleHighlightTabs(params)
      );
    }

    if (this.shouldRegisterTool('moveTabs')) {
      this.registerExtensionTool(TAB_TOOL_CONTRACTS.moveTabs, (params) =>
        this.handleMoveTabs(params)
      );
    }

    if (this.shouldRegisterTool('sendMessage')) {
      this.registerExtensionTool(TAB_TOOL_CONTRACTS.sendMessage, (params) =>
        this.handleSendMessage(params)
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

    return this.formatJson({
      domains: byDomain,
      totalTabs: tabsInfo.length,
    });
  }

  private async handleCreateTab(raw: unknown) {
    const { url, active, pinned } = this.createTabSchema.parse(raw);
    const tab = await chrome.tabs.create({ url, active, pinned });
    return this.formatSuccess(`Created tab ${tab.id} with URL: ${tab.url || 'about:blank'}`, tab);
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

    return this.formatSuccess(`Updated tab ${tab.id}`, {
      tab,
      changes: updateProperties,
    });
  }

  private async handleCloseTabs(raw: unknown) {
    const { tabIds } = this.closeTabsSchema.parse(raw);
    await chrome.tabs.remove(tabIds);
    return this.formatSuccess(`Closed ${tabIds.length} tab(s): ${tabIds.join(', ')}`, { tabIds });
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

    return this.formatJson({
      count: tabInfo.length,
      tabs: tabInfo,
    });
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

    return this.formatSuccess(`Navigated ${direction} in tab ${tabId}`, { tabId, direction });
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
    return this.formatSuccess(`Reloaded tab ${tabId}${bypassCache ? ' (bypassed cache)' : ''}`, {
      tabId,
      bypassCache: bypassCache === true,
    });
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

    return this.formatSuccess(
      `Screenshot captured (data URL length: ${dataUrl.length} characters)`,
      {
        dataUrl,
        length: dataUrl.length,
      }
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
    return this.formatJson({ tab });
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
    return this.formatSuccess(`Set zoom factor to ${zoomFactor === 0 ? 'default' : zoomFactor}`, {
      ...(tabId !== undefined ? { tabId } : {}),
      zoomFactor,
    });
  }

  private async handleSetZoomSettings(raw: unknown) {
    const { tabId, mode, scope } = this.setZoomSettingsSchema.parse(raw);
    const settings: chrome.tabs.ZoomSettings = {};
    if (mode) settings.mode = mode;
    if (scope) settings.scope = scope;

    await chrome.tabs.setZoomSettings(tabId!, settings);
    const zoomSettings = await chrome.tabs.getZoomSettings(tabId!);
    return this.formatSuccess('Updated zoom settings', {
      settings: zoomSettings,
    });
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
    return this.formatSuccess(`Ungrouped ${tabIds.length} tab(s)`, { tabIds });
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

    const movedTabs = await chrome.tabs.move(
      tabIds.length === 1 ? tabIds[0]! : tabIds,
      moveProperties
    );
    return this.formatSuccess(`Moved ${tabIds.length} tab(s) to index ${index}`, {
      tabs: Array.isArray(movedTabs) ? movedTabs : [movedTabs],
    });
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
  private createTabSchema = TAB_TOOL_CONTRACTS.createTab.zodInputSchema;
  private updateTabSchema = TAB_TOOL_CONTRACTS.updateTab.zodInputSchema;
  private closeTabsSchema = TAB_TOOL_CONTRACTS.closeTabs.zodInputSchema;
  private getAllTabsSchema = TAB_TOOL_CONTRACTS.getAllTabs.zodInputSchema;
  private navigateHistorySchema = TAB_TOOL_CONTRACTS.navigateHistory.zodInputSchema;
  private reloadTabSchema = TAB_TOOL_CONTRACTS.reloadTab.zodInputSchema;
  private captureVisibleTabSchema = TAB_TOOL_CONTRACTS.captureVisibleTab.zodInputSchema;
  private detectLanguageSchema = TAB_TOOL_CONTRACTS.detectLanguage.zodInputSchema;
  private discardTabSchema = TAB_TOOL_CONTRACTS.discardTab.zodInputSchema;
  private duplicateTabSchema = TAB_TOOL_CONTRACTS.duplicateTab.zodInputSchema;
  private getTabSchema = TAB_TOOL_CONTRACTS.getTab.zodInputSchema;
  private getZoomSchema = TAB_TOOL_CONTRACTS.getZoom.zodInputSchema;
  private getZoomSettingsSchema = TAB_TOOL_CONTRACTS.getZoomSettings.zodInputSchema;
  private setZoomSchema = TAB_TOOL_CONTRACTS.setZoom.zodInputSchema;
  private setZoomSettingsSchema = TAB_TOOL_CONTRACTS.setZoomSettings.zodInputSchema;
  private groupTabsSchema = TAB_TOOL_CONTRACTS.groupTabs.zodInputSchema;
  private ungroupTabsSchema = TAB_TOOL_CONTRACTS.ungroupTabs.zodInputSchema;
  private highlightTabsSchema = TAB_TOOL_CONTRACTS.highlightTabs.zodInputSchema;
  private moveTabsSchema = TAB_TOOL_CONTRACTS.moveTabs.zodInputSchema;
  private sendMessageSchema = TAB_TOOL_CONTRACTS.sendMessage.zodInputSchema;
}
