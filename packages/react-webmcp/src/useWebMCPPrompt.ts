import type { InputSchema } from '@mcp-b/webmcp-types';
import { useEffect, useRef, useState } from 'react';
import type {
  PromptMessage,
  ReactWebMCPInputSchema,
  WebMCPPromptConfig,
  WebMCPPromptReturn,
} from './types.js';
import { isZodSchema, zodToJsonSchema } from './zod-utils.js';

type PromptModelContext = Navigator['modelContext'] & {
  registerPrompt: (descriptor: {
    name: string;
    description?: string;
    argsSchema?: InputSchema;
    get: (args: Record<string, unknown>) => Promise<{ messages: PromptMessage[] }>;
  }) => { unregister: () => void } | undefined;
};

/**
 * React hook for registering Model Context Protocol (MCP) prompts.
 *
 * This hook handles the complete lifecycle of an MCP prompt:
 * - Registers the prompt with `window.navigator.modelContext`
 * - Converts Zod schemas to JSON Schema for argument validation
 * - Automatically unregisters on component unmount
 *
 * @template TArgsSchema - Zod schema object defining argument types
 *
 * @param config - Configuration object for the prompt
 * @returns Object indicating registration status
 *
 * @public
 *
 * @example
 * Simple prompt without arguments:
 * ```tsx
 * function HelpPrompt() {
 *   const { isRegistered } = useWebMCPPrompt({
 *     name: 'help',
 *     description: 'Get help with using the application',
 *     get: async () => ({
 *       messages: [{
 *         role: 'user',
 *         content: { type: 'text', text: 'How do I use this application?' }
 *       }]
 *     }),
 *   });
 *
 *   return <div>Help prompt {isRegistered ? 'ready' : 'loading'}</div>;
 * }
 * ```
 *
 * @example
 * Prompt with typed arguments:
 * ```tsx
 * function CodeReviewPrompt() {
 *   const { isRegistered } = useWebMCPPrompt({
 *     name: 'review_code',
 *     description: 'Review code for best practices',
 *     argsSchema: {
 *       type: 'object',
 *       properties: {
 *         code: { type: 'string', description: 'The code to review' },
 *         language: { type: 'string', description: 'Programming language' },
 *       },
 *       required: ['code'],
 *     } as const,
 *     get: async ({ code, language }) => ({
 *       messages: [{
 *         role: 'user',
 *         content: {
 *           type: 'text',
 *           text: `Please review this ${language ?? ''} code:\n\n${code}`
 *         }
 *       }]
 *     }),
 *   });
 *
 *   return <div>Code review prompt {isRegistered ? 'ready' : 'loading'}</div>;
 * }
 * ```
 */
export function useWebMCPPrompt<TArgsSchema extends ReactWebMCPInputSchema = InputSchema>(
  config: WebMCPPromptConfig<TArgsSchema>
): WebMCPPromptReturn {
  const { name, description, argsSchema, get } = config;

  const [isRegistered, setIsRegistered] = useState(false);

  const getRef = useRef(get);

  useEffect(() => {
    getRef.current = get;
  }, [get]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.navigator?.modelContext) {
      console.warn(
        `[ReactWebMCP] window.navigator.modelContext is not available. Prompt "${name}" will not be registered.`
      );
      return;
    }
    const modelContext = window.navigator.modelContext as PromptModelContext;

    const promptHandler = async (
      args: Record<string, unknown>
    ): Promise<{ messages: PromptMessage[] }> => {
      return getRef.current(args as never);
    };

    const resolvedArgsSchema = argsSchema
      ? isZodSchema(argsSchema)
        ? zodToJsonSchema(argsSchema)
        : (argsSchema as InputSchema)
      : undefined;

    let registration: { unregister: () => void } | undefined;
    try {
      registration = modelContext.registerPrompt({
        name,
        ...(description !== undefined && { description }),
        ...(resolvedArgsSchema && { argsSchema: resolvedArgsSchema }),
        get: promptHandler,
      });
    } catch (error) {
      setIsRegistered(false);
      throw error;
    }

    if (!registration) {
      console.warn(`[ReactWebMCP] Prompt "${name}" did not return a registration handle.`);
      setIsRegistered(false);
      return;
    }

    setIsRegistered(true);

    return () => {
      registration.unregister();
      setIsRegistered(false);
    };
  }, [name, description, argsSchema]);

  return {
    isRegistered,
  };
}
