import { installWebMCP as installUpstreamWebMCP } from './upstream/index.js';

/** Installs the upstream WebMCP polyfill on `document.modelContext`. */
export function installWebMCP(): void {
  installUpstreamWebMCP();
}

/** @deprecated Use `installWebMCP()`. */
export const initializeWebMCPPolyfill = installWebMCP;

export type { WebMCP } from './upstream/index.js';
