import type { WebMCP } from './upstream/index.js';

export { installWebMCP } from './upstream/index.js';

export type { WebMCP } from './upstream/index.js';

declare global {
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
