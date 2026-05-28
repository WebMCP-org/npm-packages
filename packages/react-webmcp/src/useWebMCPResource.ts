import { useEffect, useRef, useState } from 'react';
import { getModelContext, type ModelContextSurface } from './model-context.js';
import type { ResourceContents, WebMCPResourceConfig, WebMCPResourceReturn } from './types.js';

type ResourceModelContext = ModelContextSurface & {
  registerResource: (descriptor: {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
    read: (uri: URL, params?: Record<string, string>) => Promise<{ contents: ResourceContents[] }>;
  }) => { unregister: () => void } | undefined;
};

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

  const [isRegistered, setIsRegistered] = useState(false);

  const readRef = useRef(read);

  useEffect(() => {
    readRef.current = read;
  }, [read]);

  useEffect(() => {
    const modelContext = getModelContext() as ResourceModelContext | undefined;
    if (!modelContext) {
      console.warn(
        `[ReactWebMCP] window.document.modelContext is not available. Resource "${uri}" will not be registered.`
      );
      return;
    }

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
      console.warn(`[ReactWebMCP] Resource "${uri}" did not return a registration handle.`);
      setIsRegistered(false);
      return;
    }

    setIsRegistered(true);

    return () => {
      registration.unregister();
      setIsRegistered(false);
    };
  }, [uri, name, description, mimeType]);

  return {
    isRegistered,
  };
}
