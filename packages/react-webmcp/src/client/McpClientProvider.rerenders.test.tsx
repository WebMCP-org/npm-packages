import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { Fragment, Profiler, StrictMode, memo, useLayoutEffect } from 'react';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { McpClientProvider, useMcpClient } from './McpClientProvider.js';

it.each([false, true])(
  'isolates client consumers from parent rerenders but delivers inventory changes (StrictMode=%s)',
  async (strictMode) => {
    const server = new McpServer({ name: 'render-test-server', version: '1.0.0' });
    server.registerTool('initial', {}, async () => ({ content: [] }));
    const [transport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client(
      { name: 'render-test-client', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } }
    );
    const connect = vi.spyOn(client, 'connect');
    const listTools = vi.spyOn(client, 'listTools');
    const commits = vi.fn();
    let context!: ReturnType<typeof useMcpClient>;
    const Mode = strictMode ? StrictMode : Fragment;

    const Consumer = memo(function Consumer() {
      const value = useMcpClient();
      useLayoutEffect(() => {
        context = value;
      });

      // Keep the profiler inside the memoized consumer, away from parent commits.
      return (
        <Profiler id="mcp-client-consumer" onRender={commits}>
          <output aria-label="Available tools">
            {value.tools.map(({ name }) => name).join(', ')}
          </output>
        </Profiler>
      );
    });

    function Parent({ revision }: { revision: number }) {
      return (
        <>
          <output aria-label="Parent revision">{revision}</output>
          <McpClientProvider client={client} transport={transport} opts={{ timeout: 1_000 }}>
            <Consumer />
          </McpClientProvider>
        </>
      );
    }

    const screen = await render(
      <Mode>
        <Parent revision={0} />
      </Mode>
    );
    try {
      await vi.waitFor(() => {
        expect(context.isConnected).toBe(true);
        expect(context.isLoading).toBe(false);
        expect(context.error).toBeNull();
        // Initial discovery and the post-subscription snapshot must both finish.
        expect(listTools.mock.calls.length).toBeGreaterThanOrEqual(2);
      });
      await Promise.all(listTools.mock.results.map(({ value }) => value));
      await screen.rerender(
        <Mode>
          <Parent revision={0} />
        </Mode>
      );
      await expect.element(screen.getByLabelText('Available tools')).toHaveTextContent('initial');
      expect(commits).toHaveBeenCalled();
      const connectedContext = context;
      const reconnect = context.reconnect;
      commits.mockClear();

      for (const revision of [1, 2, 3]) {
        await screen.rerender(
          <Mode>
            <Parent revision={revision} />
          </Mode>
        );
        await expect
          .element(screen.getByLabelText('Parent revision'))
          .toHaveTextContent(String(revision));
        expect(context).toBe(connectedContext);
        expect(context.reconnect).toBe(reconnect);
        expect(commits).not.toHaveBeenCalled();
      }
      expect(connect).toHaveBeenCalledOnce();

      // A real notification must still cross the memoized boundary.
      server.registerTool('added_later', {}, async () => ({ content: [] }));
      await expect
        .element(screen.getByLabelText('Available tools'))
        .toHaveTextContent('initial, added_later');
      expect(context.tools.map(({ name }) => name)).toEqual(['initial', 'added_later']);
      expect(context).not.toBe(connectedContext);
      expect(context.reconnect).toBe(reconnect);
      expect(commits.mock.calls.length).toBeGreaterThan(0);
      expect(connect).toHaveBeenCalledOnce();
    } finally {
      await screen.unmount();
      await Promise.allSettled([client.close(), server.close()]);
    }
  }
);
