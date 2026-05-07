import type { McpServer } from '@mcp-b/webmcp-ts-sdk';
import { z } from 'zod';

import { type ApiAvailability, BaseApiTools } from '../BaseApiTools';

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

export const BOOKMARK_ACTIONS = [
  'create',
  'get',
  'getChildren',
  'getRecent',
  'getSubTree',
  'getTree',
  'move',
  'remove',
  'removeTree',
  'search',
  'update',
] as const;

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
      this.registerExtensionTool(
        'extension_tool_create_bookmark',
        'Create a bookmark or folder under the specified parent. A folder must have a title and no url',
        this.createSchema.shape,
        (params) => this.handleCreate(params)
      );
    }

    if (this.shouldRegisterTool('get')) {
      this.registerExtensionTool(
        'extension_tool_get_bookmarks',
        'Retrieve the specified bookmark(s) by ID',
        this.getSchema.shape,
        (params) => this.handleGet(params)
      );
    }

    if (this.shouldRegisterTool('getChildren')) {
      this.registerExtensionTool(
        'extension_tool_get_bookmark_children',
        'Retrieve the children of the specified bookmark folder',
        this.getChildrenSchema.shape,
        (params) => this.handleGetChildren(params)
      );
    }

    if (this.shouldRegisterTool('getRecent')) {
      this.registerExtensionTool(
        'extension_tool_get_recent_bookmarks',
        'Retrieve the recently added bookmarks',
        this.getRecentSchema.shape,
        (params) => this.handleGetRecent(params)
      );
    }

    if (this.shouldRegisterTool('getSubTree')) {
      this.registerExtensionTool(
        'extension_tool_get_bookmark_subtree',
        'Retrieve part of the bookmarks hierarchy, starting at the specified node',
        this.getSubTreeSchema.shape,
        (params) => this.handleGetSubTree(params)
      );
    }

    if (this.shouldRegisterTool('getTree')) {
      this.registerExtensionTool(
        'extension_tool_get_bookmark_tree',
        'Retrieve the entire bookmarks hierarchy',
        {},
        () => this.handleGetTree()
      );
    }

    if (this.shouldRegisterTool('move')) {
      this.registerExtensionTool(
        'extension_tool_move_bookmark',
        'Move the specified bookmark or folder to a new location',
        this.moveSchema.shape,
        (params) => this.handleMove(params)
      );
    }

    if (this.shouldRegisterTool('remove')) {
      this.registerExtensionTool(
        'extension_tool_remove_bookmark',
        'Remove the specified bookmark or empty folder',
        this.removeSchema.shape,
        (params) => this.handleRemove(params)
      );
    }

    if (this.shouldRegisterTool('removeTree')) {
      this.registerExtensionTool(
        'extension_tool_remove_bookmark_tree',
        'Recursively remove a bookmark folder and all its contents',
        this.removeTreeSchema.shape,
        (params) => this.handleRemoveTree(params)
      );
    }

    if (this.shouldRegisterTool('search')) {
      this.registerExtensionTool(
        'extension_tool_search_bookmarks',
        'Search for bookmarks matching the given query',
        this.searchSchema.shape,
        (params) => this.handleSearch(params)
      );
    }

    if (this.shouldRegisterTool('update')) {
      this.registerExtensionTool(
        'extension_tool_update_bookmark',
        'Update the properties of a bookmark or folder. Only title and url can be changed',
        this.updateSchema.shape,
        (params) => this.handleUpdate(params)
      );
    }
  }

  // ===== Validation Schemas per action =====
  private createSchema = z.object({
    parentId: z
      .string()
      .optional()
      .describe('Parent folder ID. Defaults to the Other Bookmarks folder'),
    title: z.string().optional().describe('The title of the bookmark or folder'),
    url: z.string().optional().describe('The URL for the bookmark. Omit for folders'),
    index: z.number().optional().describe('The position within the parent folder'),
  });

  private getSchema = z.object({
    idOrIdList: z
      .union([z.string(), z.array(z.string())])
      .describe('A single bookmark ID or array of bookmark IDs'),
  });

  private getChildrenSchema = z.object({
    id: z.string().describe('The ID of the folder to get children from'),
  });

  private getRecentSchema = z.object({
    numberOfItems: z.number().min(1).describe('The maximum number of items to return'),
  });

  private getSubTreeSchema = z.object({
    id: z.string().describe('The ID of the root of the subtree to retrieve'),
  });

  private moveSchema = z.object({
    id: z.string().describe('The ID of the bookmark or folder to move'),
    parentId: z.string().optional().describe('The new parent folder ID'),
    index: z.number().optional().describe('The new position within the parent folder'),
  });

  private removeSchema = z.object({
    id: z.string().describe('The ID of the bookmark or empty folder to remove'),
  });

  private removeTreeSchema = z.object({
    id: z.string().describe('The ID of the folder to remove recursively'),
  });

  private searchSchema = z.object({
    query: z.union([
      z.string(),
      z.object({
        query: z.string().optional().describe('Words and phrases to match against URLs and titles'),
        url: z.string().optional().describe('URL to match exactly'),
        title: z.string().optional().describe('Title to match exactly'),
      }),
    ]),
  });

  private updateSchema = z.object({
    id: z.string().describe('The ID of the bookmark or folder to update'),
    title: z.string().optional().describe('The new title'),
    url: z.string().optional().describe('The new URL (bookmarks only)'),
  });

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
