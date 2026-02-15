import '@mcp-b/global'; // Initialize navigator.modelContext polyfill
import type { McpClientProviderProps } from '@mcp-b/react-webmcp';
import { McpClientProvider } from '@mcp-b/react-webmcp';
import { TabClientTransport } from '@mcp-b/transports';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import ReactDOM from 'react-dom/client';
import App from './App';
import { testMiddleware } from './testMiddleware';

// Expose for testing
console.log('React WebMCP Test App initialized');
console.log('navigator.modelContext:', navigator.modelContext);

// Extend Window interface for testing
declare global {
  interface Window {
    mcpClient?: unknown;
  }
}

// Create MCP client that connects to the MCP server exposed by @mcp-b/global
// The server is automatically started when @mcp-b/global is imported
const client = new Client({ name: 'ReactWebMCPTestClient', version: '1.0.0' });

// Wrap client with test middleware to observe MCP events
const wrappedClient = testMiddleware.wrapClient(client);

// Expose the wrapped client globally for e2e testing
window.mcpClient = wrappedClient;

// Use TabClientTransport to connect to the MCP server
// The 'mcp' channel matches what TabServerTransport uses in @mcp-b/global
const transport = new TabClientTransport({
  targetOrigin: '*',
  channelId: 'mcp',
});
const providerClient = wrappedClient as unknown as McpClientProviderProps['client'];
const providerTransport = transport as unknown as McpClientProviderProps['transport'];

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <McpClientProvider client={providerClient} transport={providerTransport}>
    <App />
  </McpClientProvider>
);
