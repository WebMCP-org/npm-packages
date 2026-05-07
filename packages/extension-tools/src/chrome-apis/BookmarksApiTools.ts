import type { McpServer } from '@mcp-b/webmcp-ts-sdk';

import { type ApiAvailability, BaseApiTools } from '../BaseApiTools';
import { BOOKMARK_ACTION_IDS, BOOKMARK_TOOL_CONTRACTS } from '../contracts/bookmarks';

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

  // ===== Validation Schemas per action =====
  private createSchema = BOOKMARK_TOOL_CONTRACTS.create.zodInputSchema;
  private getSchema = BOOKMARK_TOOL_CONTRACTS.get.zodInputSchema;
  private getChildrenSchema = BOOKMARK_TOOL_CONTRACTS.getChildren.zodInputSchema;
  private getRecentSchema = BOOKMARK_TOOL_CONTRACTS.getRecent.zodInputSchema;
  private getSubTreeSchema = BOOKMARK_TOOL_CONTRACTS.getSubTree.zodInputSchema;
  private moveSchema = BOOKMARK_TOOL_CONTRACTS.move.zodInputSchema;
  private removeSchema = BOOKMARK_TOOL_CONTRACTS.remove.zodInputSchema;
  private removeTreeSchema = BOOKMARK_TOOL_CONTRACTS.removeTree.zodInputSchema;
  private searchSchema = BOOKMARK_TOOL_CONTRACTS.search.zodInputSchema;
  private updateSchema = BOOKMARK_TOOL_CONTRACTS.update.zodInputSchema;

  // ===== Action handlers =====
  private async handleCreate(raw: unknown) {
    const { parentId, title, url, index } = this.createSchema.parse(raw);
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

    const result = await new Promise<chrome.bookmarks.BookmarkTreeNode>((resolve, reject) => {
      chrome.bookmarks.create(createDetails, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(res);
      });
    });

    return this.formatJson({
      id: result.id,
      title: result.title,
      url: result.url,
      parentId: result.parentId,
      index: result.index,
      dateAdded: result.dateAdded,
      type: result.url ? 'bookmark' : 'folder',
    });
  }

  private async handleGet(raw: unknown) {
    const { idOrIdList } = this.getSchema.parse(raw);
    const results = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve, reject) => {
      chrome.bookmarks.get(idOrIdList as any, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(res);
      });
    });

    return this.formatJson({
      count: results.length,
      bookmarks: results.map((bookmark) => ({
        id: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        parentId: bookmark.parentId,
        index: bookmark.index,
        dateAdded: bookmark.dateAdded,
        dateAddedFormatted: bookmark.dateAdded
          ? new Date(bookmark.dateAdded).toISOString()
          : undefined,
        type: bookmark.url ? 'bookmark' : 'folder',
      })),
    });
  }

  private async handleGetChildren(raw: unknown) {
    const { id } = this.getChildrenSchema.parse(raw);
    const results = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve, reject) => {
      chrome.bookmarks.getChildren(id, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(res);
      });
    });

    return this.formatJson({
      parentId: id,
      count: results.length,
      children: results.map((bookmark) => ({
        id: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        parentId: bookmark.parentId,
        index: bookmark.index,
        dateAdded: bookmark.dateAdded,
        dateAddedFormatted: bookmark.dateAdded
          ? new Date(bookmark.dateAdded).toISOString()
          : undefined,
        type: bookmark.url ? 'bookmark' : 'folder',
      })),
    });
  }

  private async handleGetRecent(raw: unknown) {
    const { numberOfItems } = this.getRecentSchema.parse(raw);
    const results = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve, reject) => {
      chrome.bookmarks.getRecent(numberOfItems, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(res);
      });
    });

    return this.formatJson({
      count: results.length,
      recentBookmarks: results.map((bookmark) => ({
        id: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        parentId: bookmark.parentId,
        index: bookmark.index,
        dateAdded: bookmark.dateAdded,
        dateAddedFormatted: bookmark.dateAdded
          ? new Date(bookmark.dateAdded).toISOString()
          : undefined,
      })),
    });
  }

  private async handleGetSubTree(raw: unknown) {
    const { id } = this.getSubTreeSchema.parse(raw);
    const results = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve, reject) => {
      chrome.bookmarks.getSubTree(id, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(res);
      });
    });

    const formatNode = (node: chrome.bookmarks.BookmarkTreeNode): any => ({
      id: node.id,
      title: node.title,
      url: node.url,
      parentId: node.parentId,
      index: node.index,
      dateAdded: node.dateAdded,
      dateAddedFormatted: node.dateAdded ? new Date(node.dateAdded).toISOString() : undefined,
      type: node.url ? 'bookmark' : 'folder',
      children: node.children ? node.children.map(formatNode) : undefined,
    });

    return this.formatJson({
      rootId: id,
      subtree: results.map(formatNode),
    });
  }

  private async handleGetTree() {
    const results = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve, reject) => {
      chrome.bookmarks.getTree((res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(res);
      });
    });

    const formatNode = (node: chrome.bookmarks.BookmarkTreeNode): any => ({
      id: node.id,
      title: node.title,
      url: node.url,
      parentId: node.parentId,
      index: node.index,
      dateAdded: node.dateAdded,
      dateAddedFormatted: node.dateAdded ? new Date(node.dateAdded).toISOString() : undefined,
      type: node.url ? 'bookmark' : 'folder',
      children: node.children ? node.children.map(formatNode) : undefined,
    });

    return this.formatJson({
      tree: results.map(formatNode),
    });
  }

  private async handleMove(raw: unknown) {
    const { id, parentId, index } = this.moveSchema.parse(raw);
    const destination: { parentId?: string; index?: number } = {};
    if (parentId !== undefined) destination.parentId = parentId;
    if (index !== undefined) destination.index = index;

    const result = await new Promise<chrome.bookmarks.BookmarkTreeNode>((resolve, reject) => {
      chrome.bookmarks.move(id, destination, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(res);
      });
    });

    return this.formatSuccess('Bookmark moved successfully', {
      id: result.id,
      title: result.title,
      url: result.url,
      parentId: result.parentId,
      index: result.index,
      type: result.url ? 'bookmark' : 'folder',
    });
  }

  private async handleRemove(raw: unknown) {
    const { id } = this.removeSchema.parse(raw);
    await new Promise<void>((resolve, reject) => {
      chrome.bookmarks.remove(id, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    });
    return this.formatSuccess('Bookmark removed successfully', { id });
  }

  private async handleRemoveTree(raw: unknown) {
    const { id } = this.removeTreeSchema.parse(raw);
    await new Promise<void>((resolve, reject) => {
      chrome.bookmarks.removeTree(id, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    });
    return this.formatSuccess('Bookmark folder and all contents removed successfully', { id });
  }

  private async handleSearch(raw: unknown) {
    const { query } = this.searchSchema.parse(raw);
    const results = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve, reject) => {
      chrome.bookmarks.search(query as any, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(res);
      });
    });

    return this.formatJson({
      query: typeof query === 'string' ? query : JSON.stringify(query),
      count: results.length,
      results: results.map((bookmark) => ({
        id: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        parentId: bookmark.parentId,
        index: bookmark.index,
        dateAdded: bookmark.dateAdded,
        dateAddedFormatted: bookmark.dateAdded
          ? new Date(bookmark.dateAdded).toISOString()
          : undefined,
        type: bookmark.url ? 'bookmark' : 'folder',
      })),
    });
  }

  private async handleUpdate(raw: unknown) {
    const { id, title, url } = this.updateSchema.parse(raw);
    const changes: { title?: string; url?: string } = {};
    if (title !== undefined) changes.title = title;
    if (url !== undefined) changes.url = url;

    if (Object.keys(changes).length === 0) {
      return this.formatError('At least one property (title or url) must be specified to update');
    }

    const result = await new Promise<chrome.bookmarks.BookmarkTreeNode>((resolve, reject) => {
      chrome.bookmarks.update(id, changes, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(res);
      });
    });

    return this.formatSuccess('Bookmark updated successfully', {
      id: result.id,
      title: result.title,
      url: result.url,
      parentId: result.parentId,
      index: result.index,
      type: result.url ? 'bookmark' : 'folder',
      changes,
    });
  }
}
