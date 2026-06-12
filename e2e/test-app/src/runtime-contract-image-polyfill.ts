import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import { installBrowserImageRuntimeContract } from '../../runtime-contract/image-contract.js';

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
    throw new Error('Image runtime contract hook is not available');
  }
  return hook;
}

function renderInvocations() {
  const hook = getRuntimeHook();
  const invocations = hook.readInvocations();
  invocationListEl.textContent = JSON.stringify(invocations, null, 2);
  invocationListEl.dataset.count = String(invocations.length);
}

async function renderTools() {
  const tools = await document.modelContext.getTools();
  const names = tools.map((tool) => tool.name).sort();
  toolListEl.textContent = JSON.stringify(names, null, 2);
  toolListEl.dataset.count = String(names.length);
}

async function bootstrap() {
  initializeWebMCPPolyfill();

  const modelContext = document.modelContext;
  if (!modelContext) {
    throw new Error('document.modelContext is unavailable');
  }

  await installBrowserImageRuntimeContract(modelContext, { runtimeLabel: 'image-polyfill' });
  setStatus(runtimeStatusEl, 'ready', 'Runtime ready');
  renderInvocations();

  setStatus(clientStatusEl, 'connecting', 'Discovering WebMCP tools...');
  await renderTools();
  setStatus(clientStatusEl, 'ready', 'WebMCP execution ready');
}

void bootstrap().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  setStatus(runtimeStatusEl, 'error', message);
  setStatus(clientStatusEl, 'error', message);
  console.error('[runtime-contract][image-polyfill]', error);
});
