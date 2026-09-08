import { z } from 'zod';
import type { WebMCPPlugin } from '@mcp-b/webmcp-plugins';
import { ConsentBroker, consent } from '@mcp-b/webmcp-plugins/consent';
import { executionState } from '@mcp-b/webmcp-plugins/execution-state';
import { useState } from 'react';
import {
  useWebMCP,
  useToolExecutionState,
  type InferToolInput,
  type InferValidatedToolInput,
  type WebMCP,
  type WebMCPConfig,
  type WebMCPReturn,
} from '../src/index.js';

type Equal<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;
type Assert<T extends true> = T;
type Input = {
  type: 'object';
  properties: { query: { type: 'string' }; limit: { type: 'integer' } };
  required: ['query'];
};
const schema = z.object({ count: z.string().transform(Number), limit: z.number().default(10) });

export type InferenceAssertions = [
  Assert<Equal<WebMCPConfig['enabled'], boolean | undefined>>,
  Assert<Equal<InferToolInput<Input>, { query: string; limit?: number }>>,
  Assert<Equal<InferToolInput<typeof schema>, z.input<typeof schema>>>,
  Assert<Equal<InferValidatedToolInput<typeof schema>, z.output<typeof schema>>>,
  Assert<Equal<Extract<keyof WebMCPReturn, 'state' | 'reset'>, never>>,
  Assert<Equal<Extract<keyof WebMCPReturn, 'isRegistered'>, never>>,
  Assert<Equal<WebMCPConfig['annotations'], WebMCP.ToolAnnotations | undefined>>,
  Assert<Equal<Document['modelContext'], WebMCP.ModelContext | undefined>>,
];

export function useInferenceExamples() {
  const [searchExecution] = useState(() => executionState<{ length: number }>());
  const tool = useWebMCP({
    name: 'search',
    plugins: [searchExecution],
    description: 'Search items',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    execute: ({ query }, { signal }) => {
      const value: string = query;
      const cancellation: AbortSignal = signal;
      void cancellation;
      return { length: value.length };
    },
  });
  const result: Promise<{ length: number }> = tool.execute({ query: 'text' });
  const lastResult: { length: number } | null = useToolExecutionState(searchExecution).lastResult;
  // @ts-expect-error - query is required, inferred without as const
  void tool.execute({});
  // @ts-expect-error - query must be a string
  void tool.execute({ query: 1 });

  const transformed = useWebMCP({
    name: 'parse',
    description: 'Parse a count',
    inputSchema: schema,
    execute: ({ count, limit }) => {
      const total: number = count + limit;
      return total;
    },
  });
  const parsed: Promise<number> = transformed.execute({ count: '2' });
  // @ts-expect-error - callers supply the input type, not the transformed type
  void transformed.execute({ count: 2 });
  const [execution] = useState(() => executionState<number>());
  const registrationOnly = useWebMCP({
    name: 'observed_parse',
    description: 'Separate registration and observation',
    inputSchema: schema,
    execute: ({ count, limit }) => count + limit,
    binding: ({ count, limit }) => ({ total: count + limit }),
    plugins: [execution],
  });
  const observed: number | null = useToolExecutionState(execution).lastResult;
  const [untypedExecution] = useState(() => executionState());
  const inferred = useWebMCP({
    name: 'inferred_result',
    description: 'Observers do not erase result inference',
    plugins: [untypedExecution],
    execute: () => 42,
  });
  const inferredResult: Promise<number> = inferred.execute({});
  const observer: WebMCPPlugin<unknown> = {
    name: 'custom-observer',
    aroundInvoke: (_call, next) => next(),
  };
  const custom = useWebMCP({
    name: 'custom_observer',
    description: 'Custom observers retain result inference',
    plugins: [observer],
    inputSchema: schema,
    execute: ({ count, limit }) => count + limit,
  });
  const customResult: Promise<number> = custom.execute({ count: '2' });
  const gated = useWebMCP({
    name: 'consent_observer',
    description: 'Consent does not erase handler result inference',
    plugins: [consent({ broker: new ConsentBroker({ policy: { mode: 'click' } }) })],
    inputSchema: schema,
    execute: ({ count, limit }) => count + limit,
  });
  const gatedResult: Promise<number> = gated.execute({ count: '2' });

  const untypedBeforeSchema = useWebMCP({
    name: 'untyped_before_schema',
    description: 'Plugin order does not erase transformed result inference',
    plugins: [untypedExecution],
    inputSchema: schema,
    execute: ({ count, limit }) => count + limit,
  });
  const untypedAfterSchema = useWebMCP({
    name: 'untyped_after_schema',
    description: 'Schema result inference survives observers in either position',
    inputSchema: schema,
    execute: ({ count, limit }) => count + limit,
    plugins: [untypedExecution],
  });
  const untypedBeforeResult: Promise<number> = untypedBeforeSchema.execute({ count: '2' });
  const untypedAfterResult: Promise<number> = untypedAfterSchema.execute({ count: '2' });
  useWebMCP({
    name: 'wrong_observer_type',
    description: 'Typed observers must accept the handler result',
    plugins: [executionState<string>()],
    // @ts-expect-error - a string observer cannot consume a number result
    execute: () => 42,
  });

  const separateParsed: Promise<number> = registrationOnly.execute({ count: '2' });
  // @ts-expect-error - registration-only tools do not subscribe to state
  void registrationOnly.state;
  // @ts-expect-error - callers still supply the pre-transform input
  void registrationOnly.execute({ count: 2 });
  useWebMCP({
    name: 'extended',
    description: 'Extended',
    // @ts-expect-error - outputSchema is an MCP-B extension
    outputSchema: { type: 'number' },
    execute: () => 1,
  });
  useWebMCP({
    name: 'extended_hint',
    description: 'Extended',
    // @ts-expect-error - MCP-only annotations belong to @mcp-b/react-webmcp
    annotations: { destructiveHint: true },
    execute: () => 1,
  });
  return {
    result,
    lastResult,
    parsed,
    observed,
    separateParsed,
    inferredResult,
    customResult,
    gatedResult,
    untypedBeforeResult,
    untypedAfterResult,
  };
}
