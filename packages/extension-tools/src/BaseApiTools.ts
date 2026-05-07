import type { CallToolResult, McpServer, ToolDescriptor } from '@mcp-b/webmcp-ts-sdk';

import type { ExtensionToolContract } from './contracts/core';

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
    contract: ExtensionToolContract,
    handler: (args: Record<string, unknown>) => CallToolResult | Promise<CallToolResult>
  ): void {
    const tool: ToolDescriptor<Record<string, unknown>, CallToolResult> = {
      name: contract.name,
      description: contract.description,
      inputSchema: contract.inputSchema,
      // Contract exports keep outputSchema. Browser registration omits it until extension-page
      // clients can validate output schemas without Ajv's CSP-blocked code generation.
      annotations: {
        title: contract.title,
        readOnlyHint: contract.annotations.readOnlyHint === true,
        destructiveHint: contract.annotations.destructiveHint === true,
        idempotentHint: contract.annotations.idempotentHint === true,
        openWorldHint: contract.annotations.openWorldHint === true,
      },
      execute: async (args: Record<string, unknown>) => {
        try {
          return this.attachStructuredContent(contract, await handler(args));
        } catch (error) {
          return this.formatError(error);
        }
      },
    };

    this.server.registerTool({
      ...tool,
    });
  }

  private attachStructuredContent(
    contract: ExtensionToolContract,
    result: CallToolResult
  ): CallToolResult {
    if (!contract.outputSchema || result.isError || result.structuredContent !== undefined) {
      return result;
    }

    const textContent = result.content.find((content) => content.type === 'text');
    if (!textContent) {
      return result;
    }

    const structuredContent = this.parseStructuredContent(textContent.text);
    if (!structuredContent) {
      return result;
    }

    return {
      ...result,
      structuredContent,
    };
  }

  private parseStructuredContent(text: string): Record<string, unknown> | undefined {
    const fullTextContent = this.parseJsonObject(text);
    if (fullTextContent) {
      return fullTextContent;
    }

    const firstNewlineIndex = text.indexOf('\n');
    if (firstNewlineIndex === -1) {
      return undefined;
    }

    return this.parseJsonObject(text.slice(firstNewlineIndex + 1));
  }

  private parseJsonObject(text: string): Record<string, unknown> | undefined {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }

    return undefined;
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
