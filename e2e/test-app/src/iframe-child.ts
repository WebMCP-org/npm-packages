/**
 * Iframe Child - MCP Server
 *
 * This page registers tools, resources, and prompts via the polyfill.
 * The MCPIframeElement in the parent page will connect and expose these.
 */

// Import the polyfill to create the MCP server
import '@mcp-b/global';

const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');

function log(message: string) {
  const entry = document.createElement('div');
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logEl?.appendChild(entry);
  console.log(`[iframe-child] ${message}`);
}

function updateStatus(text: string) {
  if (statusEl) statusEl.textContent = text;
}

// ==================== Register Tools ====================

log('Registering tools...');

navigator.modelContext.provideContext({
  tools: [
    {
      name: 'add',
      description: 'Add two numbers',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'number', description: 'First number' },
          b: { type: 'number', description: 'Second number' },
        },
        required: ['a', 'b'],
      },
      async execute(args: Record<string, unknown>) {
        const a = args.a as number;
        const b = args.b as number;
        const result = a + b;
        log(`add(${a}, ${b}) = ${result}`);
        return {
          content: [{ type: 'text', text: String(result) }],
        };
      },
    },
    {
      name: 'multiply',
      description: 'Multiply two numbers',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'number', description: 'First number' },
          b: { type: 'number', description: 'Second number' },
        },
        required: ['a', 'b'],
      },
      async execute(args: Record<string, unknown>) {
        const a = args.a as number;
        const b = args.b as number;
        const result = a * b;
        log(`multiply(${a}, ${b}) = ${result}`);
        return {
          content: [{ type: 'text', text: String(result) }],
        };
      },
    },
    {
      name: 'greet',
      description: 'Generate a greeting',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name to greet' },
        },
        required: ['name'],
      },
      async execute(args: Record<string, unknown>) {
        const name = args.name as string;
        const greeting = `Hello, ${name}!`;
        log(`greet("${name}") = "${greeting}"`);
        return {
          content: [{ type: 'text', text: greeting }],
        };
      },
    },
  ],
});

log('Tools registered: add, multiply, greet');

// ==================== Register Resources ====================

log('Registering resources...');

navigator.modelContext.provideContext({
  resources: [
    {
      uri: 'iframe://config',
      name: 'Iframe Config',
      description: 'Configuration from the iframe',
      mimeType: 'application/json',
      async read() {
        log('Reading iframe://config');
        return {
          contents: [
            {
              uri: 'iframe://config',
              text: JSON.stringify({ version: '1.0.0', name: 'iframe-child' }),
              mimeType: 'application/json',
            },
          ],
        };
      },
    },
    {
      uri: 'iframe://timestamp',
      name: 'Current Timestamp',
      description: 'Current server timestamp',
      mimeType: 'text/plain',
      async read() {
        const timestamp = new Date().toISOString();
        log(`Reading iframe://timestamp = ${timestamp}`);
        return {
          contents: [
            {
              uri: 'iframe://timestamp',
              text: timestamp,
              mimeType: 'text/plain',
            },
          ],
        };
      },
    },
  ],
});

log('Resources registered: iframe://config, iframe://timestamp');

// ==================== Register Prompts ====================

log('Registering prompts...');

navigator.modelContext.provideContext({
  prompts: [
    {
      name: 'summarize',
      description: 'Create a summary prompt',
      argsSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to summarize' },
        },
        required: ['text'],
      },
      async get(args: Record<string, unknown>) {
        const text = args.text as string;
        log(`Getting summarize prompt for: "${text.substring(0, 30)}..."`);
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Please summarize the following text:\n\n${text}`,
              },
            },
          ],
        };
      },
    },
    {
      name: 'translate',
      description: 'Create a translation prompt',
      argsSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to translate' },
          language: { type: 'string', description: 'Target language' },
        },
        required: ['text', 'language'],
      },
      async get(args: Record<string, unknown>) {
        const text = args.text as string;
        const language = args.language as string;
        log(`Getting translate prompt: "${text.substring(0, 20)}..." -> ${language}`);
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Please translate the following text to ${language}:\n\n${text}`,
              },
            },
          ],
        };
      },
    },
  ],
});

log('Prompts registered: summarize, translate');

// ==================== Ready ====================

updateStatus('MCP Server Ready - 3 tools, 2 resources, 2 prompts');
log('Iframe child ready!');

// Expose for testing
declare global {
  interface Window {
    iframeChild: {
      getToolCount: () => number;
      getResourceCount: () => number;
      getPromptCount: () => number;
    };
  }
}

window.iframeChild = {
  getToolCount: () => navigator.modelContext.listTools().length,
  getResourceCount: () => navigator.modelContext.listResources().length,
  getPromptCount: () => navigator.modelContext.listPrompts().length,
};
