import { describe, expect, it } from 'vitest';
import {
  BrowserToRelayMessageSchema,
  DEFAULT_TOOL_INPUT_SCHEMA,
  InboundToolSchema,
  NormalizedToolSchema,
  normalizeInboundTool,
  RelayClientToServerMessageSchema,
  RelayDescriptorSchema,
  RelayHelloAcceptedMessageSchema,
  RelayHelloRejectedMessageSchema,
  RelayServerToClientMessageSchema,
  RelaySourceInfoSchema,
  RelayToBrowserMessageSchema,
  ServerHelloMessageSchema,
} from './index.js';

const TOOL = {
  name: 'search',
  description: 'Search for items',
  inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
};

const SOURCE = {
  sourceId: 'connection-1',
  tabId: 'tab-1',
  origin: 'https://example.com',
  url: 'https://example.com/page',
  title: 'Example',
  iconUrl: 'https://example.com/icon.svg',
  connectedAt: 1_000,
  lastSeenAt: 2_000,
  toolCount: 1,
};

const SERVER_HELLO = {
  type: 'server-hello',
  service: 'webmcp-local-relay',
  version: 1,
  host: '127.0.0.1',
  instanceId: 'relay-1',
  label: 'Local Relay',
  port: 9333,
  relayId: 'desktop',
  workspace: 'default',
};

const TOOLS_PAYLOAD = {
  tools: [TOOL],
  sources: [SOURCE],
  toolSourceMap: { search: ['connection-1'] },
};

describe('tool wire contract', () => {
  it('defaults only an omitted input schema', () => {
    const inbound = InboundToolSchema.parse({ name: 'search' });
    const normalized = normalizeInboundTool(inbound);

    expect(normalized).toEqual({ name: 'search', inputSchema: DEFAULT_TOOL_INPUT_SCHEMA });
    expect(NormalizedToolSchema.safeParse(normalized).success).toBe(true);
  });

  it('preserves valid MCP tool metadata', () => {
    const inbound = InboundToolSchema.parse({
      ...TOOL,
      title: 'Search',
      outputSchema: { type: 'string' },
      annotations: { readOnlyHint: true },
      icons: [{ src: 'https://example.com/icon.svg', mimeType: 'image/svg+xml' }],
      execution: { taskSupport: 'forbidden' },
      _meta: { 'example/key': 'value' },
    });

    expect(normalizeInboundTool(inbound)).toEqual(inbound);
  });

  it.each([
    ['name', { name: '' }],
    ['title', { name: 'search', title: 42 }],
    ['description', { name: 'search', description: 42 }],
    ['inputSchema', { name: 'search', inputSchema: 'not-a-schema' }],
    ['outputSchema', { name: 'search', outputSchema: 'not-a-schema' }],
    ['annotations', { name: 'search', annotations: { readOnlyHint: 'yes' } }],
    ['icons', { name: 'search', icons: [{ src: 42 }] }],
    ['execution', { name: 'search', execution: { taskSupport: 'later' } }],
    ['_meta', { name: 'search', _meta: [] }],
  ])('rejects invalid %s metadata', (_field, tool) => {
    expect(InboundToolSchema.safeParse(tool).success).toBe(false);
  });

  it('filters task-required tools from both browser tool snapshots', () => {
    for (const type of ['tools/list', 'tools/changed'] as const) {
      const message = BrowserToRelayMessageSchema.parse({
        type,
        tools: [
          { name: 'required', execution: { taskSupport: 'required' } },
          { name: 'optional', execution: { taskSupport: 'optional' } },
          { name: 'ordinary' },
        ],
      });

      expect(message).toMatchObject({
        tools: [
          { name: 'optional', inputSchema: DEFAULT_TOOL_INPUT_SCHEMA },
          { name: 'ordinary', inputSchema: DEFAULT_TOOL_INPUT_SCHEMA },
        ],
      });
    }
  });
});

