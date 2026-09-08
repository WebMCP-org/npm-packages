'use client';

import {
  INITIAL_EXECUTION_STATE,
  type ExecutionState,
  type ToolExecutionState,
} from '@mcp-b/webmcp-plugins/execution-state';
import { useSyncExternalStore } from 'react';

const getServerSnapshot = () => INITIAL_EXECUTION_STATE;

/** Subscribe only the component that needs execution status. Create the observer once per owner. */
export function useToolExecutionState<T>(execution: ExecutionState<T>): ToolExecutionState<T> {
  return useSyncExternalStore(execution.subscribe, execution.getSnapshot, getServerSnapshot);
}
