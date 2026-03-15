import type { ExecuteResult } from './types';

/**
 * Messages sent from sandbox (iframe/worker) to host.
 */

export interface ToolCallMessage {
  type: 'tool-call';
  id: number;
  name: string;
  args: Record<string, unknown>;
}

export interface ExecutionResultMessage {
  type: 'execution-result';
  result: ExecuteResult;
}

export type SandboxMessage = ToolCallMessage | ExecutionResultMessage;

/**
 * Messages sent from host to sandbox.
 */

export interface ToolResultSuccessMessage {
  type: 'tool-result';
  id: number;
  result: unknown;
}

export interface ToolResultErrorMessage {
  type: 'tool-result';
  id: number;
  error: string;
}

export type HostMessage = ToolResultSuccessMessage | ToolResultErrorMessage;

/**
 * Validates that a postMessage payload is a ToolCallMessage.
 * Boundary guard per AI Contribution Manifesto §2.2.
 */
export function isToolCallMessage(data: unknown): data is ToolCallMessage {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return obj.type === 'tool-call' && typeof obj.id === 'number' && typeof obj.name === 'string';
}

/**
 * Validates that a postMessage payload is an ExecutionResultMessage.
 * Boundary guard per AI Contribution Manifesto §2.2.
 */
export function isExecutionResultMessage(data: unknown): data is ExecutionResultMessage {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (obj.type !== 'execution-result') return false;
  if (typeof obj.result !== 'object' || obj.result === null) return false;
  return true;
}
