/**
 * MCP Iframe Host - Test Page
 *
 * This page uses the <mcp-iframe> element to embed an iframe
 * and expose its tools, resources, and prompts to the parent.
 */

// Import the polyfill (creates navigator.modelContext on parent)
import '@mcp-b/global';

// Import the MCPIframeElement (auto-registers as <mcp-iframe>)
import '@mcp-b/transports';

import type { MCPIframeElement } from '@mcp-b/transports';

// DOM elements
const connectionStatus = document.getElementById('connection-status')!;
const exposedToolsEl = document.getElementById('exposed-tools')!;
const exposedResourcesEl = document.getElementById('exposed-resources')!;
const exposedPromptsEl = document.getElementById('exposed-prompts')!;
const toolResultEl = document.getElementById('tool-result')!;
const resourceResultEl = document.getElementById('resource-result')!;
const promptResultEl = document.getElementById('prompt-result')!;
const logEl = document.getElementById('log')!;

// Get the mcp-iframe element
const mcpIframe = document.getElementById('child-iframe') as MCPIframeElement;

// Logging
function log(message: string, type: 'info' | 'success' | 'error' = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
  console.log(`[mcp-iframe-host] [${type}] ${message}`);
}

// Update exposed items display
function updateExposedItems() {
  exposedToolsEl.textContent = mcpIframe.exposedTools.join('\n') || 'None';
  exposedToolsEl.setAttribute('data-count', String(mcpIframe.exposedTools.length));

  exposedResourcesEl.textContent = mcpIframe.exposedResources.join('\n') || 'None';
  exposedResourcesEl.setAttribute('data-count', String(mcpIframe.exposedResources.length));

  exposedPromptsEl.textContent = mcpIframe.exposedPrompts.join('\n') || 'None';
  exposedPromptsEl.setAttribute('data-count', String(mcpIframe.exposedPrompts.length));
}

// Event handlers for mcp-iframe
mcpIframe.addEventListener('mcp-iframe-ready', (event) => {
  const detail = (event as CustomEvent).detail;
  log(
    `Iframe connected! Tools: ${detail.tools.length}, Resources: ${detail.resources.length}, Prompts: ${detail.prompts.length}`,
    'success'
  );

  connectionStatus.textContent = 'Connected to iframe MCP server';
  connectionStatus.className = 'status ready';
  connectionStatus.setAttribute('data-status', 'ready');

  updateExposedItems();
});

mcpIframe.addEventListener('mcp-iframe-error', (event) => {
  const detail = (event as CustomEvent).detail;
  log(`Connection error: ${detail.error}`, 'error');

  connectionStatus.textContent = 'Failed to connect to iframe';
  connectionStatus.className = 'status error';
  connectionStatus.setAttribute('data-status', 'error');
});

mcpIframe.addEventListener('mcp-iframe-tools-changed', (event) => {
  const detail = (event as CustomEvent).detail;
  log(
    `Tools changed! Tools: ${detail.tools.length}, Resources: ${detail.resources.length}, Prompts: ${detail.prompts.length}`,
    'info'
  );
  updateExposedItems();
});

// Test tool calls
async function callTool(name: string, args: Record<string, unknown>) {
  const prefixedName = `child-iframe:${name}`;
  log(`Calling tool: ${prefixedName}`);
  toolResultEl.textContent = 'Calling...';

  try {
    // Use the parent's modelContext to call the exposed tool
    const result = await navigator.modelContext.executeTool(prefixedName, args);
    const text =
      result.content[0]?.type === 'text' ? result.content[0].text : JSON.stringify(result);
    log(`Tool result: ${text}`, 'success');
    toolResultEl.textContent = `Result: ${text}`;
    toolResultEl.setAttribute('data-result', text);
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`Tool error: ${errorMsg}`, 'error');
    toolResultEl.textContent = `Error: ${errorMsg}`;
    toolResultEl.setAttribute('data-error', errorMsg);
    throw error;
  }
}

