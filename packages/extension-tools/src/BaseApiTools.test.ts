import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { BaseApiTools, type ApiAvailability } from './BaseApiTools';
import { contract } from './contracts/shared';

type RegisteredTool = {
  name: string;
  config: Record<string, unknown>;
  execute: (input: unknown) => Promise<unknown>;
};

class FakeServer {
  public tools: RegisteredTool[] = [];

  registerTool(
    name: string,
    config: Record<string, unknown>,
    execute: (input: unknown) => Promise<unknown>
  ) {
    this.tools.push({ name, config, execute });
  }
}

const testContract = contract({
  name: 'extension_tool_test_action',
  title: 'Test action',
  description: 'Test contract-backed action',
  inputSchema: z.object({ value: z.string() }),
  outputSchema: z.object({ echoed: z.string() }),
  annotations: { readOnlyHint: true },
  _meta: {
    extension: {
      groupId: 'test',
      actionId: 'action',
      chromeApi: 'test.action',
      permissions: ['testPermission'],
      hostPermissions: ['https://example.com/*'],
      requiresActiveTab: true,
    },
  },
});

class TestApiTools extends BaseApiTools {
  protected apiName = 'Test';
  public availability: ApiAvailability = { available: true, message: 'available' };

  constructor(private readonly fakeServer: FakeServer) {
    super(fakeServer as never);
  }

  checkAvailability(): ApiAvailability {
    return this.availability;
  }

  registerTools(): void {
    this.registerContractTool(testContract, async ({ value }) => ({ echoed: value }));
  }
}

test('BaseApiTools registers contracts even when the backing API is unavailable', async () => {
  const server = new FakeServer();
  const tools = new TestApiTools(server);
  tools.availability = {
    available: false,
    message: 'chrome.test API is not defined',
    details: 'Add the "testPermission" permission',
  };

  tools.register();

  assert.equal(server.tools.length, 1);
  assert.equal(server.tools[0]?.name, 'extension_tool_test_action');

  const result = (await server.tools[0]?.execute({ value: 'safe' })) as {
    isError?: boolean;
    content: Array<{ type: string; text: string }>;
    structuredContent?: Record<string, unknown>;
  };

  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent, {
    ok: false,
    code: 'api_unavailable',
    message: 'chrome.test API is not defined',
    details: 'Add the "testPermission" permission',
    groupId: 'test',
    actionId: 'action',
    chromeApi: 'test.action',
    permissions: ['testPermission'],
    hostPermissions: ['https://example.com/*'],
    requiresActiveTab: true,
  });
  assert.equal(result.content[0]?.text, JSON.stringify(result.structuredContent, null, 2));
});

test('BaseApiTools validates successful output and returns matching content text', async () => {
  const server = new FakeServer();
  new TestApiTools(server).register();

  const result = (await server.tools[0]?.execute({ value: 'ok' })) as {
    content: Array<{ type: string; text: string }>;
    structuredContent?: Record<string, unknown>;
  };

  assert.deepEqual(result.structuredContent, { echoed: 'ok' });
  assert.equal(result.content[0]?.text, JSON.stringify(result.structuredContent, null, 2));
});

test('BaseApiTools returns structured schema errors for invalid input', async () => {
  const server = new FakeServer();
  new TestApiTools(server).register();

  const result = (await server.tools[0]?.execute({ value: 42 })) as {
    isError?: boolean;
    content: Array<{ type: string; text: string }>;
    structuredContent?: Record<string, unknown>;
  };

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent?.code, 'tool_input_invalid');
  assert.equal(result.structuredContent?.groupId, 'test');
  assert.equal(result.content[0]?.text, JSON.stringify(result.structuredContent, null, 2));
});
