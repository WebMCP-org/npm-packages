export type ModelContextSurface = Document['modelContext'];

export function getModelContext(): ModelContextSurface | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.document?.modelContext ?? window.navigator?.modelContext;
}
