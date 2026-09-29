import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, expect, it, vi } from 'vitest';
import { BrowserMcpServer } from './index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('serves MCP only when the page has no WebMCP context', async () => {
  vi.stubGlobal('isSecureContext', false);
  const server = new BrowserMcpServer({ name: 'no-context', version: '1.0.0' });
  expect(document.modelContext).toBeUndefined();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'no-context-client', version: '1.0.0' });
  const events: string[] = [];
  server.addEventListener('toolchange', () => events.push('toolchange'));

  try {
    await server.registerTool({
      name: 'echo',
      description: 'Echoes input',
      execute: (input) => input,
    });
    expect(server.listTools().map(({ name }) => name)).toEqual(['echo']);
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    await expect(client.callTool({ name: 'echo', arguments: { value: 1 } })).resolves.toMatchObject(
      { structuredContent: { value: 1 } }
    );
    await expect(server.getTools()).rejects.toMatchObject({ name: 'InvalidStateError' });
    await expect(
      server.executeTool({
        name: 'echo',
        title: '',
        description: 'Echoes input',
        origin: location.origin,
        window,
      })
    ).rejects.toMatchObject({ name: 'InvalidStateError' });
    await expect(server.syncNativeTools()).resolves.toBeUndefined();
    expect(events).toEqual([]);
  } finally {
    await client.close();
    await server.close();
  }
});
