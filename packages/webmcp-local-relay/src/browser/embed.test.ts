import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (event: { data?: unknown; origin?: string; source?: unknown }) => void;

interface FakeIframe {
  contentWindow: { postMessage: ReturnType<typeof vi.fn> };
  src: string;
  style: { display: string };
  addEventListener(type: string, listener: Listener): void;
  setAttribute(name: string, value: string): void;
}

const originalDescriptors = {
  Blob: Object.getOwnPropertyDescriptor(globalThis, 'Blob'),
  HTMLScriptElement: Object.getOwnPropertyDescriptor(globalThis, 'HTMLScriptElement'),
  URL: Object.getOwnPropertyDescriptor(globalThis, 'URL'),
  crypto: Object.getOwnPropertyDescriptor(globalThis, 'crypto'),
  document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
  fetch: Object.getOwnPropertyDescriptor(globalThis, 'fetch'),
  navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
  sessionStorage: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'),
  window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
};

function restoreGlobal(key: keyof typeof originalDescriptors): void {
  const descriptor = originalDescriptors[key];
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor);
    return;
  }
  delete (globalThis as Record<string, unknown>)[key];
}

async function importFreshEmbed(): Promise<void> {
  vi.resetModules();
  await import('./embed.js');
}

function installEmbedEnvironment(options?: {
  modelContext?: unknown;
  modelContextTesting?: unknown;
}): {
  iframe: FakeIframe;
  windowListeners: Map<string, Set<Listener>>;
} {
  class FakeHTMLScriptElement {}

  Object.defineProperty(globalThis, 'HTMLScriptElement', {
    configurable: true,
    value: FakeHTMLScriptElement,
  });

  const iframe: FakeIframe = {
    contentWindow: { postMessage: vi.fn() },
    src: '',
    style: { display: '' },
    addEventListener: vi.fn(),
    setAttribute: vi.fn(),
  };

  const script = Object.create(FakeHTMLScriptElement.prototype) as HTMLScriptElement;
  Object.defineProperties(script, {
    getAttribute: {
      value: (name: string) => {
        const attrs: Record<string, string> = {
          'data-auto-connect': 'false',
          'data-relay-host': '127.0.0.1',
          'data-relay-port': '9333',
          'data-widget-url': 'https://cdn.example.com/widget.html',
        };
        return attrs[name] ?? null;
      },
    },
    hasAttribute: { value: () => false },
    src: { value: 'https://cdn.example.com/embed.js' },
  });

  const windowListeners = new Map<string, Set<Listener>>();
  const documentListeners = new Map<string, Set<Listener>>();
  const body = {
    appendChild: vi.fn((node: FakeIframe) => node),
  };

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      body,
      addEventListener(type: string, listener: Listener) {
        if (!documentListeners.has(type)) {
          documentListeners.set(type, new Set());
        }
        documentListeners.get(type)!.add(listener);
      },
      createElement: vi.fn((tagName: string) => {
        if (tagName !== 'iframe') {
          throw new Error(`Unexpected element: ${tagName}`);
        }
        return iframe;
      }),
      currentScript: script,
      querySelector: vi.fn(() => null),
      title: 'Relay test',
    },
  });

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener(type: string, listener: Listener) {
        if (!windowListeners.has(type)) {
          windowListeners.set(type, new Set());
        }
        windowListeners.get(type)!.add(listener);
      },
      location: {
        hash: '#ignored',
        href: 'https://app.example.com/page?debug=1#ignored',
        origin: 'https://app.example.com',
        reload: vi.fn(),
        search: '?debug=1',
      },
      removeEventListener(type: string, listener: Listener) {
        windowListeners.get(type)?.delete(listener);
      },
    },
  });

  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: vi.fn(() => 'tab-1'),
      setItem: vi.fn(),
    },
  });

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      ...(options?.modelContext ? { modelContext: options.modelContext } : {}),
      ...(options?.modelContextTesting ? { modelContextTesting: options.modelContextTesting } : {}),
    },
  });

  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: vi.fn(async () => ({
      ok: false,
      status: 404,
      text: async () => '',
    })),
  });

  return { iframe, windowListeners };
}