describe('browser to relay wire contract', () => {
  it.each([
    [
      'hello',
      {
        type: 'hello',
        tabId: 'tab-1',
        origin: 'https://example.com',
        url: 'https://example.com/page',
        title: 'Example',
        iconUrl: 'https://example.com/icon.svg',
      },
    ],
    ['tools/list', { type: 'tools/list', tools: [{ name: 'search' }] }],
    ['tools/changed', { type: 'tools/changed', tools: [TOOL] }],
    ['result', { type: 'result', callId: 'call-1', result: null }],
    ['pong', { type: 'pong' }],
  ])('accepts %s', (_type, message) => {
    expect(BrowserToRelayMessageSchema.safeParse(message).success).toBe(true);
  });

  it.each([
    ['unknown type', { type: 'unknown' }],
    ['missing type', { tabId: 'tab-1' }],
    ['empty tab ID', { type: 'hello', tabId: '' }],
    ['missing tools', { type: 'tools/list' }],
    [
      'invalid tool metadata',
      { type: 'tools/list', tools: [{ name: 'search', annotations: { readOnlyHint: 'yes' } }] },
    ],
    ['empty result call ID', { type: 'result', callId: '', result: {} }],
  ])('rejects %s', (_case, message) => {
    expect(BrowserToRelayMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe('relay to browser wire contract', () => {
  it.each([
    ['server-hello', SERVER_HELLO],
    ['hello/accepted', { type: 'hello/accepted' }],
    [
      'hello/rejected',
      { type: 'hello/rejected', reason: 'origin-not-allowed', message: 'Origin denied.' },
    ],
    ['invoke', { type: 'invoke', callId: 'call-1', toolName: 'search', args: { query: 'MCP' } }],
    ['ping', { type: 'ping' }],
    ['reload', { type: 'reload' }],
  ])('accepts %s', (_type, message) => {
    expect(RelayToBrowserMessageSchema.safeParse(message).success).toBe(true);
  });

  it.each([
    ['unknown type', { type: 'unknown' }],
    ['browser message', { type: 'pong' }],
    ['wrong server version', { ...SERVER_HELLO, version: 2 }],
    ['empty rejection reason', { type: 'hello/rejected', reason: '', message: 'Denied.' }],
    ['empty invoke call ID', { type: 'invoke', callId: '', toolName: 'search' }],
    ['empty invoke tool name', { type: 'invoke', callId: 'call-1', toolName: '' }],
  ])('rejects %s', (_case, message) => {
    expect(RelayToBrowserMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe('relay client to server wire contract', () => {
  it.each([
    ['relay/hello', { type: 'relay/hello' }],
    ['relay/list-tools', { type: 'relay/list-tools' }],
    [
      'relay/invoke',
      { type: 'relay/invoke', callId: 'call-1', toolName: 'search', args: { query: 'MCP' } },
    ],
  ])('accepts %s', (_type, message) => {
    expect(RelayClientToServerMessageSchema.safeParse(message).success).toBe(true);
  });

  it.each([
    ['unknown type', { type: 'relay/unknown' }],
    ['browser message', { type: 'hello', tabId: 'tab-1' }],
    ['empty call ID', { type: 'relay/invoke', callId: '', toolName: 'search' }],
    ['empty tool name', { type: 'relay/invoke', callId: 'call-1', toolName: '' }],
  ])('rejects %s', (_case, message) => {
    expect(RelayClientToServerMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe('relay server to client wire contract', () => {
  it.each([
    ['server-hello', SERVER_HELLO],
    ['relay/tools', { type: 'relay/tools', ...TOOLS_PAYLOAD }],
    [
      'relay/result',
      {
        type: 'relay/result',
        callId: 'call-1',
        result: { content: [{ type: 'text', text: 'done' }] },
      },
    ],
    ['relay/tools-changed', { type: 'relay/tools-changed', ...TOOLS_PAYLOAD }],
  ])('accepts %s', (_type, message) => {
    expect(RelayServerToClientMessageSchema.safeParse(message).success).toBe(true);
  });

  it.each([
    ['unknown type', { type: 'relay/unknown' }],
    ['browser message', { type: 'tools/list', tools: [] }],
    ['tools', { type: 'relay/tools', sources: [], toolSourceMap: {} }],
    ['sources', { type: 'relay/tools', tools: [], toolSourceMap: {} }],
    ['toolSourceMap', { type: 'relay/tools', tools: [], sources: [] }],
    [
      'normalized input schema',
      { type: 'relay/tools', tools: [{ name: 'search' }], sources: [], toolSourceMap: {} },
    ],
    ['result', { type: 'relay/result', callId: 'call-1', result: null }],
    ['tools-changed sources', { type: 'relay/tools-changed', tools: [], toolSourceMap: {} }],
    ['tools-changed toolSourceMap', { type: 'relay/tools-changed', tools: [], sources: [] }],
  ])('rejects missing or invalid %s', (_field, message) => {
    expect(RelayServerToClientMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe('standalone public schemas', () => {
  it('accepts complete descriptor and source metadata', () => {
    expect(
      RelayDescriptorSchema.safeParse({
        host: SERVER_HELLO.host,
        instanceId: SERVER_HELLO.instanceId,
        label: SERVER_HELLO.label,
        port: SERVER_HELLO.port,
        relayId: SERVER_HELLO.relayId,
        workspace: SERVER_HELLO.workspace,
      }).success
    ).toBe(true);
    expect(RelaySourceInfoSchema.safeParse(SOURCE).success).toBe(true);
    expect(ServerHelloMessageSchema.safeParse(SERVER_HELLO).success).toBe(true);
    expect(RelayHelloAcceptedMessageSchema.safeParse({ type: 'hello/accepted' }).success).toBe(
      true
    );
    expect(
      RelayHelloRejectedMessageSchema.safeParse({
        type: 'hello/rejected',
        reason: 'origin-not-allowed',
        message: 'Origin denied.',
      }).success
    ).toBe(true);
  });

  it.each([
    [
      'descriptor port',
      RelayDescriptorSchema,
      { host: '127.0.0.1', instanceId: 'relay-1', port: 0 },
    ],
    ['source ID', RelaySourceInfoSchema, { ...SOURCE, sourceId: undefined }],
    ['server service', ServerHelloMessageSchema, { ...SERVER_HELLO, service: 'other' }],
    [
      'rejection message',
      RelayHelloRejectedMessageSchema,
      { type: 'hello/rejected', reason: 'denied', message: '' },
    ],
  ])('rejects invalid %s', (_case, schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });
});
