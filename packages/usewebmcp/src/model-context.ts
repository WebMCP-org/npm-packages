import type { ModelContext } from '@mcp-b/webmcp-types';

export type ModelContextSurface = ModelContext;

export function getModelContext(): ModelContextSurface | undefined {
  if (typeof document === 'undefined' || typeof navigator === 'undefined') {
    return undefined;
  }

  return document.modelContext ?? navigator.modelContext;
}
