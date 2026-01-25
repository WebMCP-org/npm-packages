/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Commented out: imports only used by inject_webmcp_script tool
// import {readFileSync} from 'node:fs';
// import {dirname, extname} from 'node:path';
// import * as esbuild from 'esbuild';
// import {getPolyfillCode} from '../polyfillLoader.js';

import { zod } from '../third_party/index.js';

import { ToolCategory } from './categories.js';
import { defineTool } from './ToolDefinition.js';

// Commented out: helper functions only used by inject_webmcp_script tool
// /**
//  * Bundle a TypeScript/TSX file using esbuild for browser injection.
//  * Uses in-memory bundling (write: false) for fast, zero-disk-IO operation.
//  *
//  * @param filePath - Absolute path to the TypeScript file
//  * @returns Bundled JavaScript code as IIFE
//  */
// async function bundleTypeScript(filePath: string): Promise<string> {
//   try {
//     const result = await esbuild.build({
//       entryPoints: [filePath],
//       bundle: true,
//       format: 'iife',
//       write: false, // In-memory, no disk I/O
//       platform: 'browser',
//       target: 'es2020',
//       absWorkingDir: dirname(filePath),
//       // Keep minify: false for easier debugging of injected scripts in DevTools.
//       // The payload size (~100KB for polyfill) is acceptable for dev/testing use.
//       minify: false,
//       // Source maps aren't useful for injected scripts
//       sourcemap: false,
//     });
//
//     if (!result.outputFiles || result.outputFiles.length === 0) {
//       const error = new Error('esbuild produced no output');
//       console.error('[bundleTypeScript] Build succeeded but no output files generated', {
//         filePath,
//         outputFiles: result.outputFiles,
//         warnings: result.warnings,
//         errors: result.errors,
//       });
//       throw error;
//     }
//
//     if (result.warnings.length > 0) {
//       console.warn('[bundleTypeScript] Build warnings:', {
//         filePath,
//         warnings: result.warnings,
//       });
//     }
//
//     return result.outputFiles[0].text;
//   } catch (err) {
//     const message = err instanceof Error ? err.message : String(err);
//     console.error('[bundleTypeScript] Bundle failed', {
//       filePath,
//       error: message,
//       stack: err instanceof Error ? err.stack : undefined,
//     });
//     throw err;
//   }
// }
//
// /**
//  * Append standardized debug steps to the response.
//  * Used when injection or connection fails to guide troubleshooting.
//  */
// function appendDebugSteps(response: Response): void {
//   response.appendResponseLine('Debug steps:');
//   response.appendResponseLine(
//     '  1. list_console_messages - check for JS errors',
//   );
//   response.appendResponseLine('  2. take_snapshot - verify page state');
// }

/**
 * Convert a glob-style pattern to a RegExp.
 * Supports * (any chars) and ? (single char).
 */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars except * and ?
    .replace(/\*/g, '.*')                   // * -> .*
    .replace(/\?/g, '.');                   // ? -> .
  return new RegExp(`^${escaped}$`, 'i');   // Case insensitive, full match
}

/**
 * List WebMCP tools registered on browser pages.
 * By default returns tools from the currently selected page only.
 * Use all_pages=true to see tools from all tabs.
 */
