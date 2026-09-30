'use client';

import { useMemo, type DependencyList } from 'react';
import {
  isMcpStandardSchema,
  normalizeInputSchema,
  normalizeToolResponse,
  type ToolInputSchema,
} from '@mcp-b/webmcp-ts-sdk/schema';
import type { InputSchema, JsonSchemaForInference } from '@mcp-b/webmcp-ts-sdk';
import { useWebMCPWithAdapter, type WebMCPAdapter } from 'usewebmcp/internal';
import type { WebMCPConfig as CoreWebMCPConfig } from 'usewebmcp';
import type { InferOutput, InferValidatedToolInput, WebMCPConfig, WebMCPReturn } from './types.js';

async function validateInput<T extends ToolInputSchema>(
  schema: T | undefined,
  input: unknown
): Promise<InferValidatedToolInput<T>> {
  if (!schema || !isMcpStandardSchema(schema)) {
    // SAFETY: plain JSON Schema carries no validator; MCP checks it on the wire and local callers type their input.
    return input as InferValidatedToolInput<T>;
  }

  const result = await schema['~standard'].validate(input);
  if ('value' in result) {
    // SAFETY: Standard Schema's successful result is its declared output; the guard preserves T.
    return result.value as InferValidatedToolInput<T>;
  }
  throw new TypeError(
    `Invalid tool input: ${(result.issues ?? []).map((issue) => issue.message).join('; ')}`
  );
}

/** The core React lifecycle with MCP result formatting and output metadata. */
export function useWebMCP<
  const TInput extends ToolInputSchema = InputSchema,
  const TOutput extends JsonSchemaForInference | undefined = undefined,
>(config: WebMCPConfig<TInput, TOutput>, deps?: DependencyList): WebMCPReturn<TOutput, TInput> {
  const input = useMemo(() => {
    try {
      // The copy drops the validator normalizeInputSchema hides on the schema, so the MCP
      // server registers plain JSON Schema and only this hook runs the validator.
      return {
        schema: config.inputSchema && { ...normalizeInputSchema(config.inputSchema).inputSchema },
      };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error(String(error)) };
    }
  }, [config.inputSchema]);
  const coreConfig: CoreWebMCPConfig<InputSchema, InferOutput<TOutput>> = {
    name: config.name,
    ...(config.title !== undefined && { title: config.title }),
    description: config.description,
    ...(input.schema !== undefined && { inputSchema: input.schema }),
    ...(config.enabled !== undefined && { enabled: config.enabled }),
    ...(config.exposedTo !== undefined && { exposedTo: config.exposedTo }),
    execute: async (args, options) => {
      const result = await config.execute(await validateInput(config.inputSchema, args), options);
      if (config.outputSchema && normalizeToolResponse(result).structuredContent === undefined) {
        throw new TypeError(
          `Tool "${config.name}" outputSchema requires execute to return a JSON-serializable result`
        );
      }
      return result;
    },
  };
  const adapter: WebMCPAdapter<InferOutput<TOutput>> = {
    descriptor: {
      ...(config.outputSchema !== undefined && { outputSchema: config.outputSchema }),
      ...(config.annotations !== undefined && { annotations: config.annotations }),
    },
    ...(input.error && { preparationError: input.error }),
    formatOutput: config.formatOutput ?? normalizeToolResponse,
    formatError:
      config.formatError ??
      ((error) => ({ content: [{ type: 'text', text: error.message }], isError: true })),
  };
  // SAFETY: the adapter validates Standard Schemas and the core registration uses the normalized JSON Schema.
  return useWebMCPWithAdapter(coreConfig, deps, adapter) as WebMCPReturn<TOutput, TInput>;
}
