import type { WebMCP } from './upstream/index.js';

export { installWebMCP } from './upstream/index.js';

/** @deprecated Use `installWebMCP()`. */
export { installWebMCP as initializeWebMCPPolyfill } from './upstream/index.js';

export type { WebMCP } from './upstream/index.js';

declare global {
  /** Web IDL interface object used for branding and `instanceof`. */
  var ModelContext:
    | (Function & {
        readonly prototype: WebMCP.ModelContext;
        [Symbol.hasInstance](value: unknown): value is WebMCP.ModelContext;
      })
    | undefined;
}
