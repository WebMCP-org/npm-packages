import type { McpServer } from '@mcp-b/webmcp-ts-sdk';

import { type ApiAvailability, BaseApiTools } from '../BaseApiTools';
import { HISTORY_ACTION_IDS, HISTORY_TOOL_CONTRACTS } from '../contracts/history';

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
  private async handleAddUrl(raw: unknown) {
    const { url } = this.addUrlSchema.parse(raw);
    await new Promise<void>((resolve, reject) => {
      chrome.history.addUrl({ url }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });

    return this.formatSuccess('URL added to history successfully', { url });
  }

  private async handleDeleteAll() {
    await new Promise<void>((resolve, reject) => {
      chrome.history.deleteAll(() => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });

    return this.formatSuccess('All history deleted successfully');
  }

  private async handleDeleteRange(raw: unknown) {
    const { startTime, endTime } = this.deleteRangeSchema.parse(raw);
    if (startTime >= endTime) {
      return this.formatError('startTime must be less than endTime');
    }
    await new Promise<void>((resolve, reject) => {
      chrome.history.deleteRange({ startTime, endTime }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });

    return this.formatSuccess('History range deleted successfully', {
      startTime,
      endTime,
      startTimeFormatted: new Date(startTime).toISOString(),
      endTimeFormatted: new Date(endTime).toISOString(),
    });
  }

  private async handleDeleteUrl(raw: unknown) {
    const { url } = this.deleteUrlSchema.parse(raw);
    await new Promise<void>((resolve, reject) => {
      chrome.history.deleteUrl({ url }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });

    return this.formatSuccess('URL deleted from history successfully', { url });
  }

  private async handleGetVisits(raw: unknown) {
    const { url } = this.getVisitsSchema.parse(raw);
    const visits = await new Promise<chrome.history.VisitItem[]>((resolve, reject) => {
      chrome.history.getVisits({ url }, (visits) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(visits);
        }
      });
    });

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

  private async handleSearch(raw: unknown) {
    const { text, startTime, endTime, maxResults } = this.searchSchema.parse(raw);

    const query: any = { text };

    if (startTime !== undefined) {
      query.startTime = startTime;
    }

    if (endTime !== undefined) {
      query.endTime = endTime;
    }

    if (maxResults !== undefined) {
      query.maxResults = maxResults;
    }

    const results = await new Promise<chrome.history.HistoryItem[]>((resolve, reject) => {
      chrome.history.search(query, (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(results);
        }
      });
    });

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

  // ===== Validation Schemas per action =====
  private addUrlSchema = HISTORY_TOOL_CONTRACTS.addUrl.zodInputSchema;
  private deleteRangeSchema = HISTORY_TOOL_CONTRACTS.deleteRange.zodInputSchema;
  private deleteUrlSchema = HISTORY_TOOL_CONTRACTS.deleteUrl.zodInputSchema;
  private getVisitsSchema = HISTORY_TOOL_CONTRACTS.getVisits.zodInputSchema;
  private searchSchema = HISTORY_TOOL_CONTRACTS.search.zodInputSchema;
}
