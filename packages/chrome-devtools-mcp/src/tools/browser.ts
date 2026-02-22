/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const connectToBrowser = defineTool({
  name: 'connect_to_browser',
  description:
    'Connect to a different Chrome browser instance at runtime. ' +
    'Disconnects from the current browser (without closing it) and attaches to the new one. ' +
    'Useful for WXT extension development: run `wxt dev`, parse the debug URL from stdout, ' +
    'then call this tool to attach. Retries automatically if the browser is still starting up.',
  annotations: {
    title: 'Connect to Browser',
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false,
  },
  schema: {
    browserUrl: zod
      .string()
      .optional()
      .describe(
        'HTTP URL to the browser\'s DevTools endpoint, e.g. "http://127.0.0.1:9222". ' +
          'Exactly one of browserUrl or wsEndpoint is required.',
      ),
    wsEndpoint: zod
      .string()
      .optional()
      .describe(
        'WebSocket URL to connect to, e.g. "ws://127.0.0.1:9222/devtools/browser/...". ' +
          'Exactly one of browserUrl or wsEndpoint is required.',
      ),
    wsHeaders: zod
      .record(zod.string())
      .optional()
      .describe('Optional HTTP headers for WebSocket connection (only used with wsEndpoint).'),
    timeout: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Maximum time in milliseconds to wait for the browser to become available. ' +
          'Defaults to 30000 (30 seconds). The tool retries every 2 seconds within this window.',
      ),
  },
  handler: async (request, response, context) => {
    const {browserUrl, wsEndpoint, wsHeaders, timeout} = request.params;

    // Validate: exactly one connection method required
    if (!browserUrl && !wsEndpoint) {
      throw new Error(
        'Either browserUrl or wsEndpoint is required. ' +
          'Example: browserUrl "http://127.0.0.1:9222" or wsEndpoint "ws://127.0.0.1:9222/devtools/browser/..."',
      );
    }
    if (browserUrl && wsEndpoint) {
      throw new Error(
        'Provide only one of browserUrl or wsEndpoint, not both.',
      );
    }

    // Validate URL protocols
    if (browserUrl && !browserUrl.startsWith('http://') && !browserUrl.startsWith('https://')) {
      throw new Error(
        `Invalid browserUrl: "${browserUrl}". Must start with http:// or https://`,
      );
    }
    if (wsEndpoint && !wsEndpoint.startsWith('ws://') && !wsEndpoint.startsWith('wss://')) {
      throw new Error(
        `Invalid wsEndpoint: "${wsEndpoint}". Must start with ws:// or wss://`,
      );
    }

    try {
      const result = await context.reconnectBrowser({
        browserURL: browserUrl,
        wsEndpoint,
        wsHeaders,
        timeout,
      });

      response.appendResponseLine(
        `Connected to browser at ${wsEndpoint ?? browserUrl}`,
      );
      response.appendResponseLine(`WebSocket endpoint: ${result.wsEndpoint}`);
      response.appendResponseLine('');
      response.appendResponseLine('Pages:');
      for (const page of result.pages) {
        const marker = page.selected ? ' (selected)' : '';
        response.appendResponseLine(`  [${page.index}] ${page.url}${marker}`);
      }
    } catch (err) {
      response.setIsError(true);
      const message = err instanceof Error ? err.message : String(err);
      response.appendResponseLine(`Failed to connect: ${message}`);
      response.appendResponseLine('');
      response.appendResponseLine('Troubleshooting:');
      response.appendResponseLine(
        '  - Ensure Chrome was launched with --remote-debugging-port=<port>',
      );
      response.appendResponseLine(
        '  - Verify the URL is reachable: curl ' + (browserUrl ?? wsEndpoint),
      );
      if (timeout) {
        response.appendResponseLine(
          '  - Try increasing the timeout (current: ' + timeout + 'ms)',
        );
      } else {
        response.appendResponseLine(
          '  - Try setting a longer timeout (default is 30s)',
        );
      }
    }
  },
});
