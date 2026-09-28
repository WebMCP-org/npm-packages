import type { WebMCP } from './upstream/index.js';

import { installWebMCPDeclarativeExtensions } from './declarative-forms.js';
import { installWebMCP as installUpstream } from './upstream/index.js';

export type { WebMCP } from './upstream/index.js';

/** Installs upstream WebMCP and the retained declarative forms support. */
export function installWebMCP(): void {
  installUpstream();
  if (typeof document === 'undefined' || !globalThis.isSecureContext) return;
  const context = document.modelContext;
  if (context) installWebMCPDeclarativeExtensions(context);
}

declare global {
  interface SubmitEvent {
    readonly agentInvoked?: boolean;
    respondWith?(agentResponse: Promise<unknown>): void;
  }

  /** Web IDL interface object used for branding and `instanceof`. */
  var ModelContext:
    | (Function & {
        readonly prototype: WebMCP.ModelContext;
        [Symbol.hasInstance](
          value: Parameters<Function[typeof Symbol.hasInstance]>[0]
        ): value is WebMCP.ModelContext;
      })
    | undefined;
}
