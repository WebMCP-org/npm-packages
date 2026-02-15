import type { ModelContext } from '@mcp-b/global';
import { createLogger } from '@mcp-b/global';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ResourceContents, WebMCPResourceConfig, WebMCPResourceReturn } from './types.js';

/**
 * React hook for registering Model Context Protocol (MCP) resources.
 *
 * This hook handles the complete lifecycle of an MCP resource:
 * - Registers the resource with `window.navigator.modelContext`
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
 *       const userId = params?.userId ?? '';
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
  const logger = useMemo(() => createLogger('ReactWebMCP:useWebMCPResource'), []);

  const [isRegistered, setIsRegistered] = useState(false);

  const readRef = useRef(read);

  useEffect(() => {
    readRef.current = read;
  }, [read]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.navigator?.modelContext) {
      logger.warn(
        `window.navigator.modelContext is not available. Resource "${uri}" will not be registered.`
      );
      return;
    }
    const modelContext = window.navigator.modelContext as ModelContext;

    const resourceHandler = async (
      resolvedUri: URL,
      params?: Record<string, string>
    ): Promise<{ contents: ResourceContents[] }> => {
      return readRef.current(resolvedUri, params);
    };

    let registration: { unregister: () => void } | undefined;
    try {
      registration = modelContext.registerResource({
        uri,
        name,
        ...(description !== undefined && { description }),
        ...(mimeType !== undefined && { mimeType }),
        read: resourceHandler,
      });
    } catch (error) {
      setIsRegistered(false);
      throw error;
    }

    if (!registration) {
      logger.warn(`Resource "${uri}" did not return a registration handle.`);
      setIsRegistered(false);
      return;
    }

    logger.info(`Registered resource: ${uri}`);
    setIsRegistered(true);

    return () => {
      registration.unregister();
      logger.info(`Unregistered resource: ${uri}`);
      setIsRegistered(false);
    };
  }, [uri, name, description, mimeType, logger]);

  return {
    isRegistered,
  };
}
