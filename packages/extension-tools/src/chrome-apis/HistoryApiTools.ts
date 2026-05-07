import type { McpServer } from '@mcp-b/webmcp-ts-sdk';
import { z } from 'zod';

import { type ApiAvailability, BaseApiTools } from '../BaseApiTools';

export interface HistoryApiToolsOptions {
  addUrl?: boolean;
  deleteAll?: boolean;
  deleteRange?: boolean;
  deleteUrl?: boolean;
  getVisits?: boolean;
  search?: boolean;
}

export const HISTORY_ACTIONS = [
  'addUrl',
  'deleteAll',
  'deleteRange',
  'deleteUrl',
  'getVisits',
  'search',
] as const;

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
      this.registerExtensionTool(
        'extension_tool_add_history_url',
        'Add a URL to the history at the current time with a transition type of "link"',
        this.addUrlSchema.shape,
        (params) => this.handleAddUrl(params)
      );
    }

    if (this.shouldRegisterTool('deleteAll')) {
      this.registerExtensionTool(
        'extension_tool_delete_all_history',
        'Delete all items from the browser history',
        this.deleteAllSchema.shape,
        () => this.handleDeleteAll()
      );
    }

    if (this.shouldRegisterTool('deleteRange')) {
      this.registerExtensionTool(
        'extension_tool_delete_history_range',
        'Remove all items within the specified date range from history. Pages will not be removed unless all visits fall within the range',
        this.deleteRangeSchema.shape,
        (params) => this.handleDeleteRange(params)
      );
    }

    if (this.shouldRegisterTool('deleteUrl')) {
      this.registerExtensionTool(
        'extension_tool_delete_history_url',
        'Remove all occurrences of the given URL from history',
        this.deleteUrlSchema.shape,
        (params) => this.handleDeleteUrl(params)
      );
    }

    if (this.shouldRegisterTool('getVisits')) {
      this.registerExtensionTool(
        'extension_tool_get_history_visits',
        'Retrieve information about visits to a specific URL',
        this.getVisitsSchema.shape,
        (params) => this.handleGetVisits(params)
      );
    }

    if (this.shouldRegisterTool('search')) {
      this.registerExtensionTool(
        'extension_tool_search_history',
        'Search the history for the last visit time of each page matching the query',
        this.searchSchema.shape,
        (params) => this.handleSearch(params)
      );
    }
  }

  // ===== Action handlers =====
  private async handleAddUrl(raw: unknown) {
    const { url } = this.addUrlSchema.parse(raw);
    await chrome.history.addUrl({ url });
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
  private addUrlSchema = z.object({
    url: z.string().url().describe('The URL to add to history. Must be a valid URL format'),
  });

  private deleteAllSchema = z.object({});

  private deleteRangeSchema = z.object({
    startTime: z
      .number()
      .describe(
        'Items added to history after this date, represented in milliseconds since the epoch'
      ),
    endTime: z
      .number()
      .describe(
        'Items added to history before this date, represented in milliseconds since the epoch'
      ),
  });

  private deleteUrlSchema = z.object({
    url: z
      .string()
      .url()
      .describe(
        'The URL to remove from history. Must be in the format as returned from a call to history.search()'
      ),
  });

  private getVisitsSchema = z.object({
    url: z
      .string()
      .url()
      .describe(
        'The URL to get visit information for. Must be in the format as returned from a call to history.search()'
      ),
  });

  private searchSchema = z.object({
    text: z
      .string()
      .describe('A free-text query to the history service. Leave empty to retrieve all pages'),
    startTime: z
      .number()
      .optional()
      .describe(
        'Limit results to those visited after this date, represented in milliseconds since the epoch. Defaults to 24 hours ago if not specified'
      ),
    endTime: z
      .number()
      .optional()
      .describe(
        'Limit results to those visited before this date, represented in milliseconds since the epoch'
      ),
    maxResults: z
      .number()
      .min(1)
      .max(1000)
      .optional()
      .describe('The maximum number of results to retrieve. Defaults to 100'),
  });
}
