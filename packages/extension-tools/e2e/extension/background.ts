/// <reference types="chrome" />

import { installServerRuntimeContract } from '../../../../e2e/runtime-contract/server-contract.js';
import { ExtensionServerTransport } from '../../../transports/src/index.ts';
import { McpServer } from '../../../webmcp-ts-sdk/src/index.ts';
import { BookmarksApiTools } from '../../src/chrome-apis/BookmarksApiTools.ts';
import { HistoryApiTools } from '../../src/chrome-apis/HistoryApiTools.ts';
import { StorageApiTools } from '../../src/chrome-apis/StorageApiTools.ts';
import { TabGroupsApiTools } from '../../src/chrome-apis/TabGroupsApiTools.ts';
import { TabsApiTools, type TabsApiToolsOptions } from '../../src/chrome-apis/TabsApiTools.ts';
import { WindowsApiTools } from '../../src/chrome-apis/WindowsApiTools.ts';

const debugState = {
  events: [] as string[],
};

function recordDebugEvent(event: string) {
  debugState.events.push(event);
  if (debugState.events.length > 100) {
    debugState.events.shift();
  }
}

recordDebugEvent('background:loaded');

let server: McpServer | null = null;
let runtimeContract: ReturnType<typeof installServerRuntimeContract> | null = null;
let startupError: string | null = null;
let directApiToolsRegistered = false;
let bookmarkApiToolsRegistered = false;
let historyApiToolsRegistered = false;
let storageApiToolsRegistered = false;
let tabGroupsApiToolsRegistered = false;
let tabsApiToolsRegistered = false;
let windowsApiToolsRegistered = false;

const TAB_CONFORMANCE_TOOLS: TabsApiToolsOptions = {
  listActiveTabs: true,
  createTab: true,
  updateTab: true,
  closeTabs: true,
  getAllTabs: true,
  navigateHistory: false,
  reloadTab: true,
  captureVisibleTab: false,
  detectLanguage: true,
  discardTab: false,
  duplicateTab: true,
  getTab: true,
  getZoom: true,
  getZoomSettings: true,
  setZoom: true,
  setZoomSettings: true,
  groupTabs: false,
  ungroupTabs: false,
  highlightTabs: true,
  moveTabs: true,
  sendMessage: false,
};

const TAB_GROUPS_CONFORMANCE_TAB_TOOLS: TabsApiToolsOptions = {
  listActiveTabs: false,
  createTab: true,
  updateTab: false,
  closeTabs: true,
  getAllTabs: false,
  navigateHistory: false,
  reloadTab: false,
  captureVisibleTab: false,
  detectLanguage: false,
  discardTab: false,
  duplicateTab: false,
  getTab: false,
  getZoom: false,
  getZoomSettings: false,
  setZoom: false,
  setZoomSettings: false,
  groupTabs: true,
  ungroupTabs: true,
  highlightTabs: false,
  moveTabs: false,
  sendMessage: false,
};

try {
  server = new McpServer({
    name: 'extension-runtime-contract',
    version: '1.0.0',
  });
  recordDebugEvent('server:created');
  runtimeContract = installServerRuntimeContract(server, { runtimeLabel: 'extension' });
  recordDebugEvent('runtime-contract:installed');
} catch (error) {
  startupError = error instanceof Error ? error.message : String(error);
  recordDebugEvent(`startup:error:${startupError}`);
}

