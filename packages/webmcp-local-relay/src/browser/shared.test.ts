import { describe, expect, it, vi } from 'vitest';
import {
  createRequestId,
  isJsonObject,
  isLoopbackHost,
  type SendableSocket,
  safeSend,
  sanitizeLogText,
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

  it('uses crypto.randomUUID when available', () => {
    const randomUuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue('uuid-123');
    try {
      expect(createRequestId()).toBe('uuid-123');
    } finally {
      randomUuid.mockRestore();
    }
  });

  it('returns unique values', () => {
    const ids = new Set(Array.from({ length: 20 }, () => createRequestId()));
    expect(ids.size).toBe(20);
  });

  it('falls back when crypto.randomUUID is unavailable', () => {
    const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const mathRandom = vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: undefined,
      writable: true,
    });

    try {
      expect(createRequestId()).toBe('1700000000000_12345678');
    } finally {
      dateNow.mockRestore();
      mathRandom.mockRestore();
      if (cryptoDescriptor) {
        Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
      } else {
        delete (globalThis as Record<string, unknown>).crypto;
      }
    }
  });
});

describe('sanitizeLogText', () => {
  it('strips newline characters from log values', () => {
    expect(sanitizeLogText('invoke\r\nspoofed-entry')).toBe('invokespoofed-entry');
  });

  it('coerces non-string values before sanitizing', () => {
    expect(sanitizeLogText(42)).toBe('42');
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
