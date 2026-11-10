import type { WebMCP } from '@w3c/webmcp-polyfill';

import { installWebMCP as installUpstream } from '@w3c/webmcp-polyfill';
import { installWebMCPDeclarativeExtensions } from './declarative-forms.js';

export type { WebMCP } from '@w3c/webmcp-polyfill';

/**
 * Installs upstream WebMCP and the temporary declarative tools layer.
 * Engines missing an API the upstream core calls are left untouched: upstream defines
 * the document getter before it constructs the context, so a failed construction would
 * leave `document.modelContext` throwing.
 *
 * @deprecated Use `installWebMCP` from `@w3c/webmcp-polyfill`. This wrapper only adds
 * declarative tools until upstream ships them.
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
