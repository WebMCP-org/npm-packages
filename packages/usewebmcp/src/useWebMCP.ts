'use client';

import { createExecutionState } from '@mcp-b/webmcp-polyfill/execution-state';
import { useState, type DependencyList } from 'react';
import type { ToolInputSchema, WebMCPConfig, WebMCPReturn } from './types.js';
import { useToolExecutionState } from './useToolExecutionState.js';
import { useWebMCPTool } from './useWebMCPTool.js';

/** Register a tool and observe its executions in the same component. */
export function useWebMCP<const TInputSchema extends ToolInputSchema = object, TResult = unknown>(
  config: WebMCPConfig<TInputSchema, TResult>,
  deps?: DependencyList
): WebMCPReturn<TInputSchema, TResult> {
  const [execution] = useState(() => createExecutionState<TResult>());
  const tool = useWebMCPTool(
    {
      ...config,
      middleware: [execution.aroundInvoke, ...(config.middleware ?? [])],
    },
    deps
  );
  const state = useToolExecutionState(execution);
  return { ...tool, state, reset: execution.reset };
}
