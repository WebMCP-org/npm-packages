import type { CallToolResult, McpServer } from '@mcp-b/webmcp-ts-sdk';
import type { z } from 'zod';

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

  protected formatStructured<T extends Record<string, unknown>>(data: T): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
      structuredContent: data,
    };
  }

  protected registerContractTool<
    TInput extends z.ZodObject<Record<string, z.ZodTypeAny>>,
    TOutput extends z.ZodObject<Record<string, z.ZodTypeAny>> | undefined,
  >(
    contract: {
      name: string;
      title?: string;
      description?: string;
      inputSchema: TInput;
      outputSchema?: TOutput;
      annotations?: Record<string, unknown>;
      _meta?: Record<string, unknown>;
    },
    handler: (input: z.infer<TInput>) => Promise<Record<string, unknown> | CallToolResult>
  ): void {
    const execute = async (rawInput: unknown) => {
      try {
        const input = contract.inputSchema.parse(rawInput);
        const result = await handler(input);

        if (contract.outputSchema) {
          const structuredContent = contract.outputSchema.parse(result);
          return this.formatStructured(structuredContent);
        }

        return result as CallToolResult;
      } catch (error) {
        return this.formatError(error);
      }
    };

    const config = {
      title: contract.title,
      description: contract.description,
      inputSchema: contract.inputSchema,
      outputSchema: contract.outputSchema,
      annotations: contract.annotations,
      _meta: contract._meta,
    };

    if ((this.server as { __isBrowserMcpServer?: boolean }).__isBrowserMcpServer) {
      (this.server as any).registerTool({
        name: contract.name,
        ...config,
        execute,
      });
      return;
    }

    (this.server as any).registerTool(contract.name, config, execute);
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
