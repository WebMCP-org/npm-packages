import type { UIResourceRenderer } from '@mcp-ui/client';
import type { ComponentProps } from 'react';
import {
  createContext,
  createRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

/**
 * Type representing a UI embedded resource from MCP-UI
 */
export type UIEmbeddedResource = ComponentProps<typeof UIResourceRenderer>['resource'];

/**
 * Individual UI resource item managed by the context
 */
export type UIResourceItem = {
  /** Unique identifier for this resource instance */
  id: string;
  /** Name of the tool that generated this resource */
  toolName: string;
  /** The actual UI resource data */
  resource: UIEmbeddedResource;
  /** Timestamp when the resource was created */
  timestamp: Date;
  /** Optional tool call ID for tracing */
  toolCallId?: string;
  /** Ref to the iframe element (for WebMCP integration) */
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
  /** Optional cleanup function to call when resource is removed */
  cleanup?: () => Promise<void>;
};

/**
 * Context value interface for UI resources management
 */
export interface UIResourceContextValue {
  /** List of all UI resources */
  resources: UIResourceItem[];
  /** Currently selected resource ID */
  selectedResourceId: string | null;
  /** Add a new UI resource */
  addResource: (item: Omit<UIResourceItem, 'id' | 'timestamp' | 'iframeRef' | 'cleanup'>) => void;
  /** Remove a UI resource by ID (async to support cleanup) */
  removeResource: (id: string) => Promise<void>;
  /** Select a UI resource by ID */
  selectResource: (id: string | null) => void;
  /** Clear all UI resources */
  clearAll: () => Promise<void>;
  /** Set cleanup function for a resource (avoids state mutation) */
  setResourceCleanup: (id: string, cleanup: () => Promise<void>) => void;
}

/**
 * Context for managing UI resources across the application
 */
export const UIResourceContext = createContext<UIResourceContextValue | null>(null);

/**
 * Hook to access the UI resources context
 * @throws {Error} If used outside of UIResourceProvider
 */
export const useUIResources = (): UIResourceContextValue => {
  const context = useContext(UIResourceContext);
  if (!context) {
    throw new Error('useUIResources must be used within UIResourceProvider');
  }
  return context;
};

/**
 * Props for UIResourceProvider component
 */
export interface UIResourceProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component for UI resources context
 * Manages the lifecycle and state of UI resources throughout the application
 */
export const UIResourceProvider: React.FC<UIResourceProviderProps> = ({ children }) => {
  const [resources, setResources] = useState<UIResourceItem[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);

  const addResource = useCallback(
    (item: Omit<UIResourceItem, 'id' | 'timestamp' | 'iframeRef'>) => {
      // Check if a resource with the same URI already exists
      setResources((prev) => {
        const existingResource = prev.find((r) => r.resource.uri === item.resource.uri);

        if (existingResource) {
          // Resource with same URI exists, just select it instead of creating duplicate
          setSelectedResourceId(existingResource.id);
          return prev; // No state change needed
        }

        // Create new resource since no duplicate found
        const newResource: UIResourceItem = {
          ...item,
          id: `${item.toolName}-${Date.now()}-${Math.random()}`,
          timestamp: new Date(),
          iframeRef: createRef<HTMLIFrameElement>(),
        };
        setSelectedResourceId(newResource.id);
        return [...prev, newResource];
      });
    },
    []
  );

  const removeResource = useCallback(
    async (id: string) => {
      // Extract resource from state to avoid stale closure
      let resourceToCleanup: UIResourceItem | undefined;
      setResources((prev) => {
        resourceToCleanup = prev.find((r) => r.id === id);
        return prev; // Don't modify yet, just capture the resource
      });

      // Call cleanup if it exists
      if (resourceToCleanup?.cleanup) {
        try {
          await resourceToCleanup.cleanup();
        } catch (error) {
          console.error(`Failed to cleanup resource ${id}:`, error);
        }
      }

      // Now remove the resource
      setResources((prev) => {
        const filtered = prev.filter((r) => r.id !== id);
        // If we're removing the selected resource, select another one
        if (selectedResourceId === id) {
          setSelectedResourceId(filtered.length > 0 ? filtered[filtered.length - 1].id : null);
        }
        return filtered;
      });
    },
    [selectedResourceId]
  );

  const selectResource = useCallback((id: string | null) => {
    setSelectedResourceId(id);
  }, []);

  const setResourceCleanup = useCallback((id: string, cleanup: () => Promise<void>) => {
    setResources((prev) => prev.map((r) => (r.id === id ? { ...r, cleanup } : r)));
  }, []);

  const clearAll = useCallback(async () => {
    // Extract resources from state to avoid stale closure
    let resourcesToCleanup: UIResourceItem[] = [];
    setResources((prev) => {
      resourcesToCleanup = prev;
      return prev; // Don't modify yet, just capture the resources
    });

    // Call cleanup on all resources
    await Promise.all(
      resourcesToCleanup.map(async (resource) => {
        if (resource.cleanup) {
          try {
            await resource.cleanup();
          } catch (error) {
            console.error(`Failed to cleanup resource ${resource.id}:`, error);
          }
        }
      })
    );

    setResources([]);
    setSelectedResourceId(null);
  }, []);

  const value = useMemo(
    () => ({
      resources,
      selectedResourceId,
      addResource,
      removeResource,
      selectResource,
      clearAll,
      setResourceCleanup,
    }),
    [
      resources,
      selectedResourceId,
      addResource,
      removeResource,
      selectResource,
      clearAll,
      setResourceCleanup,
    ]
  );

  // Cleanup all resources on unmount
  useEffect(() => {
    return () => {
      // Extract resources from state for cleanup
      let resourcesToCleanup: UIResourceItem[] = [];
      setResources((prev) => {
        resourcesToCleanup = prev;
        return prev;
      });

      // Cleanup all resources asynchronously (don't await in cleanup)
      Promise.all(
        resourcesToCleanup.map(async (resource) => {
          if (resource.cleanup) {
            try {
              await resource.cleanup();
            } catch (error) {
              console.error(`Failed to cleanup resource ${resource.id} on unmount:`, error);
            }
          }
        })
      ).catch(console.error);
    };
  }, []);

  return <UIResourceContext.Provider value={value}>{children}</UIResourceContext.Provider>;
};