describe('relay embed tool sync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
    for (const key of Object.keys(originalDescriptors) as Array<keyof typeof originalDescriptors>) {
      restoreGlobal(key);
    }
  });

  it('subscribes to both runtime event surfaces and posts changed tools from listTools', async () => {
    const modelContextListeners = new Map<string, Listener>();
    const testingListeners = new Map<string, Listener>();
    let tools = [{ name: 'search', description: 'Search', inputSchema: { type: 'object' } }];
    const env = installEmbedEnvironment({
      modelContext: {
        addEventListener: vi.fn((type: string, listener: Listener) => {
          modelContextListeners.set(type, listener);
        }),
        callTool: vi.fn(),
        listTools: vi.fn(() => tools),
      },
      modelContextTesting: {
        addEventListener: vi.fn((type: string, listener: Listener) => {
          testingListeners.set(type, listener);
        }),
        executeTool: vi.fn(),
        listTools: vi.fn(() => []),
      },
    });

    await importFreshEmbed();
    await vi.advanceTimersByTimeAsync(1);

    expect(modelContextListeners.has('toolchange')).toBe(true);
    expect(testingListeners.has('toolchange')).toBe(true);
    expect(env.iframe.contentWindow.postMessage).toHaveBeenLastCalledWith(
      { type: 'webmcp.tools.changed', tools },
      'https://cdn.example.com'
    );

    tools = [
      {
        name: 'search',
        description: 'Search v2',
        inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
      },
    ];
    modelContextListeners.get('toolchange')?.({});
    testingListeners.get('toolchange')?.({});
    await vi.advanceTimersByTimeAsync(1);

    expect(env.iframe.contentWindow.postMessage).toHaveBeenCalledTimes(2);
    expect(env.iframe.contentWindow.postMessage).toHaveBeenLastCalledWith(
      { type: 'webmcp.tools.changed', tools },
      'https://cdn.example.com'
    );
  });

  it('polls for silent AbortSignal tool removal after subscribing', async () => {
    let tools = [
      { name: 'alpha', description: 'A' },
      { name: 'beta', description: 'B' },
    ];
    const env = installEmbedEnvironment({
      modelContextTesting: {
        addEventListener: vi.fn(),
        executeTool: vi.fn(),
        listTools: vi.fn(() =>
          tools.map((tool) => ({
            description: tool.description,
            inputSchema: JSON.stringify({ type: 'object' }),
            name: tool.name,
          }))
        ),
      },
    });

    await importFreshEmbed();
    await vi.advanceTimersByTimeAsync(1);
    expect(env.iframe.contentWindow.postMessage).toHaveBeenCalledTimes(1);

    tools = [{ name: 'alpha', description: 'A' }];
    await vi.advanceTimersByTimeAsync(2001);

    expect(env.iframe.contentWindow.postMessage).toHaveBeenCalledTimes(2);
    expect(env.iframe.contentWindow.postMessage).toHaveBeenLastCalledWith(
      {
        type: 'webmcp.tools.changed',
        tools: [{ name: 'alpha', description: 'A', inputSchema: { type: 'object' } }],
      },
      'https://cdn.example.com'
    );
  });

  it('polls immediately when no event subscription API exists', async () => {
    let tools = [{ name: 'alpha', description: 'A' }];
    const env = installEmbedEnvironment({
      modelContextTesting: {
        executeTool: vi.fn(),
        listTools: vi.fn(() =>
          tools.map((tool) => ({
            description: tool.description,
            inputSchema: JSON.stringify({ type: 'object' }),
            name: tool.name,
          }))
        ),
      },
    });

    await importFreshEmbed();
    await vi.advanceTimersByTimeAsync(1);
    expect(env.iframe.contentWindow.postMessage).toHaveBeenCalledTimes(1);

    tools = [{ name: 'alpha', description: 'A2' }];
    await vi.advanceTimersByTimeAsync(2001);

    expect(env.iframe.contentWindow.postMessage).toHaveBeenCalledTimes(2);
    expect(env.iframe.contentWindow.postMessage).toHaveBeenLastCalledWith(
      {
        type: 'webmcp.tools.changed',
        tools: [{ name: 'alpha', description: 'A2', inputSchema: { type: 'object' } }],
      },
      'https://cdn.example.com'
    );
  });
});
