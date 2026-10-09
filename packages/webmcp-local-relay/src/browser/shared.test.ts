import { describe, expect, it, vi } from 'vitest';
import {
  buildRelayEndpointCacheKey,
  isJsonObject,
  isLoopbackHost,
  normalizeSerializedToolResult,
  RELAY_BROWSER_PROTOCOL,
  RELAY_DISCOVERY_PROTOCOL,
  RELAY_ENDPOINT_CACHE_KEY,
  RELAY_PORT_RANGE_END,
  RELAY_PORT_RANGE_START,
  type SendableSocket,
  safeSend,
  sanitizeLogText,
  selectRelayTools,
} from './shared.js';

describe('isJsonObject', () => {
  it('returns true for plain objects', () => {
    expect(isJsonObject({})).toBe(true);
    expect(isJsonObject({ a: 1 })).toBe(true);
  });

  it('returns false for arrays', () => {
    expect(isJsonObject([])).toBe(false);
    expect(isJsonObject([1, 2])).toBe(false);
  });

  it('returns false for null', () => {
    expect(isJsonObject(null)).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isJsonObject(undefined)).toBe(false);
    expect(isJsonObject(42)).toBe(false);
    expect(isJsonObject('string')).toBe(false);
    expect(isJsonObject(true)).toBe(false);
  });
});

describe('normalizeSerializedToolResult', () => {
  it.each(['Order placed', '10.50', 'true', '[1]'])('keeps %s as the original text', (text) => {
    expect(normalizeSerializedToolResult(text)).toMatchObject({
      content: [{ type: 'text', text }],
      isError: false,
    });
  });

  it('unquotes a JSON string result', () => {
    expect(normalizeSerializedToolResult('"quoted"')).toMatchObject({
      content: [{ type: 'text', text: 'quoted' }],
      isError: false,
    });
  });

  it('structures a JSON object result', () => {
    expect(normalizeSerializedToolResult('{"total":10.5}')).toMatchObject({
      isError: false,
      structuredContent: { total: 10.5 },
    });
  });

  it('rejects input_required results', () => {
    expect(
      normalizeSerializedToolResult('{"resultType":"input_required","requestState":"x"}')
    ).toMatchObject({
      content: [{ type: 'text', text: expect.stringContaining('input_required') }],
      isError: true,
    });
  });
});

describe('selectRelayTools', () => {
  it("keeps the host page's tool on a name collision and warns once per name", () => {
    const pageWindow = { name: 'page' };
    const frameWindow = { name: 'frame' };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const frameTool = { name: 'dup', description: 'Frame tool', window: frameWindow };
      const pageTool = { name: 'dup', description: 'Page tool', window: pageWindow };
      const frameOnly = { name: 'frame_only', description: 'Frame only', window: frameWindow };

      const selected = selectRelayTools([frameTool, frameOnly, pageTool], pageWindow);
      expect(selected).toHaveLength(2);
      expect(selected[0]).toBe(pageTool);
      expect(selected[1]).toBe(frameOnly);
      expect(selectRelayTools([pageTool, frameTool], pageWindow)).toEqual([pageTool]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain('"dup"');
    } finally {
      warn.mockRestore();
    }
  });
});

describe('isLoopbackHost', () => {
  it('recognizes loopback addresses', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
  });

  it('rejects non-loopback addresses', () => {
    expect(isLoopbackHost('192.168.1.1')).toBe(false);
    expect(isLoopbackHost('example.com')).toBe(false);
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
    expect(isLoopbackHost('')).toBe(false);
  });
});

describe('sanitizeLogText', () => {
  it('strips newline characters from log values', () => {
    expect(sanitizeLogText('invoke\r\nspoofed-entry')).toBe('invokespoofed-entry');
  });
});

describe('safeSend', () => {
  function makeSocket(readyState: number, send: SendableSocket['send'] = vi.fn()): SendableSocket {
    return { readyState, send };
  }

  it('sends when socket is OPEN', () => {
    const send = vi.fn();
    const ws = makeSocket(WebSocket.OPEN, send);
    safeSend(ws, '{"test":true}');
    expect(send).toHaveBeenCalledWith('{"test":true}');
  });

  it('does not send when socket is CLOSED', () => {
    const send = vi.fn();
    const ws = makeSocket(WebSocket.CLOSED, send);
    safeSend(ws, 'data');
    expect(send).not.toHaveBeenCalled();
  });

  it('catches errors from send', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ws = makeSocket(WebSocket.OPEN, () => {
      throw new Error('connection reset');
    });
    try {
      expect(() => safeSend(ws, 'data')).not.toThrow();
      expect(warn).toHaveBeenCalledWith(
        '[webmcp-relay] Failed to send message:',
        expect.any(Error)
      );
    } finally {
      warn.mockRestore();
    }
  });
});

describe('relay discovery constants', () => {
  it('exposes the supported browser protocols', () => {
    expect(RELAY_BROWSER_PROTOCOL).toBe('webmcp.v1');
    expect(RELAY_DISCOVERY_PROTOCOL).toBe('webmcp-discovery.v1');
  });

  it('exposes the bounded default relay port range', () => {
    expect(RELAY_PORT_RANGE_START).toBe(9333);
    expect(RELAY_PORT_RANGE_END).toBe(9348);
  });

  it('builds cache keys scoped to the host origin and selectors', () => {
    expect(
      buildRelayEndpointCacheKey({
        hostOrigin: 'https://app.example.com',
        relayId: 'desktop',
        workspace: 'default',
      })
    ).toBe(`${RELAY_ENDPOINT_CACHE_KEY}:https%3A%2F%2Fapp.example.com:desktop:default`);
  });
});
