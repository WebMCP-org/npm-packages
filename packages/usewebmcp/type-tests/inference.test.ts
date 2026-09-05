import { z } from 'zod';
import {
  useWebMCP,
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
  Assert<Equal<WebMCPReturn['state']['lastResult'], unknown>>,
  Assert<Equal<WebMCPConfig['annotations'], WebMCP.ToolAnnotations | undefined>>,
  Assert<Equal<Document['modelContext'], WebMCP.ModelContext | undefined>>,
];

export function useInferenceExamples() {
  const tool = useWebMCP({
    name: 'search',
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
  const lastResult: { length: number } | null = tool.state.lastResult;
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
  return { result, lastResult, parsed };
}
