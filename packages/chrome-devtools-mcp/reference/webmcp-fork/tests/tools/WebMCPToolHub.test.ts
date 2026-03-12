/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  sanitizeName,
  extractDomain,
  getDisplayDomain,
} from '../../src/tools/WebMCPToolHub.js';
import {serverHooks} from '../server.js';
import {withMcpContext} from '../utils.js';

/**
 * A minimal mock of @mcp-b/global's TabServerTransport behavior.
 * This simulates a WebMCP server running in a page with dynamic tools.
 */
function buildMockWebMCPPage(options: {
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>;
  supportsListChanged?: boolean;
} = {}) {
  // Ensure all tools have proper inputSchema with type: "object" as required by MCP SDK
  const tools = (options.tools || [
    {
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: {
        type: 'object',
        properties: {arg1: {type: 'string'}},
      },
    },
  ]).map(tool => ({
    ...tool,
    inputSchema: tool.inputSchema || {type: 'object', properties: {}},
  }));

  const supportsListChanged = options.supportsListChanged ?? true;

  return `
<!DOCTYPE html>
<html>
<head>
  <title>WebMCP Test Page</title>
</head>
<body>
  <h1>WebMCP Test Page</h1>
  <script>
    (function() {
      const CHANNEL_ID = 'mcp-default';
      const tools = ${JSON.stringify(tools)};

      // Tool handlers
      function executeTool(name, args) {
        const tool = tools.find(t => t.name === name);
        if (!tool) {
          throw new Error('Unknown tool: ' + name);
        }
        return { content: [{ type: 'text', text: 'Tool ' + name + ' called with: ' + JSON.stringify(args) }] };
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
                  capabilities: { tools: { listChanged: ${supportsListChanged} } },
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

      console.log('[Mock WebMCP] Server initialized with ${tools.length} tools');
    })();
  </script>
</body>
</html>
`;
}

/**
 * Build a mock WebMCP page with dynamic tool update support.
 * This mock can update its tools and send notifications/tools/list_changed.
 */
function buildDynamicMockWebMCPPage(options: {
  initialTools?: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>;
  supportsListChanged?: boolean;
} = {}) {
  const initialTools = (options.initialTools || []).map(tool => ({
    ...tool,
    inputSchema: tool.inputSchema || {type: 'object', properties: {}},
  }));

  const supportsListChanged = options.supportsListChanged ?? true;

  return `
<!DOCTYPE html>
<html>
<head>
  <title>Dynamic WebMCP Test Page</title>
</head>
<body>
  <h1>Dynamic WebMCP Test Page</h1>
  <script>
    (function() {
      const CHANNEL_ID = 'mcp-default';
      let tools = ${JSON.stringify(initialTools)};

      // Expose update function globally for tests
      window.__webmcpUpdateTools = function(newTools) {
        tools = newTools.map(t => ({
          ...t,
          inputSchema: t.inputSchema || { type: 'object', properties: {} }
        }));
        // Send list_changed notification
        if (${supportsListChanged}) {
          window.postMessage({
            channel: CHANNEL_ID,
            type: 'mcp',
            direction: 'server-to-client',
            payload: {
              jsonrpc: '2.0',
              method: 'notifications/tools/list_changed'
            }
          }, '*');
        }
      };

      // Tool handlers
      function executeTool(name, args) {
        const tool = tools.find(t => t.name === name);
        if (!tool) {
          throw new Error('Unknown tool: ' + name);
        }
        return { content: [{ type: 'text', text: 'Tool ' + name + ' called with: ' + JSON.stringify(args) }] };
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
                  capabilities: { tools: { listChanged: ${supportsListChanged} } },
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

      console.log('[Dynamic Mock WebMCP] Server initialized with ' + tools.length + ' tools');
    })();
  </script>
</body>
</html>
`;
}

