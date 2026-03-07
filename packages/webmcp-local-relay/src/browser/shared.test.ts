import { describe, expect, it, vi } from 'vitest';
import {
  createRequestId,
  isJsonObject,
  isLoopbackHost,
  type SendableSocket,
  safeSend,
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

describe('createRequestId', () => {
  it('returns a string', () => {
    expect(typeof createRequestId()).toBe('string');
  });

  it('returns unique values', () => {
    const ids = new Set(Array.from({ length: 20 }, () => createRequestId()));
    expect(ids.size).toBe(20);
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
    const ws = makeSocket(WebSocket.OPEN, () => {
      throw new Error('connection reset');
    });
    expect(() => safeSend(ws, 'data')).not.toThrow();
  });
});
