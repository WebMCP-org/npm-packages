/// <reference types="chrome" />

import { ExtensionClientTransport } from '../../../transports/src/index.ts';
import { Client } from '../../../webmcp-ts-sdk/src/index.ts';

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Required DOM element not found: ${id}`);
  }
  return element as T;
}

const statusEl = requireElement<HTMLDivElement>('client-status');
const toolListEl = requireElement<HTMLPreElement>('client-tools');

function setStatus(status: 'booting' | 'ready' | 'error', text: string) {
  statusEl.textContent = text;
  statusEl.dataset.status = status;
  statusEl.className =
    status === 'ready' ? 'status ready' : status === 'error' ? 'status error' : 'status';
}

async function sendControlMessage(action: string, name?: string): Promise<unknown> {
  const response = await chrome.runtime.sendMessage({
    type: 'runtime-contract/control',
    action,
    ...(name ? { name } : {}),
  });

  if (!response?.ok) {
    throw new Error(response?.error ?? `Control action failed: ${action}`);
  }

  return response.value;
}

async function bootstrap() {
  const client = new Client({ name: 'extension-runtime-contract-client', version: '1.0.0' });
  const transport = new ExtensionClientTransport({
    portName: 'mcp',
    autoReconnect: false,
  });

  window.mcpClient = client;
  window.__WEBMCP_E2E__ = {
    isReady: () => Boolean(window.__WEBMCP_E2E_READY__),
    registerDynamicTool: () => sendControlMessage('registerDynamicTool') as Promise<boolean>,
    unregisterDynamicTool: (name?: string) =>
      sendControlMessage('unregisterDynamicTool', name) as Promise<boolean>,
    readInvocations: () =>
      sendControlMessage('readInvocations') as Promise<
        Array<{ name: string; arguments: Record<string, unknown> }>
      >,
    resetInvocations: () => sendControlMessage('resetInvocations') as Promise<void>,
  };

  setStatus('booting', 'Connecting extension client...');
  window.__WEBMCP_E2E_READY__ = Boolean(await sendControlMessage('isReady'));
  await client.connect(transport);

  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name).sort();
  toolListEl.textContent = JSON.stringify(names, null, 2);
  toolListEl.dataset.count = String(names.length);
  setStatus('ready', 'Extension client connected');
}

void bootstrap().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  setStatus('error', message);
  console.error('[extension-runtime-contract][client]', error);
});

declare global {
  interface Window {
    __WEBMCP_E2E_READY__?: boolean;
    __WEBMCP_E2E__?: {
      isReady: () => boolean;
      registerDynamicTool: () => Promise<boolean>;
      unregisterDynamicTool: (name?: string) => Promise<boolean>;
      readInvocations: () => Promise<Array<{ name: string; arguments: Record<string, unknown> }>>;
      resetInvocations: () => Promise<void>;
    };
    mcpClient?: Client;
  }
}