export const listWebMCPTools = defineTool({
  name: 'list_webmcp_tools',
  description:
    'List WebMCP tools registered on browser pages. ' +
    'By default, returns tools from the currently selected page only. ' +
    'Use all_pages=true to see tools from all tabs. ' +
    'Returns tool definitions including name, description, input schema, and page index. ' +
    'Use call_webmcp_tool to invoke a tool.',
  annotations: {
    title: 'List Website MCP Tools',
    category: ToolCategory.WEBMCP,
    readOnlyHint: true,
  },
  schema: {
    page_index: zod
      .number()
      .int()
      .optional()
      .describe('Only show tools from this specific page index'),
    all_pages: zod
      .boolean()
      .optional()
      .describe('If true, return tools from all pages instead of just the selected page (default: false)'),
    pattern: zod
      .string()
      .optional()
      .describe('Glob pattern to filter tool names (e.g., "skill*", "*_config")'),
    summary: zod
      .boolean()
      .optional()
      .describe('If true, return only name and first line of description, omitting full schemas (default: false)'),
  },
  handler: async (request, response, context) => {
    const { page_index, all_pages, pattern, summary } = request.params;
    const toolHub = context.getToolHub();

    if (!toolHub) {
      response.appendResponseLine('WebMCPToolHub not initialized.');
      return;
    }

    let tools = toolHub.getRegisteredTools();

    // If no tools found, try connecting to WebMCP on the current page
    // This handles cases where auto-detection is still in progress or timed out
    if (tools.length === 0) {
      const page = context.getSelectedPage();
      const result = await context.getWebMCPClient(page);
      if (result.connected) {
        // Re-fetch tools after connection (sync happens in getWebMCPClient)
        tools = toolHub.getRegisteredTools();
      }
    }

    // Determine which page(s) to show
    const selectedPageIdx = context.getPages().indexOf(context.getSelectedPage());

    // Filter by page
    if (page_index !== undefined) {
      // Specific page requested
      tools = tools.filter(t => t.pageIdx === page_index);
    } else if (!all_pages) {
      // Default: selected page only
      tools = tools.filter(t => t.pageIdx === selectedPageIdx);
    }
    // else: all_pages=true, show everything

    // Filter by pattern
    if (pattern) {
      const regex = globToRegex(pattern);
      tools = tools.filter(t => regex.test(t.originalName));
    }

    if (tools.length === 0) {
      const filters: string[] = [];
      if (page_index !== undefined) {
        filters.push(`page_index=${page_index}`);
      } else if (!all_pages) {
        filters.push(`selected page (${selectedPageIdx})`);
      }
      if (pattern) {
        filters.push(`pattern="${pattern}"`);
      }

      const filterMsg = filters.length > 0 ? ` (filters: ${filters.join(', ')})` : '';
      response.appendResponseLine(`No WebMCP tools found${filterMsg}.`);

      if (!all_pages && page_index === undefined) {
        response.appendResponseLine('');
        response.appendResponseLine('Tip: Use all_pages=true to search across all pages.');
      }
      response.appendResponseLine('');
      response.appendResponseLine('Navigate to a page with @mcp-b/global loaded to discover tools.');
      return;
    }

    // Format output
    if (summary) {
      // Compact output: name + first line of description
      const toolSummaries = tools.map(tool => {
        const firstLine = tool.description.split('\n')[0].split('. ')[0];
        const truncated = firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine;
        return {
          name: tool.originalName,
          description: truncated,
          pageIdx: tool.pageIdx,
        };
      });
      response.appendResponseLine(JSON.stringify({ tools: toolSummaries, count: tools.length }, null, 2));
    } else {
      // Full output with schemas and annotations
      const toolDefinitions = tools.map(tool => {
        const def: Record<string, unknown> = {
          name: tool.originalName,
          description: tool.description,
          inputSchema: tool.inputSchema,
          pageIdx: tool.pageIdx,
          domain: tool.domain,
        };
        // Only include optional fields if present
        if (tool.outputSchema) {
          def.outputSchema = tool.outputSchema;
        }
        if (tool.annotations) {
          def.annotations = tool.annotations;
        }
        return def;
      });
      response.appendResponseLine(JSON.stringify({ tools: toolDefinitions, count: tools.length }, null, 2));
    }
  },
});

/**
 * Call a tool registered on a webpage via WebMCP.
 * Auto-connects to WebMCP if not already connected.
 */
