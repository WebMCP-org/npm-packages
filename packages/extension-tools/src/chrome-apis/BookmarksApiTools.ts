import type { McpServer } from '@mcp-b/webmcp-ts-sdk';

import { type ApiAvailability, BaseApiTools } from '../BaseApiTools';
import {
  BOOKMARK_ACTION_IDS,
  BOOKMARK_TOOL_CONTRACTS,
  type BookmarkCreateInput,
  type BookmarkGetChildrenInput,
  type BookmarkGetInput,
  type BookmarkGetRecentInput,
  type BookmarkGetSubTreeInput,
  type BookmarkMoveInput,
  type BookmarkRemoveInput,
  type BookmarkRemoveTreeInput,
  type BookmarkSearchInput,
  type BookmarkUpdateInput,
} from '../contracts/bookmarks';

export interface BookmarksApiToolsOptions {
  // Gate specific actions (default to enabled)
  create?: boolean;
  get?: boolean;
  getChildren?: boolean;
  getRecent?: boolean;
  getSubTree?: boolean;
  getTree?: boolean;
  move?: boolean;
  remove?: boolean;
  removeTree?: boolean;
  search?: boolean;
  update?: boolean;
}

export const BOOKMARK_ACTIONS = BOOKMARK_ACTION_IDS;

export class BookmarksApiTools extends BaseApiTools<BookmarksApiToolsOptions> {
  protected apiName = 'Bookmarks';

  constructor(server: McpServer, options: BookmarksApiToolsOptions = {}) {
    super(server, options);
  }

