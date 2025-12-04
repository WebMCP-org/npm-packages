import type { InputSchema } from '@mcp-b/global';
import { zodToJsonSchema } from '@mcp-b/global';
import { useEffect, useRef, useState } from 'react';
import type { z } from 'zod';
import type { PromptMessage, WebMCPPromptConfig, WebMCPPromptReturn } from './types.js';

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
 *       code: z.string().describe('The code to review'),
 *       language: z.string().optional().describe('Programming language'),
 *     },
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
export function useWebMCPPrompt<
  TArgsSchema extends Record<string, z.ZodTypeAny> = Record<string, never>,
>(config: WebMCPPromptConfig<TArgsSchema>): WebMCPPromptReturn {
  const { name, description, argsSchema, get } = config;

  const [isRegistered, setIsRegistered] = useState(false);

  const getRef = useRef(get);

  useEffect(() => {
    getRef.current = get;
  }, [get]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.navigator?.modelContext) {
      console.warn(
        `[useWebMCPPrompt] window.navigator.modelContext is not available. Prompt "${name}" will not be registered.`
      );
      return;
    }

    const argsJsonSchema = argsSchema ? zodToJsonSchema(argsSchema) : undefined;

    const promptHandler = async (
      args: Record<string, unknown>
    ): Promise<{ messages: PromptMessage[] }> => {
      return getRef.current(args as never);
    };

    const registration = window.navigator.modelContext.registerPrompt({
      name,
      ...(description !== undefined && { description }),
      ...(argsJsonSchema && { argsSchema: argsJsonSchema as InputSchema }),
      get: promptHandler,
    });

    console.log(`[useWebMCPPrompt] Registered prompt: ${name}`);
    setIsRegistered(true);

    return () => {
      if (registration) {
        registration.unregister();
        console.log(`[useWebMCPPrompt] Unregistered prompt: ${name}`);
        setIsRegistered(false);
      }
    };
  }, [name, description, argsSchema]);

  return {
    isRegistered,
  };
}