export const callWebMCPTool = defineTool({
  name: 'call_webmcp_tool',
  description:
    'Call a WebMCP tool registered on a webpage. ' +
    'Auto-connects to the page if needed. ' +
    'Use list_webmcp_tools first to see available tools and their input schemas.',
  annotations: {
    title: 'Call Website MCP Tool',
    category: ToolCategory.WEBMCP,
    readOnlyHint: false, // Tools may have side effects
  },
  schema: {
    name: zod.string().describe('The name of the tool to call'),
    arguments: zod
      .union([
        zod.record(zod.string(), zod.any()),
        zod.string().transform((str, ctx) => {
          try {
            const parsed = JSON.parse(str);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
              ctx.addIssue({
                code: zod.ZodIssueCode.custom,
                message: 'Arguments must be a JSON object, not an array or primitive',
              });
              return zod.NEVER;
            }
            return parsed as Record<string, unknown>;
          } catch {
            ctx.addIssue({
              code: zod.ZodIssueCode.custom,
              message: `Invalid JSON string for arguments: ${str.slice(0, 100)}${str.length > 100 ? '...' : ''}`,
            });
            return zod.NEVER;
          }
        }),
      ])
      .optional()
      .describe('Arguments to pass to the tool as a JSON object (or JSON string that will be parsed)'),
    page_index: zod
      .number()
      .int()
      .optional()
      .describe(
        'Index of the page to call the tool on. If not specified, uses the currently selected page. ' +
        'Use list_pages to see available pages and their indices.',
      ),
  },
  handler: async (request, response, context) => {
    const { name, arguments: args, page_index } = request.params;

    // Validate required parameter
    if (!name || typeof name !== 'string') {
      response.appendResponseLine('Error: Missing required parameter "name"');
      response.appendResponseLine('');
      response.appendResponseLine('Usage: call_webmcp_tool({ name: "tool_name", arguments: {...} })');
      response.appendResponseLine('');
      response.appendResponseLine('Use list_webmcp_tools to see available tools.');
      response.setIsError(true);
      return;
    }

    // Get the target page
    const page =
      page_index !== undefined
        ? context.getPageByIdx(page_index)
        : context.getSelectedPage();

    // Get client from context (handles auto-connect and stale connection detection)
    const result = await context.getWebMCPClient(page);
    if (!result.connected) {
      response.appendResponseLine(
        result.error || 'No WebMCP tools available on this page.',
      );
      response.setIsError(true);
      return;
    }

    const client = result.client;

    // Check if arguments are empty but the tool expects required fields
    const toolHub = context.getToolHub();
    const toolDef = toolHub?.getToolByName(name, page);
    const argsEmpty = !args || Object.keys(args).length === 0;

    if (argsEmpty && toolDef?.inputSchema) {
      const schema = toolDef.inputSchema;
      const requiredFields = (schema.required as string[] | undefined) ?? [];
      const properties = schema.properties as Record<string, unknown> | undefined;

      if (requiredFields.length > 0) {
        response.appendResponseLine(`⚠️  Warning: Calling "${name}" with empty arguments, but tool expects required fields: ${requiredFields.join(', ')}`);
        response.appendResponseLine('');

        // Show the expected schema
        if (properties) {
          response.appendResponseLine('Expected schema:');
          for (const field of requiredFields) {
            const prop = properties[field] as { type?: string; description?: string } | undefined;
            const typeStr = prop?.type || 'unknown';
            const descStr = prop?.description ? ` - ${prop.description}` : '';
            response.appendResponseLine(`  • ${field} (${typeStr})${descStr}`);
          }
          response.appendResponseLine('');
        }
      }
    }

    try {
      const callResult = await client.callTool({
        name,
        arguments: args || {},
      });

      // Pass through the result content directly (includes Zod validation errors)
      if (callResult.content && Array.isArray(callResult.content)) {
        for (const content of callResult.content) {
          if (content.type === 'text') {
            response.appendResponseLine(content.text);
          } else if (content.type === 'image') {
            response.appendResponseLine(
              `[Image: ${content.mimeType}, ${content.data.length} bytes]`,
            );
          } else if (content.type === 'resource') {
            response.appendResponseLine(
              `[Resource: ${JSON.stringify(content.resource)}]`,
            );
          } else {
            response.appendResponseLine(JSON.stringify(content, null, 2));
          }
        }
      } else {
        response.appendResponseLine(JSON.stringify(callResult, null, 2));
      }

      if (callResult.isError) {
        response.setIsError(true);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Handle "Connection closed" gracefully for navigation tools
      if (errorMessage.includes('Connection closed')) {
        // Check if this was a navigation by inspecting the arguments
        const navigationTarget = args && typeof args === 'object' && 'to' in args
          ? (args as { to?: string }).to
          : null;

        if (navigationTarget && typeof navigationTarget === 'string') {
          // Wait a moment for navigation to complete
          await new Promise(resolve => setTimeout(resolve, 100));

          const currentUrl = page.url();
          const urlObj = new URL(currentUrl);
          const currentPath = urlObj.pathname + urlObj.search + urlObj.hash;

          // Check if we navigated to the expected path
          if (currentPath === navigationTarget || currentPath.startsWith(navigationTarget)) {
            response.appendResponseLine('');
            response.appendResponseLine(`✓ Navigation successful: ${currentUrl}`);
            response.appendResponseLine('');
            response.appendResponseLine('(Connection closed during navigation - this is expected)');
            // Don't set isError - this is a success
            return;
          }
        }
      }

      // Classify errors and provide actionable guidance
      if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
        response.appendResponseLine(`Tool call timed out: ${name}`);
        response.appendResponseLine('');
        response.appendResponseLine('The page may be unresponsive. Try:');
        response.appendResponseLine('  1. Refresh the page with navigate_page({ type: "reload" })');
        response.appendResponseLine('  2. Check list_console_messages for JavaScript errors');
      } else if (errorMessage.includes('validation') || errorMessage.includes('schema')) {
        response.appendResponseLine(`Tool argument validation failed: ${errorMessage}`);
        response.appendResponseLine('');
        response.appendResponseLine('Check the tool schema with list_webmcp_tools to see expected arguments.');
      } else if (errorMessage.includes('not found') || errorMessage.includes('No such tool')) {
        response.appendResponseLine(`Tool not found: ${name}`);
        response.appendResponseLine('');
        response.appendResponseLine('The tool may have been unregistered. Use list_webmcp_tools to see available tools.');
      } else {
        response.appendResponseLine(`Failed to call tool: ${errorMessage}`);
        response.appendResponseLine('');
        response.appendResponseLine('For debugging, check list_console_messages for page errors.');
      }
      response.setIsError(true);
    }
  },
});

