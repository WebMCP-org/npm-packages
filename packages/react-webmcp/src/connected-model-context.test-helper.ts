import { BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';
import { Client, InMemoryTransport, type ClientCapabilities } from '@modelcontextprotocol/client';

export interface ConnectedModelContext {
  client: Client;
  close: () => Promise<void>;
}

export async function installConnectedModelContext(
  capabilities: ClientCapabilities,
  configureClient: (client: Client) => void
): Promise<ConnectedModelContext> {
  const previousDescriptor = Object.getOwnPropertyDescriptor(document, 'modelContext');
  const server = new BrowserMcpServer({
    name: 'react-webmcp-hook-test-server',
    version: '1.0.0',
  });
  const client = new Client(
    {
      name: 'react-webmcp-hook-test-client',
      version: '1.0.0',
    },
    {
      capabilities,
      versionNegotiation: { mode: 'auto' },
    }
  );
  configureClient(client);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    enumerable: true,
    value: server,
  });

  return {
    client,
    close: async () => {
      if (previousDescriptor) {
        Object.defineProperty(document, 'modelContext', previousDescriptor);
      } else {
        Reflect.deleteProperty(document, 'modelContext');
      }
      await Promise.allSettled([client.close(), server.close()]);
    },
  };
}
