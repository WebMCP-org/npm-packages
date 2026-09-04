'use client';

/**
 * React hooks for exposing WebMCP tools, prompts, and resources, plus an MCP client provider.
 * @packageDocumentation
 */

export type {
  InferOutput,
  InferToolInput,
  ToolExecutionState,
  WebMCPConfig,
  WebMCPReturn,
} from 'usewebmcp';
export { useWebMCP } from 'usewebmcp';

export type { ToolInputSchema } from '@mcp-b/webmcp-polyfill/schema';
export type { McpClientProviderProps } from './client/McpClientProvider.js';
export { McpClientProvider, useMcpClient } from './client/McpClientProvider.js';
export type {
  CallToolResult,
  ModelContextProtocol,
  PromptDescriptor,
  PromptMessage,
  ResourceContents,
  ResourceDescriptor,
  ToolAnnotations,
  ToolDescriptor,
  WebMCPPromptConfig,
  WebMCPPromptReturn,
  WebMCPResourceConfig,
  WebMCPResourceReturn,
} from './types.js';
export { useWebMCPContext } from './useWebMCPContext.js';
export { useWebMCPPrompt } from './useWebMCPPrompt.js';
export { useWebMCPResource } from './useWebMCPResource.js';

// Consent layer — types, annotation mapping, broker, hook, and provider
export type {
  ConsentDecision,
  ConsentMetadata,
  PendingConsentRequest,
  RiskLevel,
} from './consent-types.js';
export type { McpToolAnnotations } from './consent-annotations.js';
export { toMcpAnnotations } from './consent-annotations.js';
export type { ConsentDecisionEvent } from './consent-broker.js';
export { ConsentBroker, MAX_PRESENCE_ATTEMPTS } from './consent-broker.js';
export type { GuardedToolDef } from './useGuardedWebMCP.js';
export { useGuardedWebMCP } from './useGuardedWebMCP.js';
export {
  ConsentBrokerProvider,
  useConsentBroker,
  usePendingConsentRequests,
} from './ConsentBrokerProvider.js';
export {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  verifyUserPresence,
} from './consent-presence.js';

declare module 'react' {
  interface FormHTMLAttributes<T> {
    toolname?: string;
    tooltitle?: string;
    tooldescription?: string;
    toolautosubmit?: '' | 'toolautosubmit';
  }

  interface FieldsetHTMLAttributes<T> {
    toolparamdescription?: string;
  }

  interface InputHTMLAttributes<T> {
    toolparamdescription?: string;
  }

  interface SelectHTMLAttributes<T> {
    toolparamdescription?: string;
  }

  interface TextareaHTMLAttributes<T> {
    toolparamdescription?: string;
  }
}
