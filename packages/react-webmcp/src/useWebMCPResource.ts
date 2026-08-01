import { useCallback } from 'react';
import { getBrowserMcpServer } from './model-context.js';
import type { WebMCPResourceConfig, WebMCPResourceReturn } from './types.js';
import { useCommittedRef } from './useCommittedRef.js';
import { useMcpRegistration } from './useMcpRegistration.js';

/**
 * React hook for registering Model Context Protocol (MCP) resources.
 *
 * This hook handles the complete lifecycle of an MCP resource:
 * - Registers the resource with `window.document.modelContext`
 * - Supports both static URIs and URI templates with parameters
 * - Automatically unregisters on component unmount
 *
 * @param config - Configuration object for the resource
 * @returns Object indicating registration status
 *
 * @public
 *
 * @example
 * Static resource:
 * ```tsx
 * function AppSettingsResource() {
 *   const { isRegistered } = useWebMCPResource({
 *     uri: 'config://app-settings',
 *     name: 'App Settings',
 *     description: 'Application configuration',
 *     mimeType: 'application/json',
 *     read: async (uri) => ({
 *       contents: [{
 *         uri: uri.href,
 *         text: JSON.stringify({ theme: 'dark', language: 'en' })
 *       }]
 *     }),
 *   });
 *
 *   return <div>Settings resource {isRegistered ? 'ready' : 'loading'}</div>;
 * }
 * ```
 *
 * @example
 * Dynamic resource with URI template:
 * ```tsx
 * function UserProfileResource() {
 *   const { isRegistered } = useWebMCPResource({
 *     uri: 'user://{userId}/profile',
 *     name: 'User Profile',
 *     description: 'User profile data by ID',
 *     mimeType: 'application/json',
 *     read: async (uri, params) => {
 *       const userId = typeof params?.userId === 'string' ? params.userId : '';
 *       const profile = await fetchUserProfile(userId);
 *       return {
 *         contents: [{
 *           uri: uri.href,
 *           text: JSON.stringify(profile)
 *         }]
 *       };
 *     },
 *   });
 *
 *   return <div>User profile resource {isRegistered ? 'ready' : 'loading'}</div>;
 * }
 * ```
 */
export function useWebMCPResource(config: WebMCPResourceConfig): WebMCPResourceReturn {
  const { uri, name, description, mimeType, read } = config;

  const readRef = useCommittedRef(read);

  const register = useCallback(() => {
    const modelContext = getBrowserMcpServer();
    if (!modelContext) {
      console.warn(
        `[ReactWebMCP] window.document.modelContext is not available. Resource "${uri}" will not be registered.`
      );
      return;
    }

    return modelContext.registerResource({
      uri,
      name,
      ...(description !== undefined && { description }),
      ...(mimeType !== undefined && { mimeType }),
      read: (resolvedUri, params) => readRef.current(resolvedUri, params),
    });
  }, [uri, name, description, mimeType, readRef]);

  return { isRegistered: useMcpRegistration(register) };
}
