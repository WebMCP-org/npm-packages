/**
 * Test Middleware for observing MCP events
 *
 * This middleware intercepts and logs MCP protocol events for test verification
 * without mocking or faking any behavior. All events still flow through the real
 * MCP stack unchanged.
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

export interface McpEvent {
  type: 'tool_call' | 'tool_result' | 'tool_error' | 'connection' | 'tools_listed';
  timestamp: number;
  data: unknown;
}

class McpTestMiddleware {
  private events: McpEvent[] = [];

  /**
   * Log an event
   */
  private log(type: McpEvent['type'], data: unknown): void {
    this.events.push({
      type,
      timestamp: Date.now(),
      data,
    });
  }

  /**
   * Get all logged events
   */
  getEvents(): McpEvent[] {
    return [...this.events];
  }

  /**
   * Get events of a specific type
   */
  getEventsByType(type: McpEvent['type']): McpEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  /**
   * Clear all events
   */
  clearEvents(): void {
    this.events = [];
  }

  /**
   * Get the last N events
   */
  getLastEvents(n: number): McpEvent[] {
    return this.events.slice(-n);
  }

  /**
   * Wrap the MCP client to intercept calls
   */
  wrapClient(client: Client): Client {
    // Store original methods
    const originalCallTool = client.callTool.bind(client);
    const originalListTools = client.listTools.bind(client);

    // Type-safe way to override methods
    type CallToolRequest = Parameters<typeof client.callTool>[0];
    type CallToolResult = ReturnType<typeof client.callTool>;

    // Override callTool to log calls and results
    client.callTool = async (request: CallToolRequest): Promise<Awaited<CallToolResult>> => {
      this.log('tool_call', {
        tool: request.name,
        arguments: request.arguments,
      });

      try {
        const result = await originalCallTool(request);

        this.log('tool_result', {
          tool: request.name,
          result,
          isError: result.isError ?? false,
          hasStructuredContent:
            'structuredContent' in result && result.structuredContent !== undefined,
          structuredContent: result.structuredContent,
        });

        return result;
      } catch (error) {
        this.log('tool_error', {
          tool: request.name,
          error: error instanceof Error ? error.message : String(error),
        });

        throw error;
      }
    };

    // Override listTools to log when tools are listed
    client.listTools = async () => {
      const result = await originalListTools();

      this.log('tools_listed', {
        count: result.tools.length,
        tools: result.tools.map((t) => t.name),
      });

      return result;
    };

    return client;
  }

  /**
   * Log a connection event
   */
  logConnection(connected: boolean): void {
    this.log('connection', { connected });
  }
}

// Create singleton instance
const testMiddleware = new McpTestMiddleware();

// Expose globally for testing
declare global {
  interface Window {
    mcpEventLog: {
      getEvents: () => McpEvent[];
      getEventsByType: (type: McpEvent['type']) => McpEvent[];
      clearEvents: () => void;
      getLastEvents: (n: number) => McpEvent[];
    };
  }
}

if (typeof window !== 'undefined') {
  window.mcpEventLog = {
    getEvents: () => testMiddleware.getEvents(),
    getEventsByType: (type) => testMiddleware.getEventsByType(type),
    clearEvents: () => testMiddleware.clearEvents(),
    getLastEvents: (n) => testMiddleware.getLastEvents(n),
  };
}

export { testMiddleware };
