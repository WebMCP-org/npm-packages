import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { fromJsonSchema, McpServer } from '@modelcontextprotocol/server';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { McpClientProvider, useMcpClient } from './McpClientProvider.js';

interface TestConnection {
  client: Client;
  server: McpServer;
  transport: InMemoryTransport;
}

async function createConnection(configure: (server: McpServer) => void): Promise<TestConnection> {
  const server = new McpServer({
    name: 'react-webmcp-test-server',
    version: '1.0.0',
  });
  configure(server);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client(
    { name: 'react-webmcp-test-client', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } }
  );

  return { client, server, transport: clientTransport };
}

function providerFor(connection: TestConnection) {
  return function Provider({ children }: { children: ReactNode }) {
    return (
      <McpClientProvider client={connection.client} transport={connection.transport}>
        {children}
      </McpClientProvider>
    );
  };
}

async function closeConnection(connection: TestConnection): Promise<void> {
  await Promise.allSettled([connection.client.close(), connection.server.close()]);
}

describe('McpClientProvider with an MCP v2 in-memory connection', () => {
  it('connects, discovers, and invokes real server capabilities', async () => {
    const connection = await createConnection((server) => {
      server.registerTool(
        'echo',
        {
          description: 'Echoes a message',
          inputSchema: fromJsonSchema<{ message: string }>({
            type: 'object',
            properties: { message: { type: 'string' } },
            required: ['message'],
          }),
        },
        async ({ message }) => ({
          content: [{ type: 'text', text: `echo:${message}` }],
        })
      );
      server.registerResource(
        'settings',
        'config://settings',
        {
          description: 'Application settings',
          mimeType: 'application/json',
        },
        async (uri) => ({
          contents: [{ uri: uri.href, text: '{"theme":"dark"}' }],
        })
      );
    });

    const hook = await renderHook(() => useMcpClient(), {
      wrapper: providerFor(connection),
    });

    try {
      await vi.waitFor(() => {
        expect(hook.result.current.isConnected).toBe(true);
        expect(hook.result.current.isLoading).toBe(false);
        expect(hook.result.current.error).toBeNull();
        expect(hook.result.current.tools.map(({ name }) => name)).toContain('echo');
        expect(hook.result.current.resources.map(({ uri }) => uri)).toContain('config://settings');
      });

      const toolResult = await hook.result.current.client.callTool({
        name: 'echo',
        arguments: { message: 'hello' },
      });
      const resourceResult = await hook.result.current.client.readResource({
        uri: 'config://settings',
      });

      expect(toolResult.content[0]).toMatchObject({ type: 'text', text: 'echo:hello' });
      expect(resourceResult.contents[0]).toMatchObject({
        uri: 'config://settings',
        text: '{"theme":"dark"}',
      });
    } finally {
      await hook.unmount();
      await closeConnection(connection);
    }
  });

  it('refreshes the tool list after a real list_changed notification', async () => {
    let addTool: (() => void) | undefined;
    const connection = await createConnection((server) => {
      server.registerTool('initial', {}, async () => ({
        content: [{ type: 'text', text: 'initial' }],
      }));
      addTool = () => {
        server.registerTool('added_later', {}, async () => ({
          content: [{ type: 'text', text: 'added' }],
        }));
      };
    });

    const hook = await renderHook(() => useMcpClient(), {
      wrapper: providerFor(connection),
    });

    try {
      await vi.waitFor(() => {
        expect(hook.result.current.tools.map(({ name }) => name)).toEqual(['initial']);
      });

      addTool?.();

      await vi.waitFor(() => {
        expect(hook.result.current.tools.map(({ name }) => name)).toEqual([
          'initial',
          'added_later',
        ]);
      });
    } finally {
      await hook.unmount();
      await closeConnection(connection);
    }
  });
});