async function handleControlMessage(message: { action?: string; name?: string }) {
  if (startupError) {
    return { ok: false, error: `Extension runtime startup failed: ${startupError}` };
  }

  if (!runtimeContract) {
    return { ok: false, error: 'Extension runtime contract is not available' };
  }

  switch (message.action) {
    case 'isReady':
      return { ok: true, value: runtimeContract.isReady() };
    case 'registerDynamicTool':
      return { ok: true, value: runtimeContract.registerDynamicTool() };
    case 'unregisterDynamicTool':
      return { ok: true, value: runtimeContract.unregisterDynamicTool(message.name) };
    case 'readInvocations':
      return { ok: true, value: runtimeContract.readInvocations() };
    case 'resetInvocations':
      runtimeContract.resetInvocations();
      return { ok: true, value: true };
    case 'registerDirectApiTools':
      if (!server) {
        return { ok: false, error: 'MCP server is not available' };
      }
      if (!directApiToolsRegistered) {
        new StorageApiTools(server).register();
        new TabsApiTools(server, TAB_CONFORMANCE_TOOLS).register();
        directApiToolsRegistered = true;
      }
      return { ok: true, value: true };
    case 'registerBookmarkApiTools':
      if (!server) {
        return { ok: false, error: 'MCP server is not available' };
      }
      if (!bookmarkApiToolsRegistered) {
        new BookmarksApiTools(server).register();
        bookmarkApiToolsRegistered = true;
      }
      return { ok: true, value: true };
    case 'registerHistoryApiTools':
      if (!server) {
        return { ok: false, error: 'MCP server is not available' };
      }
      if (!historyApiToolsRegistered) {
        new HistoryApiTools(server).register();
        historyApiToolsRegistered = true;
      }
      return { ok: true, value: true };
    case 'registerStorageApiTools':
      if (!server) {
        return { ok: false, error: 'MCP server is not available' };
      }
      if (!storageApiToolsRegistered) {
        new StorageApiTools(server).register();
        storageApiToolsRegistered = true;
      }
      return { ok: true, value: true };
    case 'registerTabsApiTools':
      if (!server) {
        return { ok: false, error: 'MCP server is not available' };
      }
      if (!tabsApiToolsRegistered) {
        new TabsApiTools(server, TAB_CONFORMANCE_TOOLS).register();
        tabsApiToolsRegistered = true;
      }
      return { ok: true, value: true };
    case 'registerTabGroupsApiTools':
      if (!server) {
        return { ok: false, error: 'MCP server is not available' };
      }
      if (!tabGroupsApiToolsRegistered) {
        new TabGroupsApiTools(server).register();
        new TabsApiTools(server, TAB_GROUPS_CONFORMANCE_TAB_TOOLS).register();
        tabGroupsApiToolsRegistered = true;
      }
      return { ok: true, value: true };
    case 'registerWindowsApiTools':
      if (!server) {
        return { ok: false, error: 'MCP server is not available' };
      }
      if (!windowsApiToolsRegistered) {
        new WindowsApiTools(server).register();
        windowsApiToolsRegistered = true;
      }
      return { ok: true, value: true };
    default:
      return { ok: false, error: `Unknown control action: ${String(message.action)}` };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'runtime-contract/control') {
    return false;
  }

  recordDebugEvent(`control:${String(message.action)}`);

  void handleControlMessage(message)
    .then((response) => {
      sendResponse(response);
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });

  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'mcp') {
    recordDebugEvent(`port:ignored:${port.name}`);
    return;
  }

  if (startupError || !server) {
    recordDebugEvent(`port:startup-error:${startupError ?? 'missing server'}`);
    port.disconnect();
    return;
  }

  recordDebugEvent('port:connected');
  port.onMessage.addListener((message) => {
    const method =
      message && typeof message === 'object' && 'method' in message
        ? String((message as { method?: unknown }).method)
        : undefined;
    recordDebugEvent(`port:message:${method ?? 'unknown'}`);
  });
  port.onDisconnect.addListener(() => {
    recordDebugEvent('port:disconnected');
  });
  const transport = new ExtensionServerTransport(port, {
    keepAliveInterval: 500,
  });
  transport.onerror = (error) => {
    recordDebugEvent(`transport:error:${error.message}`);
  };
  transport.onclose = () => {
    recordDebugEvent('transport:closed');
  };

  recordDebugEvent('server:connect:start');
  void server
    .connect(transport)
    .then(() => {
      recordDebugEvent('server:connect:ready');
    })
    .catch((error) => {
      recordDebugEvent(
        `server:connect:error:${error instanceof Error ? error.message : String(error)}`
      );
      console.error('[extension-runtime-contract] Failed to connect transport', error);
    });
});
