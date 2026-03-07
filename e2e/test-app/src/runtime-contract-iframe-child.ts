import '@mcp-b/global';
import { installBrowserRuntimeContract } from '../../runtime-contract/browser-contract.js';

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Required DOM element not found: ${id}`);
  }
  return element as T;
}

const runtimeStatusEl = requireElement<HTMLDivElement>('iframe-runtime-status');
const toolListEl = requireElement<HTMLPreElement>('iframe-tool-list');

function setStatus(status: 'booting' | 'ready' | 'error', text: string) {
  runtimeStatusEl.textContent = text;
  runtimeStatusEl.dataset.status = status;
  runtimeStatusEl.className = status === 'ready' ? 'status ready' : 'status';
}

function renderTools() {
  const modelContext = navigator.modelContext;
  const names =
    modelContext
      ?.listTools()
      .map((tool) => tool.name)
      .sort() ?? [];
  toolListEl.textContent = JSON.stringify(names, null, 2);
  toolListEl.dataset.count = String(names.length);
}

try {
  const modelContext = navigator.modelContext;
  if (!modelContext) {
    throw new Error('navigator.modelContext is unavailable');
  }

  installBrowserRuntimeContract(modelContext, { runtimeLabel: 'iframe' });
  renderTools();
  setStatus('ready', 'Iframe runtime ready');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  setStatus('error', message);
  console.error('[runtime-contract][iframe-child]', error);
}