// Test resource reads
async function readResource(uri: string) {
  const prefixedUri = `child-iframe:${uri}`;
  log(`Reading resource: ${prefixedUri}`);
  resourceResultEl.textContent = 'Reading...';

  try {
    // Access the internal bridge to read resources
    const w = window as unknown as {
      __mcpBridge?: {
        modelContext: {
          readResource: (
            uri: string
          ) => Promise<{ contents: Array<{ uri: string; text?: string }> }>;
        };
      };
    };

    if (!w.__mcpBridge) {
      throw new Error('MCP bridge not available');
    }

    const result = await w.__mcpBridge.modelContext.readResource(prefixedUri);
    const text = result.contents[0]?.text ?? JSON.stringify(result);
    log(`Resource content: ${text}`, 'success');
    resourceResultEl.textContent = `Content: ${text}`;
    resourceResultEl.setAttribute('data-result', text);
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`Resource error: ${errorMsg}`, 'error');
    resourceResultEl.textContent = `Error: ${errorMsg}`;
    resourceResultEl.setAttribute('data-error', errorMsg);
    throw error;
  }
}

// Test prompt gets
async function getPrompt(name: string, args: Record<string, unknown>) {
  const prefixedName = `child-iframe:${name}`;
  log(`Getting prompt: ${prefixedName}`);
  promptResultEl.textContent = 'Getting...';

  try {
    // Access the internal bridge to get prompts
    const w = window as unknown as {
      __mcpBridge?: {
        modelContext: {
          getPrompt: (
            name: string,
            args?: Record<string, unknown>
          ) => Promise<{
            messages: Array<{ role: string; content: { type: string; text: string } }>;
          }>;
        };
      };
    };

    if (!w.__mcpBridge) {
      throw new Error('MCP bridge not available');
    }

    const result = await w.__mcpBridge.modelContext.getPrompt(prefixedName, args);
    const text = result.messages[0]?.content?.text ?? JSON.stringify(result);
    const truncated = text.length > 100 ? text.substring(0, 100) + '...' : text;
    log(`Prompt content: ${truncated}`, 'success');
    promptResultEl.textContent = `Message: ${truncated}`;
    promptResultEl.setAttribute('data-result', text);
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`Prompt error: ${errorMsg}`, 'error');
    promptResultEl.textContent = `Error: ${errorMsg}`;
    promptResultEl.setAttribute('data-error', errorMsg);
    throw error;
  }
}

// Button handlers
document.getElementById('test-add')!.addEventListener('click', () => {
  callTool('add', { a: 5, b: 3 });
});

document.getElementById('test-multiply')!.addEventListener('click', () => {
  callTool('multiply', { a: 4, b: 7 });
});

document.getElementById('test-greet')!.addEventListener('click', () => {
  callTool('greet', { name: 'World' });
});

document.getElementById('test-read-config')!.addEventListener('click', () => {
  readResource('iframe://config');
});

document.getElementById('test-read-timestamp')!.addEventListener('click', () => {
  readResource('iframe://timestamp');
});

document.getElementById('test-summarize')!.addEventListener('click', () => {
  getPrompt('summarize', { text: 'This is a test text that needs to be summarized.' });
});

document.getElementById('test-translate')!.addEventListener('click', () => {
  getPrompt('translate', { text: 'Hello, World!', language: 'Spanish' });
});

document.getElementById('clear-log')!.addEventListener('click', () => {
  logEl.innerHTML = '';
  log('Log cleared');
});

// Initialize
log('Host page initialized');
log('Waiting for iframe connection...');

// Expose for testing
declare global {
  interface Window {
    mcpIframeHost: {
      getMcpIframe: () => MCPIframeElement;
      isReady: () => boolean;
      getExposedToolCount: () => number;
      getExposedResourceCount: () => number;
      getExposedPromptCount: () => number;
      callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
      readResource: (uri: string) => Promise<unknown>;
      getPrompt: (name: string, args: Record<string, unknown>) => Promise<unknown>;
    };
  }
}

window.mcpIframeHost = {
  getMcpIframe: () => mcpIframe,
  isReady: () => mcpIframe.ready,
  getExposedToolCount: () => mcpIframe.exposedTools.length,
  getExposedResourceCount: () => mcpIframe.exposedResources.length,
  getExposedPromptCount: () => mcpIframe.exposedPrompts.length,
  callTool,
  readResource,
  getPrompt,
};
