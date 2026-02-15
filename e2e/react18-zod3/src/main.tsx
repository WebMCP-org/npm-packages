import '@mcp-b/global'; // Initialize navigator.modelContext polyfill
import type { McpClientProviderProps } from '@mcp-b/react-webmcp';
import { McpClientProvider } from '@mcp-b/react-webmcp';
import { TabClientTransport } from '@mcp-b/transports';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ComponentType } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Expose for testing
console.log('React 18 + Zod 3 Test App initialized');
console.log('navigator.modelContext:', navigator.modelContext);

// Create MCP client
const client = new Client({ name: 'React18Zod3TestClient', version: '1.0.0' });

// Use TabClientTransport to connect to the MCP server
const transport = new TabClientTransport({
  targetOrigin: '*',
  channelId: 'mcp',
});
const Provider = McpClientProvider as unknown as ComponentType<McpClientProviderProps>;
const providerClient = client as unknown as McpClientProviderProps['client'];
const providerTransport = transport as unknown as McpClientProviderProps['transport'];

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <Provider client={providerClient} transport={providerTransport}>
    <App />
  </Provider>
);
