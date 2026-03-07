import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type EventHandler = (event: { data?: unknown; origin?: string }) => void;

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  readonly send = vi.fn<(data: string) => void>();
  readonly close = vi.fn<() => void>();
  readonly listeners = new Map<string, EventHandler[]>();

  readyState = MockWebSocket.OPEN;

  constructor(readonly url: string) {
    mockSockets.push(this);
  }

  addEventListener(type: string, listener: EventHandler): void {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(listener);
    this.listeners.set(type, handlers);
  }

  emit(type: string, event: { data?: unknown; origin?: string }): void {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event);
    }
  }
}

const mockSockets: MockWebSocket[] = [];
const originalDescriptors = {
  WebSocket: Object.getOwnPropertyDescriptor(globalThis, 'WebSocket'),
  document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
  window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
};

function restoreGlobal(
  key: 'WebSocket' | 'document' | 'window',
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor);
    return;
  }
  delete (globalThis as Record<string, unknown>)[key];
}

describe('widget runtime logging', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSockets.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreGlobal('WebSocket', originalDescriptors.WebSocket);
    restoreGlobal('document', originalDescriptors.document);
    restoreGlobal('window', originalDescriptors.window);
  });

  it('sanitizes unrecognized relay message types before logging them', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});

    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      value: MockWebSocket,
      writable: true,
    });

    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        referrer: '',
      },
      writable: true,
    });

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          search:
            '?hostOrigin=https%3A%2F%2Fapp.example.com&hostUrl=https%3A%2F%2Fapp.example.com%2Fpage&hostTitle=Test%20Page&tabId=tab-1&relayHost=127.0.0.1&relayPort=9333',
        },
        parent: {
          postMessage: vi.fn(),
        },
        addEventListener: vi.fn(),
      },
      writable: true,
    });

    await import('./widget.js');

    expect(mockSockets).toHaveLength(1);
    mockSockets[0]?.emit('message', {
      data: JSON.stringify({ type: 'invoke\r\nforged-log-line' }),
    });

    expect(debug).toHaveBeenCalledWith(
      '[webmcp-relay-widget] Ignoring unrecognized message type:',
      'invokeforged-log-line'
    );
  });
});
