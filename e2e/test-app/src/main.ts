import { TabClientTransport, TabServerTransport } from '@mcp-b/transports';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Counter state
let counter = 0;

// MCP instances
let server: McpServer | null = null;
let client: McpClient | null = null;
let serverTransport: TabServerTransport | null = null;
let clientTransport: TabClientTransport | null = null;

// DOM Elements
const serverStatusEl = document.getElementById('server-status')!;
const clientStatusEl = document.getElementById('client-status')!;
const counterDisplayEl = document.getElementById('counter-display')!;
const logEl = document.getElementById('log')!;

const startServerBtn = document.getElementById('start-server') as HTMLButtonElement;
const stopServerBtn = document.getElementById('stop-server') as HTMLButtonElement;
const connectClientBtn = document.getElementById('connect-client') as HTMLButtonElement;
const disconnectClientBtn = document.getElementById('disconnect-client') as HTMLButtonElement;
const listToolsBtn = document.getElementById('list-tools') as HTMLButtonElement;
const incrementBtn = document.getElementById('increment') as HTMLButtonElement;
const decrementBtn = document.getElementById('decrement') as HTMLButtonElement;
const resetBtn = document.getElementById('reset') as HTMLButtonElement;
const getCounterBtn = document.getElementById('get-counter') as HTMLButtonElement;
const clearLogBtn = document.getElementById('clear-log') as HTMLButtonElement;

// Logging utility
function log(message: string, type: 'info' | 'success' | 'error' = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  const timestamp = new Date().toLocaleTimeString();
  entry.textContent = `[${timestamp}] ${message}`;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
  console.log(`[${type.toUpperCase()}] ${message}`);
}

// Update counter display
function updateCounterDisplay() {
  counterDisplayEl.textContent = counter.toString();
  counterDisplayEl.setAttribute('data-counter', counter.toString());
}

// Update UI state
function updateUI() {
  const serverRunning = server !== null;
  const clientConnected = client !== null;

  startServerBtn.disabled = serverRunning;
  stopServerBtn.disabled = !serverRunning;
  connectClientBtn.disabled = !serverRunning || clientConnected;
  disconnectClientBtn.disabled = !clientConnected;
  listToolsBtn.disabled = !clientConnected;
  incrementBtn.disabled = !clientConnected;
  decrementBtn.disabled = !clientConnected;
  resetBtn.disabled = !clientConnected;
  getCounterBtn.disabled = !clientConnected;

  if (serverRunning) {
    serverStatusEl.textContent = 'Server: Running';
    serverStatusEl.className = 'status connected';
    serverStatusEl.setAttribute('data-status', 'running');
  } else {
    serverStatusEl.textContent = 'Server: Not Started';
    serverStatusEl.className = 'status disconnected';
    serverStatusEl.setAttribute('data-status', 'stopped');
  }

  if (clientConnected) {
    clientStatusEl.textContent = 'Client: Connected';
    clientStatusEl.className = 'status connected';
    clientStatusEl.setAttribute('data-status', 'connected');
  } else {
    clientStatusEl.textContent = 'Client: Not Connected';
    clientStatusEl.className = 'status disconnected';
    clientStatusEl.setAttribute('data-status', 'disconnected');
  }
}

