import { describe, expect, it, vi } from 'vitest';
import { createHttpRequestTool, createMcpFetch, initMcpFetch } from './index.js';

const createMockClient = () => {
  return {
    callTool: vi.fn(),
  };
};

describe('createMcpFetch', () => {
  it('serializes JSON requests and builds JSON responses', async () => {
    const client = createMockClient();
    client.callTool.mockResolvedValue({
      structuredContent: {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: { ok: true },
        bodyType: 'json',
      },
    });

    const mcpFetch = createMcpFetch(client);
    const response = await mcpFetch('https://example.com/api/time', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ now: true }),
    });

    const payload = await response.json();
    expect(payload).toEqual({ ok: true });

    const callArgs = client.callTool.mock.calls[0]?.[0]?.arguments as Record<string, unknown>;
    expect(callArgs.method).toBe('POST');
    expect(callArgs.url).toBe('https://example.com/api/time');
    expect(callArgs.bodyType).toBe('json');
    expect(callArgs.body).toEqual({ now: true });
  });

  it('handles base64 responses', async () => {
    const client = createMockClient();
    const base64 = Buffer.from('hello').toString('base64');

    client.callTool.mockResolvedValue({
      structuredContent: {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
        body: base64,
        bodyType: 'base64',
      },
    });

    const mcpFetch = createMcpFetch(client);
    const response = await mcpFetch('https://example.com/binary');
    const buffer = Buffer.from(await response.arrayBuffer());

    expect(buffer.toString('utf8')).toBe('hello');
  });

  it('falls back to base fetch when shouldHandle returns false', async () => {
    const client = createMockClient();
    const baseFetch = vi.fn(async () => new Response('fallback', { status: 200 }));

    const mcpFetch = createMcpFetch(client, {
      baseFetch,
      shouldHandle: () => false,
    });

    const response = await mcpFetch('https://example.com/fallback');
    expect(await response.text()).toBe('fallback');
    expect(client.callTool).not.toHaveBeenCalled();
  });
});

describe('initMcpFetch', () => {
  it('patches and restores global fetch', async () => {
    const originalFetch = globalThis.fetch;
    const client = createMockClient();

    client.callTool.mockResolvedValue({
      structuredContent: {
        status: 200,
        headers: { 'content-type': 'text/plain' },
        body: 'ok',
        bodyType: 'text',
      },
    });

    const restore = initMcpFetch(client);

    const response = await fetch('https://example.com/ok');
    expect(await response.text()).toBe('ok');

    restore();
    expect(globalThis.fetch).toBe(originalFetch);
  });
});

describe('createHttpRequestTool', () => {
  it('wraps handler responses into MCP tool results', async () => {
    const handler = createHttpRequestTool(async () => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { ok: true },
      bodyType: 'json',
    }));

    const result = await handler({
      method: 'GET',
      url: 'https://example.com/ok',
    });

    expect(result.structuredContent?.status).toBe(200);
    expect(result.content?.[0]?.text).toContain('"ok":true');
    expect(result.isError).toBe(false);
  });
});
