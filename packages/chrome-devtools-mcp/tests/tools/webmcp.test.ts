/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  connectWebMCP,
  disconnectWebMCP,
  listWebMCPTools,
  callWebMCPTool,
} from '../../src/tools/webmcp.js';
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

/**
 * A page without WebMCP to test detection
 */
const NO_WEBMCP_PAGE = `
<!DOCTYPE html>
<html>
<head><title>Regular Page</title></head>
<body><h1>No WebMCP here</h1></body>
</html>
`;

describe('webmcp tools', () => {
  const server = serverHooks();

  describe('connect_webmcp', () => {
    it('connects to a page with WebMCP and lists tools', async () => {
      server.addHtmlRoute('/webmcp', MOCK_WEBMCP_PAGE);

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/webmcp'));

        // Wait for page to initialize
        await page.waitForFunction(() => {
          return typeof (window as {navigator: {modelContext?: unknown}}).navigator.modelContext !== 'undefined';
        });

        await connectWebMCP.handler({params: {}}, response, context);

        const output = response.responseLines.join('\\n');
        assert.ok(output.includes('Connected to WebMCP server'), 'Should show connected message');
        assert.ok(output.includes('test_add'), 'Should list test_add tool');
        assert.ok(output.includes('test_greet'), 'Should list test_greet tool');
      });
    });

    it('shows error on page without WebMCP', async () => {
      server.addHtmlRoute('/regular', NO_WEBMCP_PAGE);

      await withMcpContext(async (response, context) => {
        // First disconnect any existing connection
        await disconnectWebMCP.handler({params: {}}, response, context);
        response.resetResponseLineForTesting();

        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/regular'));

        await connectWebMCP.handler({params: {}}, response, context);

        const output = response.responseLines.join('\\n');
        assert.ok(output.includes('WebMCP not detected'), 'Should show not detected message');
      });
    });

    it('prevents double connection', async () => {
      server.addHtmlRoute('/webmcp2', MOCK_WEBMCP_PAGE);

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/webmcp2'));

        await page.waitForFunction(() => {
          return typeof (window as {navigator: {modelContext?: unknown}}).navigator.modelContext !== 'undefined';
        });

        // First connection
        await connectWebMCP.handler({params: {}}, response, context);
        response.resetResponseLineForTesting();

        // Second connection attempt
        await connectWebMCP.handler({params: {}}, response, context);

        const output = response.responseLines.join('\\n');
        assert.ok(output.includes('Already connected'), 'Should show already connected message');

        // Cleanup
        await disconnectWebMCP.handler({params: {}}, response, context);
      });
    });
  });

  describe('list_webmcp_tools', () => {
    it('lists tools when connected', async () => {
      server.addHtmlRoute('/webmcp3', MOCK_WEBMCP_PAGE);

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/webmcp3'));

        await page.waitForFunction(() => {
          return typeof (window as {navigator: {modelContext?: unknown}}).navigator.modelContext !== 'undefined';
        });

        await connectWebMCP.handler({params: {}}, response, context);
        response.resetResponseLineForTesting();

        await listWebMCPTools.handler({params: {}}, response, context);

        const output = response.responseLines.join('\\n');
        assert.ok(output.includes('3 tool(s) available'), 'Should show 3 tools');
        assert.ok(output.includes('test_add'), 'Should list test_add');
        assert.ok(output.includes('Add two numbers'), 'Should show description');

        // Cleanup
        await disconnectWebMCP.handler({params: {}}, response, context);
      });
    });

    it('shows error when not connected', async () => {
      await withMcpContext(async (response, context) => {
        // Ensure disconnected
        await disconnectWebMCP.handler({params: {}}, response, context);
        response.resetResponseLineForTesting();

        await listWebMCPTools.handler({params: {}}, response, context);

        const output = response.responseLines.join('\\n');
        assert.ok(output.includes('Not connected'), 'Should show not connected message');
      });
    });
  });

  describe('call_webmcp_tool', () => {
    it('calls a tool and returns result', async () => {
      server.addHtmlRoute('/webmcp4', MOCK_WEBMCP_PAGE);

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/webmcp4'));

        await page.waitForFunction(() => {
          return typeof (window as {navigator: {modelContext?: unknown}}).navigator.modelContext !== 'undefined';
        });

        await connectWebMCP.handler({params: {}}, response, context);
        response.resetResponseLineForTesting();

        await callWebMCPTool.handler(
          {params: {name: 'test_add', arguments: {a: 5, b: 3}}},
          response,
          context
        );

        const output = response.responseLines.join('\\n');
        assert.ok(output.includes('Calling tool: test_add'), 'Should show tool name');
        assert.ok(output.includes('8'), 'Should show result (5+3=8)');

        // Cleanup
        await disconnectWebMCP.handler({params: {}}, response, context);
      });
    });

    it('calls a tool with string result', async () => {
      server.addHtmlRoute('/webmcp5', MOCK_WEBMCP_PAGE);

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/webmcp5'));

        await page.waitForFunction(() => {
          return typeof (window as {navigator: {modelContext?: unknown}}).navigator.modelContext !== 'undefined';
        });

        await connectWebMCP.handler({params: {}}, response, context);
        response.resetResponseLineForTesting();

        await callWebMCPTool.handler(
          {params: {name: 'test_greet', arguments: {name: 'World'}}},
          response,
          context
        );

        const output = response.responseLines.join('\\n');
        assert.ok(output.includes('Hello, World!'), 'Should show greeting');

        // Cleanup
        await disconnectWebMCP.handler({params: {}}, response, context);
      });
    });

    it('shows error for tool that returns isError', async () => {
      server.addHtmlRoute('/webmcp6', MOCK_WEBMCP_PAGE);

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/webmcp6'));

        await page.waitForFunction(() => {
          return typeof (window as {navigator: {modelContext?: unknown}}).navigator.modelContext !== 'undefined';
        });

        await connectWebMCP.handler({params: {}}, response, context);
        response.resetResponseLineForTesting();

        await callWebMCPTool.handler(
          {params: {name: 'test_error', arguments: {}}},
          response,
          context
        );

        const output = response.responseLines.join('\\n');
        assert.ok(output.includes('Tool returned an error'), 'Should indicate error');

        // Cleanup
        await disconnectWebMCP.handler({params: {}}, response, context);
      });
    });

    it('shows error when not connected', async () => {
      await withMcpContext(async (response, context) => {
        // Ensure disconnected
        await disconnectWebMCP.handler({params: {}}, response, context);
        response.resetResponseLineForTesting();

        await callWebMCPTool.handler(
          {params: {name: 'test_add', arguments: {a: 1, b: 2}}},
          response,
          context
        );

        const output = response.responseLines.join('\\n');
        assert.ok(output.includes('Not connected'), 'Should show not connected message');
      });
    });
  });

  describe('disconnect_webmcp', () => {
    it('disconnects from WebMCP', async () => {
      server.addHtmlRoute('/webmcp7', MOCK_WEBMCP_PAGE);

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/webmcp7'));

        await page.waitForFunction(() => {
          return typeof (window as {navigator: {modelContext?: unknown}}).navigator.modelContext !== 'undefined';
        });

        await connectWebMCP.handler({params: {}}, response, context);
        response.resetResponseLineForTesting();

        await disconnectWebMCP.handler({params: {}}, response, context);

        const output = response.responseLines.join('\\n');
        assert.ok(output.includes('Disconnected'), 'Should show disconnected message');

        // Verify we can't list tools after disconnect
        response.resetResponseLineForTesting();
        await listWebMCPTools.handler({params: {}}, response, context);
        const output2 = response.responseLines.join('\\n');
        assert.ok(output2.includes('Not connected'), 'Should be disconnected');
      });
    });

    it('handles disconnect when not connected', async () => {
      await withMcpContext(async (response, context) => {
        // Ensure disconnected first
        await disconnectWebMCP.handler({params: {}}, response, context);
        response.resetResponseLineForTesting();

        // Try to disconnect again
        await disconnectWebMCP.handler({params: {}}, response, context);

        const output = response.responseLines.join('\\n');
        assert.ok(output.includes('Not connected'), 'Should show not connected message');
      });
    });
  });
});
