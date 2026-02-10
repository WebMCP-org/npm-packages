import type { ContentBlock, InputSchema } from './common.js';

// ============================================================================
// Prompt Types (MCP spec shapes, defined inline)
// ============================================================================

/**
 * An argument for a prompt template.
 */
export interface PromptArgument {
  /**
   * Argument key.
   */
  name: string;

  /**
   * Optional human-readable description.
   */
  description?: string;

  /**
   * Indicates whether the argument is required.
   */
  required?: boolean;
}

/**
 * A message within a prompt.
 */
export interface PromptMessage {
  /**
   * Author role for this message.
   */
  role: 'user' | 'assistant';

  /**
   * Message content payload.
   */
  content: ContentBlock;
}

/**
 * Represents a reusable prompt template.
 *
 * @template TName - Prompt name literal type.
 *
 * @see {@link https://spec.modelcontextprotocol.io/specification/server/prompts/}
 */
export interface Prompt<TName extends string = string> {
  /**
   * Unique prompt identifier.
   */
  name: TName;

  /**
   * Optional display title.
   */
  title?: string;

  /**
   * Optional human-readable summary.
   */
  description?: string;

  /**
   * Optional argument metadata.
   */
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
 * @template TArgs - Prompt argument shape.
 * @template TName - Prompt name literal type.
 *
 * @see {@link https://spec.modelcontextprotocol.io/specification/server/prompts/}
 */
export interface PromptDescriptor<
  TArgs extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
> {
  /**
   * Unique prompt identifier.
   */
  name: TName;

  /**
   * Optional human-readable summary.
   */
  description?: string;

  /**
   * Optional JSON Schema describing accepted prompt arguments.
   */
  argsSchema?: InputSchema;

  /**
   * Prompt renderer that returns prompt messages for the provided arguments.
   */
  get: (args: TArgs) => Promise<{ messages: PromptMessage[] }>;
}
