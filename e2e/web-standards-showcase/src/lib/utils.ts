import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ModelContextRegisterToolOptions } from '@mcp-b/webmcp-types';
import type { ModelContext, Tool, ToolRegistration } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function isAbortError(error: unknown): boolean {
  return (
    Boolean(error) &&
    typeof error === 'object' &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

/**
 * Register one showcase-owned tool and retain the standard AbortSignal cleanup
 * capability locally. WebMCP does not expose arbitrary by-name unregistration.
 */
export function registerShowcaseTool(
  context: ModelContext,
  tool: Tool,
  options?: ModelContextRegisterToolOptions
): ToolRegistration {
  const abortController = new AbortController();
  const upstreamSignal = options?.signal;

  if (upstreamSignal?.aborted) {
    abortController.abort(upstreamSignal.reason);
  } else {
    upstreamSignal?.addEventListener(
      'abort',
      () => {
        abortController.abort(upstreamSignal.reason);
      },
      { once: true }
    );
  }

  const registerTool = context.registerTool.bind(context) as unknown as (
    descriptor: Tool,
    registrationOptions?: ModelContextRegisterToolOptions
  ) => Promise<void>;
  void Promise.resolve(
    registerTool(tool, {
      ...options,
      signal: abortController.signal,
    })
  ).catch((error: unknown) => {
    if (!isAbortError(error)) {
      console.warn(`[WebMCP Showcase] registerTool("${tool.name}") rejected:`, error);
    }
  });

  return {
    unregister() {
      abortController.abort();
    },
  };
}
