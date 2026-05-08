import type { McpServer } from '@mcp-b/webmcp-ts-sdk';

import { type ApiAvailability, BaseApiTools } from '../BaseApiTools';
import {
  HISTORY_ACTION_IDS,
  HISTORY_TOOL_CONTRACTS,
  type HistoryAddUrlInput,
  type HistoryDeleteRangeInput,
  type HistoryDeleteUrlInput,
  type HistoryGetVisitsInput,
  type HistorySearchInput,
} from '../contracts/history';

export interface HistoryApiToolsOptions {
  addUrl?: boolean;
  deleteAll?: boolean;
  deleteRange?: boolean;
  deleteUrl?: boolean;
  getVisits?: boolean;
  search?: boolean;
}

export const HISTORY_ACTIONS = HISTORY_ACTION_IDS;

export class HistoryApiTools extends BaseApiTools<HistoryApiToolsOptions> {
  protected apiName = 'History';

  constructor(server: McpServer, options: HistoryApiToolsOptions = {}) {
    super(server, options);
  }

  checkAvailability(): ApiAvailability {
    try {
      // Check if API exists
      if (!chrome.history) {
        return {
          available: false,
          message: 'chrome.history API is not defined',
          details: 'This extension needs the "history" permission in its manifest.json',
        };
      }

      // Test a basic method
      if (typeof chrome.history.search !== 'function') {
        return {
          available: false,
          message: 'chrome.history.search is not available',
          details: 'The history API appears to be partially available. Check manifest permissions.',
        };
      }

      // Try to actually use the API
      chrome.history.search({ text: '', maxResults: 1 }, (_results) => {
        if (chrome.runtime.lastError) {
          throw new Error(chrome.runtime.lastError.message);
        }
      });

      return {
        available: true,
        message: 'History API is fully available',
      };
    } catch (error) {
      return {
        available: false,
        message: 'Failed to access chrome.history API',
        details: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  registerTools(): void {
    if (this.shouldRegisterTool('addUrl')) {
      this.registerExtensionTool(HISTORY_TOOL_CONTRACTS.addUrl, (params) =>
        this.handleAddUrl(params)
      );
    }

    if (this.shouldRegisterTool('deleteAll')) {
      this.registerExtensionTool(HISTORY_TOOL_CONTRACTS.deleteAll, () => this.handleDeleteAll());
    }

    if (this.shouldRegisterTool('deleteRange')) {
      this.registerExtensionTool(HISTORY_TOOL_CONTRACTS.deleteRange, (params) =>
        this.handleDeleteRange(params)
      );
    }

    if (this.shouldRegisterTool('deleteUrl')) {
      this.registerExtensionTool(HISTORY_TOOL_CONTRACTS.deleteUrl, (params) =>
        this.handleDeleteUrl(params)
      );
    }

    if (this.shouldRegisterTool('getVisits')) {
      this.registerExtensionTool(HISTORY_TOOL_CONTRACTS.getVisits, (params) =>
        this.handleGetVisits(params)
      );
    }

    if (this.shouldRegisterTool('search')) {
      this.registerExtensionTool(HISTORY_TOOL_CONTRACTS.search, (params) =>
        this.handleSearch(params)
      );
    }
  }

  // ===== Action handlers =====
  private async handleAddUrl({ url }: HistoryAddUrlInput) {
    await chrome.history.addUrl({ url });

    return this.formatSuccess('URL added to history successfully', { url });
  }

  private async handleDeleteAll() {
    await chrome.history.deleteAll();

    return this.formatSuccess('All history deleted successfully');
  }

  private async handleDeleteRange({ startTime, endTime }: HistoryDeleteRangeInput) {
    if (startTime >= endTime) {
      return this.formatError('startTime must be less than endTime');
    }
    await chrome.history.deleteRange({ startTime, endTime });

    return this.formatSuccess('History range deleted successfully', {
      startTime,
      endTime,
      startTimeFormatted: new Date(startTime).toISOString(),
      endTimeFormatted: new Date(endTime).toISOString(),
    });
  }

  private async handleDeleteUrl({ url }: HistoryDeleteUrlInput) {
    await chrome.history.deleteUrl({ url });

    return this.formatSuccess('URL deleted from history successfully', { url });
  }

  private async handleGetVisits({ url }: HistoryGetVisitsInput) {
    const visits = await chrome.history.getVisits({ url });

    return this.formatJson({
      url,
      visitCount: visits.length,
      visits: visits.map((visit) => ({
        id: visit.id,
        visitId: visit.visitId,
        visitTime: visit.visitTime,
        visitTimeFormatted: visit.visitTime ? new Date(visit.visitTime).toISOString() : undefined,
        referringVisitId: visit.referringVisitId,
        transition: visit.transition,
      })),
    });
  }

  private async handleSearch({ text, startTime, endTime, maxResults }: HistorySearchInput) {
    const query: chrome.history.HistoryQuery = { text };

    if (startTime !== undefined) {
      query.startTime = startTime;
    }

    if (endTime !== undefined) {
      query.endTime = endTime;
    }

    if (maxResults !== undefined) {
      query.maxResults = maxResults;
    }

    const results = await chrome.history.search(query);

    return this.formatJson({
      query: {
        text,
        startTime,
        endTime,
        maxResults,
      },
      resultCount: results.length,
      results: results.map((item) => ({
        id: item.id,
        url: item.url,
        title: item.title,
        lastVisitTime: item.lastVisitTime,
        lastVisitTimeFormatted: item.lastVisitTime
          ? new Date(item.lastVisitTime).toISOString()
          : undefined,
        visitCount: item.visitCount,
        typedCount: item.typedCount,
      })),
    });
  }
}
