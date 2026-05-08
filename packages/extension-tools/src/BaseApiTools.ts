import type { CallToolResult, McpServer } from '@mcp-b/webmcp-ts-sdk';
import { z } from 'zod';

import { zodSchemaToJsonSchemaCompat } from './zod-json-schema-compat';

export interface ApiAvailability {
  available: boolean;
  message: string;
  details?: string;
}

export abstract class BaseApiTools<TOptions = Record<string, unknown>> {
  protected abstract apiName: string;

  constructor(
    protected server: McpServer,
    protected options: TOptions = {} as TOptions
  ) {}

  abstract checkAvailability(): ApiAvailability;
  abstract registerTools(): void;

  protected shouldRegisterTool(toolName: string): boolean {
    if ((this.options as Record<string, unknown>)[toolName] === false) {
      return false;
    }
    return true;
  }

  protected registerExtensionTool(
    name: string,
    description: string,
    inputSchema: z.ZodRawShape,
    handler: (args: Record<string, unknown>) => CallToolResult | Promise<CallToolResult>
  ): void {
    // WebMCP tool descriptors expose JSON Schema, while these API wrappers keep
    // their validation schemas in Zod. Convert at registration so native tool
    // discovery receives the same parameter constraints the handlers enforce.
    this.server.registerTool({
      name,
      description,
      inputSchema: zodSchemaToJsonSchemaCompat(z.object(inputSchema)),
      execute: async (args: Record<string, unknown>) => {
        try {
          return await handler(args);
        } catch (error) {
          return this.formatError(error);
        }
      },
    });
  }

  protected formatError(error: unknown): CallToolResult {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${message}`,
        },
      ],
      isError: true,
    };
  }

  protected formatSuccess(message: string, data?: unknown): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: data ? `${message}\n${JSON.stringify(data, null, 2)}` : message,
        },
      ],
    };
  }

  protected formatJson(data: unknown): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  public register(): void {
    const availability = this.checkAvailability();
    if (!availability.available) {
      console.warn(`✗ ${this.apiName} API not available: ${availability.message}`);
      if (availability.details) {
        console.warn(`  Details: ${availability.details}`);
      }
      return;
    }

    console.log(`✓ ${this.apiName} API available`);
    this.registerTools();
  }
}
