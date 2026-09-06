'use client';

import { normalizeToolResponse, type ToolInputSchema } from '@mcp-b/webmcp-polyfill/schema';
import type { InputSchema, JsonSchemaForInference } from '@mcp-b/webmcp-types';
import type { DependencyList } from 'react';
import {
  useWebMCP as useCoreWebMCP,
  useWebMCPTool as useCoreWebMCPTool,
  type WebMCPConfig as CoreWebMCPConfig,
} from 'usewebmcp';
import type { InferOutput, WebMCPConfig, WebMCPReturn, WebMCPToolReturn } from './types.js';

function withMcpResults<
  TInput extends ToolInputSchema,
  TOutput extends JsonSchemaForInference | undefined,
>(config: WebMCPConfig<TInput, TOutput>): CoreWebMCPConfig<TInput, InferOutput<TOutput>> {
  return {
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
  };
}

/** The core React lifecycle with MCP result formatting and output metadata. */
export function useWebMCP<
  const TInput extends ToolInputSchema = InputSchema,
  const TOutput extends JsonSchemaForInference | undefined = undefined,
>(config: WebMCPConfig<TInput, TOutput>, deps?: DependencyList): WebMCPReturn<TOutput, TInput> {
  return useCoreWebMCP(withMcpResults(config), deps);
}

/** Register an MCP tool without subscribing its owner to execution state. */
export function useWebMCPTool<
  const TInput extends ToolInputSchema = InputSchema,
  const TOutput extends JsonSchemaForInference | undefined = undefined,
>(config: WebMCPConfig<TInput, TOutput>, deps?: DependencyList): WebMCPToolReturn<TOutput, TInput> {
  return useCoreWebMCPTool(withMcpResults(config), deps);
}
