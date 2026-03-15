import type { ExecuteResult } from './types';
import type { UnknownRecord } from './type-utils';
import { isRecord } from './type-utils';

/**
 * Messages sent from sandbox (iframe/worker) to host.
 */

export interface ToolCallMessage {
  type: 'tool-call';
  id: number;
  name: string;
  args: UnknownRecord;
}

export interface ExecutionResultMessage {
  type: 'execution-result';
  result: ExecuteResult;
}

export interface SandboxReadyMessage {
  type: 'sandbox-ready';
}

export type SandboxMessage = ToolCallMessage | ExecutionResultMessage | SandboxReadyMessage;

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

export interface ExecuteRequestMessage {
  type: 'execute-request';
  code: string;
}

export type HostMessage = ToolResultSuccessMessage | ToolResultErrorMessage | ExecuteRequestMessage;

export function isSandboxReadyMessage(data: unknown): data is SandboxReadyMessage {
  if (!isRecord(data)) return false;
  const obj = data;
  return obj.type === 'sandbox-ready';
}

export function isToolResultMessage(
  data: unknown
): data is ToolResultSuccessMessage | ToolResultErrorMessage {
  if (!isRecord(data)) return false;
  const obj = data;
  return obj.type === 'tool-result' && typeof obj.id === 'number';
}

export function isExecuteRequestMessage(data: unknown): data is ExecuteRequestMessage {
  if (!isRecord(data)) return false;
  const obj = data;
  return obj.type === 'execute-request' && typeof obj.code === 'string';
}

/**
 * Validates that a postMessage payload is a ToolCallMessage.
 * Boundary guard per AI Contribution Manifesto §2.2.
 */
export function isToolCallMessage(data: unknown): data is ToolCallMessage {
  if (!isRecord(data)) return false;
  const obj = data;
  return obj.type === 'tool-call' && typeof obj.id === 'number' && typeof obj.name === 'string';
}

/**
 * Validates that a postMessage payload is an ExecutionResultMessage.
 * Boundary guard per AI Contribution Manifesto §2.2.
 */
export function isExecutionResultMessage(data: unknown): data is ExecutionResultMessage {
  if (!isRecord(data)) return false;
  const obj = data;
  if (obj.type !== 'execution-result') return false;
  if (typeof obj.result !== 'object' || obj.result === null) return false;
  return true;
}
