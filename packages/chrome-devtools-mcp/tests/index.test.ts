/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs';
import {describe, it} from 'node:test';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {executablePath} from 'puppeteer';

import type {ToolDefinition} from '../src/tools/ToolDefinition';
import {serverHooks} from './server.js';
import {registerRouteAwareWebMCPFixture} from './webmcp-fixture.js';

function getText(result: unknown): string {
  const content = (result as {
    content?: Array<{type: string; text?: string}>;
  }).content;
  const text = content?.find(item => item.type === 'text');
  if (!text || typeof text.text !== 'string') {
    throw new Error('Expected text content');
  }
  return text.text;
}

describe('e2e', () => {
  const server = serverHooks();

  async function withClient(
    cb: (client: Client) => Promise<void>,
    extraArgs: string[] = [],
  ) {
    const transport = new StdioClientTransport({
      command: 'node',
      args: [
        'build/src/bin/chrome-devtools-mcp.js',
        '--headless',
        '--isolated',
        '--executable-path',
        executablePath(),
        ...extraArgs,
      ],
    });
    const client = new Client(
      {
        name: 'e2e-test',
        version: '1.0.0',
      },
      {
        capabilities: {},
      },
    );

    try {
      await client.connect(transport);
      await cb(client);
    } finally {
      await client.close();
    }
  }
  it('calls a tool', async t => {
    await withClient(async client => {
      const result = await client.callTool({
        name: 'list_pages',
        arguments: {},
      });
      t.assert.snapshot?.(JSON.stringify(result.content));
    });
  });

  it('calls a tool multiple times', async t => {
    await withClient(async client => {
      let result = await client.callTool({
        name: 'list_pages',
        arguments: {},
      });
      result = await client.callTool({
        name: 'list_pages',
        arguments: {},
      });
      t.assert.snapshot?.(JSON.stringify(result.content));
    });
  });

  it('has all tools', async () => {
    await withClient(async client => {
      const {tools} = await client.listTools();
      const exposedNames = tools.map(t => t.name).sort();
      const files = fs.readdirSync('build/src/tools');
      const definedNames = [];
      for (const file of files) {
        if (
          file === 'ToolDefinition.js' ||
          file === 'tools.js' ||
          file === 'slim'
        ) {
          continue;
        }
        const fileTools = await import(`../src/tools/${file}`);
        for (const maybeTool of Object.values<unknown>(fileTools)) {
          if (typeof maybeTool === 'function') {
            const tool = (maybeTool as (val: boolean) => ToolDefinition)(false);
            if (tool && typeof tool === 'object' && 'name' in tool) {
              if (tool.annotations?.conditions) {
                continue;
              }
              definedNames.push(tool.name);
            }
            continue;
          }
          if (
            typeof maybeTool === 'object' &&
            maybeTool !== null &&
            'name' in maybeTool
          ) {
            const tool = maybeTool as ToolDefinition;
            if (tool.annotations?.conditions) {
              continue;
            }
            definedNames.push(tool.name);
          }
        }
      }
      definedNames.sort();
      assert.deepStrictEqual(exposedNames, definedNames);
    });
  });

  it('has experimental extensions tools', async () => {
    await withClient(
      async client => {
        const {tools} = await client.listTools();
        const clickAt = tools.find(t => t.name === 'install_extension');
        assert.ok(clickAt);
      },
      ['--category-extensions'],
    );
  });

  it('has experimental vision tools', async () => {
    await withClient(
      async client => {
        const {tools} = await client.listTools();
        const clickAt = tools.find(t => t.name === 'click_at');
        assert.ok(clickAt);
      },
      ['--experimental-vision'],
    );
  });

  it('has experimental interop tools', async () => {
    await withClient(
      async client => {
        const {tools} = await client.listTools();
        const getTabId = tools.find(t => t.name === 'get_tab_id');
        assert.ok(getTabId);
      },
      ['--experimental-interop-tools'],
    );
  });

  it('supports WebMCP listing, calling, and browser debugging over stdio MCP', async () => {
    registerRouteAwareWebMCPFixture(server);

    await withClient(async client => {
      await client.callTool({
        name: 'new_page',
        arguments: {
          url: server.getRoute('/'),
        },
      });

      const rootTools = await client.callTool({
        name: 'list_webmcp_tools',
        arguments: {
          summary: true,
        },
      });
      const rootPayload = JSON.parse(getText(rootTools)) as {
        pageId: number;
        count: number;
        tools: Array<{name: string}>;
      };
      assert.strictEqual(rootPayload.count, 3);
      assert.deepStrictEqual(
        rootPayload.tools.map(tool => tool.name),
        ['navigate', 'get_current_context', 'list_all_routes'],
      );

      const initialContext = await client.callTool({
        name: 'call_webmcp_tool',
        arguments: {
          name: 'get_current_context',
        },
      });
      assert.strictEqual(getText(initialContext), '/');

      const navigation = await client.callTool({
        name: 'call_webmcp_tool',
        arguments: {
          name: 'navigate',
          arguments: {to: '/entities'},
        },
      });
      assert.strictEqual(getText(navigation), 'Navigated to /entities');

      const entityTools = await client.callTool({
        name: 'list_webmcp_tools',
        arguments: {
          summary: true,
        },
      });
      const entityPayload = JSON.parse(getText(entityTools)) as {
        count: number;
        tools: Array<{name: string}>;
      };
      assert.strictEqual(entityPayload.count, 3);
      assert.deepStrictEqual(
        entityPayload.tools.map(tool => tool.name),
        ['navigate', 'get_current_context', 'list_entities'],
      );

      const listEntities = await client.callTool({
        name: 'call_webmcp_tool',
        arguments: {
          name: 'list_entities',
        },
      });
      assert.strictEqual(
        getText(listEntities),
        '3 entities: Ada, Linus, Grace',
      );

      const scriptResult = await client.callTool({
        name: 'evaluate_script',
        arguments: {
          function: '() => window.location.pathname',
        },
      });
      assert.match(getText(scriptResult), /\/entities/);

      const consoleMessages = await client.callTool({
        name: 'list_console_messages',
        arguments: {},
      });
      assert.match(getText(consoleMessages), /webmcp route/);

      const networkRequests = await client.callTool({
        name: 'list_network_requests',
        arguments: {},
      });
      assert.match(getText(networkRequests), /\/api\/entities/);
    });
  });
});
