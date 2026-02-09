import type { Server as McpServer } from '@mcp-b/webmcp-ts-sdk';
import type {
  ElicitationParams,
  ElicitationResult,
  SamplingRequestParams,
  SamplingResult,
} from './types.js';

interface TabServerCapabilities {
  createMessage?: (params: SamplingRequestParams) => Promise<SamplingResult>;
  elicitInput?: (params: ElicitationParams) => Promise<ElicitationResult>;
}

interface ServerWithCapabilities {
  server?: TabServerCapabilities;
}

function getTabServerCapabilities(server: McpServer): TabServerCapabilities | undefined {
  return (server as unknown as ServerWithCapabilities).server;
}

export function requireCreateMessageCapability(
  server: McpServer
): (params: SamplingRequestParams) => Promise<SamplingResult> {
  const createMessage = getTabServerCapabilities(server)?.createMessage;
  if (!createMessage) {
    throw new Error('Sampling is not supported: no connected client with sampling capability');
  }
  return createMessage;
}

export function requireElicitInputCapability(
  server: McpServer
): (params: ElicitationParams) => Promise<ElicitationResult> {
  const elicitInput = getTabServerCapabilities(server)?.elicitInput;
  if (!elicitInput) {
    throw new Error(
      'Elicitation is not supported: no connected client with elicitation capability'
    );
  }
  return elicitInput;
}
