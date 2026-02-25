import { describe, expect, it } from 'vitest';
import {
  BrowserHelloMessageSchema,
  BrowserPongMessageSchema,
  BrowserToolResultMessageSchema,
  BrowserToolSchema,
  BrowserToolsChangedMessageSchema,
  BrowserToolsListMessageSchema,
  BrowserToRelayMessageSchema,
  RelayInvokeMessageSchema,
  RelayPingMessageSchema,
  RelayToBrowserMessageSchema,
} from './schemas.js';

describe('BrowserToolSchema', () => {
  it('accepts a valid tool with name only', () => {
    const result = BrowserToolSchema.safeParse({ name: 'search' });
    expect(result.success).toBe(true);
  });

  it('accepts a tool with all optional fields', () => {
    const result = BrowserToolSchema.safeParse({
      name: 'search',
      description: 'Search for items',
      inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
      outputSchema: { type: 'object' },
      annotations: { readOnlyHint: true },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a tool with empty name', () => {
    const result = BrowserToolSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a tool with missing name', () => {
    const result = BrowserToolSchema.safeParse({ description: 'no name' });
    expect(result.success).toBe(false);
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

  it('rejects an unknown relay message type', () => {
    const result = RelayToBrowserMessageSchema.safeParse({
      type: 'unknown',
    });
    expect(result.success).toBe(false);
  });
});
