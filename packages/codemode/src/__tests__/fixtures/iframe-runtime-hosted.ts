import { initializeIframeSandboxRuntime } from '../../browser';

const url = new URL(window.location.href);
const parentOrigin = url.searchParams.get('parentOrigin') ?? '*';
const delayMs = Number(url.searchParams.get('delayMs') ?? '0');

if (delayMs > 0) {
  window.setTimeout(() => {
    initializeIframeSandboxRuntime({ targetOrigin: parentOrigin });
  }, delayMs);
} else {
  initializeIframeSandboxRuntime({ targetOrigin: parentOrigin });
}
