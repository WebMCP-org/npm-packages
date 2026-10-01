import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { WebMCP } from 'webmcp-types';
import type { ModelContext, Tool, ToolRegistration } from '../types';

type ModelContextRegisterToolOptions = WebMCP.ModelContextRegisterToolOptions;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function isAbortError(cause: unknown): cause is Error {
  return cause instanceof Error && cause.name === 'AbortError';
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

  void context
    .registerTool(tool, {
      ...options,
      signal: abortController.signal,
    })
    .catch((cause: unknown) => {
      if (!isAbortError(cause)) {
        console.warn(`[WebMCP Showcase] registerTool("${tool.name}") rejected:`, cause);
      }
    });

  return {
    unregister() {
      abortController.abort();
    },
  };
}
