import { BookmarksApiTools, TabsApiTools } from '@mcp-b/extension-tools';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const server = new McpServer({ name: 'my-extension', version: '1.0.0' });

const tabs = new TabsApiTools(server, { listActiveTabs: true, createTab: true });
tabs.register();

const bookmarks = new BookmarksApiTools(server, { getBookmarks: true });
bookmarks.register();
