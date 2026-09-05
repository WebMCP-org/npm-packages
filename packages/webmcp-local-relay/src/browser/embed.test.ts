import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const HOST_ORIGIN = 'https://app.example.com';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('cancels only authenticated matching invocations, including pending discovery and page teardown', async () => {
  class ScriptElement {
    src = 'https://relay.example.com/embed.js';
    getAttribute() {
      return null;
    }
    hasAttribute() {
      return false;
    }
  }
  const listeners = new Map<string, (event: MessageEvent) => void>();
  const widget = { postMessage: vi.fn() };
  const tool = { name: 'slow', description: 'Waits for completion' };
  const discovery = Promise.withResolvers<(typeof tool)[]>();
  const getTools = vi.fn().mockReturnValue(discovery.promise);
  const executions: Array<{ signal: AbortSignal; resolve: (value: string) => void }> = [];
  const executeTool = vi.fn(
    (_tool: unknown, _args: string, { signal }: { signal: AbortSignal }) =>
      new Promise<string>((resolve) => executions.push({ signal, resolve }))
  );
  const appendChild = vi.fn();
  vi.stubGlobal('HTMLScriptElement', ScriptElement);
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, text: async () => '<head></head>' })
  );
  vi.stubGlobal('window', {
    location: { origin: HOST_ORIGIN, href: `${HOST_ORIGIN}/page` },
    addEventListener: (type: string, listener: (event: MessageEvent) => void) => {
      listeners.set(type, listener);
    },
  });
  vi.stubGlobal('document', {
    currentScript: new ScriptElement(),
    title: 'Host',
    querySelector: () => null,
    body: { appendChild },
    createElement: () => ({
      contentWindow: widget,
      style: {},
      setAttribute: vi.fn(),
      addEventListener: vi.fn(),
    }),
    addEventListener: vi.fn(),
    modelContext: { getTools, executeTool, addEventListener: vi.fn() },
  });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:relay-widget');
  await import('./embed.js');
  await vi.waitFor(() => expect(appendChild).toHaveBeenCalled());

  const send = (type: string, requestId: string, origin = HOST_ORIGIN, source = widget) => {
    listeners.get('message')?.({
      data: { type, requestId, toolName: 'slow', args: { value: 1 } },
      origin,
      source,
    } as unknown as MessageEvent);
  };
  send('webmcp.tools.invoke.request', 'discovering');
  send('webmcp.tools.cancel.request', 'discovering');
  discovery.resolve([tool]);
  await Promise.resolve();
  expect(executeTool).not.toHaveBeenCalled();

  getTools.mockResolvedValue([tool]);
  send('webmcp.tools.invoke.request', 'first');
  send('webmcp.tools.invoke.request', 'second');
  await Promise.resolve();
  expect(executeTool).toHaveBeenCalledWith(tool, '{"value":1}', {
    signal: expect.any(AbortSignal),
  });
  expect(executions).toHaveLength(2);
  send('webmcp.tools.cancel.request', 'first', 'https://evil.example.com');
  send('webmcp.tools.cancel.request', 'first', HOST_ORIGIN, { postMessage: vi.fn() });
  send('webmcp.tools.cancel.request', 'unknown');
  expect(executions[0]?.signal.aborted).toBe(false);
  send('webmcp.tools.cancel.request', 'first');
  expect(executions[0]?.signal.aborted).toBe(true);
  expect(executions[1]?.signal.aborted).toBe(false);

  executions[0]?.resolve('late cancelled result');
  executions[1]?.resolve('completed');
  await vi.waitFor(() =>
    expect(widget.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'webmcp.tools.invoke.response', requestId: 'second' }),
      HOST_ORIGIN
    )
  );
  expect(widget.postMessage.mock.calls.some(([message]) => message.requestId === 'first')).toBe(
    false
  );
  send('webmcp.tools.cancel.request', 'second');
  expect(executions[1]?.signal.aborted).toBe(false);

  send('webmcp.tools.invoke.request', 'teardown');
  await Promise.resolve();
  listeners.get('pagehide')?.(new Event('pagehide') as MessageEvent);
  expect(executions[2]?.signal.aborted).toBe(true);
  executions[2]?.resolve('late teardown result');
});
