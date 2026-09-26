'use client';

import { useMemo } from 'react';
import {
  normalizeInputSchema,
  normalizeToolResponse,
  type ToolInputSchema,
} from '@mcp-b/webmcp-ts-sdk/schema';
import type { InputSchema, JsonSchemaForInference } from '@mcp-b/webmcp-ts-sdk';
import type { DependencyList } from 'react';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { useWebMCPWithAdapter, type WebMCPAdapter } from 'usewebmcp/internal';
import type { WebMCPConfig as CoreWebMCPConfig } from 'usewebmcp';
import type { InferOutput, InferValidatedToolInput, WebMCPConfig, WebMCPReturn } from './types.js';

function isStandardSchema(schema: object): schema is StandardSchemaV1 {
  return (
    '~standard' in schema &&
    typeof schema['~standard'] === 'object' &&
    schema['~standard'] !== null &&
    'version' in schema['~standard'] &&
    schema['~standard'].version === 1 &&
    'validate' in schema['~standard'] &&
    typeof schema['~standard'].validate === 'function'
  );
}

async function validateInput<T extends ToolInputSchema>(
  schema: T | undefined,
  input: unknown
): Promise<InferValidatedToolInput<T>> {
  if (!schema || !isStandardSchema(schema)) return input as InferValidatedToolInput<T>;

  const result = await schema['~standard'].validate(input);
  if (!result.issues && 'value' in result) return result.value as InferValidatedToolInput<T>;
  throw new TypeError(
    `Invalid tool input: ${(result.issues ?? []).map((issue) => issue.message).join('; ')}`
  );
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** The core React lifecycle with MCP result formatting and output metadata. */
export function useWebMCP<
  const TInput extends ToolInputSchema = InputSchema,
  const TOutput extends JsonSchemaForInference | undefined = undefined,
>(config: WebMCPConfig<TInput, TOutput>, deps?: DependencyList): WebMCPReturn<TOutput, TInput> {
  const input = useMemo<{ schema: InputSchema | undefined; error: Error | undefined }>(() => {
    try {
      return {
        schema:
          config.inputSchema === undefined
            ? undefined
            : normalizeInputSchema(config.inputSchema).inputSchema,
        error: undefined,
      };
    } catch (error) {
      return { schema: undefined, error: toError(error) };
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
  return useWebMCPWithAdapter(coreConfig, deps, adapter) as WebMCPReturn<TOutput, TInput>;
}
