import { IframeParentTransport } from '@mcp-b/transports';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Required DOM element not found: ${id}`);
  }
  return element as T;
}

const statusEl = requireElement<HTMLDivElement>('client-status');
const toolsEl = requireElement<HTMLPreElement>('client-tools');
const resultEl = requireElement<HTMLDivElement>('client-result');
const logEl = requireElement<HTMLDivElement>('client-log');
const iframeEl = requireElement<HTMLIFrameElement>('client-iframe');

type LogLevel = 'info' | 'success' | 'error';

function log(message: string, type: LogLevel = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
  console.log(`[mcp-iframe-client] [${type}] ${message}`);
}

function setStatus(status: 'pending' | 'connecting' | 'pass' | 'fail', message: string) {
  statusEl.dataset.status = status;
  statusEl.textContent = message;
  statusEl.className =
    status === 'pass' ? 'status ready' : status === 'fail' ? 'status error' : 'status pending';
  window.__mcpIframeClientTestStatus = status;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForTools(client: Client, toolName: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const tools = await client.listTools();
    if (tools.tools.some((tool) => tool.name === toolName)) {
      return tools;
    }
    await sleep(200);
  }

  return client.listTools();
}

async function runClientTest() {
  let finished = false;
  const timeoutId = window.setTimeout(() => {
    if (finished) return;
    finished = true;
    log('Timed out waiting for MCP client test', 'error');
    setStatus('fail', 'Timed out waiting for MCP client test');
  }, 15000);

  const targetOrigin = window.location.origin;
  const client = new Client({ name: 'iframe-client-test', version: '1.0.0' });
  const transport = new IframeParentTransport({
    iframe: iframeEl,
    targetOrigin,
  });

  setStatus('connecting', 'Connecting to iframe MCP server...');
  log('Starting MCP client connection');

  try {
    await client.connect(transport);
    log('Client connected to iframe server', 'success');

    const tools = await waitForTools(client, 'add');
    const toolNames = tools.tools.map((tool) => tool.name).sort();
    toolsEl.textContent = toolNames.join('\n') || 'None';
    toolsEl.setAttribute('data-count', String(toolNames.length));

    if (!toolNames.includes('add')) {
      throw new Error('Expected add tool to be exposed by iframe server');
    }

    resultEl.textContent = 'Calling add tool...';
    const result = await client.callTool({
      name: 'add',
      arguments: { a: 2, b: 3 },
    });

    const contentItems = Array.isArray(result.content)
      ? (result.content as Array<{ type?: string; text?: string }>)
      : [];
    const text =
      contentItems.find((item) => item.type === 'text')?.text ?? JSON.stringify(contentItems);
    resultEl.textContent = `Result: ${text}`;
    resultEl.setAttribute('data-result', text);

    if (result.isError) {
      throw new Error(`Tool returned error: ${text}`);
    }

    if (text !== '5') {
      throw new Error(`Unexpected tool result: ${text}`);
    }

    if (!finished) {
      finished = true;
      setStatus('pass', 'Client tool call succeeded');
      log('Client tool call succeeded', 'success');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    resultEl.setAttribute('data-error', message);
    if (!finished) {
      finished = true;
      setStatus('fail', 'Client tool call failed');
    }
    log(`Client test failed: ${message}`, 'error');
  } finally {
    clearTimeout(timeoutId);
    try {
      await client.close();
    } catch {
      // Ignore cleanup errors
    }
    try {
      await transport.close();
    } catch {
      // Ignore cleanup errors
    }
  }
}

let started = false;
const start = () => {
  if (started) return;
  started = true;
  void runClientTest();
};

if (iframeEl.contentDocument?.readyState === 'complete') {
  start();
} else {
  iframeEl.addEventListener('load', start, { once: true });
}

declare global {
  interface Window {
    __mcpIframeClientTestStatus?: string;
  }
}
