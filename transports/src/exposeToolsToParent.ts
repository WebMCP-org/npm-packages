/**
 * Expose Tools to Parent
 *
 * Helper for iframe pages to expose their Model Context tools to the parent page.
 * Works with the MCPIframe custom element.
 *
 * @example
 * ```typescript
 * import { exposeToolsToParent } from '@mcp-b/transports';
 *
 * // Automatically expose all tools registered via modelContext
 * exposeToolsToParent();
 *
 * // Or expose specific tools manually
 * exposeToolsToParent({
 *   tools: [
 *     {
 *       name: 'calculate',
 *       description: 'Perform calculations',
 *       inputSchema: { type: 'object', properties: { expression: { type: 'string' } } },
 *       execute: async (args) => eval(args.expression),
 *     },
 *   ],
 * });
 * ```
 */

import type {
  IframeTool,
  MCPIframeCallToolMessage,
  MCPIframeMessages,
  MCPIframeReadyMessage,
  MCPIframeToolErrorMessage,
  MCPIframeToolResultMessage,
  MCPIframeToolsChangedMessage,
} from './MCPIframeElement.js';

const DEFAULT_CHANNEL = 'mcp-iframe-tools';

/** Tool with execute function for child-side registration */
export interface ExecutableTool extends IframeTool {
  execute: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

/** Options for exposeToolsToParent */
export interface ExposeToolsOptions {
  /** Channel ID for message filtering (must match parent's MCPIframe) */
  channelId?: string;
  /** Manually specified tools to expose (if not using Model Context API) */
  tools?: ExecutableTool[];
  /** Allowed parent origins (default: ['*'] - all origins) */
  allowedOrigins?: string[];
  /** Whether to auto-sync with Model Context API toolschange events (default: true) */
  autoSync?: boolean;
}

/** Result of exposeToolsToParent */
export interface ExposeToolsHandle {
  /** Stop exposing tools and clean up listeners */
  disconnect: () => void;
  /** Manually update the exposed tools */
  updateTools: (tools: ExecutableTool[]) => void;
  /** Check if connected to parent */
  isConnected: () => boolean;
}

/**
 * Expose tools from this iframe to the parent page.
 *
 * This function sets up the communication with the parent MCPIframe element
 * and automatically syncs tools registered in the Model Context API.
 *
 * @param options - Configuration options
 * @returns Handle to manage the connection
 */
export function exposeToolsToParent(options: ExposeToolsOptions = {}): ExposeToolsHandle {
  const channelId = options.channelId || DEFAULT_CHANNEL;
  const allowedOrigins = options.allowedOrigins || ['*'];
  const autoSync = options.autoSync !== false;

  let connected = false;
  let parentOrigin: string | null = null;
  let currentTools: ExecutableTool[] = options.tools || [];
  let toolsChangeListener: (() => void) | null = null;

  // Get Model Context API if available
  const modelContext = (navigator as { modelContext?: ModelContextAPI }).modelContext;

  /**
   * Get tools from Model Context API
   */
  function getModelContextTools(): ExecutableTool[] {
    if (!modelContext) return [];

    try {
      const tools = modelContext.listTools();
      return tools.map((tool) => {
        const executableTool: ExecutableTool = {
          name: tool.name,
          execute: async (args: Record<string, unknown>) => {
            // Call the tool through Model Context API
            const result = await modelContext.callTool(tool.name, args);
            return result;
          },
        };
        if (tool.description !== undefined) {
          executableTool.description = tool.description;
        }
        if (tool.inputSchema !== undefined) {
          executableTool.inputSchema = tool.inputSchema;
        }
        return executableTool;
      });
    } catch {
      return [];
    }
  }

  /**
   * Get all current tools (manual + Model Context)
   */
  function getAllTools(): ExecutableTool[] {
    if (options.tools) {
      // If manual tools specified, use only those
      return currentTools;
    }
    // Otherwise use Model Context tools
    return getModelContextTools();
  }

  /**
   * Convert to IframeTool (without execute function)
   */
  function toIframeTool(tool: ExecutableTool): IframeTool {
    const iframeTool: IframeTool = { name: tool.name };
    if (tool.description !== undefined) {
      iframeTool.description = tool.description;
    }
    if (tool.inputSchema !== undefined) {
      iframeTool.inputSchema = tool.inputSchema;
    }
    return iframeTool;
  }

  /**
   * Send ready message to parent
   */
  function sendReady(): void {
    if (!window.parent || window.parent === window) return;

    const tools = getAllTools();
    window.parent.postMessage(
      {
        type: 'mcp-iframe-ready',
        channel: channelId,
        tools: tools.map(toIframeTool),
      } satisfies MCPIframeReadyMessage,
      '*'
    );
  }

  /**
   * Send tools changed message to parent
   */
  function sendToolsChanged(): void {
    if (!connected || !parentOrigin) return;

    const tools = getAllTools();
    window.parent.postMessage(
      {
        type: 'mcp-iframe-tools-changed',
        channel: channelId,
        tools: tools.map(toIframeTool),
      } satisfies MCPIframeToolsChangedMessage,
      parentOrigin
    );
  }

  /**
   * Handle tool call from parent
   */
  async function handleToolCall(message: MCPIframeCallToolMessage): Promise<void> {
    if (!parentOrigin) return;

    const tools = getAllTools();
    const tool = tools.find((t) => t.name === message.toolName);

    if (!tool) {
      window.parent.postMessage(
        {
          type: 'mcp-iframe-tool-error',
          channel: channelId,
          callId: message.callId,
          error: `Tool not found: ${message.toolName}`,
        } satisfies MCPIframeToolErrorMessage,
        parentOrigin
      );
      return;
    }

    try {
      const result = await tool.execute(message.args);
      window.parent.postMessage(
        {
          type: 'mcp-iframe-tool-result',
          channel: channelId,
          callId: message.callId,
          result,
        } satisfies MCPIframeToolResultMessage,
        parentOrigin
      );
    } catch (error) {
      window.parent.postMessage(
        {
          type: 'mcp-iframe-tool-error',
          channel: channelId,
          callId: message.callId,
          error: error instanceof Error ? error.message : String(error),
        } satisfies MCPIframeToolErrorMessage,
        parentOrigin
      );
    }
  }

  /**
   * Message handler for parent communication
   */
  function messageHandler(event: MessageEvent): void {
    // Check allowed origins
    if (!allowedOrigins.includes('*') && !allowedOrigins.includes(event.origin)) {
      return;
    }

    const data = event.data as MCPIframeMessages;
    if (!data || data.channel !== channelId) return;

    switch (data.type) {
      case 'mcp-iframe-ping':
        // Parent is pinging, respond with ready
        parentOrigin = event.origin;
        connected = true;
        sendReady();
        break;

      case 'mcp-iframe-call-tool':
        if (connected) {
          handleToolCall(data);
        }
        break;
    }
  }

  // Setup message listener
  window.addEventListener('message', messageHandler);

  // Setup Model Context API sync if available and autoSync enabled
  if (modelContext && autoSync && !options.tools) {
    toolsChangeListener = () => {
      sendToolsChanged();
    };
    modelContext.addEventListener('toolschange', toolsChangeListener);
  }

  // Return handle
  return {
    disconnect: () => {
      window.removeEventListener('message', messageHandler);
      if (modelContext && toolsChangeListener) {
        modelContext.removeEventListener('toolschange', toolsChangeListener);
      }
      connected = false;
      parentOrigin = null;
    },

    updateTools: (tools: ExecutableTool[]) => {
      currentTools = tools;
      sendToolsChanged();
    },

    isConnected: () => connected,
  };
}

/** Model Context API interface (subset for child) */
interface ModelContextAPI {
  listTools(): Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  addEventListener(event: 'toolschange', callback: () => void): void;
  removeEventListener(event: 'toolschange', callback: () => void): void;
}
