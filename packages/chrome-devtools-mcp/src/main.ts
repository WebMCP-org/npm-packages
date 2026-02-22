/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';

import './polyfill.js';

import type {Channel} from './browser.js';
import {connectToNewBrowser, disconnectBrowser, ensureBrowserConnected, ensureBrowserLaunched} from './browser.js';
import {parseArguments} from './cli.js';
import {loadIssueDescriptions} from './issue-descriptions.js';
import {logger, saveLogsToFile} from './logger.js';
import {McpContext} from './McpContext.js';
import {McpResponse} from './McpResponse.js';
import {Mutex} from './Mutex.js';
import {
  McpServer,
  StdioServerTransport,
  type CallToolResult,
  SetLevelRequestSchema,
  zod,
} from './third_party/index.js';
import {registerPrompts} from './prompts/index.js';
import {ToolCategory} from './tools/categories.js';
import type {ToolDefinition} from './tools/ToolDefinition.js';
import {tools} from './tools/tools.js';
import {WebMCPToolHub} from './tools/WebMCPToolHub.js';

/**
 * Package version (managed by release-please).
 * @remarks If moved, update release-please config.
 */
// x-release-please-start-version
const VERSION = '1.5.6';
// x-release-please-end

process.on('unhandledRejection', (reason, promise) => {
  logger('Unhandled promise rejection', promise, reason);
});

/**
 * Cleanup handler for graceful shutdown.
 * Closes the session window when the MCP server is killed.
 */
let isCleaningUp = false;
async function cleanup(): Promise<void> {
  if (isCleaningUp) return;
  isCleaningUp = true;

  logger('Shutting down MCP server...');

  if (context) {
    try {
      await context.closeSessionWindow();
    } catch (err) {
      logger('Error during cleanup:', err);
    }
  }

  process.exit(0);
}

// Handle various termination signals
process.on('SIGINT', () => {
  logger('Received SIGINT');
  cleanup();
});

process.on('SIGTERM', () => {
  logger('Received SIGTERM');
  cleanup();
});

process.on('SIGHUP', () => {
  logger('Received SIGHUP');
  cleanup();
});

export const args = parseArguments(VERSION);

const logFile = args.logFile ? saveLogsToFile(args.logFile) : undefined;

logger(`Starting Chrome DevTools MCP Server v${VERSION}`);
const server = new McpServer(
  {
    name: 'chrome_devtools',
    title: 'Chrome DevTools MCP server',
    version: VERSION,
  },
  {capabilities: {logging: {}, prompts: {}, tools: {listChanged: true}}},
);

// Register WebMCP development prompts
registerPrompts(server);
server.server.setRequestHandler(SetLevelRequestSchema, () => {
  return {};
});

/** Cached McpContext instance for the current browser. */
let context: McpContext;

/**
 * Get or create the McpContext for browser operations.
 *
 * Handles browser connection/launch with the following priority:
 * 1. Explicit browserUrl/wsEndpoint - connect directly
 * 2. autoConnect enabled - try connecting, fall back to launching
 * 3. Otherwise - launch a new browser
 *
 * @returns Initialized McpContext ready for tool operations.
 */
