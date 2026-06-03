import type { ModelContext } from '@mcp-b/webmcp-types';

export type ModelContextSurface = ModelContext;
type ModelContextHost = { modelContext?: ModelContext };

export function getModelContext(): ModelContextSurface | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const documentContext = (window.document as Document & ModelContextHost).modelContext;
  const navigatorContext = (window.navigator as Navigator & ModelContextHost).modelContext;
  return documentContext ?? navigatorContext;
}