describe('WebMCPToolHub', () => {
  describe('Helper Functions', () => {
    describe('sanitizeName', () => {
      it('keeps alphanumeric and underscore', () => {
        assert.strictEqual(sanitizeName('test_tool_123'), 'test_tool_123');
      });

      it('replaces dashes with underscore', () => {
        assert.strictEqual(sanitizeName('get-todos'), 'get_todos');
      });

      it('replaces special characters with underscore', () => {
        assert.strictEqual(sanitizeName('tool@name!'), 'tool_name_');
      });

      it('replaces spaces with underscore', () => {
        assert.strictEqual(sanitizeName('my tool'), 'my_tool');
      });

      it('handles empty string', () => {
        assert.strictEqual(sanitizeName(''), '');
      });
    });

    describe('extractDomain', () => {
      it('extracts localhost with port', () => {
        assert.strictEqual(
          extractDomain('http://localhost:3000/page'),
          'localhost_3000',
        );
      });

      it('extracts localhost with default port 80', () => {
        assert.strictEqual(extractDomain('http://localhost'), 'localhost_80');
      });

      it('extracts 127.0.0.1 as localhost', () => {
        assert.strictEqual(
          extractDomain('http://127.0.0.1:8080'),
          'localhost_8080',
        );
      });

      it('extracts github.com', () => {
        assert.strictEqual(
          extractDomain('https://github.com/repo'),
          'github_com',
        );
      });

      it('extracts subdomain', () => {
        assert.strictEqual(
          extractDomain('https://api.github.com/endpoint'),
          'api_github_com',
        );
      });

      it('returns unknown for invalid URL', () => {
        assert.strictEqual(extractDomain('not-a-url'), 'unknown');
      });

      it('returns unknown for empty string', () => {
        assert.strictEqual(extractDomain(''), 'unknown');
      });
    });

    describe('getDisplayDomain', () => {
      it('converts localhost_3000 to localhost:3000', () => {
        assert.strictEqual(getDisplayDomain('localhost_3000'), 'localhost:3000');
      });

      it('converts localhost_80 to localhost:80', () => {
        assert.strictEqual(getDisplayDomain('localhost_80'), 'localhost:80');
      });

      it('converts github_com to github.com', () => {
        assert.strictEqual(getDisplayDomain('github_com'), 'github.com');
      });

      it('converts api_github_com to api.github.com', () => {
        assert.strictEqual(
          getDisplayDomain('api_github_com'),
          'api.github.com',
        );
      });

      it('handles already formatted string', () => {
        // If someone passes an already formatted string, underscores become dots
        assert.strictEqual(getDisplayDomain('example.com'), 'example.com');
      });
    });
  });

  describe('Tool Registration Integration', () => {
    const server = serverHooks();

    it('registers WebMCP tools when page with WebMCP connects', async () => {
      server.addHtmlRoute('/webmcp-hub-test', buildMockWebMCPPage({
        tools: [
          {name: 'add_item', description: 'Add an item'},
          {name: 'remove_item', description: 'Remove an item'},
        ],
      }));

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/webmcp-hub-test'));

        // Wait for page to initialize
        await page.waitForFunction(() => {
          return typeof (window as {navigator: {modelContext?: unknown}}).navigator.modelContext !== 'undefined';
        });

        // Connect to trigger tool registration
        const result = await context.getWebMCPClient(page);
        assert.ok(result.connected, 'Should connect to WebMCP');

        // Verify tools are available from client
        if (result.connected) {
          const listResult = await result.client.listTools();
          assert.strictEqual(listResult.tools.length, 2, 'Client should see 2 tools');
        }

        // Check tool hub has registered tools
        const toolHub = context.getToolHub();
        assert.ok(toolHub, 'Tool hub should exist');
        assert.ok(toolHub.isEnabled(), 'Tool hub should be enabled');
        assert.strictEqual(toolHub.getToolCount(), 2, 'Should have 2 tools registered');

        // Check tool IDs follow naming convention
        const toolIds = toolHub.getRegisteredToolIds();
        assert.ok(toolIds.some(id => id.includes('webmcp_localhost_')), 'Tool ID should include webmcp_localhost');
        assert.ok(toolIds.some(id => id.includes('add_item')), 'Should have add_item tool');
        assert.ok(toolIds.some(id => id.includes('remove_item')), 'Should have remove_item tool');
      }, {withToolHub: true});
    });

    it('removes tools when page navigates away', async () => {
      const webmcpPage = buildMockWebMCPPage({
        tools: [{name: 'test_tool', description: 'Test'}],
      });
      server.addHtmlRoute('/webmcp-nav1', webmcpPage);

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/webmcp-nav1'));

        await page.waitForFunction(() => {
          return typeof (window as {navigator: {modelContext?: unknown}}).navigator.modelContext !== 'undefined';
        });

        // Connect and register tools
        const result = await context.getWebMCPClient(page);
        assert.ok(result.connected, 'Should connect to WebMCP');

        const toolHub = context.getToolHub();
        assert.ok(toolHub, 'Tool hub should exist');
        assert.strictEqual(toolHub.getToolCount(), 1, 'Should have 1 tool registered');

        // Navigate away (to a non-WebMCP page)
        await page.goto('about:blank');

        // Wait a bit for the navigation to be processed
        await new Promise(resolve => setTimeout(resolve, 100));

        // Tools should be removed after navigation
        assert.strictEqual(toolHub.getToolCount(), 0, 'Tools should be removed after navigation');
      }, {withToolHub: true});
    });

    it('generates correct tool names with domain and page index', async () => {
      server.addHtmlRoute('/webmcp-naming', buildMockWebMCPPage({
        tools: [{name: 'my-tool', description: 'A tool'}],
      }));

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/webmcp-naming'));

        await page.waitForFunction(() => {
          return typeof (window as {navigator: {modelContext?: unknown}}).navigator.modelContext !== 'undefined';
        });

        const result = await context.getWebMCPClient(page);
        assert.ok(result.connected);

        const toolHub = context.getToolHub();
        const toolIds = toolHub!.getRegisteredToolIds();

        // Should follow pattern: webmcp_{domain}_page{idx}_{toolName}
        assert.ok(toolIds.length > 0, 'Should have at least one tool');
        const toolId = toolIds[0];

        // Check the pattern - localhost:XXXXX becomes localhost_XXXXX
        assert.ok(toolId.startsWith('webmcp_localhost_'), 'Should start with webmcp_localhost_');
        assert.ok(toolId.includes('_page0_'), 'Should include _page0_ for first page');
        assert.ok(toolId.endsWith('_my_tool'), 'Should end with sanitized tool name');
      }, {withToolHub: true});
    });

    it('handles multiple pages with different tools', async () => {
      server.addHtmlRoute('/page1', buildMockWebMCPPage({
        tools: [{name: 'tool_a', description: 'Tool A'}],
      }));
      server.addHtmlRoute('/page2', buildMockWebMCPPage({
        tools: [{name: 'tool_b', description: 'Tool B'}],
      }));

      await withMcpContext(async (response, context) => {
        // Set up first page
        const page1 = context.getSelectedPage();
        await page1.goto(server.getRoute('/page1'));
        await page1.waitForFunction(() => {
          return typeof (window as {navigator: {modelContext?: unknown}}).navigator.modelContext !== 'undefined';
        });

        const result1 = await context.getWebMCPClient(page1);
        assert.ok(result1.connected);

        // Create and set up second page
        const page2 = await context.newPage();
        await page2.goto(server.getRoute('/page2'));
        await page2.waitForFunction(() => {
          return typeof (window as {navigator: {modelContext?: unknown}}).navigator.modelContext !== 'undefined';
        });

        const result2 = await context.getWebMCPClient(page2);
        assert.ok(result2.connected);

        const toolHub = context.getToolHub();
        assert.ok(toolHub, 'Tool hub should exist');

        // Should have tools from both pages
        assert.strictEqual(toolHub.getToolCount(), 2, 'Should have 2 tools (one from each page)');

        const toolIds = toolHub.getRegisteredToolIds();
        assert.ok(toolIds.some(id => id.includes('tool_a')), 'Should have tool_a');
        assert.ok(toolIds.some(id => id.includes('tool_b')), 'Should have tool_b');
        assert.ok(toolIds.some(id => id.includes('_page0_')), 'Should have page0 tool');
        assert.ok(toolIds.some(id => id.includes('_page1_')), 'Should have page1 tool');
      }, {withToolHub: true});
    });

    it('removes tools when page is closed', async () => {
      server.addHtmlRoute('/webmcp-close-test', buildMockWebMCPPage({
        tools: [{name: 'close_test_tool', description: 'Tool to test page close'}],
      }));

      await withMcpContext(async (response, context) => {
        // Create a new page (so we can close it without closing the only page)
        const page = await context.newPage();
        await page.goto(server.getRoute('/webmcp-close-test'));

        await page.waitForFunction(() => {
          return typeof (window as {navigator: {modelContext?: unknown}}).navigator.modelContext !== 'undefined';
        });

        // Connect and register tools
        const result = await context.getWebMCPClient(page);
        assert.ok(result.connected, 'Should connect to WebMCP');

        const toolHub = context.getToolHub();
        assert.ok(toolHub, 'Tool hub should exist');

        // Verify tool is registered
        const toolsBefore = toolHub.getRegisteredToolIds();
        assert.ok(toolsBefore.some(id => id.includes('close_test_tool')), 'Should have close_test_tool');

        // Close the page
        await page.close();

        // Wait for cleanup
        await new Promise(resolve => setTimeout(resolve, 100));

        // Tools should be removed
        const toolsAfter = toolHub.getRegisteredToolIds();
        assert.ok(!toolsAfter.some(id => id.includes('close_test_tool')), 'Tool should be removed after page close');
      }, {withToolHub: true});
    });
  });

  describe('list_changed Event Handling', () => {
    const server = serverHooks();

    it('syncs tools when list_changed notification is received', async () => {
      server.addHtmlRoute('/webmcp-list-changed', buildDynamicMockWebMCPPage({
        initialTools: [{name: 'initial_tool', description: 'Initial tool'}],
      }));

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/webmcp-list-changed'));

        await page.waitForFunction(() => {
          return typeof (window as {navigator: {modelContext?: unknown}}).navigator.modelContext !== 'undefined';
        });

        // Connect and verify initial tools
        const result = await context.getWebMCPClient(page);
        assert.ok(result.connected, 'Should connect to WebMCP');

        const toolHub = context.getToolHub();
        assert.ok(toolHub, 'Tool hub should exist');
        assert.strictEqual(toolHub.getToolCount(), 1, 'Should have 1 initial tool');

        let toolIds = toolHub.getRegisteredToolIds();
        assert.ok(toolIds.some(id => id.includes('initial_tool')), 'Should have initial_tool');

        // Update tools and trigger list_changed
        await page.evaluate(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__webmcpUpdateTools([
            {name: 'new_tool_1', description: 'New tool 1'},
            {name: 'new_tool_2', description: 'New tool 2'},
          ]);
        });

        // Wait for sync to complete
        await new Promise(resolve => setTimeout(resolve, 200));

        // Verify tools were updated
        assert.strictEqual(toolHub.getToolCount(), 2, 'Should have 2 tools after update');
        toolIds = toolHub.getRegisteredToolIds();
        assert.ok(!toolIds.some(id => id.includes('initial_tool')), 'initial_tool should be removed');
        assert.ok(toolIds.some(id => id.includes('new_tool_1')), 'Should have new_tool_1');
        assert.ok(toolIds.some(id => id.includes('new_tool_2')), 'Should have new_tool_2');
      }, {withToolHub: true});
    });

    it('removes tools when list_changed returns empty list', async () => {
      server.addHtmlRoute('/webmcp-remove-all', buildDynamicMockWebMCPPage({
        initialTools: [
          {name: 'tool_1', description: 'Tool 1'},
          {name: 'tool_2', description: 'Tool 2'},
        ],
      }));

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/webmcp-remove-all'));

        await page.waitForFunction(() => {
          return typeof (window as {navigator: {modelContext?: unknown}}).navigator.modelContext !== 'undefined';
        });

        const result = await context.getWebMCPClient(page);
        assert.ok(result.connected);

        const toolHub = context.getToolHub();
        assert.strictEqual(toolHub!.getToolCount(), 2, 'Should have 2 tools initially');

        // Update to empty list
        await page.evaluate(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__webmcpUpdateTools([]);
        });

        await new Promise(resolve => setTimeout(resolve, 200));

        // All tools should be removed
        assert.strictEqual(toolHub!.getToolCount(), 0, 'Should have 0 tools after empty update');
      }, {withToolHub: true});
    });

    it('updates existing tools when list_changed modifies them', async () => {
      server.addHtmlRoute('/webmcp-update-existing', buildDynamicMockWebMCPPage({
        initialTools: [{name: 'my_tool', description: 'Original description'}],
      }));

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/webmcp-update-existing'));

        await page.waitForFunction(() => {
          return typeof (window as {navigator: {modelContext?: unknown}}).navigator.modelContext !== 'undefined';
        });

        const result = await context.getWebMCPClient(page);
        assert.ok(result.connected);

        const toolHub = context.getToolHub();
        assert.strictEqual(toolHub!.getToolCount(), 1, 'Should have 1 tool');

        // Get initial tool ID
        const initialToolIds = toolHub!.getRegisteredToolIds();
        const toolId = initialToolIds.find(id => id.includes('my_tool'));
        assert.ok(toolId, 'Should find my_tool');

        // Update tool with same name but different description
        await page.evaluate(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__webmcpUpdateTools([
            {name: 'my_tool', description: 'Updated description'},
          ]);
        });

        await new Promise(resolve => setTimeout(resolve, 200));

        // Should still have 1 tool with same ID
        assert.strictEqual(toolHub!.getToolCount(), 1, 'Should still have 1 tool');
        const updatedToolIds = toolHub!.getRegisteredToolIds();
        assert.ok(updatedToolIds.includes(toolId!), 'Tool ID should be unchanged');
      }, {withToolHub: true});
    });
  });

  describe('Tool Execution with Flat Args', () => {
    const server = serverHooks();

    /** Type for tool call result content */
    type ToolContent = Array<{type: string; text?: string}>;

    it('executes registered tool with flat args (not wrapped in arguments)', async () => {
      server.addHtmlRoute('/webmcp-exec-test', buildMockWebMCPPage({
        tools: [{
          name: 'greet',
          description: 'Greet a user',
          inputSchema: {
            type: 'object',
            properties: {
              name: {type: 'string'},
            },
          },
        }],
      }));

      await withMcpContext(async (_response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/webmcp-exec-test'));

        await page.waitForFunction(() => {
          return typeof (window as {navigator: {modelContext?: unknown}}).navigator.modelContext !== 'undefined';
        });

        // Connect to trigger tool registration
        const result = await context.getWebMCPClient(page);
        assert.ok(result.connected, 'Should connect to WebMCP');

        const toolHub = context.getToolHub();
        assert.ok(toolHub, 'Tool hub should exist');
        assert.strictEqual(toolHub.getToolCount(), 1, 'Should have 1 tool');

        // Verify the tool is registered
        const toolIds = toolHub.getRegisteredToolIds();
        const toolId = toolIds.find(id => id.includes('greet'));
        assert.ok(toolId, 'Should find greet tool');

        // Call the tool via WebMCP client directly with flat args
        if (result.connected) {
          const callResult = await result.client.callTool({
            name: 'greet',
            arguments: {name: 'Alice'},  // flat args, not wrapped
          });

          assert.ok(callResult, 'Should get result');
          const content = callResult.content as ToolContent;
          assert.ok(content, 'Should have content');
          assert.strictEqual(content.length, 1, 'Should have one content item');

          const textContent = content[0];
          assert.strictEqual(textContent.type, 'text', 'Should be text content');
          assert.ok(
            textContent.text?.includes('greet'),
            'Result should mention the tool name'
          );
          assert.ok(
            textContent.text?.includes('Alice'),
            'Result should include the argument value'
          );
        }
      }, {withToolHub: true});
    });

    it('executes tool with multiple arguments', async () => {
      server.addHtmlRoute('/webmcp-multi-args', buildMockWebMCPPage({
        tools: [{
          name: 'add_numbers',
          description: 'Add two numbers',
          inputSchema: {
            type: 'object',
            properties: {
              a: {type: 'number'},
              b: {type: 'number'},
            },
          },
        }],
      }));

      await withMcpContext(async (_response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/webmcp-multi-args'));

        await page.waitForFunction(() => {
          return typeof (window as {navigator: {modelContext?: unknown}}).navigator.modelContext !== 'undefined';
        });

        const result = await context.getWebMCPClient(page);
        assert.ok(result.connected);

        if (result.connected) {
          // Call with flat args containing multiple properties
          const callResult = await result.client.callTool({
            name: 'add_numbers',
            arguments: {a: 5, b: 3},  // flat args
          });

          const content = callResult.content as ToolContent;
          assert.ok(content, 'Should have content');
          const textContent = content[0];
          assert.strictEqual(textContent.type, 'text');
          // The mock returns the args as JSON
          assert.ok(textContent.text?.includes('5'), 'Result should include first arg');
          assert.ok(textContent.text?.includes('3'), 'Result should include second arg');
        }
      }, {withToolHub: true});
    });

    it('executes tool with no arguments', async () => {
      server.addHtmlRoute('/webmcp-no-args', buildMockWebMCPPage({
        tools: [{
          name: 'get_time',
          description: 'Get current time',
          inputSchema: {type: 'object', properties: {}},
        }],
      }));

      await withMcpContext(async (_response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/webmcp-no-args'));

        await page.waitForFunction(() => {
          return typeof (window as {navigator: {modelContext?: unknown}}).navigator.modelContext !== 'undefined';
        });

        const result = await context.getWebMCPClient(page);
        assert.ok(result.connected);

        if (result.connected) {
          // Call with empty args
          const callResult = await result.client.callTool({
            name: 'get_time',
            arguments: {},  // empty flat args
          });

          const content = callResult.content as ToolContent;
          assert.ok(content, 'Should have content');
          assert.strictEqual(content[0].type, 'text');
        }
      }, {withToolHub: true});
    });

    it('returns error for unknown tool', async () => {
      server.addHtmlRoute('/webmcp-unknown-tool', buildMockWebMCPPage({
        tools: [{name: 'known_tool', description: 'A known tool'}],
      }));

      await withMcpContext(async (_response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/webmcp-unknown-tool'));

        await page.waitForFunction(() => {
          return typeof (window as {navigator: {modelContext?: unknown}}).navigator.modelContext !== 'undefined';
        });

        const result = await context.getWebMCPClient(page);
        assert.ok(result.connected);

        if (result.connected) {
          try {
            await result.client.callTool({
              name: 'nonexistent_tool',
              arguments: {},
            });
            assert.fail('Should have thrown for unknown tool');
          } catch (err) {
            assert.ok(err instanceof Error);
            assert.ok(err.message.includes('Unknown tool'), 'Error should mention unknown tool');
          }
        }
      }, {withToolHub: true});
    });
  });

  describe('Special URL Handling', () => {
    describe('extractDomain edge cases', () => {
      it('handles about:blank URL', () => {
        // about:blank has empty hostname
        assert.strictEqual(extractDomain('about:blank'), 'unknown');
      });

      it('handles file:// URL', () => {
        // file:// URLs have empty hostname
        assert.strictEqual(extractDomain('file:///path/to/file.html'), 'unknown');
      });

      it('handles data: URL', () => {
        // data: URLs are not valid URLs for domain extraction
        assert.strictEqual(extractDomain('data:text/html,<h1>test</h1>'), 'unknown');
      });

      it('handles IPv6 localhost', () => {
        // IPv6 localhost should be treated as localhost
        assert.strictEqual(extractDomain('http://[::1]:3000/'), 'localhost_3000');
      });

      it('handles chrome:// URL', () => {
        // chrome:// URLs have the path component as hostname (e.g., 'settings' for chrome://settings)
        const result = extractDomain('chrome://settings');
        assert.strictEqual(result, 'settings');
      });

      it('handles chrome-extension:// URL', () => {
        // Extension URLs have an ID as hostname
        const result = extractDomain('chrome-extension://abcdefghijklmnop/popup.html');
        assert.strictEqual(result, 'abcdefghijklmnop');
      });
    });
  });
});