// Commented out: inject_webmcp_script tool (on hold for now)
// /**
//  * Inject a WebMCP userscript into the page for testing.
//  *
//  * Automatically handles @mcp-b/global polyfill injection - if the page
//  * does not have navigator.modelContext, the polyfill is prepended automatically.
//  *
//  * @remarks
//  * - Either `code` or `file_path` parameter must be provided (not both)
//  * - Waits for polyfill initialization (up to 5000ms) then tool registration (configurable via timeout param, default: 5000ms)
//  * - Sites with Content Security Policy (CSP) blocking inline scripts will fail
//  *   with a clear error message
//  * - After successful injection, tools appear as first-class MCP tools with
//  *   naming pattern: webmcp_{domain}_page{idx}_{name}
//  */
// export const injectWebMCPScript = defineTool({
//   name: 'inject_webmcp_script',
//   description:
//     'Inject a WebMCP userscript into the page for testing. ' +
//     'Supports both JavaScript (.js) and TypeScript (.ts/.tsx) files - TypeScript is ' +
//     'automatically bundled with esbuild (~10ms, in-memory). ' +
//     'Automatically handles @mcp-b/global polyfill injection - if the page ' +
//     'does not have navigator.modelContext, the polyfill is prepended automatically. ' +
//     'After injection, tools register as first-class MCP tools (webmcp_{domain}_page{idx}_{name}). ' +
//     'Userscripts should NOT import the polyfill - just call navigator.modelContext.registerTool(). ' +
//     'Use this for rapid prototyping and testing MCP tools on any website.',
//   annotations: {
//     title: 'Inject WebMCP Script',
//     category: ToolCategory.WEBMCP,
//     readOnlyHint: false,
//   },
//   schema: {
//     code: zod
//       .string()
//       .optional()
//       .describe(
//         'The userscript code to inject. Just tool registration code - ' +
//           'polyfill is auto-injected if needed. Use navigator.modelContext.registerTool() to register tools. ' +
//           'Either code or file_path must be provided.',
//       ),
//     file_path: zod
//       .string()
//       .optional()
//       .describe(
//         'Path to a JavaScript file containing the userscript to inject. ' +
//           'Either code or file_path must be provided.',
//       ),
//     wait_for_tools: zod
//       .boolean()
//       .optional()
//       .describe('Wait for tools to register before returning. Default: true'),
//     timeout: zod
//       .number()
//       .int()
//       .positive()
//       .max(60000)
//       .optional()
//       .describe('Timeout in ms to wait for tools. Default: 5000, Max: 60000'),
//     page_index: zod
//       .number()
//       .int()
//       .optional()
//       .describe('Target page index. Default: currently selected page'),
//   },
//   handler: async (request, response, context) => {
//     const {
//       code,
//       file_path,
//       wait_for_tools = true,
//       timeout = 5000,
//       page_index,
//     } = request.params;
//
//     // Validate that exactly one of code or file_path is provided
//     if (!code && !file_path) {
//       response.appendResponseLine(
//         'Error: Either code or file_path must be provided.',
//       );
//       return;
//     }
//
//     if (code && file_path) {
//       response.appendResponseLine(
//         'Error: Provide either code or file_path, not both.',
//       );
//       return;
//     }
//
//     // Get the script code - from file or inline
//     let scriptCode: string;
//     if (file_path) {
//       const ext = extname(file_path).toLowerCase();
//       const isTypeScript = ext === '.ts' || ext === '.tsx';
//
//       try {
//         if (isTypeScript) {
//           // Bundle TypeScript with esbuild (in-memory, ~10ms)
//           response.appendResponseLine(`Bundling TypeScript: ${file_path}`);
//           scriptCode = await bundleTypeScript(file_path);
//           response.appendResponseLine('TypeScript bundled successfully');
//         } else {
//           // Plain JavaScript - read directly
//           response.appendResponseLine(`Loading script from: ${file_path}`);
//           scriptCode = readFileSync(file_path, 'utf-8');
//           response.appendResponseLine('Script loaded successfully');
//         }
//       } catch (err) {
//         const message = err instanceof Error ? err.message : String(err);
//
//         // Log the error with full context for debugging
//         console.error('[injectWebMCPScript] File operation failed', {
//           file_path,
//           isTypeScript,
//           error: message,
//           stack: err instanceof Error ? err.stack : undefined,
//           errno: (err as NodeJS.ErrnoException).errno,
//           code: (err as NodeJS.ErrnoException).code,
//         });
//
//         if (isTypeScript) {
//           response.appendResponseLine(`Error bundling TypeScript: ${message}`);
//           response.appendResponseLine('');
//           response.appendResponseLine('Common issues:');
//           response.appendResponseLine('  - Syntax errors in TypeScript code');
//           response.appendResponseLine('  - Missing dependencies (npm install)');
//           response.appendResponseLine('  - Invalid import paths');
//         } else {
//           response.appendResponseLine(`Error reading file: ${message}`);
//
//           // Provide specific guidance based on error code
//           if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
//             response.appendResponseLine('');
//             response.appendResponseLine('File not found. Check the path and try again.');
//           } else if ((err as NodeJS.ErrnoException).code === 'EACCES') {
//             response.appendResponseLine('');
//             response.appendResponseLine('Permission denied. Check file permissions.');
//           }
//         }
//         return;
//       }
//     } else {
//       scriptCode = code!;
//     }
//
//     // Get the target page with proper error handling
//     let page;
//     try {
//       page =
//         page_index !== undefined
//           ? context.getPageByIdx(page_index)
//           : context.getSelectedPage();
//     } catch (err) {
//       const message = err instanceof Error ? err.message : String(err);
//       response.appendResponseLine(`Error: Invalid page_index - ${message}`);
//       return;
//     }
//
//     response.appendResponseLine(`Target: ${page.url()}`);
//     response.appendResponseLine('');
//
//     try {
//       // Check if polyfill already exists
//       const hasPolyfill = await page.evaluate(() =>
//         typeof navigator !== 'undefined' &&
//         typeof (navigator as Navigator & {modelContext?: unknown}).modelContext !==
//           'undefined',
//       );
//
//       let codeToInject = scriptCode;
//
//       if (hasPolyfill) {
//         response.appendResponseLine('Polyfill already present');
//       } else {
//         response.appendResponseLine('Injecting @mcp-b/global polyfill...');
//         try {
//           const polyfillCode = getPolyfillCode();
//           codeToInject = polyfillCode + '\n;\n' + scriptCode;
//           response.appendResponseLine('Polyfill prepended');
//         } catch (err) {
//           const message = err instanceof Error ? err.message : String(err);
//           response.appendResponseLine(`Failed to load polyfill: ${message}`);
//           response.appendResponseLine('');
//           response.appendResponseLine(
//             'Ensure @mcp-b/global is built: pnpm build --filter=@mcp-b/global',
//           );
//           return;
//         }
//       }
//
//       // Inject the script
//       response.appendResponseLine('Injecting userscript...');
//
//       await page.evaluate((bundleCode: string) => {
//         const script = document.createElement('script');
//         script.textContent = bundleCode;
//         script.id = '__webmcp_injected_script__';
//         document.getElementById('__webmcp_injected_script__')?.remove();
//         document.head.appendChild(script);
//       }, codeToInject);
//
//       response.appendResponseLine('Script injected');
//
//       if (!wait_for_tools) {
//         response.appendResponseLine('');
//         response.appendResponseLine(
//           'Use list_webmcp_tools to verify registration.',
//         );
//         return;
//       }
//
//       // Poll for polyfill initialization instead of using a magic sleep number.
//       // TabServerTransport registers asynchronously after the polyfill script executes.
//       // We poll at 100ms intervals until navigator.modelContext is available.
//       response.appendResponseLine('Waiting for polyfill to initialize...');
//
//       const polyfillTimeout = Math.min(timeout, 5000); // Cap at 5s for polyfill init
//       const polyfillStart = Date.now();
//       let polyfillReady = false;
//       const polyfillErrors: Array<{time: number; error: string}> = [];
//
//       while (Date.now() - polyfillStart < polyfillTimeout) {
//         try {
//           polyfillReady = await page.evaluate(() =>
//             typeof navigator !== 'undefined' &&
//             typeof (navigator as Navigator & {modelContext?: unknown}).modelContext !==
//               'undefined',
//           );
//           if (polyfillReady) {
//             break;
//           }
//         } catch (err) {
//           const message = err instanceof Error ? err.message : String(err);
//           polyfillErrors.push({time: Date.now() - polyfillStart, error: message});
//
//           // Abort on non-retryable errors
//           if (
//             message.includes('Target closed') ||
//             message.includes('Session closed') ||
//             message.includes('Content Security Policy')
//           ) {
//             response.appendResponseLine('');
//             response.appendResponseLine(`Fatal error during polyfill initialization: ${message}`);
//             response.appendResponseLine('');
//             appendDebugSteps(response);
//             return;
//           }
//         }
//         await new Promise(r => setTimeout(r, 100));
//       }
//
//       if (!polyfillReady) {
//         response.appendResponseLine('');
//         response.appendResponseLine(
//           `Polyfill did not initialize within ${polyfillTimeout}ms`,
//         );
//         response.appendResponseLine('');
//         if (polyfillErrors.length > 0) {
//           response.appendResponseLine('Errors encountered during polling:');
//           for (const {time, error} of polyfillErrors.slice(-3)) {
//             response.appendResponseLine(`  [${time}ms] ${error}`);
//           }
//           response.appendResponseLine('');
//         }
//         response.appendResponseLine('Possible causes:');
//         response.appendResponseLine('  - Script syntax error (check console)');
//         response.appendResponseLine('  - CSP blocked script execution');
//         response.appendResponseLine('  - Polyfill failed to initialize');
//         response.appendResponseLine('');
//         appendDebugSteps(response);
//         return;
//       }
//
//       response.appendResponseLine('Polyfill initialized');
//
//       // Make a single connection attempt (don't poll - that creates racing transports)
//       response.appendResponseLine('Connecting to WebMCP server...');
//
//       const result = await context.getWebMCPClient(page);
//       if (!result.connected) {
//         response.appendResponseLine('');
//         response.appendResponseLine(`Connection failed: ${result.error}`);
//         response.appendResponseLine('');
//
//         // Provide error-specific guidance
//         const errorLower = result.error.toLowerCase();
//         if (errorLower.includes('timeout')) {
//           response.appendResponseLine(
//             'The page likely has a stale polyfill from a previous session.',
//           );
//           response.appendResponseLine(
//             'FIX: Use navigate_page with type="reload" to refresh the page, then retry injection.',
//           );
//           response.appendResponseLine('');
//         } else if (errorLower.includes('bridge not found')) {
//           response.appendResponseLine(
//             'The CDP bridge script may have been blocked by the page.',
//           );
//           response.appendResponseLine(
//             'Check if the page has strict CSP or is in a sandboxed iframe.',
//           );
//           response.appendResponseLine('');
//         }
//
//         appendDebugSteps(response);
//         return;
//       }
//
//       // TypeScript now knows result is {connected: true; client: Client}
//       response.appendResponseLine('Connected to WebMCP server');
//
//       // Now poll for tools (using the established connection)
//       response.appendResponseLine(`Waiting for tools (${timeout}ms)...`);
//
//       const startTime = Date.now();
//       let lastError: Error | null = null;
//       let successfulPolls = 0;
//       let failedPolls = 0;
//
//       while (Date.now() - startTime < timeout) {
//         try {
//           const {tools} = await result.client.listTools();
//           successfulPolls++;
//           lastError = null;
//
//           if (tools.length > 0) {
//             const toolHub = context.getToolHub();
//             if (toolHub) {
//               await toolHub.syncToolsForPage(page, result.client);
//             } else {
//               console.warn('[injectWebMCPScript] Tool hub not available - tools may not be callable via MCP', {
//                 pageUrl: page.url(),
//                 toolCount: tools.length,
//               });
//               response.appendResponseLine('');
//               response.appendResponseLine('⚠️  Warning: Tool hub unavailable. Tools detected but may not be callable.');
//               response.appendResponseLine('');
//             }
//
//             response.appendResponseLine('');
//             response.appendResponseLine(`${tools.length} tool(s) detected:`);
//             response.appendResponseLine('');
//
//             const domain = extractDomain(page.url());
//             const pages = context.getPages();
//             const pageIdx = pages.indexOf(page);
//
//             for (const tool of tools) {
//               const toolId = `webmcp_${domain}_page${pageIdx}_${tool.name}`;
//               response.appendResponseLine(`  - ${tool.name}`);
//               response.appendResponseLine(`    -> ${toolId}`);
//             }
//             response.appendResponseLine('');
//             response.appendResponseLine(
//               'Tools are now callable as first-class MCP tools.',
//             );
//             response.appendResponseLine('');
//             response.appendResponseLine(
//               'IMPORTANT: Your MCP tool list has been updated with these new tools.',
//             );
//             response.appendResponseLine(
//               'In Claude Code, call with: mcp__chrome-devtools__<toolId>',
//             );
//             response.appendResponseLine(
//               `Example: mcp__chrome-devtools__${`webmcp_${domain}_page${pageIdx}_${tools[0].name}`}`,
//             );
//             response.appendResponseLine('');
//             response.appendResponseLine(
//               'In MCP SDK, call with: client.callTool({ name: "<toolId>", arguments: {} })',
//             );
//             response.appendResponseLine(
//               `Example: client.callTool({ name: "${`webmcp_${domain}_page${pageIdx}_${tools[0].name}`}", arguments: {} })`,
//             );
//             return;
//           }
//         } catch (err) {
//           lastError = err instanceof Error ? err : new Error(String(err));
//           failedPolls++;
//
//           // Non-retryable errors should abort immediately
//           const message = lastError.message.toLowerCase();
//           if (
//             message.includes('transport closed') ||
//             message.includes('disconnected') ||
//             message.includes('protocol error')
//           ) {
//             response.appendResponseLine('');
//             response.appendResponseLine(
//               `Fatal error during tool polling: ${lastError.message}`,
//             );
//             response.appendResponseLine(
//               'The connection was lost. Please retry the injection.',
//             );
//             return;
//           }
//         }
//
//         await new Promise(r => setTimeout(r, 200));
//       }
//
//       // Timeout reached - provide context about what happened
//       response.appendResponseLine('');
//       response.appendResponseLine(`No tools registered within ${timeout}ms.`);
//       response.appendResponseLine('');
//       response.appendResponseLine('Polling summary:');
//       response.appendResponseLine(`  - Successful polls: ${successfulPolls}`);
//       response.appendResponseLine(`  - Failed polls: ${failedPolls}`);
//       if (lastError) {
//         response.appendResponseLine(`  - Last error: ${lastError.message}`);
//       }
//       response.appendResponseLine('');
//       appendDebugSteps(response);
//     } catch (err) {
//       const message = err instanceof Error ? err.message : String(err);
//
//       if (
//         message.includes('Content Security Policy') ||
//         message.includes('script-src')
//       ) {
//         response.appendResponseLine(
//           'Site has Content Security Policy blocking inline scripts.',
//         );
//         response.appendResponseLine('');
//         response.appendResponseLine(`CSP error: ${message}`);
//         response.appendResponseLine('');
//         response.appendResponseLine(
//           'This site cannot be automated via script injection.',
//         );
//         response.appendResponseLine(
//           'Consider: browser extension approach instead.',
//         );
//         return;
//       }
//
//       // Categorize the error for better user guidance
//       response.appendResponseLine(`Error: ${message}`);
//       response.appendResponseLine('');
//
//       if (
//         message.includes('Execution context was destroyed') ||
//         message.includes('page has been closed')
//       ) {
//         response.appendResponseLine(
//           'The page navigated or was closed during injection.',
//         );
//         response.appendResponseLine(
//           'Try again after the page has finished loading.',
//         );
//       } else if (message.includes('SyntaxError')) {
//         response.appendResponseLine('The injected script has a syntax error.');
//         response.appendResponseLine(
//           'Check the script code for JavaScript errors.',
//         );
//       } else {
//         appendDebugSteps(response);
//       }
//     }
//   },
// });
