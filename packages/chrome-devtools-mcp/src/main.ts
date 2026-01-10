/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';

import './polyfill.js';

import type {Channel} from './browser.js';
import {ensureBrowserConnected, ensureBrowserLaunched} from './browser.js';
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
const VERSION = '0.12.1';
// x-release-please-end

process.on('unhandledRejection', (reason, promise) => {
  logger('Unhandled promise rejection', promise, reason);
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

  // If explicit browserUrl or wsEndpoint is provided, connect without fallback
  if (args.browserUrl || args.wsEndpoint) {
    browser = await ensureBrowserConnected({
      browserURL: args.browserUrl,
      wsEndpoint: args.wsEndpoint,
      wsHeaders: args.wsHeaders,
      devtools,
      channel: undefined,
      userDataDir: args.userDataDir,
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
      });
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
    });
  }

  if (context?.browser !== browser) {
    context = await McpContext.from(browser, logger, {
      experimentalDevToolsDebugging: devtools,
      experimentalIncludeAllPages: args.experimentalIncludeAllPages,
    });

    // Initialize WebMCP tool hub for dynamic tool registration
    const toolHub = new WebMCPToolHub(server, context);
    context.setToolHub(toolHub);
    logger('WebMCPToolHub initialized for dynamic tool registration');
  }
  return context;
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
      inputSchema: tool.schema,
      annotations: tool.annotations,
    },
    async (params): Promise<CallToolResult> => {
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
        const content = await response.handle(tool.name, context);
        return {
          content,
        };
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
