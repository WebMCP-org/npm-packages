/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {diffWebMCPTools} from '../../src/tools/webmcp.js';
import {serverHooks} from '../server.js';
import {withMcpContext} from '../utils.js';

/**
 * A minimal mock of @mcp-b/global's TabServerTransport behavior.
 * This simulates a WebMCP server running in a page.
 */
const MOCK_WEBMCP_PAGE = `
<!DOCTYPE html>
<html>
<head>
  <title>WebMCP Test Page</title>
</head>
<body>
  <h1>WebMCP Test Page</h1>
  <script>
    // Simulate @mcp-b/global's TabServerTransport
    (function() {
      const CHANNEL_ID = 'mcp-default';
      let requestId = 0;

      // Mock tools registry
      const tools = [
        {
          name: 'test_add',
          description: 'Add two numbers together',
          inputSchema: {
            type: 'object',
            properties: {
              a: { type: 'number', description: 'First number' },
              b: { type: 'number', description: 'Second number' }
            },
            required: ['a', 'b']
          }
        },
        {
          name: 'test_greet',
          description: 'Greet someone by name',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Name to greet' }
            },
            required: ['name']
          }
        },
        {
          name: 'test_error',
          description: 'A tool that always fails',
          inputSchema: { type: 'object', properties: {} }
        }
      ];

      // Tool handlers
      function executeTool(name, args) {
        switch (name) {
          case 'test_add':
            return { content: [{ type: 'text', text: String(args.a + args.b) }] };
          case 'test_greet':
            return { content: [{ type: 'text', text: 'Hello, ' + args.name + '!' }] };
          case 'test_error':
            return {
              content: [{ type: 'text', text: 'This tool always fails' }],
              isError: true
            };
          default:
            throw new Error('Unknown tool: ' + name);
        }
      }

      // Handle incoming messages from clients (via postMessage)
      window.addEventListener('message', async function(event) {
        if (event.source !== window) return;

        const data = event.data;
        if (!data || data.channel !== CHANNEL_ID || data.type !== 'mcp') return;
        if (data.direction !== 'client-to-server') return;

        const payload = data.payload;

        // Handle check-ready signal
        if (payload === 'mcp-check-ready') {
          window.postMessage({
            channel: CHANNEL_ID,
            type: 'mcp',
            direction: 'server-to-client',
            payload: 'mcp-server-ready'
          }, '*');
          return;
        }

        // Handle JSON-RPC requests
        if (typeof payload === 'object' && payload.jsonrpc === '2.0') {
          let result;
          let error;

          try {
            switch (payload.method) {
              case 'initialize':
                result = {
                  protocolVersion: '2024-11-05',
                  capabilities: { tools: { listChanged: true } },
                  serverInfo: { name: 'test-webmcp', version: '1.0.0' }
                };
                break;

              case 'tools/list':
                result = { tools: tools };
                break;

              case 'tools/call':
                result = executeTool(payload.params.name, payload.params.arguments || {});
                break;

              default:
                error = { code: -32601, message: 'Method not found: ' + payload.method };
            }
          } catch (e) {
            error = { code: -32603, message: e.message };
          }

          // Send response
          const response = {
            jsonrpc: '2.0',
            id: payload.id
          };

          if (error) {
            response.error = error;
          } else {
            response.result = result;
          }

          window.postMessage({
            channel: CHANNEL_ID,
            type: 'mcp',
            direction: 'server-to-client',
            payload: response
          }, '*');
        }
      });

      // Mark modelContext as available (for detection)
      navigator.modelContext = {
        registerTool: function() {},
        provideContext: function() {}
      };

      // Broadcast server ready on load
      window.postMessage({
        channel: CHANNEL_ID,
        type: 'mcp',
        direction: 'server-to-client',
        payload: 'mcp-server-ready'
      }, '*');

      console.log('[Mock WebMCP] Server initialized');
    })();
  </script>
</body>
</html>
`;

