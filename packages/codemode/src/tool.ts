import type { ToolSet } from 'ai';
import { asSchema, type Tool, tool } from 'ai';
import { z } from 'zod';
import { normalizeCode } from './normalize';
import { generateTypes, type ToolDescriptors } from './tool-types';
import type { Executor, ToolFunctions } from './types';
import type { UnknownRecord } from './type-utils';
import { sanitizeToolName } from './utils';

const DEFAULT_DESCRIPTION = `Execute code to achieve a goal.

Available:
{{types}}

Write an async arrow function in JavaScript that returns the result.
Do NOT use TypeScript syntax — no type annotations, interfaces, or generics.
Do NOT define named functions then call them — just write the arrow function body directly.

Example: async () => { const r = await codemode.searchWeb({ query: "test" }); return r; }`;

export interface CreateCodeToolOptions {
  tools: ToolDescriptors | ToolSet;
  executor: Executor;
  description?: string;
}

const codeSchema = z.object({
  code: z.string().describe('JavaScript async arrow function to execute'),
});

type CodeInput = z.infer<typeof codeSchema>;
type CodeOutput = { code: string; result: unknown; logs?: string[] };

function hasNeedsApproval(t: UnknownRecord): boolean {
  return 'needsApproval' in t && t.needsApproval != null;
}

export function createCodeTool(options: CreateCodeToolOptions): Tool<CodeInput, CodeOutput> {
  const tools: ToolDescriptors | ToolSet = {};
  for (const [name, t] of Object.entries(options.tools)) {
    if (!hasNeedsApproval(t as UnknownRecord)) {
      (tools as UnknownRecord)[name] = t;
    }
  }

  const types = generateTypes(tools);
  const executor = options.executor;

  const description = (options.description ?? DEFAULT_DESCRIPTION).replace('{{types}}', types);

  return tool({
    description,
    inputSchema: codeSchema,
    execute: async ({ code }) => {
      const fns: ToolFunctions = {};

      for (const [name, t] of Object.entries(tools)) {
        const execute =
          'execute' in t ? (t.execute as (args: unknown) => Promise<unknown>) : undefined;
        if (execute) {
          const rawSchema =
            'inputSchema' in t
              ? t.inputSchema
              : 'parameters' in t
                ? (t as UnknownRecord).parameters
                : undefined;

          const schema = rawSchema != null ? asSchema(rawSchema) : undefined;

          const validate = schema?.validate;
          fns[sanitizeToolName(name)] = validate
            ? async (args: unknown) => {
                const result = await validate(args);
                if (!result.success) throw result.error;
                return execute(result.value);
              }
            : execute;
        }
      }

      const normalizedCode = normalizeCode(code);
      const executeResult = await executor.execute(normalizedCode, fns);

      if (executeResult.error) {
        const logCtx = executeResult.logs?.length
          ? `\n\nConsole output:\n${executeResult.logs.join('\n')}`
          : '';
        throw new Error(`Code execution failed: ${executeResult.error}${logCtx}`);
      }

      const output: CodeOutput = { code, result: executeResult.result };
      if (executeResult.logs) output.logs = executeResult.logs;
      return output;
    },
  });
}
