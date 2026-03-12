/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {listWebMCPTools} from '../../src/tools/webmcp.js';
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

  describe('list_webmcp_tools', () => {
    it('shows message when no tools registered', async () => {
      await withMcpContext(
        async (response, context) => {
          await listWebMCPTools.handler({params: {}}, response, context);

          const output = response.responseLines.join('\n');
          assert.ok(
            output.includes('No WebMCP tools registered'),
            'Should indicate no tools registered',
          );
        },
        {withToolHub: true},
      );
    });

    it('shows registered tools with schemas after WebMCP connection', async () => {
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

          // Now list_webmcp_tools should show the registered tools as JSON
          await listWebMCPTools.handler({params: {}}, response, context);

          const output = response.responseLines.join('\n');
          const parsed = JSON.parse(output);

          assert.ok(Array.isArray(parsed.tools), 'Should have tools array');
          assert.strictEqual(parsed.tools.length, 3, 'Should have 3 tools');

          // Check tool structure
          const testAdd = parsed.tools.find((t: {name: string}) => t.name === 'test_add');
          assert.ok(testAdd, 'Should include test_add');
          assert.ok(testAdd.description.includes('Add two numbers'), 'Should have description');
          assert.ok(testAdd.inputSchema, 'Should include inputSchema');
          assert.deepStrictEqual(testAdd.inputSchema.required, ['a', 'b'], 'Should have required params');
        },
        {withToolHub: true},
      );
    });

    it('returns same full list on every call (no diff)', async () => {
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

          // First call
          await listWebMCPTools.handler({params: {}}, response, context);
          const firstOutput = response.responseLines.join('\n');
          const firstParsed = JSON.parse(firstOutput);

          response.resetResponseLineForTesting();

          // Second call - should return same full list (no diff)
          await listWebMCPTools.handler({params: {}}, response, context);
          const secondOutput = response.responseLines.join('\n');
          const secondParsed = JSON.parse(secondOutput);

          assert.strictEqual(
            firstParsed.tools.length,
            secondParsed.tools.length,
            'Both calls should return same number of tools',
          );
        },
        {withToolHub: true},
      );
    });
  });
});
