'use client';

import { normalizeToolResponse, type ToolInputSchema } from '@mcp-b/webmcp-polyfill/schema';
import type { InputSchema, JsonSchemaForInference } from '@mcp-b/webmcp-types';
import type { DependencyList } from 'react';
import { useWebMCP as useCoreWebMCP } from 'usewebmcp';
import type { InferOutput, WebMCPConfig, WebMCPReturn } from './types.js';

/** The core React lifecycle with MCP result formatting and output metadata. */
export function useWebMCP<
  const TInput extends ToolInputSchema = InputSchema,
  const TOutput extends JsonSchemaForInference | undefined = undefined,
  TResult extends InferOutput<TOutput> = InferOutput<TOutput>,
>(
  config: WebMCPConfig<TInput, TOutput, TResult>,
  deps?: DependencyList
): WebMCPReturn<TOutput, TInput, TResult> {
  return useCoreWebMCP(
    {
      ...config,
      execute: async (input, options) => {
        const result = await config.execute(input, options);
        if (config.outputSchema && normalizeToolResponse(result).structuredContent === undefined) {
          throw new TypeError(
            `Tool "${config.name}" outputSchema requires execute to return a JSON-serializable result`
          );
        }
        return result;
      },
      formatOutput: config.formatOutput ?? normalizeToolResponse,
      formatError:
        config.formatError ??
        ((error) => ({ content: [{ type: 'text', text: error.message }], isError: true })),
      isErrorResponse: (response) =>
        typeof response === 'object' &&
        response !== null &&
        'content' in response &&
        Array.isArray(response.content) &&
        'isError' in response &&
        response.isError === true,
    },
    deps
  );
}
