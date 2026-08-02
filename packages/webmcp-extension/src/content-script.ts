import { TabClientTransport } from '@mcp-b/transports';
import { Client, type ClientOptions, type Implementation } from '@modelcontextprotocol/client';

const defaultClientInfo: Implementation = {
  name: '@mcp-b/webmcp-extension',
  version: '1.0.0',
};

/** Connect an MCP client in an isolated extension content script to the current page. */
export async function connectWebMCPClient(
  clientInfo: Implementation = defaultClientInfo,
  clientOptions: ClientOptions = {}
): Promise<Client> {
  const client = new Client(clientInfo, {
    versionNegotiation: { mode: 'auto' },
    ...clientOptions,
  });
  await client.connect(new TabClientTransport({ targetOrigin: window.location.origin }));
  return client;
}