async function getContext(): Promise<McpContext> {
  const extraArgs: string[] = (args.chromeArg ?? []).map(String);
  if (args.proxyServer) {
    extraArgs.push(`--proxy-server=${args.proxyServer}`);
  }
  const devtools = args.experimentalDevtools ?? false;

  let browser: Awaited<ReturnType<typeof ensureBrowserConnected>>;
  let wasLaunched = false;

  // If explicit browserUrl or wsEndpoint is provided, connect without fallback
  if (args.browserUrl || args.wsEndpoint) {
    browser = await ensureBrowserConnected({
      browserURL: args.browserUrl,
      wsEndpoint: args.wsEndpoint,
      wsHeaders: args.wsHeaders,
      devtools,
      channel: undefined,
      userDataDir: args.userDataDir,
      includeExtensionPages: args.includeExtensionPages,
    });
  }
  // If autoConnect is true, try connecting first, then fall back to launching
  else if (args.autoConnect) {
    try {
      logger('Attempting to connect to running browser instance...');
      browser = await ensureBrowserConnected({
        browserURL: undefined,
        wsEndpoint: undefined,
        wsHeaders: undefined,
        devtools,
        channel: args.channel as Channel,
        userDataDir: args.userDataDir,
        includeExtensionPages: args.includeExtensionPages,
      });
      logger('Successfully connected to running browser instance');
    } catch (err) {
      logger('Failed to connect to running browser, launching new instance...', err);
      browser = await ensureBrowserLaunched({
        headless: args.headless,
        executablePath: args.executablePath,
        channel: args.channel as Channel,
        isolated: args.isolated ?? false,
        userDataDir: args.userDataDir,
        logFile,
        viewport: args.viewport,
        args: extraArgs,
        acceptInsecureCerts: args.acceptInsecureCerts,
        devtools,
        includeExtensionPages: args.includeExtensionPages,
      });
      wasLaunched = true;
    }
  }
  // Otherwise, just launch a new browser
  else {
    browser = await ensureBrowserLaunched({
      headless: args.headless,
      executablePath: args.executablePath,
      channel: args.channel as Channel,
      isolated: args.isolated ?? false,
      userDataDir: args.userDataDir,
      logFile,
      viewport: args.viewport,
      args: extraArgs,
      acceptInsecureCerts: args.acceptInsecureCerts,
      devtools,
      includeExtensionPages: args.includeExtensionPages,
    });
    wasLaunched = true;
  }

  if (context?.browser !== browser) {
    context = await McpContext.from(browser, logger, {
      experimentalDevToolsDebugging: devtools,
      experimentalIncludeAllPages: args.experimentalIncludeAllPages,
      includeExtensionPages: args.includeExtensionPages,
      onReconnect,
    });

    if (wasLaunched) {
      // Fresh browser launch - use the existing default page
      // Mark it as explicitly selected so this session stays pinned to it
      context.selectPage(context.getSelectedPage(), true);

      // Capture windowId for session scoping and resize the window
      try {
        const page = context.getSelectedPage();
        const windowId = await context.getWindowIdForPage(page);
        context.setSessionWindowId(windowId);
        logger(`Using existing window for this MCP session, windowId: ${windowId}`);

        // Resize to nearly full screen
        const browserTarget = browser.target();
        const cdpSession = await browserTarget.createCDPSession();
        await cdpSession.send('Browser.setWindowBounds', {
          windowId,
          bounds: {
            left: 20,
            top: 20,
            width: 1800,
            height: 1200,
            windowState: 'normal',
          },
        });
        await cdpSession.detach();
        logger('Resized window to nearly full screen');
      } catch (err) {
        // Non-fatal: window sizing is best-effort, but windowId capture is important
        logger('Failed to capture windowId or resize window:', err);
      }
    } else {
      // Connected to existing browser - create new window for isolation
      // This ensures multiple MCP clients don't step on each other's toes
      const {windowId} = await context.newWindow();
      context.setSessionWindowId(windowId);
      logger(`Created new window for this MCP session, windowId: ${windowId}`);
    }

    // Initialize WebMCP tool hub for dynamic tool registration
    const toolHub = new WebMCPToolHub(server, context);
    context.setToolHub(toolHub);
    logger('WebMCPToolHub initialized for dynamic tool registration');
  }
  return context;
}

/**
 * Reconnect callback invoked by the connect_to_browser tool.
 *
 * Tears down the current browser session and connects to a new browser,
 * rebuilding all infrastructure (McpContext, WebMCPToolHub, session window).
 * Retries connection with exponential backoff for browsers that are still starting.
 */
