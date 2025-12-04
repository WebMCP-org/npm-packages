import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import debug from 'debug';

const log = debug('mcp-b:extension-tools');
const logWarn = debug('mcp-b:extension-tools:warn');

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
      logWarn('%s API not available: %s', this.apiName, availability.message);
      if (availability.details) {
        logWarn('  Details: %s', availability.details);
      }
      return;
    }

    log('%s API available', this.apiName);
    this.registerTools();
  }
}
