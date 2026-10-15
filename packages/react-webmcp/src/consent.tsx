'use client';

import {
  ConsentGuard,
  consent,
  toMcpAnnotations,
  type ConsentMetadata,
  type PendingConsentRequest,
} from '@mcp-b/webmcp-plugins/consent';
import type { InputSchema, JsonSchemaForInference } from '@mcp-b/webmcp-ts-sdk';
import type { ToolInputSchema } from '@mcp-b/webmcp-ts-sdk/schema';
import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type DependencyList,
  type ReactNode,
} from 'react';
import type { WebMCPConfig, WebMCPReturn } from './types.js';
import { useWebMCP } from './useWebMCP.js';

const GuardContext = createContext<ConsentGuard | null>(null);

/** Share one {@link ConsentGuard} with the guarded tools and approval UI below it. */
export function ConsentProvider({
  guard,
  children,
}: {
  guard?: ConsentGuard;
  children: ReactNode;
}) {
  const [fallback] = useState(() => guard ?? new ConsentGuard());
  return <GuardContext.Provider value={guard ?? fallback}>{children}</GuardContext.Provider>;
}

/** The nearest {@link ConsentGuard}. Call `decide()` on it from approval UI. */
export function useConsentGuard(): ConsentGuard {
  const guard = useContext(GuardContext);
  if (!guard) throw new Error('useConsentGuard must be used within ConsentProvider');
  return guard;
}

/** Requests awaiting a decision; re-renders only when the queue changes. */
export function usePendingConsentRequests(): readonly PendingConsentRequest[] {
  const guard = useConsentGuard();
  return useSyncExternalStore(guard.subscribe, guard.getPending, guard.getPending);
}

/**
 * {@link useWebMCP} with the consent plugin first and MCP annotations derived from
 * `consent`. Explicit `annotations` take precedence. Must render inside {@link ConsentProvider}.
 */
export function useGuardedWebMCP<
  const TInput extends ToolInputSchema = InputSchema,
  const TOutput extends JsonSchemaForInference | undefined = undefined,
>(
  config: WebMCPConfig<TInput, TOutput> & { consent: ConsentMetadata },
  deps?: DependencyList
): WebMCPReturn<TOutput, TInput> {
  const guard = useConsentGuard();
  const { consent: metadata, ...tool } = config;
  return useWebMCP(
    {
      ...tool,
      annotations: { ...toMcpAnnotations(metadata), ...tool.annotations },
      plugins: [consent(guard, metadata), ...(tool.plugins ?? [])],
    },
    deps
  );
}