// Start MCP Server
async function startServer() {
  try {
    log('Starting MCP Server...');

    server = new McpServer(
      {
        name: 'test-counter-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Register tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      log('Server: Received list_tools request');
      return {
        tools: [
          {
            name: 'incrementCounter',
            description: 'Increment the counter by 1',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'decrementCounter',
            description: 'Decrement the counter by 1',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'resetCounter',
            description: 'Reset the counter to 0',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'getCounter',
            description: 'Get the current counter value',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      log(`Server: Received call_tool request for ${request.params.name}`);

      switch (request.params.name) {
        case 'incrementCounter':
          counter++;
          updateCounterDisplay();
          log(`Counter incremented to ${counter}`, 'success');
          return {
            content: [
              {
                type: 'text',
                text: `Counter incremented to ${counter}`,
              },
            ],
          };

        case 'decrementCounter':
          counter--;
          updateCounterDisplay();
          log(`Counter decremented to ${counter}`, 'success');
          return {
            content: [
              {
                type: 'text',
                text: `Counter decremented to ${counter}`,
              },
            ],
          };

        case 'resetCounter':
          counter = 0;
          updateCounterDisplay();
          log('Counter reset to 0', 'success');
          return {
            content: [
              {
                type: 'text',
                text: 'Counter reset to 0',
              },
            ],
          };

        case 'getCounter':
          log(`Counter value retrieved: ${counter}`, 'success');
          return {
            content: [
              {
                type: 'text',
                text: `Current counter value: ${counter}`,
              },
            ],
          };

        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    });

    // Create and connect transport
    serverTransport = new TabServerTransport({
      allowedOrigins: ['*'],
    });

    await server.connect(serverTransport);

    log('MCP Server started successfully', 'success');
    updateUI();
  } catch (error) {
    log(`Failed to start server: ${error}`, 'error');
    console.error(error);
  }
}

// Stop MCP Server
async function stopServer() {
  try {
    log('Stopping MCP Server...');

    if (client) {
      await disconnectClient();
    }

    if (server) {
      await server.close();
      server = null;
    }

    if (serverTransport) {
      await serverTransport.close();
      serverTransport = null;
    }

    log('MCP Server stopped', 'success');
    updateUI();
  } catch (error) {
    log(`Failed to stop server: ${error}`, 'error');
    console.error(error);
  }
}

// Connect MCP Client
async function connectClient() {
  try {
    log('Connecting MCP Client...');

    client = new McpClient(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    clientTransport = new TabClientTransport({
      targetOrigin: window.location.origin,
    });

    await client.connect(clientTransport);

    log('MCP Client connected successfully', 'success');
    updateUI();
  } catch (error) {
    log(`Failed to connect client: ${error}`, 'error');
    console.error(error);
  }
}

// Disconnect MCP Client
async function disconnectClient() {
  try {
    log('Disconnecting MCP Client...');

    if (client) {
      await client.close();
      client = null;
    }

    if (clientTransport) {
      await clientTransport.close();
      clientTransport = null;
    }

    log('MCP Client disconnected', 'success');
    updateUI();
  } catch (error) {
    log(`Failed to disconnect client: ${error}`, 'error');
    console.error(error);
  }
}

// List available tools
async function listTools() {
  try {
    if (!client) {
      throw new Error('Client not connected');
    }

    log('Listing available tools...');
    const result = await client.listTools();

    log(`Found ${result.tools.length} tools:`, 'success');
    for (const tool of result.tools) {
      log(`  - ${tool.name}: ${tool.description}`);
    }
  } catch (error) {
    log(`Failed to list tools: ${error}`, 'error');
    console.error(error);
  }
}

// Call a tool
async function callTool(toolName: string, args: Record<string, unknown> = {}) {
  try {
    if (!client) {
      throw new Error('Client not connected');
    }

    log(`Calling tool: ${toolName}...`);
    const result = await client.callTool({
      name: toolName,
      arguments: args,
    });

    const textContent = result.content.find((c) => c.type === 'text');
    if (textContent && 'text' in textContent) {
      log(`Tool result: ${textContent.text}`, 'success');
    }

    return result;
  } catch (error) {
    log(`Failed to call tool ${toolName}: ${error}`, 'error');
    console.error(error);
    throw error;
  }
}

// Event listeners
startServerBtn.addEventListener('click', startServer);
stopServerBtn.addEventListener('click', stopServer);
connectClientBtn.addEventListener('click', connectClient);
disconnectClientBtn.addEventListener('click', disconnectClient);
listToolsBtn.addEventListener('click', listTools);
incrementBtn.addEventListener('click', () => callTool('incrementCounter'));
decrementBtn.addEventListener('click', () => callTool('decrementCounter'));
resetBtn.addEventListener('click', () => callTool('resetCounter'));
getCounterBtn.addEventListener('click', () => callTool('getCounter'));
clearLogBtn.addEventListener('click', () => {
  logEl.innerHTML = '';
  log('Log cleared');
});

// Initialize
updateUI();
updateCounterDisplay();
log('Application initialized');

// Expose functions for testing
(window as any).testApp = {
  startServer,
  stopServer,
  connectClient,
  disconnectClient,
  listTools,
  callTool,
  getCounter: () => counter,
  getServerStatus: () => server !== null,
  getClientStatus: () => client !== null,
};
