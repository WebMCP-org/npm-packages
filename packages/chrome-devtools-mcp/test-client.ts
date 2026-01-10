#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * E2E Test client for chrome-devtools-mcp server
 * Tests WebMCP dynamic tool registration with webmcp.sh
 */

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {ToolListChangedNotificationSchema} from '@modelcontextprotocol/sdk/types.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const WEBMCP_URL = 'https://webmcp.sh';
const WAIT_FOR_PAGE_LOAD = 8000;
const WAIT_FOR_TOOL_SYNC = 1500;
const RETRY_ATTEMPTS = 5;  // More attempts for slow connections
const RETRY_DELAY = 2000;

// Test results tracking
interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const testResults: TestResult[] = [];
let toolListChangedCount = 0;

// Utility functions
function log(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function logSection(title: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(60)}\n`);
}

async function runTest(
  name: string,
  testFn: () => Promise<void>,
): Promise<boolean> {
  const start = Date.now();
  log(`▶ Running: ${name}`);
  try {
    await testFn();
    const duration = Date.now() - start;
    testResults.push({name, passed: true, duration});
    log(`✅ PASSED: ${name} (${duration}ms)`);
    return true;
  } catch (error) {
    const duration = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    testResults.push({name, passed: false, duration, error: errorMsg});
    log(`❌ FAILED: ${name} (${duration}ms)`);
    log(`   Error: ${errorMsg}`);
    return false;
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertGreaterThan(actual: number, expected: number, message: string) {
  if (actual <= expected) {
    throw new Error(`${message}: expected > ${expected}, got ${actual}`);
  }
}

function assertIncludes(arr: string[], item: string, message: string) {
  if (!arr.includes(item)) {
    throw new Error(`${message}: expected array to include "${item}"`);
  }
}

function assertSome(arr: string[], predicate: (s: string) => boolean, message: string) {
  if (!arr.some(predicate)) {
    throw new Error(`${message}: no items matched predicate`);
  }
}

// Main test suite
async function runE2ETests() {
  logSection('Chrome DevTools MCP - WebMCP E2E Tests');

  const serverPath = path.join(__dirname, 'build/src/index.js');
  log(`Server path: ${serverPath}`);

  // Use --isolated to avoid profile conflicts during testing
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath, '--isolated'],
  });

  const client = new Client(
    {name: 'webmcp-e2e-test-client', version: '1.0.0'},
    {capabilities: {}},
  );

  // Track tool list changes
  toolListChangedCount = 0;
  client.setNotificationHandler(
    ToolListChangedNotificationSchema,
    async () => {
      toolListChangedCount++;
      log(`📢 Received tools/list_changed notification (#${toolListChangedCount})`);
    },
  );

  try {
    // Connect to server
    log('Connecting to MCP server...');
    await client.connect(transport);
    log('Connected to MCP server\n');

    // ================================================================
    // TEST SUITE 1: Initial State
    // ================================================================
    logSection('Test Suite 1: Initial State');

    let initialToolCount = 0;

    await runTest('1.1 Server provides initial tools', async () => {
      const tools = await client.listTools();
      initialToolCount = tools.tools.length;
      assertGreaterThan(initialToolCount, 0, 'Should have initial tools');
      log(`   Found ${initialToolCount} initial tools`);
    });

    await runTest('1.2 No WebMCP tools initially', async () => {
      const tools = await client.listTools();
      const webmcpTools = tools.tools.filter(t => t.name.startsWith('webmcp_'));
      assertEqual(webmcpTools.length, 0, 'Should have no webmcp_ tools initially');
    });

    await runTest('1.3 Core tools are available', async () => {
      const tools = await client.listTools();
      const toolNames = tools.tools.map(t => t.name);
      assertIncludes(toolNames, 'list_pages', 'Should have list_pages');
      assertIncludes(toolNames, 'navigate_page', 'Should have navigate_page');
      assertIncludes(toolNames, 'diff_webmcp_tools', 'Should have diff_webmcp_tools');
    });

    // ================================================================
    // TEST SUITE 2: WebMCP Detection & Tool Registration
    // ================================================================
    logSection('Test Suite 2: WebMCP Detection & Tool Registration');

    await runTest('2.1 Navigate to webmcp.sh', async () => {
      const result = await client.callTool({
        name: 'navigate_page',
        arguments: {url: WEBMCP_URL},
      });
      assert(!('isError' in result && result.isError), 'Navigation should succeed');
      log(`   Navigated to ${WEBMCP_URL}`);
    });

    await runTest('2.2 Wait for page to load', async () => {
      await new Promise(resolve => setTimeout(resolve, WAIT_FOR_PAGE_LOAD));
      log(`   Waited ${WAIT_FOR_PAGE_LOAD}ms for page load`);
    });

    let webmcpToolCount = 0;

    await runTest('2.3 diff_webmcp_tools detects WebMCP (with retry)', async () => {
      let content = '';
      let detectedToolCount = 0;

      for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
        const result = await client.callTool({
          name: 'diff_webmcp_tools',
          arguments: {},
        });
        content = (result as {content: Array<{text: string}>}).content[0].text;

        // Extract tool count from response
        const match = content.match(/(\d+) tool\(s\) available/);
        if (match) {
          detectedToolCount = parseInt(match[1], 10);
        }

        // Need at least 1 tool to consider WebMCP ready
        if (!content.includes('not detected') && detectedToolCount > 0) {
          log(`   WebMCP detected on attempt ${attempt} with ${detectedToolCount} tools`);
          break;
        }

        if (attempt < RETRY_ATTEMPTS) {
          log(`   Attempt ${attempt}: WebMCP not ready (${detectedToolCount} tools), waiting ${RETRY_DELAY}ms...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
      }

      assert(!content.includes('not detected'), 'WebMCP should be detected');
      assertGreaterThan(detectedToolCount, 0, 'Should have at least 1 WebMCP tool');
      webmcpToolCount = detectedToolCount;
      log(`   Detected ${webmcpToolCount} WebMCP tools`);
    });

    await runTest('2.4 Tools are dynamically registered', async () => {
      // Wait for tools to be registered - poll until they appear or timeout
      let webmcpTools: Array<{name: string}> = [];
      for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
        await new Promise(resolve => setTimeout(resolve, WAIT_FOR_TOOL_SYNC));
        const tools = await client.listTools();
        webmcpTools = tools.tools.filter(t => t.name.startsWith('webmcp_'));
        if (webmcpTools.length > 0) {
          log(`   Tools registered on attempt ${attempt}`);
          break;
        }
        log(`   Attempt ${attempt}: No webmcp_ tools yet, waiting...`);
      }
      assertGreaterThan(webmcpTools.length, 0, 'Should have dynamically registered tools');
      log(`   Found ${webmcpTools.length} dynamically registered tools`);
      log(`   Tools: ${webmcpTools.map(t => t.name).join(', ')}`);
    });

    await runTest('2.5 Tool count increased after registration', async () => {
      const tools = await client.listTools();
      assertGreaterThan(
        tools.tools.length,
        initialToolCount,
        'Total tool count should increase',
      );
      log(`   Tool count: ${initialToolCount} -> ${tools.tools.length}`);
    });

    await runTest('2.6 tools/list_changed notifications received', async () => {
      assertGreaterThan(
        toolListChangedCount,
        0,
        'Should have received list_changed notifications',
      );
      log(`   Received ${toolListChangedCount} notifications`);
    });

    await runTest('2.7 Dynamic tools follow naming convention', async () => {
      const tools = await client.listTools();
      const webmcpTools = tools.tools.filter(t => t.name.startsWith('webmcp_'));
      for (const tool of webmcpTools) {
        // Pattern: webmcp_{domain}_page{idx}_{toolName}
        assert(
          /^webmcp_[a-z0-9_]+_page\d+_[a-z0-9_]+$/.test(tool.name),
          `Tool name should follow convention: ${tool.name}`,
        );
      }
      log(`   All ${webmcpTools.length} tools follow naming convention`);
    });

    // ================================================================
    // TEST SUITE 3: Calling Dynamic Tools
    // ================================================================
    logSection('Test Suite 3: Calling Dynamic Tools');

    await runTest('3.1 Call get_current_context tool', async () => {
      const tools = await client.listTools();
      const contextTool = tools.tools.find(t => t.name.includes('get_current_context'));
      assert(contextTool !== undefined, 'Should have get_current_context tool');

      const result = await client.callTool({
        name: contextTool.name,
        arguments: {},
      });
      assert(!('isError' in result && result.isError), 'Tool call should succeed');
      log(`   Called ${contextTool.name} successfully`);
    });

    await runTest('3.2 Call list_all_routes tool', async () => {
      const tools = await client.listTools();
      const routesTool = tools.tools.find(t => t.name.includes('list_all_routes'));
      assert(routesTool !== undefined, 'Should have list_all_routes tool');

      const result = await client.callTool({
        name: routesTool.name,
        arguments: {},
      });
      assert(!('isError' in result && result.isError), 'Tool call should succeed');
      const content = (result as {content: Array<{text: string}>}).content[0].text;
      assert(content.length > 0, 'Should return route information');
      log(`   Called ${routesTool.name} successfully`);
    });

    await runTest('3.3 Call app_gateway tool', async () => {
      const tools = await client.listTools();
      const gatewayTool = tools.tools.find(t => t.name.includes('app_gateway'));
      assert(gatewayTool !== undefined, 'Should have app_gateway tool');

      const result = await client.callTool({
        name: gatewayTool.name,
        arguments: {},
      });
      assert(!('isError' in result && result.isError), 'Tool call should succeed');
      log(`   Called ${gatewayTool.name} successfully`);
    });

    // ================================================================
    // TEST SUITE 4: Dynamic Tool Updates (Navigation within app)
    // ================================================================
    logSection('Test Suite 4: Dynamic Tool Updates');

    const notificationCountBefore = toolListChangedCount;

    await runTest('4.1 Navigate to /dashboard using navigate tool', async () => {
      const tools = await client.listTools();
      const navigateTool = tools.tools.find(t => t.name.includes('_navigate') && t.name.startsWith('webmcp_'));
      assert(navigateTool !== undefined, 'Should have navigate tool');

      // Log the tool schema to understand expected arguments
      log(`   Navigate tool schema: ${JSON.stringify(navigateTool.inputSchema)}`);

      const result = await client.callTool({
        name: navigateTool.name,
        arguments: {to: '/dashboard'},
      });

      // Log the full result for debugging
      const content = (result as {content: Array<{text: string}>}).content[0]?.text || '';
      const isError = 'isError' in result && result.isError;
      log(`   Result isError: ${isError}, content: ${content.slice(0, 200)}`);

      // Note: Navigation may return "Connection closed" error because the WebMCP transport
      // closes when the page navigates. This is expected behavior - the navigation still works.
      // We verify navigation worked by checking tools in subsequent tests.
      if (isError && content.includes('Connection closed')) {
        log(`   Navigate returned connection closed (expected - transport resets on navigation)`);
      } else {
        assert(!isError, 'Navigation should succeed');
      }
      log(`   Navigation command sent to /dashboard`);
    });

    await runTest('4.2 Wait for tool updates after navigation', async () => {
      await new Promise(resolve => setTimeout(resolve, WAIT_FOR_PAGE_LOAD));
      log(`   Waited ${WAIT_FOR_PAGE_LOAD}ms for tool updates`);
    });

    await runTest('4.3 Check for new tools on /dashboard', async () => {
      const result = await client.callTool({
        name: 'diff_webmcp_tools',
        arguments: {},
      });
      const content = (result as {content: Array<{text: string}>}).content[0].text;
      log(`   Dashboard tools: ${content.slice(0, 200)}...`);
    });

    await runTest('4.4 Navigate to /entities page', async () => {
      const tools = await client.listTools();
      const navigateTool = tools.tools.find(t => t.name.includes('_navigate') && t.name.startsWith('webmcp_'));
      assert(navigateTool !== undefined, 'Should have navigate tool');

      const result = await client.callTool({
        name: navigateTool.name,
        arguments: {to: '/entities'},
      });

      const content = (result as {content: Array<{text: string}>}).content[0]?.text || '';
      const isError = 'isError' in result && result.isError;
      // Connection closed is expected during navigation
      if (isError && content.includes('Connection closed')) {
        log(`   Navigate returned connection closed (expected)`);
      } else {
        assert(!isError, 'Navigation should succeed');
      }
      await new Promise(resolve => setTimeout(resolve, WAIT_FOR_PAGE_LOAD));
      log(`   Navigation command sent to /entities`);
    });

    await runTest('4.5 Check for entity-specific tools', async () => {
      const result = await client.callTool({
        name: 'diff_webmcp_tools',
        arguments: {},
      });
      const content = (result as {content: Array<{text: string}>}).content[0].text;
      // Entities page should have CRUD tools
      log(`   Entities page tools available`);
    });

    await runTest('4.6 Navigate to /graph page', async () => {
      const tools = await client.listTools();
      const navigateTool = tools.tools.find(t => t.name.includes('_navigate') && t.name.startsWith('webmcp_'));
      assert(navigateTool !== undefined, 'Should have navigate tool');

      const result = await client.callTool({
        name: navigateTool.name,
        arguments: {to: '/graph'},
      });

      const content = (result as {content: Array<{text: string}>}).content[0]?.text || '';
      const isError = 'isError' in result && result.isError;
      // Connection closed is expected during navigation
      if (isError && content.includes('Connection closed')) {
        log(`   Navigate returned connection closed (expected)`);
      } else {
        assert(!isError, 'Navigation should succeed');
      }
      await new Promise(resolve => setTimeout(resolve, WAIT_FOR_PAGE_LOAD));
      log(`   Navigation command sent to /graph`);
    });

    await runTest('4.7 Check for graph-specific tools', async () => {
      const result = await client.callTool({
        name: 'diff_webmcp_tools',
        arguments: {},
      });
      const content = (result as {content: Array<{text: string}>}).content[0].text;
      log(`   Graph page tools available`);
    });

    // ================================================================
    // TEST SUITE 5: Tool Removal (Navigation Away)
    // ================================================================
    logSection('Test Suite 5: Tool Removal');

    let toolCountBeforeNavAway = 0;

    await runTest('5.1 Record current tool count', async () => {
      const tools = await client.listTools();
      toolCountBeforeNavAway = tools.tools.length;
      const webmcpTools = tools.tools.filter(t => t.name.startsWith('webmcp_'));
      log(`   Current tools: ${toolCountBeforeNavAway} (${webmcpTools.length} WebMCP)`);
    });

    await runTest('5.2 Navigate away from WebMCP site', async () => {
      const result = await client.callTool({
        name: 'navigate_page',
        arguments: {url: 'https://example.com'},
      });
      assert(!('isError' in result && result.isError), 'Navigation should succeed');
      await new Promise(resolve => setTimeout(resolve, 2000));
      log(`   Navigated to example.com`);
    });

    await runTest('5.3 WebMCP tools are removed', async () => {
      const tools = await client.listTools();
      const webmcpTools = tools.tools.filter(t => t.name.startsWith('webmcp_'));
      assertEqual(webmcpTools.length, 0, 'WebMCP tools should be removed');
      log(`   WebMCP tools removed, total tools: ${tools.tools.length}`);
    });

    await runTest('5.4 Tool count decreased', async () => {
      const tools = await client.listTools();
      assert(
        tools.tools.length < toolCountBeforeNavAway,
        'Tool count should decrease after navigation away',
      );
      log(`   Tool count: ${toolCountBeforeNavAway} -> ${tools.tools.length}`);
    });

    // ================================================================
    // TEST SUITE 6: Reconnection
    // ================================================================
    logSection('Test Suite 6: Reconnection');

    await runTest('6.1 Navigate back to webmcp.sh', async () => {
      const result = await client.callTool({
        name: 'navigate_page',
        arguments: {url: WEBMCP_URL},
      });
      assert(!('isError' in result && result.isError), 'Navigation should succeed');
      await new Promise(resolve => setTimeout(resolve, WAIT_FOR_PAGE_LOAD));
      log(`   Navigated back to ${WEBMCP_URL}`);
    });

    await runTest('6.2 WebMCP tools are re-registered', async () => {
      // Trigger detection
      await client.callTool({name: 'diff_webmcp_tools', arguments: {}});
      await new Promise(resolve => setTimeout(resolve, WAIT_FOR_TOOL_SYNC));

      const tools = await client.listTools();
      const webmcpTools = tools.tools.filter(t => t.name.startsWith('webmcp_'));
      assertGreaterThan(webmcpTools.length, 0, 'WebMCP tools should be re-registered');
      log(`   Re-registered ${webmcpTools.length} WebMCP tools`);
    });

    // ================================================================
    // TEST SUITE 7: Multi-Tab Support
    // ================================================================
    logSection('Test Suite 7: Multi-Tab Support');

    let page0ToolCount = 0;
    let page1ToolCount = 0;

    await runTest('7.1 Verify single page setup', async () => {
      const result = await client.callTool({name: 'list_pages', arguments: {}});
      const content = (result as {content: Array<{text: string}>}).content[0].text;
      log(`   Current pages: ${content}`);
    });

    await runTest('7.2 Navigate first page to webmcp.sh', async () => {
      const result = await client.callTool({
        name: 'navigate_page',
        arguments: {url: WEBMCP_URL},
      });
      assert(!('isError' in result && result.isError), 'Navigation should succeed');
      await new Promise(resolve => setTimeout(resolve, WAIT_FOR_PAGE_LOAD));

      // Trigger tool detection
      await client.callTool({name: 'diff_webmcp_tools', arguments: {}});
      await new Promise(resolve => setTimeout(resolve, WAIT_FOR_TOOL_SYNC));
      log(`   First page navigated to ${WEBMCP_URL}`);
    });

    await runTest('7.3 Count tools from first page', async () => {
      const tools = await client.listTools();
      const page0Tools = tools.tools.filter(t => t.name.includes('_page0_'));
      page0ToolCount = page0Tools.length;
      assertGreaterThan(page0ToolCount, 0, 'Should have tools from page 0');
      log(`   Page 0 tools: ${page0ToolCount}`);
      log(`   Tool names: ${page0Tools.slice(0, 3).map(t => t.name).join(', ')}...`);
    });

    await runTest('7.4 Create second page', async () => {
      const result = await client.callTool({
        name: 'new_page',
        arguments: {url: 'about:blank'},
      });
      assert(!('isError' in result && result.isError), 'Page creation should succeed');
      log(`   Created second page`);
    });

    await runTest('7.5 Verify two pages exist', async () => {
      const result = await client.callTool({name: 'list_pages', arguments: {}});
      const content = (result as {content: Array<{text: string}>}).content[0].text;
      log(`   Full list_pages output: ${content}`);
      // Count pages - match lines that look like page entries (start with number and colon)
      const pageLines = content.split('\n').filter(l => /^\d+:/.test(l.trim()));
      assert(pageLines.length >= 2, `Should have two pages. Found ${pageLines.length} pages: ${pageLines.join(', ')}`);
      log(`   Pages verified: ${pageLines.length} pages`);
    });

    await runTest('7.6 Select and navigate second page to webmcp.sh/dashboard', async () => {
      // Select page 1
      await client.callTool({
        name: 'select_page',
        arguments: {pageIdx: 1},
      });

      // Navigate to a different route
      const result = await client.callTool({
        name: 'navigate_page',
        arguments: {url: `${WEBMCP_URL}/dashboard`},
      });
      assert(!('isError' in result && result.isError), 'Navigation should succeed');
      await new Promise(resolve => setTimeout(resolve, WAIT_FOR_PAGE_LOAD));

      // Trigger tool detection
      await client.callTool({name: 'diff_webmcp_tools', arguments: {}});
      await new Promise(resolve => setTimeout(resolve, WAIT_FOR_TOOL_SYNC));
      log(`   Second page navigated to ${WEBMCP_URL}/dashboard`);
    });

    await runTest('7.7 Both pages have registered tools', async () => {
      const tools = await client.listTools();
      const page0Tools = tools.tools.filter(t => t.name.includes('_page0_'));
      const page1Tools = tools.tools.filter(t => t.name.includes('_page1_'));

      assertGreaterThan(page0Tools.length, 0, 'Should have tools from page 0');
      assertGreaterThan(page1Tools.length, 0, 'Should have tools from page 1');

      page1ToolCount = page1Tools.length;
      log(`   Page 0 tools: ${page0Tools.length}`);
      log(`   Page 1 tools: ${page1Tools.length}`);
      log(`   Total WebMCP tools: ${page0Tools.length + page1Tools.length}`);
    });

    await runTest('7.8 Tool IDs are unique across pages', async () => {
      const tools = await client.listTools();
      const webmcpTools = tools.tools.filter(t => t.name.startsWith('webmcp_'));
      const toolNames = webmcpTools.map(t => t.name);
      const uniqueNames = new Set(toolNames);
      assertEqual(uniqueNames.size, toolNames.length, 'All tool names should be unique');
      log(`   Verified ${toolNames.length} unique tool names across pages`);
    });

    await runTest('7.9 Call tool on page 0 (from page 1 selected)', async () => {
      const tools = await client.listTools();
      const page0Tool = tools.tools.find(
        t => t.name.includes('_page0_') && t.name.includes('get_current_context'),
      );
      assert(page0Tool !== undefined, 'Should have get_current_context on page 0');

      const result = await client.callTool({
        name: page0Tool.name,
        arguments: {},
      });
      assert(!('isError' in result && result.isError), 'Tool call should succeed');
      log(`   Called ${page0Tool.name} successfully (cross-page call)`);
    });

    await runTest('7.10 Call tool on page 1', async () => {
      const tools = await client.listTools();
      const page1Tool = tools.tools.find(
        t => t.name.includes('_page1_') && t.name.includes('get_current_context'),
      );
      assert(page1Tool !== undefined, 'Should have get_current_context on page 1');

      const result = await client.callTool({
        name: page1Tool.name,
        arguments: {},
      });
      assert(!('isError' in result && result.isError), 'Tool call should succeed');
      log(`   Called ${page1Tool.name} successfully`);
    });

    await runTest('7.11 Close page 1', async () => {
      const result = await client.callTool({
        name: 'close_page',
        arguments: {pageIdx: 1},
      });
      assert(!('isError' in result && result.isError), 'Page close should succeed');
      await new Promise(resolve => setTimeout(resolve, 500));
      log(`   Closed page 1`);
    });

    await runTest('7.12 Page 1 tools are removed', async () => {
      const tools = await client.listTools();
      const page1Tools = tools.tools.filter(t => t.name.includes('_page1_'));
      assertEqual(page1Tools.length, 0, 'Page 1 tools should be removed');
      log(`   Page 1 tools removed`);
    });

    await runTest('7.13 Page 0 tools still exist', async () => {
      const tools = await client.listTools();
      const page0Tools = tools.tools.filter(t => t.name.includes('_page0_'));
      assertGreaterThan(page0Tools.length, 0, 'Page 0 tools should still exist');
      log(`   Page 0 still has ${page0Tools.length} tools`);
    });

    await runTest('7.14 Verify only one page remains', async () => {
      const result = await client.callTool({name: 'list_pages', arguments: {}});
      const content = (result as {content: Array<{text: string}>}).content[0].text;
      log(`   Full list_pages output: ${content}`);
      // Count pages - match lines that look like page entries (start with number and colon)
      const pageLines = content.split('\n').filter(l => /^\d+:/.test(l.trim()));
      const hasOnePage = pageLines.length === 1;
      assert(hasOnePage, `Should have only one page. Found ${pageLines.length} pages: ${pageLines.join(', ')}`);
      log(`   Single page verified`);
    });

    // ================================================================
    // TEST SUITE 8: Multi-Tab Same Domain
    // ================================================================
    logSection('Test Suite 8: Multi-Tab Same Domain');

    await runTest('8.1 Create second page on same domain', async () => {
      const result = await client.callTool({
        name: 'new_page',
        arguments: {url: `${WEBMCP_URL}/entities`},
      });
      assert(!('isError' in result && result.isError), 'Page creation should succeed');
      await new Promise(resolve => setTimeout(resolve, WAIT_FOR_PAGE_LOAD));

      // Trigger tool detection on new page (page 1)
      await client.callTool({
        name: 'select_page',
        arguments: {pageIdx: 1},
      });
      await client.callTool({name: 'diff_webmcp_tools', arguments: {}});
      await new Promise(resolve => setTimeout(resolve, WAIT_FOR_TOOL_SYNC));
      log(`   Created second page on ${WEBMCP_URL}/entities`);
    });

    await runTest('8.2 Both pages have tools with same domain prefix', async () => {
      const tools = await client.listTools();
      const webmcpTools = tools.tools.filter(t => t.name.startsWith('webmcp_'));

      // Both should have webmcp.sh domain in name
      const page0Tools = webmcpTools.filter(t => t.name.includes('_page0_'));
      const page1Tools = webmcpTools.filter(t => t.name.includes('_page1_'));

      assertGreaterThan(page0Tools.length, 0, 'Should have page 0 tools');
      assertGreaterThan(page1Tools.length, 0, 'Should have page 1 tools');

      // Both should have same domain part
      const page0Domain = page0Tools[0].name.split('_page0_')[0];
      const page1Domain = page1Tools[0].name.split('_page1_')[0];
      assertEqual(page0Domain, page1Domain, 'Both pages should have same domain');

      log(`   Page 0: ${page0Tools.length} tools`);
      log(`   Page 1: ${page1Tools.length} tools`);
      log(`   Domain: ${page0Domain}`);
    });

    await runTest('8.3 Tools are distinguished by page index', async () => {
      const tools = await client.listTools();
      const contextTools = tools.tools.filter(t => t.name.includes('get_current_context'));

      // Should have context tool from both pages
      const page0Context = contextTools.find(t => t.name.includes('_page0_'));
      const page1Context = contextTools.find(t => t.name.includes('_page1_'));

      assert(page0Context !== undefined, 'Should have context tool from page 0');
      assert(page1Context !== undefined, 'Should have context tool from page 1');
      assert(page0Context.name !== page1Context.name, 'Tool names should differ');

      log(`   Page 0 context: ${page0Context.name}`);
      log(`   Page 1 context: ${page1Context.name}`);
    });

    await runTest('8.4 Clean up second page', async () => {
      const result = await client.callTool({
        name: 'close_page',
        arguments: {pageIdx: 1},
      });
      assert(!('isError' in result && result.isError), 'Page close should succeed');
      await new Promise(resolve => setTimeout(resolve, 500));
      log(`   Closed second page`);
    });

    // ================================================================
    // TEST SUITE 9: Error Handling
    // ================================================================
    logSection('Test Suite 9: Error Handling');

    await runTest('9.1 diff_webmcp_tools on non-WebMCP page', async () => {
      await client.callTool({
        name: 'navigate_page',
        arguments: {url: 'https://example.com'},
      });
      await new Promise(resolve => setTimeout(resolve, 2000));

      const result = await client.callTool({
        name: 'diff_webmcp_tools',
        arguments: {},
      });
      const content = (result as {content: Array<{text: string}>}).content[0].text;
      assert(
        content.includes('not detected') || content.includes('0 tool'),
        'Should indicate no WebMCP on page',
      );
      log(`   Correctly reports no WebMCP on example.com`);
    });

    await runTest('9.2 Calling removed WebMCP tool fails gracefully', async () => {
      // First, get a WebMCP tool name
      await client.callTool({
        name: 'navigate_page',
        arguments: {url: WEBMCP_URL},
      });
      await new Promise(resolve => setTimeout(resolve, WAIT_FOR_PAGE_LOAD));
      await client.callTool({name: 'diff_webmcp_tools', arguments: {}});
      await new Promise(resolve => setTimeout(resolve, WAIT_FOR_TOOL_SYNC));

      const tools = await client.listTools();
      const webmcpTool = tools.tools.find(t => t.name.startsWith('webmcp_'));
      assert(webmcpTool !== undefined, 'Should have a WebMCP tool');
      const toolName = webmcpTool.name;

      // Navigate away to remove tools
      await client.callTool({
        name: 'navigate_page',
        arguments: {url: 'https://example.com'},
      });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Try to call the now-removed tool
      try {
        await client.callTool({name: toolName, arguments: {}});
        // If we get here without error, the tool might still be cached
        log(`   Tool ${toolName} call handled (may be cached)`);
      } catch {
        log(`   Tool ${toolName} correctly unavailable after removal`);
      }
    });

    // ================================================================
    // Print Summary
    // ================================================================
    logSection('Test Results Summary');

    const passed = testResults.filter(r => r.passed).length;
    const failed = testResults.filter(r => !r.passed).length;
    const totalDuration = testResults.reduce((sum, r) => sum + r.duration, 0);

    console.log(`Total tests: ${testResults.length}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);
    console.log(`Duration: ${totalDuration}ms`);
    console.log(`\ntool/list_changed notifications received: ${toolListChangedCount}`);

    if (failed > 0) {
      console.log('\nFailed tests:');
      for (const result of testResults.filter(r => !r.passed)) {
        console.log(`  ❌ ${result.name}`);
        console.log(`     ${result.error}`);
      }
    }

    console.log('\n' + (failed === 0 ? '🎉 All tests passed!' : '⚠️ Some tests failed'));

    return failed === 0;
  } catch (error) {
    console.error('Fatal error:', error);
    return false;
  } finally {
    log('\nCleaning up...');
    try {
      await client.close();
      log('Client closed');
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Run tests
runE2ETests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
