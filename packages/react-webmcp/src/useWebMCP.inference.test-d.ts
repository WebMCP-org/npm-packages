import { executionState } from '@mcp-b/webmcp-plugins/execution-state';
import { expectTypeOf } from 'vitest';
import { z } from 'zod';
import { useWebMCP, useWebMCPContext, useToolExecutionState } from './index.js';

export function useInferenceExamples() {
  const numberExecution = executionState<number>();
  const plain = useWebMCP({
    name: 'inferred_number',
    description: 'Infer raw results without an output schema',
    plugins: [numberExecution],
    execute: () => 42,
    formatOutput: (result) => result.toFixed(2),
  });
  expectTypeOf(plain.execute({})).toEqualTypeOf<Promise<number>>();
  expectTypeOf(useToolExecutionState(numberExecution).lastResult).toEqualTypeOf<number | null>();

  const context = useWebMCPContext('context_number', 'Read a numeric context value', () => 42, {
    plugins: [numberExecution],
  });
  expectTypeOf(context.execute({})).toEqualTypeOf<Promise<number>>();

  const untypedExecution = executionState();
  const transformed = useWebMCP({
    name: 'transformed_number',
    description: 'Retain vendor schema transforms and result inference',
    plugins: [untypedExecution],
    inputSchema: z.object({ count: z.string().transform(Number) }),
    execute: ({ count }) => count + 1,
  });
  expectTypeOf(transformed.execute({ count: '2' })).toEqualTypeOf<Promise<number>>();
  // @ts-expect-error - callers supply the input before the transform
  void transformed.execute({ count: 2 });

  const structured = useWebMCP({
    name: 'structured_result',
    description: 'Output schema still constrains the handler and observer',
    outputSchema: {
      type: 'object',
      properties: { count: { type: 'number' } },
      required: ['count'],
    },
    plugins: [executionState<{ count: number }>()],
    execute: () => ({ count: 42 }),
  });
  const structuredResult: Promise<{ count: number }> = structured.execute({});
  void structuredResult;

  useWebMCP({
    name: 'invalid_structured_observer',
    description: 'Reject an observer that conflicts with its output schema',
    outputSchema: { type: 'number' },
    // @ts-expect-error - a string observer cannot consume numeric output
    plugins: [executionState<string>()],
    execute: () => 42,
  });

  useWebMCP({
    name: 'invalid_structured_result',
    description: 'Reject a handler that conflicts with its output schema',
    outputSchema: { type: 'number' },
    // @ts-expect-error - output schema requires a number
    execute: () => 'wrong',
  });
}
