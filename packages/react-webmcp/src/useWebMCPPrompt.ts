import type { InputSchema, ModelContext } from '@mcp-b/global';
import { zodToJsonSchema } from '@mcp-b/global';
import { useEffect, useMemo, useRef, useState } from 'react';
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

  const isDev = (() => {
    const env = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
      ?.NODE_ENV;
    return env !== undefined ? env !== 'production' : false;
  })();

  const argsJsonSchema = useMemo(
    () => (argsSchema ? zodToJsonSchema(argsSchema) : undefined),
    [argsSchema]
  );

  useEffect(() => {
    getRef.current = get;
  }, [get]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.navigator?.modelContext) {
      if (isDev) {
        console.warn(
          `[useWebMCPPrompt] window.navigator.modelContext is not available. Prompt "${name}" will not be registered.`
        );
      }
      return;
    }
    const modelContext = window.navigator.modelContext as ModelContext;

    const promptHandler = async (
      args: Record<string, unknown>
    ): Promise<{ messages: PromptMessage[] }> => {
      return getRef.current(args as never);
    };

    let registration: { unregister: () => void } | undefined;
    try {
      registration = modelContext.registerPrompt({
        name,
        ...(description !== undefined && { description }),
        ...(argsJsonSchema && { argsSchema: argsJsonSchema as InputSchema }),
        get: promptHandler,
      });
    } catch (error) {
      setIsRegistered(false);
      throw error;
    }

    if (!registration) {
      if (isDev) {
        console.warn(`[useWebMCPPrompt] Prompt "${name}" did not return a registration handle.`);
      }
      setIsRegistered(false);
      return;
    }

    if (isDev) {
      console.log(`[useWebMCPPrompt] Registered prompt: ${name}`);
    }
    setIsRegistered(true);

    return () => {
      registration.unregister();
      if (isDev) {
        console.log(`[useWebMCPPrompt] Unregistered prompt: ${name}`);
      }
      setIsRegistered(false);
    };
  }, [name, description, argsJsonSchema, isDev]);

  return {
    isRegistered,
  };
}
