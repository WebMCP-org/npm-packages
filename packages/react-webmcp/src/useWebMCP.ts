'use client';

import { normalizeToolResponse, type ToolInputSchema } from '@mcp-b/webmcp-polyfill/schema';
import type { InputSchema, JsonSchemaForInference } from '@mcp-b/webmcp-types';
import type { DependencyList } from 'react';
import { useWebMCP as useCoreWebMCP } from 'usewebmcp';
import type { WebMCPConfig, WebMCPReturn } from './types.js';

/** The core React lifecycle with MCP result formatting and output metadata. */
export function useWebMCP<
  const TInput extends ToolInputSchema = InputSchema,
  const TOutput extends JsonSchemaForInference | undefined = undefined,
>(config: WebMCPConfig<TInput, TOutput>, deps?: DependencyList): WebMCPReturn<TOutput, TInput> {
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
    },
    deps
  );
}
