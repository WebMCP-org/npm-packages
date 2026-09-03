import { normalizeInputSchema } from '@mcp-b/webmcp-polyfill/schema';
import { useCallback } from 'react';
import type { WebMCPPromptConfig, WebMCPPromptReturn } from './types.js';
import { getBrowserMcpServer } from './model-context.js';
import { useCommittedRef } from './useCommittedRef.js';
import { useMcpRegistration } from './useMcpRegistration.js';

/**
 * React hook for registering Model Context Protocol (MCP) prompts.
 *
 * This hook handles the complete lifecycle of an MCP prompt:
 * - Registers the prompt with the installed MCP-B `BrowserMcpServer`
 * - Automatically unregisters on component unmount
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
export function useWebMCPPrompt(config: WebMCPPromptConfig): WebMCPPromptReturn {
  const { name, description } = config;

  const configRef = useCommittedRef(config);

  const register = useCallback(() => {
    const modelContext = getBrowserMcpServer();
    if (!modelContext) {
      console.warn(
        `[ReactWebMCP] BrowserMcpServer is not available. Prompt "${name}" will not be registered.`
      );
      return;
    }

    // ponytail: read at registration time so an inline `argsSchema` literal cannot re-register
    // every render. Ceiling: a changed schema is picked up only on re-registration;
    // add a caller-supplied deps list, as `useWebMCP` has, if that is ever needed.
    const { argsSchema } = configRef.current;
    const resolvedArgsSchema = argsSchema
      ? normalizeInputSchema(argsSchema).inputSchema
      : undefined;

    return modelContext.registerPrompt({
      name,
      ...(description !== undefined && { description }),
      ...(resolvedArgsSchema && { argsSchema: resolvedArgsSchema }),
      get: async (args) => configRef.current.get(args),
    });
  }, [name, description, configRef]);

  return { isRegistered: useMcpRegistration(register, config.enabled) };
}
