import { IframeParentTransport } from '@mcp-b/transports';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Required DOM element not found: ${id}`);
  }
  return element as T;
}

const statusEl = requireElement<HTMLDivElement>('iframe-client-status');
const toolsEl = requireElement<HTMLPreElement>('iframe-client-tools');
const iframeEl = requireElement<HTMLIFrameElement>('runtime-contract-iframe');

function setStatus(status: 'pending' | 'ready' | 'error', text: string) {
  statusEl.textContent = text;
  statusEl.dataset.status = status;
  statusEl.className =
    status === 'ready' ? 'status ready' : status === 'error' ? 'status error' : 'status';
}

async function bootstrap() {
  const targetOrigin = window.location.origin;
  const client = new Client({ name: 'runtime-contract-iframe-client', version: '1.0.0' });
  const transport = new IframeParentTransport({
    iframe: iframeEl,
    targetOrigin,
  });
  window.mcpClient = client;

  setStatus('pending', 'Connecting MCP client to iframe runtime...');
  await client.connect(transport);
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name).sort();
  toolsEl.textContent = JSON.stringify(names, null, 2);
  toolsEl.dataset.count = String(names.length);
  setStatus('ready', 'MCP client connected to iframe runtime');
}

if (iframeEl.contentDocument?.readyState === 'complete') {
  void bootstrap().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    setStatus('error', message);
    console.error('[runtime-contract][iframe-client]', error);
  });
} else {
  iframeEl.addEventListener(
    'load',
    () => {
      void bootstrap().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        setStatus('error', message);
        console.error('[runtime-contract][iframe-client]', error);
      });
    },
    { once: true }
  );
}
