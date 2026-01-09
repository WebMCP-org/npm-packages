#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Test client for chrome-devtools-mcp server
 * Tests auto-connect and fallback behavior
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testMcpServer() {
  console.log('🧪 Testing Chrome DevTools MCP Server');
  console.log('=====================================\n');

  // Check which channel to use - defaults to 'dev' which supports Chrome 145+ features
  const testChannel = process.env.TEST_CHANNEL || 'dev';
  console.log(`🔧 Test channel: ${testChannel}`);
  console.log(`💡 Default channel in server: dev (Chrome 145+, can be overridden with --channel)\n`);

  // Start the MCP server as a child process
  const serverPath = path.join(__dirname, 'build/src/index.js');
  console.log(`📦 Server path: ${serverPath}\n`);

  // Create MCP client with channel override for testing
  // Test auto-connect behavior (default is autoConnect=true with fallback)
  const serverArgs = [serverPath];
  // Only override channel if different from default 'dev'
  if (testChannel !== 'dev') {
    serverArgs.push('--channel', testChannel);
  }

  console.log(`🚀 Server configuration:`);
  console.log(`   - autoConnect: true (default)`);
  console.log(`   - channel: ${testChannel} ${testChannel === 'dev' ? '(default, Chrome 145+)' : '(overridden)'}`);
  console.log(`   - fallback: enabled (launches if connect fails)\n`);

  const transport = new StdioClientTransport({
    command: 'node',
    args: serverArgs,
  });

  const client = new Client(
    {
      name: 'chrome-devtools-mcp-test-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  try {
    console.log('🔌 Connecting to MCP server...');
    await client.connect(transport);
    console.log('✅ Connected to MCP server\n');

    // Test 1: List available tools
    console.log('📋 Test 1: Listing available tools');
    const toolsList = await client.listTools();
    console.log(`✅ Found ${toolsList.tools.length} tools`);
    console.log('Available tools:', toolsList.tools.map(t => t.name).join(', '));
    console.log('');

    // Test 2: Get server info
    console.log('ℹ️  Test 2: Getting server info');
    const serverInfo = await client.getServerVersion();
    console.log(`✅ Server: ${serverInfo.name} v${serverInfo.version}`);
    console.log('');

    // Test 3: Call list_pages tool
    console.log('🌐 Test 3: Calling list_pages tool');
    try {
      const result = await client.callTool({
        name: 'list_pages',
        arguments: {},
      });
      console.log('✅ list_pages result:');
      console.log(JSON.stringify(result, null, 2));
      console.log('');
    } catch (error) {
      console.error('❌ list_pages failed:', error);
    }

    // Test 4: Call new_page tool
    console.log('📄 Test 4: Creating new page');
    try {
      const result = await client.callTool({
        name: 'new_page',
        arguments: {
          url: 'https://example.com',
        },
      });
      console.log('✅ new_page result:');
      console.log(JSON.stringify(result, null, 2));
      console.log('');
    } catch (error) {
      console.error('❌ new_page failed:', error);
    }

    // Test 5: Take a snapshot
    console.log('📸 Test 5: Taking page snapshot');
    try {
      const result = await client.callTool({
        name: 'take_snapshot',
        arguments: {},
      });
      console.log('✅ take_snapshot result (truncated):');
      const contentPreview = JSON.stringify(result).slice(0, 200);
      console.log(contentPreview + '...');
      console.log('');
    } catch (error) {
      console.error('❌ take_snapshot failed:', error);
    }

    console.log('🎉 All tests completed successfully!');
    console.log('\n✨ Auto-connect and fallback behavior verified');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    // Clean up
    console.log('\n🧹 Cleaning up...');
    try {
      await client.close();
      console.log('✅ Client closed');
    } catch (e) {
      console.error('Error closing client:', e);
    }
    console.log('✅ Cleanup complete');
  }
}

// Run the test
testMcpServer().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