describe('webmcp tools', () => {
  const server = serverHooks();

  describe('diff_webmcp_tools', () => {
    it('shows no tools when none registered', async () => {
      await withMcpContext(
        async (response, context) => {
          await diffWebMCPTools.handler({params: {}}, response, context);

          const output = response.responseLines.join('\n');
          assert.ok(
            output.includes('No WebMCP tools registered'),
            'Should indicate no tools registered',
          );
        },
        {withToolHub: true},
      );
    });

    it('shows registered tools after WebMCP connection', async () => {
      server.addHtmlRoute('/webmcp', MOCK_WEBMCP_PAGE);

      await withMcpContext(
        async (response, context) => {
          const page = context.getSelectedPage();
          await page.goto(server.getRoute('/webmcp'));

          // Wait for page to initialize
          await page.waitForFunction(() => {
            return (
              typeof (window as {navigator: {modelContext?: unknown}}).navigator
                .modelContext !== 'undefined'
            );
          });

          // Connect to WebMCP to sync tools to the hub
          const result = await context.getWebMCPClient(page);
          assert.ok(result.connected, 'Should connect to WebMCP');

          // Now diff_webmcp_tools should show the registered tools
          await diffWebMCPTools.handler({params: {}}, response, context);

          const output = response.responseLines.join('\n');
          assert.ok(
            output.includes('3 WebMCP tool(s) registered'),
            'Should show 3 tools',
          );
          // Check for prefixed tool names
          assert.ok(
            output.includes('webmcp_localhost'),
            'Should show prefixed tool names',
          );
          assert.ok(output.includes('test_add'), 'Should include test_add');
          assert.ok(
            output.includes('Add two numbers'),
            'Should show description',
          );
        },
        {withToolHub: true},
      );
    });

    it('shows no changes on second call', async () => {
      server.addHtmlRoute('/webmcp2', MOCK_WEBMCP_PAGE);

      await withMcpContext(
        async (response, context) => {
          const page = context.getSelectedPage();
          await page.goto(server.getRoute('/webmcp2'));

          await page.waitForFunction(() => {
            return (
              typeof (window as {navigator: {modelContext?: unknown}}).navigator
                .modelContext !== 'undefined'
            );
          });

          // Connect and sync tools
          await context.getWebMCPClient(page);

          // First call - full list
          await diffWebMCPTools.handler({params: {}}, response, context);
          assert.ok(
            response.responseLines.join('\n').includes('3 WebMCP tool(s)'),
            'First call should show full list',
          );

          response.resetResponseLineForTesting();

          // Second call - should show no changes but still list available tools
          await diffWebMCPTools.handler({params: {}}, response, context);
          const output = response.responseLines.join('\n');
          assert.ok(
            output.includes('No changes since last poll'),
            'Second call should show no changes',
          );
          assert.ok(
            output.includes('3 tools available'),
            'Should show tool count summary',
          );
          assert.ok(
            output.includes('test_add'),
            'Should list available tool names',
          );
        },
        {withToolHub: true},
      );
    });

    it('full=true forces full list', async () => {
      server.addHtmlRoute('/webmcp3', MOCK_WEBMCP_PAGE);

      await withMcpContext(
        async (response, context) => {
          const page = context.getSelectedPage();
          await page.goto(server.getRoute('/webmcp3'));

          await page.waitForFunction(() => {
            return (
              typeof (window as {navigator: {modelContext?: unknown}}).navigator
                .modelContext !== 'undefined'
            );
          });

          // Connect and sync tools
          await context.getWebMCPClient(page);

          // First call
          await diffWebMCPTools.handler({params: {}}, response, context);
          response.resetResponseLineForTesting();

          // Second call with full=true - should show full list
          await diffWebMCPTools.handler({params: {full: true}}, response, context);
          assert.ok(
            response.responseLines.join('\n').includes('3 WebMCP tool(s)'),
            'full=true should show full list',
          );
        },
        {withToolHub: true},
      );
    });

    it('returns error when WebMCPToolHub not initialized', async () => {
      // Test without withToolHub option
      await withMcpContext(async (response, context) => {
        await diffWebMCPTools.handler({params: {}}, response, context);

        const output = response.responseLines.join('\n');
        assert.ok(
          output.includes('WebMCPToolHub not initialized'),
          'Should indicate hub not initialized',
        );
      });
    });
  });
});
