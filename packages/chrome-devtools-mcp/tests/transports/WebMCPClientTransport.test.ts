/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';

import {WebMCPClientTransport} from '../../src/transports/WebMCPClientTransport.js';
import {serverHooks} from '../server.js';
import {withBrowser} from '../utils.js';

type WebMcpPageOptions = {
  includeModelContext?: boolean;
  respondReady?: boolean;
  readyDelayMs?: number;
  sendServerStoppedAfterMs?: number;
};

const DEFAULT_TOOLS = [
  {
    name: 'test_add',
    description: 'Add two numbers together',
    inputSchema: {
      type: 'object',
      properties: {
        a: {type: 'number', description: 'First number'},
        b: {type: 'number', description: 'Second number'},
      },
      required: ['a', 'b'],
    },
  },
];

const NO_WEBMCP_PAGE = `
<!DOCTYPE html>
<html>
<head><title>No WebMCP</title></head>
<body><h1>No WebMCP here</h1></body>
</html>
`;

const BLANK_PAGE = `
<!DOCTYPE html>
<html>
<head><title>Blank</title></head>
<body></body>
</html>
`;

function buildWebMcpPage(options: WebMcpPageOptions = {}): string {
  const {
    includeModelContext = true,
    respondReady = true,
    readyDelayMs = 0,
    sendServerStoppedAfterMs,
  } = options;

  const readyDelay = Math.max(0, readyDelayMs);
  const stopDelay = sendServerStoppedAfterMs ?? -1;
  const toolsJson = JSON.stringify(DEFAULT_TOOLS);

  return `
<!DOCTYPE html>
<html>
<head>
  <title>WebMCP Test Page</title>
</head>
<body>
  <script>
    (function() {
      var CHANNEL_ID = 'mcp-default';
      var tools = ${toolsJson};

      function postToClient(payload) {
        window.postMessage({
          channel: CHANNEL_ID,
          type: 'mcp',
          direction: 'server-to-client',
          payload: payload
        }, '*');
      }

      function handleRequest(payload) {
        var result = null;
        var error = null;

        if (payload.method === 'initialize') {
          result = {
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: true } },
            serverInfo: { name: 'test-webmcp', version: '1.0.0' }
          };
        } else if (payload.method === 'tools/list') {
          result = { tools: tools };
        } else if (payload.method === 'tools/call') {
          var name = payload.params && payload.params.name;
          if (name === 'test_add') {
            var args = payload.params && payload.params.arguments ? payload.params.arguments : {};
            var a = Number(args.a || 0);
            var b = Number(args.b || 0);
            result = { content: [{ type: 'text', text: String(a + b) }] };
          } else {
            error = { code: -32601, message: 'Unknown tool: ' + name };
          }
        } else {
          error = { code: -32601, message: 'Method not found: ' + payload.method };
        }

        var response = { jsonrpc: '2.0', id: payload.id };
        if (error) {
          response.error = error;
        } else {
          response.result = result;
        }
        postToClient(response);
      }

      window.addEventListener('message', function(event) {
        if (event.source !== window) return;
        var data = event.data;
        if (!data || data.channel !== CHANNEL_ID || data.type !== 'mcp') return;
        if (data.direction !== 'client-to-server') return;

        var payload = data.payload;

        if (payload === 'mcp-check-ready') {
          if (${respondReady}) {
            var delay = ${readyDelay};
            if (delay > 0) {
              setTimeout(function() { postToClient('mcp-server-ready'); }, delay);
            } else {
              postToClient('mcp-server-ready');
            }
          }
          return;
        }

        if (typeof payload !== 'object' || payload === null) {
          return;
        }

        if (payload.jsonrpc !== '2.0' || !('id' in payload)) {
          return;
        }

        handleRequest(payload);
      });

      if (${includeModelContext}) {
        navigator.modelContext = {
          registerTool: function() {},
          provideContext: function() {}
        };
      }

      if (${stopDelay} >= 0) {
        setTimeout(function() {
          postToClient('mcp-server-stopped');
        }, ${stopDelay});
      }
    })();
  </script>
</body>
</html>
`;
}

function createClient() {
  return new Client(
    {
      name: 'webmcp-transport-test',
      version: '1.0.0',
    },
    {
      capabilities: {},
    },
  );
}

