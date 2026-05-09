import type { CallToolResult, McpServer } from '@mcp-b/webmcp-ts-sdk';
import { z } from 'zod';

export interface ApiAvailability {
  available: boolean;
  message: string;
  details?: string;
}

export type ExtensionToolErrorCode =
  | 'api_unavailable'
  | 'tool_execution_failed'
  | 'tool_input_invalid'
  | 'tool_output_invalid';

export interface ExtensionToolErrorContent {
  [key: string]: unknown;
  ok: false;
  code: ExtensionToolErrorCode;
  message: string;
  groupId?: string;
  actionId?: string;
  chromeApi?: string;
  permissions?: string[];
  hostPermissions?: string[];
  requiresActiveTab?: boolean;
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

  protected formatError(
    error: unknown,
    overrides: Partial<ExtensionToolErrorContent> = {}
  ): CallToolResult {
    const message = overrides.message ?? (error instanceof Error ? error.message : String(error));
    const structuredContent: ExtensionToolErrorContent = {
      ok: false,
      code: overrides.code ?? 'tool_execution_failed',
      message,
      ...overrides,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(structuredContent, null, 2),
        },
      ],
      isError: true,
      structuredContent,
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
      _meta?: {
        extension?: Partial<ExtensionToolErrorContent>;
      };
    },
    handler: (input: z.infer<TInput>) => Promise<Record<string, unknown> | CallToolResult>
  ): void {
    const execute = async (rawInput: unknown) => {
      let input: z.infer<TInput>;
      try {
        input = contract.inputSchema.parse(rawInput);
      } catch (error) {
        return this.formatError(error, {
          code: 'tool_input_invalid',
          message: error instanceof Error ? error.message : String(error),
          ...contract._meta?.extension,
        });
      }

      try {
        const availability = this.checkAvailability();
        if (!availability.available) {
          const details = availability.details ? { details: availability.details } : {};
          return this.formatError(new Error(availability.message), {
            code: 'api_unavailable',
            message: availability.message,
            ...details,
            ...contract._meta?.extension,
          });
        }

        const result = await handler(input);

        if (contract.outputSchema) {
          const parsedOutput = contract.outputSchema.safeParse(result);
          if (!parsedOutput.success) {
            return this.formatError(parsedOutput.error, {
              code: 'tool_output_invalid',
              message: parsedOutput.error.message,
              ...contract._meta?.extension,
            });
          }
          const structuredContent = parsedOutput.data;
          return this.formatStructured(structuredContent);
        }

        return result as CallToolResult;
      } catch (error) {
        return this.formatError(error, contract._meta?.extension ?? {});
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
    } else {
      console.log(`✓ ${this.apiName} API available`);
    }

    this.registerTools();
  }
}