  checkAvailability(): ApiAvailability {
    try {
      if (!chrome.bookmarks) {
        return {
          available: false,
          message: 'chrome.bookmarks API is not defined',
          details: 'This extension needs the "bookmarks" permission in its manifest.json',
        };
      }

      if (typeof chrome.bookmarks.getTree !== 'function') {
        return {
          available: false,
          message: 'chrome.bookmarks.getTree is not available',
          details:
            'The bookmarks API appears to be partially available. Check manifest permissions.',
        };
      }

      chrome.bookmarks.getTree((_bookmarks) => {
        if (chrome.runtime.lastError) {
          throw new Error(chrome.runtime.lastError.message);
        }
      });

      return {
        available: true,
        message: 'Bookmarks API is fully available',
      };
    } catch (error) {
      return {
        available: false,
        message: 'Failed to access chrome.bookmarks API',
        details: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  registerTools(): void {
    if (this.shouldRegisterTool('create')) {
      this.registerExtensionTool(BOOKMARK_TOOL_CONTRACTS.create, (params) =>
        this.handleCreate(params)
      );
    }

    if (this.shouldRegisterTool('get')) {
      this.registerExtensionTool(BOOKMARK_TOOL_CONTRACTS.get, (params) => this.handleGet(params));
    }

    if (this.shouldRegisterTool('getChildren')) {
      this.registerExtensionTool(BOOKMARK_TOOL_CONTRACTS.getChildren, (params) =>
        this.handleGetChildren(params)
      );
    }

    if (this.shouldRegisterTool('getRecent')) {
      this.registerExtensionTool(BOOKMARK_TOOL_CONTRACTS.getRecent, (params) =>
        this.handleGetRecent(params)
      );
    }

    if (this.shouldRegisterTool('getSubTree')) {
      this.registerExtensionTool(BOOKMARK_TOOL_CONTRACTS.getSubTree, (params) =>
        this.handleGetSubTree(params)
      );
    }

    if (this.shouldRegisterTool('getTree')) {
      this.registerExtensionTool(BOOKMARK_TOOL_CONTRACTS.getTree, () => this.handleGetTree());
    }

    if (this.shouldRegisterTool('move')) {
      this.registerExtensionTool(BOOKMARK_TOOL_CONTRACTS.move, (params) => this.handleMove(params));
    }

    if (this.shouldRegisterTool('remove')) {
      this.registerExtensionTool(BOOKMARK_TOOL_CONTRACTS.remove, (params) =>
        this.handleRemove(params)
      );
    }

    if (this.shouldRegisterTool('removeTree')) {
      this.registerExtensionTool(BOOKMARK_TOOL_CONTRACTS.removeTree, (params) =>
        this.handleRemoveTree(params)
      );
    }

    if (this.shouldRegisterTool('search')) {
      this.registerExtensionTool(BOOKMARK_TOOL_CONTRACTS.search, (params) =>
        this.handleSearch(params)
      );
    }

    if (this.shouldRegisterTool('update')) {
      this.registerExtensionTool(BOOKMARK_TOOL_CONTRACTS.update, (params) =>
        this.handleUpdate(params)
      );
    }
  }

  // ===== Action handlers =====
  private async handleCreate({ parentId, title, url, index }: BookmarkCreateInput) {
    if (title === undefined && url === undefined) {
      throw new Error('Either title or url must be provided');
    }
    if (title?.length === 0 && url?.length === 0) {
      throw new Error('Either title or url must be provided');
    }
    const createDetails: chrome.bookmarks.CreateDetails = {};
    if (parentId !== undefined) createDetails.parentId = parentId;
    if (title !== undefined) createDetails.title = title;
    if (url !== undefined) createDetails.url = url;
    if (index !== undefined) createDetails.index = index;

    const result = await chrome.bookmarks.create(createDetails);

    return this.formatJson(result);
  }

  private async handleGet({ idOrIdList }: BookmarkGetInput) {
    const results = await chrome.bookmarks.get(this.toBookmarkIdRequest(idOrIdList));

    return this.formatJson(results);
  }

  private async handleGetChildren({ id }: BookmarkGetChildrenInput) {
    const results = await chrome.bookmarks.getChildren(id);

    return this.formatJson(results);
  }

  private async handleGetRecent({ numberOfItems }: BookmarkGetRecentInput) {
    const results = await chrome.bookmarks.getRecent(numberOfItems);

    return this.formatJson(results);
  }

  private async handleGetSubTree({ id }: BookmarkGetSubTreeInput) {
    const results = await chrome.bookmarks.getSubTree(id);

    return this.formatJson(results);
  }

  private async handleGetTree() {
    const results = await chrome.bookmarks.getTree();

    return this.formatJson(results);
  }

  private async handleMove({ id, parentId, index }: BookmarkMoveInput) {
    const destination: chrome.bookmarks.MoveDestination = {};
    if (parentId !== undefined) destination.parentId = parentId;
    if (index !== undefined) destination.index = index;

    const result = await chrome.bookmarks.move(id, destination);

    return this.formatJson(result);
  }

  private async handleRemove({ id }: BookmarkRemoveInput) {
    await chrome.bookmarks.remove(id);
    return this.formatSuccess('Bookmark removed successfully');
  }

  private async handleRemoveTree({ id }: BookmarkRemoveTreeInput) {
    await chrome.bookmarks.removeTree(id);
    return this.formatSuccess('Bookmark folder and all contents removed successfully');
  }

  private async handleSearch({ query }: BookmarkSearchInput) {
    const results = await chrome.bookmarks.search(this.toBookmarkSearchQuery(query));

    return this.formatJson(results);
  }

  private async handleUpdate({ id, title, url }: BookmarkUpdateInput) {
    const changes: chrome.bookmarks.UpdateChanges = {};
    if (title !== undefined) changes.title = title;
    if (url !== undefined) changes.url = url;

    if (Object.keys(changes).length === 0) {
      return this.formatError('At least one property (title or url) must be specified to update');
    }

    const result = await chrome.bookmarks.update(id, changes);

    return this.formatJson(result);
  }

  private toBookmarkIdRequest(idOrIdList: string | string[]): string | [string, ...string[]] {
    if (typeof idOrIdList === 'string') {
      return idOrIdList;
    }

    const [firstId, ...remainingIds] = idOrIdList;
    if (firstId === undefined) {
      throw new Error('At least one bookmark id is required');
    }

    return [firstId, ...remainingIds];
  }

  private toBookmarkSearchQuery(
    query:
      | string
      | { query?: string | undefined; title?: string | undefined; url?: string | undefined }
  ): string | chrome.bookmarks.SearchQuery {
    if (typeof query === 'string') {
      return query;
    }

    const searchQuery: chrome.bookmarks.SearchQuery = {};
    if (query.query !== undefined) searchQuery.query = query.query;
    if (query.title !== undefined) searchQuery.title = query.title;
    if (query.url !== undefined) searchQuery.url = query.url;
    return searchQuery;
  }
}
