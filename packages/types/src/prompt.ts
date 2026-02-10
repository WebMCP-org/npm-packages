import type { ContentBlock, InputSchema } from './common.js';

// ============================================================================
// Prompt Types (MCP spec shapes, defined inline)
// ============================================================================

/**
 * An argument for a prompt template.
 */
export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

/**
 * A message within a prompt.
 */
export interface PromptMessage {
  role: 'user' | 'assistant';
  content: ContentBlock;
}

/**
 * Represents a reusable prompt template.
 *
 * @see {@link https://spec.modelcontextprotocol.io/specification/server/prompts/}
 */
export interface Prompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: PromptArgument[];
}

// ============================================================================
// Prompt Descriptor
// ============================================================================

/**
 * Prompt descriptor for the Web Model Context API.
 *
 * Defines a reusable prompt template for AI interactions.
 *
 * @see {@link https://spec.modelcontextprotocol.io/specification/server/prompts/}
 */
export interface PromptDescriptor {
  name: string;
  description?: string;
  argsSchema?: InputSchema;
  get: (args: Record<string, unknown>) => Promise<{ messages: PromptMessage[] }>;
}
