import { describe, expect, it } from 'vitest';
import { InboundToolSchema, NormalizedToolSchema, normalizeInboundTool } from './protocol.js';
import {
  BrowserHelloMessageSchema,
  BrowserPongMessageSchema,
  BrowserToolResultMessageSchema,
  BrowserToolsChangedMessageSchema,
  BrowserToolsListMessageSchema,
  BrowserToRelayMessageSchema,
  RelayClientHelloSchema,
  RelayClientInvokeSchema,
  RelayClientListToolsSchema,
  RelayClientToServerMessageSchema,
  RelayInvokeMessageSchema,
  RelayPingMessageSchema,
  RelayReloadMessageSchema,
  RelayServerResultSchema,
  RelayServerToClientMessageSchema,
  RelayServerToolsChangedSchema,
  RelayServerToolsSchema,
  RelaySourceInfoSchema,
  RelayToBrowserMessageSchema,
} from './schemas.js';

describe('InboundToolSchema', () => {
  it('accepts a valid tool with name only', () => {
    const result = InboundToolSchema.safeParse({ name: 'search' });
    expect(result.success).toBe(true);
  });

  it('accepts a tool with SDK-compatible fields', () => {
    const result = InboundToolSchema.safeParse({
      name: 'search',
      title: 'Search',
      description: 'Search for items',
      inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
      outputSchema: { type: 'object' },
      annotations: { readOnlyHint: true },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a tool with empty name', () => {
    const result = InboundToolSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a tool with missing name', () => {
    const result = InboundToolSchema.safeParse({ description: 'no name' });
    expect(result.success).toBe(false);
  });
});

describe('normalizeInboundTool', () => {
  it('normalizes to SDK Tool shape with default inputSchema', () => {
    const normalized = normalizeInboundTool({ name: 'search' });
    const parsed = NormalizedToolSchema.safeParse(normalized);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.inputSchema).toEqual({ type: 'object', properties: {} });
  });

  it('drops invalid optional metadata', () => {
    const normalized = normalizeInboundTool({
      name: 'bad',
      annotations: { readOnlyHint: 'nope' },
      outputSchema: { type: 'string' },
    });
    expect(normalized.annotations).toBeUndefined();
    expect(normalized.outputSchema).toBeUndefined();
  });
});

describe('BrowserHelloMessageSchema', () => {
  it('accepts a hello with all fields', () => {
    const result = BrowserHelloMessageSchema.safeParse({
      type: 'hello',
      tabId: 'abc-123',
      origin: 'https://example.com',
      url: 'https://example.com/page',
      title: 'My Page',
      iconUrl: 'https://example.com/icon.png',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a hello with only required fields', () => {
    const result = BrowserHelloMessageSchema.safeParse({
      type: 'hello',
      tabId: 'abc-123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a hello with empty tabId', () => {
    const result = BrowserHelloMessageSchema.safeParse({
      type: 'hello',
      tabId: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a hello without tabId', () => {
    const result = BrowserHelloMessageSchema.safeParse({
      type: 'hello',
    });
    expect(result.success).toBe(false);
  });
});

describe('BrowserToolResultMessageSchema', () => {
  it('accepts a result with a callId and unknown result', () => {
    const result = BrowserToolResultMessageSchema.safeParse({
      type: 'result',
      callId: 'call-1',
      result: { content: [{ type: 'text', text: 'done' }] },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a result with empty callId', () => {
    const result = BrowserToolResultMessageSchema.safeParse({
      type: 'result',
      callId: '',
      result: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects a result without callId', () => {
    const result = BrowserToolResultMessageSchema.safeParse({
      type: 'result',
      result: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('BrowserToRelayMessageSchema', () => {
  it('parses a hello message', () => {
    const result = BrowserToRelayMessageSchema.safeParse({
      type: 'hello',
      tabId: 'tab-1',
    });
    expect(result.success).toBe(true);
    expect(result.data?.type).toBe('hello');
  });

  it('parses a tools/list message', () => {
    const result = BrowserToRelayMessageSchema.safeParse({
      type: 'tools/list',
      tools: [{ name: 'search' }],
    });
    expect(result.success).toBe(true);
    expect(result.data?.type).toBe('tools/list');
    if (result.success && result.data.type === 'tools/list') {
      expect(result.data.tools[0]?.inputSchema).toEqual({ type: 'object', properties: {} });
    }
  });

  it('parses a tools/changed message', () => {
    const result = BrowserToRelayMessageSchema.safeParse({
      type: 'tools/changed',
      tools: [],
    });
    expect(result.success).toBe(true);
    expect(result.data?.type).toBe('tools/changed');
  });

  it('parses a result message', () => {
    const result = BrowserToRelayMessageSchema.safeParse({
      type: 'result',
      callId: 'c-1',
      result: null,
    });
    expect(result.success).toBe(true);
    expect(result.data?.type).toBe('result');
  });

  it('parses a pong message', () => {
    const result = BrowserToRelayMessageSchema.safeParse({ type: 'pong' });
    expect(result.success).toBe(true);
    expect(result.data?.type).toBe('pong');
  });

  it('rejects an unknown message type', () => {
    const result = BrowserToRelayMessageSchema.safeParse({
      type: 'unknown',
      data: 123,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a message without a type field', () => {
    const result = BrowserToRelayMessageSchema.safeParse({ tabId: 'tab-1' });
    expect(result.success).toBe(false);
  });
});

describe('BrowserToolsListMessageSchema', () => {
  it('accepts a tools/list with empty tools array', () => {
    const result = BrowserToolsListMessageSchema.safeParse({
      type: 'tools/list',
      tools: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects tools/list without tools array', () => {
    const result = BrowserToolsListMessageSchema.safeParse({
      type: 'tools/list',
    });
    expect(result.success).toBe(false);
  });

  it('rejects tools/list with invalid tool entries', () => {
    const result = BrowserToolsListMessageSchema.safeParse({
      type: 'tools/list',
      tools: [{ name: '' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('BrowserToolsChangedMessageSchema', () => {
  it('accepts a tools/changed with tools', () => {
    const result = BrowserToolsChangedMessageSchema.safeParse({
      type: 'tools/changed',
      tools: [{ name: 'updated_tool' }],
    });
    expect(result.success).toBe(true);
  });
});

describe('BrowserPongMessageSchema', () => {
  it('accepts a pong with no extra fields', () => {
    const result = BrowserPongMessageSchema.safeParse({ type: 'pong' });
    expect(result.success).toBe(true);
  });
});

describe('RelayInvokeMessageSchema', () => {
  it('accepts an invoke with required fields', () => {
    const result = RelayInvokeMessageSchema.safeParse({
      type: 'invoke',
      callId: 'call-1',
      toolName: 'search',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an invoke with args', () => {
    const result = RelayInvokeMessageSchema.safeParse({
      type: 'invoke',
      callId: 'call-1',
      toolName: 'search',
      args: { query: 'test' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invoke with empty callId', () => {
    const result = RelayInvokeMessageSchema.safeParse({
      type: 'invoke',
      callId: '',
      toolName: 'search',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invoke with empty toolName', () => {
    const result = RelayInvokeMessageSchema.safeParse({
      type: 'invoke',
      callId: 'call-1',
      toolName: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('RelayPingMessageSchema', () => {
  it('accepts a ping message', () => {
    const result = RelayPingMessageSchema.safeParse({ type: 'ping' });
    expect(result.success).toBe(true);
  });
});

describe('RelayReloadMessageSchema', () => {
  it('accepts a reload message', () => {
    const result = RelayReloadMessageSchema.safeParse({ type: 'reload' });
    expect(result.success).toBe(true);
  });

  it('rejects wrong type', () => {
    const result = RelayReloadMessageSchema.safeParse({ type: 'ping' });
    expect(result.success).toBe(false);
  });
});

describe('RelayToBrowserMessageSchema', () => {
  it('parses an invoke message', () => {
    const result = RelayToBrowserMessageSchema.safeParse({
      type: 'invoke',
      callId: 'c-1',
      toolName: 'search',
    });
    expect(result.success).toBe(true);
    expect(result.data?.type).toBe('invoke');
  });

  it('parses a ping message', () => {
    const result = RelayToBrowserMessageSchema.safeParse({ type: 'ping' });
    expect(result.success).toBe(true);
    expect(result.data?.type).toBe('ping');
  });

  it('parses a reload message', () => {
    const result = RelayToBrowserMessageSchema.safeParse({ type: 'reload' });
    expect(result.success).toBe(true);
    expect(result.data?.type).toBe('reload');
  });

  it('rejects an unknown relay message type', () => {
    const result = RelayToBrowserMessageSchema.safeParse({
      type: 'unknown',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Relay source metadata
// ---------------------------------------------------------------------------

describe('RelaySourceInfoSchema', () => {
  it('accepts valid source info with all fields', () => {
    const result = RelaySourceInfoSchema.safeParse({
      sourceId: 'conn-1',
      tabId: 'tab-1',
      origin: 'https://example.com',
      url: 'https://example.com/page',
      title: 'Test Page',
      iconUrl: 'https://example.com/icon.png',
      connectedAt: 1000,
      lastSeenAt: 2000,
      toolCount: 3,
    });
    expect(result.success).toBe(true);
  });

  it('accepts source info with only required fields', () => {
    const result = RelaySourceInfoSchema.safeParse({
      sourceId: 'conn-1',
      tabId: 'tab-1',
      connectedAt: 1000,
      lastSeenAt: 2000,
      toolCount: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects source info missing sourceId', () => {
    const result = RelaySourceInfoSchema.safeParse({
      tabId: 'tab-1',
      connectedAt: 1000,
      lastSeenAt: 2000,
      toolCount: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects source info missing toolCount', () => {
    const result = RelaySourceInfoSchema.safeParse({
      sourceId: 'conn-1',
      tabId: 'tab-1',
      connectedAt: 1000,
      lastSeenAt: 2000,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Relay-to-relay protocol schemas (client mode ↔ server mode)
// ---------------------------------------------------------------------------

describe('RelayClientHelloSchema', () => {
  it('accepts a relay/hello message', () => {
    const result = RelayClientHelloSchema.safeParse({ type: 'relay/hello' });
    expect(result.success).toBe(true);
  });

  it('rejects a message with wrong type', () => {
    const result = RelayClientHelloSchema.safeParse({ type: 'hello' });
    expect(result.success).toBe(false);
  });
});

describe('RelayClientListToolsSchema', () => {
  it('accepts a relay/list-tools message', () => {
    const result = RelayClientListToolsSchema.safeParse({ type: 'relay/list-tools' });
    expect(result.success).toBe(true);
  });

  it('rejects a message with wrong type', () => {
    const result = RelayClientListToolsSchema.safeParse({ type: 'list-tools' });
    expect(result.success).toBe(false);
  });
});

describe('RelayClientInvokeSchema', () => {
  it('accepts a relay/invoke with required fields', () => {
    const result = RelayClientInvokeSchema.safeParse({
      type: 'relay/invoke',
      callId: 'call-1',
      toolName: 'search',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a relay/invoke with args', () => {
    const result = RelayClientInvokeSchema.safeParse({
      type: 'relay/invoke',
      callId: 'call-1',
      toolName: 'search',
      args: { query: 'test' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a relay/invoke with empty callId', () => {
    const result = RelayClientInvokeSchema.safeParse({
      type: 'relay/invoke',
      callId: '',
      toolName: 'search',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a relay/invoke with empty toolName', () => {
    const result = RelayClientInvokeSchema.safeParse({
      type: 'relay/invoke',
      callId: 'call-1',
      toolName: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a relay/invoke without callId', () => {
    const result = RelayClientInvokeSchema.safeParse({
      type: 'relay/invoke',
      toolName: 'search',
    });
    expect(result.success).toBe(false);
  });
});

describe('RelayClientToServerMessageSchema', () => {
  it('parses a relay/hello message', () => {
    const result = RelayClientToServerMessageSchema.safeParse({ type: 'relay/hello' });
    expect(result.success).toBe(true);
    expect(result.data?.type).toBe('relay/hello');
  });

  it('parses a relay/list-tools message', () => {
    const result = RelayClientToServerMessageSchema.safeParse({ type: 'relay/list-tools' });
    expect(result.success).toBe(true);
    expect(result.data?.type).toBe('relay/list-tools');
  });

  it('parses a relay/invoke message', () => {
    const result = RelayClientToServerMessageSchema.safeParse({
      type: 'relay/invoke',
      callId: 'c-1',
      toolName: 'search',
    });
    expect(result.success).toBe(true);
    expect(result.data?.type).toBe('relay/invoke');
  });

  it('rejects an unknown relay client message type', () => {
    const result = RelayClientToServerMessageSchema.safeParse({ type: 'relay/unknown' });
    expect(result.success).toBe(false);
  });

  it('rejects a browser-protocol message', () => {
    const result = RelayClientToServerMessageSchema.safeParse({
      type: 'hello',
      tabId: 'tab-1',
    });
    expect(result.success).toBe(false);
  });
});

describe('RelayServerToolsSchema', () => {
  it('accepts a relay/tools with tools, sources, and toolSourceMap', () => {
    const result = RelayServerToolsSchema.safeParse({
      type: 'relay/tools',
      tools: [
        {
          name: 'search',
          description: 'Search tool',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
      sources: [
        {
          sourceId: 'conn-1',
          tabId: 'tab-1',
          origin: 'https://example.com',
          connectedAt: 1000,
          lastSeenAt: 2000,
          toolCount: 1,
        },
      ],
      toolSourceMap: { search: ['conn-1'] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a relay/tools with empty arrays', () => {
    const result = RelayServerToolsSchema.safeParse({
      type: 'relay/tools',
      tools: [],
      sources: [],
      toolSourceMap: {},
    });
    expect(result.success).toBe(true);
  });

  it('rejects relay/tools without tools array', () => {
    const result = RelayServerToolsSchema.safeParse({
      type: 'relay/tools',
      sources: [],
      toolSourceMap: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects relay/tools without sources', () => {
    const result = RelayServerToolsSchema.safeParse({
      type: 'relay/tools',
      tools: [],
      toolSourceMap: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects relay/tools with invalid tool entries', () => {
    const result = RelayServerToolsSchema.safeParse({
      type: 'relay/tools',
      tools: [{ name: '' }],
      sources: [],
      toolSourceMap: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('RelayServerResultSchema', () => {
  it('accepts a relay/result with callId and result', () => {
    const result = RelayServerResultSchema.safeParse({
      type: 'relay/result',
      callId: 'call-1',
      result: { content: [{ type: 'text', text: 'done' }] },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a relay/result with null result', () => {
    const result = RelayServerResultSchema.safeParse({
      type: 'relay/result',
      callId: 'call-1',
      result: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a relay/result with empty callId', () => {
    const result = RelayServerResultSchema.safeParse({
      type: 'relay/result',
      callId: '',
      result: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects a relay/result without callId', () => {
    const result = RelayServerResultSchema.safeParse({
      type: 'relay/result',
      result: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('RelayServerToolsChangedSchema', () => {
  it('accepts a relay/tools-changed with tools, sources, and toolSourceMap', () => {
    const result = RelayServerToolsChangedSchema.safeParse({
      type: 'relay/tools-changed',
      tools: [{ name: 'updated_tool', inputSchema: { type: 'object', properties: {} } }],
      sources: [
        {
          sourceId: 'conn-1',
          tabId: 'tab-1',
          connectedAt: 1000,
          lastSeenAt: 2000,
          toolCount: 1,
        },
      ],
      toolSourceMap: { updated_tool: ['conn-1'] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a relay/tools-changed with empty arrays', () => {
    const result = RelayServerToolsChangedSchema.safeParse({
      type: 'relay/tools-changed',
      tools: [],
      sources: [],
      toolSourceMap: {},
    });
    expect(result.success).toBe(true);
  });

  it('rejects relay/tools-changed without tools', () => {
    const result = RelayServerToolsChangedSchema.safeParse({
      type: 'relay/tools-changed',
      sources: [],
      toolSourceMap: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('RelayServerToClientMessageSchema', () => {
  it('parses a relay/tools message', () => {
    const result = RelayServerToClientMessageSchema.safeParse({
      type: 'relay/tools',
      tools: [{ name: 'search', inputSchema: { type: 'object', properties: {} } }],
      sources: [],
      toolSourceMap: {},
    });
    expect(result.success).toBe(true);
    expect(result.data?.type).toBe('relay/tools');
  });

  it('parses a relay/result message', () => {
    const result = RelayServerToClientMessageSchema.safeParse({
      type: 'relay/result',
      callId: 'c-1',
      result: { content: [] },
    });
    expect(result.success).toBe(true);
    expect(result.data?.type).toBe('relay/result');
  });

  it('parses a relay/tools-changed message', () => {
    const result = RelayServerToClientMessageSchema.safeParse({
      type: 'relay/tools-changed',
      tools: [],
      sources: [],
      toolSourceMap: {},
    });
    expect(result.success).toBe(true);
    expect(result.data?.type).toBe('relay/tools-changed');
  });

  it('rejects an unknown relay server message type', () => {
    const result = RelayServerToClientMessageSchema.safeParse({ type: 'relay/unknown' });
    expect(result.success).toBe(false);
  });

  it('rejects a browser-protocol message', () => {
    const result = RelayServerToClientMessageSchema.safeParse({
      type: 'tools/list',
      tools: [],
    });
    expect(result.success).toBe(false);
  });
});
