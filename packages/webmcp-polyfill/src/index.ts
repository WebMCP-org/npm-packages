import type { WebMCP } from './upstream/index.js';

import { installWebMCPDeclarativeExtensions } from './declarative-forms.js';
import { installWebMCP as installUpstream } from './upstream/index.js';

export type { WebMCP } from './upstream/index.js';

/**
 * Installs upstream WebMCP and the temporary declarative tools layer.
 * Engines missing an API the vendored core calls are left untouched: upstream defines
 * the document getter before it constructs the context, so a failed construction would
 * leave `document.modelContext` throwing.
 */
export function installWebMCP(): void {
  if (typeof document === 'undefined' || !globalThis.isSecureContext) return;
  if (
    typeof Promise.withResolvers !== 'function' ||
    typeof AbortSignal.any !== 'function' ||
    typeof String.prototype.toWellFormed !== 'function' ||
    typeof URL.parse !== 'function'
  ) {
    return;
  }
  installUpstream();
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
