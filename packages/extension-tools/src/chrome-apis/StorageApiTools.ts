import type { McpServer } from '@mcp-b/webmcp-ts-sdk';

import { type ApiAvailability, BaseApiTools } from '../BaseApiTools';
import {
  STORAGE_ACTION_IDS,
  STORAGE_AREA_SCHEMA,
  STORAGE_TOOL_CONTRACTS,
  type StorageClearInput,
  type StorageGetBytesInUseInput,
  type StorageGetInput,
  type StorageRemoveInput,
  type StorageSetInput,
} from '../contracts/storage';

export interface StorageApiToolsOptions {
  getStorage?: boolean;
  setStorage?: boolean;
  removeStorage?: boolean;
  clearStorage?: boolean;
  getBytesInUse?: boolean;
}

export const STORAGE_ACTIONS = STORAGE_ACTION_IDS;
type StorageAreaName = StorageGetInput['area'];
type WritableStorageArea =
  | chrome.storage.LocalStorageArea
  | chrome.storage.SessionStorageArea
  | chrome.storage.SyncStorageArea;

export class StorageApiTools extends BaseApiTools<StorageApiToolsOptions> {
  protected apiName = 'Storage';

  constructor(server: McpServer, options: StorageApiToolsOptions = {}) {
    super(server, options);
  }

  checkAvailability(): ApiAvailability {
    try {
      // Test basic storage API access
      if (!chrome.storage) {
        return {
          available: false,
          message: 'chrome.storage API is not defined',
          details:
            'This extension needs the "storage" permission in its manifest.json to access storage',
        };
      }

      // Check which storage areas are available
      const availableAreas: string[] = [];
      if (chrome.storage.local) availableAreas.push('local');
      if (chrome.storage.sync) availableAreas.push('sync');
      if (chrome.storage.session) availableAreas.push('session');
      if (chrome.storage.managed) availableAreas.push('managed');

      if (availableAreas.length === 0) {
        return {
          available: false,
          message: 'No storage areas are available',
          details: 'The storage API is present but no storage areas can be accessed',
        };
      }

      // Test actual functionality
      chrome.storage.local.get(null, () => {
        if (chrome.runtime.lastError) {
          throw new Error(chrome.runtime.lastError.message);
        }
      });

      return {
        available: true,
        message: `Storage API is available with areas: ${availableAreas.join(', ')}`,
      };
    } catch (error) {
      return {
        available: false,
        message: 'Failed to access chrome.storage API',
        details: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  registerTools(): void {
    if (this.shouldRegisterTool('getStorage')) {
      this.registerExtensionTool(STORAGE_TOOL_CONTRACTS.getStorage, (params) =>
        this.handleGetStorage(params)
      );
    }

    if (this.shouldRegisterTool('setStorage')) {
      this.registerExtensionTool(STORAGE_TOOL_CONTRACTS.setStorage, (params) =>
        this.handleSetStorage(params)
      );
    }

    if (this.shouldRegisterTool('removeStorage')) {
      this.registerExtensionTool(STORAGE_TOOL_CONTRACTS.removeStorage, (params) =>
        this.handleRemoveStorage(params)
      );
    }

    if (this.shouldRegisterTool('clearStorage')) {
      this.registerExtensionTool(STORAGE_TOOL_CONTRACTS.clearStorage, (params) =>
        this.handleClearStorage(params)
      );
    }

    if (this.shouldRegisterTool('getBytesInUse')) {
      this.registerExtensionTool(STORAGE_TOOL_CONTRACTS.getBytesInUse, (params) =>
        this.handleGetBytesInUse(params)
      );
    }
  }

  // ===== Action handlers =====
  private async handleGetStorage({ keys, area }: StorageGetInput) {
    const storage = this.getStorageArea(area);
    if (!storage || typeof storage.get !== 'function') {
      return this.formatError(new Error(`Storage area '${area}' is not available`));
    }

    const data = await storage.get(keys || null);

    // Format the response with metadata
    const response = {
      area,
      data,
      keyCount: Object.keys(data).length,
    };

    return this.formatJson(response);
  }

  private async handleSetStorage({ data, area }: StorageSetInput) {
    const storage = this.getStorageArea(area);
    if (!storage || typeof storage.set !== 'function') {
      return this.formatError(new Error(`Storage area '${area}' is not available`));
    }

    await storage.set(data);

    return this.formatSuccess(`Stored ${Object.keys(data).length} key(s) in ${area} storage`, {
      keys: Object.keys(data),
    });
  }

  private async handleRemoveStorage({ keys, area }: StorageRemoveInput) {
    const storage = this.getStorageArea(area);
    if (!storage || typeof storage.remove !== 'function') {
      return this.formatError(new Error(`Storage area '${area}' is not available`));
    }

    await storage.remove(keys);

    return this.formatSuccess(`Removed ${keys.length} key(s) from ${area} storage`, { keys });
  }

  private async handleClearStorage({ area, confirm }: StorageClearInput) {
    if (!confirm) {
      return this.formatError(
        new Error('Clear operation requires confirm=true to prevent accidental data loss')
      );
    }

    const storage = this.getStorageArea(area);
    if (!storage || typeof storage.clear !== 'function') {
      return this.formatError(new Error(`Storage area '${area}' is not available`));
    }

    await storage.clear();

    return this.formatSuccess(`Cleared all data from ${area} storage`);
  }

  private async handleGetBytesInUse({ keys, area }: StorageGetBytesInUseInput) {
    const storage = this.getStorageArea(area);
    if (!storage) {
      return this.formatError(new Error(`Storage area '${area}' is not available`));
    }

    // Not all storage areas support getBytesInUse
    if (typeof storage.getBytesInUse !== 'function') {
      return this.formatError(new Error(`getBytesInUse is not supported for ${area} storage area`));
    }

    const bytesInUse = await storage.getBytesInUse(keys || null);

    // Get quota info if available
    let quotaInfo = null;
    if (area === 'sync' && chrome.storage.sync.QUOTA_BYTES) {
      quotaInfo = {
        quotaBytes: chrome.storage.sync.QUOTA_BYTES,
        quotaBytesPerItem: chrome.storage.sync.QUOTA_BYTES_PER_ITEM,
        maxItems: chrome.storage.sync.MAX_ITEMS,
        maxWriteOperationsPerHour: chrome.storage.sync.MAX_WRITE_OPERATIONS_PER_HOUR,
        maxWriteOperationsPerMinute: chrome.storage.sync.MAX_WRITE_OPERATIONS_PER_MINUTE,
      };
    } else if (area === 'local' && chrome.storage.local.QUOTA_BYTES) {
      quotaInfo = {
        quotaBytes: chrome.storage.local.QUOTA_BYTES,
      };
    }

    return this.formatJson({
      area,
      bytesInUse,
      humanReadable: this.formatBytes(bytesInUse),
      quota: quotaInfo,
      percentageUsed: quotaInfo?.quotaBytes
        ? `${((bytesInUse / quotaInfo.quotaBytes) * 100).toFixed(2)}%`
        : null,
    });
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  }

  private getStorageArea(area: StorageAreaName): WritableStorageArea | undefined {
    if (!STORAGE_AREA_SCHEMA.safeParse(area).success) {
      return undefined;
    }

    return chrome.storage[area];
  }
}
