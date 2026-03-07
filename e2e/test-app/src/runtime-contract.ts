import '@mcp-b/global';
import { TabClientTransport } from '@mcp-b/transports';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { installBrowserRuntimeContract } from '../../runtime-contract/browser-contract.js';

type RuntimeHook = NonNullable<Window['__WEBMCP_E2E__']>;

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Required DOM element not found: ${id}`);
  }
  return element as T;
}

const runtimeStatusEl = requireElement<HTMLDivElement>('runtime-status');
const clientStatusEl = requireElement<HTMLDivElement>('client-status');
const toolListEl = requireElement<HTMLPreElement>('tool-list');
const invocationListEl = requireElement<HTMLPreElement>('invocation-list');
const registerDynamicBtn = requireElement<HTMLButtonElement>('register-dynamic');
const unregisterDynamicBtn = requireElement<HTMLButtonElement>('unregister-dynamic');
const refreshToolsBtn = requireElement<HTMLButtonElement>('refresh-tools');
const resetInvocationsBtn = requireElement<HTMLButtonElement>('reset-invocations');

function setStatus(
  element: HTMLDivElement,
  status: 'booting' | 'ready' | 'error' | 'connecting',
  text: string
) {
  element.textContent = text;
  element.dataset.status = status;
  element.className =
    status === 'ready' ? 'status ready' : status === 'error' ? 'status error' : 'status';
}

function getRuntimeHook(): RuntimeHook {
  const hook = window.__WEBMCP_E2E__;
  if (!hook) {
    throw new Error('Runtime contract hook is not available');
  }
  return hook;
}

function renderInvocations() {
  const hook = getRuntimeHook();
  const invocations = hook.readInvocations();
  invocationListEl.textContent = JSON.stringify(invocations, null, 2);
  invocationListEl.dataset.count = String(invocations.length);
}

async function renderTools(client: Client) {
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name).sort();
  toolListEl.textContent = JSON.stringify(names, null, 2);
  toolListEl.dataset.count = String(names.length);
}

async function bootstrap() {
  const modelContext = navigator.modelContext;
  if (!modelContext) {
    throw new Error('navigator.modelContext is unavailable');
  }

  installBrowserRuntimeContract(modelContext, { runtimeLabel: 'tab' });
  setStatus(runtimeStatusEl, 'ready', 'Runtime ready');
  renderInvocations();

  const client = new Client({ name: 'runtime-contract-tab-client', version: '1.0.0' });
  const transport = new TabClientTransport({
    targetOrigin: window.location.origin,
  });
  window.mcpClient = client;

  setStatus(clientStatusEl, 'connecting', 'Connecting MCP client...');
  await client.connect(transport);
  await renderTools(client);
  setStatus(clientStatusEl, 'ready', 'MCP client connected');

  registerDynamicBtn.addEventListener('click', async () => {
    getRuntimeHook().registerDynamicTool();
    await renderTools(client);
  });

  unregisterDynamicBtn.addEventListener('click', async () => {
    getRuntimeHook().unregisterDynamicTool();
    await renderTools(client);
  });

  refreshToolsBtn.addEventListener('click', async () => {
    await renderTools(client);
    renderInvocations();
  });

  resetInvocationsBtn.addEventListener('click', () => {
    getRuntimeHook().resetInvocations();
    renderInvocations();
  });
}

void bootstrap().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  setStatus(runtimeStatusEl, 'error', message);
  setStatus(clientStatusEl, 'error', message);
  console.error('[runtime-contract][tab]', error);
});