async function cleanup(
  client: Client,
  transport: WebMCPClientTransport,
): Promise<void> {
  try {
    await client.close();
  } catch {
    // Ignore cleanup errors.
  }

  try {
    await transport.close();
  } catch {
    // Ignore cleanup errors.
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

describe('WebMCPClientTransport (client edge cases)', () => {
  const server = serverHooks();

  it('connects and calls tools via MCP client', async () => {
    server.addHtmlRoute('/webmcp-ready', buildWebMcpPage());

    await withBrowser(async (_browser, page) => {
      await page.goto(server.getRoute('/webmcp-ready'));

      const transport = new WebMCPClientTransport({page});
      const client = createClient();

      try {
        await client.connect(transport);

        const list = await client.listTools();
        assert.strictEqual(list.tools.length, 1);
        assert.strictEqual(list.tools[0].name, 'test_add');

        const result = await client.callTool({
          name: 'test_add',
          arguments: {a: 2, b: 3},
        });
        assert.deepStrictEqual(result, {
          content: [{type: 'text', text: '5'}],
        });
      } finally {
        await cleanup(client, transport);
      }
    });
  });

  it('fails to connect when WebMCP is not detected', async () => {
    server.addHtmlRoute('/no-webmcp', NO_WEBMCP_PAGE);

    await withBrowser(async (_browser, page) => {
      await page.goto(server.getRoute('/no-webmcp'));

      const transport = new WebMCPClientTransport({page});
      const client = createClient();

      try {
        await assert.rejects(
          client.connect(transport),
          /WebMCP not detected/,
        );
      } finally {
        await cleanup(client, transport);
      }
    });
  });

  it('connects when requireWebMCP is false even without modelContext', async () => {
    server.addHtmlRoute(
      '/webmcp-no-modelcontext',
      buildWebMcpPage({includeModelContext: false}),
    );

    await withBrowser(async (_browser, page) => {
      await page.goto(server.getRoute('/webmcp-no-modelcontext'));

      const transport = new WebMCPClientTransport({
        page,
        requireWebMCP: false,
      });
      const client = createClient();

      try {
        await client.connect(transport);
        const list = await client.listTools();
        assert.strictEqual(list.tools.length, 1);
      } finally {
        await cleanup(client, transport);
      }
    });
  });

  it('times out when server never responds to ready check', async () => {
    server.addHtmlRoute(
      '/webmcp-no-ready',
      buildWebMcpPage({respondReady: false}),
    );

    await withBrowser(async (_browser, page) => {
      await page.goto(server.getRoute('/webmcp-no-ready'));

      const transport = new WebMCPClientTransport({
        page,
        readyTimeout: 100,
      });
      const client = createClient();

      try {
        await assert.rejects(
          client.connect(transport),
          /did not respond within 100ms/,
        );
        assert.strictEqual(transport.isClosed(), true);
      } finally {
        await cleanup(client, transport);
      }
    });
  });

  it('rejects connect when navigation happens during handshake', async () => {
    server.addHtmlRoute(
      '/webmcp-delayed-ready',
      buildWebMcpPage({readyDelayMs: 500}),
    );
    server.addHtmlRoute('/blank', BLANK_PAGE);

    await withBrowser(async (_browser, page) => {
      await page.goto(server.getRoute('/webmcp-delayed-ready'));

      const transport = new WebMCPClientTransport({
        page,
        readyTimeout: 1000,
      });
      const client = createClient();

      const closePromise = new Promise<void>(resolve => {
        transport.onclose = () => resolve();
      });

      try {
        const connectPromise = client.connect(transport);
        connectPromise.catch(() => undefined);
        await page.waitForFunction(() => {
          return Boolean(
            (window as unknown as {__mcpBridge?: unknown}).__mcpBridge,
          );
        });
        await new Promise(resolve => setTimeout(resolve, 100));
        await page.goto(server.getRoute('/blank'));

        await closePromise;
        await assert.rejects(connectPromise);
        assert.strictEqual(transport.isClosed(), true);
      } finally {
        await cleanup(client, transport);
      }
    });
  });

  it('rejects tool calls after navigation closes the transport', async () => {
    server.addHtmlRoute('/webmcp-ready-2', buildWebMcpPage());
    server.addHtmlRoute('/blank-2', BLANK_PAGE);

    await withBrowser(async (_browser, page) => {
      await page.goto(server.getRoute('/webmcp-ready-2'));

      const transport = new WebMCPClientTransport({page});
      const client = createClient();

      const closePromise = new Promise<void>(resolve => {
        transport.onclose = () => resolve();
      });

      try {
        await client.connect(transport);
        await client.listTools();

        await page.goto(server.getRoute('/blank-2'));
        await closePromise;

        await assert.rejects(client.listTools());
        assert.strictEqual(transport.isClosed(), true);
      } finally {
        await cleanup(client, transport);
      }
    });
  });

  it('emits onerror when server signals stopped', async () => {
    server.addHtmlRoute(
      '/webmcp-stopped',
      buildWebMcpPage({sendServerStoppedAfterMs: 150}),
    );

    await withBrowser(async (_browser, page) => {
      await page.goto(server.getRoute('/webmcp-stopped'));

      const transport = new WebMCPClientTransport({page});
      const client = createClient();

      const errorPromise = new Promise<Error>(resolve => {
        transport.onerror = err => resolve(err);
      });

      try {
        await client.connect(transport);
        const error = await withTimeout(
          errorPromise,
          1000,
          'Timed out waiting for server stopped error',
        );
        assert.match(error.message, /server stopped/);
      } finally {
        await cleanup(client, transport);
      }
    });
  });
});
