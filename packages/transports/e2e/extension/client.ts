/// <reference types="chrome" />

import { ExtensionClientTransport } from '@mcp-b/transports';
import { Client } from '@modelcontextprotocol/client';

import type { RuntimeInvocationRecord } from '../../../../e2e/runtime-contract/core.js';

interface ControlRequest {
  type: 'runtime-contract/control';
  action: string;
  name?: string;
}

type ControlResponse = { ok: true; value: unknown } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isControlResponse(value: unknown): value is ControlResponse {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false;
  return value.ok ? 'value' in value : typeof value.error === 'string';
}

function requireBoolean(value: unknown, action: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`Control action '${action}' returned a non-boolean value`);
  }
  return value;
}

function isRuntimeInvocationRecord(value: unknown): value is RuntimeInvocationRecord {
  return isRecord(value) && typeof value.name === 'string' && isRecord(value.arguments);
}

function requireInvocations(value: unknown): RuntimeInvocationRecord[] {
  if (!Array.isArray(value) || !value.every(isRuntimeInvocationRecord)) {
    throw new TypeError("Control action 'readInvocations' returned an invalid value");
  }
  return value;
}

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Required DOM element not found: ${selector}`);
  }
  return element;
}

const statusEl = requireElement<HTMLDivElement>('#client-status');
const toolListEl = requireElement<HTMLPreElement>('#client-tools');

function setStatus(status: 'booting' | 'ready' | 'error', text: string) {
  statusEl.textContent = text;
  statusEl.dataset.status = status;
  statusEl.className =
    status === 'ready' ? 'status ready' : status === 'error' ? 'status error' : 'status';
}

async function sendControlMessage(action: string, name?: string): Promise<unknown> {
  const request: ControlRequest = {
    type: 'runtime-contract/control',
    action,
    ...(name ? { name } : {}),
  };
  const response: unknown = await chrome.runtime.sendMessage<ControlRequest, unknown>(request);

  if (!isControlResponse(response)) {
    throw new TypeError(`Control action '${action}' returned an invalid response`);
  }
  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.value;
}

async function sendBooleanControlMessage(action: string, name?: string): Promise<boolean> {
  return requireBoolean(await sendControlMessage(action, name), action);
}

async function bootstrap() {
  const client = new Client(
    { name: 'extension-runtime-contract-client', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } }
  );
  const transport = new ExtensionClientTransport({
    portName: 'mcp',
    autoReconnect: false,
  });

  window.mcpClient = client;
  window.__WEBMCP_E2E__ = {
    isReady: () => Boolean(window.__WEBMCP_E2E_READY__),
    registerDynamicTool: () => sendBooleanControlMessage('registerDynamicTool'),
    unregisterDynamicTool: (name?: string) =>
      sendBooleanControlMessage('unregisterDynamicTool', name),
    readInvocations: async () => requireInvocations(await sendControlMessage('readInvocations')),
    resetInvocations: async () => {
      await sendControlMessage('resetInvocations');
    },
  };

  setStatus('booting', 'Connecting extension client...');
  window.__WEBMCP_E2E_READY__ = await sendBooleanControlMessage('isReady');
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
    mcpClient?: Client;
  }
}