async function onReconnect(options: {
  browserURL?: string;
  wsEndpoint?: string;
  wsHeaders?: Record<string, string>;
  timeout?: number;
}): Promise<{
  pages: Array<{index: number; url: string; selected: boolean}>;
  wsEndpoint: string;
}> {
  const timeout = options.timeout ?? 30_000;
  const retryInterval = 2_000;
  const devtools = args.experimentalDevtools ?? false;

  // 1. Tear down old session
  if (context) {
    try {
      await context.closeSessionWindow();
    } catch (err) {
      logger('Error closing session window during reconnect:', err);
    }
    context.dispose();
  }
  disconnectBrowser();

  // 2. Retry loop to connect to new browser
  const deadline = Date.now() + timeout;
  let lastError: Error | undefined;

  while (Date.now() < deadline) {
    try {
      const newBrowser = await connectToNewBrowser({
        browserURL: options.browserURL,
        wsEndpoint: options.wsEndpoint,
        wsHeaders: options.wsHeaders,
        includeExtensionPages: args.includeExtensionPages,
      });

      // 3. Rebuild context
      context = await McpContext.from(newBrowser, logger, {
        experimentalDevToolsDebugging: devtools,
        experimentalIncludeAllPages: args.experimentalIncludeAllPages,
        includeExtensionPages: args.includeExtensionPages,
        onReconnect,
      });

      // 4. Create session window
      const {windowId} = await context.newWindow();
      context.setSessionWindowId(windowId);
      logger(`Reconnect: new session window ${windowId}`);

      // 5. Rebuild tool hub
      const toolHub = new WebMCPToolHub(server, context);
      context.setToolHub(toolHub);
      logger('Reconnect: WebMCPToolHub rebuilt');

      // 6. Build response
      const pages = context.getPages().map((page, index) => ({
        index,
        url: page.url(),
        selected: context.isPageSelected(page),
      }));

      const wsEndpoint = newBrowser.wsEndpoint();

      return {pages, wsEndpoint};
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger(`Reconnect attempt failed: ${lastError.message}`);

      const remaining = deadline - Date.now();
      if (remaining > retryInterval) {
        await new Promise(resolve => setTimeout(resolve, retryInterval));
      } else {
        break;
      }
    }
  }

  throw new Error(
    `Failed to connect to browser after ${timeout}ms: ${lastError?.message ?? 'unknown error'}`,
  );
}

/**
 * Log security disclaimers to stderr.
 *
 * Warns users that browser content is exposed to MCP clients.
 */
const logDisclaimers = (): void => {
  console.error(
    `chrome-devtools-mcp exposes content of the browser instance to the MCP clients allowing them to inspect,
debug, and modify any data in the browser or DevTools.
Avoid sharing sensitive or personal information that you do not want to share with MCP clients.`,
  );
};

/**
 * Mutex to serialize tool execution and prevent concurrent modifications.
 */
const toolMutex = new Mutex();

/**
 * Register a tool with the MCP server.
 *
 * Handles category-based filtering (emulation, performance, network)
 * and wraps the handler with context initialization and error handling.
 *
 * @param tool - Tool definition to register.
 */
function registerTool(tool: ToolDefinition): void {
  if (
    tool.annotations.category === ToolCategory.EMULATION &&
    args.categoryEmulation === false
  ) {
    return;
  }
  if (
    tool.annotations.category === ToolCategory.PERFORMANCE &&
    args.categoryPerformance === false
  ) {
    return;
  }
  if (
    tool.annotations.category === ToolCategory.NETWORK &&
    args.categoryNetwork === false
  ) {
    return;
  }
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: zod.object(tool.schema).strict(),
      annotations: tool.annotations,
    },
    async (params: Record<string, unknown>): Promise<CallToolResult> => {
      const guard = await toolMutex.acquire();
      try {
        logger(`${tool.name} request: ${JSON.stringify(params, null, '  ')}`);
        const context = await getContext();
        logger(`${tool.name} context: resolved`);
        await context.detectOpenDevToolsWindows();
        const response = new McpResponse();
        await tool.handler(
          {
            params,
          },
          response,
          context,
        );
        // Re-fetch context in case the handler swapped it (e.g. connect_to_browser).
        // The local `const context` shadows the module-level `let context`, so we
        // must call getContext() to pick up any reassignment by onReconnect.
        const activeContext = await getContext();
        const content = await response.handle(tool.name, activeContext);
        const result: CallToolResult = {
          content,
        };
        if (response.isError) {
          result.isError = true;
        }
        return result;
      } catch (err) {
        logger(`${tool.name} error:`, err, err?.stack);
        let errorText = err && 'message' in err ? err.message : String(err);
        if ('cause' in err && err.cause) {
          errorText += `\nCause: ${err.cause.message}`;
        }
        return {
          content: [
            {
              type: 'text',
              text: errorText,
            },
          ],
          isError: true,
        };
      } finally {
        guard.dispose();
      }
    },
  );
}

for (const tool of tools) {
  registerTool(tool);
}

await loadIssueDescriptions();
const transport = new StdioServerTransport();
await server.connect(transport);
logger('Chrome DevTools MCP Server connected');
logDisclaimers();
