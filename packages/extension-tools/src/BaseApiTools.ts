import type { CallToolResult, McpServer, ToolDescriptor } from '@mcp-b/webmcp-ts-sdk';

import {
  getExtensionToolInputSchema,
  getExtensionToolOutputSchema,
  isZodExtensionToolContract,
  type AnyExtensionToolContract,
  type InferExtensionToolInput,
} from './contracts/core';

export interface ApiAvailability {
  available: boolean;
  message: string;
  details?: string;
}

export abstract class BaseApiTools<TOptions extends object = Record<string, boolean | undefined>> {
  protected abstract apiName: string;

  constructor(
    protected server: McpServer,
    protected options: Partial<TOptions> = {}
  ) {}

  abstract checkAvailability(): ApiAvailability;
  abstract registerTools(): void;

  protected shouldRegisterTool(toolName: keyof TOptions & string): boolean {
    return this.options[toolName] !== false;
  }

  protected registerExtensionTool<TContract extends AnyExtensionToolContract>(
    contract: TContract,
    handler: (args: InferExtensionToolInput<TContract>) => CallToolResult | Promise<CallToolResult>
  ): void;
  protected registerExtensionTool(
    contract: AnyExtensionToolContract,
    handler: (args: Record<string, unknown>) => CallToolResult | Promise<CallToolResult>
  ): void {
    const tool: ToolDescriptor<Record<string, unknown>, CallToolResult> = {
      name: contract.name,
      description: contract.description,
      inputSchema: getExtensionToolInputSchema(contract),
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
          return this.attachStructuredContent(
            contract,
            await handler(this.parseToolInput(contract, args))
          );
        } catch (error) {
          return this.formatError(error);
        }
      },
    };

    this.server.registerTool({
      ...tool,
    });
  }

  private parseToolInput<TContract extends AnyExtensionToolContract>(
    contract: TContract,
    args: Record<string, unknown>
  ): Record<string, unknown> {
    return isZodExtensionToolContract(contract)
      ? contract.inputSchema.parse(args)
      : contract.zodInputSchema.parse(args);
  }

  private attachStructuredContent(
    contract: AnyExtensionToolContract,
    result: CallToolResult
  ): CallToolResult {
    if (result.isError) {
      return result;
    }

    if (result.structuredContent !== undefined) {
      this.validateStructuredContent(contract, result.structuredContent);
      return result;
    }

    const outputSchema = getExtensionToolOutputSchema(contract);
    if (!outputSchema) {
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

    this.validateStructuredContent(contract, structuredContent);

    return {
      ...result,
      structuredContent,
    };
  }

  private validateStructuredContent(
    contract: AnyExtensionToolContract,
    structuredContent: unknown
  ): void {
    if (isZodExtensionToolContract(contract) && contract.outputSchema) {
      contract.outputSchema.parse(structuredContent);
    }
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
          text: data !== undefined ? `${message}\n${JSON.stringify(data, null, 2)}` : message,
        },
      ],
      ...(data !== undefined ? { structuredContent: data } : {}),
    } as CallToolResult;
  }

  protected formatJson(data: unknown): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
      structuredContent: data,
    } as CallToolResult;
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
